import { $ } from "./utils.js";
(function easterEgg(){
  const overlay=$("#eggOverlay"), canvas=$("#eggCanvas"), ctx=canvas.getContext("2d");
  const scoreEl=$("#eggScore"), bestEl=$("#eggBest"), overEl=$("#eggOver"), finalEl=$("#eggFinalScore");
  const BEST_KEY="badklive_egg_kills_best";
  let best=0; try{best=+(localStorage.getItem(BEST_KEY)||0)||0;}catch{}
  bestEl.textContent=best;

  let W=0,H=0,dpr=1;
  function resize(){
    dpr=Math.min(2,window.devicePixelRatio||1);
    W=canvas.clientWidth; H=canvas.clientHeight;
    canvas.width=Math.max(1,W*dpr); canvas.height=Math.max(1,H*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  const GRAV=0.25, JUMP_V=-11.5, PW=64, PLAYER_R=16, MAX_DX=150;
  let player, platforms, debris, camTop, kills, touchX, running=false, rafId=null, lastX=0, platIndex=0;

  function nextX(){
    const lo=Math.max(20,lastX-MAX_DX), hi=Math.min(W-20-PW,lastX+MAX_DX);
    lastX = lo<hi? lo+Math.random()*(hi-lo) : Math.max(20,Math.min(W-20-PW,lastX));
    return lastX;
  }
  function makePlatform(y){
    platIndex++;
    const x=nextX();
    const diff=Math.min(1,Math.max(0,(platIndex-6)/34)); // no movement for the first ~6 platforms, ramps up after
    const moving=Math.random()<0.5*diff;
    const speed=moving?(0.35+0.85*diff)*(0.7+Math.random()*0.6):0;
    return {x,y,w:PW,vx:moving?(Math.random()<0.5?-speed:speed):0};
  }

  function resetGame(){
    camTop=0; kills=0; platIndex=0;
    player={x:W/2,y:H-60,vy:JUMP_V};
    touchX=player.x;
    platforms=[]; debris=[]; lastX=W/2;
    let y=H-20;
    while(y>-H*3){ platforms.push(makePlatform(y)); y-=60+Math.random()*40; }
    overEl.classList.remove("on");
  }

  function loop(){
    if(!running) return;
    player.vy+=GRAV;
    player.x+=(touchX-player.x)*0.25;
    if(player.x<-PLAYER_R) player.x=W+PLAYER_R;
    if(player.x>W+PLAYER_R) player.x=-PLAYER_R;
    const prevY=player.y;
    player.y+=player.vy;

    if(player.y-camTop<H*0.4 && player.vy<0){ camTop-=(H*0.4)-(player.y-camTop); }

    for(const p of platforms){
      if(!p.vx) continue;
      p.x+=p.vx;
      if(p.x<10){ p.x=10; p.vx=Math.abs(p.vx); }
      if(p.x>W-10-p.w){ p.x=W-10-p.w; p.vx=-Math.abs(p.vx); }
    }

    if(player.vy>0){
      for(let i=0;i<platforms.length;i++){
        const p=platforms[i];
        if(player.x>p.x-PLAYER_R && player.x<p.x+p.w+PLAYER_R && prevY<=p.y && player.y>=p.y){
          player.vy=JUMP_V; kills++;
          debris.push({x:p.x+p.w/2,y:p.y+3,w:p.w,vy:-2.5,rot:(Math.random()-0.5)*0.3,rotV:(Math.random()>0.5?1:-1)*(0.12+Math.random()*0.12),age:0});
          platforms.splice(i,1);
          break;
        }
      }
    }
    platforms=platforms.filter(p=>p.y<camTop+H+40);
    let top=platforms.length?Math.min(...platforms.map(p=>p.y)):camTop;
    while(top>camTop-40){ top-=60+Math.random()*40; platforms.push(makePlatform(top)); }

    for(const d of debris){ d.vy+=GRAV*1.4; d.y+=d.vy; d.rot+=d.rotV; d.age++; }
    debris=debris.filter(d=>d.age<140 && d.y-camTop<H+80);

    if(player.y-camTop>H+40){ endGame(); return; }

    render();
    scoreEl.textContent=kills;
    rafId=requestAnimationFrame(loop);
  }

  const dogImg=new Image(); dogImg.src="icons/game-patron.png";
  const droneImg=new Image(); droneImg.src="icons/game-shahed.png";
  const DOG_AR=206/320, DRONE_AR=320/276;
  function drawDrone(cx,cy,w){
    if(!droneImg.complete||!droneImg.naturalWidth) return;
    const dw=w*0.75, dh=dw/DRONE_AR;
    ctx.drawImage(droneImg,cx-dw/2,cy-dh/2,dw,dh);
  }
  function drawDog(cx,cy,r){
    if(!dogImg.complete||!dogImg.naturalWidth) return;
    const dh=r*2.4, dw=dh*DOG_AR;
    ctx.drawImage(dogImg,cx-dw/2,cy-dh/2,dw,dh);
  }

  function render(){
    ctx.clearRect(0,0,W,H);
    ctx.strokeStyle="rgba(95,211,232,.05)"; ctx.lineWidth=1;
    for(let gx=0;gx<W;gx+=28){ ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,H);ctx.stroke(); }
    for(const d of debris){
      const y=d.y-camTop, alpha=Math.max(0,1-d.age/110);
      ctx.save(); ctx.globalAlpha=alpha; ctx.translate(d.x,y); ctx.rotate(d.rot);
      drawDrone(0,0,d.w); ctx.restore();
    }
    for(const p of platforms){
      const y=p.y-camTop;
      ctx.save(); ctx.translate(p.x+p.w/2,y+5); drawDrone(0,0,p.w); ctx.restore();
    }
    drawDog(player.x,player.y-camTop,PLAYER_R);
  }

  const END_PHRASES=["Так тримати","Слава ЗСУ","Русні пізда","Гарна робота","Патрон пишається","Ще один збитий"];
  function endGame(){
    running=false; if(rafId) cancelAnimationFrame(rafId);
    finalEl.textContent=kills;
    $("#eggTitle").textContent=END_PHRASES[Math.floor(Math.random()*END_PHRASES.length)];
    if(kills>best){ best=kills; try{localStorage.setItem(BEST_KEY,best);}catch(e){} bestEl.textContent=best; }
    overEl.classList.add("on");
  }

  function start(){
    overlay.classList.add("on");
    resize(); resetGame();
    running=true; loop();
  }
  function stop(){ running=false; if(rafId) cancelAnimationFrame(rafId); overlay.classList.remove("on"); }

  canvas.addEventListener("pointermove",e=>{ const r=canvas.getBoundingClientRect(); touchX=e.clientX-r.left; });
  canvas.addEventListener("pointerdown",e=>{ const r=canvas.getBoundingClientRect(); touchX=e.clientX-r.left; });
  addEventListener("resize",()=>{ if(running) resize(); });
  $("#eggClose").addEventListener("click",stop);
  $("#eggRestart").addEventListener("click",()=>{ resetGame(); running=true; loop(); });

  let taps=0, tapTimer=null;
  $(".brand h1").addEventListener("pointerup",()=>{
    taps++; clearTimeout(tapTimer); tapTimer=setTimeout(()=>taps=0,2000);
    if(taps>=5){ taps=0; start(); }
  });
})();
