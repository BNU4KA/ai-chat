import { describe, it, expect } from 'vitest';
import { detectLanguage, translate } from './locale-core';
import { profilePatchSchema } from '@ai-chat/contracts';
describe('language preferences', () => {
  it('respects supported device languages before falling back to region', () => {
    expect(detectLanguage([{ languageCode: 'ru', regionCode: 'PL' }])).toBe('ru');
    expect(detectLanguage([{ languageCode: 'en', regionCode: 'RU' }])).toBe('en');
    expect(
      detectLanguage([
        { languageCode: 'de', regionCode: 'DE' },
        { languageCode: 'ru', regionCode: 'DE' },
      ]),
    ).toBe('ru');
    expect(detectLanguage([{ languageCode: 'de', regionCode: 'RU' }])).toBe('ru');
    expect(detectLanguage([{ languageCode: 'de', regionCode: 'DE' }])).toBe('en');
    expect(detectLanguage([])).toBe('en');
  });
  it('preserves unknown content and the original English strings', () => {
    expect(translate('Ask AI Chat', 'ru')).toBe('Спросите AI Chat');
    expect(translate('Hello, ', 'ru')).toBe('Привет, ');
    expect(translate('Some user content', 'ru')).toBe('Some user content');
    expect(translate('Ask AI Chat', 'en')).toBe('Ask AI Chat');
  });
  it('accepts only supported persisted language choices', () => {
    for (const locale of ['auto', 'en', 'ru'])
      expect(profilePatchSchema.parse({ locale })).toEqual({ locale });
    expect(profilePatchSchema.safeParse({ locale: 'fr' }).success).toBe(false);
  });
});
