import type { AxAIService } from '../../ai/types.js';
import type { AxMetricFn, AxTypedExample } from '../../dsp/common_types.js';
import { AxGen } from '../../dsp/generate.js';
import type { AxOptimizedProgram } from '../../dsp/optimizer.js';
import { AxGEPA } from '../../dsp/optimizers/gepa.js';
import type {
  AxGenIn,
  AxGenOut,
  AxGenStreamingOut,
  AxNamedProgramInstance,
  AxProgramDemos,
  AxProgramForwardOptions,
  AxProgramForwardOptionsWithModels,
  AxProgrammable,
  AxProgramStreamingForwardOptionsWithModels,
  AxProgramTrace,
} from '../../dsp/types.js';
import { mergeAbortSignals } from '../../util/abort.js';
import { normalizeClarificationForError } from '../completion.js';
import {
  AX_AGENT_OPTIMIZE_JUDGE_EVAL_SIGNATURE,
  AX_AGENT_OPTIMIZE_PROGRAM_SIGNATURE,
  adjustEvalScoreForActions,
  buildAgentJudgeCriteria,
  buildAgentJudgeForwardOptions,
  DEFAULT_AGENT_OPTIMIZE_MAX_METRIC_CALLS,
  mapAgentJudgeQualityToScore,
  normalizeAgentEvalDataset,
  resolveAgentOptimizeTargetIds,
  serializeForEval,
} from '../optimize.js';
import { cloneAgentState } from '../state.js';
import {
  createMutableDiscoveryPromptState,
  restoreDiscoveryPromptState,
  serializeDiscoveryPromptState,
} from './discoveryHelpers.js';
import type {
  AxAgentClarification,
  AxAgentEvalDataset,
  AxAgentEvalFunctionCall,
  AxAgentEvalPrediction,
  AxAgentEvalTask,
  AxAgentJudgeEvalInput,
  AxAgentJudgeEvalOutput,
  AxAgentJudgeInput,
  AxAgentJudgeOptions,
  AxAgentJudgeOutput,
  AxAgentOptimizationTargetDescriptor,
  AxAgentOptimizeOptions,
  AxAgentOptimizeResult,
} from './types.js';

export async function optimizeAgent<IN extends AxGenIn, OUT extends AxGenOut>(
  self: any,
  dataset: Readonly<AxAgentEvalDataset<IN>>,
  options?: Readonly<AxAgentOptimizeOptions<IN, OUT>>
): Promise<AxAgentOptimizeResult<OUT>> {
  const s = self as any;
  const normalizedDataset = normalizeAgentEvalDataset(dataset);
  if (normalizedDataset.train.length === 0) {
    throw new Error(
      'AxAgent.optimize(): at least one training task is required.'
    );
  }

  const studentAI = options?.studentAI ?? s.ai;
  if (!studentAI) {
    throw new Error(
      'AxAgent.optimize(): studentAI is required when the agent has no default ai.'
    );
  }

  const resolvedJudgeAI =
    options?.judgeAI ?? s.judgeAI ?? options?.teacherAI ?? s.ai ?? studentAI;
  const mergedJudgeOptions: AxAgentJudgeOptions = {
    ...(s.judgeOptions ?? {}),
    ...(options?.judgeOptions ?? {}),
  };
  const optimizationTargets = s._listOptimizationTargetDescriptors();
  const targetIds = resolveAgentOptimizeTargetIds(
    optimizationTargets,
    options?.target ?? 'actor'
  );
  const metric =
    options?.metric ??
    s._createAgentOptimizeMetric(resolvedJudgeAI, mergedJudgeOptions);
  const optimizationProgram = s._createOptimizationProgram(
    targetIds,
    optimizationTargets
  );
  const maxMetricCalls = Math.max(
    1,
    Math.floor(
      options?.maxMetricCalls ??
        Math.max(
          DEFAULT_AGENT_OPTIMIZE_MAX_METRIC_CALLS,
          normalizedDataset.train.length * 4
        )
    )
  );

  const optimizer = new AxGEPA({
    studentAI,
    teacherAI: options?.teacherAI ?? resolvedJudgeAI,
    numTrials: options?.numTrials,
    minibatch: options?.minibatch,
    minibatchSize: options?.minibatchSize,
    earlyStoppingTrials: options?.earlyStoppingTrials,
    minImprovementThreshold: options?.minImprovementThreshold,
    sampleCount: options?.sampleCount,
    seed: options?.seed,
    verbose: options?.verbose,
    debugOptimizer: options?.debugOptimizer,
    optimizerLogger: options?.optimizerLogger,
    onProgress: options?.onProgress,
    onEarlyStop: options?.onEarlyStop,
  });

  const result = await optimizer.compile(
    optimizationProgram as AxProgrammable<
      AxAgentEvalTask<IN>,
      AxAgentEvalPrediction<OUT>
    >,
    normalizedDataset.train as readonly AxTypedExample<AxAgentEvalTask<IN>>[],
    metric,
    {
      bootstrap: options?.bootstrap,
      validationExamples: normalizedDataset.validation as
        | readonly AxTypedExample<AxAgentEvalTask<IN>>[]
        | undefined,
      maxMetricCalls,
      verbose: options?.verbose,
    }
  );

  const wrappedOptimizedProgram = result.optimizedProgram as
    | AxOptimizedProgram<OUT>
    | undefined;

  if (options?.apply !== false && wrappedOptimizedProgram) {
    s.applyOptimization(wrappedOptimizedProgram);
  }

  return result as unknown as AxAgentOptimizeResult<OUT>;
}

