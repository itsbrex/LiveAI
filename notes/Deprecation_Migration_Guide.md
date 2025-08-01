# Ax Framework Deprecation and Migration Guide

**Date**: January 29, 2025\
**Version**: 13.0.24+\
**Status**: Active Deprecations

## Overview

This document outlines the deprecation strategy for the Ax framework to improve
type safety and API consistency. The goal is to migrate from constructor-based
and template literal approaches to factory function-based and string-based
approaches that provide better TypeScript type inference.

## Summary of Changes

### ✅ **New Recommended Patterns**

1. **AxAI Factory Function**: `ai()` - **The recommended** shorthand factory
   function
2. **AxSignature Factory**: `AxSignature.create()` - Type-safe factory method
3. **String-based Signatures**: String literals with `AxSignature.create()` -
   Type-safe and clean
4. **Agent Factory Function**: `agent()` - **The recommended** shorthand factory
   function

### ❌ **Deprecated Patterns**

1. **Constructors**: `new AxAI()`, `new AxSignature()`, `new Agent()` - Not
   type-safe
2. **Template Literals**: ``ax```,``s``` with interpolation - Not type-safe
3. **Field Helpers**: `f.string()`, `f.class()`, etc. - Not type-safe
4. **AxMessage**: Current structure - Will be replaced with new design

## Migration Guide

### 1. AxAI Instance Creation

```typescript
// ❌ DEPRECATED: Constructor (will be removed)
const ai = new AxAI({
  name: "openai",
  apiKey: process.env.OPENAI_APIKEY!,
});

// ✅ RECOMMENDED: Shorthand factory function
const llm = ai({
  name: "openai",
  apiKey: process.env.OPENAI_APIKEY!,
});
```

**Note**: We recommend using `const llm` instead of `const ai` to avoid naming
conflicts with the `ai()` factory function.

### 2. AxSignature Creation

```typescript
// ❌ DEPRECATED: Constructor (will be removed)
const sig = new AxSignature("userInput:string -> responseText:string");

// ❌ DEPRECATED: String function (will be removed)
const sig = s("userInput:string -> responseText:string");

// ✅ RECOMMENDED: Factory method (type-safe)
const sig = AxSignature.create("userInput:string -> responseText:string");
```

### 3. Complex Signatures with Descriptions and Types

```typescript
// ❌ DEPRECATED: Template literals with field helpers (will be removed)
const sig = s`
  userInput:${f.string("User question")} -> 
  responseText:${f.string("AI response")},
  confidence:${f.number("Confidence score")},
  category:${f.class(["positive", "negative", "neutral"], "Sentiment")}
`;

// ✅ RECOMMENDED: String-based signature (type-safe and clean)
const sig = AxSignature.create(`
  userInput:string "User question" -> 
  responseText:string "AI response",
  confidence:number "Confidence score", 
  category:class "positive, negative, neutral" "Sentiment"
`);
```

### 4. AxGen (Generator) Creation

```typescript
// ❌ DEPRECATED: Template literal generators (will be removed)
const gen = ax`userInput:${f.string()} -> responseText:${f.string()}`;

// ❌ DEPRECATED: String-based ax function (will be removed)
const gen = ax("userInput:string -> responseText:string");

// ✅ RECOMMENDED: AxGen with string-based signature (type-safe)
const gen = new AxGen(
  AxSignature.create("userInput:string -> responseText:string"),
);
```

### 5. Agent Creation

```typescript
// ❌ DEPRECATED: Constructor (will be removed)
const agent = new Agent({
  name: "myAgent",
  signature: AxSignature.create("input:string -> output:string"),
  llm: ai({ name: "openai", apiKey: process.env.OPENAI_APIKEY! }),
});

// ✅ RECOMMENDED: Factory function (type-safe)
const agent = agent({
  name: "myAgent",
  signature: AxSignature.create("input:string -> output:string"),
  llm: ai({ name: "openai", apiKey: process.env.OPENAI_APIKEY! }),
});
```

**Note**: We recommend using `const agentInstance` instead of `const agent` to
avoid naming conflicts with the `agent()` factory function.

### 6. AxMessage Structure

