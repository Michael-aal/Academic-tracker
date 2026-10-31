(() => {
"use strict";
if (document.getElementById("at-notes-launcher")) return;
const API=(window.AT_API_BASE||"https://academic-tracker-0b2q.onrender.com").replace(/\/$/,"");
const token=localStorage.getItem("academic-tracker-token");
if(!token)return;
const el=(tag,attrs={},text="")=>{const node=document.createElement(tag);Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,v));if(text)node.textContent=text;return node;};
const css=el("link",{rel:"stylesheet",href:"universal-notes.css"});css.addEventListener("load",()=>requestAnimationFrame(restoreLauncherPosition),{once:true});document.head.append(css);
const launcher=el("button",{id:"at-notes-launcher",class:"at-notes-launcher",type:"button","aria-label":"Open quick notes","aria-keyshortcuts":"ArrowUp ArrowDown ArrowLeft ArrowRight Home","title":"Open quick notes · Drag to move · Use arrow keys to reposition"});
launcher.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h10l4 4v14H5z"/><path d="M14 3v5h5M8 12h8M8 16h8"/></svg><span>Quick notes</span>';
const backdrop=el("div",{class:"at-notes-backdrop","aria-hidden":"true"});
const drawer=el("aside",{class:"at-notes-drawer","aria-label":"Quick notes","aria-hidden":"true"});
const head=el("div",{class:"at-notes-head"}),titleWrap=el("div");
titleWrap.append(el("h2",{},"Quick notes"),el("p",{class:"at-notes-sub"},"Capture an idea without leaving this page."));
const close=el("button",{class:"at-notes-close",type:"button","aria-label":"Close notes"},"×");head.append(titleWrap,close);
const titleLabel=el("label",{},"Note title"),titleInput=el("input",{maxlength:"120",placeholder:"e.g. Key ideas from today's lesson"});
titleLabel.append(titleInput);
const subjectLabel=el("label",{},"Subject (optional)"),subjectInput=el("input",{maxlength:"100",placeholder:"e.g. Physics"});subjectLabel.append(subjectInput);
const topicLabel=el("label",{},"Topic (optional)"),topicInput=el("input",{maxlength:"160",placeholder:"e.g. Newton's laws"});topicLabel.append(topicInput);
const contentLabel=el("label",{},"Your notes"),content=el("textarea",{maxlength:"12000",placeholder:"Type your key points, examples, questions, or anything you want to remember…"});
contentLabel.append(content);
const actions=el("div",{class:"at-notes-actions"}),save=el("button",{class:"primary",type:"button"},"Save note"),fresh=el("button",{type:"button"},"New note"),all=el("a",{href:"notes.html"},"All notes");
actions.append(save,fresh,all);
const status=el("p",{class:"at-notes-status","aria-live":"polite"},"Notes are saved to your account and sync across devices.");
const listTitle=el("strong",{},"Recent notes"),list=el("div",{class:"at-notes-list"});
drawer.append(head,titleLabel,subjectLabel,topicLabel,contentLabel,actions,status,listTitle,list);
document.body.append(launcher,backdrop,drawer);
let activeId=null,notes=[],savedSnapshot="";
const snapshot=()=>JSON.stringify([titleInput.value,subjectInput.value,topicInput.value,content.value]);
const hasUnsavedChanges=()=>snapshot()!==savedSnapshot;

