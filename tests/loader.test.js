import test from 'node:test';
import assert from 'node:assert/strict';
import { singleFlight, fetchText, loadSnapshot } from '../js/data/loader.js';
import { GIDS } from '../js/config.js';
import { fixtureTexts } from './helpers.js';

test('singleFlight shares the promise and permits retry after failure', async () => {
  let count=0;
  const run=singleFlight(async()=>{if(++count===1) throw new Error('first');return count;});
  const first=run();assert.equal(run(),first);
  await assert.rejects(first,/first/);
  assert.equal(await run(),2);
});
test('timeout aborts a hung request', async () => {
  let aborted=false;
  await assert.rejects(fetchText('test',{timeout:10,fetchImpl:(_, {signal})=>new Promise((resolve,reject)=>{
    signal.addEventListener('abort',()=>{aborted=true;reject(signal.reason);});
  })}),/Час очікування/);
  assert.ok(aborted);
});
test('timeout also covers reading the response body', async () => {
  await assert.rejects(fetchText('test',{timeout:10,fetchImpl:async(_, {signal})=>({ok:true,text:()=>new Promise((resolve,reject)=>{
    signal.addEventListener('abort',()=>reject(signal.reason));
  })})}),/Час очікування/);
});
test('HTTP failure aborts the remaining sheets', async () => {
  let aborted=0;
  const fetchImpl=async(url,{signal})=>{
    if(new URL(url).searchParams.get('gid')===String(GIDS.dash)) return new Response('down',{status:503});
    return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted++;reject(signal.reason);}));
  };
  await assert.rejects(loadSnapshot({fetchImpl}),/dash: HTTP 503/);
  assert.equal(aborted,6);
});
test('loader returns a complete validated snapshot', async () => {
  const texts=fixtureTexts();
  const fetchImpl=async url=>{
    const gid=Number(new URL(url).searchParams.get('gid'));
    return new Response(texts[Object.keys(GIDS).find(k=>GIDS[k]===gid)]);
  };
  const result=await loadSnapshot({fetchImpl});
  assert.equal(result.snapshot.dash.cities.length,1);
  assert.deepEqual(result.texts,texts);
  await assert.rejects(loadSnapshot({fetchImpl:async()=>new Response('<html>Login</html>')}),/HTML/);
});
