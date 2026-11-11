import type {FastifyInstance,FastifyRequest} from 'fastify';
import {AppError,uploadCreateSchema} from '@ai-chat/contracts';
import {reserveFile,ownedFile,finalizeFile,deleteFile,chatFiles,fileDto} from '@ai-chat/database';
import {storageConfigured,signUpload,signDownload} from '@ai-chat/integrations';
export function registerFiles(app:FastifyInstance,versionOf:(request:FastifyRequest)=>number){
 app.get('/v1/conversations/:id/files',async request=>({data:await chatFiles(request.ownerId,(request.params as {id:string}).id)}));
 app.post('/v1/files/uploads',async(request,reply)=>{
  if(!storageConfigured())throw new AppError(503,'TOOL_NOT_CONFIGURED','File storage is not available.');
  const input=uploadCreateSchema.parse(request.body);const row=await reserveFile(request.ownerId,input);
  try{const upload=await signUpload(String(row.object_key));reply.status(201);return {data:{file:fileDto(row),...upload}};}
  catch{throw new AppError(503,'PROVIDER_UNAVAILABLE','Upload could not be prepared. Please try again.');}
 });
 app.post('/v1/files/:id/finalize',async(request,reply)=>{reply.status(202);return {data:fileDto(await finalizeFile(request.ownerId,(request.params as {id:string}).id))};});
 app.get('/v1/files/:id',async request=>({data:fileDto(await ownedFile(request.ownerId,(request.params as {id:string}).id))}));
 app.get('/v1/files/:id/download',async request=>{const file=await ownedFile(request.ownerId,(request.params as {id:string}).id);if(file.status!=='ready')throw new AppError(422,'FILE_NOT_READY','File is not ready.');return {data:await signDownload(String(file.object_key))};});
 app.delete('/v1/files/:id',async(request,reply)=>{await deleteFile(request.ownerId,(request.params as {id:string}).id,versionOf(request));reply.status(202);return {data:{deletion_status:'scheduled'}};});
}
