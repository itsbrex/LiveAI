// index.test-d.ts
import { expectError, expectType } from 'tsd';

// === Typesafe Signature Tests ===
import { AxSignature } from './dsp/sig.js';

// Test basic signature type inference
const basicSig = AxSignature.create('question: string -> answer: string');
expectType<AxSignature<{ question: string }, { answer: string }>>(basicSig);

// Test signature with optional fields and arrays
const complexSig = AxSignature.create(
  'userInput: string, context?: string[] -> responseText: string, citations: number[]'
);
expectType<
  AxSignature<
    { userInput: string; context?: string[] },
    { responseText: string; citations: number[] }
  >
>(complexSig);

// Test signature with multiple types
const multiTypeSig = AxSignature.create(
  'title: string, count: number, isActive: boolean -> analysisResult: string, score: number'
);
expectType<
  AxSignature<
    { title: string; count: number; isActive: boolean },
    { analysisResult: string; score: number }
  >
>(multiTypeSig);

// Test signature with missing types (should default to string)
const missingTypesSig = AxSignature.create(
  'question, animalImage: image -> answer'
);
expectType<
  AxSignature<
    { question: string; animalImage: { mimeType: string; data: string } },
    { answer: string }
  >
>(missingTypesSig);

// Test error cases
expectError(AxSignature.create('invalid format without arrow'));
expectError(AxSignature.create(''));

// Test type-safe field addition methods
import { f } from './dsp/sig.js';

const testSig = AxSignature.create('userInput: string -> responseText: string');

// Test appendInputField type inference
const withAppendedInput = testSig.appendInputField(
  'contextInfo',
  f.optional(f.string('Context'))
);
expectType<
  AxSignature<
    { userInput: string; contextInfo?: string },
    { responseText: string }
  >
>(withAppendedInput);

// Test prependInputField type inference
const withPrependedInput = testSig.prependInputField(
  'sessionId',
  f.string('Session ID')
);
expectType<
  AxSignature<
    { sessionId: string; userInput: string },
    { responseText: string }
  >
>(withPrependedInput);

// Test appendOutputField type inference
const withAppendedOutput = testSig.appendOutputField(
  'confidence',
  f.number('Confidence score')
);
expectType<
  AxSignature<
    { userInput: string },
    { responseText: string; confidence: number }
  >
>(withAppendedOutput);

// Test prependOutputField type inference
const withPrependedOutput = testSig.prependOutputField(
  'category',
  f.class(['urgent', 'normal', 'low'], 'Priority')
);
expectType<
  AxSignature<
    { userInput: string },
    { category: 'urgent' | 'normal' | 'low'; responseText: string }
  >
>(withPrependedOutput);

// Test chaining type inference
const chainedSig = testSig
  .appendInputField('metadata', f.optional(f.json('Metadata')))
  .prependOutputField('status', f.class(['success', 'error'], 'Status'))
  .appendOutputField('timestamp', f.datetime('Timestamp'));

expectType<
  AxSignature<
    { userInput: string; metadata?: any },
    { status: 'success' | 'error'; responseText: string; timestamp: Date }
  >
>(chainedSig);

// Test array type inference
const arraySig = testSig
  .appendInputField('tags', f.array(f.string('Tag names')))
  .appendOutputField('suggestions', f.array(f.string('Suggestions')));

expectType<
  AxSignature<
    { userInput: string; tags: string[] },
    { responseText: string; suggestions: string[] }
  >
>(arraySig);

// === Fluent API Builder Type Tests ===
// Test fluent API type inference
const fluentSig = f()
  .input('query', f.string('Query to the vector database'))
  .output('context', f.string('Context retrieved from the vector database'))
  .build();

expectType<AxSignature<{ query: string }, { context: string }>>(fluentSig);

// Test fluent API with complex types
const complexFluentSig = f()
  .input('userInput', f.string('User input'))
  .input('metadata', f.optional(f.json('Optional metadata')))
  .input('tags', f.array(f.string('Tag list')))
  .output('responseText', f.string('Response text'))
  .output('confidence', f.number('Confidence score'))
  .output('categories', f.array(f.string('Categories')))
  .build();

expectType<
  AxSignature<
    { userInput: string; metadata?: any; tags: string[] },
    { responseText: string; confidence: number; categories: string[] }
  >
>(complexFluentSig);

// === AxGen (ax) Type Tests ===
import { ax } from './index.js';

// Test ax() creates generators that can be called with forward method
const basicGenerator = ax('userInput:string -> responseText:string');
// Basic test - should have forward method and be callable
expectType<Function>(basicGenerator.forward);

// Test ax() with complex signature creates working generator
const complexGenerator = ax(`
  userQuery:string "User question",
  contextData:json "Background info" -> 
  responseText:string "AI response",
  confidence:number "Confidence 0-1",
  categories:string[] "Response categories"
`);
expectType<Function>(complexGenerator.forward);

