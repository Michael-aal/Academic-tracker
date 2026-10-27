/* Navbar interactions and consistent SVG icons for responsive navigation. */
(()=>{"use strict";
const iconPaths={
 home:'<path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9M9 20v-6h6v6"/>',
 calculator:'<rect x="4" y="2" width="16" height="20" rx="2"/><rect x="8" y="6" width="8" height="4" rx="1"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
 learn:'<path d="M12 18V5"/><path d="M15 13a4 4 0 0 1-3-4 4 4 0 0 1-3 4"/><path d="M18 7a3 3 0 0 0-6-2 3 3 0 0 0-6 2 3 3 0 0 0-1 5 3 3 0 0 0 2 5 3 3 0 0 0 5 2 3 3 0 0 0 5-2 3 3 0 0 0 2-5 3 3 0 0 0-1-5Z"/>',
 quiz:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h5M8 16h3"/>',
 more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
};
document.querySelectorAll(".mobile-nav [data-nav-icon]").forEach(el=>{const key=el.dataset.navIcon;if(!iconPaths[key])return;const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("aria-hidden","true");svg.innerHTML=iconPaths[key];el.replaceChildren(svg)});
const more=document.getElementById("mobile-more-trigger"),navTrigger=document.getElementById("navigation-menu-trigger"),navMenu=document.getElementById("navigation-menu");
if(more&&navTrigger&&navMenu)more.addEventListener("click",()=>{navTrigger.click();more.setAttribute("aria-expanded",String(navTrigger.getAttribute("aria-expanded")==="true"))});
function syncActive(){
 const path=location.pathname.split("/").pop()||"dashboard.html";
 document.querySelectorAll(".mobile-nav a").forEach(a=>{const href=(a.getAttribute("href")||"").split("#")[0];const active=href===path;a.classList.toggle("active",active);if(active)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current")});
 const view=new URLSearchParams(location.search).get("view");
 document.querySelectorAll(".mobile-nav [data-view]").forEach(el=>{const active=(el.dataset.view||"dashboard")===(view||"dashboard");el.classList.toggle("active",active);if(active)el.setAttribute("aria-current","page");else el.removeAttribute("aria-current")});
}
syncActive();window.addEventListener("popstate",syncActive);
})();
