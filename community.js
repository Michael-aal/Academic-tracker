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
    if (!token()) { location.href = "login.html?next=social-media.html"; return false; }
    return true;
  }
  function tab(name) {
    document.querySelectorAll(".community-tabs [data-tab]").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    document.querySelectorAll(".community-view").forEach(v => v.classList.toggle("active", v.id === "view-" + name));
    if (name === "feed") loadFeed();
    if (name === "people") loadFriends();
    document.querySelectorAll("#social-bottom-nav [data-social-dest]").forEach(b => { const active = b.dataset.socialDest === name; b.classList.toggle("active", active); if (active) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current"); });

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
      const { profile, stats = {}, posts = [] } = await api("/community/profile/me");
      $("profile-username").value = profile.username || "";
      $("profile-best-subject").value = profile.bestSubject || "";
      $("profile-bio").value = profile.bio || "";
      $("profile-avatar").value = profile.avatarUrl || "";
      $("profile-cover").value = profile.coverUrl || "";
      $("profile-interests").value = (profile.interests || []).join(", ");
      $("profile-visibility").value = profile.visibility || "PUBLIC";
      if(!profile.usernameSet){socialReady=false;$("social-onboarding").hidden=false;$("onboarding-username").value=profile.username||"";return;}
      socialReady=true;$("social-onboarding").hidden=true;loadFeed();
      $("mini-profile").innerHTML = '<strong>@' + esc(profile.username) + '</strong><p>' + esc(profile.bestSubject || "Add your best subject") + '</p><small>' + esc(profile.educationTrack || "") + ' · ' + (profile.visibility === "PRIVATE" ? "Private" : "Public") + '</small>';
      $("social-profile-name").textContent = profile.displayName || "Student";
      $("social-profile-handle").textContent = "@" + (profile.username || "student");
      $("social-profile-bio").textContent = profile.bio || "Add a short bio to introduce yourself.";
      $("social-profile-avatar").innerHTML = profile.avatarUrl ? '<img src="' + esc(profile.avatarUrl) + '" alt="Profile photo">' : esc((profile.displayName || "S").slice(0,1).toUpperCase());
      $("social-profile-cover").innerHTML = profile.coverUrl ? '<img src="' + esc(profile.coverUrl) + '" alt="Profile cover">' : '<span>YOUR SPACE</span>';
      $("profile-post-count").textContent = String(stats.posts || 0);
      $("profile-follower-count").textContent = String(stats.followers || 0);
      $("profile-following-count").textContent = String(stats.following || 0);
      $("social-profile-subject").textContent = [profile.bestSubject, profile.educationTrack, profile.programme].filter(Boolean).join(" · ");
      $("social-profile-posts").innerHTML = posts.length ? posts.map(post => '<article class="social-profile-post">' + (post.mediaUrl ? '<img src="' + esc(post.mediaUrl) + '" alt="Your post" loading="lazy">' : post.videoUrl ? '<div class="social-profile-video">▶ Video post</div>' : '<div class="social-profile-text-post">' + esc((post.body || "").slice(0,180)) + '</div>') + '<div class="social-profile-post-meta">' + esc(post.subject || "Post") + '<span>' + (post.reactionCount || 0) + ' likes</span></div></article>').join("") : '<div class="empty-state social-profile-empty">Your posts will appear here after you publish your first post.</div>';
    } catch (e) { status(e.message); }
  }
  $("social-onboarding-form").addEventListener("submit",async e=>{e.preventDefault();const username=$("onboarding-username").value.trim().toLowerCase(),err=$("onboarding-error");err.textContent="";if(!/^[a-z0-9_]{3,30}$/.test(username)){err.textContent="Use 3–30 letters, numbers or underscores.";return;}const b=e.target.querySelector("button");b.disabled=true;try{await api("/community/profile/me",{method:"PATCH",body:JSON.stringify({username})});await loadProfile();}catch(x){err.textContent=x.message;}finally{b.disabled=false;}});
  $("edit-social-profile").addEventListener("click", () => $("profile-settings").scrollIntoView({behavior:"smooth",block:"start"}));
  document.addEventListener("click", e => {
    const example = e.target.closest("[data-example]");
    if (example) {
      tab("feed");
      $("post-body").value = example.dataset.example;
      $("post-body").focus({preventScroll:true});
      $("post-form").scrollIntoView({behavior:"smooth",block:"center"});
    }
  });
  $("profile-form").addEventListener("submit", async e => {
    e.preventDefault(); if (!requireLogin()) return;
    const interests = $("profile-interests").value.split(",").map(x => x.trim()).filter(Boolean).slice(0,12);
    try {
      await api("/community/profile/me", { method:"PATCH", body:JSON.stringify({
        username:$("profile-username").value, bestSubject:$("profile-best-subject").value,
        bio:$("profile-bio").value, avatarUrl:$("profile-avatar").value,
        coverUrl:$("profile-cover").value, interests, visibility:$("profile-visibility").value
      })});
      status("Your social profile settings have been saved."); loadProfile();
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
          (post.mediaUrl ? '<p><img class="post-media" src="' + esc(post.mediaUrl) + '" alt="Shared learning image" loading="lazy"></p>' : '') +
          (post.subject ? '<span class="post-subject">' + esc(post.subject) + '</span>' : '') +
          (post.videoUrl ? '<p><a target="_blank" rel="noopener noreferrer" href="' + esc(post.videoUrl) + '">Open shared learning video ↗</a></p>' : '') +
          '<div class="post-meta">' + new Date(post.createdAt).toLocaleString() + ' · ' + (post.reactionCount || 0) + ' reactions · ' + (post.commentCount || 0) + ' comments</div>' +
          '<div class="post-actions"><button data-action="react" data-id="' + esc(post.id) + '">♡ Helpful</button><button data-action="comments" data-id="' + esc(post.id) + '">View comments</button><button data-action="report" data-id="' + esc(post.id) + '">Report</button></div><div class="post-comments" id="comments-' + esc(post.id) + '"></div></article>';
      }).join("");
    } catch (e) { $("feed-list").innerHTML = '<div class="empty-state">' + esc(e.message) + '</div>'; }
  }
  async function uploadCommunityMedia(file) {
    const isVideo=file.type.startsWith("video/");
    const isImage=file.type.startsWith("image/");
    if(!isVideo&&!isImage)throw new Error("Choose an image or video file.");
    if(file.size>(isVideo?50:8)*1024*1024)throw new Error(isVideo?"Videos must be 50 MB or smaller.":"Images must be 8 MB or smaller.");
    const sig=await api("/community/media-upload-signature",{method:"POST",body:JSON.stringify({resourceType:isVideo?"video":"image"})});
    const form=new FormData();form.append("file",file);form.append("api_key",sig.apiKey);form.append("timestamp",String(sig.timestamp));form.append("folder",sig.folder);form.append("signature",sig.signature);
    const response=await fetch("https://api.cloudinary.com/v1_1/"+encodeURIComponent(sig.cloudName)+"/"+sig.resourceType+"/upload",{method:"POST",body:form});
    const result=await response.json().catch(()=>({}));
    if(!response.ok||!result.secure_url)throw new Error("Media upload failed. Check Cloudinary configuration.");
    return isVideo?{videoUrl:result.secure_url}:{mediaUrl:result.secure_url};
  }
  function clearPendingMedia(){if(pendingMediaUrl)URL.revokeObjectURL(pendingMediaUrl);pendingMediaUrl="";$("post-media-preview").replaceChildren();$("post-media-preview").hidden=true;}
  function previewMedia(file,box,keep=false){box.replaceChildren();if(!file)return;const url=URL.createObjectURL(file);if(keep){if(pendingMediaUrl)URL.revokeObjectURL(pendingMediaUrl);pendingMediaUrl=url;}const el=document.createElement(file.type.startsWith("video/")?"video":"img");el.src=url;el.alt="Selected media preview";el.className="post-preview-asset";if(file.type.startsWith("video/"))el.controls=true;box.append(el);}
  $("post-media").addEventListener("change",()=>{const f=$("post-media").files?.[0];clearPendingMedia();if(!f)return;const v=f.type.startsWith("video/"),im=f.type.startsWith("image/");if(!v&&!im){$("post-media").value="";return status("Choose an image or video.");}if(f.size>(v?50:8)*1024*1024){$("post-media").value="";return status(v?"Videos must be 50 MB or smaller.":"Images must be 8 MB or smaller.");}previewMedia(f,$("post-media-preview"),true);$("post-media-preview").hidden=false;});
  function closeReview(){$("post-review").hidden=true;}
  $("post-form").addEventListener("submit",e=>{e.preventDefault();if(!requireLogin()||!socialReady)return;const body=$("post-body").value.trim(),f=$("post-media").files?.[0];if(!body&&!f)return status("Write something or attach media first.");$("post-review-body").textContent=body;$("post-review-body").hidden=!body;$("post-review-author").textContent=$("social-profile-handle").textContent;$("post-review-subject").textContent=$("post-subject").value.trim()||"No subject";$("post-review-visibility").textContent=$("post-visibility").value==="PUBLIC"?"Public":"Connections only";const box=$("post-review-media");box.replaceChildren();if(f)previewMedia(f,box);box.hidden=!f;$("post-review").hidden=false;});
  $("close-post-review").addEventListener("click",closeReview);$("cancel-post-review").addEventListener("click",closeReview);$("post-review").addEventListener("click",e=>{if(e.target===$("post-review"))closeReview();});
  $("confirm-publish-post").addEventListener("click",async()=>{if(!requireLogin()||!socialReady)return;const body=$("post-body").value.trim(),f=$("post-media").files?.[0],b=$("confirm-publish-post");b.disabled=true;b.textContent="Uploading and publishing…";try{const media=f?await uploadCommunityMedia(f):{};await api("/community/posts",{method:"POST",body:JSON.stringify({body,...media,subject:$("post-subject").value,visibility:$("post-visibility").value})});$("post-body").value="";$("post-subject").value="";$("post-media").value="";clearPendingMedia();closeReview();status("Published online. Your post is now live.");await Promise.all([loadFeed(),loadProfile()]);}catch(err){status(err.message);}finally{b.disabled=false;b.textContent="Publish post";}});
  $("refresh-feed").addEventListener("click", loadFeed);
  const socialBottomNav = $("social-bottom-nav");
  socialBottomNav?.addEventListener("click", e => {
    const destination = e.target.closest("[data-social-dest]");
    if (destination) { tab(destination.dataset.socialDest); return; }
    if (e.target.closest("[data-social-create]")) {
      tab("feed"); $("post-body").focus({ preventScroll: true });
      $("post-form").scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
  $("feed-list").addEventListener("click", async e => {
    const b=e.target.closest("[data-action]"); if(!b) return; if(!requireLogin()) return;
    const id=b.dataset.id;
    try {
      if (b.dataset.action==="react") { await api("/community/posts/"+encodeURIComponent(id)+"/reaction",{method:"POST",body:JSON.stringify({reaction:"HELPFUL"})}); loadFeed(); }
      if (b.dataset.action==="report") {
        const details=window.prompt("Briefly explain why this post should be reviewed.");
        if(details===null)return;
        await api("/community/reports",{method:"POST",body:JSON.stringify({targetType:"POST",targetId:id,reason:"OTHER",details})});
        status("Thanks. Your report has been sent for review.");
      }
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
      $("people-list").innerHTML=people.length?people.map(p=>{
        const action=p.friendStatus==="FRIENDS"?'<button class="outline-button" disabled>Friends</button>':
          p.friendStatus==="REQUEST_SENT"?'<button class="outline-button" disabled>Request sent</button>':
          p.friendStatus==="REQUEST_RECEIVED"?'<button class="primary-button" data-friend-request="'+esc(p.friendRequestId||"")+'" data-request-action="accept">Accept request</button>':
          '<button class="outline-button" data-follow="'+esc(p.userId)+'">Add friend</button>';
        return '<article class="person-card"><strong>'+esc(p.displayName)+'</strong><p>@'+esc(p.username)+' · '+esc(p.educationTrack)+'<br>'+esc(p.institutionName||p.programme||"")+'<br>Best subject: '+esc(p.bestSubject||"Not specified")+'</p>'+action+'</article>';
      }).join(""):'<div class="empty-state">No public profiles found.</div>';
    } catch(err){status(err.message);}
  });
  $("people-list").addEventListener("click",async e=>{
    const block=e.target.closest("[data-block]");
    if(block){
      if(!window.confirm("Block this student? They will no longer be able to connect or privately chat with you."))return;
      try{await api("/community/blocks/"+encodeURIComponent(block.dataset.block),{method:"POST",body:"{}"});block.closest(".person-card")?.remove();status("Student blocked.");}
      catch(err){status(err.message);}
      return;
    }
    const accept=e.target.closest("[data-friend-request]");
    if(accept){
      accept.disabled=true;
      try{await api("/community/friend-requests/"+encodeURIComponent(accept.dataset.friendRequest),{method:"POST",body:JSON.stringify({action:accept.dataset.requestAction||"accept"})});status("Friend request accepted.");loadFriends();}
      catch(err){status(err.message);accept.disabled=false;}
      return;
    }
    const b=e.target.closest("[data-follow]"); if(!b)return;
    try { await api("/community/follow/"+encodeURIComponent(b.dataset.follow),{method:"POST",body:"{}"}); b.textContent="Request sent"; b.disabled=true; status("Friend request sent."); }
    catch(err){status(err.message);}
  });

  async function loadFriends(){
    if(!requireLogin()) return;
    try{
      const [{friends=[]},{requests=[]}]=await Promise.all([
        api("/community/friends"),
        api("/community/follow-requests")
      ]);
      $("friend-count").textContent=String(friends.length);
      $("friend-request-count").textContent=String(requests.length);
      $("friends-list").innerHTML=friends.length?friends.map(p=>'<article class="person-card"><strong>'+esc(p.displayName)+'</strong><p>@'+esc(p.username)+' · '+esc(p.educationTrack)+'<br>'+esc(p.institutionName||p.programme||"")+'<br>Best subject: '+esc(p.bestSubject||"Not specified")+'</p><button class="quiet-button" data-message-friend="'+esc(p.userId)+'">Message</button></article>').join(""):'<div class="empty-state">Your accepted connections will appear here.</div>';
      $("friend-requests-list").innerHTML=requests.length?requests.map(r=>'<article class="person-card"><strong>'+esc(r.requester?.name||"Student")+'</strong><p>Wants to connect with you · '+esc(r.requester?.educationTrack||"")+'</p><div class="friend-request-actions"><button class="primary-button" data-friend-request="'+esc(r.id)+'" data-request-action="accept">Accept</button><button class="outline-button" data-friend-request="'+esc(r.id)+'" data-request-action="decline">Decline</button></div></article>').join(""):'<div class="empty-state">No pending friend requests.</div>';
    }catch(e){status(e.message);}
  }
  $("friend-requests-list").addEventListener("click",async e=>{
    const button=e.target.closest("[data-friend-request]");
    if(!button)return;
    button.disabled=true;
    try{
      const action=button.dataset.requestAction;
      await api("/community/friend-requests/"+encodeURIComponent(button.dataset.friendRequest),{method:"POST",body:JSON.stringify({action})});
      status(action==="accept"?"Friend request accepted.":"Friend request declined.");
      await loadFriends();
    }catch(err){status(err.message);button.disabled=false;}
  });
  $("friends-list").addEventListener("click",async e=>{
    const button=e.target.closest("[data-message-friend]");
    if(!button)return;
    tab("messages");
    const search=$("chat-person-query");
    if(search){search.value="";search.focus();}
    status("Open your Messages tab to start a conversation with this friend.");
  });

  async function loadGroups(){
    if(!requireLogin()) return;
    try {
      const {groups=[]}=await api("/community/groups");
      $("group-list").innerHTML=groups.length?groups.map(g=>'<article class="panel group-card"><strong>'+esc(g.title)+'</strong><p>'+esc(g.description)+'</p><small>'+esc(g.subject||"General learning")+' · '+(g.memberCount||0)+' members · '+esc(g.educationTrack||"Cross-level")+'</small><div class="group-card-actions">'+(g.joined?'<button class="outline-button" data-group-chat="'+esc(g.id)+'">Open group chat</button><form class="group-invite-form" data-group-invite="'+esc(g.id)+'"><input name="username" maxlength="30" placeholder="Student username" required><button class="quiet-button">Invite</button></form>':'<button class="outline-button" data-join-group="'+esc(g.id)+'">Join group</button>')+'</div></article>').join(""):'<div class="empty-state">No groups yet. Create the first study group.</div>';
      loadGroupInvitations();
    } catch(e){status(e.message);}
  }
  async function loadGroupInvitations(){
    try{
      const {invitations=[]}=await api("/community/group-invitations");
      $("group-invitations").innerHTML=invitations.length?invitations.map(i=>'<div class="group-invitation"><strong>'+esc(i.group?.title||"Study group")+'</strong><p>'+esc(i.group?.description||"")+'</p><button class="primary-button" data-accept-invite="'+esc(i.id)+'">Accept</button><button class="quiet-button" data-decline-invite="'+esc(i.id)+'">Decline</button></div>').join(""):'<span class="muted-note">No pending group invitations.</span>';
    }catch(e){$("group-invitations").textContent=e.message;}
  }
  $("group-invitations").addEventListener("click",async e=>{
    const accept=e.target.closest("[data-accept-invite]"),decline=e.target.closest("[data-decline-invite]");
    if(!accept&&!decline)return;
    try{
      const id=accept?.dataset.acceptInvite||decline.dataset.declineInvite;
      await api("/community/group-invitations/"+encodeURIComponent(id)+(accept?"/accept":"/decline"),{method:"POST",body:"{}"});
      status(accept?"You joined the study group.":"Invitation declined.");loadGroups();
    }catch(err){status(err.message);}
  });
  $("show-group-form").addEventListener("click",()=>{$("group-form").hidden=!$("group-form").hidden;});
  $("group-form").addEventListener("submit",async e=>{
    e.preventDefault(); if(!requireLogin())return;
    try {
      await api("/community/groups",{method:"POST",body:JSON.stringify({title:$("group-title").value,description:$("group-description").value,subject:$("group-subject").value,crossLevel:$("group-cross-level").checked,visibility:$("group-visibility").value})});
      e.target.reset();e.target.hidden=true;status("Study group created.");loadGroups();
    } catch(err){status(err.message);}
  });
  $("group-list").addEventListener("submit",async e=>{
    if(!e.target.matches(".group-invite-form"))return;
    e.preventDefault();const groupId=e.target.dataset.groupInvite,username=new FormData(e.target).get("username");
    try{await api("/community/groups/"+encodeURIComponent(groupId)+"/invitations",{method:"POST",body:JSON.stringify({username})});e.target.reset();status("Study group invitation sent.");}
    catch(err){status(err.message);}
  });
  $("group-list").addEventListener("click",async e=>{
    const chat=e.target.closest("[data-group-chat]");
    if(chat){
      try{const {conversation}=await api("/community/chat/group/"+encodeURIComponent(chat.dataset.groupChat),{method:"POST",body:"{}"});await loadChats();tab("messages");openChat(conversation.id);}
      catch(err){status(err.message);}
      return;
    }
    const b=e.target.closest("[data-join-group]");if(!b)return;
    try{await api("/community/groups/"+encodeURIComponent(b.dataset.joinGroup)+"/join",{method:"POST",body:"{}"});status("You joined the study group.");loadGroups();}
    catch(err){status(err.message);}
  });

  function renderVideoCards(items, fallbackSubject="") {
    $("video-results").innerHTML=(items||[]).map(v=>'<article class="video-card"><iframe src="https://www.youtube-nocookie.com/embed/'+encodeURIComponent(v.id)+'" title="'+esc(v.title)+'" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe><strong>'+esc(v.title)+'</strong><p>'+esc(v.channelTitle)+' · '+esc(v.recommendedSubject||fallbackSubject)+'</p><button class="quiet-button" data-video-action="SAVE" data-video-id="'+esc(v.id)+'" data-subject="'+esc(v.recommendedSubject||fallbackSubject)+'">Save</button><button class="quiet-button" data-video-action="NOT_INTERESTED" data-video-id="'+esc(v.id)+'" data-subject="'+esc(v.recommendedSubject||fallbackSubject)+'">Not interested</button></article>').join("")||'<div class="empty-state">No videos found. Try another subject.</div>';
  }
  async function loadVideoPreferences(){
    if(!requireLogin())return;
    try{
      const {subjects=[]}=await api("/community/videos/preferences");
      $("video-preferences").innerHTML=subjects.length?subjects.map(x=>'<span>'+esc(x.subject)+'</span>').join(""):'<span>Set your Best Subject to personalize recommendations</span>';
      try {
        const recommendations=await api("/community/videos/recommendations");
        renderVideoCards(recommendations.items||"");
      } catch (e) { $("video-results").innerHTML='<div class="empty-state">'+esc(e.message)+'</div>'; }
    }catch(e){status(e.message);}
  }
  $("video-search").addEventListener("submit",async e=>{
    e.preventDefault();if(!requireLogin())return;
    const q=$("video-query").value.trim();if(q.length<2)return status("Enter a topic to search.");
    try{
      const result=await api("/videos/search?q="+encodeURIComponent(q));
      renderVideoCards(result.items||[], q);
    }catch(err){status(err.message);}
  });
  $("video-results").addEventListener("click",async e=>{
    const b=e.target.closest("[data-video-action]");if(!b)return;
    try{await api("/community/videos/engagement",{method:"POST",body:JSON.stringify({videoId:b.dataset.videoId,action:b.dataset.videoAction,subject:b.dataset.subject})});b.textContent=b.dataset.videoAction==="SAVE"?"Saved":"Hidden";b.disabled=true;}
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
  window.ATCommunityState.openChat = id => openChat(id);
  $("chat-list").addEventListener("click",e=>{const b=e.target.closest("[data-chat]");if(b)openChat(b.dataset.chat);});
  async function refreshActiveChat(){
    if(!activeChat||!$("view-messages").classList.contains("active"))return;
    try{
      const box=$("chat-messages");
      const nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<90;
      const {messages=[]}=await api("/community/chat/"+encodeURIComponent(activeChat)+"/messages");
      const currentUser=JSON.parse(localStorage.getItem("academic-tracker-user")||"{}").id;
      box.innerHTML=messages.map(m=>'<div class="chat-bubble '+(m.senderId===currentUser?"mine":"")+'">'+(m.messageType==="VOICE_NOTE"&&m.mediaUrl?'<audio controls preload="metadata" src="'+esc(m.mediaUrl)+'"></audio>':esc(m.body||""))+'</div>').join("");
      if(nearBottom)box.scrollTop=box.scrollHeight;
    }catch(_){}
  }
  setInterval(refreshActiveChat,3000);

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
  if (!token()) { location.replace("login.html?next=social-media.html"); return; }
  loadProfile();
  try { const u=JSON.parse(localStorage.getItem("academic-tracker-user")||"{}"); if(u.isAdmin||["ADMIN","DEVELOPER","DEV"].includes(String(u.role||"").toUpperCase())) $("community-admin-link").hidden=false; } catch (_) {}
  if(location.hash === "#messages") tab("messages");
})();