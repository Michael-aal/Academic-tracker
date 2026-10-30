(() => {
  "use strict";
  const DB_NAME = "academic-tracker-db";
  const STORE = "state";
  const KEY = "main";
  const defaults = () => ({version:2, accountUserId:null, academicYear:"2026–2027", term:"Term 1", subjects:[], scores:{}, targets:{}, assessments:{}, updatedAt:new Date().toISOString()});
  let state = defaults();
  let view = "dashboard";
  let focusHistory = [];
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
  const API_BASE = (window.AT_API_BASE || "https://academic-tracker-0b2q.onrender.com").replace(/\/$/, "");
  const apiToken = () => localStorage.getItem("academic-tracker-token") || "";
  const accountUserId = () => { try { return JSON.parse(localStorage.getItem("academic-tracker-user") || "null")?.id || null; } catch { return null; } };
  async function apiRequest(path, options = {}) {
    const token = apiToken();
    if (!token) throw new Error("Your session is missing. Please log in again.");
    const response = await fetch(API_BASE + path, {
      ...options,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not sync your subjects. Please try again.");
    return data;
  }
  function remapSubjectId(oldId, newId) {
    if (!oldId || !newId || oldId === newId) return;
    if (state.targets[oldId] !== undefined && state.targets[newId] === undefined) state.targets[newId] = state.targets[oldId];
    delete state.targets[oldId];
    if (state.assessments[oldId] && !state.assessments[newId]) state.assessments[newId] = state.assessments[oldId];
    delete state.assessments[oldId];
    for (const key of Object.keys(state.scores)) {
      if (!key.endsWith("|" + oldId)) continue;
      const nextKey = key.slice(0, -oldId.length) + newId;
      state.scores[nextKey] = { ...(state.scores[key] || {}), ...(state.scores[nextKey] || {}) };
      delete state.scores[key];
    }
    const focus = focusSession();
    if (focus?.subjectId === oldId) saveFocusSession({ ...focus, subjectId: newId });
  }
  async function syncSubjectsFromServer() {
    if (!apiToken()) return;
    const data = await apiRequest("/api/subjects?academicYear=" + encodeURIComponent(state.academicYear) + "&term=" + encodeURIComponent(state.term));
    const trackerData = await apiRequest("/api/user-data/secondary-tracker");
    const savedTracker = trackerData.records?.find(record => record.recordId === "main")?.data;
    if (savedTracker) {
      state.scores = { ...state.scores, ...(savedTracker.scores || {}) };
      state.assessments = { ...state.assessments, ...(savedTracker.assessments || {}) };
      state.targets = { ...state.targets, ...(savedTracker.targets || {}) };
      state.academicYear = savedTracker.academicYear || state.academicYear;
      state.term = savedTracker.term || state.term;
    }
    const remoteSubjects = Array.isArray(data.subjects) ? data.subjects : [];
    const previous = [...state.subjects];
    const synced = [];
    for (const remote of remoteSubjects) {
      const local = previous.find(subject => subject.serverId === remote.id || subject.name.trim().toLocaleLowerCase("en") === remote.name.trim().toLocaleLowerCase("en"));
      if (local) remapSubjectId(local.id, remote.id);
      synced.push({ ...(local || {}), id: remote.id, serverId: remote.id, name: remote.name, createdAt: remote.createdAt || local?.createdAt || new Date().toISOString() });
      state.targets[remote.id] = remote.targetPercentage;
    }
    for (const local of previous) {
      if (synced.some(subject => subject.serverId === local.serverId || subject.name.trim().toLocaleLowerCase("en") === local.name.trim().toLocaleLowerCase("en"))) continue;
      const created = await apiRequest("/api/subjects", { method: "POST", body: JSON.stringify({ name: local.name, targetPercentage: targetFor(local.id) }) });
      remapSubjectId(local.id, created.subject.id);
      synced.push({ ...local, id: created.subject.id, serverId: created.subject.id });
    }
    state.subjects = synced;
    state.accountUserId = accountUserId();
    if (!savedTracker) {
      await apiRequest("/api/user-data/secondary-tracker/main", {
        method: "PUT",
        body: JSON.stringify({ data: { scores: state.scores, assessments: state.assessments, targets: state.targets, academicYear: state.academicYear, term: state.term } })
      });
    }
    await save(false);
  }
  async function archiveLegacyState(userId) {
    const backupKey = "legacy-backup-" + userId;
    const legacyFocus = (() => { try { return JSON.parse(localStorage.getItem("academic-tracker-focus-session") || "null"); } catch { return null; } })();
    const backupData = { ...state, legacyFocusSession: legacyFocus };
    try {
      const db = await dbOpen();
      if (db) {
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, "readwrite");
          tx.objectStore(STORE).put(backupData, backupKey);
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
        db.close();
      } else {
        localStorage.setItem("academic-tracker-legacy-backup:" + userId, JSON.stringify(backupData));
      }
    } catch (error) {
      console.error("Could not archive legacy local records", error);
      throw new Error("Your previous browser records could not be safely archived. Please export a backup before continuing.");
    }
  }
  async function load() {
    try {
      const db = await dbOpen();
      if (db) {
        const value = await new Promise((resolve,reject) => { const tx=db.transaction(STORE,"readonly"); const r=tx.objectStore(STORE).get(KEY); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); });
        db.close(); if (value) state = {...defaults(),...value};
      } else { const raw=localStorage.getItem(KEY); if(raw) state={...defaults(),...JSON.parse(raw)}; }
    } catch(e) { console.warn("Could not load saved records",e); }
    const signedInUserId = accountUserId();
    const legacyFocus = (() => { try { return JSON.parse(localStorage.getItem("academic-tracker-focus-session") || "null"); } catch { return null; } })();
    const hasUnownedLegacyData = !state.accountUserId && signedInUserId && (state.subjects.length > 0 || Object.keys(state.scores).length > 0 || Boolean(legacyFocus));
    if (hasUnownedLegacyData) {
      const importLegacy = window.confirm("We found academic records saved in this browser. Import them into the account you just signed into? Only choose OK if these records belong to you. Choose Cancel to keep them separate from this account.");
      if (!importLegacy) {
        await archiveLegacyState(signedInUserId);
        state = defaults();
        localStorage.removeItem("academic-tracker-focus-session");
        alert("Your previous browser records were kept in a separate local backup and were not added to this account.");
      } else if (legacyFocus) {
        localStorage.setItem(FOCUS_KEY, JSON.stringify(legacyFocus));
        localStorage.removeItem("academic-tracker-focus-session");
      }
    }
    if (state.accountUserId && signedInUserId && state.accountUserId !== signedInUserId) state = defaults();
    if (signedInUserId) state.accountUserId = signedInUserId;
    try {
      await syncSubjectsFromServer();
    } catch (e) {
      console.error("Could not sync academic tracker data with the account database", e);
      if (apiToken()) {
        const notice = document.createElement("p");
        notice.className = "notice";
        notice.setAttribute("role", "status");
        notice.textContent = "Your academic records could not be synced with your account. Changes may remain only on this device until the connection is restored. " + e.message;
        $("#app")?.prepend(notice);
      }
    }
    try {
      const focusData = await apiRequest("/api/user-data/focus-sessions");
      focusHistory = (focusData.records || []).filter(record => record.recordId !== "active" && record.data?.status === "completed").map(record => ({ ...record.data, savedAt: record.updatedAt })).slice(0, 20);
      const remoteFocus = focusData.records?.find(record => record.recordId === "active")?.data;
      if (remoteFocus) localStorage.setItem(FOCUS_KEY, JSON.stringify(remoteFocus));
      else if (focusSession()) await apiRequest("/api/user-data/focus-sessions/active", { method: "PUT", body: JSON.stringify({ data: focusSession() }) });
    } catch (e) {
      console.warn("Could not sync focus history with the account database", e);
    }
    render();
  }
  async function save(renderAfter = true) {
    state.updatedAt = new Date().toISOString();
    try {
      const db = await dbOpen();
      if (db) { await new Promise((resolve,reject) => { const tx=db.transaction(STORE,"readwrite"); tx.objectStore(STORE).put(state,KEY); tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); }); db.close(); }
      else localStorage.setItem(KEY,JSON.stringify(state));
    } catch(e) { alert("Could not save your changes on this device. Please check available storage and export a backup."); console.error(e); }
    if (apiToken()) {
      try {
        await apiRequest("/api/user-data/secondary-tracker/main", {
          method: "PUT",
          body: JSON.stringify({ data: { scores: state.scores, assessments: state.assessments, targets: state.targets, academicYear: state.academicYear, term: state.term } })
        });
      } catch (error) {
        console.error("Account data sync failed", error);
        if (renderAfter) alert("Your changes are saved on this device, but could not sync to your account. Please check your connection before switching devices.");
      }
    }
    if (renderAfter) render();
  }
  const id = () => (crypto.randomUUID ? crypto.randomUUID() : "s"+Date.now()+Math.random().toString(16).slice(2));
  const defaultAssessments = (sid) => { const old= sid ? subjectScore(sid) : {}; return [
    {id:"CA1",name:"Test 1",type:"TEST",max:num(old.CA1Max??10)},
    {id:"CA2",name:"Test 2",type:"TEST",max:num(old.CA2Max??10)},
    {id:"CA3",name:"Test 3",type:"TEST",max:num(old.CA3Max??10)},
    {id:"Exam",name:"Final exam",type:"EXAM",max:num(old.ExamMax??70)}
  ]; };
  const scoreKey = sid => state.academicYear+"|"+state.term+"|"+sid;
  function subjectScore(sid) { return state.scores[scoreKey(sid)] || {}; }
  function itemsFor(sid) {
    if (!Array.isArray(state.assessments[sid]) || !state.assessments[sid].length) state.assessments[sid] = defaultAssessments(sid);
    return state.assessments[sid];
  }
  function getActual(sid,item) { const v=subjectScore(sid)[item.id]; return v===undefined||v===null||v===""?null:num(v); }
  function getTotal(sid) { return itemsFor(sid).reduce((a,item)=>a+(getActual(sid,item)??0),0); }
  function getMaxTotal(sid) { return itemsFor(sid).reduce((a,item)=>a+num(item.max),0); }
  function getEntered(sid) { return itemsFor(sid).filter(item=>getActual(sid,item)!==null).length; }
  function isComplete(sid) { return itemsFor(sid).length>0 && getEntered(sid)===itemsFor(sid).length; }
  function pct(sid) { const m=getMaxTotal(sid);return m?Math.round(getTotal(sid)/m*100):0; }
  const targetFor = sid => num(state.targets[sid] ?? 75);
  function average() { const list=state.subjects.filter(s=>getEntered(s.id)>0); return list.length?Math.round(list.reduce((a,s)=>a+pct(s.id),0)/list.length):0; }
  const FOCUS_KEY = "academic-tracker-focus-session:" + (accountUserId() || "legacy");
  const focusSession = () => { try { return JSON.parse(localStorage.getItem(FOCUS_KEY) || "null"); } catch { return null; } };
  const saveFocusSession = session => {
    if(session) localStorage.setItem(FOCUS_KEY, JSON.stringify(session)); else localStorage.removeItem(FOCUS_KEY);
    if (!session && apiToken()) apiRequest("/api/user-data/focus-sessions/active", { method: "DELETE" }).catch(error => console.warn("Could not clear saved focus session", error));
    if (session && apiToken()) {
      apiRequest("/api/user-data/focus-sessions/active", { method: "PUT", body: JSON.stringify({ data: session }) })
        .catch(error => console.warn("Could not sync focus session", error));
      if (session.status === "completed") {
        const recordId = "session-" + String(session.startedAt || session.completedAt || Date.now()).replace(/[^a-zA-Z0-9_-]/g, "-");
        apiRequest("/api/user-data/focus-sessions/" + encodeURIComponent(recordId), { method: "PUT", body: JSON.stringify({ data: session }) })
          .catch(error => console.warn("Could not save focus session history", error));
      }
    }
  };
  const formatFocusTime = ms => { const seconds=Math.max(0,Math.ceil(ms/1000)); return String(Math.floor(seconds/60)).padStart(2,"0")+":"+String(seconds%60).padStart(2,"0"); };
  function setView(next) { view=next; document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view)); render(); window.scrollTo({top:0,behavior:"smooth"}); }
  function heading(title,subtitle,action="") { return '<div class="section-heading"><div><h2>'+title+'</h2><p>'+subtitle+'</p></div>'+action+'</div>'; }
  function stat(label,value,foot) { return '<article class="card"><div class="stat-label">'+label+'</div><div class="stat-value">'+value+'</div><div class="stat-foot">'+foot+'</div></article>'; }
  function subjectRows() {
    if(!state.subjects.length) return '<div class="empty"><strong>Your tracker starts with one subject.</strong>Add the subjects you study, then record targets and scores.<br><br><button class="button primary" data-action="add-subject">＋ Add a subject</button></div>';
    return state.subjects.map(s=>{const n=getEntered(s.id),p=pct(s.id);return '<div class="subject-row"><div class="subject-icon">'+esc(s.name.trim().slice(0,1).toUpperCase())+'</div><div class="subject-info"><strong>'+esc(s.name)+'</strong><small>'+n+'/'+itemsFor(s.id).length+' assessments entered · Target '+targetFor(s.id)+'%</small><div class="progress-track" style="margin-top:9px"><div class="progress-fill" style="width:'+p+'%"></div></div></div><div class="subject-score">'+(n?p+'%':'—')+'<small>'+(n?getTotal(s.id)+'/'+getMaxTotal(s.id):"No scores")+'</small></div></div>';}).join("");
  }
  function dashboard() {
    const total=state.subjects.length, withScores=state.subjects.filter(s=>getEntered(s.id)>0).length, completeSubjects=state.subjects.filter(s=>isComplete(s.id)).length;
    const pending=state.subjects.reduce((a,s)=>a+itemsFor(s.id).length-getEntered(s.id),0);
    return '<div class="grid stats-grid">'+stat("SUBJECTS",total,"In your current tracker")+stat("CURRENT AVERAGE",withScores?average()+"%":"—",withScores?"Across subjects with scores":"Enter scores to calculate")+stat("ASSESSMENTS ENTERED",state.subjects.reduce((a,s)=>a+getEntered(s.id),0), "of "+state.subjects.reduce((a,s)=>a+itemsFor(s.id).length,0)+" possible entries")+stat("MISSING SCORES",pending,pending?"Missing scores are not treated as zero":"All subject assessments entered")+'</div>'+
    '<section class="focus-promo card"><div class="focus-promo-icon" aria-hidden="true">◎</div><div class="focus-promo-copy"><span class="focus-kicker">FOCUS SHIELD</span><h2>Make time for one important task.</h2><p>Start a quiet study session, use a simple timer, and return to your work when distractions happen.</p></div><button class="button primary" data-view="focus">Start a focus session <span aria-hidden="true">→</span></button></section>'+
    '<div class="grid content-grid">'+
    '<section>'+heading("Your subjects","Progress for "+esc(state.term)+" · "+esc(state.academicYear),'<button class="button primary" data-action="add-subject">＋ Add subject</button>')+'<article class="card">'+subjectRows()+'</article></section>'+
    '<section>'+heading("Study snapshot","A quick view of what needs attention")+'<article class="card"><h3>Assessment coverage</h3><div class="report-total">'+(total?Math.round((state.subjects.reduce((a,s)=>a+itemsFor(s.id).length,0)-pending)/(state.subjects.reduce((a,s)=>a+itemsFor(s.id).length,0)||1)*100):0)+'<small>%</small></div><p class="notice">Coverage counts scores you have entered. A missing mark stays missing; it is never silently counted as zero.</p><div class="progress-track"><div class="progress-fill" style="width:'+(total?((state.subjects.reduce((a,s)=>a+itemsFor(s.id).length,0)-pending)/(state.subjects.reduce((a,s)=>a+itemsFor(s.id).length,0)||1)*100):0)+'%"></div></div><div class="progress-row"><span>Complete subjects</span><strong>'+completeSubjects+' of '+total+'</strong></div><div class="progress-row"><span>Term</span><strong>'+esc(state.term)+'</strong></div><div class="progress-row"><span>Academic year</span><strong>'+esc(state.academicYear)+'</strong></div><div class="callout" style="margin-top:18px">'+(pending?'Next step: enter missing assessment marks in Score entry. Check your teacher’s returned scripts or class records before filling any mark.':'Nice work — every subject has all assessment scores entered.')+'</div><div class="button-row" style="margin-top:16px"><button class="button primary" data-view="scores">Enter scores →</button><button class="button secondary" data-view="reports">View report</button></div></article></section></div>';
  }
  function scoresView() {
    if(!state.subjects.length) return '<article class="card">'+subjectRows()+'</article>';
    const cards=state.subjects.map(subject=>{
      const items=itemsFor(subject.id);
      const fields=items.map(item=>'<div class="assessment-field"><label>Assessment name<input maxlength="50" value="'+esc(item.name)+'" data-assessment-name="'+esc(subject.id)+'" data-assessment-id="'+esc(item.id)+'"></label><label>Maximum mark<input type="number" min="1" max="100" step="0.5" value="'+num(item.max)+'" data-assessment-max="'+esc(subject.id)+'" data-assessment-id="'+esc(item.id)+'"></label><label>Your score<input aria-label="'+esc(subject.name)+' '+esc(item.name)+' score" type="number" min="0" max="'+num(item.max)+'" step="0.5" value="'+(getActual(subject.id,item)??'')+'" placeholder="Not entered" data-score="'+esc(subject.id)+'" data-component="'+esc(item.id)+'"></label><button class="button danger" type="button" data-action="remove-assessment" data-id="'+esc(subject.id)+'" data-assessment-id="'+esc(item.id)+'" '+(item.type==="EXAM"?'disabled aria-label="The final exam cannot be removed; edit its name if needed':'')+'>Remove</button></div>').join("");
      return '<section class="card assessment-subject"><div class="section-heading"><div><h3>'+esc(subject.name)+'</h3><p>Target '+targetFor(subject.id)+'% · '+getTotal(subject.id)+' / '+getMaxTotal(subject.id)+' marks · '+(getEntered(subject.id)===items.length?'All marks entered':getEntered(subject.id)+' of '+items.length+' marks entered')+'</p></div><span class="badge">'+pct(subject.id)+'%</span></div>'+fields+'<div class="button-row"><button class="button secondary" data-action="add-assessment" data-kind="TEST" data-id="'+esc(subject.id)+'">＋ Add test</button><button class="button secondary" data-action="add-assessment" data-kind="ASSIGNMENT" data-id="'+esc(subject.id)+'">＋ Add assignment</button>'+(items.some(i=>i.type==="EXAM")?'':'<button class="button secondary" data-action="add-assessment" data-kind="EXAM" data-id="'+esc(subject.id)+'">＋ Add exam</button>')+'<button class="button primary" data-action="apply-assessment-all" data-id="'+esc(subject.id)+'">Apply this setup to all subjects</button></div></section>';
    }).join("");
    return '<p class="notice">Default secondary-school setup: three tests and one final exam. Customize each subject independently. Scores and assessment setups are synced to your account database. Assessment maximums should match your teacher’s marking scheme.</p><div class="button-row" style="margin:14px 0"><button class="button secondary" data-action="add-subject">＋ Add subject</button></div><div class="grid">'+cards+'</div><p class="notice">For each subject, add as many tests or assignments as needed. Only one final exam is allowed in a subject setup. “Apply this setup to all subjects” copies the selected subject’s assessment structure to every subject.</p>';
  }
  function subjectsView() {
    return '<article class="card">'+heading("Your subjects","Add, rename, or remove subjects",'<button class="button primary" data-action="add-subject">＋ Add subject</button>')+(state.subjects.length?state.subjects.map(s=>'<div class="subject-row"><div class="subject-icon">'+esc(s.name.slice(0,1).toUpperCase())+'</div><div class="subject-info"><strong>'+esc(s.name)+'</strong><small>Target: '+targetFor(s.id)+'% · '+getEntered(s.id)+' scores entered</small></div><button class="button secondary" data-action="rename-subject" data-id="'+s.id+'">Rename</button><button class="button danger" data-action="delete-subject" data-id="'+s.id+'">Remove</button></div>').join(""):'<div class="empty"><strong>No subjects yet</strong>Add the subjects you want to track.</div>')+'</article><p class="notice">Removing a subject also removes its saved scores. Subjects, targets, scores, and assessment setups are synced to your account.</p>';
  }
  function reportsView() {
    if(!state.subjects.length) return '<article class="card"><div class="empty"><strong>No report yet</strong>Add subjects and enter assessment marks to build your report.</div></article>';
    const list=state.subjects.filter(subject=>getEntered(subject.id)>0), overall=average(), sorted=[...list].sort((a,b)=>pct(a.id)-pct(b.id));
    const rows=state.subjects.map(subject=>'<tr><td>'+esc(subject.name)+'</td><td>'+itemsFor(subject.id).map(item=>'<div>'+esc(item.name)+': '+(getActual(subject.id,item)===null?'—':getActual(subject.id,item)+'/'+num(item.max))+'</div>').join('')+'</td><td><strong>'+getTotal(subject.id)+'/'+getMaxTotal(subject.id)+'</strong><br><span class="notice">'+(getEntered(subject.id)?pct(subject.id)+'%':'No marks')+'</span></td><td>'+targetFor(subject.id)+'%</td><td><span class="badge '+(getEntered(subject.id)&&pct(subject.id)<targetFor(subject.id)?'warn':'')+'">'+(getEntered(subject.id)?(pct(subject.id)<targetFor(subject.id)?'Below target':'On target'):'Awaiting marks')+'</span></td></tr>').join('');
    return '<div class="grid content-grid"><article class="card"><p class="eyebrow">CURRENT TERM REPORT</p><h2>'+esc(state.term)+' · '+esc(state.academicYear)+'</h2><div class="report-total">'+(list.length?overall+'%':'—')+'</div><p class="notice">Average of subjects with at least one entered mark. This remains a progress estimate until all configured assessments are entered.</p><div class="progress-track"><div class="progress-fill" style="width:'+overall+'%"></div></div><div class="progress-row"><span>Subjects with marks</span><strong>'+list.length+'/'+state.subjects.length+'</strong></div><div class="progress-row"><span>Fully entered subjects</span><strong>'+state.subjects.filter(subject=>isComplete(subject.id)).length+'/'+state.subjects.length+'</strong></div></article><article class="card"><h3>What to focus on next</h3>'+(sorted.length?sorted.slice(0,3).map(subject=>'<div class="subject-row"><div class="subject-icon">'+esc(subject.name.slice(0,1).toUpperCase())+'</div><div class="subject-info"><strong>'+esc(subject.name)+'</strong><small>'+pct(subject.id)+'% · target '+targetFor(subject.id)+'%</small></div><span class="badge '+(pct(subject.id)<targetFor(subject.id)?'warn':'')+'">'+(pct(subject.id)<targetFor(subject.id)?'Below target':'On target')+'</span></div>').join(''):'<p class="notice">Enter marks to identify subjects needing attention.</p>')+'<p class="notice">Review returned scripts, topics missed, practice questions and teacher feedback before choosing a study strategy.</p></article></div>'+heading('Subject breakdown','All configured assessments and target comparisons')+'<article class="card"><div class="table-wrap"><table><thead><tr><th>Subject</th><th>Assessment marks</th><th>Total</th><th>Target</th><th>Status</th></tr></thead><tbody>'+rows+'</tbody></table></div></article>';
  }
  function settingsView() {
    return '<div class="grid settings-grid"><article class="card"><h2>Academic period</h2><p class="notice">Choose the current year and term. Your subjects and scores remain saved separately for each period.</p><label class="field">Academic year<input id="academic-year" value="'+esc(state.academicYear)+'" placeholder="2026–2027" maxlength="30"></label><br><label class="field">Current term<select id="current-term">'+["Term 1","Term 2","Term 3"].map(t=>'<option '+(state.term===t?"selected":"")+'>'+t+'</option>').join("")+'</select></label><br><button class="button primary" data-action="save-period">Save period</button></article><article class="card"><h2>Backup & restore</h2><p class="notice">Your subjects, targets, scores, and custom assessment setups are synced to your account. Export backups regularly so you have an independent copy of your academic records.</p><div class="button-row"><button class="button primary" data-action="export">Download JSON backup</button><button class="button secondary" data-action="import">Restore JSON backup</button></div><p class="notice" style="margin-top:15px">Restore replaces the current tracker data. Export a backup first if you want to keep a copy of the current records.</p></article><article class="card"><h2>Score targets</h2><p class="notice">Targets are stored separately from actual marks. Set a target per subject here.</p>'+state.subjects.map(s=>'<div class="subject-row"><div class="subject-info"><strong>'+esc(s.name)+'</strong><small>Target percentage</small></div><input class="target-input" aria-label="'+esc(s.name)+' target" type="number" min="0" max="100" value="'+targetFor(s.id)+'" data-target="'+s.id+'">%</div>').join("")+'<button class="button primary" data-action="save-targets" style="margin-top:15px">Save targets</button></article><article class="card"><h2>About your data</h2><p class="notice">Your subjects, targets, scores, and custom assessment setups are saved to your account database. Export backups regularly so you can recover your records if needed.</p><div class="callout">Last saved: '+esc(new Date(state.updatedAt).toLocaleString())+'</div></article></div>';
  }
  function focusView() {
    let session=focusSession();
    if(session && session.status==="running" && Date.now()>=session.endsAt) {
      session={...session,status:"completed",remainingMs:0,endsAt:null,completedAt:new Date().toISOString()};
      saveFocusSession(session);
    }
    const running=!!session&&session.status==="running";
    const paused=!!session&&session.status==="paused";
    const completed=!!session&&session.status==="completed";
    const remaining=session?(running?Math.max(0,session.endsAt-Date.now()):Number(session.remainingMs)||0):25*60*1000;
    const task=esc(session?.task||"");
    const subjectOptions=state.subjects.map(s=>'<option value="'+esc(s.id)+'" '+(session?.subjectId===s.id?'selected':'')+'>'+esc(s.name)+'</option>').join("");
    const timer=formatFocusTime(remaining);
    const status=running?"Focus session active":paused?"Session paused":completed?"Session complete":"Ready when you are";
    return '<section class="focus-shell">'+
      '<div class="focus-intro"><span class="focus-kicker"><span class="focus-kicker-dot"></span> FOCUS SHIELD</span><h2>Give one task your attention.</h2><p>Choose a task, set a realistic session, and work without distractions inside your study space.</p></div>'+
      '<article class="card focus-panel">'+
        '<div class="focus-panel-top"><div><span class="stat-label">YOUR SESSION</span><h3>'+status+'</h3></div><span class="focus-status '+(running?'is-running':paused?'is-paused':completed?'is-complete':'')+'">'+(running?'ACTIVE':paused?'PAUSED':completed?'COMPLETE':'READY')+'</span></div>'+
        '<div class="focus-clock" id="focus-clock" aria-live="off">'+timer+'</div>'+
        '<p class="focus-task-current">'+(task||"Your next focused session starts here.")+'</p>'+
        '<div class="focus-progress-track" aria-hidden="true"><span id="focus-progress" style="width:'+(session&&session.durationMs?Math.max(0,Math.min(100,((session.durationMs-remaining)/session.durationMs)*100)):0)+'%"></span></div>'+
        '<div class="focus-controls">'+
          (running?'<button class="button secondary" type="button" data-focus-action="pause">Pause</button>':'')+
          (paused?'<button class="button primary" type="button" data-focus-action="resume">Resume focus</button>':'')+
          (completed?'<button class="button primary" type="button" data-focus-action="new">Start another</button>':'')+
          (!running&&!paused&&!completed?'<button class="button primary" type="button" data-focus-action="start">Start focus</button>':'')+
          ((running||paused)?'<button class="button secondary" type="button" data-focus-action="end">End session</button>':'')+
        '</div>'+
        '<p class="focus-disclaimer">This timer manages your study session on this website. It cannot detect or silence notifications from other apps.</p>'+
      '</article>'+
      '<div class="grid focus-setup-grid">'+
        '<article class="card focus-setup-card"><div class="focus-card-icon" aria-hidden="true">◎</div><h3>Set up your focus</h3><p class="notice">Choose a subject or enter one clear task. You can change the duration for each session.</p>'+
          '<label for="focus-subject">Subject (optional)</label><select id="focus-subject" '+(running||paused?'disabled':'')+'><option value="">Choose a subject</option>'+subjectOptions+'</select>'+
          '<label for="focus-task">What will you work on?</label><input id="focus-task" maxlength="120" value="'+task+'" placeholder="e.g. Understand Newton’s second law" '+(running||paused?'disabled':'')+'>'+
          '<label for="focus-duration">Session length</label><select id="focus-duration" '+(running||paused?'disabled':'')+'><option value="15" '+(session?.durationMinutes===15?'selected':'')+'>15 minutes</option><option value="25" '+(!session||session.durationMinutes===25?'selected':'')+'>25 minutes</option><option value="45" '+(session?.durationMinutes===45?'selected':'')+'>45 minutes</option><option value="60" '+(session?.durationMinutes===60?'selected':'')+'>60 minutes</option></select>'+
          '<button class="button secondary focus-apply" type="button" data-focus-action="apply" '+(running||paused?'disabled':'')+'>Apply session setup</button>'+
        '</article>'+
        '<article class="card focus-setup-card focus-notifications"><div class="focus-card-icon" aria-hidden="true">⌁</div><h3>Reduce phone interruptions</h3><p class="notice">For notifications from other apps, use your phone’s built-in Do Not Disturb control. Focus Shield cannot switch it on or verify its current state.</p>'+
          '<details><summary>How to enable Do Not Disturb</summary><ol><li>Swipe down from the top of your phone to open Quick Settings.</li><li>Find <strong>Do not disturb</strong>. You may need to swipe down again or edit the tiles.</li><li>Turn it on for your study session. Your phone may still allow alarms or selected calls.</li><li>When you finish studying, turn it off if you enabled it manually.</li></ol></details>'+
          '<div class="focus-honesty"><span aria-hidden="true">ⓘ</span><span>Notification settings stay under your control. Ending a website session does not change your phone settings.</span></div>'+
        '</article>'+
      '</div>'+
      '<article class="card focus-reset-card"><div><h3>One distraction doesn’t ruin a session.</h3><p class="notice">If you lose focus, return to your task and continue. Progress is about learning—not a perfect timer streak.</p></div><button class="button secondary" type="button" data-focus-action="reset">Reset session</button></article>'+
      '<article class="card focus-history-card"><div class="section-heading"><div><h3>Recent focus sessions</h3><p>Your completed sessions are saved to your account.</p></div><span class="badge">'+focusHistory.length+' saved</span></div>'+
        (focusHistory.length?focusHistory.map(item=>'<div class="subject-row"><div class="subject-icon">◎</div><div class="subject-info"><strong>'+esc(item.task||"Study session")+'</strong><small>'+esc(new Date(item.completedAt||item.savedAt).toLocaleString())+' · '+num(item.durationMinutes)+' minutes</small></div><span class="badge">Complete</span></div>').join(""):'<div class="empty"><strong>No completed sessions yet</strong>Finish a focus session and it will appear here.</div>')+
      '</article>'+
    '</section>';
  }
  function render() {
    const titles={dashboard:"Dashboard",scores:"Score entry",subjects:"Subjects",reports:"Reports",settings:"Backup & settings",focus:"Focus Shield"};
    $("#page-title").textContent=titles[view]||"Dashboard";
    $("#year-label").textContent=state.academicYear+" · "+state.term;
    $("#app").innerHTML=({dashboard,scores:scoresView,subjects:subjectsView,reports:reportsView,settings:settingsView,focus:focusView}[view]||dashboard)();
    document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  }
  function openSubjectDialog() { $("#subject-name").value=""; $("#subject-target").value="75"; $("#subject-dialog").showModal(); }
  async function addSubject() {
    const name=$("#subject-name").value.trim(), target=num($("#subject-target").value);
    if(!name) return;
    if(state.subjects.some(s=>s.name.toLowerCase()===name.toLowerCase())) { alert("That subject already exists."); return; }
    const sid=id();
    let serverId = null;
    if (apiToken()) {
      try { const result = await apiRequest("/api/subjects", { method: "POST", body: JSON.stringify({ name, targetPercentage: Math.max(0,Math.min(100,target)) }) }); serverId = result.subject.id; }
      catch (error) { alert(error.message); return; }
    } else { alert("Please log in again before adding a subject so it can be saved to your account."); return; }
    const subjectId = serverId || sid;
    state.subjects.push({id:subjectId,serverId:serverId || null,name,createdAt:new Date().toISOString()});
    state.targets[subjectId]=Math.max(0,Math.min(100,target)); state.assessments[subjectId]=defaultAssessments(); await save(); $("#subject-dialog").close();
  }
  async function readLegacyBackup() {
    const userId = accountUserId();
    if (!userId) return null;
    const key = "legacy-backup-" + userId;
    try {
      const db = await dbOpen();
      if (db) {
        const value = await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, "readonly");
          const request = tx.objectStore(STORE).get(key);
          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => reject(request.error);
        });
        db.close();
        return value;
      }
      return JSON.parse(localStorage.getItem("academic-tracker-legacy-backup:" + userId) || "null");
    } catch (error) { console.warn("Could not read the archived legacy backup", error); return null; }
  }
  async function exportBackup() {
    try {
      const account = await apiRequest("/api/account/export");
      const legacyDeviceBackup = await readLegacyBackup();
      const backup = { app: "Academic Tracker", schemaVersion: 2, exportedAt: new Date().toISOString(), data: state, account, legacyDeviceBackup };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = "academic-tracker-account-backup-" + new Date().toISOString().slice(0, 10) + ".json";
      a.click(); URL.revokeObjectURL(url);
    } catch (error) {
      alert("Could not export your full account backup. Please check your connection and try again. " + error.message);
    }
  }
  async function importBackup(file) {
    if(!file) return;
    try { const parsed=JSON.parse(await file.text()), data=parsed.data||parsed;
      if(!data||!Array.isArray(data.subjects)||typeof data.scores!=="object") throw new Error("This file does not look like an Academic Tracker backup.");
      if(!confirm("Restore this backup into the account you are currently signed into? Existing account subjects with matching names will be matched; other saved subjects and marks will be merged.")) return;
      if (data.accountUserId && accountUserId() && data.accountUserId !== accountUserId() && !confirm("This backup was created under a different account. Import its tracker records into your current account?")) return;
      state={...defaults(),...data,accountUserId:accountUserId()}; await syncSubjectsFromServer(); await save(); alert("Backup restored and synced to your account.");
    } catch(e) { alert("Could not restore backup: "+e.message); }
    finally { $("#import-file").value=""; }
  }
  $("#subject-form").addEventListener("submit",e=>{e.preventDefault();addSubject();});
  $("#close-subject-dialog").addEventListener("click",()=>$("#subject-dialog").close());
  $("#cancel-subject").addEventListener("click",()=>$("#subject-dialog").close());
  $("#quick-add").addEventListener("click",openSubjectDialog);
  document.addEventListener("click",async e=>{
    const nav=e.target.closest("[data-view]"); if(nav){e.preventDefault();setView(nav.dataset.view);return;}
    const b=e.target.closest("[data-action]"); if(!b)return;
    const action=b.dataset.action, sid=b.dataset.id;
    if(action==="add-subject") openSubjectDialog();
    if(action==="save-scores") {
      for(const inp of document.querySelectorAll("[data-score]")) {
        const key=scoreKey(inp.dataset.score), c=inp.dataset.component; state.scores[key]=state.scores[key]||{};
        const item=itemsFor(inp.dataset.score).find(x=>x.id===c), m=item?num(item.max):0;
        if(inp.value.trim()==="") delete state.scores[key][c];
        else {const v=Number(inp.value);if(!Number.isFinite(v)||v<0||v>m){alert(inp.getAttribute("aria-label")+" must be between 0 and "+m+".");inp.focus();return;}state.scores[key][c]=v;}
      }
      for(const inp of document.querySelectorAll("[data-assessment-name]")) {
        const list=itemsFor(inp.dataset.assessmentName), item=list.find(x=>x.id===inp.dataset.assessmentId);
        if(item && inp.value.trim()) item.name=inp.value.trim().slice(0,50);
      }
      for(const inp of document.querySelectorAll("[data-assessment-max]")) {
        const list=itemsFor(inp.dataset.assessmentMax), item=list.find(x=>x.id===inp.dataset.assessmentId), m=Number(inp.value);
        if(!Number.isFinite(m)||m<=0||m>100){alert("Assessment maximum must be between 1 and 100.");inp.focus();return;}
        if(item && subjectScore(inp.dataset.assessmentMax)[item.id]!=null && Number(subjectScore(inp.dataset.assessmentMax)[item.id])>m){alert(item.name+" score cannot exceed its maximum.");inp.focus();return;}
        if(item)item.max=m;
      }
      await save(); alert("Assessment setup and scores saved to your account.");
    }
    if(action==="add-assessment") {
      const list=itemsFor(sid),kind=b.dataset.kind;
      if(kind==="EXAM"&&list.some(x=>x.type==="EXAM")){alert("Only one final exam is allowed per subject.");return;}
      if(!state.assessments[sid])state.assessments[sid]=list.map(x=>({...x}));
      const count=list.filter(x=>x.type===kind).length;
      state.assessments[sid].push({id:id(),name:kind==="TEST"?"Test "+(count+1):kind==="ASSIGNMENT"?"Assignment "+(count+1):"Final exam",type:kind,max:kind==="EXAM"?70:10});
      await save();
    }
    if(action==="remove-assessment") {
      const list=itemsFor(sid),item=list.find(x=>x.id===b.dataset.assessmentId);
      if(!item)return;if(item.type==="EXAM"){alert("Keep one final exam in the setup. You can change its name and maximum mark.");return;}
      if(!confirm("Remove "+item.name+" from this subject? Its saved marks for this assessment will also be removed."))return;
      state.assessments[sid]=list.filter(x=>x.id!==item.id);
      Object.keys(state.scores).forEach(key=>{if(key.endsWith("|"+sid))delete state.scores[key][item.id];});
      await save();
    }
    if(action==="apply-assessment-all") {
      const source=itemsFor(sid);
      if(!confirm("Apply "+state.subjects.find(x=>x.id===sid)?.name+"'s assessment setup to all subjects? Existing marks are preserved only where assessment IDs match."))return;
      state.subjects.forEach(subject=>{if(subject.id!==sid)state.assessments[subject.id]=source.map(item=>({...item}));});
      await save();alert("Assessment setup applied to all subjects.");
    }
    if(action==="complete-check") { const missing=state.subjects.filter(s=>!isComplete(s.id)); if(missing.length){alert("Still missing scores for: "+missing.map(s=>s.name+" ("+(itemsFor(s.id).length-getEntered(s.id))+" missing)").join(", "));}else if(!state.subjects.length){alert("Add subjects first.");}else if(confirm("All assessment marks are entered for every subject. Open the current report?"))setView("reports"); }
    if(action==="rename-subject") {const s=state.subjects.find(x=>x.id===sid);if(!s)return;const name=prompt("Rename subject",s.name);if(name&&name.trim()){try{if(!s.serverId)throw new Error("This subject is not linked to your account yet.");await apiRequest("/api/subjects/"+encodeURIComponent(s.serverId),{method:"PATCH",body:JSON.stringify({name:name.trim()})});s.name=name.trim();await save();}catch(error){alert(error.message);}}}
    if(action==="delete-subject") {const s=state.subjects.find(x=>x.id===sid);if(!s||!confirm("Remove "+s.name+" and its saved scores? Export a backup first if needed."))return;try{if(!s.serverId)throw new Error("This subject is not linked to your account yet.");await apiRequest("/api/subjects/"+encodeURIComponent(s.serverId),{method:"DELETE"});state.subjects=state.subjects.filter(x=>x.id!==sid);delete state.targets[sid];delete state.assessments[sid];Object.keys(state.scores).forEach(k=>{if(k.endsWith("|"+sid))delete state.scores[k];});await save();}catch(error){alert(error.message);}}
    if(action==="save-period") {const year=$("#academic-year").value.trim();if(!year){alert("Enter an academic year.");return;}state.academicYear=year;state.term=$("#current-term").value;await save();alert("Academic period saved.");}
    if(action==="export") exportBackup();
    if(action==="import") $("#import-file").click();
    if(action==="save-targets") {const updates=[];for(const inp of document.querySelectorAll("[data-target]")){const v=Number(inp.value);if(!Number.isFinite(v)||v<0||v>100){alert("Targets must be between 0 and 100.");inp.focus();return;}const subject=state.subjects.find(item=>item.id===inp.dataset.target);if(!subject?.serverId){alert("A subject is not linked to your account yet. Please refresh and try again.");return;}updates.push(apiRequest("/api/subjects/"+encodeURIComponent(subject.serverId),{method:"PATCH",body:JSON.stringify({targetPercentage:v})}));state.targets[inp.dataset.target]=v;}try{await Promise.all(updates);await save();alert("Targets saved to your account.");}catch(error){alert("Could not save all targets to your account: "+error.message);}}
    if(action==="print") window.print();
  });
  document.addEventListener("click", e => {
    const button=e.target.closest("[data-focus-action]");
    if(!button)return;
    const action=button.dataset.focusAction;
    let session=focusSession();
    if(action==="apply" || action==="start") {
      const taskInput=$("#focus-task"), subjectSelect=$("#focus-subject"), durationSelect=$("#focus-duration");
      const subject=state.subjects.find(s=>s.id===subjectSelect?.value) || state.subjects.find(s=>s.id===session?.subjectId);
      const task=(taskInput?.value||"").trim() || subject?.name || "";
      if(!task){alert("Choose a subject or enter one clear study task first.");taskInput?.focus();return;}
      const minutes=Number(durationSelect?.value)||Number(session?.durationMinutes)||25;
      const durationMs=minutes*60*1000;
      if(action==="apply") {
        saveFocusSession({status:"ready",task,subjectId:subject?.id||"",durationMinutes:minutes,durationMs,remainingMs:durationMs,endsAt:null,updatedAt:new Date().toISOString()});
        render();return;
      }
      saveFocusSession({status:"running",task,subjectId:subject?.id||"",durationMinutes:minutes,durationMs,remainingMs:durationMs,endsAt:Date.now()+durationMs,startedAt:new Date().toISOString()});
      render();return;
    }
    if(action==="pause" && session?.status==="running") {
      session={...session,status:"paused",remainingMs:Math.max(0,session.endsAt-Date.now()),endsAt:null,pausedAt:new Date().toISOString()};
      saveFocusSession(session);render();return;
    }
    if(action==="resume" && session?.status==="paused") {
      session={...session,status:"running",endsAt:Date.now()+Math.max(0,session.remainingMs),resumedAt:new Date().toISOString()};
      saveFocusSession(session);render();return;
    }
    if(action==="end" && session) { saveFocusSession({...session,status:"ready",endsAt:null,remainingMs:session.durationMs||25*60*1000,endedAt:new Date().toISOString()});render();return; }
    if(action==="new" || action==="reset") { saveFocusSession(null);render();return; }
  });
  setInterval(() => {
    const session=focusSession();
    if(!session || session.status!=="running")return;
    const remaining=Math.max(0,session.endsAt-Date.now());
    const clock=$("#focus-clock"),progress=$("#focus-progress");
    if(clock)clock.textContent=formatFocusTime(remaining);
    if(progress&&session.durationMs)progress.style.width=Math.max(0,Math.min(100,((session.durationMs-remaining)/session.durationMs)*100))+"%";
    if(remaining===0) {
      saveFocusSession({...session,status:"completed",remainingMs:0,endsAt:null,completedAt:new Date().toISOString()});
      if(view==="focus")render();
    }
  },1000);
  $("#import-file").addEventListener("change",e=>importBackup(e.target.files[0]));
  $("#app").addEventListener("change",e=>{
    const t=e.target;
    if(t.matches("[data-score]")) {
      const key=scoreKey(t.dataset.score),c=t.dataset.component;state.scores[key]=state.scores[key]||{};
      if(t.value.trim()==="") delete state.scores[key][c]; else {
        const item=itemsFor(t.dataset.score).find(x=>x.id===c), value=Number(t.value);
        if(item&&(!Number.isFinite(value)||value<0||value>num(item.max))){alert("Score must be between 0 and "+item.max+".");t.value="";return;}
        state.scores[key][c]=value;
      }
      save(false);
    }
    if(t.matches("[data-assessment-name]")) {
      const list=itemsFor(t.dataset.assessmentName),item=list.find(x=>x.id===t.dataset.assessmentId);
      if(item&&t.value.trim())item.name=t.value.trim().slice(0,50);
      save(false);
    }
    if(t.matches("[data-assessment-max]")) {
      const list=itemsFor(t.dataset.assessmentMax),item=list.find(x=>x.id===t.dataset.assessmentId),m=Number(t.value);
      if(!Number.isFinite(m)||m<=0||m>100){alert("Assessment maximum must be between 1 and 100.");return;}
      if(item&&subjectScore(t.dataset.assessmentMax)[item.id]!=null&&Number(subjectScore(t.dataset.assessmentMax)[item.id])>m){alert("Maximum cannot be lower than the saved score.");t.value=item.max;return;}
      if(item)item.max=m;save(false);
    }
    if(t.matches("[data-target]")) {state.targets[t.dataset.target]=Number(t.value)||0;save(false);}
  });
  if("serviceWorker" in navigator && location.protocol!=="file:") window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(e=>console.warn("Offline caching unavailable",e)));
  load();
})();