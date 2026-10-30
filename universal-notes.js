(() => {
"use strict";
if (document.getElementById("at-notes-launcher")) return;
const API=(window.AT_API_BASE||"https://academic-tracker-0b2q.onrender.com").replace(/\/$/,"");
const token=localStorage.getItem("academic-tracker-token");
if(!token)return;
const el=(tag,attrs={},text="")=>{const node=document.createElement(tag);Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,v));if(text)node.textContent=text;return node;};
const css=el("link",{rel:"stylesheet",href:"universal-notes.css"});document.head.append(css);
const launcher=el("button",{id:"at-notes-launcher",class:"at-notes-launcher",type:"button","aria-label":"Open quick notes"});
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
let activeId=null,notes=[];
const currentContext=()=>{const file=location.pathname.split("/").pop()||"Workspace";return file.replace(".html","").replace(/[-_]/g," ").replace(/\b\w/g,c=>c.toUpperCase());};
const open=()=>{drawer.classList.add("is-open");backdrop.classList.add("is-open");drawer.setAttribute("aria-hidden","false");loadNotes();titleInput.focus();};
const shut=()=>{drawer.classList.remove("is-open");backdrop.classList.remove("is-open");drawer.setAttribute("aria-hidden","true");};
const request=async(path,options={})=>{const response=await fetch(API+"/api/user-data/study-notes"+path,{...options,headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",...(options.headers||{})}});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"Could not sync your note.");return data;};
function reset(){activeId=null;titleInput.value="";subjectInput.value="";topicInput.value="";content.value="";status.textContent="New note. Add a title and start writing."; }
function render(){list.replaceChildren();notes.slice(0,8).forEach(note=>{const button=el("button",{type:"button"});button.append(el("strong",{},note.data.title),el("small",{},[note.data.subject,note.data.topic].filter(Boolean).join(" · ")||"Personal note"));button.addEventListener("click",()=>{activeId=note.recordId;titleInput.value=note.data.title||"";subjectInput.value=note.data.subject||"";topicInput.value=note.data.topic||"";content.value=note.data.content||"";status.textContent="Editing saved note.";});list.append(button);});if(!notes.length)list.append(el("p",{}, "Your saved notes will appear here."));}
async function loadNotes(){try{const result=await request("");notes=result.records||[];render();}catch(error){status.textContent=error.message;}}
async function saveNote(){const noteTitle=titleInput.value.trim(),body=content.value.trim();if(!noteTitle){status.textContent="Give your note a title first.";titleInput.focus();return;}if(!body){status.textContent="Write something before saving.";content.focus();return;}const id=activeId||("note-"+(crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random().toString(36).slice(2)));const data={title:noteTitle,content:body,subject:subjectInput.value.trim(),topic:topicInput.value.trim(),context:currentContext(),updatedAt:new Date().toISOString()};save.disabled=true;status.textContent="Saving to your account…";try{await request("/"+encodeURIComponent(id),{method:"PUT",body:JSON.stringify({data})});activeId=id;status.textContent="Saved. Your note is available on your other devices too.";await loadNotes();}catch(error){status.textContent=error.message;}finally{save.disabled=false;}}
// Let each user place the floating launcher where it suits their screen.
const launcherPositionKey="academic-tracker-quick-notes-position-v1";
let drag=null,suppressLauncherClick=false;
const clamp=(value,min,max)=>Math.min(Math.max(value,min),Math.max(min,max));
function restoreLauncherPosition(){
  try{
    const saved=JSON.parse(localStorage.getItem(launcherPositionKey)||"null");
    if(!saved||!Number.isFinite(saved.left)||!Number.isFinite(saved.top))return;
    const maxLeft=window.innerWidth-launcher.offsetWidth-8,maxTop=window.innerHeight-launcher.offsetHeight-8;
    launcher.style.left=clamp(saved.left,8,maxLeft)+"px";
    launcher.style.top=clamp(saved.top,8,maxTop)+"px";
    launcher.style.right="auto";launcher.style.bottom="auto";
  }catch(_){}
}
function saveLauncherPosition(){
  const rect=launcher.getBoundingClientRect();
  try{localStorage.setItem(launcherPositionKey,JSON.stringify({left:Math.round(rect.left),top:Math.round(rect.top)}));}catch(_){}
}
launcher.addEventListener("pointerdown",event=>{
  if(event.button!==undefined&&event.button!==0)return;
  const rect=launcher.getBoundingClientRect();
  drag={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,left:rect.left,top:rect.top,moved:false};
});
launcher.addEventListener("pointermove",event=>{
  if(!drag||event.pointerId!==drag.pointerId)return;
  const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;
  if(!drag.moved&&Math.hypot(dx,dy)<5)return;
  drag.moved=true;suppressLauncherClick=true;
  launcher.classList.add("is-dragging");
  launcher.style.left=clamp(drag.left+dx,8,window.innerWidth-launcher.offsetWidth-8)+"px";
  launcher.style.top=clamp(drag.top+dy,8,window.innerHeight-launcher.offsetHeight-8)+"px";
  launcher.style.right="auto";launcher.style.bottom="auto";
  if(event.cancelable)event.preventDefault();
});
function finishLauncherDrag(event){
  if(!drag||event.pointerId!==drag.pointerId)return;
  const moved=drag.moved;drag=null;launcher.classList.remove("is-dragging");
  if(moved){saveLauncherPosition();setTimeout(()=>{suppressLauncherClick=false;},0);}
}
launcher.addEventListener("pointerup",finishLauncherDrag);
launcher.addEventListener("pointercancel",finishLauncherDrag);
launcher.addEventListener("click",event=>{if(suppressLauncherClick){event.preventDefault();event.stopImmediatePropagation();suppressLauncherClick=false;return;}open();});
window.addEventListener("resize",()=>{
  if(!launcher.style.left&&!launcher.style.top)return;
  const rect=launcher.getBoundingClientRect();
  launcher.style.left=clamp(rect.left,8,window.innerWidth-launcher.offsetWidth-8)+"px";
  launcher.style.top=clamp(rect.top,8,window.innerHeight-launcher.offsetHeight-8)+"px";
  saveLauncherPosition();
});
requestAnimationFrame(restoreLauncherPosition);
close.addEventListener("click",shut);backdrop.addEventListener("click",shut);fresh.addEventListener("click",reset);save.addEventListener("click",saveNote);
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&drawer.classList.contains("is-open"))shut();});
const params=new URLSearchParams(location.search);if(params.get("note")==="new"){open();titleInput.value=params.get("title")||"";subjectInput.value=params.get("subject")||"";topicInput.value=params.get("topic")||"";}
})();