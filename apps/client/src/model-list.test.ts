import { expect, it } from 'vitest';
import { pickPopularModels } from './popular-models';
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

it('picks the 3 configured popular models (Anthropic Haiku 5.5, Google Gemini 3.8 Flash, OpenAI GPT-5.4 Mini)', () => {
  const catalog: Model[] = [
    { ...base, id: 'meta/llama-3', name: 'Llama 3' },
    { ...base, id: 'openai/gpt-5.4-mini', name: 'OpenAI: GPT-5.4 Mini' },
    { ...base, id: 'google/gemini-3.8-flash', name: 'Google: Gemini 3.8 Flash' },
    { ...base, id: 'anthropic/claude-haiku-5.5', name: 'Anthropic: Claude Haiku 5.5' },
  ];
  expect(pickPopularModels(catalog).map((m) => m.id)).toEqual([
    'anthropic/claude-haiku-5.5',
    'google/gemini-3.8-flash',
    'openai/gpt-5.4-mini',
  ]);
});