export function createOptimizationProgram<
  IN extends AxGenIn,
  OUT extends AxGenOut,
>(
  self: any,
  targetIds: readonly string[],
  descriptors: readonly AxAgentOptimizationTargetDescriptor[]
): AxProgrammable<AxAgentEvalTask<IN>, AxAgentEvalPrediction<OUT>> {
  const s = self as any;
  const selectedDescriptors = descriptors.filter((entry) =>
    targetIds.includes(entry.id)
  );
  const allDescriptorIds = new Set(descriptors.map((entry) => entry.id));
  const targetsAllDescriptors =
    targetIds.length === allDescriptorIds.size &&
    targetIds.every((id) => allDescriptorIds.has(id));

  return {
    getId: () => s.getId(),
    setId: (id: string) => s.setId(id),
    getSignature: () => AX_AGENT_OPTIMIZE_PROGRAM_SIGNATURE,
    forward: async (
      ai: Readonly<AxAIService>,
      task: AxAgentEvalTask<IN>,
      options?: Readonly<AxProgramForwardOptions<string>>
    ) => s._forwardForEvaluation(ai, task, options),
    streamingForward: async function* (
      ai: Readonly<AxAIService>,
      task: AxAgentEvalTask<IN>,
      options?: Readonly<
        AxProgramStreamingForwardOptionsWithModels<AxAIService>
      >
    ): AxGenStreamingOut<AxAgentEvalPrediction<OUT>> {
      yield {
        version: 1,
        index: 0,
        delta: await this.forward(
          ai,
          task,
          options as Readonly<AxProgramForwardOptions<string>> | undefined
        ),
      };
    },
    getTraces: () =>
      (targetsAllDescriptors
        ? s.getTraces()
        : s
            .getTraces()
            .filter((trace: AxProgramTrace<any, any>) =>
              targetIds.includes(trace.programId)
            )) as unknown as AxProgramTrace<
        AxAgentEvalTask<IN>,
        AxAgentEvalPrediction<OUT>
      >[],
    namedProgramInstances: () =>
      selectedDescriptors as AxNamedProgramInstance<any, any>[] | any,
    setDemos: (demos, demoOptions) =>
      s.setDemos(
        demos as unknown as readonly AxProgramDemos<IN, OUT>[],
        demoOptions
      ),
    applyOptimization: (optimizedProgram) =>
      s.applyOptimization(optimizedProgram as any),
    getOptimizableComponents: () =>
      targetsAllDescriptors && typeof s.getOptimizableComponents === 'function'
        ? s.getOptimizableComponents()
        : selectedDescriptors.flatMap((entry) => {
            const fn = (entry.program as any).getOptimizableComponents;
            return typeof fn === 'function' ? fn.call(entry.program) : [];
          }),
    applyOptimizedComponents: (updates: Readonly<Record<string, string>>) => {
      if (typeof s.applyOptimizedComponents === 'function') {
        s.applyOptimizedComponents(updates);
      }
    },
    getUsage: () => s.getUsage(),
    resetUsage: () => s.resetUsage(),
  };
}

export function createAgentOptimizeMetric<
  IN extends AxGenIn,
  OUT extends AxGenOut,
