import {randomBytes} from 'node:crypto';
import {AppError,canonicalJson,type ToolName,toolGroup} from '@ai-chat/contracts';
import {credentialAad,loadKeyring,open,seal,sha256,withOwner,withWorker,type Tx} from '@ai-chat/database';
import {GOOGLE_SCOPES,GoogleError,googleConfigured,googleAuthorization,exchangeGoogleCode,googleIdentity,refreshGoogle,revokeGoogle,searchGoogleMail,readGoogleMail,writeGoogleMail,listGoogleEvents,googleFreeBusy,getGoogleEvent,writeGoogleEvent,validateEventTime,type GoogleCapability,type MailArgs,type EventArgs} from '@ai-chat/integrations';
import type {ToolPorts,ToolOutcome} from '@ai-chat/agent-runtime';
type Grant={refresh_token:string;access_token:string;expires_at:number};
function decrypt(row:Record<string,unknown>,owner:string,provider:string,version:number){return open(loadKeyring(process.env.ENCRYPTION_KEYS),{ciphertext:row.ciphertext as Buffer,nonce:row.nonce as Buffer,authTag:row.auth_tag as Buffer,encryptionKeyVersion:String(row.encryption_key_version)},credentialAad(owner,provider,version));}
function capabilities(row:Record<string,unknown>|undefined){const v=(row?.capabilities??{}) as Record<string,boolean>;return {gmail:!!v.gmail,calendar:!!v.calendar};}
function dto(row:Record<string,unknown>|undefined){return {status:String(row?.status??'disconnected'),account_email:row?.account_email??null,capabilities:capabilities(row),version:Number(row?.version??0),last_error_code:row?.last_error_code??null};}
export async function googleStatus(owner:string){return withOwner(owner,async tx=>dto((await tx.query("select * from integrations where provider='google'")).rows[0]));}
export async function connectGoogle(owner:string,capability:GoogleCapability,target:'web'|'native'){
 if(!googleConfigured())throw new AppError(503,'TOOL_NOT_CONFIGURED','Google connections are not available.');
 return withOwner(owner,async tx=>{
  await tx.query("insert into integrations(owner_id,provider,status) values($1,'google','disconnected') on conflict(owner_id) do nothing",[owner]);
  const row=(await tx.query("select * from integrations where provider='google' for update")).rows[0]!;
  const state=randomBytes(32).toString('base64url');const verifier=randomBytes(48).toString('base64url');const hash=sha256(state);const sealed=seal(loadKeyring(process.env.ENCRYPTION_KEYS),verifier,credentialAad(owner,`oauth:${hash}`,1));
  await tx.query('delete from oauth_states where expires_at<now()');
  await tx.query(`insert into oauth_states(owner_id,state_hash,verifier_ciphertext,verifier_nonce,verifier_tag,encryption_key_version,integration_capability,return_target,expires_at,integration_version) values($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '10 minutes',$9)`,[owner,hash,sealed.ciphertext,sealed.nonce,sealed.authTag,sealed.encryptionKeyVersion,capability,target,row.version]);
  const enabled=capabilities(row);const scopes=new Set<string>(GOOGLE_SCOPES[capability]);for(const cap of ['gmail','calendar'] as const)if(enabled[cap])for(const scope of GOOGLE_SCOPES[cap])scopes.add(scope);
  return {authorization_url:googleAuthorization(state,verifier,[...scopes],row.account_email as string|undefined),expires_at:new Date(Date.now()+600000).toISOString()};
 });
}
export async function finishGoogle(state:string,code?:string,providerError?:string){
 const hash=sha256(state);const intent=await withWorker(async tx=>{const row=(await tx.query('select s.* from oauth_states s join profiles p on p.id=s.owner_id where s.state_hash=$1 and s.consumed_at is null and s.expires_at>now() and p.deletion_requested_at is null for update of s',[hash])).rows[0];if(!row)throw new AppError(400,'INVALID_REQUEST','The connection request expired. Start again in Settings.');await tx.query('update oauth_states set consumed_at=now() where id=$1',[row.id]);return row;});
 const owner=String(intent.owner_id);const target=String(intent.return_target);
 if(providerError||!code)return {target,ok:false};
 const verifier=open(loadKeyring(process.env.ENCRYPTION_KEYS),{ciphertext:intent.verifier_ciphertext as Buffer,nonce:intent.verifier_nonce as Buffer,authTag:intent.verifier_tag as Buffer,encryptionKeyVersion:String(intent.encryption_key_version)},credentialAad(owner,`oauth:${hash}`,1));
 try{
 const tokens=await exchangeGoogleCode(code,verifier);const identity=await googleIdentity(tokens.access_token);
 const granted=(tokens.scope??'').split(' ');const requested=String(intent.integration_capability) as GoogleCapability;
 if(!GOOGLE_SCOPES[requested].every(scope=>granted.includes(scope)))throw new AppError(422,'INTEGRATION_SCOPES_MISSING','Google did not grant the required permissions.');
 await withWorker(async tx=>{
  const row=(await tx.query('select i.* from integrations i join profiles p on p.id=i.owner_id where i.owner_id=$1 and p.deletion_requested_at is null for update of i',[owner])).rows[0];
  if(!row||Number(row.version)!==Number(intent.integration_version))throw new AppError(409,'VERSION_CONFLICT','Connection settings changed. Start again.');
  const enabled=capabilities(row);
  if((enabled.gmail||enabled.calendar)&&row.google_subject!==identity.sub)throw new AppError(422,'GOOGLE_ACCOUNT_MISMATCH','Use the connected Google account, or disconnect both services first.');
  const old=(await tx.query("select * from encrypted_credentials where owner_id=$1 and provider='google' for update",[owner])).rows[0];
  const previous=old&&row.google_subject===identity.sub?JSON.parse(decrypt(old,owner,'google',Number(old.credential_version))) as Grant:null;
  const refresh=tokens.refresh_token??previous?.refresh_token;if(!refresh)throw new AppError(422,'INTEGRATION_REAUTH_REQUIRED','Reconnect Google and grant offline access.');
  enabled[requested]=true;
  // Google can drop permissions during renewed consent; only report capabilities backed by granted scopes.
  for(const cap of ['gmail','calendar'] as const)enabled[cap]=enabled[cap]&&GOOGLE_SCOPES[cap].every(scope=>granted.includes(scope));
  const version=Number(row.version)+1;const secret=seal(loadKeyring(process.env.ENCRYPTION_KEYS),JSON.stringify({refresh_token:refresh,access_token:tokens.access_token,expires_at:Date.now()+tokens.expires_in*1000}),credentialAad(owner,'google',version));
  await tx.query("delete from encrypted_credentials where owner_id=$1 and provider='google'",[owner]);
  await tx.query(`insert into encrypted_credentials(owner_id,provider,integration_id,credential_version,ciphertext,nonce,auth_tag,encryption_key_version,validated_at) values($1,'google',$2,$3,$4,$5,$6,$7,now())`,[owner,row.id,version,secret.ciphertext,secret.nonce,secret.authTag,secret.encryptionKeyVersion]);
  await tx.query("update integrations set google_subject=$2,account_email=$3,capabilities=$4::jsonb,granted_scopes=$5,status='connected',last_error_code=null,version=version+1,updated_at=now() where id=$1",[row.id,identity.sub,identity.email,JSON.stringify(enabled),granted]);
 });
 return {target,ok:true};
 }catch(error){const code=error instanceof AppError?error.code:error instanceof GoogleError?error.code:'GOOGLE_AUTH_FAILED';await withWorker(async tx=>{await tx.query('update integrations set last_error_code=$2,updated_at=now() where owner_id=$1',[owner,code]);});return {target,ok:false};}

}
async function cancelCapability(tx:Tx,owner:string,cap:GoogleCapability){
 const rows=await tx.query(`update runs set cancel_requested_at=coalesce(cancel_requested_at,now()),status=case when status='waiting_approval' then 'queued' else status end,updated_at=now() where owner_id=$1 and status in ('queued','running','waiting_approval') and tool_snapshot->'groups' ? $2 returning id`,[owner,cap]);
 for(const run of rows.rows){await tx.query("update approvals set status='cancelled' where run_id=$1 and consumed_at is null and status in ('pending','approved')",[run.id]);await tx.query("insert into outbox(owner_id,topic,payload) values($1,'run.execute',$2::jsonb)",[owner,JSON.stringify({runId:run.id})]);}
}
export async function disconnectGoogle(owner:string,cap:GoogleCapability,version:number){return withWorker(async tx=>{
 const row=(await tx.query('select i.* from integrations i join profiles p on p.id=i.owner_id where i.owner_id=$1 and p.deletion_requested_at is null for update of i',[owner])).rows[0];if(!row)throw new AppError(404,'NOT_FOUND','Connection not found');if(Number(row.version)!==version)throw new AppError(409,'VERSION_CONFLICT','Connection settings changed',{version:Number(row.version)});
 const enabled=capabilities(row);enabled[cap]=false;await cancelCapability(tx,owner,cap);await tx.query('delete from oauth_states where owner_id=$1',[owner]);
 if(!enabled.gmail&&!enabled.calendar){
  const old=(await tx.query("select * from encrypted_credentials where owner_id=$1 and provider='google' for update",[owner])).rows[0];
  if(old){const job=(await tx.query(`insert into integration_revocations(owner_id,ciphertext,nonce,auth_tag,encryption_key_version,credential_version) values($1,$2,$3,$4,$5,$6) returning id`,[owner,old.ciphertext,old.nonce,old.auth_tag,old.encryption_key_version,old.credential_version])).rows[0]!;await tx.query("insert into outbox(owner_id,topic,payload) values($1,'integration.revoke',$2::jsonb)",[owner,JSON.stringify({revocationId:job.id})]);await tx.query("delete from encrypted_credentials where owner_id=$1 and provider='google'",[owner]);}
 }
 return dto((await tx.query("update integrations set capabilities=$2::jsonb,status=$3,version=version+1,updated_at=now() where id=$1 returning *",[row.id,JSON.stringify(enabled),enabled.gmail||enabled.calendar?'connected':'disconnecting'])).rows[0]);
 });}