// Test ax() with optional fields and class types
const optionalGenerator = ax(`
  userInput:string,
  metadata?:json -> 
  responseText:string,
  sentiment:class "positive, negative, neutral"
`);
expectType<Function>(optionalGenerator.forward);

// Test ax() accepts AxSignature input
const sigBasedGenerator = ax('question:string -> answer:string');
expectType<Function>(sigBasedGenerator.forward);

// === AxFlow (flow) Type Tests ===
import { flow } from './index.js';

// Test flow() creates workflows with forward method
const basicFlow = flow<{ userInput: string }>().map((state) => ({
  processedInput: state.userInput.toUpperCase(),
  inputLength: state.userInput.length,
}));
expectType<Function>(basicFlow.forward);

// Test flow() with node execution creates working workflow
const nodeFlow = flow<{ documentText: string }>()
  .node('summarizer', 'content:string -> summary:string, wordCount:number')
  .execute('summarizer', (state) => ({ content: state.documentText }))
  .map((state) => ({
    originalText: state.documentText,
    summaryResult: (state.summarizerResult?.summary as string) || '',
    wordCount: (state.summarizerResult?.wordCount as number) || 0,
  }));
expectType<Function>(nodeFlow.forward);

// Test flow() with complex multi-node workflow
const complexFlow = flow<{ userQuery: string }>()
  .node('searcher', 'query:string -> results:string[], count:number')
  .node('analyzer', 'data:string[] -> hasResults:boolean')
  .execute('searcher', (state) => ({ query: state.userQuery }))
  .execute('analyzer', (state) => ({
    data: (state.searcherResult?.results as string[]) || [],
  }))
  .map((state) => ({
    originalQuery: state.userQuery,
    searchResults: (state.searcherResult?.results as string[]) || [],
    totalResults: (state.searcherResult?.count as number) || 0,
    hasResults: (state.analyzerResult?.hasResults as boolean) || false,
  }));
expectType<Function>(complexFlow.forward);

// Test flow() with optional fields
const optionalFlow = flow<{
  requiredField: string;
  optionalField?: string;
}>().map((state) => ({
  processedRequired: state.requiredField.trim(),
  processedOptional: state.optionalField?.trim(),
  hasOptional: !!state.optionalField,
}));
expectType<Function>(optionalFlow.forward);

// Test flow() with array handling
const arrayFlow = flow<{ items: string[] }>().map((state) => ({
  originalItems: state.items,
  itemCount: state.items.length,
  firstItem: state.items[0] || '',
  uppercaseItems: state.items.map((item) => item.toUpperCase()),
}));
expectType<Function>(arrayFlow.forward);

// === AxAgent (agent) Type Tests ===
import { agent } from './index.js';

// Test agent() creates agents with forward method
const basicAgent = agent('userInput:string -> responseText:string', {
  name: 'testAgent',
  description: 'A test agent',
  definition: 'You are a helpful assistant.',
});
expectType<Function>(basicAgent.forward);

// Test agent() with complex signature creates working agent
const complexAgent = agent(
  `userQuery:string "User question",
   contextData?:json "Optional context" -> 
   responseText:string "Agent response",
   confidence:number "Confidence score",
   actionTaken:class "search, analyze, respond" "Action performed"`,
  {
    name: 'complexAgent',
    description: 'A complex agent with multiple capabilities',
    definition:
      'You are an intelligent assistant that can search, analyze, and respond.',
  }
);
expectType<Function>(complexAgent.forward);

// Test agent() with different signature structure
const sigBasedAgent = agent(
  'userInput:string, context?:string[] -> responseText:string, citations:number[]',
  {
    name: 'sigAgent',
    description: 'Agent based on signature',
    definition: 'You process user input with context.',
  }
);
expectType<Function>(sigBasedAgent.forward);

// import type {
//   AxAIService,
//   AxAIServiceMetrics,
//   AxAIServiceOptions,
//   AxChatRequest,
//   AxChatResponse,
//   AxEmbedResponse,
//   AxFunction,
//   AxModelConfig,
//   AxModelInfo,
//   AxModelInfoWithProvider,
//   AxTokenUsage,
// } from './index.js'

// // Test AxModelInfo structure
// expectType<AxModelInfo>({
//   name: 'gpt-4',
//   currency: 'USD',
//   promptTokenCostPer1M: 30,
//   completionTokenCostPer1M: 60,
//   aliases: ['gpt4'],
// })

// // Test AxTokenUsage structure
// expectType<AxTokenUsage>({
//   promptTokens: 100,
//   completionTokens: 50,
//   totalTokens: 150,
// })

// // Test AxModelConfig
// expectType<AxModelConfig>({
//   maxTokens: 1000,
//   temperature: 0.7,
//   topP: 0.9,
//   stopSequences: ['\n', 'Stop'],
//   stream: true,
// })

