import type { AxFunctionJSONSchema } from '../ai/types.js';
import { createHash } from '../util/crypto.js';

import { axGlobals } from './globals.js';
import {
  type InputParsedField,
  type OutputParsedField,
  type ParsedSignature,
  parseSignature,
} from './parser.js';
import type { ParseSignature } from './types.js';
// Interface for programmatically defining field types
export interface AxFieldType {
  readonly type:
    | 'string'
    | 'number'
    | 'boolean'
    | 'json'
    | 'image'
    | 'audio'
    | 'file'
    | 'url'
    | 'date'
    | 'datetime'
    | 'class'
    | 'code';
  readonly isArray?: boolean;
  readonly options?: readonly string[];
  readonly description?: string;
  readonly isOptional?: boolean;
  readonly isInternal?: boolean;
}

// Improved SignatureBuilder class for fluent API with better type inference
export class AxSignatureBuilder<
  _TInput extends Record<string, any> = {},
  _TOutput extends Record<string, any> = {},
> {
  private inputFields: AxField[] = [];
  private outputFields: AxField[] = [];
  private desc?: string;

  /**
   * Add an input field to the signature
   * @param name - Field name
   * @param fieldInfo - Field type created with f.string(), f.number(), etc.
   * @param prepend - If true, adds field to the beginning of input fields
   */
  public input<
    K extends string,
    T extends AxFluentFieldInfo<any, any, any, any> | AxFluentFieldType,
  >(
    name: K,
    fieldInfo: T,
    prepend = false
  ): AxSignatureBuilder<_TInput & Record<K, InferFluentType<T>>, _TOutput> {
    const field: AxField = {
      name,
      type: {
        name: fieldInfo.type,
        isArray: fieldInfo.isArray,
        options: fieldInfo.options ? [...fieldInfo.options] : undefined,
      },
      description: fieldInfo.description,
      isOptional: fieldInfo.isOptional,
      isInternal: fieldInfo.isInternal,
    };

    if (prepend) {
      this.inputFields.unshift(field);
    } else {
      this.inputFields.push(field);
    }

    return this as any;
  }

  /**
   * Add an output field to the signature
   * @param name - Field name
   * @param fieldInfo - Field type created with f.string(), f.number(), etc.
   * @param prepend - If true, adds field to the beginning of output fields
   */
  public output<
    K extends string,
    T extends AxFluentFieldInfo<any, any, any, any> | AxFluentFieldType,
  >(
    name: K,
    fieldInfo: T,
    prepend = false
  ): AxSignatureBuilder<_TInput, _TOutput & Record<K, InferFluentType<T>>> {
    const field: AxField = {
      name,
      type: {
        name: fieldInfo.type,
        isArray: fieldInfo.isArray,
        options: fieldInfo.options ? [...fieldInfo.options] : undefined,
      },
      description: fieldInfo.description,
      isOptional: fieldInfo.isOptional,
      isInternal: fieldInfo.isInternal,
    };

    if (prepend) {
      this.outputFields.unshift(field);
    } else {
      this.outputFields.push(field);
    }

    return this as any;
  }

  /**
   * Set the description for the signature
   * @param description - Description text
   */
  public description(
    description: string
  ): AxSignatureBuilder<_TInput, _TOutput> {
    this.desc = description;
    return this;
  }

  /**
   * Build the final AxSignature instance
   */
  public build(): AxSignature<_TInput, _TOutput> {
    const config: AxSignatureConfig = {
      description: this.desc,
      inputs: this.inputFields,
      outputs: this.outputFields,
    };

    return new AxSignature(config) as AxSignature<_TInput, _TOutput>;
  }
}

// Fluent field type builder for method chaining
export class AxFluentFieldType implements AxFieldType {
  readonly type: AxFieldType['type'];
  readonly isArray?: boolean;
  readonly options?: readonly string[];
  readonly description?: string;
  readonly isOptional?: boolean;
  readonly isInternal?: boolean;

  constructor(fieldType: AxFieldType) {
    this.type = fieldType.type;
    this.isArray = fieldType.isArray;
    this.options = fieldType.options;
    this.description = fieldType.description;
    this.isOptional = fieldType.isOptional;
    this.isInternal = fieldType.isInternal;
  }

  optional(): AxFluentFieldType {
    return new AxFluentFieldType({
      ...this,
      isOptional: true,
    });
  }

  array(): AxFluentFieldType {
    return new AxFluentFieldType({
      ...this,
      isArray: true,
    });
  }

  internal(): AxFluentFieldType {
    return new AxFluentFieldType({
      ...this,
      isInternal: true,
    });
  }
}

