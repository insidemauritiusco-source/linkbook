/* LinkBook Live: small-group browser video via WebRTC, Supabase for signaling.
   Up to four viewers per host; STUN-only connectivity, not guaranteed on all networks. */
(()=>{
'use strict';
const db=()=>window.linkbookSupabase;
const user=()=>window.linkbookSignedInUser;
const $=s=>document.querySelector(s);
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MAX_VIEWERS=4;
const rtcConfig={iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]};
let active=null,mode='idle',media=null,peers=new Map(),peer=null,selectedId=null;
let cursor=0,interval=null,beat=null,durationTicker=null,wakeLock=null,fetching=false,sessions=[],warning='',loading=false,lastListRefresh=0,hostNames={};
let liveComments=[],liveReactions=[],interactionTimer=null,interactionLoading=false,micMuted=false,cameraOff=false,cameraFacing='user',lastCommentSent=0;
let cameraDevices=[],cameraBusy=false,cameraId=null;
const uid=()=>user()?.id;
const check=res=>{if(res.error)throw res.error;return res.data;};
const page=()=>document.querySelector('#content .lb-live-page');
const labelTime=v=>new Intl.DateTimeFormat('en-GB',{timeZone:'Indian/Mauritius',hour:'2-digit',minute:'2-digit',day:'numeric',month:'short'}).format(new Date(v));
function toast(t){warning=t;const box=$('#liveNotice');if(box){box.textContent=t;box.hidden=!t;}}

function closePeer(pc){try{pc?.close()}catch{}}
function isActiveLive(){return !!active&&(mode==='hosting'||mode==='watching');}
function currentReaction(){return liveReactions.find(r=>r.user_id===uid())?.kind||'';}
function reactionCount(kind){return liveReactions.filter(r=>r.kind===kind).length;}
function interactionsMarkup(){
 const emoji={like:'👍',love:'❤️',haha:'😆',wow:'😮'};
 const host=mode==='hosting';
 return '<section class="lb-live-social" aria-label="Live comments and reactions">'+
 '<div class="lb-live-social-head"><strong>💬 Live chat</strong><span id="liveReactionCount">❤️ '+reactionCount('love')+' · 👍 '+reactionCount('like')+'</span></div>'+
 '<div id="liveComments" class="lb-live-comments" role="log" aria-live="polite" aria-label="Live messages"></div>'+
 '<form id="liveCommentForm" class="lb-live-comment-form"><input name="body" required minlength="1" maxlength="400" placeholder="Write a live comment..." aria-label="Live comment"><button class="primary" type="submit">Send</button></form>'+
 '<div class="lb-live-reactions" aria-label="React to live">'+Object.entries(emoji).map(([kind,symbol])=>
 '<button type="button" class="'+(currentReaction()===kind?'selected':'')+'" data-live-reaction="'+kind+'" aria-label="'+kind+' reaction">'+symbol+'</button>').join('')+'</div>'+
 '<p class="muted">Reactions are one per member and can be changed. Comments are visible to signed-in members. '+(host?'You can remove comments from your broadcast.':'Keep the conversation respectful.')+'</p></section>';
}
async function loadInteractions(){
 if(!isActiveLive()||interactionLoading)return;
 interactionLoading=true;
 try{
  const sessionId=active.id;
  const results=await Promise.all([
   db().from('live_comments').select('id,author_id,body,created_at').eq('session_id',sessionId).order('created_at',{ascending:false}).limit(75),
   db().from('live_reactions').select('user_id,kind').eq('session_id',sessionId).limit(4000)
  ]);
  if(!isActiveLive()||active.id!==sessionId)return;
  liveComments=check(results[0])||[];
  liveReactions=check(results[1])||[];
  const ids=[...new Set(liveComments.map(c=>c.author_id))];
  if(ids.length){
   const res=await db().from('profiles').select('id,display_name').in('id',ids);
   if(!res.error){
    window.LinkBookLiveProfileNames=Object.fromEntries((res.data||[]).map(p=>[p.id,p.display_name]));
   }
  }
  if(isActiveLive()&&active?.id===sessionId)drawInteractions();
 }catch(e){console.warn('Live interactions:',e);}
 finally{interactionLoading=false;}
}
function drawInteractions(){
 const log=$('#liveComments');if(!log)return;
 const wasNearBottom=log.scrollHeight-log.scrollTop-log.clientHeight<85;
 const rows=[...liveComments].reverse();
 if(!rows.length)log.innerHTML='<p class="muted">No comments yet. Say hello! 👋</p>';
 else{
  const ids=[...new Set(rows.map(r=>r.author_id))];
  const known=window.LinkBookLiveProfileNames||{};
  log.innerHTML=rows.map(r=>'<div class="lb-live-comment"><b>'+safe(known[r.author_id]||(r.author_id===uid()?'You':'Member'))+'</b><span>'+safe(r.body)+'</span>'+((mode==='hosting'||r.author_id===uid())?'<button type="button" data-delete-live-comment="'+r.id+'" title="Remove comment" aria-label="Remove comment">×</button>':'')+'</div>').join('');
  for(const id of ids)if(!known[id])known[id]=id===uid()?'You':'Member';
  window.LinkBookLiveProfileNames=known;
 }
 if(wasNearBottom)log.scrollTop=log.scrollHeight;
 const emoji={like:'👍',love:'❤️',haha:'😆',wow:'😮'};
 const count=$('#liveReactionCount');
 if(count)count.textContent=Object.entries(emoji).map(([k,e])=>e+' '+reactionCount(k)).join(' · ');
 for(const btn of document.querySelectorAll('[data-live-reaction]')){
  const selected=currentReaction()===btn.dataset.liveReaction;
  btn.classList.toggle('selected',selected);btn.setAttribute('aria-pressed',String(selected));
 }
}
async function sendComment(form){
 if(!isActiveLive())return;
 const input=form.elements.body,body=input.value.trim();
 if(!body||body.length>400)return;
 if(Date.now()-lastCommentSent<2500){toast('Please wait a moment before posting another comment.');return;}
 lastCommentSent=Date.now();
 const button=form.querySelector('button[type=submit]');button.disabled=true;
 try{
  check(await db().from('live_comments').insert({session_id:active.id,author_id:uid(),body}));
  input.value='';await loadInteractions();
 }catch(e){toast('Comment could not be sent: '+(e.message||e));}
 finally{button.disabled=false;}
}
async function react(kind){
 if(!isActiveLive()||!['like','love','haha','wow'].includes(kind))return;
 try{
  if(currentReaction()===kind){
   check(await db().from('live_reactions').delete().eq('session_id',active.id).eq('user_id',uid()));
  }else{
   check(await db().from('live_reactions').upsert({session_id:active.id,user_id:uid(),kind},{onConflict:'session_id,user_id'}));
  }
  await loadInteractions();
 }catch(e){toast('Could not react: '+(e.message||e));}
}
async function toggleCamera(){
 if(!media||mode!=='hosting')return;
 const track=media.getVideoTracks()[0];if(!track)return;
 track.enabled=!track.enabled;cameraOff=!track.enabled;
 const btn=$('#liveCamera');if(btn)btn.textContent=track.enabled?'📷 Camera off':'📷 Camera on';
}
function labelIsRear(label){return /rear|back|environment|world|arrière|arriere|trasera|rückseite/i.test(label||'');}
function labelIsFront(label){return /front|user|selfie|face|avant|frontal/i.test(label||'');}
function currentCameraTrack(){return media?.getVideoTracks()[0]||null;}
function detectFacing(track){
 const settings=track?.getSettings?.()||{};
 if(settings.facingMode==='user'||settings.facingMode==='environment')return settings.facingMode;
 const device=cameraDevices.find(x=>x.deviceId===settings.deviceId);
 if(labelIsRear(device?.label||track?.label))return 'environment';
 if(labelIsFront(device?.label||track?.label))return 'user';
 return cameraFacing;
}
async function listCameras(){
 if(!navigator.mediaDevices?.enumerateDevices)return [];
 const available=await navigator.mediaDevices.enumerateDevices();
 cameraDevices=available.filter(d=>d.kind==='videoinput'&&d.deviceId);
 return cameraDevices;
}
function cameraDisplayName(d,i){
 if(!d)return 'Camera '+(i+1);
 return d.label||'Camera '+(i+1);
}
function mobileCameraDevice(){return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);}
function renderCameraControls(){
 const select=$('#liveCameraSelect'),state=$('#liveCameraStatus'),track=currentCameraTrack();
 if(!track||mode!=='hosting')return;
 const settings=track.getSettings?.()||{};
 cameraId=settings.deviceId||cameraId;
 cameraFacing=detectFacing(track);
 const local=$('#liveLocal');
 if(local)local.classList.toggle('lb-mirror',cameraFacing==='user');
 if(select){
  const before=select.value;
  select.innerHTML='';
  cameraDevices.forEach((device,i)=>{
   const option=document.createElement('option');
   option.value=device.deviceId;
   option.textContent=cameraDisplayName(device,i);
   select.appendChild(option);
  });
  select.disabled=cameraBusy||cameraDevices.length<=1;
  if(cameraDevices.some(x=>x.deviceId===cameraId))select.value=cameraId;
  else if(before&&cameraDevices.some(x=>x.deviceId===before))select.value=before;
 }
 const canTrySwitch=cameraDevices.length>1||mobileCameraDevice();
 for(const id of ['liveFront','liveBack','liveFlip']){
  const button=$('#'+id);if(button)button.disabled=cameraBusy||!canTrySwitch;
 }
 if(state){
  if(cameraDevices.length<=1){
   state.textContent=mobileCameraDevice()
    ?'Your phone lists '+cameraDevices.length+' camera. You can still try Front or Back: some Android browsers hide the other camera.'
    :'Only one camera detected. Open LinkBook on a phone with front and back cameras to switch.';
  }else{
   const current=cameraDevices.find(d=>d.deviceId===cameraId);
   state.textContent='Using '+(cameraFacing==='environment'?'back camera':cameraFacing==='user'?'front camera':'camera')+(current?.label?' — '+current.label:'')+'. Choose Front, Back, or a specific camera.';
  }
 }
}
async function refreshCameras(){
 try{await listCameras();renderCameraControls();}
 catch(e){const el=$('#liveCameraStatus');if(el)el.textContent='Unable to list cameras: '+(e.message||e);}
}
async function applyVideoTrack(newTrack,oldTrack){
 if(!media||mode!=='hosting'){newTrack.stop();return false;}
 const senders=[...peers.values()].flatMap(pc=>pc.getSenders().filter(sender=>sender.track?.kind==='video'));
 await Promise.all(senders.map(sender=>sender.replaceTrack(newTrack)));
 if(oldTrack&&media.getTracks().includes(oldTrack))media.removeTrack(oldTrack);
 oldTrack?.stop();
 newTrack.enabled=!cameraOff;
 media.addTrack(newTrack);
 const video=$('#liveLocal');if(video){video.srcObject=media;video.play().catch(()=>{});}
 return true;
}
async function switchCamera(direction='toggle'){
 if(cameraBusy||mode!=='hosting'||!media||!navigator.mediaDevices?.getUserMedia)return;
 cameraBusy=true;
 const oldTrack=currentCameraTrack(),currentStream=media,originalFacing=detectFacing(oldTrack);
 const oldSettings=oldTrack?.getSettings?.()||{};
 const oldId=oldSettings.deviceId||cameraId;
 let stoppedOld=false,newTrack=null;
 try{
  await listCameras();
  const byId=cameraDevices.find(x=>x.deviceId===direction);
  const wanted=byId?null:(direction==='toggle'?(originalFacing==='user'?'environment':'user'):direction);
  if(!byId&&cameraDevices.length<=1&&!mobileCameraDevice()){
   toast('Only one camera is available. Please use a phone to switch between front and back.');
   return;
  }
  if(byId?.deviceId===oldId){
   toast('That camera is already selected.');
   return;
  }
  const constraints=[];
  if(byId){
   constraints.push({deviceId:{exact:byId.deviceId}});
  }else{
   // Prefer the logical front/back camera on phones: Android device IDs can change.
   constraints.push({facingMode:{exact:wanted}});
   constraints.push({facingMode:wanted});
   const named=cameraDevices.find(x=>x.deviceId!==oldId&&(wanted==='environment'?labelIsRear(x.label):labelIsFront(x.label)));
   if(named)constraints.push({deviceId:{exact:named.deviceId}});
  }
  // Android often cannot open another camera until the previous one is released.
  if(oldTrack?.readyState==='live'){oldTrack.stop();stoppedOld=true;}
  if(stoppedOld)await new Promise(resolve=>setTimeout(resolve,250));
  let lastError=null;
  for(const video of constraints){
   try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:false,video});
    const candidate=stream.getVideoTracks()[0];
    if(!candidate)throw Error('The selected camera returned no video.');
    const settings=candidate.getSettings?.()||{};
    if(wanted&&settings.facingMode&&settings.facingMode!==wanted){
     candidate.stop();lastError=Error('The browser selected the wrong camera.');continue;
    }
    if(wanted&&settings.deviceId&&oldId===settings.deviceId&&cameraDevices.length>1){
     candidate.stop();lastError=Error('The browser reopened the same camera.');continue;
    }
    newTrack=candidate;
    break;
   }catch(e){
    lastError=e;
    if(e.name==='NotAllowedError'||e.name==='SecurityError')throw e;
    await new Promise(resolve=>setTimeout(resolve,250));
   }
  }
  if(!newTrack)throw lastError||Error('Unable to open the requested camera.');
  if(mode!=='hosting'||media!==currentStream){newTrack.stop();return;}
  const got=newTrack.getSettings?.()||{};
  if(!await applyVideoTrack(newTrack,oldTrack))return;
  cameraId=got.deviceId||byId?.deviceId||null;
  cameraFacing=got.facingMode||(
   labelIsRear(byId?.label)?'environment':labelIsFront(byId?.label)?'user':wanted||originalFacing);
  await refreshCameras();
  toast('Camera changed to '+(cameraFacing==='environment'?'back':'front')+'.');
 }catch(e){
  if(newTrack?.readyState==='live'&&!media?.getTracks().includes(newTrack))newTrack.stop();
  let restored=false;
  if(stoppedOld&&mode==='hosting'&&media===currentStream){
   // If switching fails, reopen the original camera so the live stream can continue.
   const recoveryOptions=[{facingMode:{ideal:originalFacing}}];
   if(oldId)recoveryOptions.push({deviceId:{exact:oldId}});
   recoveryOptions.push(true);
   for(const video of recoveryOptions){
    try{
     const stream=await navigator.mediaDevices.getUserMedia({audio:false,video});
     const back=stream.getVideoTracks()[0];
     if(!back)continue;
     try{
      if(await applyVideoTrack(back,oldTrack)){
       cameraFacing=originalFacing;
       cameraId=back.getSettings?.().deviceId||null;
       restored=true;break;
      }
     }catch(replaceError){back.stop();throw replaceError;}
    }catch(recoveryError){console.warn('Camera restoration attempt failed:',recoveryError);}
   }
  }
  await refreshCameras();
  toast('Camera switch failed: '+(e.message||e)+(restored?'. Original camera restored.':'. Camera could not be restored; try ending and restarting Live in Chrome.'));
 }finally{
  cameraBusy=false;
  renderCameraControls();
 }
}

