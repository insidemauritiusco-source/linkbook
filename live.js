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
async function switchCamera(){
 if(!media||mode!=='hosting'||!navigator.mediaDevices?.getUserMedia)return;
 try{
  const next=cameraFacing==='user'?'environment':'user';
  const newStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:next}},audio:false});
  const replacement=newStream.getVideoTracks()[0];
  for(const pc of peers.values()){
   const sender=pc.getSenders().find(x=>x.track?.kind==='video');
   if(sender)await sender.replaceTrack(replacement);
  }
  const old=media.getVideoTracks()[0];media.removeTrack(old);old.stop();media.addTrack(replacement);
  cameraFacing=next;cameraOff=false;
  const video=$('#liveLocal');if(video)video.srcObject=media;
  const btn=$('#liveCamera');if(btn)btn.textContent='📷 Camera off';
 }catch(e){toast('Camera switch not available: '+(e.message||e));}
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
 cursor=0;selectedId=null;active=null;mode='idle';fetching=false;
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
  media=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720}},audio:{echoCancellation:true}});
  const prior=check(await db().from('live_sessions').select('id').eq('host_id',uid()).eq('status','live'));
  if(prior?.length)check(await db().from('live_sessions').update({status:'ended',ended_at:new Date().toISOString()}).eq('host_id',uid()).eq('status','live'));
  const created=check(await db().from('live_sessions').insert({host_id:uid(),title:title.trim()}).select('*').single());
  active=created;mode='hosting';cursor=0;
  beat=setInterval(()=>{heartbeat().catch(console.warn)},12000);
  durationTicker=setInterval(updateDuration,1000);
  interactionTimer=setInterval(()=>{loadInteractions().catch(console.warn)},3500);
  keepScreenAwake().catch(console.warn);
  draw();const video=$('#liveLocal');if(video){video.srcObject=media;video.play().catch(()=>{});}
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
  wrap.innerHTML='<div class="lb-live-stage"><div class="lb-live-pill">● LIVE</div><video id="liveLocal" autoplay playsinline muted></video></div><div class="lb-live-controls"><strong>'+safe(active?.title)+'</strong><span id="liveViewerCount">'+peers.size+' / '+MAX_VIEWERS+' viewers connected</span><span id="liveElapsed" class="lb-live-elapsed">⏱ 00:00:00 live</span><button id="liveShare" class="secondary">Share</button><button id="liveMute" class="secondary">Mute mic</button><button id="liveCamera" class="secondary">📷 Camera off</button><button id="liveFlip" class="secondary">🔄 Switch camera</button><button id="liveEnd" class="primary lb-live-stop">End Live</button></div><p class="muted">No fixed time limit. Keep this page open and your device awake; leaving Live or losing internet can end the broadcast.</p>'+interactionsMarkup();
  const v=$('#liveLocal');if(v&&media){v.srcObject=media;v.play().catch(()=>{});}
 }else if(mode==='watching'){
  wrap.innerHTML='<div class="lb-live-stage"><div class="lb-live-pill">● LIVE</div><video id="liveRemote" autoplay playsinline controls></video></div><div class="lb-live-controls"><strong>'+safe(active?.title)+'</strong><span id="liveElapsed" class="lb-live-elapsed">⏱ 00:00:00 live</span><button id="liveShare" class="secondary">Share</button><button id="liveLeave" class="primary">Leave</button></div><p class="muted">Allow your browser to play the video. The broadcaster controls the microphone and camera.</p>'+interactionsMarkup();
  // On an incidental re-render, restore attached stream.
  const v=$('#liveRemote');if(v&&peer?.getReceivers().length){const tracks=peer.getReceivers().map(r=>r.track).filter(Boolean);if(tracks.length)v.srcObject=new MediaStream(tracks);}
 }else{
  wrap.innerHTML='<section class="panel lb-live-create"><h3>🔴 Start a Live broadcast</h3><p>Share video and audio with friends on LinkBook.</p><form id="liveForm"><label for="liveTitle">Live title</label><input id="liveTitle" name="title" class="form-input" maxlength="110" minlength="3" required placeholder="What are you broadcasting?" value="Live from Mauritius"><button class="primary" type="submit">📹 Go Live</button></form><p class="muted">No fixed time limit: stream while your browser and internet stay connected. Up to '+MAX_VIEWERS+' viewers. This beta may not work on every network.</p></section>'+
  '<h2 class="lb-live-subheading">Live now</h2><div id="liveListings">'+(sessions.length?sessions.map(s=>'<section class="panel lb-live-listing"><div><strong>🔴 '+safe(s.title)+'</strong><p class="muted">'+safe(hostNames[s.host_id]||'LinkBook member')+' · '+labelTime(s.started_at)+' MUT</p></div>'+(s.host_id===uid()?'<span class="muted">Your live</span>':'<button class="primary" data-watch="'+s.id+'">Watch Live</button>')+'</section>').join(''):'<section class="panel empty">No active broadcasts right now. Be the first to go live!</section>')+'</div>';
 }
 updateDuration();drawInteractions();
 const msg=el.querySelector('#liveNotice');if(msg){msg.textContent=warning;msg.hidden=!warning;}
}
async function render(root){
 if(!db()||!uid()){
  root.innerHTML='<section class="panel"><h2>Live</h2><p>Sign in to watch or start a Live broadcast.</p></section>';return;
 }
 if(page())return; // Preserve video element on regular feed refresh.
 root.innerHTML='<div class="lb-live-page"><h1 class="page-title">🔴 LinkBook Live <span class="lb-live-beta">BETA</span></h1><p id="liveNotice" class="lb-live-notice" role="status" hidden></p><div id="liveBody"><section class="panel empty">Loading live broadcasts…</section></div></div>';
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
 if(b.id==='liveFlip'){switchCamera().catch(console.error);return;}
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
