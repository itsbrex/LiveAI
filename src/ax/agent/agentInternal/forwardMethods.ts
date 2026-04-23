import type { AxAIService } from '../../ai/types.js';
import { mergeAbortSignals } from '../../util/abort.js';
import type { AxAgentActorResultPayload } from './agentInternalTypes.js';
import type { AxAgentClarification, AxAgentState } from './agentStateTypes.js';
import { AxAgentClarificationError } from './agentStateTypes.js';

/**
 * Shape returned by `_runActorOnly`: the raw completion payload from the actor
 * loop, plus the non-context input values and any actor-produced field values
 * the caller may need. The coordinator consumes this to decide whether to
 * short-circuit straight to the task responder or fall through to the normal
 * ctx-responder → task-actor path.
 */
export interface AxAgentActorRun {
  actorResult: AxAgentActorResultPayload;
  nonContextValues: Record<string, unknown>;
  actorFieldValues: Record<string, unknown>;
}

/**
 * Narrow interface the coordinator uses to drive its internal agents without
 * `as any`. Implemented by `AxAgentInternal`. Keeps the coordinator decoupled
 * from the full `AxAgentInternal` surface — only the two split-execution
 * primitives and the state snapshots used for error wrapping are exposed.
 */
export interface AxAgentInternalRunner {
  _runActorOnly<T extends Readonly<AxAIService>>(
    parentAi: T,
    values: unknown,
    options?: unknown
  ): Promise<AxAgentActorRun>;

  _runResponderOnly<T extends Readonly<AxAIService>>(
    parentAi: T,
    nonContextValues: Record<string, unknown>,
    actorResult: AxAgentActorResultPayload,
    options?: unknown
  ): Promise<unknown>;

  readonly state?: AxAgentState;
  readonly stateError?: string;
}

export async function forwardAgent<T extends Readonly<AxAIService>>(
  self: any,
  parentAi: T,
  values: any,
  options?: any
): Promise<any> {
  const s = self as any;
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

    const { nonContextValues, actorResult, actorFieldValues } =
      await s._runActorLoop(
        ai,
        values,
        options,
        effectiveAbortSignal
      );

    if (actorResult.type === 'askClarification') {
      throw new AxAgentClarificationError(
        actorResult.args[0] as AxAgentClarification,
        {
          state: s.state,
          stateError: s.stateError,
        }
      );
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

    return { ...responderResult, ...actorFieldValues };
  } finally {
    if (createdBudgetState) {
      s.llmQueryBudgetState = undefined;
    }
    s.activeAbortControllers.delete(abortController);
    s._stopRequested = false;
  }
}

/**
 * Run only the actor loop and return the raw actor result (without running the
 * responder). Used by the coordinator for short-circuit routing: when the ctx
 * actor calls `finalForUser(...)`, the coordinator hands the actor result
 * directly to the task responder, skipping ctx responder + task actor entirely.
 *
 * Throws `AxAgentClarificationError` when the actor terminated with an
 * `askClarification` payload — this is the single source of truth for that
 * throw across every coordinator / forward path.
 */
export async function runActorOnly<T extends Readonly<AxAIService>>(
  self: any,
  parentAi: T,
  values: any,
  options?: any
): Promise<AxAgentActorRun> {
  const s = self as any;
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
    const { nonContextValues, actorResult, actorFieldValues } =
      await s._runActorLoop(ai, values, options, effectiveAbortSignal);
    if (actorResult.type === 'askClarification') {
      throw new AxAgentClarificationError(
        actorResult.args[0] as AxAgentClarification,
        {
          state: s.state,
          stateError: s.stateError,
        }
      );
    }
    return { actorResult, nonContextValues, actorFieldValues };
  } finally {
    if (createdBudgetState) {
      s.llmQueryBudgetState = undefined;
    }
    s.activeAbortControllers.delete(abortController);
    s._stopRequested = false;
  }
}

/**
 * Run only the responder with a pre-computed actor result. Used by the
 * coordinator's short-circuit path so the task responder can synthesize the
 * final answer from the ctx-stage `finalForUser` payload without a task actor
 * loop.
 */
export async function runResponderOnly<T extends Readonly<AxAIService>>(
  self: any,
  parentAi: T,
  nonContextValues: any,
  actorResult: any,
  options?: any
): Promise<any> {
  const s = self as any;
  const ai = s.ai ?? parentAi;
  const debug = options?.debug ?? s.debug ?? ai?.getOptions()?.debug ?? false;
  const responderMergedOptions = {
    ...s._genOptions,
    ...s.responderForwardOptions,
    ...options,
    debug,
    maxSteps: 1,
  };
  return s.responderProgram.forward(
    ai,
    {
      ...nonContextValues,
      contextData: actorResult,
    },
    responderMergedOptions
  );
}

export async function* streamingForwardAgent<T extends Readonly<AxAIService>>(
  self: any,
  parentAi: T,
  values: any,
  options?: any
): AsyncGenerator<any> {
  const s = self as any;
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

    // Actor loop runs non-streaming
    const { nonContextValues, actorResult, actorFieldValues } =
      await s._runActorLoop(ai, values, options, effectiveAbortSignal);

    if (actorResult.type === 'askClarification') {
      throw new AxAgentClarificationError(
        actorResult.args[0] as AxAgentClarification,
        {
          state: s.state,
          stateError: s.stateError,
        }
      );
    }

    const responderMergedOptions = {
      ...s._genOptions,
      ...s.responderForwardOptions,
      ...options,
      debug,
      abortSignal: effectiveAbortSignal,
      maxSteps: 1,
    };

    // Stream the Responder output
    for await (const delta of s.responderProgram.streamingForward(
      ai,
      {
        ...nonContextValues,
        contextData: actorResult,
      },
      responderMergedOptions
    )) {
      yield delta;
    }

    // Yield actorFieldValues as a final delta
    if (Object.keys(actorFieldValues).length > 0) {
      yield {
        version: 1,
        index: 0,
        delta: actorFieldValues,
      };
    }
  } finally {
    if (createdBudgetState) {
      s.llmQueryBudgetState = undefined;
    }
    s.activeAbortControllers.delete(abortController);
    s._stopRequested = false;
  }
}
