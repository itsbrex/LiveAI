import { describe, expect, it } from 'vitest';
import { AxMockAIService } from '../ai/mock/api.js';
import {
  AxAgent,
  AxAgentClarificationError,
  AxAgentInternal,
  agent,
} from './index.js';
import type { AxCodeRuntime } from './rlm.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeModelUsage = () => ({
  ai: 'mock',
  model: 'mock',
  tokens: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
});

/**
 * Minimal runtime factory.  Recognises `final(...)` and `askClarification(...)`
 * calls by pattern-matching the code string, then invokes the matching global.
 * An optional `behavior` callback can override execution for all other code.
 */
const makeRuntime = (
  behavior?: (code: string, globals: Record<string, unknown>) => unknown
): AxCodeRuntime => ({
  getUsageInstructions: () => '',
  createSession(globals) {
    return {
      execute: async (code: string) => {
        if (globals?.finalForUser && code.includes('finalForUser(')) {
          const match = code.match(/finalForUser\("([^"]*)",\s*(\{[^}]*\})\)/);
          if (match) {
            const msg = match[1];
            const extra = JSON.parse(match[2]!);
            (globals.finalForUser as (...args: unknown[]) => void)(msg, extra);
          }
          return 'short-circuited';
        }
        if (globals?.final && code.includes('final(')) {
          // Parse args from final("message", {field: "val"}) or final("message")
          const match = code.match(/final\("([^"]*)"(?:,\s*(\{[^}]*\}))?\)/);
          if (match) {
            const msg = match[1];
            const extra = match[2] ? JSON.parse(match[2]) : {};
            (globals.final as (...args: unknown[]) => void)(msg, extra);
          }
          return 'submitted';
        }
        if (globals?.askClarification && code.includes('askClarification(')) {
          const match = code.match(/askClarification\("([^"]*)"\)/);
          const q = match?.[1] ?? 'what?';
          await (globals.askClarification as (q: string) => Promise<void>)(q);
          return 'clarification requested';
        }
        if (behavior) return behavior(code, globals as Record<string, unknown>);
        return 'executed';
      },
      patchGlobals: async () => {},
      close: () => {},
    };
  },
});

