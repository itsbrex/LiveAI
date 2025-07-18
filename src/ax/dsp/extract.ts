/* eslint-disable @typescript-eslint/naming-convention */

import { parseLLMFriendlyDate, parseLLMFriendlyDateTime } from './datetime.js';
import { ValidationError } from './errors.js';
import type { AxField, AxSignature } from './sig.js';
import type { AxGenOut, GenDeltaOut } from './types.js';
import { matchesContent, parseMarkdownList } from './util.js';

export const extractValues = (
  sig: Readonly<AxSignature>,
  values: Record<string, unknown>,
  content: string,
  strictMode = false
) => {
  const xstate = { extractedFields: [], streamedIndex: {}, s: -1 };
  streamingExtractValues(sig, values, xstate, content, { strictMode });
  streamingExtractFinalValue(sig, values, xstate, content, strictMode);

  // Filter out internal fields
  for (const field of sig.getOutputFields()) {
    if (field.isInternal) {
      delete values[field.name];
    }
  }
};

export interface extractionState {
  prevFields?: { field: AxField; s: number; e: number }[];
  currField?: AxField;
  currFieldIndex?: number;
  inAssumedField?: boolean;
  extractedFields: AxField[];
  streamedIndex: Record<string, number>;
  s: number;
  inBlock?: boolean;
}