// Improved helper functions for creating strongly-typed field info
export const f = Object.assign(
  (): AxSignatureBuilder => new AxSignatureBuilder(),
  {
    string: (desc?: string): AxFluentFieldType =>
      new AxFluentFieldType({
        type: 'string' as const,
        isArray: false as const,
        description: desc,
      }),

    number: (desc?: string): AxFluentFieldType =>
      new AxFluentFieldType({
        type: 'number' as const,
        isArray: false as const,
        description: desc,
      }),

    boolean: (desc?: string): AxFluentFieldType =>
      new AxFluentFieldType({
        type: 'boolean' as const,
        isArray: false as const,
        description: desc,
      }),

    json: (desc?: string): AxFluentFieldType =>
      new AxFluentFieldType({
        type: 'json' as const,
        isArray: false as const,
        description: desc,
      }),

    datetime: (desc?: string): AxFluentFieldType =>
      new AxFluentFieldType({
        type: 'datetime' as const,
        isArray: false as const,
        description: desc,
      }),

    date: (desc?: string): AxFluentFieldType =>
      new AxFluentFieldType({
        type: 'date' as const,
        isArray: false as const,
        description: desc,
      }),

    class: <const TOptions extends readonly string[]>(
      options: TOptions,
      desc?: string
    ): AxFluentFieldType =>
      new AxFluentFieldType({
        type: 'class' as const,
        isArray: false as const,
        options,
        description: desc,
      }),

    image: (desc?: string): AxFluentFieldType =>
      new AxFluentFieldType({
        type: 'image' as const,
        isArray: false as const,
        description: desc,
      }),

    audio: (desc?: string): AxFluentFieldType =>
      new AxFluentFieldType({
        type: 'audio' as const,
        isArray: false as const,
        description: desc,
      }),

    file: (desc?: string): AxFluentFieldType =>
      new AxFluentFieldType({
        type: 'file' as const,
        isArray: false as const,
        description: desc,
      }),

    url: (desc?: string): AxFluentFieldType =>
      new AxFluentFieldType({
        type: 'url' as const,
        isArray: false as const,
        description: desc,
      }),

    code: (language?: string, desc?: string): AxFluentFieldType =>
      new AxFluentFieldType({
        type: 'code' as const,
        isArray: false as const,
        description: desc || language,
      }),

    // Enhanced helper functions for fluent chaining
    array: <T extends AxFluentFieldInfo<any, any, any, any>>(
      baseType: T
    ): AxFluentFieldInfo<T['type'], true, T['options'], T['isOptional']> => ({
      ...baseType,
      isArray: true as const,
    }),

    optional: <T extends AxFluentFieldInfo<any, any, any, any>>(
      baseType: T
    ): AxFluentFieldInfo<T['type'], T['isArray'], T['options'], true> => ({
      ...baseType,
      isOptional: true as const,
    }),

    internal: <T extends AxFluentFieldInfo<any, any, any, any>>(
      baseType: T
    ): T & { readonly isInternal: true } => ({
      ...baseType,
      isInternal: true as const,
    }),

    // Legacy helper functions for backward compatibility with AxFieldType
    legacyArray: <T extends AxFieldType>(
      baseType: T
    ): T & { readonly isArray: true } => ({
      ...baseType,
      isArray: true,
    }),

    legacyOptional: <T extends AxFieldType>(
      baseType: T
    ): T & { readonly isOptional: true } => ({
      ...baseType,
      isOptional: true,
    }),

    legacyInternal: <T extends AxFieldType>(
      baseType: T
    ): T & { readonly isInternal: true } => ({
      ...baseType,
      isInternal: true,
    }),
  }
);

// Backward compatibility alias (legacy API)
export const createFieldType = f;

export interface AxField {
  name: string;
  title?: string;
  description?: string;
  type?: {
    name:
      | 'string'
      | 'number'
      | 'boolean'
      | 'json'
      | 'image'
      | 'audio'
      | 'file'
      | 'url'
      | 'date'
      | 'datetime'
      | 'class'
      | 'code';
    isArray?: boolean;
    options?: string[];
  };
  isOptional?: boolean;
  isInternal?: boolean;
}

export type AxIField = Omit<AxField, 'title'> & { title: string };

