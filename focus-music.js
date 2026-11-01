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
let filter="All",playing=false,expanded=false,ctx=null,master=null,timer=null,nextTime=0,step=0,startedAt=0,elapsedBefore=0;
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
 if(!ctx||ctx.state!=="running"||!playing)return;
 const beat=60/tracks[current].bpm,d=beat/4;
 while(nextTime<ctx.currentTime+.13){schedule(step,nextTime);step=(step+1)%LOOP_STEPS;nextTime+=d;}
}
function startTimer(){if(timer)clearInterval(timer);nextTime=ctx.currentTime+.08;timer=setInterval(tick,25);}
function update(){
 if(!soundButton)return;
 soundButton.textContent=playing?"Ⅱ":"♫";
 soundButton.setAttribute("aria-label",playing?"Pause background sound":"Play background sound");
 soundButton.setAttribute("aria-pressed",String(playing));
 soundButton.title=playing?"Pause background sound":"Play background sound";
 soundButton.classList.toggle("is-playing",playing);
}
async function play(){
 try{
  ensureAudio();await ctx.resume();
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setTargetAtTime(Number(prefs.volume??.32),ctx.currentTime,.45);
  playing=true;startedAt=ctx.currentTime;startTimer();
 }catch(_){playing=false;}
 update();
}
function pause(){
 if(timer)clearInterval(timer);timer=null;
 if(ctx&&master&&ctx.state!=="closed"){
  elapsedBefore+=Math.max(0,ctx.currentTime-startedAt);
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setTargetAtTime(.0001,ctx.currentTime,.08);
  setTimeout(()=>{if(!playing&&ctx&&ctx.state==="running")ctx.suspend().catch(()=>{});},280);
 }
 playing=false;update();
}
function init(){
 if(document.querySelector(".music-sound-toggle"))return;
 soundButton=document.createElement("button");
 soundButton.type="button";
 soundButton.className="music-sound-toggle";
 soundButton.textContent="♫";
 soundButton.setAttribute("aria-label","Play background sound");
 soundButton.setAttribute("aria-pressed","false");
 soundButton.title="Play background sound";
 document.body.append(soundButton);
 soundButton.addEventListener("click",()=>playing?pause():play());
 document.addEventListener("visibilitychange",()=>{if(document.hidden&&playing)pause();});
 window.addEventListener("pagehide",()=>{if(timer)clearInterval(timer);if(ctx&&ctx.state!=="closed")ctx.close().catch(()=>{});});
 update();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
