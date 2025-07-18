import type { AxModelInfo } from '../types.js';

import { AxAIAnthropicModel } from './types.js';

export const axModelInfoAnthropic: AxModelInfo[] = [
  // 4
  {
    name: AxAIAnthropicModel.Claude4Opus,
    currency: 'usd',
    promptTokenCostPer1M: 15.0,
    completionTokenCostPer1M: 75.0,
    maxTokens: 32000,
    hasThinkingBudget: true,
    hasShowThoughts: true,
  },
  {
    name: AxAIAnthropicModel.Claude4Sonnet,
    currency: 'usd',
    promptTokenCostPer1M: 3.0,
    completionTokenCostPer1M: 15.0,
    maxTokens: 64000,
    hasThinkingBudget: true,
    hasShowThoughts: true,
  },
  // 3.7
  {
    name: AxAIAnthropicModel.Claude37Sonnet,
    currency: 'usd',
    promptTokenCostPer1M: 3.0,
    completionTokenCostPer1M: 15.0,
    maxTokens: 64000,
    hasThinkingBudget: true,
    hasShowThoughts: true,
  },
  // 3.5
  {
    name: AxAIAnthropicModel.Claude35Sonnet,
    currency: 'usd',
    promptTokenCostPer1M: 3.0,
    completionTokenCostPer1M: 15.0,
    maxTokens: 8192,
  },
  {
    name: AxAIAnthropicModel.Claude35Haiku,
    currency: 'usd',
    promptTokenCostPer1M: 0.8,
    completionTokenCostPer1M: 4.0,
    maxTokens: 8192,
  },
  // 3
  {
    name: AxAIAnthropicModel.Claude3Opus,
    currency: 'usd',
    promptTokenCostPer1M: 15.0,
    completionTokenCostPer1M: 75.0,
    maxTokens: 4096,
  },
  {
    name: AxAIAnthropicModel.Claude3Sonnet,
    currency: 'usd',
    promptTokenCostPer1M: 3.0,
    completionTokenCostPer1M: 15.0,
    maxTokens: 4096,
  },
  {
    name: AxAIAnthropicModel.Claude3Haiku,
    currency: 'usd',
    promptTokenCostPer1M: 0.25,
    completionTokenCostPer1M: 1.25,
    maxTokens: 4096,
  },
  // 2.1
  {
    name: AxAIAnthropicModel.Claude21,
    currency: 'usd',
    promptTokenCostPer1M: 8.0,
    completionTokenCostPer1M: 25,
    maxTokens: 4096,
  },
  {
    name: AxAIAnthropicModel.ClaudeInstant12,
    currency: 'usd',
    promptTokenCostPer1M: 0.8,
    completionTokenCostPer1M: 2.24,
    maxTokens: 4096,
  },
];
