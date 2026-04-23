import { describe, expect, it } from 'vitest';

import { agent } from './index.js';

describe('AxAgent coordinator optimization routing (Case A)', () => {
  it('applyOptimization targets the task agent in a contextFields+tools setup', () => {
    // Case A coordinator: contextFields + tools → two internal agents (ctx + task).
    // applyOptimization must forward to the primaryAgent (taskAgent), not ctxAgent.
    // namedPrograms() now aggregates both stages with ctx.*/task.* prefixes.
    const caseAAgent = agent('docText:string, query:string -> answer:string', {
      contextFields: ['docText'],
      functions: [
        {
          name: 'search',
          namespace: 'kb',
          description: 'search',
          parameters: { type: 'object', properties: {}, required: [] },
          func: async () => 'result',
        },
      ],
    });

    const programs = caseAAgent.namedPrograms();
    // Case A: both ctx and task programs are exposed with prefixes.
    expect(programs.length).toBeGreaterThan(0);
    const ids = programs.map((p) => p.id);
    // Prefixed actor and responder IDs exist for both stages
    expect(ids.some((id) => id.includes('actor'))).toBe(true);
    expect(ids.some((id) => id.includes('responder'))).toBe(true);
    // Task-stage programs are present (applyOptimization targets them)
    expect(ids.some((id) => id.startsWith('task.'))).toBe(true);
    expect(ids.some((id) => id.startsWith('ctx.'))).toBe(true);
  });

  it('Case A namedPrograms() aggregates ctx and task programs with prefixes', () => {
    // namedPrograms() in Case A returns programs from BOTH ctxAgent and taskAgent,
    // each prefixed with 'ctx.' or 'task.'. The user's output field 'answer' lives
    // in the task.responder signature, not the ctx.responder signature
    // (ctx.responder outputs 'distilledContext').
    const caseAAgent = agent('document:string, query:string -> answer:string', {
      contextFields: ['document'],
      functions: [
        {
          name: 'fn',
          namespace: 'tools',
          description: 'fn',
          parameters: { type: 'object', properties: {}, required: [] },
          func: async () => 'ok',
        },
      ],
    });

    const programs = caseAAgent.namedPrograms();
    // Both stages present — IDs are prefixed ctx.<uid>.actor etc.
    expect(programs.some((p) => p.id.startsWith('ctx.'))).toBe(true);
    expect(programs.some((p) => p.id.startsWith('task.'))).toBe(true);
    // Actor and responder in both stages (IDs include the stage keyword)
    expect(
      programs.some((p) => p.id.startsWith('ctx.') && p.id.includes('actor'))
    ).toBe(true);
    expect(
      programs.some(
        (p) => p.id.startsWith('ctx.') && p.id.includes('responder')
      )
    ).toBe(true);
    expect(
      programs.some((p) => p.id.startsWith('task.') && p.id.includes('actor'))
    ).toBe(true);
    expect(
      programs.some(
        (p) => p.id.startsWith('task.') && p.id.includes('responder')
      )
    ).toBe(true);
    // The user's output field 'answer' is in the task.responder signature;
    // the ctx.responder outputs 'distilledContext' instead.
    const taskResponderSig =
      programs.find(
        (p) => p.id.startsWith('task.') && p.id.includes('responder')
      )?.signature ?? '';
    expect(taskResponderSig).toContain('answer');
    const ctxResponderSig =
      programs.find(
        (p) => p.id.startsWith('ctx.') && p.id.includes('responder')
      )?.signature ?? '';
    expect(ctxResponderSig).toContain('distilledContext');
  });

  it('Case C namedPrograms() match pre-split baseline (no ctxAgent, no prefixes)', () => {
    // Case C: tools only, no contextFields — single taskAgent, same as old AxAgent.
    // No ctx.* prefixes; program IDs are returned verbatim.
    const caseAAgent = agent('query:string -> answer:string', {
      functions: [
        {
          name: 'fn',
          namespace: 'tools',
          description: 'fn',
          parameters: { type: 'object', properties: {}, required: [] },
          func: async () => 'ok',
        },
      ],
    });

    const caseC = agent('query:string -> answer:string', {});

    // Both should expose the same number of named programs (actor + responder).
    expect(caseAAgent.namedPrograms().length).toBe(
      caseC.namedPrograms().length
    );
    // No ctx./task. stage prefixes in Case C — IDs are the raw agent-scoped names
    const ids = caseAAgent.namedPrograms().map((p) => p.id);
    expect(
      ids.every((id) => !id.startsWith('ctx.') && !id.startsWith('task.'))
    ).toBe(true);
    expect(ids.some((id) => id.includes('actor'))).toBe(true);
    expect(ids.some((id) => id.includes('responder'))).toBe(true);
  });
});
