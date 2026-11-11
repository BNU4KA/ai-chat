import {useQuery} from '@tanstack/react-query';
import {api,apiEnvelope} from './api';
import type {Profile,Credential,Capabilities,Model} from './types';
export const useProfile=()=>useQuery({queryKey:['profile'],queryFn:()=>api<Profile>('/v1/profile')});
export const useCredential=()=>useQuery({queryKey:['credential'],queryFn:()=>api<Credential>('/v1/credentials/openrouter')});
export const useCapabilities=()=>useQuery({queryKey:['capabilities'],queryFn:()=>api<Capabilities>('/v1/capabilities'),refetchInterval:10000});
export const useModels=(enabled=true)=>useQuery({queryKey:['models'],queryFn:async()=>{let cursor:string|null=null;const models:Model[]=[];do{const page:{data:Model[];next_cursor?:string|null}=await apiEnvelope<Model[]>('/v1/models?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''));models.push(...page.data);cursor=page.next_cursor??null;}while(cursor);return models;},enabled,staleTime:60000});
