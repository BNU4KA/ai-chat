import {authorizedFetch} from './api';
export type RunEvent={run_id:string;seq:string;type:string;payload:Record<string,unknown>};
export async function readEvents(runId:string,after:string,signal:AbortSignal,onEvent:(event:RunEvent)=>void){
 const response=await authorizedFetch(`/v1/runs/${runId}/events?after_seq=${encodeURIComponent(after)}`,{signal});
 if(!response.body)throw new Error('Streaming is not available.');
 const reader=response.body.getReader();const decoder=new TextDecoder();let carry='';
 try{while(true){const chunk=await reader.read();if(chunk.done)break;carry+=decoder.decode(chunk.value,{stream:true});const blocks=carry.split(/\r?\n\r?\n/);carry=blocks.pop()??'';for(const block of blocks){const data=block.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');if(data)onEvent(JSON.parse(data) as RunEvent);}}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
