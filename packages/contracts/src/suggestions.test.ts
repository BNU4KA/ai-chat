import { expect, it } from 'vitest';
import { extractSuggestions, hideSuggestionBlock } from './suggestions.ts';

it('removes a trailing suggestion block and keeps valid replies', () => {
  const result = extractSuggestions('Answer text.\n<suggestions>["Shorter", "Add examples"]</suggestions>');
  expect(result).toEqual({ content: 'Answer text.', suggestions: ['Shorter', 'Add examples'] });
});

it('drops invalid entries, duplicates, and extra replies but keeps the answer', () => {
  const long = 'x'.repeat(61);
  const result = extractSuggestions(
    `Text\n<suggestions>["  A ", "A", 7, "", "${long}", "B", "C", "D", "E"]</suggestions>`,
  );
  expect(result.content).toBe('Text');
  expect(result.suggestions).toEqual(['A', 'B', 'C', 'D']);
});

it('strips a malformed block without inventing replies', () => {
  expect(extractSuggestions('Text\n<suggestions>not json</suggestions>')).toEqual({
    content: 'Text',
    suggestions: [],
  });
});

it('leaves ordinary content and blocks in the middle untouched', () => {
  const text = 'Use <suggestions>["x"]</suggestions> literally.';
  expect(extractSuggestions(text)).toEqual({ content: text, suggestions: [] });
});

it('hides an unfinished block while streaming', () => {
  expect(hideSuggestionBlock('Answer\n<suggestions>["Sh')).toBe('Answer');
  expect(hideSuggestionBlock('Plain')).toBe('Plain');
});
