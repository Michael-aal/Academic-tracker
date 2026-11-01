(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const state=()=>window.ATCommunityState;
  const api=(path,options={})=>state().api(path,options);
  let recorder=null,recordingStream=null,chunks=[];
  let currentCall=null,incomingCall=null,pc=null,localStream=null,pollHandle=null,incomingHandle=null,lastSignal="",pendingIce=[];
  const me=()=>{try{return JSON.parse(localStorage.getItem("academic-tracker-user")||"{}").id||""}catch(_){return ""}};
  const setStatus=message=>{if($("call-status"))$("call-status").textContent=message||""};
  function stopTracks(){if(localStream){localStream.getTracks().forEach(t=>t.stop());localStream=null}if(recordingStream){recordingStream.getTracks().forEach(t=>t.stop());recordingStream=null}}
  function cleanup(){
    if(pollHandle)clearInterval(pollHandle);pollHandle=null;
    if(pc){try{pc.close()}catch(_){}pc=null}
    stopTracks();pendingIce=[];currentCall=null;incomingCall=null;lastSignal="";
    if($("call-media"))$("call-media").hidden=true;
    if($("remote-video"))$("remote-video").srcObject=null;
    if($("local-video"))$("local-video").srcObject=null;
    if($("remote-audio"))$("remote-audio").srcObject=null;
    if($("end-call"))$("end-call").hidden=true;
    if($("accept-call"))$("accept-call").hidden=true;
    if($("decline-call"))$("decline-call").hidden=true;
    if($("audio-call"))$("audio-call").hidden=false;
    if($("video-call"))$("video-call").hidden=false;
    setStatus("");
  }
  async function signal(kind,payload){
    if(!currentCall)return;
    await api("/community/calls/"+encodeURIComponent(currentCall.id)+"/signals",{method:"POST",body:JSON.stringify({kind,payload})});
  }
  async function flushIce(){
    if(!pc?.remoteDescription)return;
    const queue=pendingIce.splice(0);
    for(const candidate of queue){try{await pc.addIceCandidate(new RTCIceCandidate(candidate))}catch(_){}}
  }
  async function makePeer(call,isCaller){
    const cfg=await api("/community/calls/ice");
    pc=new RTCPeerConnection({iceServers:cfg.iceServers});
    localStream=await navigator.mediaDevices.getUserMedia({audio:true,video:call.callType==="VIDEO"});
    localStream.getTracks().forEach(track=>pc.addTrack(track,localStream));
    $("call-media").hidden=false;
    $("local-video").hidden=call.callType!=="VIDEO";
    $("remote-video").hidden=call.callType!=="VIDEO";
    $("local-video").srcObject=localStream;
    pc.ontrack=event=>{
      const stream=event.streams[0];
      $("remote-audio").srcObject=stream;
      $("remote-video").srcObject=stream;
    };
    pc.onicecandidate=event=>{if(event.candidate)signal("ICE",event.candidate.toJSON()).catch(()=>{})};
    pc.onconnectionstatechange=()=>{
      if(!pc)return;
      if(pc.connectionState==="connected")setStatus("Connected");
      if(["failed","disconnected"].includes(pc.connectionState))setStatus("Connection interrupted. A TURN server may be required.");
    };
    $("end-call").hidden=false;$("audio-call").hidden=true;$("video-call").hidden=true;
    if(isCaller){
      const offer=await pc.createOffer();await pc.setLocalDescription(offer);await signal("OFFER",offer);
    }
    if(pollHandle)clearInterval(pollHandle);
    pollHandle=setInterval(()=>pollSignals(isCaller).catch(()=>{}),1200);
  }
  async function pollSignals(isCaller){
    if(!currentCall||!pc)return;
    const data=await api("/community/calls/"+encodeURIComponent(currentCall.id)+"/signals"+(lastSignal?"?after="+encodeURIComponent(lastSignal):""));
    if(["ENDED","DECLINED"].includes(data.call?.status)){cleanup();setStatus("Call ended.");return}
    for(const item of data.signals||[]){
      lastSignal=item.id;
      if(item.kind==="OFFER"&&!isCaller&&!pc.remoteDescription){
        await pc.setRemoteDescription(new RTCSessionDescription(item.payload));await flushIce();
        const answer=await pc.createAnswer();await pc.setLocalDescription(answer);await signal("ANSWER",answer);
      }else if(item.kind==="ANSWER"&&isCaller&&!pc.remoteDescription){
        await pc.setRemoteDescription(new RTCSessionDescription(item.payload));await flushIce();
      }else if(item.kind==="ICE"){
        if(pc.remoteDescription){try{await pc.addIceCandidate(new RTCIceCandidate(item.payload))}catch(_){}}
        else pendingIce.push(item.payload);
      }
    }
  }
  async function startCall(type){
    const active=state()?.getActiveChat();
    const conversations=state()?.getConversations()||[];
    const conv=conversations.find(c=>c.id===active);
    const other=conv?.members?.find(m=>m.userId!==me());
    if(!other){setStatus("Calls are available in direct conversations with accepted connections.");return}
    try{
      const {call}=await api("/community/calls",{method:"POST",body:JSON.stringify({calleeId:other.userId,callType:type})});
      currentCall=call;setStatus("Calling "+(other.user?.name||"student")+"…");await makePeer(call,true);
    }catch(e){if(currentCall)try{await api("/community/calls/"+currentCall.id,{method:"PATCH",body:JSON.stringify({action:"END"})})}catch(_){}cleanup();setStatus(e.message)}
  }
  async function checkIncoming(){
    if(!localStorage.getItem("academic-tracker-token")||currentCall||incomingCall)return;
    try{
      const {calls=[]}=await api("/community/calls/incoming");
      if(calls.length){incomingCall=calls[0];setStatus("Incoming "+(incomingCall.callType==="VIDEO"?"video":"audio")+" call");$("accept-call").hidden=false;$("decline-call").hidden=false}
    }catch(_){}
  }
  async function acceptCall(){
    if(!incomingCall)return;
    try{
      const {call}=await api("/community/calls/"+encodeURIComponent(incomingCall.id),{method:"PATCH",body:JSON.stringify({action:"ACCEPT"})});
      currentCall=call;incomingCall=null;$("accept-call").hidden=true;$("decline-call").hidden=true;setStatus("Connecting…");await makePeer(call,false);
    }catch(e){cleanup();setStatus(e.message)}
  }
  async function endCall(action="END"){
    const id=currentCall?.id||incomingCall?.id;
    if(id){try{await api("/community/calls/"+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify({action})})}catch(_){}}
    cleanup();
  }
  $("audio-call")?.addEventListener("click",()=>startCall("AUDIO"));
  $("video-call")?.addEventListener("click",()=>startCall("VIDEO"));
  $("end-call")?.addEventListener("click",()=>endCall("END"));
  $("accept-call")?.addEventListener("click",acceptCall);
  $("decline-call")?.addEventListener("click",()=>endCall("DECLINE"));
  incomingHandle=setInterval(checkIncoming,3500);

  $("voice-record")?.addEventListener("click",async()=>{
    if(!state()?.getActiveChat())return setStatus("Open a conversation before recording a voice note.");
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)return setStatus("Voice recording is not supported in this browser.");
    if(recorder?.state==="recording"){recorder.stop();$("voice-record").disabled=true;$("voice-record").textContent="Uploading…";return}
    try{
      recordingStream=await navigator.mediaDevices.getUserMedia({audio:true});chunks=[];
      recorder=new MediaRecorder(recordingStream);
      recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
      recorder.onstop=async()=>{
        recordingStream?.getTracks().forEach(t=>t.stop());recordingStream=null;
        try{
          const blob=new Blob(chunks,{type:recorder.mimeType||"audio/webm"});
          if(blob.size>5*1024*1024)throw new Error("Voice note exceeds the 5 MB limit.");
          const chatId=state().getActiveChat();
          const sig=await api("/community/chat/"+encodeURIComponent(chatId)+"/voice-upload-signature",{method:"POST",body:"{}"});
          const form=new FormData();form.append("file",blob,"voice-note.webm");form.append("api_key",sig.apiKey);form.append("timestamp",String(sig.timestamp));form.append("folder",sig.folder);form.append("signature",sig.signature);
          const response=await fetch("https://api.cloudinary.com/v1_1/"+encodeURIComponent(sig.cloudName)+"/auto/upload",{method:"POST",body:form});
          const result=await response.json().catch(()=>({}));
          if(!response.ok||!result.secure_url)throw new Error("Voice-note upload failed. Check Cloudinary configuration.");
          await api("/community/chat/"+encodeURIComponent(chatId)+"/messages",{method:"POST",body:JSON.stringify({messageType:"VOICE_NOTE",mediaUrl:result.secure_url})});
          await state().openChat(chatId);setStatus("Voice note sent.");
        }catch(e){setStatus(e.message)}
        finally{$("voice-record").disabled=false;$("voice-record").textContent="Record voice note"}
      };
      recorder.start();$("voice-record").textContent="Stop recording";
      setTimeout(()=>{if(recorder?.state==="recording")recorder.stop()},60000);
    }catch(e){recordingStream?.getTracks().forEach(t=>t.stop());recordingStream=null;$("voice-record").textContent="Record voice note";setStatus(e.message||"Microphone permission is required.")}
  });
})();