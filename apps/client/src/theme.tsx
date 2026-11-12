import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

export type ThemeChoice = 'system' | 'light' | 'dark';

export interface ThemeColors {
  background: string;
  surface: string;
  raised: string;
  sidebar: string;
  composer: string;
  control: string;
  hover: string;
  selected: string;
  greeting: string;
  text: string;
  muted: string;
  quiet: string;
  border: string;
  accent: string;
  accentText: string;
  danger: string;
  dangerText: string;
  success: string;
  overlay: string;
  skeleton: string;
  skeletonHighlight: string;
  code: string;
  send: string;
  sendText: string;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  round: 999,
} as const;

export const typography = {
  caption: 12,
  body: 14,
  input: 16,
  title: 20,
  display: 28,
} as const;

const light: ThemeColors = {
  background: '#ffffff',
  surface: '#ffffff',
  raised: '#f7f7f8',
  sidebar: '#f9f9f9',
  composer: '#ffffff',
  control: '#f4f4f4',
  hover: '#ececec',
  selected: '#e7e7e7',
  greeting: '#202123',
  text: '#0d0d0d',
  muted: '#676767',
  quiet: '#6f6f6f',
  border: '#e5e5e5',
  accent: '#0d0d0d',
  accentText: '#ffffff',
  danger: '#d00e17',
  dangerText: '#ffffff',
  success: '#138a48',
  overlay: '#00000066',
  skeleton: '#ececec',
  skeletonHighlight: '#f7f7f7',
  code: '#f7f7f8',
  send: '#0d0d0d',
  sendText: '#ffffff',
};

const dark: ThemeColors = {
  background: '#000000',
  surface: '#212121',
  raised: '#171717',
  sidebar: '#000000',
  composer: '#212121',
  control: '#2f2f2f',
  hover: '#212121',
  selected: '#2f2f2f',
  greeting: '#ffffff',
  text: '#ffffff',
  muted: '#b4b4b4',
  quiet: '#8e8e8e',
  border: 'rgba(255, 255, 255, 0.15)',
  accent: '#ffffff',
  accentText: '#0d0d0d',
  danger: '#ff8585',
  dangerText: '#210000',
  success: '#65c88d',
  overlay: '#00000099',
  skeleton: '#2a2a2a',
  skeletonHighlight: '#383838',
  code: '#171717',
  send: '#4f6bed',
  sendText: '#ffffff',
};

interface ThemeContextValue {
  colors: ThemeColors;
  isDark: boolean;
  choice: ThemeChoice;
  setChoice: (choice: ThemeChoice) => void;
}

interface ThemeProviderProps {
  children: ReactNode;
}

const Context = createContext<ThemeContextValue>({
  colors: light,
  isDark: false,
  choice: 'system',
  setChoice: () => undefined,
});

export function ThemeProvider({ children }: ThemeProviderProps) {
  const system = useColorScheme();
  const [choice, setChoice] = useState<ThemeChoice>('system');
  const isDark = (choice === 'system' ? system : choice) === 'dark';
  const colors = isDark ? dark : light;
  const value = useMemo(() => ({ colors, isDark, choice, setChoice }), [colors, isDark, choice]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useTheme = () => useContext(Context);
