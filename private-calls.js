/* LinkBook 1:1 voice/video calls beta. Browser-only WebRTC; STUN, no TURN guarantees. */
(() => {
 'use strict';
 let db = null, user = null, active = null, screen = null, timer = null, polling = false;
 let localStream = null, remoteStream = null, pc = null, lastSignal = 0, pendingIce = [];
 const seen = new Set();
 const rtc = {iceServers:[{urls:'stun:stun.l.google.com:19302'}]};
 const esc = x => String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function request(query) {const {data,error}=await query;if(error)throw error;return data;}
 function status(message){
  const box=document.querySelector('#lb-call-status');
  if(box)box.textContent=message;
 }
 function name(id){return document.querySelector('[data-peer="'+id+'"]')?.textContent||'LinkBook member';}
 function removeScreen(){screen?.remove();screen=null;}
 function stopTracks(){
  if(localStream){localStream.getTracks().forEach(track=>track.stop());localStream=null;}
  remoteStream=null;pendingIce=[];
  if(pc){pc.onicecandidate=null;pc.ontrack=null;pc.onconnectionstatechange=null;pc.close();pc=null;}
 }
 async function signal(kind,payload={}){
  if(!active||!db||!user)return;
  const other=active.caller_id===user.id?active.callee_id:active.caller_id;
  await request(db.from('private_call_signals').insert({session_id:active.id,sender_id:user.id,recipient_id:other,kind,payload}));
 }
 async function end(notify=true,reason='Call ended'){
  if(notify&&active){try{await signal('hangup');}catch(e){console.warn('Could not send call end',e?.message);}}
  active=null;lastSignal=0;stopTracks();removeScreen();
  if(reason)toast(reason);
 }
 function toast(message){
  let notice=document.getElementById('lb-call-notice');
  if(!notice){notice=document.createElement('div');notice.id='lb-call-notice';notice.setAttribute('role','status');document.body.append(notice);}
  notice.textContent=message;
  notice.hidden=false;
  clearTimeout(toast.timeout);toast.timeout=setTimeout(()=>{notice.hidden=true;},4000);
 }
 function view(state){
  removeScreen();
  const dialog=document.createElement('section');dialog.className='lb-call-overlay';
  dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
  dialog.setAttribute('aria-label','LinkBook call');
  const other=active?.caller_id===user.id?active.callee_id:active?.caller_id;
  dialog.innerHTML='<div class="lb-call-card"><h2>'+esc(active?.mode==='video'?'📹 Video call':'📞 Voice call')+'</h2>'+
   '<p>'+esc(name(other))+'</p><p id="lb-call-status" role="status">'+esc(state)+'</p>'+
   '<div class="lb-call-stage"><video id="lb-call-remote" autoplay playsinline></video><video id="lb-call-local" autoplay playsinline muted></video></div>'+
   '<div class="lb-call-controls"><button type="button" id="lb-call-mute">Mute</button>'+
   (active?.mode==='video'?'<button type="button" id="lb-call-camera">Camera off</button>':'')+
   '<button type="button" class="lb-call-hangup" id="lb-call-end">End call</button></div></div>';
  document.body.append(dialog);screen=dialog;
  dialog.querySelector('#lb-call-end').onclick=()=>end(true);
  dialog.querySelector('#lb-call-mute').onclick=()=>{
   const track=localStream?.getAudioTracks()?.[0];if(!track)return;
   track.enabled=!track.enabled;dialog.querySelector('#lb-call-mute').textContent=track.enabled?'Mute':'Unmute';
  };
  const camera=dialog.querySelector('#lb-call-camera');
  if(camera)camera.onclick=()=>{
   const track=localStream?.getVideoTracks()?.[0];if(!track)return;
   track.enabled=!track.enabled;camera.textContent=track.enabled?'Camera off':'Camera on';
  };
  if(localStream)dialog.querySelector('#lb-call-local').srcObject=localStream;
  if(remoteStream)dialog.querySelector('#lb-call-remote').srcObject=remoteStream;
 }
 async function attachMedia(){
  localStream=await navigator.mediaDevices.getUserMedia({audio:true,video:active.mode==='video'});
  const local=screen?.querySelector('#lb-call-local');
  if(local)local.srcObject=localStream;
 }
 function peerConnection(){
  if(pc)return pc;
  pc=new RTCPeerConnection(rtc);
  pc.onicecandidate=e=>{if(e.candidate&&active)signal('ice',{candidate:e.candidate.toJSON()}).catch(console.warn);};
  pc.ontrack=e=>{
   remoteStream=e.streams[0]||new MediaStream([e.track]);
   const remote=screen?.querySelector('#lb-call-remote');
   if(remote){remote.srcObject=remoteStream;remote.play().catch(()=>status('Tap the video to start playback')); }
   status('Connected');
  };
  pc.onconnectionstatechange=()=>{
   if(pc?.connectionState==='failed')status('Connection failed. Try another network or end and retry.');
   if(pc?.connectionState==='connected')status('Connected');
  };
  localStream.getTracks().forEach(track=>pc.addTrack(track,localStream));
  return pc;
 }
 async function flushIce(){
  if(!pc?.remoteDescription)return;
  const candidates=pendingIce.splice(0);
  for(const c of candidates){try{await pc.addIceCandidate(c)}catch(e){console.warn('ICE candidate rejected');}}
 }
 async function handle(row){
  if(!active||row.session_id!==active.id||row.sender_id===user.id)return;
  if(row.kind==='hangup'||row.kind==='decline'){await end(false,row.kind==='decline'?'Call declined':'Call ended');return;}
  if(row.kind==='ice'){
   if(row.payload?.candidate){if(pc?.remoteDescription){try{await pc.addIceCandidate(row.payload.candidate)}catch(_){}}else pendingIce.push(row.payload.candidate);}
   return;
  }
  if(row.kind==='offer'&&active.callee_id===user.id&&pc&&!pc.remoteDescription){
   await pc.setRemoteDescription(row.payload.sdp);
   await flushIce();
   const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
   await signal('answer',{sdp:pc.localDescription.toJSON()});
   status('Connecting…');
  }else if(row.kind==='answer'&&active.caller_id===user.id&&pc&&!pc.remoteDescription){
   await pc.setRemoteDescription(row.payload.sdp);
   await flushIce();status('Connecting…');
  }
 }
 async function fetchSignals(){
  if(!active)return;
  const records=await request(db.from('private_call_signals').select('id,session_id,sender_id,kind,payload')
   .eq('session_id',active.id).eq('recipient_id',user.id).gt('id',lastSignal).order('id',{ascending:true}).limit(50));
  for(const row of records||[]){
   lastSignal=Math.max(lastSignal,row.id);
   await handle(row);if(!active)break;
  }
 }
 async function incoming(){
  if(active)return;
  const cutoff=new Date(Date.now()-85000).toISOString();
  const rows=await request(db.from('private_call_sessions').select('id,caller_id,callee_id,mode,created_at')
   .eq('callee_id',user.id).gte('created_at',cutoff).order('created_at',{ascending:false}).limit(5));
  const row=(rows||[]).find(x=>!seen.has(x.id));
  if(!row)return;
  seen.add(row.id);
  // Check for decline/hangup already present before ringing.
  const ended=await request(db.from('private_call_signals').select('id').eq('session_id',row.id)
   .in('kind',['hangup','decline']).limit(1));
  if(ended?.length)return;
  active=row;lastSignal=0;view('Incoming call — answer only if you want to.');
  const controls=screen.querySelector('.lb-call-controls');
  controls.innerHTML='<button class="lb-call-answer" id="lb-call-answer">Answer</button><button class="lb-call-hangup" id="lb-call-decline">Decline</button>';
  screen.querySelector('#lb-call-decline').onclick=async()=>{try{await signal('decline');}catch(_){}await end(false,'Call declined');};
  screen.querySelector('#lb-call-answer').onclick=async()=>{
   try{
    view('Requesting microphone and camera permission…');
    await attachMedia();
    peerConnection();
    await fetchSignals();
    status('Connecting…');
   }catch(e){await end(true,'Unable to answer: '+e.message);}
  };
 }
 async function poll(){
  if(!db||!user||polling||document.hidden)return;
  polling=true;
  try{if(active){if(active.id && (active.caller_id===user.id || pc))await fetchSignals();}else await incoming();}
  catch(e){console.warn('Call connection:',e?.message);}
  finally{polling=false;}
 }
 async function start(other,mode){
  if(active){toast('End the current call first.');return;}
  if(!db||!user||!other||other===user.id)return;
  if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection){toast('Your browser does not support secure calls.');return;}
  try{
   // Only accepted contacts appear in Messages; RLS also checks accepted friendship.
   active={id:null,caller_id:user.id,callee_id:other,mode};
   view('Requesting microphone and camera permission…');
   await attachMedia();
   const saved=await request(db.from('private_call_sessions').insert({caller_id:user.id,callee_id:other,mode}).select('id,caller_id,callee_id,mode,created_at').single());
   active=saved;lastSignal=0;
   const connection=peerConnection();
   const offer=await connection.createOffer();await connection.setLocalDescription(offer);
   await signal('offer',{sdp:connection.localDescription.toJSON()});
   status('Calling…');
  }catch(e){await end(false,'Could not start call: '+(e.message||'Check permissions and friendship status'));}
 }
 function init(client,member){
  if(db)return;
  db=client;user=member;
  document.addEventListener('click',event=>{
   const button=event.target.closest('[data-private-call]');
   if(button){event.preventDefault();start(button.dataset.privateCall,button.dataset.mode==='video'?'video':'audio');}
  });
  timer=setInterval(poll,5000);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&active){status('Return to LinkBook to keep the call connected.');}else poll();});
  window.addEventListener('beforeunload',stopTracks);
  poll();
 }
 window.LinkBookCalls={init};
})();