```typescript
// ❌ DEPRECATED: Current AxMessage structure (will be replaced)
type AxMessage<IN> =
  | { role: 'user'; values: IN }
  | { role: 'assistant'; values: IN };

// ⚠️  TRANSITIONAL: New design will be introduced in v14.x
// Details will be provided when the new design is ready
```

**Migration Timeline:**
- **v14.0.0+**: Deprecation warnings (current)
- **v14.x**: New message design introduced alongside existing
- **v15.0.0**: Complete replacement with new design

### 7. Field Types in String Signatures

| Old (Deprecated)              | New (Recommended)               |
| ----------------------------- | ------------------------------- |
| `f.string('desc')`            | `fieldName:string "desc"`       |
| `f.number('desc')`            | `fieldName:number "desc"`       |
| `f.boolean('desc')`           | `fieldName:boolean "desc"`      |
| `f.json('desc')`              | `fieldName:json "desc"`         |
| `f.array(f.string())`         | `fieldName:string[]`            |
| `f.optional(f.string())`      | `fieldName?:string`             |
| `f.class(['a', 'b'], 'desc')` | `fieldName:class "a, b" "desc"` |
| `f.date('desc')`              | `fieldName:date "desc"`         |
| `f.datetime('desc')`          | `fieldName:datetime "desc"`     |
| `f.image('desc')`             | `fieldName:image "desc"`        |
| `f.audio('desc')`             | `fieldName:audio "desc"`        |
| `f.file('desc')`              | `fieldName:file "desc"`         |
| `f.url('desc')`               | `fieldName:url "desc"`          |
| `f.code('lang', 'desc')`      | `fieldName:code "desc"`         |

## Benefits of Migration

### 1. **Better Type Safety**

- Compile-time type checking for field names and types
- Automatic TypeScript inference for input/output types
- Reduces runtime errors from typos or incorrect configurations

### 2. **Improved Developer Experience**

- Better IntelliSense and auto-completion
- Clearer error messages
- More consistent API patterns
- Shorter, more concise syntax with `ai()` function

### 3. **Cleaner Code**

- Removes verbose helper function calls
- More readable signature definitions
- Standard string-based format across all use cases
- Shorter variable names (`llm` vs longer descriptive names)

### 4. **Performance Benefits**

- No runtime overhead from template literal processing
- Faster signature parsing
- Reduced bundle size
- Optimized factory function with better performance

## Timeline and Deprecation Strategy

### Phase 1: Deprecation Warnings (Current - v13.0.24+)

- All deprecated patterns now show `@deprecated` warnings in TypeScript
- Documentation updated with migration examples
- New recommended patterns are fully available

### Phase 2: Enhanced Warnings (v14.0.0)

- Runtime console warnings for deprecated usage
- Additional tooling to detect deprecated patterns

### Phase 3: Breaking Changes (v15.0.0)

- Complete removal of deprecated constructors
- Removal of template literal support
- Removal of `f` helper functions
- Complete replacement of AxMessage with new design

## Migration Tools and Support

### Automated Migration Script

```bash
# Future: Automated migration tool (planned for v14.0.0)
npx @ax-llm/migrate-signatures ./src
```

### TypeScript Configuration

```json
// Enable strict mode to catch deprecated usage
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "exactOptionalPropertyTypes": true
  }
}
```

### ESLint Rules

```json
// Planned: ESLint rules to detect deprecated patterns
{
  "rules": {
    "@ax-llm/no-deprecated-constructors": "error",
    "@ax-llm/no-template-literals": "error",
    "@ax-llm/no-field-helpers": "warn"
  }
}
```

## Testing Your Migration

### Unit Tests

```typescript
import { agent, ai, AxAI, AxSignature } from "@ax-llm/ax";

describe("Migration Tests", () => {
  it("should use new factory functions", () => {
    // Test AxAI factory (use 'llm' to avoid naming conflict)
    const llm = ai({ name: "openai", apiKey: "test" });
    expect(llm).toBeInstanceOf(AxAI);

    // Test AxSignature factory
    const sig = AxSignature.create("input:string -> output:string");
    expect(sig.getInputFields()).toHaveLength(1);
    expect(sig.getOutputFields()).toHaveLength(1);

    // Test Agent factory (use 'agentInstance' to avoid naming conflict)
    const agentInstance = agent({
      name: "testAgent",
      signature: sig,
      llm: llm,
    });
    expect(agentInstance).toBeInstanceOf(Agent);
  });
});
```

