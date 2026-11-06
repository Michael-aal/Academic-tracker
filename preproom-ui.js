(() => {
  "use strict";
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  function icon(path){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+path+'"/></svg>'}
  function setupBrand(){
    const brand=$(".social-brand"); if(!brand)return;
    brand.innerHTML='<span class="social-brand-mark" aria-hidden="true">'+icon("M2 10 12 3l10 7-10 7zM6 13v5c4 3 8 3 12 0v-5M21 11v6")+'</span><span><strong>Preproom</strong><small style="display:block;font-size:10px;font-weight:500;letter-spacing:0;color:#b8a9ca">Learn. Share. Connect.</small></span>';
    brand.setAttribute("aria-label","Preproom home");
  }
  function setupNavigation(){
    const sidebar=$(".social-sidebar");
    if(sidebar){
      const buttons=$$("button[data-tab]",sidebar);
      buttons.forEach(button=>{
        const key=button.dataset.tab;
        if(key==="feed")button.innerHTML=icon("m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7")+"Home";
        if(key==="people")button.innerHTML=icon("M4 5h16v14H4zM8 9h8M8 13h5")+"Explore";
        if(key==="messages")button.innerHTML=icon("M4 5h16v12H8l-4 4zM8 9h8")+"Messages";
        if(key==="profile")button.innerHTML=icon("M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21a8 8 0 0 1 16 0")+"Profile";
        if(!["feed","people","messages","profile"].includes(key))button.hidden=true;
      });
      if(!$(".preproom-create-link",sidebar)){
        const create=document.createElement("a");create.className="primary-button preproom-create-link";create.href="social-create.html";create.textContent="＋  Create post";create.style.cssText="display:flex;align-items:center;justify-content:center;text-decoration:none;margin:14px 0 8px;min-height:48px";
        sidebar.insertBefore(create,sidebar.querySelector(".social-sidebar-divider"));
      }
      const admin=$("#community-admin-link"); if(admin)admin.hidden=true;
      if(!$(".preproom-dashboard-link",sidebar)){
        const back=document.createElement("a");back.className="social-admin-link preproom-dashboard-link";back.href="dashboard.html";back.textContent="← Back to Academic Tracker";sidebar.append(back);
      }
    }
    const bottom=$("#social-bottom-nav");
    if(bottom){
      $$("[data-social-dest]",bottom).forEach(button=>{
        const key=button.dataset.socialDest;
        if(key==="people")button.querySelector("span").textContent="Explore";
      });
    }
  }
  function setupHome(){
    /* Keep the homepage intentionally focused: feed, composer and post actions only. */
    const rail=$(".preproom-side-rail"); if(rail)rail.remove();
  }
  function simplifyFeed(){
    const returnBar=$(".social-home-return");
    if(returnBar){const span=$("span",returnBar);if(span)span.textContent="Your learning feed";const link=$("a",returnBar);if(link)link.textContent="← Academic Tracker";}
    const heading=$("#feed-heading");if(heading)heading.textContent="Latest from students";
    const saved=$("#show-saved-posts");if(saved)saved.hidden=true;
    const refresh=$("#refresh-feed");if(refresh)refresh.textContent="Refresh";
    const composerLabel=$(".social-composer-heading label");if(composerLabel)composerLabel.textContent="Share something you're learning";
    const textarea=$("#post-body");if(textarea)textarea.placeholder="Share a useful idea, question or study update…";
  }

  function setupExplore(){
    const query=$("#preproom-explore-query"), form=$("#people-search"), field=$("#people-query");
    $("#preproom-explore-search-btn")?.addEventListener("click",()=>{if(!query||!field||!form)return;field.value=query.value.trim();form.requestSubmit();});
    query?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();$("#preproom-explore-search-btn")?.click();}});
    $("[data-topic]").forEach(button=>button.addEventListener("click",()=>{if(query){query.value=button.dataset.topic;$("#preproom-explore-search-btn")?.click();}}));
    $("[data-explore-filter]").forEach(button=>button.addEventListener("click",()=>{$("[data-explore-filter]").forEach(b=>b.classList.toggle("active",b===button));const filter=button.dataset.exploreFilter;if(filter==="people"){field?.focus();}else if(filter==="groups"){document.querySelector('[data-tab="groups"]')?.click();}else if(filter==="posts"){document.querySelector('[data-tab="feed"]')?.click();}else{field?.focus();}}));
  }
  function setupProfileTabs(){
    $("[data-profile-tab]").forEach(button=>button.addEventListener("click",()=>{
      $("[data-profile-tab]").forEach(b=>b.classList.toggle("active",b===button));
      const tab=button.dataset.profileTab;
      if(tab==="friends"){document.querySelector('[data-tab="people"]')?.click();return;}
      if(tab==="media"){const posts=$("#social-profile-posts");if(posts)posts.scrollIntoView({behavior:"smooth",block:"start"});return;}
      if(tab==="about")$("#profile-settings")?.scrollIntoView({behavior:"smooth",block:"start"});
      if(tab==="posts")$("#social-profile-posts")?.scrollIntoView({behavior:"smooth",block:"start"});
    }));
  }
  function boot(){setupBrand();setupNavigation();setupHome();simplifyFeed();setupExplore();setupProfileTabs();}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();