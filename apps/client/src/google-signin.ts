import { supabase } from './supabase';
export async function signInGoogle() {
  if (!supabase) throw new Error('Sign-in is not available. Please contact the service owner.');
  const {error} = await supabase.auth.signInWithOAuth({provider: 'google', options: {
    redirectTo: `${window.location.origin}/auth/callback`, scopes: 'openid email profile',
  }});
  if (error) throw new Error('Google sign-in could not be started. Please try again.');
}