// Helper type to map AxFieldType or AxFluentFieldType to TypeScript types for type-safe field additions
type InferFieldValueType<T> = T extends AxFieldType | AxFluentFieldType
  ? T['type'] extends 'string'
    ? T['isArray'] extends true
      ? string[]
      : string
    : T['type'] extends 'number'
      ? T['isArray'] extends true
        ? number[]
        : number
      : T['type'] extends 'boolean'
        ? T['isArray'] extends true
          ? boolean[]
          : boolean
        : T['type'] extends 'json'
          ? T['isArray'] extends true
            ? any[]
            : any
          : T['type'] extends 'date'
            ? T['isArray'] extends true
              ? Date[]
              : Date
            : T['type'] extends 'datetime'
              ? T['isArray'] extends true
                ? Date[]
                : Date
              : T['type'] extends 'image'
                ? T['isArray'] extends true
                  ? { mimeType: string; data: string }[]
                  : { mimeType: string; data: string }
                : T['type'] extends 'audio'
                  ? T['isArray'] extends true
                    ? { format?: 'wav'; data: string }[]
                    : { format?: 'wav'; data: string }
                  : T['type'] extends 'file'
                    ? T['isArray'] extends true
                      ? (
                          | { mimeType: string; data: string }
                          | { mimeType: string; fileUri: string }
                        )[]
                      :
                          | { mimeType: string; data: string }
                          | { mimeType: string; fileUri: string }
                    : T['type'] extends 'url'
                      ? T['isArray'] extends true
                        ? string[]
                        : string
                      : T['type'] extends 'code'
                        ? T['isArray'] extends true
                          ? string[]
                          : string
                        : T['type'] extends 'class'
                          ? T['options'] extends readonly (infer U)[]
                            ? T['isArray'] extends true
                              ? U[]
                              : U
                            : T['isArray'] extends true
                              ? string[]
                              : string
                          : any
  : any;

// Improved fluent field type that preserves exact type information for better inference
export interface AxFluentFieldInfo<
  TType extends AxFieldType['type'] = AxFieldType['type'],
  TIsArray extends boolean = false,
  TOptions extends readonly string[] = readonly string[],
  TIsOptional extends boolean = false,
> {
  readonly type: TType;
  readonly isArray?: TIsArray;
  readonly options?: TOptions;
  readonly description?: string;
  readonly isOptional?: TIsOptional;
  readonly isInternal?: boolean;
}

// Helper type to infer TypeScript type from fluent field info
type InferFluentType<
  T extends AxFluentFieldInfo<any, any, any, any> | AxFluentFieldType,
> = T['type'] extends 'string'
  ? T['isArray'] extends true
    ? string[]
    : string
  : T['type'] extends 'number'
    ? T['isArray'] extends true
      ? number[]
      : number
    : T['type'] extends 'boolean'
      ? T['isArray'] extends true
        ? boolean[]
        : boolean
      : T['type'] extends 'json'
        ? T['isArray'] extends true
          ? any[]
          : any
        : T['type'] extends 'date'
          ? T['isArray'] extends true
            ? Date[]
            : Date
          : T['type'] extends 'datetime'
            ? T['isArray'] extends true
              ? Date[]
              : Date
            : T['type'] extends 'image'
              ? T['isArray'] extends true
                ? { mimeType: string; data: string }[]
                : { mimeType: string; data: string }
              : T['type'] extends 'audio'
                ? T['isArray'] extends true
                  ? { format?: 'wav'; data: string }[]
                  : { format?: 'wav'; data: string }
                : T['type'] extends 'file'
                  ? T['isArray'] extends true
                    ? (
                        | { mimeType: string; data: string }
                        | { mimeType: string; fileUri: string }
                      )[]
                    :
                        | { mimeType: string; data: string }
                        | { mimeType: string; fileUri: string }
                  : T['type'] extends 'url'
                    ? T['isArray'] extends true
                      ? string[]
                      : string
                    : T['type'] extends 'code'
                      ? T['isArray'] extends true
                        ? string[]
                        : string
                      : T['type'] extends 'class'
                        ? T['options'] extends readonly (infer U)[]
                          ? T['isArray'] extends true
                            ? U[]
                            : U
                          : T['isArray'] extends true
                            ? string[]
                            : string
                        : any;

// Helper function to convert AxFieldType to AxField
function convertFieldTypeToAxField(
  fieldType: AxFieldType
): Omit<AxField, 'name'> {
  return {
    type: {
      name: fieldType.type,
      isArray: fieldType.isArray,
      options: fieldType.options ? [...fieldType.options] : undefined,
    },
    description: fieldType.description,
    isOptional: fieldType.isOptional,
    isInternal: fieldType.isInternal,
  };
}

class AxSignatureValidationError extends Error {
  constructor(
    message: string,
    public readonly fieldName?: string,
    public readonly suggestion?: string
  ) {
    super(message);
    this.name = 'AxSignatureValidationError';
  }
}

export interface AxSignatureConfig {
  description?: string;
  inputs: readonly AxField[];
  outputs: readonly AxField[];
}

export class AxSignature<
  _TInput extends Record<string, any> = Record<string, any>,
  _TOutput extends Record<string, any> = Record<string, any>,
