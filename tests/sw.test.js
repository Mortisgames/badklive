import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
function worker({failInstall=false,network=async()=>new Response('network')}={}){
  const handlers={},stores=new Map(),deleted=[];let skipped=0,claimed=0;
  const caches={
    async open(key){
      if(!stores.has(key))stores.set(key,new Map());
      const store=stores.get(key);
      return {async addAll(requests){if(failInstall)throw new Error('offline');for(const r of requests)store.set(r.url,new Response('cached:'+r.url));},async match(url){return store.get(url)?.clone();}};
    },async keys(){return [...stores.keys()];},async delete(key){deleted.push(key);return stores.delete(key);}
  };
  const scope='https://example.org/badklive/';
  vm.runInNewContext(source,{
    self:{registration:{scope},addEventListener:(event,fn)=>handlers[event]=fn,skipWaiting:async()=>{skipped++;},clients:{claim:async()=>{claimed++;}}},
    caches,URL,Request,Response,fetch:network,AbortController,setTimeout,clearTimeout,
  });
  const dispatch=async(type,properties={})=>{
    const work=[];let response;
    handlers[type]({...properties,waitUntil:p=>work.push(p),respondWith:p=>{response=p;}});
    await Promise.all(work);return response===undefined?undefined:await response;
  };
  return {dispatch,stores,deleted,scope,get skipped(){return skipped;},get claimed(){return claimed;}};
}
test('worker precaches the complete shell and waits for explicit activation',async()=>{
  const w=worker();await w.dispatch('install');
  const cache=[...w.stores.values()][0];
  for(const file of ['index.html','js/app.js','js/data/columns.js','assets/app.css']) assert.ok(cache.has(w.scope+file));
  assert.equal(w.skipped,0);
  await w.dispatch('message',{data:{type:'SKIP_WAITING'}});assert.equal(w.skipped,1);
});
test('activation deletes only previous releases for this scope',async()=>{
  const w=worker();await w.dispatch('install');
  const old='badklive-shell:'+encodeURIComponent(w.scope)+':old';
  const unrelated=['another-app','badklive-shell:'+encodeURIComponent('https://example.org/other/')+':old','badklive-shell-v3'];
  for(const key of [old,...unrelated])w.stores.set(key,new Map());
  await w.dispatch('activate');assert.deepEqual(w.deleted,[old]);assert.equal(w.claimed,1);
  for(const key of unrelated)assert.ok(w.stores.has(key));
});
test('failed install removes incomplete shell',async()=>{
  const w=worker({failInstall:true});await assert.rejects(w.dispatch('install'),/offline/);assert.equal(w.stores.size,0);
});
test('offline navigation ignores query, unrelated requests are untouched',async()=>{
  const w=worker({network:async()=>{throw new Error('offline');}});await w.dispatch('install');
  const response=await w.dispatch('fetch',{request:{method:'GET',mode:'navigate',url:w.scope+'index.html?pwa'}});
  assert.match(await response.text(),/cached:.*index.html/);
  assert.equal(await w.dispatch('fetch',{request:{method:'GET',url:w.scope+'private.json'}}),undefined);
  assert.equal(await w.dispatch('fetch',{request:{method:'GET',url:'https://docs.google.com/test'}}),undefined);
});
