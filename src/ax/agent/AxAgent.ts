import type {
  AxAgentCompletionProtocol,
  AxAIService,
  AxFunction,
  AxFunctionHandler,
  AxFunctionJSONSchema,
} from '../ai/types.js';
import type {
  AxMetricFn,
  AxOptimizationProgress,
  AxOptimizationStats,
  AxOptimizerArgs,
  AxTypedExample,
} from '../dsp/common_types.js';
import type { AxGen } from '../dsp/generate.js';
import type { AxJudgeOptions } from '../dsp/judgeTypes.js';
import {
  type AxOptimizedProgram,
  AxOptimizedProgramImpl,
  type AxParetoResult,
} from '../dsp/optimizer.js';
import { AxGEPA } from '../dsp/optimizers/gepa.js';
import type { AxOptimizerLoggerFunction } from '../dsp/optimizerTypes.js';
import type { AxIField, AxSignatureConfig } from '../dsp/sig.js';
import { AxSignature, f } from '../dsp/sig.js';
import type { ParseSignature } from '../dsp/sigtypes.js';
import type {
  AxAgentUsage,
  AxChatLogEntry,
  AxFieldValue,
  AxGenIn,
  AxGenOut,
  AxGenStreamingOut,
  AxMessage,
  AxNamedProgramInstance,
  AxProgramDemos,
  AxProgramForwardOptions,
  AxProgramForwardOptionsWithModels,
  AxProgrammable,
  AxProgramStreamingForwardOptionsWithModels,
  AxProgramTrace,
  AxProgramUsage,
  AxTunable,
  AxUsable,
} from '../dsp/types.js';
import { AxJSRuntime } from '../funcs/jsRuntime.js';
import { mergeAbortSignals } from '../util/abort.js';
import { AxAIServiceAbortedError } from '../util/apicall.js';
import {
  type AxAgentGuidancePayload,
  type AxAgentInternalCompletionPayload,
  AxAgentProtocolCompletionSignal,
  type createCompletionBindings,
  normalizeClarificationForError,
} from './completion.js';
import {
  computeEffectiveChatBudget,
  DEFAULT_AGENT_MODULE_NAMESPACE,
  DEFAULT_CONTEXT_FIELD_PROMPT_MAX_CHARS,
  DEFAULT_RLM_BATCH_CONCURRENCY,
  DEFAULT_RLM_MAX_LLM_CALLS,
  DEFAULT_RLM_MAX_LLM_CALLS_PER_CHILD,
  DEFAULT_RLM_MAX_TURNS,
  getActorModelConsecutiveErrorTurns,
  getActorModelMatchedNamespaces,
  normalizeRestoredActorModelState,
  resetActorModelErrorTurns,
  resolveActorModelPolicy,
  resolveContextPolicy,
  selectActorModelFromPolicy,
  updateActorModelErrorTurns,
  updateActorModelMatchedNamespaces,
} from './config.js';
import type { ActionLogEntry } from './contextManager.js';
import {
  buildActionEvidenceSummary,
  buildActionLogParts,
  buildActionLogReplayPlan,
  buildActionLogWithPolicy,
  buildInspectRuntimeBaselineCode,
  buildInspectRuntimeCode,
  buildRuntimeStateProvenance,
  type CheckpointSummaryState,
  generateCheckpointSummaryAsync,
  getPromptFacingActionLogEntries,
  manageContext,
  type RuntimeStateVariableProvenance,
} from './contextManager.js';
import {
  AX_AGENT_OPTIMIZE_JUDGE_EVAL_SIGNATURE,
  AX_AGENT_OPTIMIZE_PROGRAM_SIGNATURE,
  adjustEvalScoreForActions,
  buildAgentJudgeCriteria,
  buildAgentJudgeForwardOptions,
  DEFAULT_AGENT_OPTIMIZE_MAX_METRIC_CALLS,
  mapAgentJudgeQualityToScore,
  normalizeActorJavascriptCode,
  normalizeAgentEvalDataset,
  resolveAgentOptimizeTargetIds,
  serializeForEval,
} from './optimize.js';
import type {
  AxCodeRuntime,
  AxCodeSession,
  AxCodeSessionSnapshotEntry,
  AxContextPolicyBudget,
  AxContextPolicyConfig,
  AxContextPolicyPreset,
  AxRLMConfig,
} from './rlm.js';
import {
  axBuildActorDefinition,
  axBuildContextActorDefinition,
  axBuildResponderDefinition,
  axBuildTaskActorDefinition,
} from './rlm.js';
import {
  type AxOptimizableComponent,
  axOptimizableValidators,
} from '../dsp/optimizable.js';
import {
  type AxRuntimePrimitiveStage,
  visibleRuntimePrimitives,
} from './runtimePrimitives.js';
import { promptTemplates, type TemplateId } from './templates.generated.js';
import {
  requiredTemplateVariables,
  validatePromptTemplateSyntax,
} from './templateEngine.js';
import {
  buildBootstrapRuntimeGlobals,
  buildContextFieldPromptInlineValue,
  buildInternalSummaryRequestOptions,
  buildRLMVariablesInfo,
  DISCOVERY_GET_FUNCTION_DEFINITIONS_NAME,
  DISCOVERY_LIST_MODULE_FUNCTIONS_NAME,
  formatBootstrapContextSummary,
  formatBubbledActorTurnOutput,
  formatInterpreterError,
  formatInterpreterOutput,
  formatLegacyRuntimeState,
  formatStructuredRuntimeState,
  hasCompletionSignalCall,
  isExecutionTimedOutError,
  isLikelyRuntimeErrorOutput,
  isSessionClosedError,
  isTransientError,
  looksLikePromisePlaceholder,
  normalizeContextFields,
  parseRuntimeStateSnapshot,
  RUNTIME_RESTART_NOTICE,
  runWithConcurrency,
  shouldEnforceIncrementalConsoleTurns,
  TEST_HARNESS_LLM_QUERY_AI_REQUIRED_ERROR,
  truncateText,
  validateActorTurnCodePolicy,
} from './runtime.js';
import {
  compareCanonicalDiscoveryStrings,
  type DiscoveryCallableMeta,
  normalizeAgentFunctionCollection,
  normalizeAgentModuleNamespace,
  normalizeAndSortDiscoveryFunctionIdentifiers,
  normalizeDiscoveryCallableIdentifier,
  normalizeDiscoveryStringInput,
  renderDiscoveryFunctionDefinitionsMarkdown,
  renderDiscoveryModuleListMarkdown,
  resolveDiscoveryCallableNamespaces,
  sortDiscoveryModules,
  stripSchemaProperties,
  toCamelCase,
} from './runtimeDiscovery.js';
import {
  buildRuntimeRestoreNotice,
  cloneAgentState,
  deserializeAgentStateActionLogEntries,
  mergeRuntimeStateProvenance,
  runtimeStateProvenanceFromRecord,
  runtimeStateProvenanceToRecord,
  serializeAgentStateActionLogEntries,
} from './state.js';
import { computeDynamicRuntimeChars } from './truncate.js';

