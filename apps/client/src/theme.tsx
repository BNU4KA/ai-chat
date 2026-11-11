import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
export type ThemeChoice = 'system' | 'light' | 'dark';
const light = {
  background: '#ffffff',
  surface: '#f8fafd',
  raised: '#f0f4f9',
  sidebar: '#f0f4f9',
  composer: '#f0f4f9',
  control: '#e9eef6',
  hover: '#e1e5ea',
  selected: '#d3e3fd',
  greeting: '#4285f4',
  text: '#1f1f1f',
  muted: '#5f6368',
  quiet: '#3c4043',
  card: '#f4edda',
  cardPressed: '#e7d7b4',
  cardEdge: '#bd9b55',
  cardInk: '#5c4a2a',
  border: '#dde3ea',
  accent: '#0b57d0',
  accentText: '#ffffff',
  danger: '#b3261e',
  dangerText: '#ffffff',
  success: '#146c2e',
};
const dark: typeof light = {
  background: '#131314',
  surface: '#1e1f20',
  raised: '#282a2c',
  sidebar: '#1e1f20',
  composer: '#1e1f20',
  control: '#282a2c',
  hover: '#333537',
  selected: '#004a77',
  greeting: '#a8c7fa',
  text: '#e3e3e3',
  muted: '#c4c7c5',
  quiet: '#aeb1af',
  card: '#f4edda',
  cardPressed: '#e7d7b4',
  cardEdge: '#bd9b55',
  cardInk: '#5c4a2a',
  border: '#3c4043',
  accent: '#a8c7fa',
  accentText: '#062e6f',
  danger: '#f2b8b5',
  dangerText: '#601410',
  success: '#81c995',
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
