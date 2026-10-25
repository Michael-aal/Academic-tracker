(() => {
"use strict";
const API_BASE=(window.AT_API_BASE||"https://academic-tracker-0b2q.onrender.com").replace(/\/$/,"");
const token=localStorage.getItem("academic-tracker-token");
if(!token){window.location.replace("login.html");return;}
const $=id=>document.getElementById(id);let videos=[],selectedId="";
async function searchVideos(query){const response=await fetch(API_BASE+"/api/videos/search?q="+encodeURIComponent(query),{headers:{Authorization:"Bearer "+token}});const data=await response.json().catch(()=>({}));if(response.status===401){localStorage.removeItem("academic-tracker-token");localStorage.removeItem("academic-tracker-user");window.location.replace("login.html");throw new Error("Your session expired. Please sign in again.");}if(!response.ok)throw new Error(data.error||"Could not search educational videos.");return data;}
function renderResults(){const list=$("video-results");list.replaceChildren();videos.forEach(video=>{const button=document.createElement("button");button.type="button";button.className="ev-video-card";button.setAttribute("aria-pressed",video.id===selectedId?"true":"false");button.dataset.videoId=video.id;const image=document.createElement("img");image.src=video.thumbnail;image.alt="";image.loading="lazy";const copy=document.createElement("span");copy.className="ev-video-copy";const title=document.createElement("strong");title.textContent=video.title;const channel=document.createElement("span");channel.textContent=video.channelTitle;const description=document.createElement("p");description.textContent=video.description;copy.append(title,channel,description);button.append(image,copy);list.append(button);});$("result-count").textContent=videos.length+(videos.length===1?" video":" videos");$("results-empty").hidden=videos.length>0;}
function selectVideo(id){const video=videos.find(item=>item.id===id);if(!video)return;selectedId=id;$("player-placeholder").hidden=true;$("player-wrap").hidden=false;$("video-player").src="https://www.youtube-nocookie.com/embed/"+encodeURIComponent(video.id)+"?rel=0";$("selected-title").textContent=video.title;$("selected-channel").textContent=video.channelTitle;$("open-original").href="https://www.youtube.com/watch?v="+encodeURIComponent(video.id);$("open-original").hidden=false;$("landscape-button").hidden=false;renderResults();}
$("video-search-form").addEventListener("submit",async event=>{event.preventDefault();const query=$("video-query").value.trim();if(query.length<2)return;const button=$("search-button");button.disabled=true;button.textContent="Searching…";$("video-status").classList.remove("error");$("video-status").textContent="Searching for school-focused lessons…";try{const subject=$("video-subject").value;const level=$("video-level").value;const data=await searchVideos([subject,query,level].filter(Boolean).join(" "));videos=Array.isArray(data.items)?data.items:[];selectedId="";$("player-placeholder").hidden=false;$("player-wrap").hidden=true;$("video-player").src="about:blank";$("selected-title").textContent="No video selected";$("selected-channel").textContent="";$("open-original").hidden=true;$("landscape-button").hidden=true;renderResults();$("video-status").textContent=videos.length?"Found "+videos.length+" educational videos. Select one to watch here.":"No matching videos were returned. Try a different topic.";}catch(error){$("video-status").textContent=error.message||"Video search failed. Please try again.";$("video-status").classList.add("error");videos=[];renderResults();}finally{button.disabled=false;button.textContent="Search lessons";}});
$("video-results").addEventListener("click",event=>{const card=event.target.closest("[data-video-id]");if(card)selectVideo(card.dataset.videoId);});

const playerWrap=$("player-wrap");
$("landscape-button").addEventListener("click",async()=>{
  try{
    if(document.fullscreenElement){await document.exitFullscreen();return;}
    if(playerWrap.requestFullscreen) await playerWrap.requestFullscreen();
    else if($("video-player").requestFullscreen) await $("video-player").requestFullscreen();
    else { $("video-status").textContent="Fullscreen is not supported in this browser. The video remains in a wide 16:9 player."; return; }
    try{if(screen.orientation&&screen.orientation.lock)await screen.orientation.lock("landscape");}catch{}
  }catch{
    $("video-status").textContent="Landscape fullscreen is not available in this browser. You can still watch in the wide 16:9 player.";
  }
});
document.addEventListener("fullscreenchange",()=>{if(!document.fullscreenElement){try{if(screen.orientation&&screen.orientation.unlock)screen.orientation.unlock();}catch{}}});
$("signout").addEventListener("click",()=>{localStorage.removeItem("academic-tracker-token");localStorage.removeItem("academic-tracker-user");window.location.replace("login.html");});
})();