/**
 * Interface for agents that can be used as child agents.
 * Provides methods to get the agent's function definition and features.
 */
export * from './agentInternal/types.js';

import { runActorLoop } from './agentInternal/actorLoop.js';
import {
  applyOptimization as applyOptimizationImpl,
  getFunction as getFunctionImpl,
  setState as setStateImpl,
  testAgent,
} from './agentInternal/agentPublicMethods.js';
import {
  appendDiscoveryTurnSummary,
  createDiscoveryTurnSummary,
  createMutableDiscoveryPromptState,
  formatDiscoveryTurnSummary,
  renderDiscoveryPromptMarkdown,
  restoreDiscoveryPromptState,
  serializeDiscoveryPromptState,
  stripDiscoveryTurnOutput,
} from './agentInternal/discoveryHelpers.js';
import {
  type AxAgentActorRun,
  type AxAgentInternalRunner,
  forwardAgent,
  runActorOnly,
  runResponderOnly,
  streamingForwardAgent,
} from './agentInternal/forwardMethods.js';
import {
  buildGuidanceActionLogCode,
  buildGuidanceActionLogOutput,
  renderGuidanceLog,
  snapshotChatLogMessages,
} from './agentInternal/guidanceHelpers.js';
import { initializeAgentInternal } from './agentInternal/initialization.js';
import {
  createAgentOptimizeMetric,
  createOptimizationProgram,
  forwardForEvaluation,
  optimizeAgent,
} from './agentInternal/optimizer.js';
import {
  buildActorInstruction,
  renderActorDefinition,
} from './agentInternal/promptAssembly.js';
import {
  listOptimizationTargetDescriptors,
  supportsRecursiveActorSlotOptimization,
} from './agentInternal/recursiveOptimization.js';
import {
  createRuntimeExecutionContext,
  createRuntimeInputState,
  ensureLlmQueryBudgetState,
} from './agentInternal/runtimeExecution.js';
import {
  buildFuncParameters,
  buildRuntimeGlobals,
  wrapFunction,
} from './agentInternal/runtimeGlobals.js';
import { buildSplitPrograms } from './agentInternal/signatureBuilders.js';
import {
  type AxActorDefinitionBuildOptions,
  type AxActorModelPolicy,
  type AxActorModelPolicyEntry,
  type AxAgentActorResultPayload,
  type AxAgentClarification,
  type AxAgentClarificationChoice,
  AxAgentClarificationError,
  type AxAgentClarificationKind,
  type AxAgentDemos,
  type AxAgentDiscoveryPromptState,
  type AxAgentEvalDataset,
  type AxAgentEvalFunctionCall,
  type AxAgentEvalPrediction,
  type AxAgentEvalTask,
  type AxAgentFunction,
  type AxAgentFunctionCallRecorder,
  type AxAgentFunctionCollection,
  type AxAgentFunctionExample,
  type AxAgentFunctionGroup,
  type AxAgentFunctionModuleMeta,
  type AxAgentGuidanceLogEntry,
  type AxAgentGuidanceState,
  type AxAgentIdentity,
  type AxAgentInputUpdateCallback,
  type AxAgentic,
  type AxAgentJudgeEvalInput,
  type AxAgentJudgeEvalOutput,
  type AxAgentJudgeInput,
  type AxAgentJudgeOptions,
  type AxAgentJudgeOutput,
  type AxAgentOptimizationTargetDescriptor,
  type AxAgentOptimizeOptions,
  type AxAgentOptimizeResult,
  type AxAgentOptimizeTarget,
  type AxAgentOptions,
  type AxAgentRecursionOptions,
  type AxAgentRuntimeCompletionState,
  type AxAgentRuntimeExecutionContext,
  type AxAgentRuntimeInputState,
  type AxAgentState,
  type AxAgentStateActionLogEntry,
  type AxAgentStateActorModelState,
  type AxAgentStateCheckpointState,
  type AxAgentStateRuntimeEntry,
  type AxAgentStructuredClarification,
  type AxAgentTestCompletionPayload,
  type AxAgentTestResult,
  type AxAgentTurnCallbackArgs,
  type AxAnyAgentic,
  type AxContextFieldInput,
  type AxContextFieldPromptConfig,
  type AxDiscoveryTurnSummary,
  type AxLlmQueryBudgetState,
  type AxLlmQueryPromptMode,
  type AxMutableDiscoveryPromptState,
  type AxNormalizedAgentEvalDataset,
  type AxPreparedRestoredState,
  type AxResolvedActorModelPolicy,
  type AxResolvedActorModelPolicyEntry,
  type AxResolvedContextPolicy,
} from './agentInternal/types.js';
import {
  mergeAgentFunctionModuleMetadata,
  reservedAgentFunctionNamespaces,
  validateAgentFunctionNamespaces,
  validateConfiguredSignature,
} from './agentInternal/validation.js';

