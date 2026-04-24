import { describe, expect, it, vi } from 'vitest';

import type { AxAIService } from '../ai/types.js';

import type { AxOptimizer } from './optimizer.js';
import { AxBootstrapFewShot } from './optimizers/bootstrapFewshot.js';
import { AxACE } from './optimizers/ace.js';
import { f } from './sig.js';
import { ax } from './template.js';

// Mock dependencies
const mockAI = {
  name: 'mock',
  chat: async () => ({
    results: [
      {
        index: 0,
        content: JSON.stringify({
          answer: 'mock student response',
        }),
      },
    ],
  }),
  getOptions: () => ({ tracer: undefined }),
  getLogger: () => undefined,
} as unknown as AxAIService;

const mockExamples = [
  { input: 'test input', output: 'test output' },
  { input: 'test input 2', output: 'test output 2' },
];

describe('AxACE', () => {
  it('should call runCurator with the correct context', async () => {
    const ace = new AxACE({
      studentAI: mockAI,
    });

    const runCuratorSpy = vi
      .spyOn(ace as any, 'runCurator')
      .mockResolvedValue(undefined);

    const program = ax(
      f().input('question', f.string()).output('answer', f.string()).build()
    );
    const examples = [
      { question: 'q1', answer: 'a1' },
      { question: 'q2', answer: 'a2' },
    ];
    const metricFn = () => 1;

    await ace.compile(program, examples, metricFn, {
      aceOptions: { maxEpochs: 1, maxReflectorRounds: 1 },
    });

    expect(runCuratorSpy).toHaveBeenCalled();
    const curatorCall = runCuratorSpy.mock.calls[0][0];
    expect(curatorCall.example).toHaveProperty('question');
    expect(curatorCall.example).toHaveProperty('answer');
  });
});

describe('Optimizer Interface', () => {
  it('AxBootstrapFewShot implements AxOptimizer interface', () => {
    const optimizer = new AxBootstrapFewShot({
      studentAI: mockAI,
      examples: mockExamples,
    });

    // TypeScript check - this should compile without errors
    const typedOptimizer: AxOptimizer = optimizer;

    expect(typedOptimizer).toBeDefined();
    expect(typeof typedOptimizer.compile).toBe('function');
    expect(typeof typedOptimizer.getStats).toBe('function');
  });

  it('bootstrap optimizer has a compatible compile method signature', () => {
    const bootstrap = new AxBootstrapFewShot({
      studentAI: mockAI,
      examples: mockExamples,
    });

    const optimizers: AxOptimizer[] = [bootstrap];

    expect(optimizers).toHaveLength(1);
    expect(typeof bootstrap.compile).toBe('function');
    expect(bootstrap.compile).toHaveLength(4);
  });

  it('bootstrap optimizer supports getStats', () => {
    const bootstrap = new AxBootstrapFewShot({
      studentAI: mockAI,
      examples: mockExamples,
    });

    const bootstrapStats = bootstrap.getStats();

    expect(bootstrapStats !== null).toBe(true);
  });
});
