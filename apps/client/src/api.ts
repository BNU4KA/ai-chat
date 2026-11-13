import { fetch as streamingFetch } from 'expo/fetch';
import { supabase } from './supabase';
export const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details: Record<string, unknown> = {}) {super(message);}
}
export async function authorizedFetch(path: string, init: RequestInit = {}, refreshed = false): Promise<Response> {
  if(!supabase)throw new ApiError(401,'UNAUTHENTICATED','Sign in is not available.');
  const {data} = await supabase.auth.getSession();
  if (!data.session) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue');
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${data.session.access_token}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await streamingFetch(`${apiUrl}${path}`, {...init, headers});
  if (response.status === 401 && !refreshed) {
    const refreshedSession = await supabase!.auth.refreshSession();
    if (!refreshedSession.error && refreshedSession.data.session) return authorizedFetch(path, init, true);
  }
  if(response.status===401&&refreshed)await supabase?.auth.signOut({scope:'local'});
  if (!response.ok) {
    const body = await response.json().catch(() => null) as {
      message?: string;
      error?: { code?: string; message?: string; details?: Record<string, unknown> } | string;
    } | null;
    const error = body && typeof body.error === 'object' ? body.error : undefined;
    const message =
      error?.message ??
      (response.status === 404
        ? 'This server does not support that request yet.'
        : 'The request failed. Please try again.');
    throw new ApiError(response.status, error?.code ?? 'REQUEST_FAILED', message, error?.details);
  }
  return response as unknown as Response;
}
export async function apiEnvelope<T>(path: string, init: RequestInit = {}): Promise<{data: T; next_cursor?: string | null}> {
  const response = await authorizedFetch(path, init);
  if (response.status === 204) return {data: undefined as T};
  return response.json();
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {return (await apiEnvelope<T>(path, init)).data;}
export function json(method: string, body?: unknown, version?: number, idempotency?: string): RequestInit {
  const headers: Record<string, string> = {};
  if (version !== undefined) headers['if-match'] = `"${version}"`;
  if (idempotency) headers['idempotency-key'] = idempotency;
  return {method, headers, ...(body === undefined ? {} : {body: JSON.stringify(body)})};
}