// ----- AxAgentInternal Class -----

/**
 * Reusable building block: a split-architecture AI agent with two AxGen programs:
 * - **Actor**: generates code to gather information (inputs, guidanceLog, actionLog -> code)
 * - **Responder**: synthesizes the final answer from actorResult payload (inputs, actorResult -> outputs)
 *
 * The execution loop is managed by TypeScript, not the LLM:
 * 1. Actor generates code → executed in runtime → result appended to actionLog
 * 2. Loop until Actor calls final(...) / askClarification(...) or maxTurns reached
 * 3. Responder synthesizes final answer from actorResult payload
 *
 * The outer `AxAgent` coordinator wires one or two `AxAgentInternal` instances.
 * Use `AxAgentInternal` directly when you need precise per-instance configuration.
 */

export class AxAgentInternal<IN extends AxGenIn, OUT extends AxGenOut>
  implements AxAgentic<IN, OUT>, AxAgentInternalRunner
{
  private ai?: AxAIService;
  private judgeAI?: AxAIService;
  private program!: AxGen<IN, OUT>;
  private actorProgram!: AxGen<any, any>;
  private responderProgram!: AxGen<any, OUT>;
  private agents?: AxAnyAgentic[];
  private agentFunctions!: AxAgentFunction[];
  private agentFunctionModuleMetadata = new Map<
    string,
    AxAgentFunctionModuleMeta
  >();
  private debug?: boolean;
  private options?: Readonly<AxAgentOptions<IN>>;
  private rlmConfig!: AxRLMConfig;
  private runtime!: AxCodeRuntime;
  private actorFieldNames!: string[];
  private actorDescription?: string;
  private actorModelPolicy?: AxResolvedActorModelPolicy;
  private responderDescription?: string;
  private judgeOptions?: AxAgentJudgeOptions;
  private recursionForwardOptions?: AxAgentRecursionOptions;
  private actorForwardOptions?: Partial<AxProgramForwardOptions<string>>;
  private responderForwardOptions?: Partial<AxProgramForwardOptions<string>>;
  private inputUpdateCallback?: AxAgentInputUpdateCallback<IN>;
  private agentStatusCallback?: (
    message: string,
    status: 'success' | 'failed'
  ) => void | Promise<void>;
  private contextPromptConfigByField: Map<string, AxContextFieldPromptConfig> =
    new Map();
  private agentModuleNamespace = DEFAULT_AGENT_MODULE_NAMESPACE;
  private functionDiscoveryEnabled = false;
  private runtimeUsageInstructions = '';
  private enforceIncrementalConsoleTurns = false;
  private bubbleErrors?: ReadonlyArray<new (...args: any[]) => Error>;

  private activeAbortControllers = new Set<AbortController>();
  private _stopRequested = false;
  public state: AxAgentState | undefined;
  public stateError: string | undefined;
  private runtimeBootstrapContext: unknown = undefined;
  private llmQueryBudgetState: AxLlmQueryBudgetState | undefined;
  private baseActorDefinition = '';
  private currentDiscoveryPromptState = createMutableDiscoveryPromptState();
  private actorDefinitionBaseDescription: string | undefined;
  private actorDefinitionContextFields: readonly AxIField[] = [];
  private actorDefinitionResponderOutputFields: readonly AxIField[] = [];
  private actorDefinitionBuildOptions:
    | AxActorDefinitionBuildOptions
    | undefined;
  private func: AxFunction | undefined;

  /** Per-instance overrides for shipped RLM template sources, keyed by TemplateId. */
  public _actorTemplateOverrides: Map<TemplateId, string> | undefined;
  /** Per-instance overrides for primitive bullet line(s), keyed by primitive id. */
  public _primitiveOverrides: Map<string, readonly string[]> | undefined;

  /** Returns the actor template id this agent's variant renders. */
  public _actorTemplateId(): TemplateId {
    const variant = (this as any).options?.actorTemplateVariant ?? 'combined';
    if (variant === 'context') return 'rlm/context-actor.md';
    if (variant === 'task') return 'rlm/task-actor.md';
    return 'rlm/ctx-actor.md';
  }

  private _actorPrimitiveStage(): AxRuntimePrimitiveStage {
    const variant = (this as any).options?.actorTemplateVariant ?? 'combined';
    if (variant === 'context') return 'context';
    if (variant === 'task') return 'task';
    return 'combined';
  }

  private _primitiveFlags(): Record<string, boolean | undefined> {
    const opts = this.actorDefinitionBuildOptions;
    return {
      hasInspectRuntime: Boolean(opts?.hasInspectRuntime),
      hasAgentStatusCallback: Boolean(opts?.hasAgentStatusCallback),
      discoveryMode: Boolean(opts?.discoveryMode),
      hasFinalForUser: Boolean((this as any).options?.hasFinalForUser),
    };
  }

  /**
   * Components owned by this agent (not by its sub-programs): the RLM actor
   * template, the responder template, and each runtime primitive that would
   * be rendered for the current variant + flag set.
   */
  private _localOptimizableComponents(): readonly AxOptimizableComponent[] {
    const id = this.getId();
    const out: AxOptimizableComponent[] = [];

    const actorTplId = this._actorTemplateId();
    const responderTplId: TemplateId = 'rlm/responder.md';

    for (const tplId of [actorTplId, responderTplId] as const) {
      const current =
        this._actorTemplateOverrides?.get(tplId) ?? promptTemplates[tplId];
      const requiredVariables = requiredTemplateVariables(tplId);
      out.push({
        key: `${id}::actor-tpl:${tplId}`,
        kind: 'actor-tpl',
        current,
        description: `RLM template '${tplId}' rendered as the ${
          tplId === responderTplId ? 'responder' : 'actor'
        } system prompt.`,
        constraints:
          'Preserve the full set of `{{var}}` placeholders the renderer expects; the result must be a valid template that parses cleanly.',
        validate: (value) =>
          validatePromptTemplateSyntax(
            value,
            `template-validate:${tplId}`,
            requiredVariables
          ),
      });
    }

    const stage = this._actorPrimitiveStage();
    const flags = this._primitiveFlags();
    for (const p of visibleRuntimePrimitives(stage, flags)) {
      const lines = this._primitiveOverrides?.get(p.id) ?? p.lines;
      out.push({
        key: `${id}::primitive:${p.id}`,
        kind: 'primitive',
        current: lines.join('\n'),
        description: `Runtime primitive \`${p.id}\` advertised in the actor prompt. Each newline-separated line becomes a markdown bullet.`,
        constraints:
          'Newline-separated bullets; each line should start with a backtick-wrapped signature followed by a short purpose statement.',
        validate: axOptimizableValidators.nonEmpty(),
      });
    }

    return out;
  }

  /** Apply this agent's own override updates and return whether any changed. */
  private _applyLocalOptimizedComponents(
    updates: Readonly<Record<string, string>>
  ): boolean {
    const id = this.getId();
    const tplPrefix = `${id}::actor-tpl:`;
    const primPrefix = `${id}::primitive:`;
    let changed = false;

    for (const [key, value] of Object.entries(updates)) {
      if (typeof value !== 'string') continue;

      if (key.startsWith(tplPrefix)) {
        const tplId = key.slice(tplPrefix.length) as TemplateId;
        if (!(tplId in promptTemplates)) continue;
        if (
          validatePromptTemplateSyntax(
            value,
            `template-validate:${tplId}`,
            requiredTemplateVariables(tplId)
          ) !== true
        ) {
          continue;
        }
        if (!this._actorTemplateOverrides) {
          this._actorTemplateOverrides = new Map();
        }
        this._actorTemplateOverrides.set(tplId, value);
        changed = true;
        continue;
      }

      if (key.startsWith(primPrefix)) {
        const pid = key.slice(primPrefix.length);
        if (!this._primitiveOverrides) {
          this._primitiveOverrides = new Map();
        }
        const lines = value
          .split('\n')
          .map((s) => s.replace(/^[-*]\s+/, '').trim())
          .filter((s) => s.length > 0);
        if (lines.length === 0) continue;
        this._primitiveOverrides.set(pid, lines);
        changed = true;
      }
    }

    return changed;
  }

  private shouldBubbleUserError(err: unknown): boolean {
    if (!this.bubbleErrors || this.bubbleErrors.length === 0) return false;
    return this.bubbleErrors.some((ErrorClass) => err instanceof ErrorClass);
  }

  private _reservedAgentFunctionNamespaces(): Set<string> {
    return reservedAgentFunctionNamespaces(this);
  }

  private _mergeAgentFunctionModuleMetadata(
    newMetadata: readonly AxAgentFunctionModuleMeta[]
  ): boolean {
    return mergeAgentFunctionModuleMetadata(this, newMetadata);
  }

  private _validateConfiguredSignature(signature: Readonly<AxSignature>): void {
    validateConfiguredSignature(this, signature);
  }

  private _validateAgentFunctionNamespaces(
    functions: readonly AxAgentFunction[]
  ): void {
    validateAgentFunctionNamespaces(this, functions);
  }

  private _supportsRecursiveActorSlotOptimization(): boolean {
    return supportsRecursiveActorSlotOptimization(this);
  }

  private _renderActorDefinition(): string {
    return renderActorDefinition(this);
  }

  private _buildActorInstruction(): string {
    return buildActorInstruction(this);
  }

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
    initializeAgentInternal(this, init, options);
  }

  /**
   * Builds (or rebuilds) Actor and Responder programs from the current
   * base signature, contextFields, and actorFieldNames.
   */
  private _buildSplitPrograms(): void {
    buildSplitPrograms(this);
  }

  /**
   * Stops an in-flight forward/streamingForward call. Causes the call
   * to throw `AxAIServiceAbortedError`.
   */
  public stop(): void {
    this._stopRequested = true;
    for (const controller of this.activeAbortControllers) {
      controller.abort('Stopped by user');
    }
    this.program.stop();
    this.actorProgram.stop();
    this.responderProgram.stop();
  }

  public getId(): string {
    return this.program.getId();
  }

  public setId(id: string) {
    this.program.setId(id);
  }

  public namedPrograms(): Array<{ id: string; signature?: string }> {
    return this.program.namedPrograms();
  }

  public namedProgramInstances(): AxNamedProgramInstance<IN, OUT>[] {
    return this.program.namedProgramInstances();
  }

  public getTraces() {
    return this.program.getTraces();
  }

  public setDemos(
    demos: readonly (AxAgentDemos<IN, OUT> | AxProgramDemos<IN, OUT>)[],
    options?: { modelConfig?: Record<string, unknown> }
  ) {
    this.program.setDemos(demos as readonly AxProgramDemos<IN, OUT>[], options);
  }

  public getUsage(): AxAgentUsage {
    return {
      actor: (this.actorProgram?.getUsage() as AxProgramUsage[]) ?? [],
      responder: (this.responderProgram?.getUsage() as AxProgramUsage[]) ?? [],
    };
  }

  public getChatLog(): {
    actor: readonly AxChatLogEntry[];
    responder: readonly AxChatLogEntry[];
  } {
    return {
      actor: this.actorProgram?.getChatLog() ?? [],
      responder: this.responderProgram?.getChatLog() ?? [],
    };
  }

  public resetUsage() {
    this.actorProgram?.resetUsage();
    this.responderProgram?.resetUsage();
  }

  public getState(): AxAgentState | undefined {
    if (this.stateError) {
      throw new Error(this.stateError);
    }

    return this.state ? cloneAgentState(this.state) : undefined;
  }

  public setState(state?: AxAgentState): void {
    setStateImpl(this, state);
  }

  private _listOptimizationTargetDescriptors(): AxAgentOptimizationTargetDescriptor[] {
    return listOptimizationTargetDescriptors(this);
  }

  public async optimize(
    dataset: Readonly<AxAgentEvalDataset<IN>>,
    options?: Readonly<AxAgentOptimizeOptions<IN, OUT>>
  ): Promise<AxAgentOptimizeResult<OUT>> {
    return optimizeAgent<IN, OUT>(this, dataset, options);
  }

  private _createOptimizationProgram(
    targetIds: readonly string[],
    descriptors: readonly AxAgentOptimizationTargetDescriptor[]
  ): AxProgrammable<AxAgentEvalTask<IN>, AxAgentEvalPrediction<OUT>> {
    return createOptimizationProgram<IN, OUT>(this, targetIds, descriptors);
  }

  private _createAgentOptimizeMetric(
    judgeAI: Readonly<AxAIService>,
    judgeOptions: Readonly<AxAgentJudgeOptions>
  ): AxMetricFn {
    return createAgentOptimizeMetric<IN, OUT>(this, judgeAI, judgeOptions);
  }

  private async _forwardForEvaluation<T extends Readonly<AxAIService>>(
    parentAi: T,
    task: Readonly<AxAgentEvalTask<IN>>,
    options?: Readonly<AxProgramForwardOptionsWithModels<T>>
  ): Promise<AxAgentEvalPrediction<OUT>> {
    return forwardForEvaluation<IN, OUT, T>(this, parentAi, task, options);
  }

  public getFunction(): AxFunction {
    return getFunctionImpl(this);
  }

  private _createRuntimeInputState(
    values: IN | AxMessage<IN>[] | Partial<IN>,
    options?: Readonly<{
      allowedFieldNames?: readonly string[];
      validateInputKeys?: boolean;
    }>
  ): AxAgentRuntimeInputState {
    return createRuntimeInputState(this, values, options);
  }

  private _ensureLlmQueryBudgetState(): boolean {
    return ensureLlmQueryBudgetState(this);
  }

  private _createRuntimeExecutionContext(
    args: Readonly<{
      ai?: AxAIService;
      inputState: AxAgentRuntimeInputState;
      options?: Readonly<
        Partial<Omit<AxProgramForwardOptions<string>, 'functions'>>
      >;
      effectiveAbortSignal?: AbortSignal;
      debug: boolean;
      completionState: AxAgentRuntimeCompletionState;
      guidanceState: AxAgentGuidanceState;
      completionBindings: ReturnType<typeof createCompletionBindings>;
      actionLogEntries?: ActionLogEntry[];
      functionCallRecorder?: AxAgentFunctionCallRecorder;
    }>
  ): AxAgentRuntimeExecutionContext {
    return createRuntimeExecutionContext(this, args);
  }

  public getSignature(): AxSignature {
    return this.program.getSignature();
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
    return testAgent(this, code, values, options);
  }

  public setSignature(
    signature: NonNullable<ConstructorParameters<typeof AxSignature>[0]>
  ) {
    const nextSignature = new AxSignature(signature);
    this._validateConfiguredSignature(nextSignature);

    const previousSignature = this.program.getSignature();
    try {
      this.program.setSignature(nextSignature);
      this._buildSplitPrograms();
      if (this.func) {
        this.func.parameters = this._buildFuncParameters();
      }
    } catch (err) {
      this.program.setSignature(previousSignature);
      this._buildSplitPrograms();
      if (this.func) {
        this.func.parameters = this._buildFuncParameters();
      }
      throw err;
    }
  }

  public applyOptimization(optimizedProgram: any): void {
    applyOptimizationImpl(this, optimizedProgram);
  }

  public getOptimizableComponents(): readonly any[] {
    const out: any[] = [];
    if (this.program) out.push(...this.program.getOptimizableComponents());
    if (this.actorProgram)
      out.push(...this.actorProgram.getOptimizableComponents());
    if (this.responderProgram)
      out.push(...this.responderProgram.getOptimizableComponents());
    if (this.agents) {
      for (const a of this.agents) {
        const fn = (a as any).getOptimizableComponents;
        if (typeof fn === 'function') out.push(...fn.call(a));
      }
    }
    out.push(...this._localOptimizableComponents());
    return out;
  }

  public applyOptimizedComponents(
    updates: Readonly<Record<string, string>>
  ): void {
    if (this.program) this.program.applyOptimizedComponents(updates);
    if (this.actorProgram) this.actorProgram.applyOptimizedComponents(updates);
    if (this.responderProgram)
      this.responderProgram.applyOptimizedComponents(updates);
    if (this.agents) {
      for (const a of this.agents) {
        const fn = (a as any).applyOptimizedComponents;
        if (typeof fn === 'function') fn.call(a, updates);
      }
    }
    const ownChanged = this._applyLocalOptimizedComponents(updates);
    if (ownChanged) {
      this._buildSplitPrograms();
    }
  }

  // ----- Forward (split architecture) -----

  /**
   * Runs the Actor loop: sets up the runtime session, executes code iteratively,
   * and returns the state needed by the Responder. Closes the session before returning.
   */
  private async _runActorLoop(
    ai: AxAIService,
    values: IN | AxMessage<IN>[],
    options: Readonly<AxProgramForwardOptions<string>> | undefined,
    effectiveAbortSignal: AbortSignal | undefined,
    functionCallRecords?: AxAgentEvalFunctionCall[]
  ): Promise<{
    nonContextValues: Record<string, unknown>;
    contextMetadata: string | undefined;
    guidanceLog: string | undefined;
    actionLog: string;
    actorResult: AxAgentActorResultPayload;
    actorFieldValues: Record<string, unknown>;
    turnCount: number;
  }> {
    return runActorLoop(
      this,
      ai,
      values,
      options,
      effectiveAbortSignal,
      functionCallRecords
    );
  }

  public async forward<T extends Readonly<AxAIService>>(
    parentAi: T,
    values: IN | AxMessage<IN>[],
    options?: Readonly<AxProgramForwardOptionsWithModels<T>>
  ): Promise<OUT> {
    return forwardAgent(this, parentAi, values, options);
  }

  public async *streamingForward<T extends Readonly<AxAIService>>(
    parentAi: T,
    values: IN | AxMessage<IN>[],
    options?: Readonly<AxProgramStreamingForwardOptionsWithModels<T>>
  ): AxGenStreamingOut<OUT> {
    yield* streamingForwardAgent(this, parentAi, values, options);
  }

  /** @internal Coordinator short-circuit: run actor loop without responder. */
  public async _runActorOnly<T extends Readonly<AxAIService>>(
    parentAi: T,
    values: unknown,
    options?: unknown
  ): Promise<AxAgentActorRun> {
    return runActorOnly(this, parentAi, values, options);
  }

  /** @internal Coordinator short-circuit: run responder with a pre-computed actor result. */
  public async _runResponderOnly<T extends Readonly<AxAIService>>(
    parentAi: T,
    nonContextValues: Record<string, unknown>,
    actorResult: AxAgentActorResultPayload,
    options?: unknown
  ): Promise<unknown> {
    return runResponderOnly(
      this,
      parentAi,
      nonContextValues,
      actorResult,
      options
    );
  }

  /**
   * Wraps an AxFunction as an async callable that handles both
   * named ({ key: val }) and positional (val1, val2) argument styles.
   */
  private static wrapFunction = wrapFunction;

  private buildRuntimeGlobals(
    abortSignal?: AbortSignal,
    ai?: AxAIService,
    protocolForTrigger?: (triggeredBy?: string) => AxAgentCompletionProtocol,
    functionCallRecorder?: AxAgentFunctionCallRecorder,
    onDiscoveredNamespaces?: (namespaces: readonly string[]) => void,
    onDiscoveredModules?: (
      modules: readonly string[],
      docs: Readonly<Record<string, string>>
    ) => void,
    onDiscoveredFunctions?: (
      qualifiedNames: readonly string[],
      docs: Readonly<Record<string, string>>
    ) => void
  ): Record<string, unknown> {
    return buildRuntimeGlobals(
      this,
      abortSignal,
      ai,
      protocolForTrigger,
      functionCallRecorder,
      onDiscoveredNamespaces,
      onDiscoveredModules,
      onDiscoveredFunctions
    );
  }

  /**
   * Returns options compatible with AxGen (strips agent-specific grouped options).
   */
  private get _genOptions(): Record<string, unknown> {
    if (!this.options) return {};
    const {
      agents: _a,
      functions: _fn,
      functionDiscovery: _fd,
      judgeOptions: _jo,
      inputUpdateCallback: _iuc,
      ...rest
    } = this.options;
    return rest;
  }

  /**
   * Builds the clean AxFunction parameters schema from input fields only.
   */
  private _buildFuncParameters(): AxFunctionJSONSchema {
    return buildFuncParameters(this);
  }
}

// Re-export the coordinator class and factory from coordinator.ts.
// The coordinator imports `AxAgentInternal` from this file, so we keep the
// re-export here to preserve the public API surface.
export {
  AxAgent,
  type AxAgentConfig,
  agent,
} from './agentInternal/coordinator.js';
