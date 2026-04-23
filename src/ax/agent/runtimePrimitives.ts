/**
 * Runtime primitive registry.
 *
 * The RLM actor templates (context-actor.md, task-actor.md, actor.md) all
 * advertise a small set of built-in async functions to the LLM: `final`,
 * `askClarification`, `llmQuery`, `inspect_runtime`, `success`/`failed`,
 * `discoverModules`/`discoverFunctions`, `finalForUser`, etc.
 *
 * Historically these were hand-written into each template as bullet lists,
 * which drifted apart as primitives were added. This module is the single
 * source of truth: each primitive is declared once with its stages and
 * gating flag, and the templates render the filtered list via a
 * `{{ primitivesList }}` variable.
 */

export type AxRuntimePrimitiveStage = 'context' | 'task' | 'combined';

export interface AxRuntimePrimitive {
  /** Stable id; used for testing / debugging. */
  readonly id: string;
  /** Which actor stages advertise this primitive. */
  readonly stages: readonly AxRuntimePrimitiveStage[];
  /**
   * Optional gating flag name. If set, the primitive is only rendered when
   * `flags[enabledBy]` is truthy. Useful for conditional primitives like
   * `inspect_runtime` (only when the runtime supports `inspectGlobals`) or
   * `success`/`failed` (only when an agent status callback is wired).
   */
  readonly enabledBy?: string;
  /**
   * Pre-formatted markdown bullet line(s). Multiple entries model overloads
   * (`final(message)` vs `final(task, context)`). Each line is emitted as
   * its own bullet.
   */
  readonly lines: readonly string[];
}

/**
 * Canonical, ordered registry of RLM actor primitives. Order here is the
 * order rendered into the prompt.
 */
export const axRuntimePrimitives: readonly AxRuntimePrimitive[] = [
  {
    id: 'llmQuery',
    stages: ['context', 'task', 'combined'],
    lines: [
      '`await llmQuery([{ query: string, context: any }, ...]): string[]` — Ask focused questions about the narrowed context you pass in.',
    ],
  },
  {
    id: 'final',
    stages: ['context', 'task', 'combined'],
    lines: [
      '`await final(task: string, context?: object)` — Signal completion. Pass a concise instruction and the raw evidence; the responder synthesizes the output. Omit `context` when the answer is directly known.',
    ],
  },
  {
    id: 'finalForUser',
    // ctx-only: lets the context-understanding stage short-circuit directly to
    // the task responder when the answer is already known, bypassing ctx
    // responder + task actor (saves ~3+ LLM calls per hit).
    stages: ['context'],
    enabledBy: 'hasFinalForUser',
    lines: [
      "`await finalForUser(outputGenerationTask: string, context: object)` — If the answer to the user's request is already obvious from the context you just distilled, call this instead of `final(...)` to skip the downstream task-execution stage entirely. Use only when no tool call or extra reasoning is needed.",
    ],
  },
  {
    id: 'askClarification',
    stages: ['context', 'task', 'combined'],
    lines: [
      "`await askClarification(spec: string | { question: string, type?: 'text'|'date'|'number'|'single_choice'|'multiple_choice', choices?: string[] }): void` — Ask the user for clarification when genuinely blocked on an ambiguity you cannot resolve.",
    ],
  },
  {
    id: 'success',
    stages: ['task', 'combined'],
    enabledBy: 'hasAgentStatusCallback',
    lines: [
      '`await success(message: string)` — Report a successful sub-task completion to the user.',
    ],
  },
  {
    id: 'failed',
    stages: ['task', 'combined'],
    enabledBy: 'hasAgentStatusCallback',
    lines: [
      '`await failed(message: string)` — Report a failed sub-task to the user.',
    ],
  },
  {
    id: 'inspect_runtime',
    stages: ['context', 'task', 'combined'],
    enabledBy: 'hasInspectRuntime',
    lines: [
      '`await inspect_runtime(): string` — Returns a compact snapshot of user-defined variables in the current session (name, type, size, preview). Use this to re-ground yourself when the conversation is long.',
    ],
  },
  {
    id: 'discoverModules',
    stages: ['task', 'combined'],
    enabledBy: 'discoveryMode',
    lines: [
      '`await discoverModules(modules: string[]): void` — Discover available functions in each module (docs become available next turn).',
      '`await discoverFunctions(functions: string[]): void` — Discover full definitions for specified functions (docs become available next turn).',
    ],
  },
];

/**
 * Render the filtered primitive list as a markdown bullet block for the
 * prompt. Stage-gates and flag-gates primitives; omits any gated-out
 * entries so the prompt stays tight.
 */
export function renderPrimitivesList(
  stage: AxRuntimePrimitiveStage,
  flags: Readonly<Record<string, boolean | undefined>>
): string {
  const bullets: string[] = [];
  for (const p of axRuntimePrimitives) {
    if (!p.stages.includes(stage)) continue;
    if (p.enabledBy && !flags[p.enabledBy]) continue;
    for (const line of p.lines) {
      bullets.push(`- ${line}`);
    }
  }
  return bullets.join('\n');
}
