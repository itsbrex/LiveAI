import type { AxAIService, AxFunction } from '../../ai/types.js';
import type { AxSignatureConfig } from '../../dsp/sig.js';
import { AxSignature, f } from '../../dsp/sig.js';
import type { ParseSignature } from '../../dsp/sigtypes.js';
import type {
  AxAgentUsage,
  AxChatLogEntry,
  AxGenIn,
  AxGenOut,
  AxGenStreamingOut,
  AxMessage,
  AxNamedProgramInstance,
  AxProgramDemos,
  AxProgramForwardOptionsWithModels,
  AxProgramStreamingForwardOptionsWithModels,
  AxProgramTrace,
} from '../../dsp/types.js';
import { AxAgentInternal } from '../AxAgent.js';
import { toCamelCase } from '../runtimeDiscovery.js';
import type {
  AxAgentDemos,
  AxAgentEvalDataset,
  AxAgentEvalPrediction,
  AxAgentEvalTask,
  AxAgentIdentity,
  AxAgentic,
  AxAgentJudgeOptions,
  AxAgentOptimizeOptions,
  AxAgentOptimizeResult,
  AxAgentOptions,
  AxAgentState,
  AxAgentTestResult,
  AxAnyAgentic,
  AxContextFieldInput,
} from './agentPublicTypes.js';
import type { AxAgentInternalRunner } from './forwardMethods.js';
import {
  createAgentOptimizeMetric,
  createOptimizationProgram,
  optimizeAgent,
} from './optimizer.js';
import type { AxAgentOptimizationTargetDescriptor } from './types.js';

/**
 * Knobs the coordinator passes from top-level `AxAgentOptions` down to
 * BOTH internal agents. These are the LLM-call defaults and stage-agnostic
 * infrastructure that should apply identically to ctx and task stages.
 *
 * All other top-level options reach ONLY the taskAgent; callers who need
 * ctx-specific overrides must opt in explicitly via `options.contextOptions`.
 */
const SHARED_KNOB_KEYS = [
  'runtime',
  'maxRuntimeChars',
  'contextPolicy',
  'summarizerOptions',
  'promptLevel',
  'maxTurns',
  'maxSubAgentCalls',
  'maxSubAgentCallsPerChild',
  'maxBatchedLlmQueryConcurrency',
  'debug',
  'bubbleErrors',
] as const;