const currentContext=()=>{const file=location.pathname.split("/").pop()||"Workspace";return file.replace(".html","").replace(/[-_]/g," ").replace(/\b\w/g,c=>c.toUpperCase());};
const open=()=>{drawer.classList.add("is-open");backdrop.classList.add("is-open");drawer.setAttribute("aria-hidden","false");loadNotes();titleInput.focus();};
const shut=()=>{if(hasUnsavedChanges()&&(titleInput.value||subjectInput.value||topicInput.value||content.value)&&!window.confirm("You have unsaved note changes. Close without saving?"))return;drawer.classList.remove("is-open");backdrop.classList.remove("is-open");drawer.setAttribute("aria-hidden","true");launcher.focus();};
const request=async(path,options={})=>{const response=await fetch(API+"/api/user-data/study-notes"+path,{...options,headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",...(options.headers||{})}});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"Could not sync your note.");return data;};
function reset(){if(hasUnsavedChanges()&&(titleInput.value||subjectInput.value||topicInput.value||content.value)&&!window.confirm("Discard this unsaved note and start a new one?"))return;activeId=null;titleInput.value="";subjectInput.value="";topicInput.value="";content.value="";savedSnapshot=snapshot();status.textContent="New note. Add a title and start writing."; }
function render(){list.replaceChildren();notes.slice(0,8).forEach(note=>{const button=el("button",{type:"button"});button.append(el("strong",{},note.data.title),el("small",{},[note.data.subject,note.data.topic].filter(Boolean).join(" · ")||"Personal note"));button.addEventListener("click",()=>{activeId=note.recordId;titleInput.value=note.data.title||"";subjectInput.value=note.data.subject||"";topicInput.value=note.data.topic||"";content.value=note.data.content||"";savedSnapshot=snapshot();status.textContent="Editing saved note.";});list.append(button);});if(!notes.length)list.append(el("p",{}, "Your saved notes will appear here."));}
async function loadNotes(){try{const result=await request("");notes=result.records||[];render();}catch(error){status.textContent=error.message;}}
async function saveNote(){const noteTitle=titleInput.value.trim(),body=content.value.trim();if(!noteTitle){status.textContent="Give your note a title first.";titleInput.focus();return;}if(!body){status.textContent="Write something before saving.";content.focus();return;}const id=activeId||("note-"+(crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random().toString(36).slice(2)));const data={title:noteTitle,content:body,subject:subjectInput.value.trim(),topic:topicInput.value.trim(),context:currentContext(),updatedAt:new Date().toISOString()};save.disabled=true;status.textContent="Saving to your account…";try{await request("/"+encodeURIComponent(id),{method:"PUT",body:JSON.stringify({data})});activeId=id;savedSnapshot=snapshot();status.textContent="Saved. Your note is available on your other devices too.";await loadNotes();}catch(error){status.textContent=error.message;}finally{save.disabled=false;}}

// Movable launcher: Pointer Events cover mouse, pen and touch without separate gesture code.
const positionKey="study-track-quick-note-position-v1";
let drag=null,suppressLauncherClick=false;
function clampLauncher(x,y){
 const r=launcher.getBoundingClientRect(),pad=12;
 return {x:Math.max(pad,Math.min(x,window.innerWidth-r.width-pad)),y:Math.max(pad,Math.min(y,window.innerHeight-r.height-pad))};
}
function setLauncherPosition(x,y,persist=false){
 const p=clampLauncher(x,y);
 launcher.style.left=p.x+"px";launcher.style.top=p.y+"px";launcher.style.right="auto";launcher.style.bottom="auto";
 if(persist){try{localStorage.setItem(positionKey,JSON.stringify(p));}catch(_){}}
}
function launcherPosition(){const r=launcher.getBoundingClientRect();return {x:r.left,y:r.top};}
function restoreLauncherPosition(){
 try{const p=JSON.parse(localStorage.getItem(positionKey)||"null");if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y))setLauncherPosition(p.x,p.y);}catch(_){}
}
launcher.addEventListener("pointerdown",event=>{
 if(event.button!==undefined&&event.button!==0)return;
 const p=launcherPosition();
 drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:p.x,top:p.y,moved:false};
 try{launcher.setPointerCapture(event.pointerId);}catch(_){}
});
launcher.addEventListener("pointermove",event=>{
 if(!drag||event.pointerId!==drag.id)return;
 const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
 if(!drag.moved&&Math.hypot(dx,dy)<5)return;
 drag.moved=true;event.preventDefault();setLauncherPosition(drag.left+dx,drag.top+dy);
});
function finishLauncherDrag(event){
 if(!drag||event.pointerId!==drag.id)return;
 if(drag.moved){
  const p=launcherPosition();setLauncherPosition(p.x,p.y,true);
  suppressLauncherClick=true;window.setTimeout(()=>{suppressLauncherClick=false;},350);
 }
 drag=null;
}
launcher.addEventListener("pointerup",finishLauncherDrag);
launcher.addEventListener("pointercancel",finishLauncherDrag);
launcher.addEventListener("lostpointercapture",()=>{drag=null;});
launcher.addEventListener("keydown",event=>{
 const step=event.shiftKey?32:12,p=launcherPosition();let x=p.x,y=p.y;
 if(event.key==="ArrowLeft")x-=step;else if(event.key==="ArrowRight")x+=step;
 else if(event.key==="ArrowUp")y-=step;else if(event.key==="ArrowDown")y+=step;
 else if(event.key==="Home"){x=window.innerWidth-launcher.offsetWidth-18;y=window.innerHeight-launcher.offsetHeight-(window.innerWidth<=760?104:24);}
 else return;
 event.preventDefault();setLauncherPosition(x,y,true);
});
window.addEventListener("resize",()=>{const p=launcherPosition();setLauncherPosition(p.x,p.y,true);});
requestAnimationFrame(restoreLauncherPosition);
launcher.addEventListener("click",()=>{if(!suppressLauncherClick)open();});
close.addEventListener("click",shut);backdrop.addEventListener("click",shut);fresh.addEventListener("click",reset);save.addEventListener("click",saveNote);
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&drawer.classList.contains("is-open"))shut();});
const params=new URLSearchParams(location.search);if(params.get("note")==="new"){open();titleInput.value=params.get("title")||"";subjectInput.value=params.get("subject")||"";topicInput.value=params.get("topic")||"";savedSnapshot=snapshot();}
})();