// // Test AxFunction
// expectType<AxFunction>({
//   name: 'getData',
//   description: 'Fetches data',
//   parameters: {
//     type: 'object',
//     properties: {
//       id: {
//         type: 'string',
//         description: 'The data ID',
//       },
//     },
//     required: ['id'],
//   },
//   func: async (args) => ({ data: 'test' }),
// })

// // Test chat request structure
// expectType<AxChatRequest>({
//   chatPrompt: [
//     { role: 'system', content: 'You are a helpful assistant' },
//     { role: 'user', content: 'Hello' },
//     {
//       role: 'assistant',
//       content: 'Hi there!',
//       functionCalls: [
//         {
//           id: '123',
//           type: 'function',
//           function: { name: 'getData', params: { id: '123' } },
//         },
//       ],
//     },
//   ],
//   model: 'gpt-4',
//   modelConfig: { temperature: 0.7 },
// })

// // Test chat response
// expectType<AxChatResponse>({
//   sessionId: '123',
//   remoteId: '456',
//   results: [
//     {
//       content: 'Hello',
//       id: '789',
//       finishReason: 'stop',
//     },
//   ],
//   modelUsage: {
//     promptTokens: 10,
//     completionTokens: 5,
//     totalTokens: 15,
//   },
// })

// // Test embed response
// expectType<AxEmbedResponse>({
//   sessionId: '123',
//   embeddings: [[0.1, 0.2, 0.3]],
//   modelUsage: {
//     promptTokens: 10,
//     completionTokens: 0,
//     totalTokens: 10,
//   },
// })

// // Test service options
// expectType<AxAIServiceOptions>({
//   debug: true,
//   fetch: fetch,
//   rateLimiter: async (req, info) => req(),
// })

// // Test complex chat prompt with different content types
// expectType<AxChatRequest['chatPrompt'][number]>({
//   role: 'user',
//   content: [
//     {
//       type: 'text',
//       text: 'Analyze this image',
//       cache: true,
//     },
//     {
//       type: 'image',
//       mimeType: 'image/jpeg',
//       image: 'base64string',
//       details: 'high',
//     },
//     {
//       type: 'audio',
//       data: 'base64string',
//       format: 'wav',
//     },
//   ],
// })

// // Test error cases
// expectError<AxModelInfo>({
//   name: 123, // Should be string
// })

// expectError<AxChatRequest>({
//   chatPrompt: [
//     { role: 'invalid', content: 'test' }, // Invalid role
//   ],
// })

// expectError<AxModelConfig>({
//   temperature: 'hot', // Should be number
// })

// expectError<AxChatResponse['results'][number]>({
//   finishReason: 'invalid', // Invalid finish reason
// })

// // Test AxAIService implementation
// const mockService: AxAIService = {
//   getName: () => 'test-service',

//   getModelConfig: () => ({
//     maxTokens: 1000,
//     temperature: 0.7,
//   }),

//   getFeatures: (model) => ({
//     functions: true,
//     streaming: true,
//   }),

//   getModelList: () => ({
//     'gpt-4': 'openai/gpt-4',
//   }),

//   getMetrics: () => ({
//     latency: {
//       chat: { mean: 1000, p95: 2000, p99: 3000, samples: [800, 1200] },
//       embed: { mean: 200, p95: 400, p99: 600, samples: [150, 250] },
//     },
//     errors: {
//       chat: { count: 10, rate: 0.01, total: 1000 },
//       embed: { count: 5, rate: 0.005, total: 1000 },
//     },
//   }),

//   chat: async (req, options) => ({
//     results: [{ content: 'Hello' }],
//     sessionId: '123',
//   }),

//   embed: async (req, options) => ({
//     embeddings: [[0.1, 0.2, 0.3]],
//     sessionId: '123',
//   }),

//   setOptions: (options) => {},
// }

// // Test return types of service methods
// expectType<string>(mockService.getName())
// expectType<Readonly<AxModelInfoWithProvider>>(mockService.getModelInfo())

// expectType<{ functions: boolean; streaming: boolean }>(
//   mockService.getFeatures()
// )
// expectType<AxAIServiceMetrics>(mockService.getMetrics())

// // Test async method return types
// const chatResponse = await mockService.chat({
//   chatPrompt: [{ role: 'user', content: 'Hello' }],
// })
// expectType<AxChatResponse | ReadableStream<AxChatResponse>>(chatResponse)

// const embedResponse = await mockService.embed({
//   texts: ['Hello world'],
// })
// expectType<AxEmbedResponse>(embedResponse)

// // Test error cases
// expectError<AxAIService>({
//   ...mockService,
//   getName: () => 123, // Should return string
// })

// expectError<AxAIService>({
//   ...mockService,
//   getFeatures: () => ({
//     // Missing required properties
//     functions: true,
//   }),
// })
