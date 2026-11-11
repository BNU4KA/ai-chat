import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { sessionStorage } from './session-storage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
export const authConfigured = Boolean(url && key && !url.includes('your-project') && !key.startsWith('your-'));
export const supabase = authConfigured ? createClient(url, key, {auth: {
  storage: sessionStorage, persistSession: true, autoRefreshToken: true,
  detectSessionInUrl: false, flowType: 'pkce',
}}) : null;