function pickShared<IN extends import('../../dsp/types.js').AxGenIn>(
  opts: Readonly<AxAgentOptions<IN>>
): Partial<AxAgentOptions<IN>> {
  const out: Record<string, unknown> = {};
  for (const k of SHARED_KNOB_KEYS) {
    const v = (opts as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<AxAgentOptions<IN>>;
}

/**
 * Unwrap a coordinator (`AxAgent`) to its underlying `AxAgentInternal`.
 * Returns undefined if the agent is neither an internal instance nor a
 * coordinator wrapping one. Used in propagation loops so shared
 * fields/agents/functions reach coordinator-wrapped children.
 */
export function resolveToInternal(
  agent: AxAnyAgentic
): AxAgentInternal<any, any> | undefined {
  if (agent instanceof AxAgentInternal) return agent;
  const maybeCoord = agent as any;
  if (maybeCoord?.primaryAgent instanceof AxAgentInternal) {
    return maybeCoord.primaryAgent as AxAgentInternal<any, any>;
  }
  return undefined;
}

/**
 * Coordinator that wires one or two `AxAgentInternal` instances based on the
 * user's declared `contextFields` and tools:
 *
 * - **Case A** (`contextFields` + tools): ctx stage distils long-context inputs into
 *   `contextData`; task stage runs tool-dispatch with that pre-distilled payload.
 * - **Case B** (`contextFields`, no tools): single ctx stage whose responder emits
 *   the user's output signature directly.
 * - **Case C/D** (no `contextFields`, with or without tools): single task stage,
 *   behaviorally equivalent to the pre-split `AxAgent`.
 *
 * This is the primary user-facing class. `AxAgentInternal` is exported for callers
 * that need direct per-instance control.
 */
export class AxAgent<IN extends AxGenIn, OUT extends AxGenOut>
  implements AxAgentic<IN, OUT>
{
  private readonly ctxAgent?: AxAgentInternal<any, any> & AxAgentInternalRunner;
  private readonly taskAgent?: AxAgentInternal<any, any> &
    AxAgentInternalRunner;
  private readonly primaryAgent: AxAgentInternal<any, any> &
    AxAgentInternalRunner;
  private readonly contextFieldNames: Set<string>;
  private readonly fullSignature: AxSignature<IN, OUT>;
  private func?: AxFunction;

  constructor(
    init: Readonly<{
      ai?: Readonly<AxAIService>;
      judgeAI?: Readonly<AxAIService>;
      agentIdentity?: Readonly<AxAgentIdentity>;
      agentModuleNamespace?: string;
      signature:
        | string
        | Readonly<AxSignatureConfig>
        | Readonly<AxSignature<IN, OUT>>;
    }>,
    options: Readonly<AxAgentOptions<IN>>
  ) {
    this.fullSignature =
      typeof init.signature === 'string'
        ? (AxSignature.create(init.signature) as AxSignature<IN, OUT>)
        : init.signature instanceof AxSignature
          ? (init.signature as AxSignature<IN, OUT>)
          : (new AxSignature(init.signature) as AxSignature<IN, OUT>);

    const ctxFieldInputs = options.contextFields ?? [];
    this.contextFieldNames = new Set(
      ctxFieldInputs.map((cf) => (typeof cf === 'string' ? cf : cf.field))
    );

    const hasContextFields = this.contextFieldNames.size > 0;
    const hasLocalAgents = (options.agents?.length ?? 0) > 0;
    const hasLocalFunctions = (options.functions?.length ?? 0) > 0;
    const hasDiscovery = Boolean(options.functionDiscovery);
    const hasTools = hasLocalAgents || hasLocalFunctions || hasDiscovery;

    if (hasContextFields && hasTools) {
      // Case A: ctx distils context, task executes with tools (opt-in only)
      const allInputFields = this.fullSignature.getInputFields();
      const allOutputFields = this.fullSignature.getOutputFields();

      const ctxInputFields = allInputFields.filter((fld) =>
        this.contextFieldNames.has(fld.name)
      );
      const nonCtxInputFields = allInputFields.filter(
        (fld) => !this.contextFieldNames.has(fld.name)
      );

      // Use `distilledContext` — not `contextData` — so it doesn't collide with
      // the internal `contextData` responder field used by both internal agents.
      const ctxSig = f()
        .addInputFields(ctxInputFields)
        .output(
          'distilledContext',
          f
            .json('Pre-distilled context evidence for the task stage.')
            .optional()
        )
        .build();

      // Strict knob routing: ctxAgent sees only SHARED_KNOB_KEYS (LLM-call
      // defaults + stage-agnostic infrastructure) plus anything the caller
      // explicitly put in `contextOptions`. User tools (`functions`,
      // `agents`, `functionDiscovery`), callbacks, `actorFields`, `mode`,
      // `actorOptions`/`responderOptions`, `recursionOptions`, `judgeOptions`
      // are all task-only and intentionally NOT propagated to ctx.
      const shared = pickShared(options);
      const ctxOverrides = options.contextOptions ?? {};
      this.ctxAgent = new AxAgentInternal({ ...init, signature: ctxSig }, {
        ...shared,
        ...ctxOverrides,
        contextFields: [...ctxFieldInputs],
        actorTemplateVariant: 'context',
        // Let ctx short-circuit the downstream task stage via
        // finalForUser(...) when the answer is already obvious from
        // distillation alone.
        hasFinalForUser: true,
      } as any) as AxAgentInternal<any, any> & AxAgentInternalRunner;

      const taskSig = f()
        .addInputFields(nonCtxInputFields)
        .input(
          'distilledContext',
          f
            .json(
              'Pre-distilled context evidence from the context-understanding stage.'
            )
            .optional()
        )
        .addOutputFields(allOutputFields)
        .build();

      const taskOptions = {
        ...options,
        contextFields: [],
        actorTemplateVariant: 'task' as const,
        hasDistilledContext: true,
      };

      this.taskAgent = new AxAgentInternal(
        { ...init, signature: taskSig },
        taskOptions as any
      ) as AxAgentInternal<any, any> & AxAgentInternalRunner;

      this.primaryAgent = this.taskAgent;
    } else {
      // Cases B, C, D: single internal agent — matches pre-split behavior.
      // Context-only (B) and no-split (C/D) all use the combined actor template
      // so existing behavior and tests are preserved. The split only activates
      // when both contextFields AND tools are present (Case A).
      //
      // Note: in Case B the combined agent's `final(...)` already goes
      // directly to its (single) responder — there is no separate task actor
      // loop to skip, so `finalForUser` is intentionally not advertised.
      // The two primitives would be indistinguishable when there is nothing
      // downstream to bypass.
      this.taskAgent = new AxAgentInternal(
        init as any,
        options
      ) as AxAgentInternal<any, any> & AxAgentInternalRunner;
      this.primaryAgent = this.taskAgent;
    }

    if (init.agentIdentity) {
      const coordForward = this.forward.bind(this);
      const coordSig = this.fullSignature;
      const coordFuncName = init.agentIdentity.namespace
        ? `${init.agentIdentity.namespace}.${toCamelCase(init.agentIdentity.name)}`
        : toCamelCase(init.agentIdentity.name);
      this.func = {
        name: coordFuncName,
        description: init.agentIdentity.description,
        parameters: this.fullSignature.toInputJSONSchema(),
        func: async (funcValues: any, funcOptions?: any): Promise<string> => {
          const ai = funcOptions?.ai;
          if (!ai) {
            throw new Error('AI service is required to run the agent');
          }
          const ret = await coordForward(ai, funcValues, funcOptions);
          const outFields = coordSig.getOutputFields();
          return Object.keys(ret as Record<string, unknown>)
            .map((k) => {
              const field = outFields.find((fld) => fld.name === k);
              return field
                ? `${field.title}: ${(ret as Record<string, unknown>)[k]}`
                : `${k}: ${(ret as Record<string, unknown>)[k]}`;
            })
            .join('\n');
        },
      };
    }
  }

  public async forward<T extends Readonly<AxAIService>>(
    ai: T,
    values: IN | AxMessage<IN>[],
    options?: Readonly<AxProgramForwardOptionsWithModels<T>>
  ): Promise<OUT> {
    if (this.ctxAgent && this.taskAgent) {
      const rawValues: Record<string, unknown> = Array.isArray(values)
        ? values
            .filter((m) => m.role === 'user')
            .reduce<Record<string, unknown>>(
              (acc, m) => ({
                ...acc,
                ...(m.values as Record<string, unknown>),
              }),
              {}
            )
        : (values as Record<string, unknown>);

      const ctxValues: Record<string, unknown> = {};
      const nonCtxValues: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rawValues)) {
        if (this.contextFieldNames.has(k)) {
          ctxValues[k] = v;
        } else {
          nonCtxValues[k] = v;
        }
      }

      // Run ctx actor only first so we can detect the finalForUser
      // short-circuit before paying for ctx responder + task actor.
      // `_runActorOnly` throws `AxAgentClarificationError` itself if the
      // actor terminated with askClarification — no re-throw needed here.
      const ctxActor = await this.ctxAgent._runActorOnly(
        ai,
        ctxValues,
        options
      );
      if (
        ctxActor.actorResult.type === 'final' &&
        ctxActor.actorResult.shortCircuit
      ) {
        // Short-circuit: hand the ctx actor result directly to the task
        // responder. Skips ctx responder and the full task actor loop.
        return this.taskAgent._runResponderOnly(
          ai,
          nonCtxValues,
          ctxActor.actorResult,
          options
        ) as Promise<OUT>;
      }
      // Normal Case A: finish ctx responder to produce distilledContext,
      // then run the full task stage.
      const ctxOut = await this.ctxAgent._runResponderOnly(
        ai,
        ctxActor.nonContextValues,
        ctxActor.actorResult,
        options
      );
      return this.taskAgent.forward(
        ai,
        {
          ...nonCtxValues,
          distilledContext: (ctxOut as any).distilledContext,
        } as any,
        options as any
      ) as Promise<OUT>;
    }
    return this.primaryAgent.forward(
      ai,
      values as any,
      options as any
    ) as Promise<OUT>;
  }

  public async *streamingForward<T extends Readonly<AxAIService>>(
    ai: T,
    values: IN | AxMessage<IN>[],
    options?: Readonly<AxProgramStreamingForwardOptionsWithModels<T>>
  ): AxGenStreamingOut<OUT> {
    if (this.ctxAgent && this.taskAgent) {
      const rawValues: Record<string, unknown> = Array.isArray(values)
        ? values
            .filter((m) => m.role === 'user')
            .reduce<Record<string, unknown>>(
              (acc, m) => ({
                ...acc,
                ...(m.values as Record<string, unknown>),
              }),
              {}
            )
        : (values as Record<string, unknown>);

      const ctxValues: Record<string, unknown> = {};
      const nonCtxValues: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rawValues)) {
        if (this.contextFieldNames.has(k)) {
          ctxValues[k] = v;
        } else {
          nonCtxValues[k] = v;
        }
      }

      // ctx runs non-streaming; only the final task stage streams.
      // `_runActorOnly` throws `AxAgentClarificationError` itself if needed.
      const ctxActor = await this.ctxAgent._runActorOnly(
        ai,
        ctxValues,
        options
      );
      if (
        ctxActor.actorResult.type === 'final' &&
        ctxActor.actorResult.shortCircuit
      ) {
        // Short-circuit: task responder emits directly. Non-streaming result
        // is wrapped as a single delta so the streaming contract is preserved.
        const result = await this.taskAgent._runResponderOnly(
          ai,
          nonCtxValues,
          ctxActor.actorResult,
          options
        );
        yield {
          version: 1,
          index: 0,
          delta: result,
        } as any;
        return;
      }
      const ctxOut = await this.ctxAgent._runResponderOnly(
        ai,
        ctxActor.nonContextValues,
        ctxActor.actorResult,
        options
      );
      yield* this.taskAgent.streamingForward(
        ai,
        {
          ...nonCtxValues,
          distilledContext: (ctxOut as any).distilledContext,
        } as any,
        options as any
      ) as AxGenStreamingOut<OUT>;
      return;
    }
    yield* this.primaryAgent.streamingForward(
      ai,
      values as any,
      options as any
    ) as AxGenStreamingOut<OUT>;
  }

  public getFunction(): AxFunction {
    if (!this.func) {
      throw new Error(
        'getFunction() requires agentIdentity to be set in the constructor'
      );
    }
    return this.func;
  }

  public getSignature(): AxSignature {
    return this.primaryAgent.getSignature();
  }

  public stop(): void {
    this.ctxAgent?.stop();
    this.taskAgent?.stop();
  }

  public getId(): string {
    return this.primaryAgent.getId();
  }

  public setId(id: string): void {
    this.primaryAgent.setId(id);
  }

  public namedPrograms(): Array<{ id: string; signature?: string }> {
    if (!this.ctxAgent) {
      return this.primaryAgent.namedPrograms();
    }
    const ctx = this.ctxAgent
      .namedPrograms()
      .map((p) => ({ ...p, id: `ctx.${p.id}` }));
    const task = this.primaryAgent
      .namedPrograms()
      .map((p) => ({ ...p, id: `task.${p.id}` }));
    return [...ctx, ...task];
  }

  public namedProgramInstances(): AxNamedProgramInstance<IN, OUT>[] {
    if (!this.ctxAgent) {
      return this.primaryAgent.namedProgramInstances() as AxNamedProgramInstance<
        IN,
        OUT
      >[];
    }
    const ctx = this.ctxAgent
      .namedProgramInstances()
      .map((p) => ({ ...p, id: `ctx.${(p as any).id}` }));
    const task = this.primaryAgent
      .namedProgramInstances()
      .map((p) => ({ ...p, id: `task.${(p as any).id}` }));
    return [...ctx, ...task] as AxNamedProgramInstance<IN, OUT>[];
  }

  public getTraces(): AxProgramTrace<IN, OUT>[] {
    if (!this.ctxAgent) {
      return this.primaryAgent.getTraces() as AxProgramTrace<IN, OUT>[];
    }
    return [
      ...this.ctxAgent.getTraces(),
      ...this.primaryAgent.getTraces(),
    ] as AxProgramTrace<IN, OUT>[];
  }

  public setDemos(
    demos: readonly (AxAgentDemos<IN, OUT> | AxProgramDemos<IN, OUT>)[],
    options?: { modelConfig?: Record<string, unknown> }
  ): void {
    if (!this.ctxAgent) {
      this.primaryAgent.setDemos(demos as any, options);
      return;
    }
    // Route demos by prefix: ctx.* → ctxAgent, task.* or untagged → taskAgent
    const ctxDemos: any[] = [];
    const taskDemos: any[] = [];
    for (const demo of demos) {
      const d = demo as any;
      const id: string | undefined = d.id;
      if (id?.startsWith('ctx.')) {
        ctxDemos.push({ ...d, id: id.slice(4) });
      } else if (id?.startsWith('task.')) {
        taskDemos.push({ ...d, id: id.slice(5) });
      } else {
        taskDemos.push(d);
      }
    }
    if (ctxDemos.length > 0) this.ctxAgent.setDemos(ctxDemos, options);
    if (taskDemos.length > 0) this.primaryAgent.setDemos(taskDemos, options);
  }

  public getUsage(): AxAgentUsage {
    const primaryUsage = this.primaryAgent.getUsage();
    if (!this.ctxAgent) {
      return primaryUsage as AxAgentUsage;
    }
    const ctxUsage = this.ctxAgent.getUsage() as AxAgentUsage;
    const taskUsage = primaryUsage as AxAgentUsage;
    return {
      actor: [...ctxUsage.actor, ...taskUsage.actor],
      responder: [...ctxUsage.responder, ...taskUsage.responder],
    };
  }

  public getChatLog(): {
    actor: readonly AxChatLogEntry[];
    responder: readonly AxChatLogEntry[];
  } {
    const primaryLog = this.primaryAgent.getChatLog();
    if (!this.ctxAgent) {
      return primaryLog;
    }
    const ctxLog = this.ctxAgent.getChatLog();
    const tag = (entries: readonly AxChatLogEntry[], stage: 'ctx' | 'task') =>
      entries.map((e) => ({ ...e, stage }));
    return {
      actor: [...tag(ctxLog.actor, 'ctx'), ...tag(primaryLog.actor, 'task')],
      responder: [
        ...tag(ctxLog.responder, 'ctx'),
        ...tag(primaryLog.responder, 'task'),
      ],
    };
  }

  public getStagedUsage(): {
    ctx?: AxAgentUsage;
    task: AxAgentUsage;
  } {
    const taskUsage = this.primaryAgent.getUsage() as AxAgentUsage;
    if (!this.ctxAgent) {
      return { task: taskUsage };
    }
    return {
      ctx: this.ctxAgent.getUsage() as AxAgentUsage,
      task: taskUsage,
    };
  }

  public resetUsage(): void {
    this.ctxAgent?.resetUsage();
    this.taskAgent?.resetUsage();
  }

  public getState(): AxAgentState | undefined {
    return this.primaryAgent.getState();
  }

  public setState(state?: AxAgentState): void {
    this.primaryAgent.setState(state);
  }

  public setSignature(
    signature: NonNullable<ConstructorParameters<typeof AxSignature>[0]>
  ): void {
    this.primaryAgent.setSignature(signature);
    if (this.func) {
      this.func.parameters = new AxSignature(signature).toInputJSONSchema();
    }
  }

  public applyOptimization(optimizedProgram: any): void {
    this.applyOptimizedComponents(optimizedProgram?.componentMap ?? {});
    if (!optimizedProgram?.componentMap) {
      this.primaryAgent.applyOptimization(optimizedProgram);
    }
  }

  public getOptimizableComponents(): readonly any[] {
    const out: any[] = [];
    if (this.ctxAgent) out.push(...this.ctxAgent.getOptimizableComponents());
    if (this.taskAgent) out.push(...this.taskAgent.getOptimizableComponents());
    if (
      this.primaryAgent !== this.ctxAgent &&
      this.primaryAgent !== this.taskAgent
    ) {
      out.push(...this.primaryAgent.getOptimizableComponents());
    }
    return out;
  }

  public applyOptimizedComponents(
    updates: Readonly<Record<string, string>>
  ): void {
    if (this.ctxAgent) this.ctxAgent.applyOptimizedComponents(updates);
    if (this.taskAgent) this.taskAgent.applyOptimizedComponents(updates);
    if (
      this.primaryAgent !== this.ctxAgent &&
      this.primaryAgent !== this.taskAgent
    ) {
      this.primaryAgent.applyOptimizedComponents(updates);
    }
  }

  public async optimize(
    dataset: Readonly<AxAgentEvalDataset<IN>>,
    options?: Readonly<AxAgentOptimizeOptions<IN, OUT>>
  ): Promise<AxAgentOptimizeResult<OUT>> {
    const result = await optimizeAgent<IN, OUT>(this, dataset, {
      ...options,
      studentAI: options?.studentAI ?? (this.primaryAgent as any).ai,
      judgeAI: options?.judgeAI ?? (this.primaryAgent as any).judgeAI,
      teacherAI: options?.teacherAI ?? (this.primaryAgent as any).judgeAI,
      apply: false,
    });
    if (options?.apply !== false && result.optimizedProgram) {
      this.applyOptimization(result.optimizedProgram);
    }
    return result;
  }

  private _listOptimizationTargetDescriptors(): AxAgentOptimizationTargetDescriptor[] {
    return this.namedProgramInstances().map((entry: any) => ({
      id: entry.id,
      signature: entry.signature,
      program: entry.program,
    }));
  }

  private _createOptimizationProgram(
    targetIds: readonly string[],
    descriptors: readonly AxAgentOptimizationTargetDescriptor[]
  ) {
    return createOptimizationProgram<IN, OUT>(this, targetIds, descriptors);
  }

  private _createAgentOptimizeMetric(
    judgeAI: Readonly<AxAIService>,
    judgeOptions: Readonly<AxAgentJudgeOptions>
  ) {
    return createAgentOptimizeMetric<IN, OUT>(this, judgeAI, judgeOptions);
  }

  private async _forwardForEvaluation<T extends Readonly<AxAIService>>(
    parentAi: T,
    task: Readonly<AxAgentEvalTask<IN>>,
    options?: Readonly<AxProgramForwardOptionsWithModels<T>>
  ): Promise<AxAgentEvalPrediction<OUT>> {
    if (!this.ctxAgent) {
      return (this.primaryAgent as any)._forwardForEvaluation(
        parentAi,
        task,
        options
      );
    }

    const output = await this.forward(parentAi, task.input, options);
    const chatLog = this.getChatLog();
    const actionLog = chatLog.actor
      .map((entry) => String((entry as any).content ?? ''))
      .filter((entry) => entry.length > 0)
      .join('\n');
    return {
      completionType: 'final',
      output,
      actionLog,
      functionCalls: [],
      toolErrors: [],
      turnCount: chatLog.actor.length,
      usage: [
        ...((this.ctxAgent.getUsage() as AxAgentUsage).actor ?? []),
        ...((this.taskAgent?.getUsage() as AxAgentUsage | undefined)?.actor ??
          []),
      ],
    };
  }

  public async test(
    code: string,
    values?: Partial<IN>,
    options?: Readonly<{
      ai?: AxAIService;
      abortSignal?: AbortSignal;
      debug?: boolean;
    }>
  ): Promise<AxAgentTestResult> {
    // Route to the stage that owns the context fields. In Case A (ctx + task),
    // the context fields live on ctxAgent; values passed to test() are context
    // field values. In Cases B/C/D, primaryAgent holds everything.
    if (this.ctxAgent) {
      return this.ctxAgent.test(code, values as any, options);
    }
    return this.primaryAgent.test(code, values, options);
  }
}

