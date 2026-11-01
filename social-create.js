(() => {
  "use strict";
  const API=(window.AT_API_BASE||"https://academic-tracker-0b2q.onrender.com").replace(/\/$/,"")+"/api";
  const token=()=>localStorage.getItem("academic-tracker-token")||"";
  const $=id=>document.getElementById(id);
  const status=message=>{$("create-status").textContent=message||"";};
  const headers=()=>({"Content-Type":"application/json",...(token()?{Authorization:"Bearer "+token()}:{})});
  async function api(path,options={}) {
    const response=await fetch(API+path,{...options,headers:{...headers(),...(options.headers||{})},cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"The request could not be completed.");
    return data;
  }
  if(!token()){location.replace("login.html?next=social-create.html");return;}
  let previewUrl="";
  let profileReady=false;
  function clearPreview(){
    if(previewUrl)URL.revokeObjectURL(previewUrl);
    previewUrl="";
    $("create-preview").replaceChildren();
    $("create-preview").hidden=true;
  }
  $("create-media").addEventListener("change",()=>{
    clearPreview();
    const file=$("create-media").files?.[0];
    if(!file)return;
    const video=file.type.startsWith("video/");
    if(!video&&!file.type.startsWith("image/")){ $("create-media").value="";status("Choose an image or video file.");return; }
    if(file.size>(video?50:8)*1024*1024){$("create-media").value="";status(video?"Videos must be 50 MB or smaller.":"Images must be 8 MB or smaller.");return;}
    previewUrl=URL.createObjectURL(file);
    const media=document.createElement(video?"video":"img");
    media.src=previewUrl;media.className="post-preview-asset";media.alt="Selected media preview";
    if(video)media.controls=true;
    $("create-preview").append(media);
    $("create-preview").hidden=false;
    status("");
  });
  async function upload(file){
    const video=file.type.startsWith("video/");
    if(!file.type.startsWith(video?"video/":"image/"))throw new Error("Choose a supported photo or video from your phone.");
    if(file.size>(video?50:8)*1024*1024)throw new Error(video?"Videos must be 50 MB or smaller.":"Images must be 8 MB or smaller.");
    const signature=await api("/community/media-upload-signature",{method:"POST",body:JSON.stringify({resourceType:video?"video":"image"})});
    if(!signature.cloudName||!signature.apiKey||!signature.signature||!signature.timestamp||!signature.folder)throw new Error("Media storage is not configured correctly. Please contact the administrator.");
    const form=new FormData();
    form.append("file",file);form.append("api_key",signature.apiKey);form.append("timestamp",String(signature.timestamp));form.append("folder",signature.folder);form.append("signature",signature.signature);
    const response=await fetch("https://api.cloudinary.com/v1_1/"+encodeURIComponent(signature.cloudName)+"/"+signature.resourceType+"/upload",{method:"POST",body:form});
    const result=await response.json().catch(()=>({}));
    if(!response.ok||!result.secure_url)throw new Error(result.error?.message||"Media upload failed. Check the community media configuration and try again.");
    return video?{videoUrl:result.secure_url}:{mediaUrl:result.secure_url};
  }
  $("social-create-form").addEventListener("submit",async event=>{
    event.preventDefault();
    if(!profileReady){status("Your profile is still loading. Wait a moment and try again; if this message remains, refresh the page.");return;}
    const body=$("create-body").value.trim(),file=$("create-media").files?.[0];
    if(!body&&!file){status("Write something or attach a photo or video first.");return;}
    const button=$("publish-social-post");button.disabled=true;button.textContent="Publishing…";
    try{
      const media=file?await upload(file):{};
      await api("/community/posts",{method:"POST",body:JSON.stringify({body,...media,subject:$("create-subject").value.trim(),visibility:$("create-visibility").value})});
      status("Your post is live. Taking you back to the feed…");
      $("social-create-form").reset();clearPreview();
      setTimeout(()=>{location.href="social-media.html";},500);
    }catch(error){status(error.message);}
    finally{button.disabled=false;button.textContent="Publish post";}
  });
  status("Loading your profile…");
  api("/community/profile/me").then(({profile})=>{
    if(!profile?.usernameSet){location.replace("social-media.html");return;}
    profileReady=true;status("");
    $("create-name").textContent=profile.displayName||"Student";
    $("create-handle").textContent="@"+(profile.username||"student");
    $("create-avatar").innerHTML=profile.avatarUrl?'<img src="'+String(profile.avatarUrl).replace(/["<>]/g,"")+'" alt="">':(profile.displayName||"S").slice(0,1).toUpperCase();
  }).catch(error=>status(error.message));
})();