import {Platform} from 'react-native';
let pending:string|null=null;
const allowed=(path:string)=>/^\/(chat\/[0-9a-f-]{36}|settings(?:\/(?:connections|data))?|onboarding\/key)$/.test(path);
export function rememberReturnPath(path:string){if(!allowed(path))return;pending=path;if(Platform.OS==='web')try{window.sessionStorage.setItem('ai-chat:return',path);}catch{/* private-mode storage may be unavailable */}}
export function consumeReturnPath(){let path=pending;pending=null;if(Platform.OS==='web')try{path=window.sessionStorage.getItem('ai-chat:return')??path;window.sessionStorage.removeItem('ai-chat:return');}catch{/* use memory fallback */}return path&&allowed(path)?path:null;}
