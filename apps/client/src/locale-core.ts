import { russian } from './translations';
export type LanguageChoice = 'auto' | 'ru' | 'en';
export function detectLanguage(
  locales: readonly { languageCode?: string | null; regionCode?: string | null }[],
): 'ru' | 'en' {
  for (const locale of locales) {
    if (locale.languageCode === 'ru' || locale.languageCode === 'en') return locale.languageCode;
  }
  return locales[0]?.regionCode === 'RU' ? 'ru' : 'en';
}
export function translate(message: string, language: 'en' | 'ru'): string {
  if (language === 'en') return message;
  if (russian[message]) return russian[message];
  const trimmed = message.trim();
  if (russian[trimmed]) return message.replace(trimmed, russian[trimmed]!);
  if (message.startsWith('Account settings for '))
    return message.replace('Account settings for ', 'Настройки аккаунта: ');
  if (message.startsWith('Connected ·')) return message.replace('Connected', 'Подключено');
  if (message.startsWith('Review ')) return message.replace('Review ', 'Проверьте: ');
  if (message.startsWith('Expires ')) return message.replace('Expires ', 'Действует до ');
  return message;
}
