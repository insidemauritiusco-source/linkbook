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
let cursor=0,interval=null,beat=null,fetching=false,sessions=[],warning='',loading=false,lastListRefresh=0,hostNames={};
const uid=()=>user()?.id;
const check=res=>{if(res.error)throw res.error;return res.data;};
const page=()=>document.querySelector('#content .lb-live-page');
const labelTime=v=>new Intl.DateTimeFormat('en-GB',{timeZone:'Indian/Mauritius',hour:'2-digit',minute:'2-digit',day:'numeric',month:'short'}).format(new Date(v));
function toast(t){warning=t;const box=$('#liveNotice');if(box){box.textContent=t;box.hidden=!t;}}
function closePeer(pc){try{pc?.close()}catch{}}
function release(){
 clearInterval(interval);clearInterval(beat);interval=null;beat=null;
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
  beat=setInterval(()=>{
   if(mode==='hosting')db().from('live_sessions').update({last_heartbeat_at:new Date().toISOString()}).eq('id',active.id).eq('host_id',uid()).then(({error})=>{if(error)console.warn(error)});
  },12000);
  draw();const video=$('#liveLocal');if(video){video.srcObject=media;video.play().catch(()=>{});}
  startPolling();
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
  await sendSignal(session.host_id,'join',{});
  startPolling();
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
  wrap.innerHTML='<div class="lb-live-stage"><div class="lb-live-pill">● LIVE</div><video id="liveLocal" autoplay playsinline muted></video></div><div class="lb-live-controls"><strong>'+safe(active?.title)+'</strong><span id="liveViewerCount">'+peers.size+' / '+MAX_VIEWERS+' viewers connected</span><button id="liveShare" class="secondary">Share</button><button id="liveMute" class="secondary">Mute mic</button><button id="liveEnd" class="primary lb-live-stop">End Live</button></div><p class="muted">Keep this page open while broadcasting. Leaving the Live page ends your broadcast.</p>';
  const v=$('#liveLocal');if(v&&media){v.srcObject=media;v.play().catch(()=>{});}
 }else if(mode==='watching'){
  wrap.innerHTML='<div class="lb-live-stage"><div class="lb-live-pill">● LIVE</div><video id="liveRemote" autoplay playsinline controls></video></div><div class="lb-live-controls"><strong>'+safe(active?.title)+'</strong><button id="liveShare" class="secondary">Share</button><button id="liveLeave" class="primary">Leave</button></div><p class="muted">Allow your browser to play the video. The broadcaster controls the microphone and camera.</p>';
  // On an incidental re-render, restore attached stream.
  const v=$('#liveRemote');if(v&&peer?.getReceivers().length){const tracks=peer.getReceivers().map(r=>r.track).filter(Boolean);if(tracks.length)v.srcObject=new MediaStream(tracks);}
 }else{
  wrap.innerHTML='<section class="panel lb-live-create"><h3>🔴 Start a Live broadcast</h3><p>Share video and audio with friends on LinkBook.</p><form id="liveForm"><label for="liveTitle">Live title</label><input id="liveTitle" name="title" class="form-input" maxlength="110" minlength="3" required placeholder="What are you broadcasting?" value="Live from Mauritius"><button class="primary" type="submit">📹 Go Live</button></form><p class="muted">Up to '+MAX_VIEWERS+' simultaneous viewers. Camera and microphone permission required. This beta uses direct browser video connections and may not work on every network.</p></section>'+
  '<h2 class="lb-live-subheading">Live now</h2><div id="liveListings">'+(sessions.length?sessions.map(s=>'<section class="panel lb-live-listing"><div><strong>🔴 '+safe(s.title)+'</strong><p class="muted">'+safe(hostNames[s.host_id]||'LinkBook member')+' · '+labelTime(s.started_at)+' MUT</p></div>'+(s.host_id===uid()?'<span class="muted">Your live</span>':'<button class="primary" data-watch="'+s.id+'">Watch Live</button>')+'</section>').join(''):'<section class="panel empty">No active broadcasts right now. Be the first to go live!</section>')+'</div>';
 }
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
 if(e.target.id!=='liveForm')return;
 e.preventDefault();
 const title=e.target.elements.title.value.trim();
 if(title.length>=3)goLive(title).catch(console.error);
});
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.hasAttribute('data-watch')){watch(b.dataset.watch).catch(console.error);return;}
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
window.LinkBookLive={render,leavePage};
window.addEventListener('beforeunload',()=>{
 media?.getTracks().forEach(t=>t.stop());
 if(mode==='hosting'&&active?.id){
  // Best effort: stale heartbeat also automatically hides broadcasts if a tab closes abruptly.
  db()?.from('live_sessions').update({status:'ended',ended_at:new Date().toISOString()}).eq('id',active.id).eq('host_id',uid()).then(()=>{});
 }
});
})();
