import { expect, it } from 'vitest';
import { pickPopularModels } from './model-list';
import type { Model } from './types';

const base: Omit<Model, 'id' | 'name'> = {
  context_length: 128000,
  supports_tools: true,
  supports_images: true,
  supports_image_output: false,
  max_output_tokens: 4096,
  input_price_per_million_usd: '0.15',
  output_price_per_million_usd: '0.60',
  supported_parameters: ['tools'],
  catalog_fetched_at: '2026-11-13T00:00:00Z',
  catalog_stale: false,
};

it('picks one optimal Google, OpenAI, and Anthropic Haiku model', () => {
  const catalog: Model[] = [
    { ...base, id: 'meta/llama-3', name: 'Llama 3' },
    { ...base, id: 'anthropic/claude-opus-4.5', name: 'Claude Opus 4.5' },
    { ...base, id: 'anthropic/claude-haiku-4.5', name: 'Anthropic: Claude Haiku 4.5' },
    { ...base, id: 'openai/gpt-4.1-mini', name: 'OpenAI: GPT-4.1 Mini' },
    { ...base, id: 'openai/gpt-5-mini', name: 'OpenAI: GPT-5 Mini' },
    { ...base, id: 'google/gemini-2.5-flash', name: 'Google: Gemini 2.5 Flash' },
  ];
  expect(pickPopularModels(catalog).map((m) => m.id)).toEqual([
    'google/gemini-2.5-flash',
    'openai/gpt-5-mini',
    'anthropic/claude-haiku-4.5',
  ]);
});