>(
  self: any,
  judgeAI: Readonly<AxAIService>,
  judgeOptions: Readonly<AxAgentJudgeOptions>
): AxMetricFn {
  const mergedJudgeCriteria = buildAgentJudgeCriteria(judgeOptions.criteria);
  const judgeGen = new AxGen<AxAgentJudgeEvalInput, AxAgentJudgeEvalOutput>(
    AX_AGENT_OPTIMIZE_JUDGE_EVAL_SIGNATURE
  );
  const judgeDescription = judgeOptions.description?.trim();
  judgeGen.setInstruction(
    judgeDescription
      ? `${mergedJudgeCriteria}\n\nAdditional Judge Guidance:\n${judgeDescription}`
      : mergedJudgeCriteria
  );
  const judgeForwardOptions = buildAgentJudgeForwardOptions(judgeOptions);

  return async ({ example, prediction }) => {
    const task = example as AxAgentEvalTask<IN>;
    const evalPrediction = prediction as AxAgentEvalPrediction<OUT>;
    const judgeInput: AxAgentJudgeInput = {
      taskInput: serializeForEval(task.input),
      criteria: task.criteria,
      expectedOutput: task.expectedOutput,
      expectedActions: task.expectedActions,
      forbiddenActions: task.forbiddenActions,
      metadata: task.metadata,
    };
    const judgeOutput: AxAgentJudgeOutput = {
      completionType: evalPrediction.completionType,
      clarification: serializeForEval(evalPrediction.clarification),
      finalOutput: serializeForEval(evalPrediction.output),
      actionLog: evalPrediction.actionLog,
      guidanceLog: evalPrediction.guidanceLog,
      functionCalls: serializeForEval(evalPrediction.functionCalls),
      toolErrors: evalPrediction.toolErrors,
      turnCount: evalPrediction.turnCount,
      usage: serializeForEval(evalPrediction.usage ?? []),
    };
    const result = await judgeGen.forward(
      judgeAI,
      {
        ...judgeInput,
        ...judgeOutput,
      },
      judgeForwardOptions
    );
    return adjustEvalScoreForActions(
      mapAgentJudgeQualityToScore(result.quality),
      task,
      evalPrediction
    );
  };
}

export async function forwardForEvaluation<
  IN extends AxGenIn,
  OUT extends AxGenOut,
  T extends Readonly<AxAIService>,
>(
  self: any,
  parentAi: T,
  task: Readonly<AxAgentEvalTask<IN>>,
  options?: Readonly<AxProgramForwardOptionsWithModels<T>>
): Promise<AxAgentEvalPrediction<OUT>> {
  const s = self as any;
  const savedState = s.state ? cloneAgentState(s.state) : undefined;
  const savedStateError = s.stateError;
  const savedDiscoveryPromptState = serializeDiscoveryPromptState(
    s.currentDiscoveryPromptState
  );
  s.state = undefined;
  s.stateError = undefined;
  s.currentDiscoveryPromptState = createMutableDiscoveryPromptState();

  const abortController = new AbortController();
  if (s._stopRequested) {
    abortController.abort('Stopped by user (pre-forward)');
  }
  const effectiveAbortSignal = mergeAbortSignals(
    abortController.signal,
    options?.abortSignal
  );

  s.activeAbortControllers.add(abortController);
  const createdBudgetState = s._ensureLlmQueryBudgetState();
  try {
    const ai = s.ai ?? parentAi;
    const debug = options?.debug ?? s.debug ?? ai?.getOptions()?.debug ?? false;
    const functionCalls: AxAgentEvalFunctionCall[] = [];

    const {
      nonContextValues,
      actorResult,
      actorFieldValues,
      guidanceLog,
      actionLog,
      turnCount,
    } = await s._runActorLoop(
      ai,
      task.input,
      options,
      effectiveAbortSignal,
      functionCalls
    );
    const toolErrors = functionCalls
      .filter((call: AxAgentEvalFunctionCall) => Boolean(call.error))
      .map(
        (call: AxAgentEvalFunctionCall) =>
          `${call.qualifiedName}: ${call.error ?? 'unknown error'}`
      );

    if (actorResult.type === 'askClarification') {
      return {
        completionType: 'askClarification',
        clarification: normalizeClarificationForError(
          actorResult.args[0] as AxAgentClarification
        ),
        guidanceLog,
        actionLog,
        functionCalls,
        toolErrors,
        turnCount,
      };
    }

    const responderMergedOptions = {
      ...s._genOptions,
      ...s.responderForwardOptions,
      ...options,
      debug,
      abortSignal: effectiveAbortSignal,
      maxSteps: 1,
    };

    const responderResult = await s.responderProgram.forward(
      ai,
      {
        ...nonContextValues,
        contextData: actorResult,
      },
      responderMergedOptions
    );
    return {
      completionType: 'final',
      output: { ...responderResult, ...actorFieldValues } as OUT,
      guidanceLog,
      actionLog,
      functionCalls,
      toolErrors,
      turnCount,
    };
  } finally {
    s.state = savedState ? cloneAgentState(savedState) : undefined;
    s.stateError = savedStateError;
    s.currentDiscoveryPromptState = restoreDiscoveryPromptState(
      savedDiscoveryPromptState
    );
    if (createdBudgetState) {
      s.llmQueryBudgetState = undefined;
    }
    s.activeAbortControllers.delete(abortController);
    s._stopRequested = false;
  }
}
