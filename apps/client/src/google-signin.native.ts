import { GoogleSignin, isSuccessResponse, isCancelledResponse } from '@react-native-google-signin/google-signin';
import { supabase } from './supabase';
export async function signInGoogle() {
  if (!supabase || !process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) throw new Error('Sign-in is not available. Please contact the service owner.');
  GoogleSignin.configure({webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, offlineAccess: false, scopes: []});
  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();
  if (isCancelledResponse(response)) return;
  if (!isSuccessResponse(response) || !response.data.idToken) throw new Error('Google did not return a sign-in token.');
  const {error} = await supabase.auth.signInWithIdToken({provider: 'google', token: response.data.idToken});
  if (error) throw new Error('Google sign-in failed. Please try again.');
}
