/* Persistent global theme control for Academic Tracker. */
(()=>{"use strict";
const root=document.documentElement;
const storageKey="academic-tracker-theme";
let theme="dark";
try{const saved=localStorage.getItem(storageKey);if(saved==="light"||saved==="dark")theme=saved;}catch{}
function icon(mode){return mode==="dark"?'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>':'<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"/>'}
function apply(next){theme=next;root.dataset.theme=theme;root.style.colorScheme=theme;
 try{localStorage.setItem(storageKey,theme)}catch{}
 document.querySelectorAll("#at-theme-toggle").forEach(btn=>{btn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icon(theme)+'</svg><span>'+(theme==="dark"?"Light mode":"Dark mode")+'</span>';btn.setAttribute("aria-label","Switch to "+(theme==="dark"?"light":"dark")+" mode");btn.setAttribute("aria-pressed",String(theme==="light"));});
}
const style=document.createElement("link");style.rel="stylesheet";style.href="global-light-mode.css";document.head.appendChild(style);
apply(theme);
function addToggle(){const actions=document.querySelector(".at-nav-actions");if(!actions||document.getElementById("at-theme-toggle"))return;const btn=document.createElement("button");btn.id="at-theme-toggle";btn.type="button";btn.className="at-nav-icon-button";btn.addEventListener("click",()=>apply(theme==="dark"?"light":"dark"));actions.insertBefore(btn,actions.firstChild);apply(theme)}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",addToggle,{once:true});else addToggle();
new MutationObserver(()=>{if(!document.getElementById("at-theme-toggle"))addToggle()}).observe(document.body,{childList:true,subtree:true});
})();