> {
  private description?: string;
  private inputFields: AxIField[];
  private outputFields: AxIField[];

  private sigHash: string;
  private sigString: string;

  // Validation caching - stores hash when validation last passed
  private validatedAtHash?: string;

  /**
   * @deprecated Use `AxSignature.create()` for better type safety instead of the constructor.
   * This constructor will be removed in v15.0.0.
   *
   * Migration timeline:
   * - v13.0.24+: Deprecation warnings (current)
   * - v14.0.0: Runtime console warnings
   * - v15.0.0: Complete removal
   *
   * @example
   * ```typescript
   * // Instead of: new AxSignature('userInput:string -> responseText:string')
   * // Use: AxSignature.create('userInput:string -> responseText:string')
   * ```
   */
  constructor(signature?: Readonly<AxSignature | string | AxSignatureConfig>) {
    if (!signature) {
      this.inputFields = [];
      this.outputFields = [];
      this.sigHash = '';
      this.sigString = '';
      return;
    }

    if (typeof signature === 'string') {
      let sig: ParsedSignature;
      try {
        sig = parseSignature(signature);
      } catch (e) {
        if (e instanceof Error) {
          // Preserve the suggestion if it's a SignatureValidationError
          const suggestion =
            'suggestion' in e &&
            typeof (e as { suggestion: unknown }).suggestion === 'string'
              ? (e as { suggestion: string }).suggestion
              : 'Please check the signature format. Example: "userInput:string -> responseText:string"';
          throw new AxSignatureValidationError(
            `Invalid Signature: ${e.message}`,
            undefined,
            suggestion
          );
        }
        throw new AxSignatureValidationError(
          `Invalid Signature: ${signature}`,
          undefined,
          'Please check the signature format. Example: "userInput:string -> responseText:string"'
        );
      }
      this.description = sig.desc;
      this.inputFields = sig.inputs.map((v) => this.parseParsedField(v));
      this.outputFields = sig.outputs.map((v) => this.parseParsedField(v));
      [this.sigHash, this.sigString] = this.updateHash();
    } else if (signature instanceof AxSignature) {
      this.description = signature.getDescription();
      this.inputFields = structuredClone(
        signature.getInputFields()
      ) as AxIField[];
      this.outputFields = structuredClone(
        signature.getOutputFields()
      ) as AxIField[];
      this.sigHash = signature.hash();
      this.sigString = signature.toString();
      // Copy validation state if the source signature was validated
      if (signature.validatedAtHash === this.sigHash) {
        this.validatedAtHash = this.sigHash;
      }
    } else if (typeof signature === 'object' && signature !== null) {
      // Handle AxSignatureConfig object
      if (!('inputs' in signature) || !('outputs' in signature)) {
        throw new AxSignatureValidationError(
          'Invalid signature object: missing inputs or outputs',
          undefined,
          'Signature object must have "inputs" and "outputs" arrays. Example: { inputs: [...], outputs: [...] }'
        );
      }

      if (
        !Array.isArray(signature.inputs) ||
        !Array.isArray(signature.outputs)
      ) {
        throw new AxSignatureValidationError(
          'Invalid signature object: inputs and outputs must be arrays',
          undefined,
          'Both "inputs" and "outputs" must be arrays of AxField objects'
        );
      }

      try {
        this.description = signature.description;
        this.inputFields = signature.inputs.map((v) => this.parseField(v));
        this.outputFields = signature.outputs.map((v) => this.parseField(v));
        [this.sigHash, this.sigString] = this.updateHash();
      } catch (error) {
        if (error instanceof AxSignatureValidationError) {
          throw error;
        }
        throw new AxSignatureValidationError(
          `Failed to create signature from object: ${error instanceof Error ? error.message : 'Unknown error'}`,
          undefined,
          'Check that all fields in inputs and outputs arrays are valid AxField objects'
        );
      }
    } else {
      throw new AxSignatureValidationError(
        'Invalid signature argument type',
        undefined,
        'Signature must be a string, another AxSignature instance, or an object with inputs and outputs arrays'
      );
    }
  }

  /**
   * Static factory method for type inference.
   * Creates a typed AxSignature instance from a signature string.
   */
  public static create<const T extends string>(
    signature: T
  ): AxSignature<ParseSignature<T>['inputs'], ParseSignature<T>['outputs']> {
    return new AxSignature(signature) as AxSignature<
      ParseSignature<T>['inputs'],
      ParseSignature<T>['outputs']
    >;
  }

  private parseParsedField = (
    field: Readonly<InputParsedField | OutputParsedField>
  ): AxIField => {
    if (!field.name || field.name.length === 0) {
      throw new AxSignatureValidationError(
        'Field name is required',
        field.name,
        'Every field must have a descriptive name. Example: "userInput", "responseText"'
      );
    }

    const title = this.toTitle(field.name);
    return {
      name: field.name,
      title,
      description: 'desc' in field ? field.desc : undefined,
      type: field.type ?? { name: 'string', isArray: false },
      ...('isInternal' in field ? { isInternal: field.isInternal } : {}),
      ...('isOptional' in field ? { isOptional: field.isOptional } : {}),
    };
  };

  private parseField = (field: Readonly<AxField>): AxIField => {
    const title =
      !field.title || field.title.length === 0
        ? this.toTitle(field.name)
        : field.title;

    if (field.type && (!field.type.name || field.type.name.length === 0)) {
      throw new AxSignatureValidationError(
        'Field type name is required',
        field.name,
        'Specify a valid type. Available types: string, number, boolean, json, image, audio, file, url, date, datetime, class, code'
      );
    }

    return { ...field, title };
  };

  public setDescription = (desc: string) => {
    if (typeof desc !== 'string') {
      throw new AxSignatureValidationError(
        'Description must be a string',
        undefined,
        'Provide a string description for the signature'
      );
    }
    this.description = desc;
    this.invalidateValidationCache();
    this.updateHashLight();
  };

  public addInputField = (field: Readonly<AxField>) => {
    try {
      const parsedField = this.parseField(field);
      validateField(parsedField, 'input');

      // Check for duplicate input field names
      for (const existingField of this.inputFields) {
        if (existingField.name === parsedField.name) {
          throw new AxSignatureValidationError(
            `Duplicate input field name: "${parsedField.name}"`,
            parsedField.name,
            'Each field name must be unique within the signature'
          );
        }
      }

      // Check if field name conflicts with existing output fields
      for (const outputField of this.outputFields) {
        if (outputField.name === parsedField.name) {
          throw new AxSignatureValidationError(
            `Field name "${parsedField.name}" appears in both inputs and outputs`,
            parsedField.name,
            'Use different names for input and output fields to avoid confusion'
          );
        }
      }

      this.inputFields.push(parsedField);
      this.invalidateValidationCache();
      this.updateHashLight();
    } catch (error) {
      if (error instanceof AxSignatureValidationError) {
        throw error;
      }
      throw new AxSignatureValidationError(
        `Failed to add input field "${field.name}": ${error instanceof Error ? error.message : 'Unknown error'}`,
        field.name
      );
    }
  };

  public addOutputField = (field: Readonly<AxField>) => {
    try {
      const parsedField = this.parseField(field);
      validateField(parsedField, 'output');

      // Check for duplicate output field names
      for (const existingField of this.outputFields) {
        if (existingField.name === parsedField.name) {
          throw new AxSignatureValidationError(
            `Duplicate output field name: "${parsedField.name}"`,
            parsedField.name,
            'Each field name must be unique within the signature'
          );
        }
      }

      // Check if field name conflicts with existing input fields
      for (const inputField of this.inputFields) {
        if (inputField.name === parsedField.name) {
          throw new AxSignatureValidationError(
            `Field name "${parsedField.name}" appears in both inputs and outputs`,
            parsedField.name,
            'Use different names for input and output fields to avoid confusion'
          );
        }
      }

      this.outputFields.push(parsedField);
      this.invalidateValidationCache();
      this.updateHashLight();
    } catch (error) {
      if (error instanceof AxSignatureValidationError) {
        throw error;
      }
      throw new AxSignatureValidationError(
        `Failed to add output field "${field.name}": ${error instanceof Error ? error.message : 'Unknown error'}`,
        field.name
      );
    }
  };

  public setInputFields = (fields: readonly AxField[]) => {
    if (!Array.isArray(fields)) {
      throw new AxSignatureValidationError(
        'Input fields must be an array',
        undefined,
        'Provide an array of field objects'
      );
    }

    try {
      const parsedFields = fields.map((v) => {
        const parsed = this.parseField(v);
        validateField(parsed, 'input');
        return parsed;
      });
      this.inputFields = parsedFields;
      this.invalidateValidationCache();
      this.updateHashLight();
    } catch (error) {
      if (error instanceof AxSignatureValidationError) {
        throw error;
      }
      throw new AxSignatureValidationError(
        `Failed to set input fields: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  };

  public setOutputFields = (fields: readonly AxField[]) => {
    if (!Array.isArray(fields)) {
      throw new AxSignatureValidationError(
        'Output fields must be an array',
        undefined,
        'Provide an array of field objects'
      );
    }

    try {
      const parsedFields = fields.map((v) => {
        const parsed = this.parseField(v);
        validateField(parsed, 'output');
        return parsed;
      });
      this.outputFields = parsedFields;
      this.invalidateValidationCache();
      this.updateHashLight();
    } catch (error) {
      if (error instanceof AxSignatureValidationError) {
        throw error;
      }
      throw new AxSignatureValidationError(
        `Failed to set output fields: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  };

  public getInputFields = (): Readonly<AxIField[]> => this.inputFields;
  public getOutputFields = (): Readonly<AxIField[]> => this.outputFields;
  public getDescription = () => this.description;

  // Type-safe field addition methods that return new signature instances
  public appendInputField = <K extends string, T extends AxFieldType>(
    name: K,
    fieldType: T
  ): AxSignature<_TInput & Record<K, InferFieldValueType<T>>, _TOutput> => {
    const newSig = new AxSignature(this);
    newSig.addInputField({
      name,
      ...convertFieldTypeToAxField(fieldType),
    });
    return newSig as AxSignature<
      _TInput & Record<K, InferFieldValueType<T>>,
      _TOutput
    >;
  };

  public prependInputField = <K extends string, T extends AxFieldType>(
    name: K,
    fieldType: T
  ): AxSignature<Record<K, InferFieldValueType<T>> & _TInput, _TOutput> => {
    const newSig = new AxSignature(this);
    const fieldToAdd = {
      name,
      ...convertFieldTypeToAxField(fieldType),
    };

    // Validate the field before adding
    const parsedField = newSig.parseField(fieldToAdd);
    validateField(parsedField, 'input');

    // Check for duplicate field names
    for (const existingField of newSig.inputFields) {
      if (existingField.name === parsedField.name) {
        throw new AxSignatureValidationError(
          `Duplicate input field name: "${parsedField.name}"`,
          parsedField.name,
          'Each field name must be unique within the signature'
        );
      }
    }

    // Check if field name conflicts with existing output fields
    for (const outputField of newSig.outputFields) {
      if (outputField.name === parsedField.name) {
        throw new AxSignatureValidationError(
          `Field name "${parsedField.name}" appears in both inputs and outputs`,
          parsedField.name,
          'Use different names for input and output fields to avoid confusion'
        );
      }
    }

    // Prepend to the beginning of input fields array
    newSig.inputFields.unshift(parsedField);
    newSig.invalidateValidationCache();
    newSig.updateHashLight();

    return newSig as AxSignature<
      Record<K, InferFieldValueType<T>> & _TInput,
      _TOutput
    >;
  };

  public appendOutputField = <K extends string, T extends AxFieldType>(
    name: K,
    fieldType: T
  ): AxSignature<_TInput, _TOutput & Record<K, InferFieldValueType<T>>> => {
    const newSig = new AxSignature(this);
    newSig.addOutputField({
      name,
      ...convertFieldTypeToAxField(fieldType),
    });
    return newSig as AxSignature<
      _TInput,
      _TOutput & Record<K, InferFieldValueType<T>>
    >;
  };

  public prependOutputField = <K extends string, T extends AxFieldType>(
    name: K,
    fieldType: T
  ): AxSignature<_TInput, Record<K, InferFieldValueType<T>> & _TOutput> => {
    const newSig = new AxSignature(this);
    const fieldToAdd = {
      name,
      ...convertFieldTypeToAxField(fieldType),
    };

    // Validate the field before adding
    const parsedField = newSig.parseField(fieldToAdd);
    validateField(parsedField, 'output');

    // Check for duplicate field names
    for (const existingField of newSig.outputFields) {
      if (existingField.name === parsedField.name) {
        throw new AxSignatureValidationError(
          `Duplicate output field name: "${parsedField.name}"`,
          parsedField.name,
          'Each field name must be unique within the signature'
        );
      }
    }

    // Check if field name conflicts with existing input fields
    for (const inputField of newSig.inputFields) {
      if (inputField.name === parsedField.name) {
        throw new AxSignatureValidationError(
          `Field name "${parsedField.name}" appears in both inputs and outputs`,
          parsedField.name,
          'Use different names for input and output fields to avoid confusion'
        );
      }
    }

    // Prepend to the beginning of output fields array
    newSig.outputFields.unshift(parsedField);
    newSig.invalidateValidationCache();
    newSig.updateHashLight();

    return newSig as AxSignature<
      _TInput,
      Record<K, InferFieldValueType<T>> & _TOutput
    >;
  };

  private invalidateValidationCache = (): void => {
    this.validatedAtHash = undefined;
  };

  private toTitle = (name: string) => {
    let result = name.replace(/_/g, ' ');
    result = result.replace(/([A-Z]|[0-9]+)/g, ' $1').trim();
    return result.charAt(0).toUpperCase() + result.slice(1);
  };

  public toJSONSchema = (): AxFunctionJSONSchema => {
    const properties: Record<string, unknown> = {};
    const required: Array<string> = [];

    for (const f of this.inputFields) {
      const type = f.type ? f.type.name : 'string';
      if (f.type?.isArray) {
        properties[f.name] = {
          description: f.description,
          type: 'array' as const,
          items: {
            type: type,
            description: f.description,
          },
        };
      } else {
        properties[f.name] = {
          description: f.description,
          type: type,
        };
      }

      if (!f.isOptional) {
        required.push(f.name);
      }
    }

    const schema = {
      type: 'object',
      properties: properties,
      required: required,
    };

    return schema as AxFunctionJSONSchema;
  };

  private updateHashLight = (): [string, string] => {
    try {
      // Light validation - only validate individual fields, not full signature consistency
      this.getInputFields().forEach((field) => {
        validateField(field, 'input');
      });
      this.getOutputFields().forEach((field) => {
        validateField(field, 'output');
      });

      this.sigHash = createHash('sha256')
        .update(JSON.stringify(this.inputFields))
        .update(JSON.stringify(this.outputFields))
        .digest('hex');

      this.sigString = renderSignature(
        this.description,
        this.inputFields,
        this.outputFields
      );

      return [this.sigHash, this.sigString];
    } catch (error) {
      if (error instanceof AxSignatureValidationError) {
        throw error;
      }
      throw new AxSignatureValidationError(
        `Signature validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  };

  private updateHash = (): [string, string] => {
    try {
      this.getInputFields().forEach((field) => {
        validateField(field, 'input');
      });
      this.getOutputFields().forEach((field) => {
        validateField(field, 'output');
      });

      this.validateSignatureConsistency();

      this.sigHash = createHash('sha256')
        .update(this.description ?? '')
        .update(JSON.stringify(this.inputFields))
        .update(JSON.stringify(this.outputFields))
        .digest('hex');

      this.sigString = renderSignature(
        this.description,
        this.inputFields,
        this.outputFields
      );

      return [this.sigHash, this.sigString];
    } catch (error) {
      if (error instanceof AxSignatureValidationError) {
        throw error;
      }
      throw new AxSignatureValidationError(
        `Signature validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  };

  private validateSignatureConsistency(): void {
    const inputNames = new Set<string>();
    for (const field of this.inputFields) {
      if (inputNames.has(field.name)) {
        throw new AxSignatureValidationError(
          `Duplicate input field name: "${field.name}"`,
          field.name,
          'Each field name must be unique within the signature'
        );
      }
      inputNames.add(field.name);
    }

    const outputNames = new Set<string>();
    for (const field of this.outputFields) {
      if (outputNames.has(field.name)) {
        throw new AxSignatureValidationError(
          `Duplicate output field name: "${field.name}"`,
          field.name,
          'Each field name must be unique within the signature'
        );
      }
      outputNames.add(field.name);
    }

    for (const outputField of this.outputFields) {
      if (inputNames.has(outputField.name)) {
        throw new AxSignatureValidationError(
          `Field name "${outputField.name}" appears in both inputs and outputs`,
          outputField.name,
          'Use different names for input and output fields to avoid confusion'
        );
      }
    }

    if (this.inputFields.length === 0) {
      throw new AxSignatureValidationError(
        'Signature must have at least one input field',
        undefined,
        'Add an input field. Example: "userInput:string -> ..."'
      );
    }

    if (this.outputFields.length === 0) {
      throw new AxSignatureValidationError(
        'Signature must have at least one output field',
        undefined,
        'Add an output field. Example: "... -> responseText:string"'
      );
    }
  }

  public validate = (): boolean => {
    // Check if already validated at current hash
    if (this.validatedAtHash === this.sigHash) {
      return true;
    }

    try {
      // Perform full validation
      this.updateHash();

      // Cache validation success
      this.validatedAtHash = this.sigHash;

      return true;
    } catch (error) {
      // Clear validation cache on failure
      this.validatedAtHash = undefined;
      throw error;
    }
  };

  public hash = () => this.sigHash;

  public toString = () => this.sigString;

  public toJSON = () => {
    return {
      id: this.hash(),
      description: this.description,
      inputFields: this.inputFields,
      outputFields: this.outputFields,
    };
  };
}

function renderField(field: Readonly<AxField>): string {
  let result = field.name;
  if (field.isOptional) {
    result += '?';
  }
  if (field.isInternal) {
    result += '!';
  }
  if (field.type) {
    result += `:${field.type.name}`;
    if (field.type.isArray) {
      result += '[]';
    }
    if (field.type.name === 'class' && field.type.options) {
      result += ` "${field.type.options.join(' | ')}"`;
    }
  }
  if (field.description && field.type?.name !== 'class') {
    result += ` "${field.description}"`;
  }
  return result;
}

function renderSignature(
  description: string | undefined,
  inputFields: readonly AxField[],
  outputFields: readonly AxField[]
): string {
  const descriptionPart = description ? `"${description}" ` : '';

  const inputFieldsRendered = inputFields.map(renderField).join(', ');

  const outputFieldsRendered = outputFields.map(renderField).join(', ');

  return `${descriptionPart}${inputFieldsRendered} -> ${outputFieldsRendered}`;
}

function isValidCase(inputString: string): boolean {
  const camelCaseRegex = /^[a-z][a-zA-Z0-9]*$/;
  const snakeCaseRegex = /^[a-z]+(_[a-z0-9]+)*$/;

  return camelCaseRegex.test(inputString) || snakeCaseRegex.test(inputString);
}

function validateField(
  field: Readonly<AxField>,
  context: 'input' | 'output'
): void {
  if (!field.name || field.name.length === 0) {
    throw new AxSignatureValidationError(
      'Field name cannot be blank',
      field.name,
      'Every field must have a descriptive name'
    );
  }

  if (!isValidCase(field.name)) {
    throw new AxSignatureValidationError(
      `Invalid field name '${field.name}' - must be camelCase or snake_case`,
      field.name,
      'Use camelCase (e.g., "userInput") or snake_case (e.g., "user_input")'
    );
  }

  if (axGlobals.signatureStrict) {
    const reservedNames = [
      'text',
      'object',
      'image',
      'string',
      'number',
      'boolean',
      'json',
      'array',
      'datetime',
      'date',
      'time',
      'type',
      'class',
      'input',
      'output',
      'data',
      'value',
      'result',
      'response',
      'request',
      'item',
      'element',
    ];

    if (reservedNames.includes(field.name.toLowerCase())) {
      const suggestions =
        context === 'input'
          ? [
              'userInput',
              'questionText',
              'documentContent',
              'messageText',
              'queryString',
            ]
          : [
              'responseText',
              'analysisResult',
              'categoryType',
              'summaryText',
              'outputData',
            ];

      throw new AxSignatureValidationError(
        `Field name '${field.name}' is too generic`,
        field.name,
        `Use a more descriptive name. Examples for ${context} fields: ${suggestions.join(', ')}`
      );
    }
  }

  if (field.name.length < 2) {
    throw new AxSignatureValidationError(
      `Field name '${field.name}' is too short`,
      field.name,
      'Field names must be at least 2 characters long'
    );
  }

  if (field.name.length > 50) {
    throw new AxSignatureValidationError(
      `Field name '${field.name}' is too long (${field.name.length} characters)`,
      field.name,
      'Field names should be 50 characters or less'
    );
  }

  if (field.type) {
    validateFieldType(field, context);
  }
}

function validateFieldType(
  field: Readonly<AxField>,
  context: 'input' | 'output'
): void {
  if (!field.type) return;

  const { type } = field;

  if (
    type.name === 'image' ||
    type.name === 'audio' ||
    type.name === 'file' ||
    type.name === 'url'
  ) {
    if (context === 'output') {
      throw new AxSignatureValidationError(
        `${type.name} type is not supported in output fields`,
        field.name,
        `${type.name} types can only be used in input fields`
      );
    }

    if (type.isArray && (type.name === 'image' || type.name === 'audio')) {
      throw new AxSignatureValidationError(
        `Arrays of ${type.name} are not supported`,
        field.name,
        `Use a single ${type.name} type instead`
      );
    }
  }

  if (type.name === 'class') {
    if (context === 'input') {
      throw new AxSignatureValidationError(
        'Class type is not supported in input fields',
        field.name,
        'Class types are only allowed on output fields. Use "string" type for input classifications'
      );
    }

    if (!type.options || type.options.length === 0) {
      throw new AxSignatureValidationError(
        'Class type requires options',
        field.name,
        'Provide class options. Example: class "positive, negative, neutral"'
      );
    }

    for (const option of type.options) {
      if (!option || option.trim().length === 0) {
        throw new AxSignatureValidationError(
          'Empty class option found',
          field.name,
          'All class options must be non-empty strings'
        );
      }

      const trimmedOption = option.trim();
      if (trimmedOption.includes(',') || trimmedOption.includes('|')) {
        throw new AxSignatureValidationError(
          `Invalid class option "${trimmedOption}"`,
          field.name,
          'Class options cannot contain commas (,) or pipes (|) as they are used to separate options'
        );
      }
    }

    const uniqueOptions = new Set(
      type.options.map((opt) => opt.trim().toLowerCase())
    );
    if (uniqueOptions.size !== type.options.length) {
      throw new AxSignatureValidationError(
        'Duplicate class options found',
        field.name,
        'Each class option must be unique (case-insensitive)'
      );
    }
  }

  if (type.name === 'code' && type.isArray) {
    throw new AxSignatureValidationError(
      'Arrays of code are not commonly supported',
      field.name,
      'Consider using a single code field or an array of strings instead'
    );
  }

  if (field.isInternal && context === 'input') {
    throw new AxSignatureValidationError(
      'Internal marker (!) is not allowed on input fields',
      field.name,
      'Internal markers are only allowed on output fields'
    );
  }
}
