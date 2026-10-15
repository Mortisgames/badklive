import { $ } from './utils.js';
import { AUTO_REFRESH_MIN } from './config.js';
import { S, commitSnapshot } from './state.js';
import { loadSnapshot, singleFlight } from './data/loader.js';
import { saveCache, readCache } from './data/cache.js';
import { renderDashboard } from './views/dashboard.js';
import { loadFeed } from './feed.js';
import { registerWorker } from './pwa.js';
import './game.js';

const fmtTime=ts=>new Date(ts).toLocaleString('uk-UA');
function paint(){renderDashboard();loadFeed(false);}
const load=singleFlight(async()=>{
  $('#btnRefresh').disabled=true;
  $('#btnRefresh').setAttribute('aria-busy','true');
  $('#stDot').className='dot load';
  $('#stTxt').textContent='Оновлення…';
  try{
    const result=await loadSnapshot();
    commitSnapshot(result.snapshot,result.receivedAt);
    const saved=saveCache(result);
    paint();
    $('#errBox').textContent=''; $('#stDot').className='dot';
    $('#cacheNote').classList.toggle('on',!saved);
    $('#cacheNote').textContent=saved?'':'Не вдалося зберегти знімок для офлайн-доступу.';
    $('#stTxt').textContent=`Отримано ${fmtTime(S.receivedAt)} · цільова дата ${S.dash.head['Цільова дата']} · автооновлення кожні ${AUTO_REFRESH_MIN} хв`;
  }catch(e){
    $('#stDot').className='dot err';
    $('#stTxt').textContent=S.receivedAt?`Оновлення не вдалося · останній знімок ${fmtTime(S.receivedAt)}`:'Не вдалося завантажити дані';
    $('#errBox').textContent=e.message;
    $('#cacheNote').classList.toggle('on',!!S.receivedAt);
    $('#cacheNote').textContent=S.receivedAt?`Показано попередній знімок від ${fmtTime(S.receivedAt)}. Цільова дата: ${S.dash.head['Цільова дата']}.`:'';
  }finally{
    $('#btnRefresh').disabled=false;$('#btnRefresh').setAttribute('aria-busy','false');
    window.markDataReady?.();
  }
});
$('#btnRefresh').addEventListener('click',load);
/* ============ BOOT SEQUENCE ============ */
(function boot(){
  const LINES=[
    "ІНІЦІАЛІЗАЦІЯ ТЕРМІНАЛУ BADK-LIVE…",
    "АВТЕНТИФІКАЦІЯ СЕСІЇ… OK",
    "ВСТАНОВЛЕННЯ ЗАХИЩЕНОГО КАНАЛУ…",
    "СИНХРОНІЗАЦІЯ З МЕРЕЖЕЮ ДАТЧИКІВ…",
    "ЗАВАНТАЖЕННЯ БАЛІСТИЧНОЇ МОДЕЛІ v2.1…",
    "ДОСТУП НАДАНО"
  ];
  const boot=$("#boot"), log=$("#bootLog");
  let bootDone=false, dataReady=false, hidden=false;
  function hide(){ if(hidden) return; hidden=true; boot.classList.add("hide"); setTimeout(()=>boot.remove(),550); }
  function maybeHide(){ if(bootDone && dataReady) hide(); }
  window.markDataReady=()=>{ dataReady=true; maybeHide(); };
  LINES.forEach((t,i)=>{
    setTimeout(()=>{
      const d=document.createElement("div");
      d.textContent="> "+t; if(t==="ДОСТУП НАДАНО") d.className="warn";
      log.appendChild(d);
    }, i*780);
  });
  setTimeout(()=>{ bootDone=true; maybeHide(); }, LINES.length*780+900);
  setTimeout(()=>{ dataReady=true; maybeHide(); }, 16000); // hard fallback if network hangs
  const skip=()=>{ bootDone=true; dataReady=true; hide(); };
  $("#bootSkip").addEventListener("click",skip);
  boot.addEventListener("click",skip);
  addEventListener("keydown",e=>{ if(!hidden&&(e.key==="Enter"||e.key===" "||e.key==="Escape")) skip(); },{once:true});
})();

const cached=readCache();
if(cached){
  commitSnapshot(cached.snapshot,cached.receivedAt);paint();
  $('#cacheNote').classList.add('on');
  $('#cacheNote').textContent=`Знімок від ${fmtTime(cached.receivedAt)} · оновлюємо…`;
  window.markDataReady();
}
load();
setInterval(load,AUTO_REFRESH_MIN*60*1000);
registerWorker();
