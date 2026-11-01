(() => {
  "use strict";
  const API = (window.AT_API_BASE || "https://academic-tracker-0b2q.onrender.com").replace(/\/$/, "") + "/api";
  const token = () => localStorage.getItem("academic-tracker-token") || "";
  const $ = id => document.getElementById(id);
  const status = message => { $("community-status").textContent = message || ""; };
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  const headers = () => ({ "Content-Type":"application/json", ...(token() ? { Authorization:"Bearer " + token() } : {}) });
  async function api(path, options={}) {
    const response = await fetch(API + path, { ...options, headers:{ ...headers(), ...(options.headers||{}) }, cache:"no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "The request could not be completed.");
    return data;
  }
  function requireLogin() {
    if (!token()) { location.href = "login.html?next=community.html"; return false; }
    return true;
  }
  function tab(name) {
    document.querySelectorAll(".community-tabs [data-tab]").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    document.querySelectorAll(".community-view").forEach(v => v.classList.toggle("active", v.id === "view-" + name));
    if (name === "feed") loadFeed();
    if (name === "people") $("people-query").focus();
    if (name === "groups") loadGroups();
    if (name === "videos") loadVideoPreferences();
    if (name === "messages") loadChats();
    if (name === "referrals") loadReferrals();
    if (name === "profile") loadProfile();
  }
  document.addEventListener("click", e => {
    const button = e.target.closest("[data-tab]");
    if (button) { e.preventDefault(); tab(button.dataset.tab); }
    const link = e.target.closest("[data-tab-link]");
    if (link) { e.preventDefault(); tab(link.dataset.tabLink); }
  });

  async function loadProfile() {
    if (!requireLogin()) return;
    try {
      const { profile } = await api("/community/profile/me");
      $("profile-username").value = profile.username || "";
      $("profile-best-subject").value = profile.bestSubject || "";
      $("profile-bio").value = profile.bio || "";
      $("profile-avatar").value = profile.avatarUrl || "";
      $("profile-cover").value = profile.coverUrl || "";
      $("profile-interests").value = (profile.interests || []).join(", ");
      $("profile-visibility").value = profile.visibility || "PUBLIC";
      $("mini-profile").innerHTML = '<strong>@' + esc(profile.username) + '</strong><p>' + esc(profile.bestSubject || "Add your best subject") + '</p><small>' + esc(profile.educationTrack) + '</small>';
      $("profile-summary").innerHTML = '<strong>' + esc(profile.displayName) + '</strong><p>Best subject: ' + esc(profile.bestSubject || "Not set") + '</p><p>' + esc(profile.bio || "Add a short introduction.") + '</p>';
    } catch (e) { status(e.message); }
  }
  $("profile-form").addEventListener("submit", async e => {
    e.preventDefault(); if (!requireLogin()) return;
    const interests = $("profile-interests").value.split(",").map(x => x.trim()).filter(Boolean).slice(0,12);
    try {
      await api("/community/profile/me", { method:"PATCH", body:JSON.stringify({
        username:$("profile-username").value, bestSubject:$("profile-best-subject").value,
        bio:$("profile-bio").value, avatarUrl:$("profile-avatar").value,
        coverUrl:$("profile-cover").value, interests, visibility:$("profile-visibility").value
      })});
      status("Your social profile has been saved."); loadProfile();
    } catch (e) { status(e.message); }
  });

  async function loadFeed() {
    try {
      const { posts=[] } = await api("/community/feed?limit=25");
      if (!posts.length) { $("feed-list").innerHTML = '<div class="empty-state">No posts yet. Be the first to start a useful discussion.</div>'; return; }
      $("feed-list").innerHTML = posts.map(post => {
        const author = post.author || {};
        const avatar = author.avatarUrl ? '<img src="' + esc(author.avatarUrl) + '" alt="">' : esc((author.displayName || "S").slice(0,1).toUpperCase());
        return '<article class="panel post-card" data-post="' + esc(post.id) + '"><div class="post-author"><div class="post-avatar">' + avatar + '</div><div><strong>' + esc(author.displayName || "Student") + '</strong><small>@' + esc(author.username || "student") + ' · ' + esc(author.educationTrack || "") + '</small></div></div>' +
          (post.body ? '<p class="post-body">' + esc(post.body) + '</p>' : '') +
          (post.subject ? '<span class="post-subject">' + esc(post.subject) + '</span>' : '') +
          (post.videoUrl ? '<p><a target="_blank" rel="noopener noreferrer" href="' + esc(post.videoUrl) + '">Open shared learning video ↗</a></p>' : '') +
          '<div class="post-meta">' + new Date(post.createdAt).toLocaleString() + ' · ' + (post.reactionCount || 0) + ' reactions · ' + (post.commentCount || 0) + ' comments</div>' +
          '<div class="post-actions"><button data-action="react" data-id="' + esc(post.id) + '">♡ Helpful</button><button data-action="comments" data-id="' + esc(post.id) + '">View comments</button></div><div class="post-comments" id="comments-' + esc(post.id) + '"></div></article>';
      }).join("");
    } catch (e) { $("feed-list").innerHTML = '<div class="empty-state">' + esc(e.message) + '</div>'; }
  }
  $("post-form").addEventListener("submit", async e => {
    e.preventDefault(); if (!requireLogin()) return;
    const body = $("post-body").value.trim();
    if (!body) return status("Write a post before publishing.");
    try {
      await api("/community/posts", { method:"POST", body:JSON.stringify({ body, subject:$("post-subject").value, visibility:$("post-visibility").value }) });
      $("post-body").value = ""; $("post-subject").value = "";
      status("Your post is live."); loadFeed();
    } catch (e) { status(e.message); }
  });
  $("refresh-feed").addEventListener("click", loadFeed);
  $("feed-list").addEventListener("click", async e => {
    const b=e.target.closest("[data-action]"); if(!b) return; if(!requireLogin()) return;
    const id=b.dataset.id;
    try {
      if (b.dataset.action==="react") { await api("/community/posts/"+encodeURIComponent(id)+"/reaction",{method:"POST",body:JSON.stringify({reaction:"HELPFUL"})}); loadFeed(); }
      if (b.dataset.action==="comments") {
        const data=await api("/community/posts/"+encodeURIComponent(id)+"/comments");
        const box=$("comments-"+id);
        box.innerHTML=(data.comments||[]).map(c=>'<p><strong>'+esc(c.authorName)+'</strong>: '+esc(c.body)+'</p>').join("")+
          '<form class="comment-form" data-post="'+esc(id)+'"><input name="body" maxlength="2000" placeholder="Add a comment"><button class="quiet-button">Send</button></form>';
      }
    } catch(err) { status(err.message); }
  });
  $("feed-list").addEventListener("submit",async e=>{
    if(!e.target.matches(".comment-form")) return; e.preventDefault(); if(!requireLogin()) return;
    const id=e.target.dataset.post, body=new FormData(e.target).get("body");
    try { await api("/community/posts/"+encodeURIComponent(id)+"/comments",{method:"POST",body:JSON.stringify({body})}); loadFeed(); }
    catch(err){status(err.message);}
  });

  $("people-search").addEventListener("submit",async e=>{
    e.preventDefault(); if(!requireLogin()) return;
    const q=$("people-query").value.trim(); if(q.length<2) return status("Enter at least two characters.");
    try {
      const {people=[]}=await api("/community/people?q="+encodeURIComponent(q));
      $("people-list").innerHTML=people.length?people.map(p=>'<article class="person-card"><strong>'+esc(p.displayName)+'</strong><p>@'+esc(p.username)+' · '+esc(p.educationTrack)+'<br>'+esc(p.institutionName||p.programme||"")+'<br>Best subject: '+esc(p.bestSubject||"Not specified")+'</p><button class="outline-button" data-follow="'+esc(p.userId)+'">Connect</button></article>').join(""):'<div class="empty-state">No public profiles found.</div>';
    } catch(err){status(err.message);}
  });
  $("people-list").addEventListener("click",async e=>{
    const b=e.target.closest("[data-follow]"); if(!b)return;
    try { const r=await api("/community/follow/"+encodeURIComponent(b.dataset.follow),{method:"POST",body:"{}"}); b.textContent=r.status==="ACCEPTED"?"Connected":"Request sent"; b.disabled=true; }
    catch(err){status(err.message);}
  });

  async function loadGroups(){
    if(!requireLogin()) return;
    try {
      const {groups=[]}=await api("/community/groups");
      $("group-list").innerHTML=groups.length?groups.map(g=>'<article class="panel group-card"><strong>'+esc(g.title)+'</strong><p>'+esc(g.description)+'</p><small>'+esc(g.subject||"General learning")+' · '+(g.memberCount||0)+' members · '+esc(g.educationTrack||"Cross-level")+'</small><p><button class="outline-button" data-join-group="'+esc(g.id)+'" '+(g.joined?'disabled':'')+'>'+(g.joined?'Joined':'Join group')+'</button></p></article>').join(""):'<div class="empty-state">No groups yet. Create the first study group.</div>';
    } catch(e){status(e.message);}
  }
  $("show-group-form").addEventListener("click",()=>{$("group-form").hidden=!$("group-form").hidden;});
  $("group-form").addEventListener("submit",async e=>{
    e.preventDefault(); if(!requireLogin())return;
    try {
      await api("/community/groups",{method:"POST",body:JSON.stringify({title:$("group-title").value,description:$("group-description").value,subject:$("group-subject").value,crossLevel:$("group-cross-level").checked,visibility:$("group-visibility").value})});
      e.target.reset();e.target.hidden=true;status("Study group created.");loadGroups();
    } catch(err){status(err.message);}
  });
  $("group-list").addEventListener("click",async e=>{
    const b=e.target.closest("[data-join-group]");if(!b)return;
    try{await api("/community/groups/"+encodeURIComponent(b.dataset.joinGroup)+"/join",{method:"POST",body:"{}"});status("You joined the study group.");loadGroups();}
    catch(err){status(err.message);}
  });

  async function loadVideoPreferences(){
    if(!requireLogin())return;
    try{
      const {subjects=[]}=await api("/community/videos/preferences");
      $("video-preferences").innerHTML=subjects.length?subjects.map(x=>'<span>'+esc(x.subject)+'</span>').join(""):'<span>Set your Best Subject to personalize recommendations</span>';
    }catch(e){status(e.message);}
  }
  $("video-search").addEventListener("submit",async e=>{
    e.preventDefault();if(!requireLogin())return;
    const q=$("video-query").value.trim();if(q.length<2)return status("Enter a topic to search.");
    try{
      const result=await api("/videos/search?q="+encodeURIComponent(q));
      $("video-results").innerHTML=(result.items||[]).map(v=>'<article class="video-card"><a href="https://www.youtube.com/watch?v='+encodeURIComponent(v.id)+'" target="_blank" rel="noopener noreferrer"><img src="'+esc(v.thumbnail)+'" alt=""></a><strong>'+esc(v.title)+'</strong><p>'+esc(v.channelTitle)+'</p><button class="quiet-button" data-video-save="'+esc(v.id)+'" data-subject="'+esc(q)+'">Save interest</button></article>').join("")||'<div class="empty-state">No videos found.</div>';
    }catch(err){status(err.message);}
  });
  $("video-results").addEventListener("click",async e=>{
    const b=e.target.closest("[data-video-save]");if(!b)return;
    try{await api("/community/videos/engagement",{method:"POST",body:JSON.stringify({videoId:b.dataset.videoSave,action:"SAVE",subject:b.dataset.subject})});b.textContent="Saved";b.disabled=true;}
    catch(err){status(err.message);}
  });

  async function loadReferrals(){
    if(!requireLogin())return;
    try{
      const data=await api("/community/referrals");
      $("referral-card").innerHTML='<p><strong>Your code</strong></p><code>'+esc(data.code)+'</code><p><strong>Your invitation link</strong></p><p><code>'+esc(data.inviteUrl)+'</code></p><button class="primary-button" id="copy-referral">Copy invitation link</button><button class="outline-button" id="share-referral">Share invitation</button>';
      $("referral-stats").innerHTML='<strong>'+((data.referrals||[]).length)+'</strong><p>Invitations attributed</p><strong>'+esc(data.approvedPoints||0)+'</strong><p>Approved points</p><p class="muted-note">Pending referrals do not earn rewards until approved.</p>';
      $("copy-referral").addEventListener("click",async()=>{await navigator.clipboard.writeText(data.inviteUrl);status("Referral link copied.");});
      $("share-referral").addEventListener("click",async()=>{const share={title:"Join Academic Tracker",text:"Join me on Academic Tracker and learn together.",url:data.inviteUrl};if(navigator.share){try{await navigator.share(share)}catch(_){}}else{await navigator.clipboard.writeText(data.inviteUrl);status("Referral link copied.");}});
    }catch(e){status(e.message);}
  }

  let activeChat="";
  let conversationCache=[];
  window.ATCommunityState={getActiveChat:()=>activeChat,getConversations:()=>conversationCache,api};
  async function loadChats(){
    if(!requireLogin())return;
    try{
      const {conversations=[]}=await api("/community/chat");
      conversationCache=conversations;
      $("chat-list").innerHTML=conversations.map(c=>'<button class="chat-item" data-chat="'+esc(c.id)+'">'+(c.kind==="GROUP"?"Study group conversation":"Direct conversation")+'<small class="post-meta">'+esc(c.lastMessage?.body||"No messages yet")+'</small></button>').join("")||'<div class="empty-state">No conversations yet. Search for a connection above.</div>';
    }catch(e){status(e.message);}
  }
  $("chat-people-search").addEventListener("submit",async e=>{
    e.preventDefault();if(!requireLogin())return;
    try{
      const {people=[]}=await api("/community/people?q="+encodeURIComponent($("chat-person-query").value.trim()));
      $("chat-people-results").innerHTML=people.map(p=>'<div class="person-card"><strong>'+esc(p.displayName)+'</strong><small class="post-meta">'+esc(p.educationTrack)+' · '+esc(p.bestSubject||"")+'</small><button class="quiet-button" data-start-chat="'+esc(p.userId)+'">Message (accepted connections)</button></div>').join("")||'<p class="muted-note">No public student profiles found.</p>';
    }catch(err){status(err.message);}
  });
  $("chat-people-results").addEventListener("click",async e=>{
    const b=e.target.closest("[data-start-chat]");if(!b)return;
    try{const {conversation}=await api("/community/chat/direct/"+encodeURIComponent(b.dataset.startChat),{method:"POST",body:"{}"});await loadChats();openChat(conversation.id);}
    catch(err){status(err.message);}
  });
  async function openChat(id){
    activeChat=id;
    try{
      const {messages=[]}=await api("/community/chat/"+encodeURIComponent(id)+"/messages");
      $("chat-placeholder").hidden=true;$("chat-active").hidden=false;
      const currentUser=JSON.parse(localStorage.getItem("academic-tracker-user")||"{}").id;
      const conversation=conversationCache.find(item=>item.id===id);
      const other=conversation?.members?.find(member=>member.userId!==currentUser);
      $("chat-title").textContent=other?.user?.name||(conversation?.kind==="GROUP"?"Study group":"Conversation");
      const callAllowed=conversation?.kind==="DIRECT"&&Boolean(other);
      $("audio-call").hidden=!callAllowed;$("video-call").hidden=!callAllowed;
      $("chat-messages").innerHTML=messages.map(m=>'<div class="chat-bubble '+(m.senderId===currentUser?"mine":"")+'">'+(m.messageType==="VOICE_NOTE"&&m.mediaUrl?'<audio controls preload="metadata" src="'+esc(m.mediaUrl)+'"></audio>':esc(m.body||""))+'</div>').join("");
      $("chat-messages").scrollTop=$("chat-messages").scrollHeight;
      await api("/community/chat/"+encodeURIComponent(id)+"/read",{method:"PATCH",body:"{}"});
    }catch(e){status(e.message);}
  }
  $("chat-list").addEventListener("click",e=>{const b=e.target.closest("[data-chat]");if(b)openChat(b.dataset.chat);});
  $("chat-send").addEventListener("submit",async e=>{
    e.preventDefault();if(!activeChat)return;
    const body=$("chat-message").value.trim();if(!body)return;
    try{await api("/community/chat/"+encodeURIComponent(activeChat)+"/messages",{method:"POST",body:JSON.stringify({body})});$("chat-message").value="";openChat(activeChat);}
    catch(err){status(err.message);}
  });

  // A referral code is captured from the invite URL and submitted during signup.
  try {
    const params=new URLSearchParams(location.search), ref=params.get("ref");
    if(ref) sessionStorage.setItem("academic-tracker-referral",ref.toUpperCase());
  } catch (_) {}
  loadFeed();
  if(token()) { loadProfile(); }
  else { status("You can browse public posts. Log in to publish, connect, join groups or message."); }
})();