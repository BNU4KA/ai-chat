import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

type Pointer = {prefix: string; count: number};
const keyName = (key: string) => key.replace(/[^a-zA-Z0-9._-]/g, '_');
async function pointer(key: string): Promise<Pointer | null> {
  const raw = await SecureStore.getItemAsync(keyName(key));
  if (!raw) return null;
  try {return JSON.parse(raw) as Pointer;} catch {return null;}
}
async function removeChunks(value: Pointer | null) {
  if (value) await Promise.all(Array.from({length: value.count}, (_, i) => SecureStore.deleteItemAsync(`${value.prefix}.${i}`)));
}
// A session can exceed Keychain's per-value limit. Switch an immutable chunk manifest last.
export const sessionStorage = {
  async getItem(key: string) {
    if (Platform.OS === 'web') return typeof window === 'undefined' ? null : window.localStorage.getItem(key);
    const saved = await pointer(key);
    if (!saved || saved.count < 1 || saved.count > 3000) return null;
    const chunks = await Promise.all(Array.from({length: saved.count}, (_, i) => SecureStore.getItemAsync(`${saved.prefix}.${i}`)));
    return chunks.some((chunk) => chunk === null) ? null : chunks.join('');
  },
  async setItem(key: string, value: string) {
    // Provider API tokens are not used by the app; integration grants stay on the server.
    try{const session=JSON.parse(value) as Record<string,unknown>;if(session&&typeof session==='object'){delete session.provider_token;delete session.provider_refresh_token;value=JSON.stringify(session);}}catch{/* PKCE verifier strings are stored unchanged */}
    if (Platform.OS === 'web') {window.localStorage.setItem(key, value); return;}
    if (value.length > 1_000_000) throw new Error('Session is too large');
    const old = await pointer(key);
    const points = Array.from(value);
    const next = {prefix: `${keyName(key)}.${Crypto.randomUUID()}`, count: Math.ceil(points.length / 400)};
    try {
      for (let i = 0; i < next.count; i++) await SecureStore.setItemAsync(`${next.prefix}.${i}`, points.slice(i * 400, (i + 1) * 400).join(''));
      await SecureStore.setItemAsync(keyName(key), JSON.stringify(next));
    } catch (error) {await removeChunks(next); throw error;}
    await removeChunks(old);
  },
  async removeItem(key: string) {
    if (Platform.OS === 'web') {window.localStorage.removeItem(key); return;}
    const old = await pointer(key);
    await SecureStore.deleteItemAsync(keyName(key));
    await removeChunks(old);
  },
};