export async function revokeConnection(id:string){const row=await withWorker(async tx=>(await tx.query('select * from integration_revocations where id=$1',[id])).rows[0]);if(!row)return;let failure=false;try{const grant=JSON.parse(decrypt(row,String(row.owner_id),'google',Number(row.credential_version))) as Grant;await revokeGoogle(grant.refresh_token);}catch{failure=true;if(Date.now()<new Date(String(row.deadline)).getTime())throw new Error('Google revocation pending');}
 await withWorker(async tx=>{await tx.query('delete from integration_revocations where id=$1',[id]);await tx.query("update integrations set status='disconnected',last_error_code=$2,updated_at=now() where owner_id=$1 and status='disconnecting' and capabilities->>'gmail'='false' and capabilities->>'calendar'='false'",[row.owner_id,failure?'REVOCATION_UNCONFIRMED':null]);});
}
async function accessGoogle(owner:string,capability:GoogleCapability,runId?:string){
 const result=await withWorker(async tx=>{
  const row=(await tx.query("select g.*,i.account_email,i.google_subject,i.capabilities,i.status from encrypted_credentials g join integrations i on i.id=g.integration_id join profiles p on p.id=i.owner_id where g.owner_id=$1 and g.provider='google' and p.deletion_requested_at is null for update of g",[owner])).rows[0];
  if(!row||row.status!=='connected'||!capabilities(row)[capability])throw new GoogleError('INTEGRATION_REAUTH_REQUIRED','Connect this Google service in Settings.');
  if(runId){const run=(await tx.query('select tool_snapshot,status,cancel_requested_at from runs where id=$1 and owner_id=$2',[runId,owner])).rows[0];const snapshot=(run?.tool_snapshot??{}) as {googleSubject?:string;googleIntegrationId?:string};if(!run||run.status!=='running'||run.cancel_requested_at||snapshot.googleSubject!==row.google_subject||snapshot.googleIntegrationId!==row.integration_id)throw new GoogleError('INTEGRATION_REAUTH_REQUIRED','The connected account or task changed. Start a new request.');}
  let grant=JSON.parse(decrypt(row,owner,'google',Number(row.credential_version))) as Grant;
  if(grant.expires_at<Date.now()+60000){try{const fresh=await refreshGoogle(grant.refresh_token);grant={...grant,access_token:fresh.access_token,expires_at:Date.now()+fresh.expires_in*1000};const secret=seal(loadKeyring(process.env.ENCRYPTION_KEYS),JSON.stringify(grant),credentialAad(owner,'google',Number(row.credential_version)));await tx.query('update encrypted_credentials set ciphertext=$2,nonce=$3,auth_tag=$4,encryption_key_version=$5,updated_at=now() where id=$1',[row.id,secret.ciphertext,secret.nonce,secret.authTag,secret.encryptionKeyVersion]);}catch(error){if(error instanceof GoogleError&&error.code==='INTEGRATION_REAUTH_REQUIRED'){await tx.query("update integrations set status='reauth_required',last_error_code='INTEGRATION_REAUTH_REQUIRED',updated_at=now() where id=$1",[row.integration_id]);return null;}throw error;}}
  return {token:grant.access_token,email:String(row.account_email),subject:String(row.google_subject),integrationId:String(row.integration_id)};
 });
 if(!result)throw new GoogleError('INTEGRATION_REAUTH_REQUIRED','Reconnect Google in Settings.');return result;
}
export async function prepareGoogleWrite(owner:string,runId:string,name:string,args:unknown){
 const cap=name.includes('mail')?'gmail':'calendar';const grant=await accessGoogle(owner,cap,runId);
 if(cap==='gmail')return {args,preview:{kind:name,...args as object,google_account:grant.email}};
 const value=args as Partial<EventArgs>;let full:EventArgs;
 if(name==='update_calendar_event'){
  const old=await getGoogleEvent(grant.token,value.event_id!);
  if(old.etag!==value.expected_etag)throw new GoogleError('EVENT_CHANGED','The event changed. Read it again before making a new proposal.');
  if(old.recurrence||old.recurringEventId||!old.start.dateTime||!old.end.dateTime)throw new GoogleError('VALIDATION_ERROR','Only single timed events can be edited.');
  const timezone=value.timezone??old.start.timeZone;if(!timezone)throw new GoogleError('VALIDATION_ERROR','Specify the event timezone.');
  full={event_id:old.id,expected_etag:old.etag,title:value.title??old.summary??'Untitled',start:value.start??old.start.dateTime,end:value.end??old.end.dateTime,timezone,attendees:value.attendees??old.attendees?.map(a=>({address:a.email,name:a.displayName})),description:value.description??old.description};
  validateEventTime(full.start,full.end,full.timezone);
  return {args:{...value,timezone},preview:{kind:name,...full,calendar:'primary',google_account:grant.email,notifications:old.attendees?.length||full.attendees?.length?'All affected attendees':'None',reminders:'Existing reminders unchanged'}};
 }
 full=value as EventArgs;validateEventTime(full.start,full.end,full.timezone);
 void runId;
 return {args,preview:{kind:name,...full,calendar:'primary',google_account:grant.email,notifications:full.attendees?.length?'All attendees':'None',reminders:'Calendar defaults'}};
}
export function googlePorts(owner:string,runId:string):ToolPorts{
 async function invoke(cap:GoogleCapability,name:string,args:unknown,fn:(token:string,operation:string)=>Promise<unknown>,write=false):Promise<ToolOutcome>{
  try{
   const grant=await accessGoogle(owner,cap,runId);let operation=runId;
   if(write){const permitted=await withWorker(async tx=>(await tx.query(`select t.id,t.integration_id from tool_calls t join approvals a on a.tool_call_id=t.id join runs r on r.id=t.run_id where t.owner_id=$1 and t.run_id=$2 and t.name=$3 and t.args_hash=$4 and t.status='executing' and a.status='approved' and a.consumed_at is not null and r.cancel_requested_at is null and r.status='running' order by t.ordinal desc limit 1`,[owner,runId,name,sha256(canonicalJson(args))])).rows[0]);if(!permitted||permitted.integration_id!==grant.integrationId)throw new GoogleError('VALIDATION_ERROR','This action is no longer authorized.');operation=String(permitted.id);}
   const data=await fn(grant.token,operation);return {ok:true,data,reference:write&&typeof data==='object'&&data&&'id'in data?String(data.id):undefined};
  }catch(error){return {ok:false,error:{code:error instanceof GoogleError?error.code:'PROVIDER_ERROR',message:error instanceof GoogleError?error.message:'Google request failed.',retryable:false}};}
 }
 return {
  searchMail:(q,max)=>invoke('gmail','search_mail',{},token=>searchGoogleMail(token,q,max)),
  readMail:id=>invoke('gmail','read_mail',{},token=>readGoogleMail(token,id)),
  createDraft:args=>invoke('gmail','create_mail_draft',args,(token,operation)=>writeGoogleMail(token,args as MailArgs,operation,true),true),
  sendMail:args=>invoke('gmail','send_mail',args,(token,operation)=>writeGoogleMail(token,args as MailArgs,operation,false),true),
  listEvents:args=>{const a=args as {time_min:string;time_max:string};return invoke('calendar','list_calendar_events',args,token=>listGoogleEvents(token,a.time_min,a.time_max));},
  freeBusy:args=>{const a=args as {time_min:string;time_max:string;timezone:string};return invoke('calendar','get_calendar_availability',args,token=>googleFreeBusy(token,a.time_min,a.time_max,a.timezone));},
  createEvent:args=>invoke('calendar','create_calendar_event',args,(token,op)=>writeGoogleEvent(token,args as EventArgs,op,false),true),
  updateEvent:args=>invoke('calendar','update_calendar_event',args,(token,op)=>writeGoogleEvent(token,args as EventArgs,op,true),true),
 };
}
export async function authorizeTool(owner:string,runId:string,name:ToolName){
 const group=toolGroup(name);if(group!=='gmail'&&group!=='calendar')return null;
 const row=await withWorker(async tx=>(await tx.query(`select i.id,i.google_subject,r.tool_snapshot from integrations i join profiles p on p.id=i.owner_id join runs r on r.owner_id=i.owner_id where i.owner_id=$1 and r.id=$2 and r.status='running' and r.cancel_requested_at is null and p.deletion_requested_at is null and i.status='connected' and i.capabilities->>$3='true'`,[owner,runId,group])).rows[0]);
 if(!row)throw new GoogleError('INTEGRATION_REAUTH_REQUIRED','Connect the required Google service in Settings.');
 const snapshot=row.tool_snapshot as {googleSubject?:string;googleIntegrationId?:string};
 if(snapshot.googleSubject!==row.google_subject||snapshot.googleIntegrationId!==row.id)throw new GoogleError('INTEGRATION_REAUTH_REQUIRED','The connected account changed. Start a new request.');
 return String(row.id);
}