// Helper function to check for missing required fields
const checkMissingRequiredFields = (
  _xstate: Readonly<extractionState>,
  values: Record<string, unknown>,
  outputFields: Readonly<AxField[]>
) => {
  const missingFields: AxField[] = [];

  for (const field of outputFields) {
    if (field && !field.isOptional && values[field.name] === undefined) {
      missingFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    throw new ValidationError({
      message: `Required ${missingFields.length === 1 ? 'field' : 'fields'} not found`,
      fields: missingFields,
    });
  }
};

export interface StreamingExtractValuesOptions {
  strictMode?: boolean;
  skipEarlyFail?: boolean;
}

export const streamingExtractValues = (
  sig: Readonly<AxSignature>,
  values: Record<string, unknown>,
  // eslint-disable-next-line functional/prefer-immutable-types
  xstate: extractionState,
  content: string,
  { strictMode, skipEarlyFail }: StreamingExtractValuesOptions = {}
) => {
  const fields = sig.getOutputFields();
  let expectedField: AxField | undefined;

  for (const [index, field] of fields.entries()) {
    // If the field is the current field and it's not assumed, skip it
    if (index === xstate.currFieldIndex && !xstate.inAssumedField) {
      continue;
    }

    // If field is already in values and it's not the current field and it's not assumed, skip it
    if (
      field.name in values &&
      !(index === xstate.currFieldIndex && xstate.inAssumedField)
    ) {
      continue;
    }

    const isFirst = xstate.extractedFields.length === 0;
    const prefix = `${(isFirst ? '' : '\n') + field.title}:`;

    let e = matchesContent(content, prefix, xstate.s);
    let prefixLen = prefix.length;

    switch (e) {
      case -1:
        if (skipEarlyFail) {
          continue;
        }

        // If there is only one field then we assume the content is streaming to the first field
        // Note: optimization for single field responses (only in non-strict mode)
        if (
          !strictMode &&
          fields.length === 1 &&
          xstate.currField === undefined
        ) {
          xstate.inAssumedField = true;
          expectedField = field;
          prefixLen = 0;
          e = 0;
          break;
        }

        // For multiple fields, we need to be more strategic about when to assign content
        // without prefixes to a field. We should first scan all fields to see if any
        // have proper prefixes before assigning content to the first field.

        // If this is the first field we're checking and no field has been extracted yet
        if (
          xstate.currField === undefined &&
          xstate.extractedFields.length === 0
        ) {
          // In strict mode, we need proper field prefixes for the first required field
          if (strictMode && !field.isOptional) {
            throw new ValidationError({
              message: 'Expected (Required) field not found',
              fields: [field],
            });
          }

          // For non-strict mode, we need to check if ANY field has a proper prefix
          // before assigning content to the first field
          if (!strictMode) {
            // Look ahead to see if any other field has a proper prefix
            let foundValidFieldPrefix = false;
            for (let i = index; i < fields.length; i++) {
              const futureField = fields[i];
              if (!futureField) continue;

              const futurePrefix = `${(xstate.extractedFields.length === 0 ? '' : '\n') + futureField.title}:`;
              const futureMatch = matchesContent(
                content,
                futurePrefix,
                xstate.s
              );
              if (futureMatch >= 0) {
                foundValidFieldPrefix = true;
                break;
              }
            }

            // If no valid field prefix found anywhere, assign to first field
            if (!foundValidFieldPrefix) {
              xstate.inAssumedField = true;
              expectedField = field;
              prefixLen = 0;
              e = 0;
              break;
            }
          }
        }

        expectedField = field.isOptional ? undefined : field;
        continue; // Field is not found, continue to the next field
      case -2:
        return true; // Partial match at end, skip and gather more content
      case -3:
        return true; // String is only whitespace, skip and gather more content
      case -4:
        xstate.inBlock = true;
        return true; // String is only backticks, skip and gather more content
    }
    // We found a field!!!

    // If the field we found is not the expected field, throw an error
    if (expectedField && expectedField.name !== field.name) {
      throw new ValidationError({
        message: 'Expected (Required) field not found',
        fields: [expectedField],
      });
    }

    if (xstate.currField !== undefined && xstate.inAssumedField) {
      // We're transitioning from assumed field to explicit field
      // We need to preserve the content that was already assigned to the assumed field
      const assumedFieldContent = content.substring(0, e).trim();
      if (assumedFieldContent && xstate.currField.name === field.name) {
        // If the assumed field is the same as the current field, combine the content
        const parsedValue = validateAndParseFieldValue(
          xstate.currField,
          assumedFieldContent
        );
        if (parsedValue !== undefined) {
          values[xstate.currField.name] = parsedValue;
        }
      } else if (assumedFieldContent) {
        // If they're different fields, save the assumed field content
        const parsedValue = validateAndParseFieldValue(
          xstate.currField,
          assumedFieldContent
        );
        if (parsedValue !== undefined) {
          values[xstate.currField.name] = parsedValue;
        }
      }

      xstate.inAssumedField = false;
      xstate.streamedIndex[xstate.currField.name] = 0;
      xstate.currField = undefined;
    }

    // Lets wrap up the last field which is still the current field
    if (xstate.currField) {
      const val = content.substring(xstate.s, e).trim();
      const parsedValue = validateAndParseFieldValue(xstate.currField, val);
      if (parsedValue !== undefined) {
        values[xstate.currField.name] = parsedValue;
      }
      if (xstate.prevFields) {
        xstate.prevFields?.push({ field: xstate.currField, s: xstate.s, e });
      } else {
        xstate.prevFields = [{ field: xstate.currField, s: xstate.s, e }];
      }
    }

    // Lets update the state for the new current field

    xstate.s = e + prefixLen;
    xstate.currField = field;
    xstate.currFieldIndex = index;

    if (!xstate.extractedFields.includes(field)) {
      xstate.extractedFields.push(field);
    }

    if (xstate.streamedIndex[field.name] === undefined) {
      xstate.streamedIndex[field.name] = 0;
    }
  }
};

export const streamingExtractFinalValue = (
  sig: Readonly<AxSignature>,
  values: Record<string, unknown>,
  // eslint-disable-next-line functional/prefer-immutable-types
  xstate: extractionState,
  content: string,
  strictMode = false
) => {
  if (xstate.currField) {
    const val = content.substring(xstate.s).trim();

    const parsedValue = validateAndParseFieldValue(xstate.currField, val);
    if (parsedValue !== undefined) {
      values[xstate.currField.name] = parsedValue;
    }
  }

  // In strict mode, if we have content but no fields were extracted and no current field,
  // this means field prefixes were missing when they should have been present
  if (strictMode && !xstate.currField && xstate.extractedFields.length === 0) {
    const trimmedContent = content.trim();
    if (trimmedContent) {
      // Find the first required field to report in the error
      const outputFields = sig.getOutputFields();
      const firstRequiredField = outputFields.find(
        (field) => !field.isOptional
      );
      if (firstRequiredField) {
        throw new ValidationError({
          message: 'Expected field not found',
          fields: [firstRequiredField],
        });
      }
      // If only optional fields exist, ignore unprefixed content in strict mode
    }
  }

  // Check for optional fields that might have been missed by streaming parser
  parseOptionalFieldsFromFullContent(sig, values, content);

  // Check all previous required fields before processing current field
  checkMissingRequiredFields(xstate, values, sig.getOutputFields());
};

// Helper function to parse optional fields from full content that streaming parser might have missed
const parseOptionalFieldsFromFullContent = (
  sig: Readonly<AxSignature>,
  values: Record<string, unknown>,
  content: string
) => {
  const outputFields = sig.getOutputFields();

  for (const field of outputFields) {
    // Skip if field is not optional or already found
    if (!field.isOptional || field.name in values) {
      continue;
    }

    // Look for field.title pattern in content
    const prefix = `${field.title}:`;
    const fieldIndex = content.indexOf(prefix);

    if (fieldIndex === -1) {
      continue;
    }

    // Extract content after the field prefix
    const startIndex = fieldIndex + prefix.length;
    let endIndex = content.length;

    // Find the end of this field's content by looking for the next field or end of content
    for (const otherField of outputFields) {
      if (otherField.name === field.name) {
        continue;
      }

      const otherPrefix = `${otherField.title}:`;
      const otherFieldIndex = content.indexOf(otherPrefix, startIndex);

      if (otherFieldIndex !== -1 && otherFieldIndex < endIndex) {
        endIndex = otherFieldIndex;
      }
    }

    // Extract and validate the field value
    const fieldValue = content.substring(startIndex, endIndex).trim();

    if (fieldValue) {
      try {
        const parsedValue = validateAndParseFieldValue(field, fieldValue);
        if (parsedValue !== undefined) {
          values[field.name] = parsedValue;
        }
      } catch {
        // Ignore validation errors for optional fields in this fallback parser
      }
    }
  }
};

const convertValueToType = (
  field: Readonly<AxField>,
  val: string,
  required = false
) => {
  switch (field.type?.name) {
    case 'code':
      return extractBlock(val);

    case 'string':
      return val;

    case 'number': {
      const v = Number(val);
      if (Number.isNaN(v)) {
        if (field.isOptional && !required) {
          return;
        }
        throw new Error('Invalid number');
      }
      return v;
    }

    case 'boolean': {
      if (typeof val === 'boolean') {
        return val;
      }
      const v = val.toLowerCase();
      if (v === 'true') {
        return true;
      }
      if (v === 'false') {
        return false;
      }
      if (field.isOptional && !required) {
        return;
      }
      throw new Error('Invalid boolean');
    }
    case 'date':
      return parseLLMFriendlyDate(field, val, required);

    case 'datetime':
      return parseLLMFriendlyDateTime(field, val, required);

    case 'class': {
      const className = val;
      if (field.type.options && !field.type.options.includes(className)) {
        if (field.isOptional) {
          return;
        }
        throw new Error(
          `Invalid class '${val}', expected one of the following: ${field.type.options.join(', ')}`
        );
      }
      return className as string;
    }

    default:
      return val as string; // Unknown type
  }
};

export function* yieldDelta<OUT extends AxGenOut>(
  content: string,
  field: Readonly<AxField>,
  s: number,
  e: number,
  // eslint-disable-next-line functional/prefer-immutable-types
  xstate: extractionState,
  index: number
): GenDeltaOut<OUT> {
  const { name: fieldName, isInternal } = field;
  const { isArray: fieldIsArray, name: fieldTypeName } = field.type ?? {};

  if (
    isInternal ||
    fieldIsArray ||
    (fieldTypeName && fieldTypeName !== 'string' && fieldTypeName !== 'code')
  ) {
    return;
  }

  const pos = xstate.streamedIndex[fieldName] ?? 0;
  const isFirstChunk = pos === 0;

  const d1 = content.substring(s + pos, e);
  if (d1.length === 0) {
    return;
  }

  // Remove trailing whitespace, tabs, and newlines
  let d2 = d1.replace(/\s+$/, '');

  // If this field is a "code" type, remove trailing backticks
  if (xstate.currField?.type?.name === 'code') {
    d2 = d2.replace(/\s*```\s*$/, '');
  }

  // Only trim start for the first chunk
  let d3 = isFirstChunk ? d2.trimStart() : d2;

  if (xstate.currField?.type?.name === 'code') {
    // Remove any leading triple-backtick fences (with optional language specifier)
    d3 = d3.replace(/^[ ]*```[a-zA-Z0-9]*\n\s*/, '');
  }

  if (d3.length > 0) {
    yield { index, delta: { [fieldName]: d3 } as unknown as Partial<OUT> };
    xstate.streamedIndex[fieldName] = pos + d2.length;
  }
}

export function* streamValues<OUT extends AxGenOut>(
  sig: Readonly<AxSignature>,
  content: string,
  values: Readonly<Record<string, OUT>>,
  // eslint-disable-next-line functional/prefer-immutable-types
  xstate: extractionState,
  index: number
): GenDeltaOut<OUT> {
  for (const prevField of xstate.prevFields ?? []) {
    const { field, s, e } = prevField;
    yield* yieldDelta<OUT>(content, field, s, e, xstate, index);
  }
  xstate.prevFields = undefined;

  if (!xstate.currField || xstate.currField.isInternal) {
    return;
  }

  yield* yieldDelta<OUT>(
    content,
    xstate.currField,
    xstate.s,
    content.length,
    xstate,
    index
  );

  const outputFields = sig.getOutputFields();

  for (const key of Object.keys(values)) {
    const field = outputFields.find((f) => f.name === key);
    if (!field || field.isInternal) {
      continue;
    }

    const value = values[key];

    if (Array.isArray(value)) {
      const s = xstate.streamedIndex?.[key] ?? 0;
      const v = value.slice(s);
      if (v && v.length > 0) {
        yield { index, delta: { [key]: v } as unknown as Partial<OUT> };
        xstate.streamedIndex[key] = s + v.length;
      }
      continue;
    }

    if (!xstate.streamedIndex[key]) {
      yield { index, delta: { [key]: value } as unknown as Partial<OUT> };
      xstate.streamedIndex[key] = 1;
    }
  }
}

function validateAndParseFieldValue(
  field: Readonly<AxField>,
  fieldValue: string | undefined
): unknown {
  if (
    !fieldValue ||
    fieldValue === '' ||
    /^(null|undefined)\s*$/i.test(fieldValue)
  ) {
    if (field.isOptional) {
      return;
    }
    throw new ValidationError({
      message: 'Required field is missing',
      fields: [field],
      value: fieldValue,
    });
  }

  let value: unknown | undefined;

  if (field.type?.name === 'json') {
    try {
      const text = extractBlock(fieldValue);
      value = JSON.parse(text);
      return value;
    } catch (e) {
      throw new ValidationError({
        message: `Invalid JSON: ${(e as Error).message}`,
        fields: [field],
        value: fieldValue,
      });
    }
  }

  if (field.type?.isArray) {
    try {
      try {
        value = JSON.parse(fieldValue);
      } catch {
        // If JSON parsing fails, try markdown parsing
        value = parseMarkdownList(fieldValue);
      }
      if (!Array.isArray(value)) {
        throw new Error('Expected an array');
      }
    } catch (e) {
      throw new ValidationError({
        message: `Invalid Array: ${(e as Error).message}`,
        fields: [field],
        value: fieldValue,
      });
    }
  }

  try {
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) {
        if (item !== undefined) {
          const v = typeof item === 'string' ? item.trim() : item;
          value[index] = convertValueToType(field, v, true);
        }
      }
    } else {
      value = convertValueToType(field, fieldValue);
    }
  } catch (e) {
    throw new ValidationError({
      message: (e as Error).message,
      fields: [field],
      value: fieldValue,
    });
  }

  if (typeof value === 'string' && value === '') {
    return undefined;
  }

  return value;
}

export const extractBlock = (input: string): string => {
  const markdownBlockPattern = /```([A-Za-z]*)\n([\s\S]*?)\n```/g;
  const match = markdownBlockPattern.exec(input);
  if (!match) {
    return input;
  }
  if (match.length === 3) {
    return match[2] as string;
  }
  if (match.length === 2) {
    return match[1] as string;
  }
  return input;
};
