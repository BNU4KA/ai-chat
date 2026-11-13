import {useQuery} from '@tanstack/react-query';
import {api,apiEnvelope,json} from './api';
import type {Profile,Credential,Capabilities,Model} from './types';
export const useProfile=()=>useQuery({queryKey:['profile'],queryFn:()=>api<Profile>('/v1/profile')});
export const useCredential=()=>useQuery({queryKey:['credential'],queryFn:()=>api<Credential>('/v1/credentials/openrouter')});

export type AdminKey = {
  id: string;
  label: string;
  last_four: string;
  version: number;
  validated_at: string;
  created_at: string;
  assigned_users_count: number;
};
export type AdminUser = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  deletion_requested_at: string | null;
  key_source: 'personal' | 'managed' | 'missing';
  has_personal_key: boolean;
  managed_key: { id: string; label: string; last_four: string } | null;
  conversations_count: number;
  total_cost_usd: string;
};
async function collect<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  do {
    const page: { data: T[]; next_cursor?: string | null } = await apiEnvelope<T[]>(
      path + (path.includes('?') ? '&' : '?') + (cursor ? `cursor=${encodeURIComponent(cursor)}&` : '') + 'limit=50',
    );
    items.push(...page.data);
    cursor = page.next_cursor ?? null;
  } while (cursor && items.length < 500);
  return items;
}
export const useAdminKeys = (enabled: boolean) =>
  useQuery({
    queryKey: ['admin-keys'],
    queryFn: () => api<AdminKey[]>('/v1/admin/openrouter-keys'),
    enabled,
  });
export const useAdminUsers = (query: string, enabled: boolean) =>
  useQuery({
    queryKey: ['admin-users', query],
    queryFn: () => collect<AdminUser>(`/v1/admin/users?query=${encodeURIComponent(query)}`),
    enabled,
  });
export const createAdminKey = (label: string, apiKey: string) =>
  api<AdminKey>('/v1/admin/openrouter-keys', json('POST', { label, api_key: apiKey }));
export const deleteAdminKey = (id: string) =>
  api<void>(`/v1/admin/openrouter-keys/${id}`, json('DELETE'));
export const assignAdminKey = (userId: string, managedKeyId: string | null) =>
  api<AdminUser>(`/v1/admin/users/${userId}/openrouter-key`, json('PATCH', { managed_key_id: managedKeyId }));
export const deleteAdminUser = (id: string) =>
  api<{ deletion_status: string }>(`/v1/admin/users/${id}`, json('DELETE'));
export const useCapabilities=()=>useQuery({queryKey:['capabilities'],queryFn:()=>api<Capabilities>('/v1/capabilities'),refetchInterval:10000});
export const useModels=(enabled=true)=>useQuery({queryKey:['models'],queryFn:async()=>{let cursor:string|null=null;const models:Model[]=[];do{const page:{data:Model[];next_cursor?:string|null}=await apiEnvelope<Model[]>('/v1/models?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''));models.push(...page.data);cursor=page.next_cursor??null;}while(cursor);return models;},enabled,staleTime:60000});
