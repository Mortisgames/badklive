import { SHEET_ID, GIDS, REQUEST_TIMEOUT_MS } from '../config.js';
import { buildSnapshot } from './snapshot.js';
export function singleFlight(fn){
  let pending;
  return (...args)=>{
    if(!pending) pending=Promise.resolve().then(()=>fn(...args)).finally(()=>{pending=null;});
    return pending;
  };
}
export async function fetchText(url,{signal,timeout=REQUEST_TIMEOUT_MS,fetchImpl=fetch,...options}={}){
  const controller=new AbortController();
  const abort=()=>controller.abort(signal.reason);
  if(signal?.aborted) abort(); else signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>controller.abort(new Error('Час очікування відповіді вичерпано')),timeout);
  try{
    const response=await fetchImpl(url,{...options,cache:'no-store',signal:controller.signal});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export async function loadSnapshot(options={}){
  const controller=new AbortController();
  try{
    const pairs=await Promise.all(Object.entries(GIDS).map(async([key,gid])=>{
      try{
        const text=await fetchText(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}&cb=${Date.now()}`,{...options,signal:controller.signal});
        if(/^\s*</.test(text)) throw new Error('Google повернув HTML замість CSV');
        return [key,text];
      }catch(e){throw new Error(`${key}: ${e.message}`);}
    }));
    const texts=Object.fromEntries(pairs);
    return {texts,snapshot:buildSnapshot(texts),receivedAt:Date.now()};
  }finally{controller.abort();}
}