### Type Safety Verification

```typescript
// This should provide full TypeScript inference
const sig = AxSignature.create(
  "userInput:string -> responseText:string, score:number",
);
const gen = new AxGen(sig);

// Create AI instance with new factory function
const llm = ai({ name: "openai", apiKey: "test" });

// TypeScript knows the exact input/output types
const result = await gen.forward(llm, {
  userInput: "test", // TypeScript enforces this field exists and is string
});

// TypeScript knows result has responseText:string and score:number
console.log(result.responseText, result.score);

// Create Agent with new factory function
const agentInstance = agent({
  name: "testAgent",
  signature: sig,
  llm: llm,
});

// TypeScript enforces correct input types for agent calls
const agentResult = await agentInstance.forward({
  userInput: "test", // TypeScript enforces this field exists and is string
});

// TypeScript knows agentResult has responseText:string and score:number
console.log(agentResult.responseText, agentResult.score);
```

## Common Migration Issues

### 1. Complex Template Literals

**Problem**: Converting complex nested template literals

```typescript
// Old complex pattern
const sig = s`
  ${createField("userInput", f.string("User question"))} ->
  ${createField("response", f.optional(f.array(f.string())))}
`;
```

**Solution**: Use string-based syntax

```typescript
// New clean pattern
const sig = AxSignature.create(`
  userInput:string "User question" ->
  response?:string[] "Optional array response"
`);
```

### 2. Dynamic Field Creation

**Problem**: Runtime field generation

```typescript
// Old dynamic pattern
const fields = ["field1", "field2"].map((name) =>
  createField(name, f.string())
);
```

**Solution**: Use AxSignature methods for dynamic creation

```typescript
// New dynamic pattern
let sig = AxSignature.create("placeholder:string -> output:string");
["field1", "field2"].forEach((name) => {
  sig = sig.appendInputField(name, { type: "string" });
});
```

### 3. Type Inference Issues

**Problem**: Lost type information after migration

```typescript
// If types are not inferred correctly
const sig = AxSignature.create("input:string -> output:string");
```

**Solution**: Use explicit type parameters when needed

```typescript
// Explicit type specification
const sig = AxSignature.create<
  { input: string },
  { output: string }
>("input:string -> output:string");
```

## Support and Resources

### Documentation

- [Signature Creation Guide](../docs/signatures.md)
- [Type Safety Best Practices](../docs/type-safety.md)
- [Migration Examples](../examples/migration.ts)

### Community Support

- GitHub Issues: Tag with `migration-help`
- Discord: `#migration-support` channel
- Stack Overflow: Tag with `ax-framework-migration`

### Backward Compatibility

- All new patterns work alongside deprecated ones during transition
- No breaking changes until v15.0.0
- Comprehensive test coverage ensures migration safety

---

## Additional Notes

### Removed Features

#### Field Helper Functions (`f.<type>()`)

The field helper functions like `f.string()`, `f.number()`, `f.class()`, etc.
have been completely removed. These were not providing proper type safety and
have been replaced with string-based type annotations that offer full TypeScript
type inference.

#### Template Literal Functions (``ax``,``s``)

The template literal functions `` ax`` `` and `` s`` `` have been removed. These
have been replaced with strongly-typed function alternatives:

- `` ax`` `` → `ax(signature)` function
- `` s`` `` → `s(signature)` function

The new functions provide proper TypeScript type inference, while the old
template literal approach did not.

#### AxChainOfThought

`AxChainOfThought` has been removed as it's no longer needed. Modern thinking
models (like o1) provide built-in chain-of-thought reasoning capabilities,
making this abstraction unnecessary.

#### AxRAG → axRAG

`AxRAG` has been replaced with `axRAG` - this is a complete rewrite built on top
of `AxFlow`, not just a renaming. The new `axRAG` provides better composability
and integration with the rest of the framework's flow-based architecture.

---

**Last Updated**: January 29, 2025\
**Next Review**: March 1, 2025 (pre-v14.0.0 release)
