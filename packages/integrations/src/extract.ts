import {fork} from 'node:child_process';
import type {Extracted} from './extract-child.ts';
export function extractIsolated(bytes:Uint8Array,filename:string):Promise<Extracted>{return new Promise((resolve,reject)=>{
 const child=fork(new URL('./extract-child.ts',import.meta.url),[],{execArgv:['--max-old-space-size=160'],serialization:'advanced',env:{AI_CHAT_EXTRACT_CHILD:'1'},stdio:['ignore','ignore','ignore','ipc']});
 const timer=setTimeout(()=>finish(new Error('EXTRACTION_TIMEOUT')),30000);
 let done=false;const finish=(error?:Error,value?:Extracted)=>{if(done)return;done=true;clearTimeout(timer);child.kill('SIGKILL');if(error)reject(error);else resolve(value!);};
 child.once('message',(raw)=>{const message=raw as {ok:boolean;result?:Extracted;error?:string};if(message.ok)finish(undefined,message.result);else finish(new Error(message.error));});
 child.once('error',()=>finish(new Error('EXTRACTION_FAILED')));child.once('exit',()=>{if(!done)finish(new Error('EXTRACTION_FAILED'));});child.send({bytes,filename});
});}
