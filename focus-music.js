(() => {
"use strict";
if (window.__academicMusicStudioLoaded) return;
window.__academicMusicStudioLoaded = true;
const tracks = [
{id:"calm",title:"Calm Study",artist:"Academic Tracker Originals",genre:"Calm",mood:"Warm chords, soft keys and a gentle melody",bpm:76,style:"calm"},
{id:"lofi",title:"Lo-fi Focus",artist:"Academic Tracker Originals",genre:"Lo-fi",mood:"Mellow chords, a relaxed beat and soft percussion",bpm:84,style:"lofi"},
{id:"afro",title:"Afro Chill",artist:"Academic Tracker Originals",genre:"Afro Chill",mood:"A light Afro-inspired groove with warm melodies",bpm:96,style:"afro"}
];
const KEY="academic-tracker-music-preferences-v1";
let prefs={}; try{prefs=JSON.parse(localStorage.getItem(KEY)||"{}");}catch(_){}
let current=Math.max(0,tracks.findIndex(t=>t.id===prefs.track)),favorites=new Set(Array.isArray(prefs.favorites)?prefs.favorites:[]);
let filter="All",playing=false,expanded=false,dismissed=false,ctx=null,master=null,timer=null,nextTime=0,step=0,startedAt=0,elapsedBefore=0;
let panel,launcher,playBtn,status,progress,elapsed,duration,volume,favBtn,list;
const LOOP_STEPS=64;
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify({track:tracks[current].id,favorites:Array.from(favorites),volume:Number(volume?volume.value:(prefs.volume||0.32))}));}catch(_){}};
const fmt=s=>{s=Math.max(0,Math.floor(s||0));return Math.floor(s/60)+":"+String(s%60).padStart(2,"0");};
const hz=n=>440*Math.pow(2,(n-69)/12);
function ensureAudio(){
 if(ctx&&ctx.state!=="closed")return;
 const AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw Error("Audio unavailable");
 ctx=new AC();master=ctx.createGain();const comp=ctx.createDynamicsCompressor(),filterNode=ctx.createBiquadFilter();
 filterNode.type="lowpass";filterNode.frequency.value=10500;comp.threshold.value=-18;comp.ratio.value=3;master.gain.value=0;
 master.connect(comp);comp.connect(filterNode);filterNode.connect(ctx.destination);
}
function env(g,t,peak,a,h,r){
 g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,peak),t+a);
 g.gain.setValueAtTime(Math.max(.0002,peak),t+a+h);g.gain.exponentialRampToValueAtTime(.0001,t+a+h+r);
}
function tone(freq,t,len,o){
 o=o||{};const osc=ctx.createOscillator(),amp=ctx.createGain(),f=ctx.createBiquadFilter(),p=ctx.createStereoPanner?ctx.createStereoPanner():null;
 osc.type=o.type||"triangle";osc.frequency.setValueAtTime(freq,t);if(o.detune)osc.detune.setValueAtTime(o.detune,t);
 f.type="lowpass";f.frequency.setValueAtTime(o.cutoff||2200,t);f.Q.value=.7;
 env(amp,t,o.gain||.04,o.attack||.012,Math.max(.01,len*.35),o.release||len*.65);
 osc.connect(f);f.connect(amp);if(p){p.pan.value=o.pan||0;amp.connect(p);p.connect(master);}else amp.connect(master);
 osc.start(t);osc.stop(t+len+(o.release||len*.65)+.03);
}
function pad(chord,t,beat){
 chord.forEach((n,i)=>{const f=hz(n);tone(f,t,beat*3.75,{type:"sawtooth",gain:.012,attack:.55,release:1.2,cutoff:850+i*90,detune:i%2?-5:5,pan:(i-1.5)*.18});tone(f*2,t,beat*3.55,{type:"sine",gain:.004,attack:.7,release:1.1,cutoff:1300,pan:(i-1.5)*.12});});
}
function bass(n,t,style){tone(hz(n),t,.36,{type:"triangle",gain:style==="calm"?.035:.075,attack:.008,release:.24,cutoff:260});}
function pluck(n,t,style,pan){const f=hz(n);tone(f,t,.24,{type:"triangle",gain:style==="afro"?.035:.045,attack:.004,release:.32,cutoff:2500,pan:pan});tone(f*2.002,t,.12,{type:"sine",gain:.008,attack:.003,release:.16,cutoff:4200,pan:-pan});}
function kick(t,soft){const o=ctx.createOscillator(),g=ctx.createGain();o.type="sine";o.frequency.setValueAtTime(soft?85:125,t);o.frequency.exponentialRampToValueAtTime(42,t+.12);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(soft?.12:.2,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+.28);o.connect(g);g.connect(master);o.start(t);o.stop(t+.3);}
function noise(t,len,level,cutoff){const size=Math.ceil(ctx.sampleRate*len),buf=ctx.createBuffer(1,size,ctx.sampleRate),data=buf.getChannelData(0);for(let i=0;i<size;i++)data[i]=(Math.random()*2-1)*(1-i/size);const src=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();src.buffer=buf;f.type="highpass";f.frequency.setValueAtTime(cutoff,t);env(g,t,level,.003,len*.12,len*.85);src.connect(f);f.connect(g);g.connect(master);src.start(t);src.stop(t+len+.02);}
function schedule(i,t){
 const tr=tracks[current],style=tr.style,beat=60/tr.bpm,bar=Math.floor(i/16),pos=i%16;
 const chords=style==="lofi"?[[57,60,64,67],[53,57,60,64],[55,59,62,65],[52,55,59,62]]:style==="afro"?[[60,64,67,71],[55,59,62,67],[57,60,64,69],[53,57,60,64]]:[[60,64,67,71],[57,60,64,67],[53,57,60,64],[55,59,62,67]];
 const chord=chords[bar%4];if(pos===0)pad(chord,t,beat);if(pos===0||pos===8)bass(chord[0]-24,t,style);if(pos===12&&style!=="calm")bass(chord[2]-24,t,style);
 const scale=style==="lofi"?[0,3,5,7,10,7,5,3]:[0,2,4,7,9,7,4,2],melody=style==="calm"?[0,4,8,12]:[0,3,6,8,11,14];
 if(melody.includes(pos)){const phrase=Math.floor(i/16),offset=scale[(Math.floor(i/2)+phrase)%scale.length];pluck(chord[0]+12+offset,t,style,pos%8<4?-.22:.22);}
 if(style==="calm"){if(pos===4||pos===12)noise(t,.045,.006,6500);return;}
 if(pos===0||pos===8||(style==="afro"&&pos===14))kick(t,style==="lofi");
 if(pos===4||pos===12)noise(t,.19,style==="afro"?.025:.018,1200);
 if(pos%4===0||(style==="afro"&&pos%2===0))noise(t,.055,style==="afro"?.012:.008,7200);
}
function tick(){
 if(!ctx||ctx.state!=="running"||!playing)return;const beat=60/tracks[current].bpm,d=beat/4;
 while(nextTime<ctx.currentTime+.13){schedule(step,nextTime);step=(step+1)%LOOP_STEPS;nextTime+=d;}
 const sec=elapsedBefore+Math.max(0,ctx.currentTime-startedAt);progress.value=String((sec%(beat*16))/(beat*16)*100);elapsed.textContent=fmt(sec);duration.textContent="Loop";
}
function startTimer(){if(timer)clearInterval(timer);nextTime=ctx.currentTime+.08;timer=setInterval(tick,25);}
async function play(){
 try{ensureAudio();await ctx.resume();master.gain.cancelScheduledValues(ctx.currentTime);master.gain.setTargetAtTime(Number(volume.value),ctx.currentTime,.45);playing=true;startedAt=ctx.currentTime;startTimer();status.textContent="NOW PLAYING";}
 catch(_){playing=false;status.textContent="Tap play to enable audio";}update();
}
function pause(){
 if(timer)clearInterval(timer);timer=null;if(ctx&&master&&ctx.state!=="closed"){elapsedBefore+=Math.max(0,ctx.currentTime-startedAt);master.gain.cancelScheduledValues(ctx.currentTime);master.gain.setTargetAtTime(.0001,ctx.currentTime,.08);setTimeout(()=>{if(!playing&&ctx&&ctx.state==="running")ctx.suspend().catch(()=>{});},280);}
 playing=false;update();
}
function select(i,auto){current=(i+tracks.length)%tracks.length;step=0;elapsedBefore=0;progress.value="0";elapsed.textContent="0:00";duration.textContent="Loop";save();update();if(auto)play();}
function renderList(){
 const shown=tracks.filter(t=>filter==="All"||(filter==="Favourites"?favorites.has(t.id):t.genre===filter));
 list.innerHTML=shown.length?shown.map(t=>{const i=tracks.findIndex(x=>x.id===t.id),selected=i===current;return '<button class="music-track'+(selected?' is-current':'')+'" type="button" data-track-index="'+i+'" aria-current="'+(selected?'true':'false')+'"><span class="music-track-art" aria-hidden="true"><span></span><span></span><span></span></span><span class="music-track-copy"><strong>'+t.title+'</strong><small>'+t.genre+' · '+t.mood+'</small></span><span class="music-track-state">'+(selected&&playing?'Playing':selected?'Selected':'Play')+'</span></button>';}).join(""):'<p class="music-empty">No favourites yet. Tap the heart on a track to save it here.</p>';
}
function update(){
 const tr=tracks[current];panel.querySelector(".music-title").textContent=tr.title;panel.querySelector(".music-artist").textContent=tr.artist;panel.querySelector(".music-mood").textContent=tr.mood;panel.querySelector(".music-genre-chip").textContent=tr.genre;
 playBtn.textContent=playing?"Ⅱ":"▶";playBtn.setAttribute("aria-label",playing?"Pause music":"Play music");playBtn.setAttribute("aria-pressed",String(playing));status.textContent=playing?"NOW PLAYING":"READY WHEN YOU ARE";
 favBtn.textContent=favorites.has(tr.id)?"♥":"♡";favBtn.setAttribute("aria-label",favorites.has(tr.id)?"Remove from favourites":"Add to favourites");favBtn.setAttribute("aria-pressed",String(favorites.has(tr.id)));
 panel.classList.toggle("is-playing",playing);panel.classList.toggle("is-expanded",expanded);panel.querySelector(".music-expand").setAttribute("aria-expanded",String(expanded));panel.hidden=dismissed;launcher.hidden=!dismissed;panel.querySelector(".music-expand").setAttribute("aria-label",expanded?"Collapse music studio":"Expand music studio");renderList();
}
function init(){
 if(document.querySelector(".music-studio"))return;
 panel=document.createElement("aside");panel.className="music-studio";panel.setAttribute("aria-label","Academic Tracker Music Studio");
 panel.innerHTML='<div class="music-studio-head"><div class="music-brand"><span class="music-brand-icon" aria-hidden="true">♫</span><span><strong>Music Studio</strong><small class="music-status">READY WHEN YOU ARE</small></span></div><div class="music-head-actions"><button class="music-expand" type="button" aria-expanded="false" aria-label="Expand music studio"><span aria-hidden="true">⌃</span></button><button class="music-close" type="button" aria-label="Close music player" title="Close music player">×</button></div></div><div class="music-now-playing"><div class="music-cover" aria-hidden="true"><span></span><span></span><span></span><i>♫</i></div><div class="music-track-info"><span class="music-genre-chip">Calm</span><strong class="music-title">Calm Study</strong><small class="music-artist">Academic Tracker Originals</small><small class="music-mood">Warm chords, soft keys and a gentle melody</small></div><button class="music-favorite" type="button" aria-label="Add to favourites" aria-pressed="false">♡</button></div><div class="music-timeline"><span class="music-elapsed">0:00</span><input class="music-progress" type="range" min="0" max="100" step=".1" value="0" aria-label="Loop progress"><span class="music-duration">Loop</span></div><div class="music-controls"><button class="music-previous" type="button" aria-label="Previous track">|◀</button><button class="music-play" type="button" aria-label="Play music" aria-pressed="false">▶</button><button class="music-next" type="button" aria-label="Next track">▶|</button><label class="music-volume-wrap"><span aria-hidden="true">◖))</span><input class="music-volume" type="range" min="0" max=".65" step=".01" aria-label="Music volume"></label></div><section class="music-library" aria-label="Music library"><div class="music-library-heading"><strong>Your study playlist</strong><small>Original instrumentals</small></div><div class="music-filters"><button type="button" class="active" data-filter="All">All</button><button type="button" data-filter="Calm">Calm</button><button type="button" data-filter="Lo-fi">Lo-fi</button><button type="button" data-filter="Afro Chill">Afro Chill</button><button type="button" data-filter="Favourites">♥</button></div><div class="music-track-list"></div><p class="music-license-note">Original Academic Tracker compositions · No third-party songs or samples</p></section><p class="music-footnote">Optional background music · Starts only when you press play</p>';
 document.body.append(panel);launcher=document.createElement("button");launcher.type="button";launcher.className="music-launcher";launcher.textContent="♫";launcher.setAttribute("aria-label","Reopen Music Studio");launcher.title="Open Music Studio";launcher.hidden=true;document.body.append(launcher);launcher.addEventListener("click",()=>{dismissed=false;update();});panel.querySelector(".music-close").addEventListener("click",()=>{if(playing)pause();dismissed=true;update();});playBtn=panel.querySelector(".music-play");status=panel.querySelector(".music-status");progress=panel.querySelector(".music-progress");elapsed=panel.querySelector(".music-elapsed");duration=panel.querySelector(".music-duration");volume=panel.querySelector(".music-volume");favBtn=panel.querySelector(".music-favorite");list=panel.querySelector(".music-track-list");volume.value=String(Math.max(0,Math.min(.65,Number(prefs.volume??.32))));
 playBtn.addEventListener("click",()=>playing?pause():play());panel.querySelector(".music-previous").addEventListener("click",()=>select(current-1,playing));panel.querySelector(".music-next").addEventListener("click",()=>select(current+1,playing));panel.querySelector(".music-expand").addEventListener("click",()=>{expanded=!expanded;update();});
 favBtn.addEventListener("click",()=>{const id=tracks[current].id;favorites.has(id)?favorites.delete(id):favorites.add(id);save();update();});
 progress.addEventListener("input",()=>{const beat=60/tracks[current].bpm;elapsedBefore=beat*16*Number(progress.value)/100;step=Math.floor(LOOP_STEPS*Number(progress.value)/100)%LOOP_STEPS;if(playing){startedAt=ctx.currentTime;startTimer();}});
 volume.addEventListener("input",()=>{if(ctx&&master)master.gain.setTargetAtTime(Number(volume.value),ctx.currentTime,.12);save();});
 panel.querySelectorAll("[data-filter]").forEach(b=>b.addEventListener("click",()=>{filter=b.dataset.filter;panel.querySelectorAll("[data-filter]").forEach(x=>x.classList.toggle("active",x===b));renderList();}));
 list.addEventListener("click",e=>{const b=e.target.closest("[data-track-index]");if(b)select(Number(b.dataset.trackIndex),true);});
 document.addEventListener("visibilitychange",()=>{if(document.hidden&&playing)pause();});
 window.addEventListener("pagehide",()=>{if(timer)clearInterval(timer);if(ctx&&ctx.state!=="closed")ctx.close().catch(()=>{});});
 update();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();