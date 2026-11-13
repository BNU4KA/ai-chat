import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
export type ThemeChoice = 'system' | 'light' | 'dark';

const light = {
  background: '#ffffff',
  surface: '#ffffff',
  raised: '#f9f9f9',
  sidebar: '#f9f9f9',
  composer: '#ffffff',
  userBubble: '#f4f4f4',
  control: '#f4f4f4',
  hover: '#ececec',
  selected: '#e5e5e5',
  greeting: '#0d0d0d',
  text: '#0d0d0d',
  muted: '#5d5d5d',
  subtle: '#8f8f8f',
  border: '#e5e5e5',
  borderSubtle: '#efefef',
  accent: '#0d0d0d',
  accentText: '#ffffff',
  info: '#0285ff',
  infoSoft: 'rgba(2, 133, 255, 0.1)',
  codeBg: '#f9f9f9',
  codeHeader: '#f3f3f3',
  danger: '#dc2626',
  dangerText: '#ffffff',
  success: '#10a37f',
};

const dark: typeof light = {
  background: '#212121',
  surface: '#212121',
  raised: '#2f2f2f',
  sidebar: '#181818',
  composer: '#303030',
  userBubble: '#303030',
  control: '#2f2f2f',
  hover: '#2a2a2a',
  selected: '#2f2f2f',
  greeting: '#ececec',
  text: '#ececec',
  muted: '#b4b4b4',
  subtle: '#8e8e8e',
  border: 'rgba(255, 255, 255, 0.1)',
  borderSubtle: 'rgba(255, 255, 255, 0.06)',
  accent: '#ffffff',
  accentText: '#0d0d0d',
  info: '#63a8f8',
  infoSoft: 'rgba(99, 168, 248, 0.14)',
  codeBg: '#0d0d0d',
  codeHeader: '#2f2f2f',
  danger: '#f87171',
  dangerText: '#181818',
  success: '#10a37f',
};

const Context = createContext({
  colors: light,
  isDark: false,
  choice: 'system' as ThemeChoice,
  setChoice: (_choice: ThemeChoice) => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [choice, setChoice] = useState<ThemeChoice>('system');
  const isDark = (choice === 'system' ? system : choice) === 'dark';
  const colors = isDark ? dark : light;
  const value = useMemo(() => ({ colors, isDark, choice, setChoice }), [colors, isDark, choice]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useTheme = () => useContext(Context);
