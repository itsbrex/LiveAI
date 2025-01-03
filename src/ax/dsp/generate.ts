import { ReadableStream } from 'stream/web';

import type {
  AxAIService,
  AxChatRequest,
  AxChatResponse,
  AxChatResponseResult,
  AxFunction,
  AxModelConfig,
  AxRateLimiterFunction
} from '../ai/types.js';
import { mergeFunctionCalls } from '../ai/util.js';
import { type AxAIMemory, AxMemory } from '../mem/index.js';
import { type AxSpan, AxSpanKind, type AxTracer } from '../trace/index.js';

import {
  assertAssertions,
  assertRequiredFields,
  assertStreamingAssertions,
  type AxAssertion,
  AxAssertionError,
  type AxStreamingAssertion
} from './asserts.js';
import {
  type extractionState,
  extractValues,
  streamingExtractFinalValue,
  streamingExtractValues
} from './extract.js';
import {
  type AxChatResponseFunctionCall,
  type InputFunctionType,
  parseFunctionCalls,
  parseFunctions,
  processFunctions
} from './functions.js';
import {
  type AxGenIn,
  type AxGenOut,
  type AxProgramForwardOptions,
  AxProgramWithSignature
} from './program.js';
import { AxPromptTemplate } from './prompt.js';
import { AxSignature } from './sig.js';
import { AxValidationError } from './validate.js';

export interface AxGenOptions {
  maxCompletions?: number;
  maxRetries?: number;
  maxSteps?: number;
  mem?: AxAIMemory;
  tracer?: AxTracer;
  rateLimiter?: AxRateLimiterFunction;
  stream?: boolean;
  debug?: boolean;
  description?: string;

  functions?: InputFunctionType;
  functionCall?: AxChatRequest['functionCall'];
  stopFunction?: string;
  promptTemplate?: typeof AxPromptTemplate;
  asserts?: AxAssertion[];
  streamingAsserts?: AxStreamingAssertion[];
}

export type AxGenerateResult<OUT extends AxGenOut> = OUT & {
  functions?: AxChatResponseFunctionCall[];
};

export interface AxResponseHandlerArgs<T> {
  ai: Readonly<AxAIService>;
  model?: string;
  res: T;
  usageInfo: { ai: string; model: string };
  mem: AxAIMemory;
  sessionId?: string;
  traceId?: string;
  functions?: Readonly<AxFunction[]>;
}

export class AxGen<
  IN extends AxGenIn = AxGenIn,
  OUT extends AxGenerateResult<AxGenOut> = AxGenerateResult<AxGenOut>
