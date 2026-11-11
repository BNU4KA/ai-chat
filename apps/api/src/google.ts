import type {FastifyInstance,FastifyRequest,FastifyReply} from 'fastify';
import {AppError,connectIntegrationSchema} from '@ai-chat/contracts';
import {connectGoogle,finishGoogle,googleStatus,disconnectGoogle} from '@ai-chat/services';
export function registerGoogle(app:FastifyInstance,versionOf:(request:FastifyRequest)=>number){
 app.get('/v1/integrations/google',async request=>({data:await googleStatus(request.ownerId)}));
 app.post('/v1/integrations/google/connect',async request=>{const body=connectIntegrationSchema.parse(request.body);return {data:await connectGoogle(request.ownerId,body.capability,body.return_target)};});
 app.delete('/v1/integrations/google/capabilities/:capability',async(request,reply)=>{const cap=(request.params as {capability:string}).capability;if(cap!=='gmail'&&cap!=='calendar')throw new AppError(404,'NOT_FOUND','Capability not found');const result=await disconnectGoogle(request.ownerId,cap,versionOf(request));reply.status(202);return {data:result};});
 const callback=async(request:FastifyRequest,reply:FastifyReply)=>{
  const query=request.query as {state?:string;code?:string;error?:string};if(!query.state||query.state.length>500)throw new AppError(400,'INVALID_REQUEST','Invalid connection callback.');
  const result=await finishGoogle(query.state,query.code,query.error);
  const target=result.target==='native'?(process.env.NATIVE_COMPLETION_URL??'aichat://integration'):(process.env.WEB_COMPLETION_URL??'http://localhost:8081/auth/integration');
  // Return targets come only from server configuration; requests cannot supply arbitrary URLs.
  const destination=new URL(target);destination.searchParams.set('connection',result.ok?'success':'failed');return reply.redirect(destination.toString(),303);
 };
 app.get('/v1/integrations/google/callback',callback);app.get('/integrations/google/callback',callback);

}
