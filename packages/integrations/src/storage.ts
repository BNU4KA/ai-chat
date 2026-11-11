import {createClient} from '@supabase/supabase-js';
import {LIMITS} from '@ai-chat/contracts';
export function storageConfigured(){return Boolean(process.env.SUPABASE_URL&&!process.env.SUPABASE_URL.includes('your-project')&&process.env.SUPABASE_SERVICE_ROLE_KEY);}
function storage(){if(!storageConfigured())throw new Error('Private Storage is not configured');return createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}}).storage.from(process.env.STORAGE_BUCKET??'chat-files');}
export async function signUpload(objectKey:string){const {data,error}=await storage().createSignedUploadUrl(objectKey,{upsert:false});if(error||!data)throw new Error('Upload could not be prepared');return {upload_url:data.signedUrl,expires_at:new Date(Date.now()+2*60*60*1000).toISOString(),required_headers:{'x-upsert':'false'}};}
export async function signDownload(objectKey:string){const {data,error}=await storage().createSignedUrl(objectKey,LIMITS.downloadSeconds);if(error||!data)throw new Error('Download is not available');return {url:data.signedUrl,expires_at:new Date(Date.now()+LIMITS.downloadSeconds*1000).toISOString()};}
export async function downloadStoredObject(objectKey:string,fetchImpl:typeof fetch=fetch){
 const signed=await signDownload(objectKey);const response=await fetchImpl(signed.url,{signal:AbortSignal.timeout(20_000)});
 if(!response.ok||!response.body)throw new Error('Stored file could not be read');
 if(Number(response.headers.get('content-length')??0)>LIMITS.fileBytes)throw new Error('FILE_TOO_LARGE');
 const chunks:Uint8Array[]=[];let size=0;const reader=response.body.getReader();
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>LIMITS.fileBytes)throw new Error('FILE_TOO_LARGE');chunks.push(part.value);}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 return Buffer.concat(chunks);
}
export async function removeStoredObjects(keys:string[],fetchImpl:typeof fetch=fetch){
 if(!keys.length)return;if(!storageConfigured())throw new Error('Private Storage cleanup is not configured');
 const url=process.env.SUPABASE_URL!;const key=process.env.SUPABASE_SERVICE_ROLE_KEY!;const bucket=process.env.STORAGE_BUCKET??'chat-files';
 for(let offset=0;offset<keys.length;offset+=100){const response=await fetchImpl(`${url.replace(/\/$/,'')}/storage/v1/object/${encodeURIComponent(bucket)}`,{method:'DELETE',headers:{authorization:`Bearer ${key}`,apikey:key,'content-type':'application/json'},body:JSON.stringify({prefixes:keys.slice(offset,offset+100)}),signal:AbortSignal.timeout(20_000)});if(!response.ok)throw new Error('Private Storage cleanup failed');}
}
export async function deleteAuthUser(userId:string){if(!storageConfigured())throw new Error('Supabase administration is not configured');const client=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});const {error}=await client.auth.admin.deleteUser(userId);if(error&&error.status!==404)throw new Error('Account access revocation failed');}
export async function verifySupabaseUser(token:string){const url=process.env.SUPABASE_URL;const key=process.env.SUPABASE_PUBLISHABLE_KEY??process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error('Sign-in is not configured');const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});const {data,error}=await client.auth.getUser(token);if(error||!data.user)throw new Error('Session is no longer valid');return data.user.id;}