// ----- Factory Function -----

export interface AxAgentConfig<_IN extends AxGenIn, _OUT extends AxGenOut>
  extends AxAgentOptions<_IN> {
  ai?: AxAIService;
  judgeAI?: AxAIService;
  agentIdentity?: AxAgentIdentity;
}

export function agent<
  const T extends string,
  const CF extends readonly AxContextFieldInput[] = [],
>(
  signature: T,
  config: Omit<
    AxAgentConfig<ParseSignature<T>['inputs'], ParseSignature<T>['outputs']>,
    'contextFields'
  > & {
    contextFields?: CF;
  }
): AxAgent<ParseSignature<T>['inputs'], ParseSignature<T>['outputs']>;

export function agent<
  TInput extends Record<string, any>,
  TOutput extends Record<string, any>,
  const CF extends readonly AxContextFieldInput[] = [],
>(
  signature: AxSignature<TInput, TOutput>,
  config: Omit<AxAgentConfig<TInput, TOutput>, 'contextFields'> & {
    contextFields?: CF;
  }
): AxAgent<TInput, TOutput>;

export function agent(
  signature: Readonly<AxSignatureConfig>,
  config: AxAgentConfig<AxGenIn, AxGenOut>
): AxAgent<AxGenIn, AxGenOut>;
export function agent(
  signature: string | AxSignature<any, any> | Readonly<AxSignatureConfig>,
  config: AxAgentConfig<any, any>
): AxAgent<any, any> {
  const typedSignature =
    typeof signature === 'string'
      ? AxSignature.create(signature)
      : signature instanceof AxSignature
        ? signature
        : new AxSignature(signature);
  const { ai, judgeAI, agentIdentity, ...options } = config;

  return new AxAgent(
    {
      ai,
      judgeAI,
      agentIdentity,
      signature: typedSignature,
    },
    {
      contextFields: [],
      ...options,
    }
  );
}
