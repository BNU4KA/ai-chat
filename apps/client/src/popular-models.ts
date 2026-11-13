import type { Model } from './types';

const POPULAR_GROUPS: {
  provider: string;
  preferred: string[];
  fallback: (m: Model) => boolean;
}[] = [
  {
    provider: 'Google',
    preferred: [
      'google/gemini-2.5-flash',
      'google/gemini-3.8-flash',
      'google/gemini-2.0-flash-001',
      'google/gemini-2.5-flash-lite',
    ],
    fallback: (m) => /^google\/gemini-.*flash/i.test(m.id) && !m.id.includes(':free'),
  },
  {
    provider: 'OpenAI',
    preferred: ['openai/gpt-5-mini', 'openai/gpt-4.1-mini', 'openai/gpt-4o-mini', 'openai/gpt-5-nano'],
    fallback: (m) => /^openai\/gpt-.*mini/i.test(m.id) && !m.id.includes(':free'),
  },
  {
    provider: 'Anthropic',
    preferred: [
      'anthropic/claude-haiku-4.5',
      'anthropic/claude-3.5-haiku',
      'anthropic/claude-3-5-haiku',
      'anthropic/claude-3.5-haiku-20241022',
    ],
    fallback: (m) => /^anthropic\/claude-.*haiku/i.test(m.id) && !m.id.includes(':free'),
  },
];

export function pickPopularModels(models: Model[]): Model[] {
  const picks: Model[] = [];
  for (const group of POPULAR_GROUPS) {
    let found: Model | undefined;
    for (const id of group.preferred) {
      found = models.find((m) => m.id.toLowerCase() === id);
      if (found) break;
    }
    if (!found) {
      found = models.find((m) => group.fallback(m) && m.supports_tools) ?? models.find(group.fallback);
    }
    if (found) picks.push(found);
  }
  return picks;
}
