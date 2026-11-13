import type { Model } from './types';

const POPULAR_IDS = [
  'anthropic/claude-haiku-5.5',
  'google/gemini-3.8-flash',
  'openai/gpt-5.4-mini',
] as const;

export function pickPopularModels(models: Model[]): Model[] {
  const picks: Model[] = [];
  for (const id of POPULAR_IDS) {
    const found = models.find((m) => m.id.toLowerCase() === id);
    if (found) picks.push(found);
  }
  return picks;
}
