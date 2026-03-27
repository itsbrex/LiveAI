import {
  AxAIGoogleGeminiModel,
  AxAgentRespondError,
  AxJSRuntime,
  agent,
  ai,
} from '@ax-llm/ax';

const llm = ai({
  name: 'google-gemini',
  apiKey: process.env.GOOGLE_APIKEY!,
  config: {
    model: AxAIGoogleGeminiModel.Gemini25Flash,
  },
});

// The model can call final("message") for simple queries that don't need
// context gathering + responder synthesis, or final("task", { context })
// for complex queries that go through the responder.
const createAgent = () =>
  agent(
    'query:string -> answer:string "A helpful assistant that answers questions"',
    {
      contextFields: [],
      runtime: new AxJSRuntime(),
      debug: true,
    }
  );

// Test 1: Simple greeting — should trigger final("message") → AxAgentRespondError
console.log('=== Test 1: Simple greeting ===');
try {
  const result = await createAgent().forward(llm, {
    query: 'Hi, how are you?',
  });
  // Model may also use final("task", {context}) — both paths are valid
  console.log('Responder answer:', result.answer);
} catch (err) {
  if (err instanceof AxAgentRespondError) {
    console.log('Direct response (via final(message)):', err.response);
  } else {
    throw err;
  }
}

// Test 2: Complex query — model may use final("task", {context}) or final("message")
console.log('\n=== Test 2: Complex query ===');
try {
  const result = await createAgent().forward(llm, {
    query: 'What is 17 * 23 + 45 * 12? Show your work.',
  });
  console.log('Responder answer:', result.answer);
} catch (err) {
  if (err instanceof AxAgentRespondError) {
    console.log('Direct response (via final(message)):', err.response);
  } else {
    throw err;
  }
}
