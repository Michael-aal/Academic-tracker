(() => {
  "use strict";
  const DB_NAME = "academic-tracker-db";
  const STORE = "state";
  const KEY = "main";
  const defaults = () => ({version:1, academicYear:"2026–2027", term:"Term 1", subjects:[], scores:{}, targets:{}, updatedAt:new Date().toISOString()});
  let state = defaults();
  let view = "dashboard";
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
  const dbOpen = () => new Promise((resolve,reject) => {
    if (!("indexedDB" in window)) return resolve(null);
    const req = indexedDB.open(DB_NAME,1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  async function load() {
    try {
      const db = await dbOpen();
      if (db) {
        const value = await new Promise((resolve,reject) => { const tx=db.transaction(STORE,"readonly"); const r=tx.objectStore(STORE).get(KEY); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); });
        db.close(); if (value) state = {...defaults(),...value};
      } else { const raw=localStorage.getItem(KEY); if(raw) state={...defaults(),...JSON.parse(raw)}; }
    } catch(e) { console.warn("Could not load saved records",e); }
    render();
  }
  async function save() {
    state.updatedAt = new Date().toISOString();
    try {
      const db = await dbOpen();
      if (db) { await new Promise((resolve,reject) => { const tx=db.transaction(STORE,"readwrite"); tx.objectStore(STORE).put(state,KEY); tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); }); db.close(); }
      else localStorage.setItem(KEY,JSON.stringify(state));
    } catch(e) { alert("Could not save your changes. Please check available device storage and export a backup."); console.error(e); }
    render();
  }
  const id = () => (crypto.randomUUID ? crypto.randomUUID() : "s"+Date.now()+Math.random().toString(16).slice(2));
  const comps = ["CA1","CA2","CA3","Exam"];
  const maxFor = (sid,c) => num((state.scores[sid]||{})[c+"Max"] ?? (c==="Exam"?70:10));
  const scoreFor = (sid,c) => { const s=(state.scores[sid]||{})[c]; return s === "" || s === null || s === undefined ? null : num(s); };
  const totalFor = sid => comps.reduce((sum,c)=>sum+(scoreFor(sid,c) ?? 0),0);
  const maxTotal = sid => comps.reduce((sum,c)=>sum+maxFor(sid,c),0);
  const enteredCount = sid => comps.filter(c=>scoreFor(sid,c)!==null).length;
  const complete = sid => enteredCount(sid)===4;
  const percent = sid => maxTotal(sid) ? Math.round(totalFor(sid)/maxTotal(sid)*100) : 0;
  const targetFor = sid => num(state.targets[sid] ?? 75);
  const scoreKey = sid => state.academicYear+"|"+state.term+"|"+sid;
  function subjectScore(sid) { const s=state.scores[scoreKey(sid)] || {}; return s; }
  function getActual(sid,c) { const v=subjectScore(sid)[c]; return v===undefined||v===null||v===""?null:num(v); }
  function getMax(sid,c) { return num(subjectScore(sid)[c+"Max"] ?? (c==="Exam"?70:10)); }
  function getTotal(sid) { return comps.reduce((a,c)=>a+(getActual(sid,c)??0),0); }
  function getMaxTotal(sid) { return comps.reduce((a,c)=>a+getMax(sid,c),0); }
  function getEntered(sid) { return comps.filter(c=>getActual(sid,c)!==null).length; }
  function isComplete(sid) { return getEntered(sid)===4; }
  function pct(sid) { const m=getMaxTotal(sid);return m?Math.round(getTotal(sid)/m*100):0; }
  function average() { const list=state.subjects.filter(s=>getEntered(s.id)>0); return list.length?Math.round(list.reduce((a,s)=>a+pct(s.id),0)/list.length):0; }
  function setView(next) { view=next; document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view)); render(); window.scrollTo({top:0,behavior:"smooth"}); }
  function heading(title,subtitle,action="") { return '<div class="section-heading"><div><h2>'+title+'</h2><p>'+subtitle+'</p></div>'+action+'</div>'; }
  function stat(label,value,foot) { return '<article class="card"><div class="stat-label">'+label+'</div><div class="stat-value">'+value+'</div><div class="stat-foot">'+foot+'</div></article>'; }
  function subjectRows() {
    if(!state.subjects.length) return '<div class="empty"><strong>Your tracker starts with one subject.</strong>Add the subjects you study, then record targets and scores.<br><br><button class="button primary" data-action="add-subject">＋ Add a subject</button></div>';
    return state.subjects.map(s=>{const n=getEntered(s.id),p=pct(s.id);return '<div class="subject-row"><div class="subject-icon">'+esc(s.name.trim().slice(0,1).toUpperCase())+'</div><div class="subject-info"><strong>'+esc(s.name)+'</strong><small>'+n+'/4 assessments entered · Target '+targetFor(s.id)+'%</small><div class="progress-track" style="margin-top:9px"><div class="progress-fill" style="width:'+p+'%"></div></div></div><div class="subject-score">'+(n?p+'%':'—')+'<small>'+(n?getTotal(s.id)+'/'+getMaxTotal(s.id):"No scores")+'</small></div></div>';}).join("");
  }
  function dashboard() {
    const total=state.subjects.length, withScores=state.subjects.filter(s=>getEntered(s.id)>0).length, completeSubjects=state.subjects.filter(s=>isComplete(s.id)).length;
    const pending=state.subjects.reduce((a,s)=>a+4-getEntered(s.id),0);
    return '<div class="grid stats-grid">'+stat("SUBJECTS",total,"In your current tracker")+stat("CURRENT AVERAGE",withScores?average()+"%":"—",withScores?"Across subjects with scores":"Enter scores to calculate")+stat("ASSESSMENTS ENTERED",state.subjects.reduce((a,s)=>a+getEntered(s.id),0), "of "+(total*4)+" possible entries")+stat("MISSING SCORES",pending,pending?"Missing scores are not treated as zero":"All subject components entered")+'</div>'+
    '<div class="grid content-grid">'+
    '<section>'+heading("Your subjects","Progress for "+esc(state.term)+" · "+esc(state.academicYear),'<button class="button primary" data-action="add-subject">＋ Add subject</button>')+'<article class="card">'+subjectRows()+'</article></section>'+
    '<section>'+heading("Study snapshot","A quick view of what needs attention")+'<article class="card"><h3>Assessment coverage</h3><div class="report-total">'+(total?Math.round((total*4-pending)/(total*4)*100):0)+'<small>%</small></div><p class="notice">Coverage counts scores you have entered. A missing mark stays missing; it is never silently counted as zero.</p><div class="progress-track"><div class="progress-fill" style="width:'+(total?((total*4-pending)/(total*4)*100):0)+'%"></div></div><div class="progress-row"><span>Complete subjects</span><strong>'+completeSubjects+' of '+total+'</strong></div><div class="progress-row"><span>Term</span><strong>'+esc(state.term)+'</strong></div><div class="progress-row"><span>Academic year</span><strong>'+esc(state.academicYear)+'</strong></div><div class="callout" style="margin-top:18px">'+(pending?'Next step: enter missing assessment marks in Score entry. Check your teacher’s returned scripts or class records before filling any mark.':'Nice work — every subject has all four component scores entered.')+'</div><div class="button-row" style="margin-top:16px"><button class="button primary" data-view="scores">Enter scores →</button><button class="button secondary" data-view="reports">View report</button></div></article></section></div>';
  }
  function scoresView() {
    if(!state.subjects.length) return '<article class="card">'+subjectRows()+'</article>';
    const rows=state.subjects.map(s=>'<tr><td><strong>'+esc(s.name)+'</strong><br><span class="notice">Target '+targetFor(s.id)+'%</span></td>'+comps.map(c=>'<td><input aria-label="'+esc(s.name)+' '+c+' score" type="number" min="0" max="'+getMax(s.id,c)+'" step="0.5" data-score="'+s.id+'" data-component="'+c+'" value="'+(getActual(s.id,c)??'')+'" placeholder="—"></td>').join('')+'<td><span class="badge '+(isComplete(s.id)?"":"warn")+'">'+(isComplete(s.id)?pct(s.id)+"%":getEntered(s.id)+"/4")+'</span></td></tr>').join("");
    return '<article class="card"><p class="notice">Enter scores only when you know the mark. Leave a component blank if it has not been returned. Default maximums are CA1/10, CA2/10, CA3/10 and Exam/70; you can adjust them below.</p><div class="table-wrap"><table><thead><tr><th>Subject / target</th><th>CA1</th><th>CA2</th><th>CA3</th><th>Exam</th><th>Progress</th></tr></thead><tbody>'+rows+'</tbody></table></div><div class="section-heading"><div><h3>Assessment maximums</h3><p>Change the maximum score for each component as needed.</p></div></div><div class="table-wrap"><table><thead><tr><th>Subject</th>'+comps.map(c=>'<th>'+c+' max</th>').join('')+'</tr></thead><tbody>'+state.subjects.map(s=>'<tr><td>'+esc(s.name)+'</td>'+comps.map(c=>'<td><input aria-label="'+esc(s.name)+' '+c+' maximum" type="number" min="1" max="100" data-max="'+s.id+'" data-component="'+c+'" value="'+getMax(s.id,c)+'"></td>').join('')+'</tr>').join('')+'</tbody></table></div><div class="button-row" style="margin-top:18px"><button class="button primary" data-action="save-scores">Save scores</button><button class="button secondary" data-action="complete-check">Check completion</button></div><p class="notice" style="margin-top:12px">Scores save to this device. Changing a maximum can change the percentage, so verify component maximums before relying on a report.</p></article>';
  }
  function subjectsView() {
    return '<article class="card">'+heading("Your subjects","Add, rename, or remove subjects",'<button class="button primary" data-action="add-subject">＋ Add subject</button>')+(state.subjects.length?state.subjects.map(s=>'<div class="subject-row"><div class="subject-icon">'+esc(s.name.slice(0,1).toUpperCase())+'</div><div class="subject-info"><strong>'+esc(s.name)+'</strong><small>Target: '+targetFor(s.id)+'% · '+getEntered(s.id)+' scores entered</small></div><button class="button secondary" data-action="rename-subject" data-id="'+s.id+'">Rename</button><button class="button danger" data-action="delete-subject" data-id="'+s.id+'">Remove</button></div>').join(""):'<div class="empty"><strong>No subjects yet</strong>Add the subjects you want to track.</div>')+'</article><p class="notice">Removing a subject also removes its scores from this device. Export a backup first if you may need the records later.</p>';
  }
  function reportsView() {
    if(!state.subjects.length) return '<article class="card"><div class="empty"><strong>No report yet</strong>Add subjects and enter assessment marks to build your report.</div></article>';
    const list=state.subjects.filter(s=>getEntered(s.id)>0);
    const overall=average();
    const sorted=[...list].sort((a,b)=>pct(a.id)-pct(b.id));
    return '<div class="grid content-grid"><article class="card"><p class="eyebrow">CURRENT TERM REPORT</p><h2>'+esc(state.term)+' · '+esc(state.academicYear)+'</h2><div class="report-total">'+(list.length?overall+"%":"—")+'</div><p class="notice">Average of subjects with at least one entered component. This is a progress estimate until every subject component is entered.</p><div class="progress-track"><div class="progress-fill" style="width:'+overall+'%"></div></div><div class="progress-row"><span>Subjects with marks</span><strong>'+list.length+'/'+state.subjects.length+'</strong></div><div class="progress-row"><span>Fully entered subjects</span><strong>'+state.subjects.filter(s=>isComplete(s.id)).length+'/'+state.subjects.length+'</strong></div></article><article class="card"><h3>What to focus on next</h3>'+(sorted.length?sorted.slice(0,3).map(s=>'<div class="subject-row"><div class="subject-icon">'+esc(s.name.slice(0,1).toUpperCase())+'</div><div class="subject-info"><strong>'+esc(s.name)+'</strong><small>'+pct(s.id)+'% · target '+targetFor(s.id)+'%</small></div><span class="badge '+(pct(s.id)<targetFor(s.id)?"warn":"")+'">'+(pct(s.id)<targetFor(s.id)?"Below target":"On target")+'</span></div>').join(""):'<p class="notice">Enter scores to identify subjects needing attention.</p>')+'<p class="notice">A low score alone cannot explain why a subject is difficult. Review returned scripts, topics missed, practice questions, and teacher feedback before choosing a study strategy.</p></article></div>'+
    heading("Subject breakdown","Component totals and target comparison")+'<article class="card"><div class="table-wrap"><table><thead><tr><th>Subject</th><th>CA1</th><th>CA2</th><th>CA3</th><th>Exam</th><th>Total</th><th>Target</th><th>Status</th></tr></thead><tbody>'+state.subjects.map(s=>'<tr><td>'+esc(s.name)+'</td>'+comps.map(c=>'<td>'+(getActual(s.id,c)===null?'—':getActual(s.id,c)+'/'+getMax(s.id,c))+'</td>').join('')+'<td><strong>'+getTotal(s.id)+'/'+getMaxTotal(s.id)+'</strong><br><span class="notice">'+(getEntered(s.id)?pct(s.id)+'%':'No marks')+'</span></td><td>'+targetFor(s.id)+'%</td><td><span class="badge '+(getEntered(s.id)&&pct(s.id)<targetFor(s.id)?"warn":"")+'">'+(isComplete(s.id)?(pct(s.id)>=targetFor(s.id)?"Target met":"Below target"):getEntered(s.id)+"/4 entered")+'</span></td></tr>').join("")+'</tbody></table></div><div class="button-row" style="margin-top:16px"><button class="button primary" data-action="export">Export backup</button><button class="button secondary" data-action="print">Print report</button></div></article>';
  }
  function settingsView() {
    return '<div class="grid settings-grid"><article class="card"><h2>Academic period</h2><p class="notice">Choose the current year and term. Your subjects and scores remain saved separately for each period.</p><label class="field">Academic year<input id="academic-year" value="'+esc(state.academicYear)+'" placeholder="2026–2027" maxlength="30"></label><br><label class="field">Current term<select id="current-term">'+["Term 1","Term 2","Term 3"].map(t=>'<option '+(state.term===t?"selected":"")+'>'+t+'</option>').join("")+'</select></label><br><button class="button primary" data-action="save-period">Save period</button></article><article class="card"><h2>Backup & restore</h2><p class="notice">Your records are stored in this browser on this device. Export backups regularly so you can recover your records if browser data is cleared.</p><div class="button-row"><button class="button primary" data-action="export">Download JSON backup</button><button class="button secondary" data-action="import">Restore JSON backup</button></div><p class="notice" style="margin-top:15px">Restore replaces the current tracker data. Export a backup first if you want to keep a copy of the current records.</p></article><article class="card"><h2>Score targets</h2><p class="notice">Targets are stored separately from actual marks. Set a target per subject here.</p>'+state.subjects.map(s=>'<div class="subject-row"><div class="subject-info"><strong>'+esc(s.name)+'</strong><small>Target percentage</small></div><input class="target-input" aria-label="'+esc(s.name)+' target" type="number" min="0" max="100" value="'+targetFor(s.id)+'" data-target="'+s.id+'">%</div>').join("")+'<button class="button primary" data-action="save-targets" style="margin-top:15px">Save targets</button></article><article class="card"><h2>About your data</h2><p class="notice">Academic Tracker is an offline-first personal PWA. It does not upload your marks to a server. Keep your phone protected and store backups somewhere you trust.</p><div class="callout">Last saved: '+esc(new Date(state.updatedAt).toLocaleString())+'</div></article></div>';
  }
  function render() {
    const titles={dashboard:"Dashboard",scores:"Score entry",subjects:"Subjects",reports:"Reports",settings:"Backup & settings"};
    $("#page-title").textContent=titles[view]||"Dashboard";
    $("#year-label").textContent=state.academicYear+" · "+state.term;
    $("#app").innerHTML=({dashboard,scores:scoresView,subjects:subjectsView,reports:reportsView,settings:settingsView}[view]||dashboard)();
    document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  }
  function openSubjectDialog() { $("#subject-name").value=""; $("#subject-target").value="75"; $("#subject-dialog").showModal(); }
  async function addSubject() {
    const name=$("#subject-name").value.trim(), target=num($("#subject-target").value);
    if(!name) return;
    if(state.subjects.some(s=>s.name.toLowerCase()===name.toLowerCase())) { alert("That subject already exists."); return; }
    const sid=id(); state.subjects.push({id:sid,name,createdAt:new Date().toISOString()}); state.targets[sid]=Math.max(0,Math.min(100,target)); await save(); $("#subject-dialog").close();
  }
  async function exportBackup() {
    const blob=new Blob([JSON.stringify({app:"Academic Tracker",schemaVersion:1,exportedAt:new Date().toISOString(),data:state},null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="academic-tracker-backup-"+new Date().toISOString().slice(0,10)+".json";a.click();URL.revokeObjectURL(url);
  }
  async function importBackup(file) {
    if(!file) return;
    try { const parsed=JSON.parse(await file.text()), data=parsed.data||parsed;
      if(!data||!Array.isArray(data.subjects)||typeof data.scores!=="object") throw new Error("This file does not look like an Academic Tracker backup.");
      if(!confirm("Restore this backup? It will replace the tracker data currently on this device.")) return;
      state={...defaults(),...data}; await save(); alert("Backup restored.");
    } catch(e) { alert("Could not restore backup: "+e.message); }
    finally { $("#import-file").value=""; }
  }
  $("#subject-form").addEventListener("submit",e=>{e.preventDefault();addSubject();});
  $("#quick-add").addEventListener("click",openSubjectDialog);
  document.addEventListener("click",async e=>{
    const nav=e.target.closest("[data-view]"); if(nav){e.preventDefault();setView(nav.dataset.view);return;}
    const b=e.target.closest("[data-action]"); if(!b)return;
    const action=b.dataset.action, sid=b.dataset.id;
    if(action==="add-subject") openSubjectDialog();
    if(action==="save-scores") {
      for(const inp of document.querySelectorAll("[data-score]")) {
        const key=scoreKey(inp.dataset.score), c=inp.dataset.component; state.scores[key]=state.scores[key]||{};
        if(inp.value.trim()==="") delete state.scores[key][c];
        else {const v=Number(inp.value),m=getMax(inp.dataset.score,c);if(!Number.isFinite(v)||v<0||v>m){alert(inp.getAttribute("aria-label")+" must be between 0 and "+m+".");inp.focus();return;}state.scores[key][c]=v;}
      }
      for(const inp of document.querySelectorAll("[data-max]")) {const key=scoreKey(inp.dataset.max),c=inp.dataset.component;state.scores[key]=state.scores[key]||{};const m=Number(inp.value);if(!Number.isFinite(m)||m<=0||m>100){alert(c+" maximum must be between 1 and 100.");inp.focus();return;}state.scores[key][c+"Max"]=m;const score=state.scores[key][c];if(score!==undefined&&score>m){alert(c+" score cannot exceed its maximum.");inp.focus();return;}}
      await save(); alert("Scores saved on this device.");
    }
    if(action==="complete-check") { const missing=state.subjects.filter(s=>!isComplete(s.id)); if(missing.length){alert("Still missing scores for: "+missing.map(s=>s.name+" ("+(4-getEntered(s.id))+" missing)").join(", "));}else if(!state.subjects.length){alert("Add subjects first.");}else if(confirm("All four components have scores for every subject. Open the current report?"))setView("reports"); }
    if(action==="rename-subject") {const s=state.subjects.find(x=>x.id===sid);if(!s)return;const name=prompt("Rename subject",s.name);if(name&&name.trim()){s.name=name.trim();await save();}}
    if(action==="delete-subject") {const s=state.subjects.find(x=>x.id===sid);if(!s||!confirm("Remove "+s.name+" and its saved scores? Export a backup first if needed."))return;state.subjects=state.subjects.filter(x=>x.id!==sid);delete state.targets[sid];Object.keys(state.scores).forEach(k=>{if(k.endsWith("|"+sid))delete state.scores[k];});await save();}
    if(action==="save-period") {const year=$("#academic-year").value.trim();if(!year){alert("Enter an academic year.");return;}state.academicYear=year;state.term=$("#current-term").value;await save();alert("Academic period saved.");}
    if(action==="export") exportBackup();
    if(action==="import") $("#import-file").click();
    if(action==="save-targets") {for(const inp of document.querySelectorAll("[data-target]")){const v=Number(inp.value);if(!Number.isFinite(v)||v<0||v>100){alert("Targets must be between 0 and 100.");inp.focus();return;}state.targets[inp.dataset.target]=v;}await save();alert("Targets saved.");}
    if(action==="print") window.print();
  });
  $("#import-file").addEventListener("change",e=>importBackup(e.target.files[0]));
  $("#app").addEventListener("change",e=>{
    const t=e.target;
    if(t.matches("[data-score]")) {
      const key=scoreKey(t.dataset.score),c=t.dataset.component;state.scores[key]=state.scores[key]||{};
      if(t.value.trim()==="") delete state.scores[key][c]; else state.scores[key][c]=Number(t.value);
      // Save each score as it is edited; explicit Save scores also validates the whole table.
      save();
    }
    if(t.matches("[data-max]")) {const key=scoreKey(t.dataset.max),c=t.dataset.component;state.scores[key]=state.scores[key]||{};state.scores[key][c+"Max"]=Number(t.value)||1;save();}
    if(t.matches("[data-target]")) {state.targets[t.dataset.target]=Number(t.value)||0;save();}
  });
  if("serviceWorker" in navigator && location.protocol!=="file:") window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(e=>console.warn("Offline caching unavailable",e)));
  load();
})();