function startedAtMarkup(){
 if(!active?.started_at)return '';
 return '<p class="lb-live-started">Broadcast started: <time datetime="'+safe(active.started_at)+'">'+safe(labelTime(active.started_at))+' MUT</time></p>';
}
function liveStageClock(){
 return '<time class="lb-video-clock" data-mu-clock="short" aria-label="Current Mauritius time">Mauritius time</time>';
}
function elapsedTime(start){
 const total=Math.max(0,Math.floor((Date.now()-new Date(start).getTime())/1000))||0;
 const days=Math.floor(total/86400),hours=Math.floor((total%86400)/3600),minutes=Math.floor((total%3600)/60),seconds=total%60;
 const part=n=>String(n).padStart(2,'0');
 return (days?days+'d ':'')+part(hours)+':'+part(minutes)+':'+part(seconds);
}
function updateDuration(){
 const el=$('#liveElapsed');
 if(el&&active&&(mode==='hosting'||mode==='watching'))el.textContent='⏱ '+elapsedTime(active.started_at)+' live';
}
async function keepScreenAwake(){
 if(!('wakeLock' in navigator)||wakeLock||mode!=='hosting'||document.visibilityState!=='visible')return;
 try{wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener('release',()=>{wakeLock=null;});}
 catch(e){console.info('Screen wake lock unavailable:',e.message||e);}
}
async function heartbeat(){
 if(mode!=='hosting'||!active)return;
 try{
  const r=await db().from('live_sessions').update({last_heartbeat_at:new Date().toISOString()}).eq('id',active.id).eq('host_id',uid()).eq('status','live');
  if(r.error)throw r.error;
 }catch(e){console.warn('Live heartbeat failed:',e);toast('Internet or server issue. Keep this tab open and check your connection.');}
}
function release(){
 clearInterval(interval);clearInterval(beat);clearInterval(durationTicker);clearInterval(interactionTimer);interval=null;beat=null;durationTicker=null;interactionTimer=null;
 liveComments=[];liveReactions=[];interactionLoading=false;
 wakeLock?.release().catch(()=>{});wakeLock=null;
 peers.forEach(closePeer);peers.clear();closePeer(peer);peer=null;
 media?.getTracks().forEach(t=>t.stop());media=null;
 cursor=0;selectedId=null;active=null;mode='idle';fetching=false;cameraDevices=[];cameraId=null;cameraBusy=false;
}
async function stopBroadcast(){
 if(mode!=='hosting')return;
 const s=active;
 release();
 if(s){try{check(await db().from('live_sessions').update({status:'ended',ended_at:new Date().toISOString()}).eq('id',s.id).eq('host_id',uid()));}catch(e){console.warn('Could not end broadcast',e)}}
 toast('Your broadcast has ended.');
 if(page()){page().dataset.liveState='idle';await loadSessions();draw();}
}
async function stopWatching(){
 if(mode!=='watching')return;
 const id=active?.host_id;
 if(id&&selectedId)sendSignal(id,'leave',{}).catch(()=>{});
 release();toast('Left the broadcast.');
 if(page()){page().dataset.liveState='idle';draw();}
}
function leavePage(){
 if(mode==='hosting')stopBroadcast().catch(console.error);
 else if(mode==='watching')stopWatching().catch(console.error);
}
async function loadSessions(){
 if(!db()||!uid())return;
 const cutoff=new Date(Date.now()-60000).toISOString();
 const data=check(await db().from('live_sessions').select('id,host_id,title,started_at,status,last_heartbeat_at')
 .eq('status','live').gte('last_heartbeat_at',cutoff).order('started_at',{ascending:false}).limit(30));
 sessions=data||[];
 const ids=[...new Set(sessions.map(s=>s.host_id))];
 if(ids.length){
  const people=check(await db().from('profiles').select('id,display_name').in('id',ids));
  hostNames=Object.fromEntries((people||[]).map(x=>[x.id,x.display_name]));
 }
 lastListRefresh=Date.now();
}
async function sendSignal(recipient,kind,payload){
 if(!active||!uid())return;
 check(await db().from('live_signals').insert({session_id:active.id,sender_id:uid(),recipient_id:recipient,kind,payload}));
}
function wireCandidates(pc,recipient){
 pc.onicecandidate=e=>{
  if(e.candidate)sendSignal(recipient,'candidate',{candidate:e.candidate.toJSON()}).catch(console.error);
 };
 pc.onconnectionstatechange=()=>{
  if(pc.connectionState==='failed'||pc.connectionState==='closed'){
   if(mode==='hosting'){peers.delete(recipient);closePeer(pc);updateCount();}
   else if(mode==='watching')toast('Connection lost. You can leave and try again.');
  }
 };
}
async function addIce(pc,payload){
 if(!payload?.candidate)return;
 try{
  if(pc.remoteDescription)await pc.addIceCandidate(payload.candidate);
  else (pc.__pendingIce??=[]).push(payload.candidate);
 }catch(e){console.warn('ICE candidate rejected',e)}
}
async function flushIce(pc){
 for(const candidate of pc.__pendingIce||[]){try{await pc.addIceCandidate(candidate)}catch(e){console.warn(e)}}
 pc.__pendingIce=[];
}
async function hostSignal(signal){
 const id=signal.sender_id;
 if(signal.kind==='leave'){
  closePeer(peers.get(id));peers.delete(id);updateCount();return;
 }
 if(signal.kind==='join'){
  if(peers.has(id))closePeer(peers.get(id));
  if(!peers.has(id)&&peers.size>=MAX_VIEWERS)return;
  const pc=new RTCPeerConnection(rtcConfig);
  peers.set(id,pc);wireCandidates(pc,id);
  media.getTracks().forEach(t=>pc.addTrack(t,media));
  const offer=await pc.createOffer();await pc.setLocalDescription(offer);
  await sendSignal(id,'offer',{sdp:pc.localDescription.toJSON()});
  updateCount();return;
 }
 const pc=peers.get(id);if(!pc)return;
 if(signal.kind==='answer'&&signal.payload?.sdp){
  await pc.setRemoteDescription(signal.payload.sdp);await flushIce(pc);
 }else if(signal.kind==='candidate')await addIce(pc,signal.payload);
}
async function viewerSignal(signal){
 if(signal.sender_id!==active?.host_id)return;
 if(signal.kind==='leave'){toast('The host disconnected.');await stopWatching();return;}
 if(signal.kind==='offer'&&signal.payload?.sdp){
  if(peer)closePeer(peer);
  peer=new RTCPeerConnection(rtcConfig);wireCandidates(peer,active.host_id);
  peer.ontrack=e=>{
   const video=$('#liveRemote');
   if(video){video.srcObject=e.streams[0];video.play().catch(()=>toast('Tap play to watch the broadcast.'));}
   toast('');
  };
  await peer.setRemoteDescription(signal.payload.sdp);await flushIce(peer);
  const answer=await peer.createAnswer();await peer.setLocalDescription(answer);
  await sendSignal(active.host_id,'answer',{sdp:peer.localDescription.toJSON()});
 }else if(signal.kind==='candidate'){
  if(peer)await addIce(peer,signal.payload);
  else (window.__linkbookEarlyIce??=[]).push(signal.payload);
 }
 if(peer&&window.__linkbookEarlyIce?.length){
  for(const ice of window.__linkbookEarlyIce)await addIce(peer,ice);
  window.__linkbookEarlyIce=[];
 }
}
async function poll(){
 if(!uid()||!active||fetching)return;
 fetching=true;
 try{
  const data=check(await db().from('live_signals').select('id,session_id,sender_id,recipient_id,kind,payload')
   .eq('session_id',active.id).eq('recipient_id',uid()).gt('id',cursor).order('id',{ascending:true}).limit(100));
  for(const signal of data||[]){
   cursor=Math.max(cursor,signal.id);
   try{if(mode==='hosting')await hostSignal(signal);else if(mode==='watching')await viewerSignal(signal);}
   catch(e){console.warn('Signaling:',e)}
  }
  if(mode==='watching'){
   const state=check(await db().from('live_sessions').select('status,last_heartbeat_at').eq('id',active.id).maybeSingle());
   if(!state||state.status!=='live'||Date.now()-new Date(state.last_heartbeat_at).getTime()>65000){
    await stopWatching();toast('This broadcast has ended.');draw();
   }
  }
 }catch(e){console.warn('Live connection:',e)}
 finally{fetching=false}
}
function startPolling(){
 clearInterval(interval);interval=setInterval(()=>{poll().catch(console.error)},1600);poll().catch(console.error);
}
function updateCount(){const el=$('#liveViewerCount');if(el)el.textContent=peers.size+' / '+MAX_VIEWERS+' viewers connected';}
async function goLive(title){
 if(loading||mode!=='idle')return;
 loading=true;toast('');
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw Error('Camera access requires HTTPS and a supported browser.');
  // Camera permission must be requested by clicking Go Live.
  media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'user'},width:{ideal:1280},height:{ideal:720}},audio:{echoCancellation:true}});
  const prior=check(await db().from('live_sessions').select('id').eq('host_id',uid()).eq('status','live'));
  if(prior?.length)check(await db().from('live_sessions').update({status:'ended',ended_at:new Date().toISOString()}).eq('host_id',uid()).eq('status','live'));
  const created=check(await db().from('live_sessions').insert({host_id:uid(),title:title.trim()}).select('*').single());
  active=created;mode='hosting';cursor=0;
  beat=setInterval(()=>{heartbeat().catch(console.warn)},12000);
  durationTicker=setInterval(updateDuration,1000);
  interactionTimer=setInterval(()=>{loadInteractions().catch(console.warn)},3500);
  keepScreenAwake().catch(console.warn);
  draw();const video=$('#liveLocal');if(video){video.srcObject=media;video.play().catch(()=>{});}
  await refreshCameras();
  startPolling();loadInteractions().catch(console.warn);
 }catch(e){release();toast(e.message||'Unable to start the broadcast.');draw();}
 finally{loading=false}
}
async function watch(sessionId){
 if(loading)return;
 const session=sessions.find(s=>s.id===sessionId);
 if(!session||session.host_id===uid())return;
 loading=true;toast('');
 try{
  if(mode==='watching')await stopWatching();
  active=session;selectedId=session.id;mode='watching';cursor=0;draw();
  durationTicker=setInterval(updateDuration,1000);updateDuration();
  interactionTimer=setInterval(()=>{loadInteractions().catch(console.warn)},3500);
  await sendSignal(session.host_id,'join',{});
  startPolling();loadInteractions().catch(console.warn);
  setTimeout(()=>{
   if(mode==='watching'&&active?.id===session.id&&!$('#liveRemote')?.srcObject)
    toast('Waiting for the host. Browser-to-browser video may not connect on some networks.');
  },15000);
 }catch(e){release();toast(e.message||'Unable to join the broadcast.');draw();}
 finally{loading=false}
}
function draw(){
 const el=page();if(!el)return;
 el.dataset.liveState=mode;
 const wrap=el.querySelector('#liveBody');if(!wrap)return;
 if(mode==='hosting'){
  wrap.innerHTML='<div class="lb-live-stage"><div class="lb-live-pill">● LIVE</div>'+liveStageClock()+'<video id="liveLocal" autoplay playsinline muted></video></div><div class="lb-live-controls"><strong>'+safe(active?.title)+'</strong><span id="liveViewerCount">'+peers.size+' / '+MAX_VIEWERS+' viewers connected</span><span id="liveElapsed" class="lb-live-elapsed">⏱ 00:00:00 live</span><button id="liveShare" class="secondary">Share</button><button id="liveMute" class="secondary">Mute mic</button><button id="liveCamera" class="secondary">📷 Camera off</button><button id="liveFront" class="secondary">🤳 Front camera</button><button id="liveBack" class="secondary">📷 Back camera</button><button id="liveFlip" class="secondary">🔄 Switch</button><button id="liveEnd" class="primary lb-live-stop">End Live</button></div>'+startedAtMarkup()+'<div class="lb-camera-chooser"><label for="liveCameraSelect">Available cameras</label><select id="liveCameraSelect" aria-label="Select camera"><option value="">Detecting cameras…</option></select><p id="liveCameraStatus" role="status">Checking front and back cameras…</p></div><p class="muted">No fixed time limit. Keep this page open and your device awake; leaving Live or losing internet can end the broadcast.</p>'+interactionsMarkup();
  const v=$('#liveLocal');if(v&&media){v.srcObject=media;v.play().catch(()=>{});}
 }else if(mode==='watching'){
  wrap.innerHTML='<div class="lb-live-stage"><div class="lb-live-pill">● LIVE</div>'+liveStageClock()+'<video id="liveRemote" autoplay playsinline controls></video></div><div class="lb-live-controls"><strong>'+safe(active?.title)+'</strong><span id="liveElapsed" class="lb-live-elapsed">⏱ 00:00:00 live</span><button id="liveShare" class="secondary">Share</button><button id="liveLeave" class="primary">Leave</button></div>'+startedAtMarkup()+'<p class="muted">Allow your browser to play the video. The broadcaster controls the microphone and camera.</p>'+interactionsMarkup();
  // On an incidental re-render, restore attached stream.
  const v=$('#liveRemote');if(v&&peer?.getReceivers().length){const tracks=peer.getReceivers().map(r=>r.track).filter(Boolean);if(tracks.length)v.srcObject=new MediaStream(tracks);}
 }else{
  wrap.innerHTML='<section class="panel lb-live-create"><h3>🔴 Start a Live broadcast</h3><p>Share video and audio with friends on LinkBook.</p><form id="liveForm"><label for="liveTitle">Live title</label><input id="liveTitle" name="title" class="form-input" maxlength="110" minlength="3" required placeholder="What are you broadcasting?" value="Live from Mauritius"><button class="primary" type="submit">📹 Go Live</button></form><p class="muted">No fixed time limit: stream while your browser and internet stay connected. Up to '+MAX_VIEWERS+' viewers. This beta may not work on every network.</p></section>'+
  '<h2 class="lb-live-subheading">Live now</h2><div id="liveListings">'+(sessions.length?sessions.map(s=>'<section class="panel lb-live-listing"><div><strong>🔴 '+safe(s.title)+'</strong><p class="muted">'+safe(hostNames[s.host_id]||'LinkBook member')+' · '+labelTime(s.started_at)+' MUT</p></div>'+(s.host_id===uid()?'<span class="muted">Your live</span>':'<button class="primary" data-watch="'+s.id+'">Watch Live</button>')+'</section>').join(''):'<section class="panel empty">No active broadcasts right now. Be the first to go live!</section>')+'</div>';
 }
 updateDuration();drawInteractions();
 document.querySelectorAll("[data-mu-clock]").forEach(el=>{const opts={timeZone:"Indian/Mauritius",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false};if(el.getAttribute("data-mu-clock")!=="short")Object.assign(opts,{weekday:"short",day:"2-digit",month:"short",year:"numeric"});el.textContent=new Intl.DateTimeFormat("en-GB",opts).format(new Date())+" MUT";});
 const msg=el.querySelector('#liveNotice');if(msg){msg.textContent=warning;msg.hidden=!warning;}
}
async function render(root){
 if(!db()||!uid()){
  root.innerHTML='<section class="panel"><h2>Live</h2><p>Sign in to watch or start a Live broadcast.</p></section>';return;
 }
 if(page())return; // Preserve video element on regular feed refresh.
 root.innerHTML='<div class="lb-live-page"><h1 class="page-title">🔴 LinkBook Live <span class="lb-live-beta">BETA</span></h1><div class="lb-live-timebar"><strong>🇲🇺 Live Mauritius date &amp; time</strong><time data-mu-clock aria-live="off">Loading…</time></div><p id="liveNotice" class="lb-live-notice" role="status" hidden></p><div id="liveBody"><section class="panel empty">Loading live broadcasts…</section></div></div>';
 try{await loadSessions();draw();const requested=new URLSearchParams(location.search).get('live');if(requested&&/^[0-9a-f-]{36}$/i.test(requested)){history.replaceState(null,'',location.pathname);await watch(requested);}}catch(e){toast(e.message||'Could not load live broadcasts.');draw();}
}
document.addEventListener('submit',e=>{
 if(e.target.id==='liveCommentForm'){e.preventDefault();sendComment(e.target).catch(console.error);return;}
 if(e.target.id!=='liveForm')return;
 e.preventDefault();
 const title=e.target.elements.title.value.trim();
 if(title.length>=3)goLive(title).catch(console.error);
});
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.hasAttribute('data-watch')){watch(b.dataset.watch).catch(console.error);return;}
 if(b.dataset.liveReaction){react(b.dataset.liveReaction).catch(console.error);return;}
 if(b.dataset.deleteLiveComment){
  if(!confirm('Remove this live comment?'))return;
  db().from('live_comments').delete().eq('id',b.dataset.deleteLiveComment).then(({error})=>{if(error)toast(error.message);else loadInteractions().catch(console.warn)});
  return;
 }
 if(b.id==='liveCamera'){toggleCamera().catch(console.error);return;}
 if(b.id==='liveFront'){switchCamera('user').catch(console.error);return;}
 if(b.id==='liveBack'){switchCamera('environment').catch(console.error);return;}
 if(b.id==='liveFlip'){switchCamera('toggle').catch(console.error);return;}
 if(b.id==='liveEnd'){stopBroadcast().catch(console.error);return;}
 if(b.id==='liveLeave'){stopWatching().catch(console.error);return;}
 if(b.id==='liveMute'&&media){
  const tracks=media.getAudioTracks();tracks.forEach(t=>t.enabled=!t.enabled);
  b.textContent=tracks.some(t=>t.enabled)?'Mute mic':'Unmute mic';return;
 }
 if(b.id==='liveShare'){
  const link=location.origin+location.pathname+'?live='+encodeURIComponent(active?.id||'');
  if(navigator.share)navigator.share({title:'Watch LinkBook Live',url:link}).catch(()=>{});
  else navigator.clipboard?.writeText(link).then(()=>toast('Live link copied.')).catch(()=>toast(link));
 }
});
document.addEventListener('change',e=>{
 if(e.target.id==='liveCameraSelect'&&e.target.value){switchCamera(e.target.value).catch(console.error);}
});
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState==='visible'&&mode==='hosting'){
  heartbeat().catch(console.warn);
  keepScreenAwake().catch(console.warn);
  updateDuration();
 }
});
window.LinkBookLive={render,leavePage};
window.addEventListener('beforeunload',()=>{
 media?.getTracks().forEach(t=>t.stop());
 if(mode==='hosting'&&active?.id){
  // Best effort: stale heartbeat also automatically hides broadcasts if a tab closes abruptly.
  db()?.from('live_sessions').update({status:'ended',ended_at:new Date().toISOString()}).eq('id',active.id).eq('host_id',uid()).then(()=>{});
 }
});
})();
