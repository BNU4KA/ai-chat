import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, authConfigured } from './supabase';
import { signInGoogle } from './google-signin';

type Auth = {session: Session | null; ready: boolean; configured: boolean; signIn: () => Promise<void>; signOut: () => Promise<void>};
const Context = createContext<Auth | null>(null);
export function AuthProvider({children}: {children: ReactNode}) {
  const cache = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const user = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!supabase) {setReady(true); return;}
    let mounted = true;let authEvent=false;
    const update = (next: Session | null) => {
      if (!mounted) return;
      if (user.current !== undefined && user.current !== (next?.user.id ?? null)) cache.clear();
      user.current = next?.user.id ?? null;
      setSession(next); setReady(true);
    };
    void supabase.auth.getSession().then(({data}) => {if(!authEvent)update(data.session);}).catch(() => update(null));
    const {data} = supabase.auth.onAuthStateChange((_event, next) => {authEvent=true;update(next);});
    const subscription = AppState.addEventListener('change', (state) => {
      if (Platform.OS !== 'web') {
        if (state === 'active') supabase?.auth.startAutoRefresh(); else supabase?.auth.stopAutoRefresh();
      }
    });
    return () => {mounted = false; data.subscription.unsubscribe(); subscription.remove();};
  }, [cache]);
  async function signOut() {
    cache.clear();
    if (supabase) await supabase.auth.signOut({scope: 'local'});
    setSession(null);
  }
  return <Context.Provider value={{session, ready, configured: authConfigured, signIn: signInGoogle, signOut}}>{children}</Context.Provider>;
}
export function useAuth() {const value = useContext(Context); if (!value) throw new Error('Auth provider missing'); return value;}
