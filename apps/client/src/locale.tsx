import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { useLocales } from 'expo-localization';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './auth';
import { api, json } from './api';
import type { Profile } from './types';
import { detectLanguage, translate, type LanguageChoice } from './locale-core';
export type { LanguageChoice } from './locale-core';
type Locale = {
  language: 'en' | 'ru';
  choice: LanguageChoice;
  region: string | null;
  t: (message: string) => string;
  saveLanguage: (choice: LanguageChoice) => Promise<void>;
};
const Context = createContext<Locale>({
  language: 'en',
  choice: 'auto',
  region: null,
  t: (value) => value,
  saveLanguage: async () => {},
});
export function LocaleProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const cache = useQueryClient();
  const locales = useLocales();
  const profile = useQuery({
    queryKey: ['profile'],
    queryFn: () => api<Profile>('/v1/profile'),
    enabled: !!session,
  });
  const choice = profile.data?.locale ?? 'auto';
  const language = choice === 'auto' ? detectLanguage(locales) : choice;
  const value = useMemo<Locale>(
    () => ({
      language,
      choice,
      region: locales[0]?.regionCode ?? null,
      t: (message) => translate(message, language),
      saveLanguage: async (next) => {
        const current = await cache.fetchQuery({
          queryKey: ['profile'],
          queryFn: () => api<Profile>('/v1/profile'),
        });
        await api('/v1/profile', json('PATCH', { locale: next }, current.version));
        await cache.invalidateQueries({ queryKey: ['profile'] });
      },
    }),
    [language, choice, locales, cache],
  );
  useEffect(() => {
    if (Platform.OS === 'web') {
      document.documentElement.lang = language;
    }
  }, [language]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useLocale = () => useContext(Context);
