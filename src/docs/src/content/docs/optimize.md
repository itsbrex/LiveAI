---
title: "Optimization Guide"
description: "Optimize Ax programs and agents with bootstrap demos, GEPA, and browser-safe artifacts"
---

# Optimization Guide

Ax optimization now centers on two ideas:

- `AxBootstrapFewShot` for quickly selecting strong demonstrations
- `AxGEPA` for refining program components like instructions, descriptions, and tool metadata

For agents, the easiest entry point is usually `agent.optimize(...)`, which defaults to actor optimization and uses the built-in LLM judge when you do not provide a custom metric.

## Start with `agent.optimize(...)`

Most agent users can begin with a small task set:

```typescript
const tasks = [
  {
    input: { query: 'Help Acme with the current checkout incident.' },
    criteria:
      'Look up the account, inspect the incident, and return the current workaround with urgent priority.',
    expectedActions: ['support.lookupAccount', 'support.lookupIncident'],
  },
];

const result = await assistant.optimize(tasks, {
  bootstrap: true,
});

assistant.applyOptimization(result.optimizedProgram!);
```

What Ax does by default:

- optimizes the actor path first
- uses the built-in LLM judge if you omit `metric`
- treats a plain task array as training data
- saves bootstrap demos inside the resulting optimized artifact

## Save and Load Optimized Artifacts

Artifacts are plain JSON-safe values, so you can store them in files, a database, `localStorage`, or `IndexedDB`:

```typescript
import {
  axDeserializeOptimizedProgram,
  axSerializeOptimizedProgram,
} from '@ax-llm/ax';

const saved = axSerializeOptimizedProgram(result.optimizedProgram!);
const restored = axDeserializeOptimizedProgram(saved);

assistant.applyOptimization(restored);
```

V1 persists the selected demos and optimized component values. Raw failed traces and reflective datasets stay runtime-only.

## `AxBootstrapFewShot`

Use bootstrap few-shot when you want a quick improvement from a small example set.

```typescript
import { AxBootstrapFewShot, ai, ax } from '@ax-llm/ax';

const llm = ai({
  name: 'openai',
  apiKey: process.env.OPENAI_APIKEY!,
});

const classifier = ax(
  'review:string -> sentiment:class "positive, negative, neutral"'
);

const examples = [
  { review: 'I love this.', sentiment: 'positive' },
  { review: 'This is awful.', sentiment: 'negative' },
  { review: 'It is okay.', sentiment: 'neutral' },
];

const metric = ({ prediction, example }) =>
  prediction.sentiment === example.sentiment ? 1 : 0;

const optimizer = new AxBootstrapFewShot({
  studentAI: llm,
  examples,
});

const result = await optimizer.compile(classifier, examples, metric, {
  maxDemos: 4,
});

classifier.applyOptimization(result.optimizedProgram!);
```

Reach for bootstrap few-shot when:

- the main win comes from better demonstrations
- you want a small, cheap optimization pass
- your task is stable and easy to score

## `AxGEPA`

Use GEPA when you want Ax to evolve the strings that shape program behavior.

```typescript
import { AxGEPA, ai, ax } from '@ax-llm/ax';

const llm = ai({
  name: 'openai',
  apiKey: process.env.OPENAI_APIKEY!,
});

const generator = ax(
  'ticket:string -> priority:class "low, normal, urgent", rationale:string'
);

const examples = [
  { ticket: 'Checkout is down for all EU users.', priority: 'urgent' },
  { ticket: 'Change the footer logo.', priority: 'low' },
];

const metric = ({ prediction, example }) =>
  prediction.priority === example.priority ? 1 : 0;

const optimizer = new AxGEPA({
  studentAI: llm,
});

const result = await optimizer.compile(generator, examples, metric, {
  bootstrap: true,
  maxMetricCalls: 24,
});

generator.applyOptimization(result.optimizedProgram!);
```

GEPA is a good fit when:

- you want to optimize instructions, descriptions, or tool metadata
- you have realistic eval tasks
- you care about artifact persistence and reload
- you want optional bootstrap demos before reflective optimization starts

## Bootstrap Behavior

When you pass `bootstrap: true`, Ax first runs the current program on the provided training tasks and turns only successful, high-scoring runs into demos.

That means:

- good runs can become demos
- bad runs never become demos
- failed runs still help GEPA as reflection evidence during the same optimization run

Bootstrap in v1 works only from the tasks you provide. It does not synthesize new tasks.

## Metrics and Judges

For plain programs, you typically pass a metric:

```typescript
const metric = ({ prediction, example }) =>
  prediction.answer === example.answer ? 1 : 0;
```

For agents, you can usually omit it and rely on the built-in judge, as long as your tasks include strong `criteria` and, when useful, `expectedActions` or `expectedOutput`.

Add `judgeAI` when you want a stronger or separate judge model:

```typescript
const result = await assistant.optimize(tasks, {
  judgeAI,
  bootstrap: true,
});
```

## Choosing the Right Optimizer

Use `AxBootstrapFewShot` when:

- you want quick few-shot improvements
- the problem is mostly solved by better demos

Use `AxGEPA` when:

- you want to optimize instructions or other component strings
- you want bootstrap plus reflective search
- you want to save and reload optimized artifacts cleanly

Use `agent.optimize(...)` when:

- you are tuning an `AxAgent`
- you want sensible defaults for target selection and judging
- you want the simplest path from eval tasks to a reusable artifact

## Practical Tips

- Keep task sets realistic. Tiny or overly clean examples can make optimization look better than it is.
- Hold out at least one or two tasks to sanity-check generalization.
- Prefer clear `criteria` over vague judging instructions.
- Persist optimized artifacts with `axSerializeOptimizedProgram(...)`, not ad hoc copies of individual fields.
- Treat bootstrap demos as a starting point, not a guarantee that the optimized program is globally better.

## Examples

- `src/examples/axagent-gepa-optimization.ts`
- `src/examples/gepa.ts`
- `src/examples/gepa-flow.ts`
- `src/examples/gepa-quality-vs-speed-optimization.ts`
- `src/examples/simple-optimizer-test.ts`
