import { LIMITS } from './limits.ts';
import { codePointLength } from './text.ts';

const BLOCK = /\s*<suggestions>([\s\S]*?)<\/suggestions>\s*$/;

export function extractSuggestions(content: string): { content: string; suggestions: string[] } {
  const match = BLOCK.exec(content);
  if (!match) return { content, suggestions: [] };
  const stripped = content.slice(0, match.index).trimEnd();
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1] ?? '');
  } catch {
    return { content: stripped, suggestions: [] };
  }
  if (!Array.isArray(parsed)) return { content: stripped, suggestions: [] };
  const suggestions: string[] = [];
  for (const item of parsed) {
    if (typeof item !== 'string') continue;
    const text = item.trim();
    if (!text || codePointLength(text) > LIMITS.suggestionCodePoints) continue;
    if (suggestions.includes(text)) continue;
    suggestions.push(text);
    if (suggestions.length === LIMITS.suggestionCount) break;
  }
  return { content: stripped, suggestions };
}

export function hideSuggestionBlock(text: string): string {
  const open = text.indexOf('<suggestions>');
  return open === -1 ? text : text.slice(0, open).trimEnd();
}
