import { describe, expect, it } from 'vitest';
import { AxMockAIService } from '../ai/mock/api.js';
import type { AxFunction } from '../ai/types.js';
import { AxGen } from './generate.js';
import type { AxFunctionCallTrace } from './types.js';

describe('AxGen onFunctionCall hook', () => {
  it('fires for successful function calls without breaking generation', async () => {
    const traces: AxFunctionCallTrace[] = [];
    const fn: AxFunction = {
      name: 'lookup_user',
      description: 'Lookup a user',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      func: async ({ id }: any) => ({ name: `user-${id}` }),
    };

    let callCount = 0;
    const ai = new AxMockAIService({
      features: { functions: true, streaming: false },
      chatResponse: async () => {
        callCount++;
        if (callCount === 1) {
          return {
            results: [
              {
                index: 0,
                content: '',
                finishReason: 'stop' as const,
                functionCalls: [
                  {
                    id: 'call_1',
                    type: 'function' as const,
                    function: {
                      name: 'lookup_user',
                      params: { id: '42' },
                    },
                  },
                ],
              },
            ],
          };
        }
        return {
          results: [
            {
              index: 0,
              content: 'answer: done',
              finishReason: 'stop' as const,
            },
          ],
        };
      },
    });

    const gen = new AxGen<{ query: string }, { answer: string }>(
      'query:string -> answer:string',
      { functions: [fn] }
    );

    await gen.forward(
      ai,
      { query: 'q' },
      { onFunctionCall: (call) => traces.push({ ...call }) }
    );

    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({
      fn: 'lookup_user',
      componentId: 'lookup_user',
      args: { id: '42' },
      ok: true,
    });
    expect(traces[0]?.ms).toBeGreaterThanOrEqual(0);
  });

  it('swallows hook errors', async () => {
    const fn: AxFunction = {
      name: 'lookup_user',
      description: 'Lookup a user',
      parameters: { type: 'object', properties: {} },
      func: async () => 'ok',
    };

    let callCount = 0;
    const ai = new AxMockAIService({
      features: { functions: true, streaming: false },
      chatResponse: async () => {
        callCount++;
        if (callCount === 1) {
          return {
            results: [
              {
                index: 0,
                content: '',
                finishReason: 'stop' as const,
                functionCalls: [
                  {
                    id: 'call_1',
                    type: 'function' as const,
                    function: { name: 'lookup_user', params: {} },
                  },
                ],
              },
            ],
          };
        }
        return {
          results: [
            {
              index: 0,
              content: 'answer: done',
              finishReason: 'stop' as const,
            },
          ],
        };
      },
    });

    const gen = new AxGen<{ query: string }, { answer: string }>(
      'query:string -> answer:string',
      { functions: [fn] }
    );

    await expect(
      gen.forward(
        ai,
        { query: 'q' },
        {
          onFunctionCall: () => {
            throw new Error('hook failed');
          },
        }
      )
    ).resolves.toMatchObject({ answer: 'answer: done' });
  });
});
