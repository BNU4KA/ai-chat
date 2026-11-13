import {useEffect,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {api} from './api';
import {readEvents,type RunEvent} from './stream';
import type {Snapshot,Approval,ToolCall} from './types';
export const activeStatus=(status:string)=>['queued','running','waiting_approval'].includes(status);
export function applyRunEvent(old:Snapshot,event:RunEvent):Snapshot{
 if(BigInt(event.seq)<=BigInt(old.run.last_event_seq))return old;
 const value:Snapshot={...old,run:{...old.run,last_event_seq:event.seq},assistant_message:{...old.assistant_message}};
 const p=event.payload;
 if(event.type==='message.delta')value.assistant_message.content+=String(p.delta??'');
 if(event.type==='run.started')value.run.status='running';
 if(event.type==='approval.required'){value.run.status='waiting_approval';value.approvals=[...old.approvals.filter(a=>a.id!==p.id),p as unknown as Approval];}
 if(event.type==='approval.resolved')value.approvals=old.approvals.map(a=>a.id===p.approval_id?{...a,status:String(p.status)}:a);
 if(event.type==='tool.started')value.tool_calls=[...old.tool_calls.filter(t=>t.id!==p.tool_call_id),{id:String(p.tool_call_id),name:String(p.name),status:'executing',arguments:{}}];
 if(event.type==='tool.completed')value.tool_calls=old.tool_calls.map(t=>t.id===p.tool_call_id?{...t,status:String(p.status),safe_result:p.safe_result} as ToolCall:t);
 if(event.type==='run.completed'||event.type==='run.cancelled'||event.type==='run.failed'){
   value.run.status=event.type==='run.completed'?'completed':event.type==='run.cancelled'?'cancelled':'failed';
   value.run.error_code=typeof p.error_code==='string'?p.error_code:null;
   value.assistant_message.content=String(p.final_content??p.partial_content??value.assistant_message.content);
   value.assistant_message.status=value.run.status==='completed'?'complete':value.run.status==='cancelled'?'cancelled':value.assistant_message.content?'partial':'failed';
 }
 return value;
}
export function useRun(runId:string|undefined){
 const cache=useQueryClient();const[reconnecting,setReconnecting]=useState(false);
 const query=useQuery({queryKey:['run',runId],queryFn:()=>api<Snapshot>(`/v1/runs/${runId}`),enabled:!!runId,refetchInterval:q=>q.state.data&&activeStatus(q.state.data.run.status)?5000:false});
 useEffect(()=>{if(!runId)return;const controller=new AbortController();let mounted=true;
 void(async()=>{let delay=1000;while(!controller.signal.aborted){try{
   const snapshot=await api<Snapshot>(`/v1/runs/${runId}`,{signal:controller.signal});if(!mounted)return;
   cache.setQueryData(['run',runId],snapshot);if(!activeStatus(snapshot.run.status))break;
   setReconnecting(false);
   await readEvents(runId,snapshot.run.last_event_seq,controller.signal,event=>{
     cache.setQueryData<Snapshot>(['run',runId],old=>old?applyRunEvent(old,event):old);
     if(event.type==='tool.completed'){void cache.invalidateQueries({queryKey:['conversation']});void cache.invalidateQueries({queryKey:['files']});}
     if(['run.completed','run.failed','run.cancelled'].includes(event.type)){void cache.invalidateQueries({queryKey:['messages']});void cache.invalidateQueries({queryKey:['runs']});void cache.invalidateQueries({queryKey:['conversations']});void cache.invalidateQueries({queryKey:['conversation']});void cache.invalidateQueries({queryKey:['files']});}
   });
   const current=cache.getQueryData<Snapshot>(['run',runId]);if(current&&!activeStatus(current.run.status))break;
 }catch{if(controller.signal.aborted)break;if(mounted)setReconnecting(true);}
 await new Promise<void>(resolve=>{const timer=setTimeout(resolve,delay);controller.signal.addEventListener('abort',()=>{clearTimeout(timer);resolve();},{once:true});});delay=Math.min(delay*2,10000);
 }})().finally(()=>{if(mounted)setReconnecting(false);});
 return()=>{mounted=false;controller.abort();};},[cache,runId]);
 return {...query,reconnecting};
}
