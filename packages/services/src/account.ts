import {withWorker} from '@ai-chat/database';
import {removeStoredObjects,deleteAuthUser} from '@ai-chat/integrations';
import {revokeConnection} from './google.ts';
export async function purgeAccount(owner:string){
 const fileKeys=await withWorker(async tx=>{
  const profile=(await tx.query('select deletion_requested_at from profiles where id=$1',[owner])).rows[0];if(!profile)return null;if(!profile.deletion_requested_at)throw new Error('Refusing to purge an active account');
  const busy=await tx.query("select id from runs where owner_id=$1 and lease_token is not null and lease_until>now()",[owner]);if(busy.rowCount)throw new Error('Account tasks are still stopping');
  const google=(await tx.query("select * from encrypted_credentials where owner_id=$1 and provider='google' for update",[owner])).rows[0];
  if(google){await tx.query('insert into integration_revocations(owner_id,ciphertext,nonce,auth_tag,encryption_key_version,credential_version) values($1,$2,$3,$4,$5,$6)',[owner,google.ciphertext,google.nonce,google.auth_tag,google.encryption_key_version,google.credential_version]);await tx.query("delete from encrypted_credentials where owner_id=$1 and provider='google'",[owner]);}
  const files=await tx.query('select object_key,created_at from files where owner_id=$1',[owner]);return {keys:files.rows.map(row=>String(row.object_key)),expires:Math.max(0,...files.rows.map(row=>new Date(String(row.created_at)).getTime()+2*60*60*1000))};
 });if(!fileKeys)return;
 await removeStoredObjects(fileKeys.keys);
 if(fileKeys.expires>Date.now())throw new Error('Signed upload links are expiring');
 const revocations=await withWorker(async tx=>(await tx.query('select id from integration_revocations where owner_id=$1',[owner])).rows);
 for(const row of revocations)await revokeConnection(String(row.id));
 // Delete the Auth user before removing the profile. Old JWTs cannot recreate it: API
 // provisioning checks Auth.getUser when a profile does not exist.
 await deleteAuthUser(owner);
 await withWorker(async tx=>{
  for(const table of ['run_sources','notices','schedule_occurrences','schedules','document_revisions','documents','project_files','message_files','document_chunks','approvals','tool_calls','run_events'])await tx.query(`delete from ${table} where owner_id=$1`,[owner]);
  await tx.query('update messages set run_id=null where owner_id=$1',[owner]);
  for(const table of ['runs','messages','files','oauth_states','encrypted_credentials','credential_revisions','integration_revocations','idempotency_records','rate_limits','integrations','conversations','projects','outbox'])await tx.query(`delete from ${table} where owner_id=$1`,[owner]);
  await tx.query('delete from profiles where id=$1 and deletion_requested_at is not null',[owner]);
 });
}