// Simple function tool used in Cases A and C
const simpleFn = {
  name: 'lookup',
  description: 'Look something up',
  parameters: {
    type: 'object' as const,
    properties: { q: { type: 'string' } },
    required: ['q'],
  },
  func: async (_args: unknown) => 'result',
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('AxAgent coordinator routing', () => {
  // -------------------------------------------------------------------------
  // Case A: contextFields + tools → two stages (ctx → task)
  // -------------------------------------------------------------------------

  describe('Case A: contextFields + tools (two-stage)', () => {
    it('routes through ctx then task stages and returns final output', async () => {
      // Track how many times each role has been called so we can distinguish
      // the ctx responder (1st Answer Synthesis Agent call) from the task
      // responder (2nd Answer Synthesis Agent call).
      let responderCallCount = 0;

      const mockAI = new AxMockAIService({
        features: { functions: false, streaming: false },
        chatResponse: async (req) => {
          const systemPrompt = String(req.chatPrompt[0]?.content ?? '');

          // Ctx actor
          if (systemPrompt.includes('Context Understanding Agent')) {
            return {
              results: [
                {
                  index: 0,
                  content:
                    'Javascript Code: final("distilled", {"evidence":"summary"})',
                  finishReason: 'stop' as const,
                },
              ],
              modelUsage: makeModelUsage(),
            };
          }

          // Task actor
          if (systemPrompt.includes('Code Generation Agent')) {
            return {
              results: [
                {
                  index: 0,
                  content: 'Javascript Code: final("done", {"answer":"42"})',
                  finishReason: 'stop' as const,
                },
              ],
              modelUsage: makeModelUsage(),
            };
          }

          if (systemPrompt.includes('Answer Synthesis Agent')) {
            responderCallCount++;
            if (responderCallCount === 1) {
              // First call: ctx responder — must emit the distilledContext field
              return {
                results: [
                  {
                    index: 0,
                    content: 'Distilled Context: {"evidence":"summary"}',
                    finishReason: 'stop' as const,
                  },
                ],
                modelUsage: makeModelUsage(),
              };
            }
            // Second call: task responder — emits the user output field
            return {
              results: [
                {
                  index: 0,
                  content: 'Answer: 42',
                  finishReason: 'stop' as const,
                },
              ],
              modelUsage: makeModelUsage(),
            };
          }

          return {
            results: [
              { index: 0, content: 'fallback', finishReason: 'stop' as const },
            ],
            modelUsage: makeModelUsage(),
          };
        },
      });

      const myAgent = agent('docText:string, query:string -> answer:string', {
        contextFields: ['docText'],
        functions: [simpleFn],
        runtime: makeRuntime(),
      });

      const result = await myAgent.forward(mockAI, {
        docText: 'The answer is 42.',
        query: 'What is the answer?',
      });

      expect(result.answer).toBe('42');
      // Two responder calls: one for ctx stage, one for task stage
      expect(responderCallCount).toBe(2);
    });

    it('ctx actor sees only context field in user input (not query)', async () => {
      const ctxActorPrompts: string[] = [];

      const mockAI = new AxMockAIService({
        features: { functions: false, streaming: false },
        chatResponse: async (req) => {
          const systemPrompt = String(req.chatPrompt[0]?.content ?? '');

          if (systemPrompt.includes('Context Understanding Agent')) {
            // Capture the full prompt to assert on field names
            for (const msg of req.chatPrompt) {
              if (msg.role === 'user') {
                ctxActorPrompts.push(String(msg.content ?? ''));
              }
            }
            return {
              results: [
                {
                  index: 0,
                  content: 'Javascript Code: final("distilled")',
                  finishReason: 'stop' as const,
                },
              ],
              modelUsage: makeModelUsage(),
            };
          }

          if (systemPrompt.includes('Answer Synthesis Agent')) {
            return {
              results: [
                {
                  index: 0,
                  content: 'Distilled Context: {}',
                  finishReason: 'stop' as const,
                },
              ],
              modelUsage: makeModelUsage(),
            };
          }

          if (systemPrompt.includes('Code Generation Agent')) {
            return {
              results: [
                {
                  index: 0,
                  content: 'Javascript Code: final("done", {"answer":"ok"})',
                  finishReason: 'stop' as const,
                },
              ],
              modelUsage: makeModelUsage(),
            };
          }

          return {
            results: [
              {
                index: 0,
                content: 'Answer: ok',
                finishReason: 'stop' as const,
              },
            ],
            modelUsage: makeModelUsage(),
          };
        },
      });

      const myAgent = agent('docText:string, query:string -> answer:string', {
        contextFields: ['docText'],
        functions: [simpleFn],
        runtime: makeRuntime(),
      });

      await myAgent.forward(mockAI, {
        docText: 'Long doc content here.',
        query: 'What is the main point?',
      });

      const allCtxPromptText = ctxActorPrompts.join('\n');
      expect(allCtxPromptText).toContain('docText');
      expect(allCtxPromptText).not.toContain('query');
    });

    it('task actor receives distilledContext in its user prompt', async () => {
      const taskActorPrompts: string[] = [];
      // Use a counter to distinguish ctx responder (call 1) from task responder (call 2)
      let responderCallCount = 0;

      const mockAI = new AxMockAIService({
        features: { functions: false, streaming: false },
        chatResponse: async (req) => {
          const systemPrompt = String(req.chatPrompt[0]?.content ?? '');

          if (systemPrompt.includes('Context Understanding Agent')) {
            return {
              results: [
                {
                  index: 0,
                  content:
                    'Javascript Code: final("distilled", {"summary":"key facts"})',
                  finishReason: 'stop' as const,
                },
              ],
              modelUsage: makeModelUsage(),
            };
          }

          if (systemPrompt.includes('Code Generation Agent')) {
            // Capture task actor user prompts
            for (const msg of req.chatPrompt) {
              if (msg.role === 'user') {
                taskActorPrompts.push(String(msg.content ?? ''));
              }
            }
            return {
              results: [
                {
                  index: 0,
                  content: 'Javascript Code: final("done", {"answer":"found"})',
                  finishReason: 'stop' as const,
                },
              ],
              modelUsage: makeModelUsage(),
            };
          }

          if (systemPrompt.includes('Answer Synthesis Agent')) {
            responderCallCount++;
            if (responderCallCount === 1) {
              // Ctx responder: emit distilledContext field
              return {
                results: [
                  {
                    index: 0,
                    content: 'Distilled Context: {"summary":"key facts"}',
                    finishReason: 'stop' as const,
                  },
                ],
                modelUsage: makeModelUsage(),
              };
            }
            // Task responder
            return {
              results: [
                {
                  index: 0,
                  content: 'Answer: found',
                  finishReason: 'stop' as const,
                },
              ],
              modelUsage: makeModelUsage(),
            };
          }

          return {
            results: [
              { index: 0, content: 'fallback', finishReason: 'stop' as const },
            ],
            modelUsage: makeModelUsage(),
          };
        },
      });

      const myAgent = agent('docText:string, query:string -> answer:string', {
        contextFields: ['docText'],
        functions: [simpleFn],
        runtime: makeRuntime(),
      });

      await myAgent.forward(mockAI, {
        docText: 'Source document.',
        query: 'Summarize.',
      });

      const allTaskPromptText = taskActorPrompts.join('\n');
      // The field `distilledContext` is rendered as "Distilled Context:" in prompts
      expect(allTaskPromptText).toContain('Distilled Context');
    });
  });

  // -------------------------------------------------------------------------
  // Case B: contextFields only (no tools) → single combined stage
  // -------------------------------------------------------------------------

  describe('Case B: contextFields only, no tools (single stage)', () => {
    it('uses single combined stage; `final(...)` routes directly to the single responder (no task actor to skip); `finalForUser` is NOT advertised', async () => {
      let ctxActorCalled = false;
      let combinedActorCalled = false;
      let combinedSystemPrompt = '';

      const mockAI = new AxMockAIService({
        features: { functions: false, streaming: false },
        chatResponse: async (req) => {
          const systemPrompt = String(req.chatPrompt[0]?.content ?? '');

          if (systemPrompt.includes('Context Understanding Agent')) {
            ctxActorCalled = true;
          }

          if (systemPrompt.includes('Code Generation Agent')) {
            combinedActorCalled = true;
            combinedSystemPrompt = systemPrompt;
            return {
              results: [
                {
                  index: 0,
                  content: 'Javascript Code: final("done", {})',
                  finishReason: 'stop' as const,
                },
              ],
              modelUsage: makeModelUsage(),
            };
          }

          if (systemPrompt.includes('Answer Synthesis Agent')) {
            return {
              results: [
                {
                  index: 0,
                  content: 'Summary: extracted',
                  finishReason: 'stop' as const,
                },
              ],
              modelUsage: makeModelUsage(),
            };
          }

          return {
            results: [
              { index: 0, content: 'fallback', finishReason: 'stop' as const },
            ],
            modelUsage: makeModelUsage(),
          };
        },
      });

      // No functions / agents — Case B
      const myAgent = agent('docText:string -> summary:string', {
        contextFields: ['docText'],
        // No functions, agents, or functionDiscovery
        runtime: makeRuntime(),
      });

      const result = await myAgent.forward(mockAI, {
        docText: 'Some long document.',
      });

      expect(result.summary).toBe('extracted');
      // Case B keeps the combined (single-stage) template — the split is not
      // activated without tools, because there would be no task actor to skip.
      expect(ctxActorCalled).toBe(false);
      expect(combinedActorCalled).toBe(true);
      // `final` and `finalForUser` would be indistinguishable here (no task
      // actor to bypass), so `finalForUser` is not advertised at all. Only
      // the canonical `final(...)` primitive shows up in the prompt, and it
      // already routes straight to the (single) responder.
      expect(combinedSystemPrompt).not.toContain('finalForUser');
      expect(combinedSystemPrompt).toContain('final(');
    });
  });

  // -------------------------------------------------------------------------
  // Case C: tools only, no contextFields → single stage
  // -------------------------------------------------------------------------

  describe('Case C: tools only, no contextFields (single stage)', () => {
    it('runs single stage with Code Generation Agent and returns output', async () => {
      const mockAI = new AxMockAIService({
        features: { functions: false, streaming: false },
        chatResponse: async (req) => {
          const systemPrompt = String(req.chatPrompt[0]?.content ?? '');

          if (systemPrompt.includes('Code Generation Agent')) {
            return {
              results: [
                {
                  index: 0,
                  content: 'Javascript Code: final("done", {"answer":"ok"})',
                  finishReason: 'stop' as const,
                },
              ],
              modelUsage: makeModelUsage(),
            };
          }

          if (systemPrompt.includes('Answer Synthesis Agent')) {
            return {
              results: [
                {
                  index: 0,
                  content: 'Answer: ok',
                  finishReason: 'stop' as const,
                },
              ],
              modelUsage: makeModelUsage(),
            };
          }

          return {
            results: [
              { index: 0, content: 'fallback', finishReason: 'stop' as const },
            ],
            modelUsage: makeModelUsage(),
          };
        },
      });

      const myAgent = agent('query:string -> answer:string', {
        // No contextFields
        functions: [simpleFn],
        runtime: makeRuntime(),
      });

      const result = await myAgent.forward(mockAI, { query: 'What is 6 * 7?' });
      expect(result.answer).toBe('ok');
    });
  });

  // -------------------------------------------------------------------------
  // Case D: neither contextFields nor tools → single stage
  // -------------------------------------------------------------------------

  describe('Case D: no contextFields, no tools (single stage)', () => {
    it('runs single stage and returns output', async () => {
      const mockAI = new AxMockAIService({
        features: { functions: false, streaming: false },
        chatResponse: async (req) => {
          const systemPrompt = String(req.chatPrompt[0]?.content ?? '');

          if (systemPrompt.includes('Code Generation Agent')) {
            return {
              results: [
                {
                  index: 0,
                  content: 'Javascript Code: final("done", {})',
                  finishReason: 'stop' as const,
                },
              ],
              modelUsage: makeModelUsage(),
            };
          }

          if (systemPrompt.includes('Answer Synthesis Agent')) {
            return {
              results: [
                {
                  index: 0,
                  content: 'Answer: 42',
                  finishReason: 'stop' as const,
                },
              ],
              modelUsage: makeModelUsage(),
            };
          }

          return {
            results: [
              { index: 0, content: 'fallback', finishReason: 'stop' as const },
            ],
            modelUsage: makeModelUsage(),
          };
        },
      });

      const myAgent = agent('query:string -> answer:string', {
        // No contextFields, no functions
        runtime: makeRuntime(),
      });

      const result = await myAgent.forward(mockAI, { query: 'Anything?' });
      expect(result.answer).toBe('42');
    });
  });

  // -------------------------------------------------------------------------
  // getFunction()
  // -------------------------------------------------------------------------

  describe('getFunction()', () => {
    it('returns a valid function descriptor when agentIdentity is set', async () => {
      const mockAI = new AxMockAIService({
        features: { functions: false, streaming: false },
        chatResponse: async (req) => {
          const systemPrompt = String(req.chatPrompt[0]?.content ?? '');

          if (systemPrompt.includes('Code Generation Agent')) {
            return {
              results: [
                {
                  index: 0,
                  content: 'Javascript Code: final("done", {"answer":"ok"})',
                  finishReason: 'stop' as const,
                },
              ],
              modelUsage: makeModelUsage(),
            };
          }

          return {
            results: [
              {
                index: 0,
                content: 'Answer: ok',
                finishReason: 'stop' as const,
              },
            ],
            modelUsage: makeModelUsage(),
          };
        },
      });

      const myAgent = new AxAgent(
        {
          signature: 'query:string -> answer:string',
          agentIdentity: { name: 'My Helper', description: 'helps' },
        },
        {
          contextFields: [],
          runtime: makeRuntime(),
        }
      );

      const fn = myAgent.getFunction();
      expect(fn).toHaveProperty('name');
      expect(fn).toHaveProperty('description');
      expect(fn).toHaveProperty('parameters');
      expect(fn).toHaveProperty('func');
      expect(typeof fn.func).toBe('function');

      // Calling func should resolve without throwing
      await expect(
        fn.func({ query: 'test' }, { ai: mockAI })
      ).resolves.toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // applyOptimization
  // -------------------------------------------------------------------------

  describe('applyOptimization()', () => {
    it('does not throw when called on a Case A agent (smoke test)', () => {
      const myAgent = agent('docText:string, query:string -> answer:string', {
        contextFields: ['docText'],
        functions: [simpleFn],
        runtime: makeRuntime(),
      });

      expect(() => myAgent.applyOptimization({})).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Case A: clarification from ctx stage surfaces AxAgentClarificationError
  // -------------------------------------------------------------------------

  describe('clarification from ctx stage', () => {
    it('rejects with AxAgentClarificationError when ctx actor calls askClarification', async () => {
      const mockAI = new AxMockAIService({
        features: { functions: false, streaming: false },
        chatResponse: async (req) => {
          const systemPrompt = String(req.chatPrompt[0]?.content ?? '');

          if (systemPrompt.includes('Context Understanding Agent')) {
            return {
              results: [
                {
                  index: 0,
                  content: 'Javascript Code: askClarification("what format?")',
                  finishReason: 'stop' as const,
                },
              ],
              modelUsage: makeModelUsage(),
            };
          }

          // Responder / task actor fall-through — should not be reached
          return {
            results: [
              {
                index: 0,
                content: 'Answer: never',
                finishReason: 'stop' as const,
              },
            ],
            modelUsage: makeModelUsage(),
          };
        },
      });

      const myAgent = agent('docText:string, query:string -> answer:string', {
        contextFields: ['docText'],
        functions: [simpleFn],
        runtime: makeRuntime(),
      });

      await expect(
        myAgent.forward(mockAI, {
          docText: 'Some text.',
          query: 'A question.',
        })
      ).rejects.toBeInstanceOf(AxAgentClarificationError);
    });
  });

  // -------------------------------------------------------------------------
  // Case A: finalForUser short-circuit
  // -------------------------------------------------------------------------

  describe('finalForUser short-circuit from ctx stage', () => {
    it('skips ctx responder + task actor and routes the task responder directly', async () => {
      let ctxActorCalls = 0;
      let ctxResponderCalls = 0;
      let taskActorCalls = 0;
      let taskResponderCalls = 0;
      let taskResponderSawShortCircuit = false;

      const mockAI = new AxMockAIService({
        features: { functions: false, streaming: false },
        chatResponse: async (req) => {
          const systemPrompt = String(req.chatPrompt[0]?.content ?? '');

          if (systemPrompt.includes('Context Understanding Agent')) {
            ctxActorCalls++;
            return {
              results: [
                {
                  index: 0,
                  content:
                    'Javascript Code: finalForUser("deliver answer", {"evidence":"the answer is 42"})',
                  finishReason: 'stop' as const,
                },
              ],
              modelUsage: makeModelUsage(),
            };
          }

          if (systemPrompt.includes('Code Generation Agent')) {
            taskActorCalls++;
            return {
              results: [
                {
                  index: 0,
                  content: 'Javascript Code: final("should not run")',
                  finishReason: 'stop' as const,
                },
              ],
              modelUsage: makeModelUsage(),
            };
          }

          if (systemPrompt.includes('Answer Synthesis Agent')) {
            // Split ctx vs task by inspecting whether the responder was
            // asked to emit `distilledContext` (ctx) or user output (`answer`).
            const isCtx = systemPrompt.includes('distilledContext');
            if (isCtx) {
              ctxResponderCalls++;
              return {
                results: [
                  {
                    index: 0,
                    content: 'Distilled Context: {"evidence":"x"}',
                    finishReason: 'stop' as const,
                  },
                ],
                modelUsage: makeModelUsage(),
              };
            }
            taskResponderCalls++;
            const userMsg = req.chatPrompt.find((m) => m.role === 'user');
            if (
              typeof userMsg?.content === 'string' &&
              userMsg.content.includes('deliver answer')
            ) {
              taskResponderSawShortCircuit = true;
            }
            return {
              results: [
                {
                  index: 0,
                  content: 'Answer: 42',
                  finishReason: 'stop' as const,
                },
              ],
              modelUsage: makeModelUsage(),
            };
          }

          return {
            results: [
              { index: 0, content: 'fallback', finishReason: 'stop' as const },
            ],
            modelUsage: makeModelUsage(),
          };
        },
      });

      const myAgent = agent('docText:string, query:string -> answer:string', {
        contextFields: ['docText'],
        functions: [simpleFn],
        runtime: makeRuntime(),
      });

      const result = await myAgent.forward(mockAI, {
        docText: 'The answer is 42.',
        query: 'What is the answer?',
      });

      expect(result.answer).toBe('42');
      // ctx actor must run (it produced the short-circuit), task responder
      // must run (it emits the user output). ctx responder and task actor
      // must be fully skipped.
      expect(ctxActorCalls).toBe(1);
      expect(ctxResponderCalls).toBe(0);
      expect(taskActorCalls).toBe(0);
      expect(taskResponderCalls).toBe(1);
      expect(taskResponderSawShortCircuit).toBe(true);
    });

    it('advertises finalForUser in the ctx actor prompt (Case A only)', async () => {
      let ctxSystemPrompt = '';

      const mockAI = new AxMockAIService({
        features: { functions: false, streaming: false },
        chatResponse: async (req) => {
          const systemPrompt = String(req.chatPrompt[0]?.content ?? '');
          if (systemPrompt.includes('Context Understanding Agent')) {
            ctxSystemPrompt = systemPrompt;
            return {
              results: [
                {
                  index: 0,
                  content: 'Javascript Code: final("distilled")',
                  finishReason: 'stop' as const,
                },
              ],
              modelUsage: makeModelUsage(),
            };
          }
          if (systemPrompt.includes('Code Generation Agent')) {
            return {
              results: [
                {
                  index: 0,
                  content: 'Javascript Code: final("done", {"answer":"ok"})',
                  finishReason: 'stop' as const,
                },
              ],
              modelUsage: makeModelUsage(),
            };
          }
          return {
            results: [
              {
                index: 0,
                content: 'Distilled Context: {}',
                finishReason: 'stop' as const,
              },
            ],
            modelUsage: makeModelUsage(),
          };
        },
      });

      const myAgent = agent('docText:string, query:string -> answer:string', {
        contextFields: ['docText'],
        functions: [simpleFn],
        runtime: makeRuntime(),
      });

      await myAgent.forward(mockAI, {
        docText: 'x',
        query: 'y',
      });

      expect(ctxSystemPrompt).toContain('finalForUser');
    });
  });

  // -------------------------------------------------------------------------
  // Stage D: strict knob routing — task-only knobs never reach ctxAgent
  // -------------------------------------------------------------------------

  describe('strict knob routing (Stage D)', () => {
    it('task-only knobs (functions, agents, functionDiscovery, mode) never reach ctxAgent', () => {
      const childAgent = agent('inputText:string -> outputText:string', {
        agentIdentity: { name: 'childAgent', description: 'child' },
        runtime: makeRuntime(),
      });

      const a = agent(
        'docText:string, query:string -> answer:string',
        {
          contextFields: ['docText'],
          functions: [simpleFn],
          agents: [childAgent],
          functionDiscovery: true,
          
          runtime: makeRuntime(),
        }
      );
      const coord = a as any;

      // ctxAgent exists (Case A) and must not see task-only knobs
      expect(coord.ctxAgent).toBeDefined();
      expect(coord.ctxAgent.agentFunctions ?? []).toEqual([]);
      expect(coord.ctxAgent.agents ?? []).toEqual([]);
      expect(coord.ctxAgent.functionDiscoveryEnabled).toBe(false);

      // taskAgent must see everything
      expect(coord.taskAgent.agentFunctions.length).toBeGreaterThan(0);
      expect(coord.taskAgent.agents?.length ?? 0).toBeGreaterThan(0);
      expect(coord.taskAgent.functionDiscoveryEnabled).toBe(true);
    });

    it('top-level maxTurns applies to taskAgent; contextOptions.maxTurns overrides on ctxAgent', () => {
      const a = agent(
        'docText:string, query:string -> answer:string',
        {
          contextFields: ['docText'],
          functions: [simpleFn],
          maxTurns: 10,
          contextOptions: { maxTurns: 3 },
          runtime: makeRuntime(),
        }
      );
      const coord = a as any;

      expect(coord.ctxAgent._genOptions.maxTurns).toBe(3);
      expect(coord.taskAgent._genOptions.maxTurns).toBe(10);
    });

    it('top-level maxTurns is shared to ctxAgent when no contextOptions override is set', () => {
      const a = agent(
        'docText:string, query:string -> answer:string',
        {
          contextFields: ['docText'],
          functions: [simpleFn],
          maxTurns: 7,
          runtime: makeRuntime(),
        }
      );
      const coord = a as any;

      expect(coord.ctxAgent._genOptions.maxTurns).toBe(7);
      expect(coord.taskAgent._genOptions.maxTurns).toBe(7);
    });
  });
});