> extends AxProgramWithSignature<IN, OUT> {
  private pt: AxPromptTemplate;
  private asserts: AxAssertion[];
  private streamingAsserts: AxStreamingAssertion[];
  private options?: Omit<AxGenOptions, 'functions'>;
  private functions?: AxFunction[];
  private functionsExecuted: Set<string> = new Set<string>();

  constructor(
    signature: Readonly<AxSignature | string>,
    options?: Readonly<AxGenOptions>
  ) {
    super(signature, { description: options?.description });

    this.options = options;
    this.pt = new (options?.promptTemplate ?? AxPromptTemplate)(
      this.signature,
      options?.functions
    );
    this.asserts = this.options?.asserts ?? [];
    this.streamingAsserts = this.options?.streamingAsserts ?? [];
    this.usage = [];

    if (options?.functions) {
      this.functions = parseFunctions(options.functions);
    }
  }

  public addAssert = (
    fn: AxAssertion['fn'],
    message?: string,
    optional?: boolean
  ) => {
    this.asserts.push({ fn, message, optional });
  };

  public addStreamingAssert = (
    fieldName: string,
    fn: AxStreamingAssertion['fn'],
    message?: string,
    optional?: boolean
  ) => {
    this.streamingAsserts.push({ fieldName, fn, message, optional });
  };

  private async forwardSendRequest({
    mem,
    sessionId,
    traceId,
    ai,
    modelConfig,
    stream,
    model,
    rateLimiter,
    functions,
    functionCall: _functionCall
  }: Readonly<
    Omit<AxProgramForwardOptions, 'ai'> & { ai: AxAIService; stream: boolean }
  >) {
    const chatPrompt = mem?.history(sessionId) ?? [];

    if (chatPrompt.length === 0) {
      throw new Error('No chat prompt found');
    }

    const functionCall = _functionCall ?? this.options?.functionCall;

    const res = await ai.chat(
      {
        chatPrompt,
        functions,
        functionCall,
        modelConfig,
        model
      },
      {
        sessionId,
        traceId,
        rateLimiter,
        stream
      }
    );

    return res;
  }

  private async forwardCore({
    mem,
    sessionId,
    traceId,
    ai,
    modelConfig,
    model,
    rateLimiter,
    stream,
    functions,
    functionCall
  }: Readonly<
    Omit<AxProgramForwardOptions, 'ai' | 'mem' | 'stream'> & {
      ai: Readonly<AxAIService>;
      mem: AxAIMemory;
      stream: boolean;
    }
  >): Promise<OUT> {
    const usageInfo = {
      ai: ai.getName(),
      model: ai.getModelInfo().name
    };

    const res = await this.forwardSendRequest({
      mem,
      sessionId,
      traceId,
      ai,
      stream,
      modelConfig,
      model,
      rateLimiter,
      functions,
      functionCall
    });

    if (res instanceof ReadableStream) {
      return (await this.processSteamingResponse({
        ai,
        model,
        res,
        usageInfo,
        mem,
        traceId,
        sessionId,
        functions
      })) as unknown as OUT;
    }

    return (await this.processResponse({
      ai,
      model,
      res,
      usageInfo,
      mem,
      traceId,
      sessionId,
      functions
    })) as unknown as OUT;
  }

  private async processSteamingResponse({
    ai,
    model,
    res,
    usageInfo,
    mem,
    sessionId,
    traceId,
    functions
  }: Readonly<
    AxResponseHandlerArgs<ReadableStream<AxChatResponse>>
  >): Promise<OUT> {
    const functionCalls: NonNullable<AxChatResponseResult['functionCalls']> =
      [];
    const values = {};
    const xstate: extractionState = { s: -1 };

    let content = '';

    for await (const v of res) {
      for (const result of v.results ?? []) {
        if (v.modelUsage) {
          this.usage.push({ ...usageInfo, ...v.modelUsage });
        }

        if (result.content) {
          content += result.content;

          mem.updateResult({ name: result.name, content }, sessionId);

          assertStreamingAssertions(
            this.streamingAsserts,
            values,
            xstate,
            content
          );
          streamingExtractValues(this.signature, values, xstate, content);
          assertAssertions(this.asserts, values);
        }

        if (result.functionCalls) {
          mergeFunctionCalls(functionCalls, result.functionCalls);

          mem.updateResult(
            { name: result.name, content, functionCalls },
            sessionId
          );
        }

        if (result.finishReason === 'length') {
          throw new Error('Max tokens reached before completion');
        }
      }
    }

    const funcs = parseFunctionCalls(ai, functionCalls, values, model);
    if (funcs) {
      if (!functions) {
        throw new Error('Functions are not defined');
      }
      const fx = await processFunctions(
        ai,
        functions,
        funcs,
        mem,
        sessionId,
        traceId
      );
      this.functionsExecuted = new Set([...this.functionsExecuted, ...fx]);
    }

    streamingExtractFinalValue(values, xstate, content);
    assertAssertions(this.asserts, values);

    return { ...values } as unknown as OUT;
  }

  private async processResponse({
    ai,
    res,
    usageInfo,
    mem,
    sessionId,
    traceId,
    functions
  }: Readonly<AxResponseHandlerArgs<AxChatResponse>>): Promise<OUT> {
    const values = {};

    for (const result of res.results ?? []) {
      if (res.modelUsage) {
        this.usage.push({ ...usageInfo, ...res.modelUsage });
      }

      mem.addResult(result, sessionId);

      if (result.content) {
        extractValues(this.signature, values, result.content);
        assertAssertions(this.asserts, values);
      }

      if (result.functionCalls) {
        const funcs = parseFunctionCalls(ai, result.functionCalls, values);

        if (funcs) {
          if (!functions) {
            throw new Error('Functions are not defined');
          }
          const fx = await processFunctions(
            ai,
            functions,
            funcs,
            mem,
            sessionId,
            traceId
          );
          this.functionsExecuted = new Set([...this.functionsExecuted, ...fx]);
        }
      }

      if (result.finishReason === 'length') {
        throw new Error('Max tokens reached before completion');
      }
    }

    return { ...values } as unknown as OUT;
  }

  private async _forward(
    ai: Readonly<AxAIService>,
    values: IN,
    options?: Readonly<AxProgramForwardOptions>,
    span?: AxSpan
  ): Promise<OUT> {
    const stopFunction = (
      options?.stopFunction ?? this.options?.stopFunction
    )?.toLowerCase();

    const maxRetries = options?.maxRetries ?? this.options?.maxRetries ?? 15;
    const maxSteps = options?.maxSteps ?? this.options?.maxSteps ?? 10;
    const mem = options?.mem ?? this.options?.mem ?? new AxMemory();

    const modelConfig = mergeAxModelConfigs(
      ai.getModelConfig(),
      options?.modelConfig ?? {}
    );

    const canStream = ai.getFeatures(options?.model).streaming;
    const stream =
      options?.stream ?? this.options?.stream ?? modelConfig.stream ?? true;

    let err: AxValidationError | AxAssertionError | undefined;

    if (options?.functions && options?.functions.length > 0) {
      const promptTemplate = this.options?.promptTemplate ?? AxPromptTemplate;
      this.pt = new promptTemplate(this.signature, options.functions);
    }

    const prompt = this.pt.render<IN>(values, {
      examples: this.examples,
      demos: this.demos
    });

    mem.add(prompt, options?.sessionId);

    multiStepLoop: for (let n = 0; n < maxSteps; n++) {
      for (let i = 0; i < maxRetries; i++) {
        try {
          const output = await this.forwardCore({
            ai,
            mem,
            sessionId: options?.sessionId,
            traceId: options?.traceId,
            modelConfig,
            model: options?.model,
            stream: canStream && stream,
            maxSteps: options?.maxSteps,
            rateLimiter: options?.rateLimiter,
            functions: options?.functions,
            functionCall: options?.functionCall
          });

          const lastMemItem = mem.getLast(options?.sessionId);

          const stopFunctionExecuted =
            stopFunction && this.functionsExecuted.has(stopFunction);

          if (lastMemItem?.role === 'function') {
            if (!stopFunction || !stopFunctionExecuted) {
              continue multiStepLoop;
            }
          }

          if (!stopFunctionExecuted) {
            assertRequiredFields(this.signature, output);
          }

          this.trace = { ...values, ...output };
          return output;
        } catch (e) {
          let extraFields;
          span?.recordAxSpanException(e as Error);

          if (e instanceof AxValidationError) {
            extraFields = e.getFixingInstructions();
            err = e;
          } else if (e instanceof AxAssertionError) {
            const e1 = e as AxAssertionError;
            extraFields = e1.getFixingInstructions(this.signature);
            err = e;
          } else {
            throw e;
          }

          if (extraFields) {
            const content = this.pt.renderExtraFields(extraFields);
            mem.add({ role: 'user' as const, content }, options?.sessionId);

            if (options?.debug) {
              console.log('Error Correction:', content);
            }
          }
        }
      }

      if (err instanceof AxAssertionError && err.getOptional()) {
        return err.getValue() as OUT;
      }

      throw new Error(`Unable to fix validation error: ${err?.message}`);
    }

    throw new Error(`Max steps reached: ${maxSteps}`);
  }

  public override async forward(
    ai: Readonly<AxAIService>,
    values: IN,
    options?: Readonly<AxProgramForwardOptions>
  ): Promise<OUT> {
    const tracer = this.options?.tracer ?? options?.tracer;

    let functions: AxFunction[] | undefined = this.functions;

    if (options?.functions) {
      functions = parseFunctions(options.functions, this.functions);
    }

    if (!tracer) {
      return await this._forward(ai, values, {
        ...options,
        functions
      });
    }

    const funcNames = functions?.map((f) => f.name).join(',');

    const attributes = {
      ['generate.signature']: this.signature.toString(),
      ['generate.functions']: funcNames ?? ''
    };

    return await tracer.startActiveSpan(
      'Generate',
      {
        kind: AxSpanKind.SERVER,
        attributes
      },
      async (span) => {
        const res = this._forward(ai, values, options, span);
        span.end();
        return res;
      }
    );
  }
}

function mergeAxModelConfigs(
  baseConfig: Readonly<AxModelConfig>,
  overrideConfig: Readonly<AxModelConfig>
): AxModelConfig {
  return {
    ...baseConfig,
    ...overrideConfig,
    // Merge arrays to avoid overriding entirely
    stopSequences: overrideConfig.stopSequences ?? baseConfig.stopSequences,
    endSequences: overrideConfig.endSequences ?? baseConfig.endSequences
  };
}
