/* LinkBook Pro: shared Supabase social features for signed-in accounts. */
(()=>{
'use strict';
const db=window.linkbookSupabase,user=window.linkbookSignedInUser;
if(!db||!user)return;
const $=s=>document.querySelector(s),root=$('#content');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const t=s=>window.LinkBookRegion?.t?.(s)||s;
const time=s=>new Intl.DateTimeFormat('en-GB',{timeZone:'Indian/Mauritius',dateStyle:'medium',timeStyle:'short'}).format(new Date(s))+' MUT';
const icon=s=>esc((s||'?').trim().charAt(0).toUpperCase());
const profileName=p=>p?.display_name||'Member';
const errText=e=>String(e?.message||e||'Something went wrong');
let me=null,people=[],posts=[],likes=[],comments=[],saved=[],friends=[],messages=[],notifications=[];
let page='feed',filter='latest',query='',friendSearch='',peer=null,busy=false,composer=false,file=null,channel=null;
let selectedMediaFile=null,pendingMedia=null,pendingPostId=null;
const retryTools=window.LinkBookMediaRetry;
const storageTools=window.LinkBookStorageTransport;
if(!retryTools||!storageTools)throw Error('Media upload helper missing. Reload LinkBook.');
function notify(text,error=false){let el=$('#cloudStatus');if(!el){el=document.createElement('div');el.id='cloudStatus';el.className='cloud-toast';document.body.appendChild(el)}el.textContent=text;el.classList.toggle('error',error);el.hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>{el.hidden=true},4500)}
async function call(fn){try{await fn()}catch(e){console.error(e);notify(errText(e),true)}}
async function check(promise){const r=await promise;if(r.error)throw r.error;return r.data}
let incomingShareApplied=false;
async function prepareIncomingShare(){
 if(incomingShareApplied||!window.LinkBookIncomingShare)return;
 const helper=window.LinkBookIncomingShare;
 let incoming;
 try { incoming=await helper.read(); }
 catch (_) { notify('Could not load the shared item. Please choose it from your Gallery in LinkBook.',true); return; }
 if(!incoming)return;
 if(incoming.created && Date.now()-incoming.created>24*60*60*1000){
  await helper.clear();notify('Shared item expired. Please share it again.',true);return;
 }
 incomingShareApplied=true;
 page='feed';composer=true;render();
 const form=root.querySelector('#cloudPost');
 if(!form)return;
 const message=[incoming.title,incoming.text,incoming.url].filter(Boolean).join(' ').slice(0,4000);
 form.elements.body.value=message;
 if(incoming.file){
  const f=incoming.file;
  try{validateMedia(f);}catch(err){mediaStatus(err.message,true);return;}
  previewMedia(f);
 }
 notify('Shared item is ready. Review it and press Publish.');
}
function person(id){return people.find(p=>p.id===id)||{id,display_name:id===user.id?profileName(me):'Member'};}
function avatar(p){const name=profileName(p);return p?.avatar_url?'<img class="avatar cloud-avatar" src="'+esc(p.avatar_url)+'" alt="">':'<span class="avatar">'+icon(name)+'</span>'}
function relation(id){return friends.find(f=>(f.requester_id===user.id&&f.addressee_id===id)||(f.addressee_id===user.id&&f.requester_id===id));}
function connected(id){return friends.some(f=>f.status==='accepted'&&[f.requester_id,f.addressee_id].includes(id));}
async function boot(){
 const rows=await check(db.from('profiles').select('id,display_name,bio,location,avatar_url,cover_url').eq('id',user.id).maybeSingle());
 if(!rows){await check(db.from('profiles').insert({id:user.id,display_name:(user.user_metadata?.display_name||user.email?.split('@')[0]||'Member').slice(0,70)}));}
 await refresh();
 await prepareIncomingShare();
 window.LinkBookCalls?.init(db,user);
 window.LinkBookStatus?.init({db,user,upload,displayName:id=>profileName(person(id)),notice:notify});
 window.LinkBookHomeStories?.init({db,user,displayName:id=>profileName(person(id)),avatarUrl:id=>person(id)?.avatar_url||null});
 window.LinkBookDeviceAlerts?.init({db,user,notice:notify});
 $('#search').addEventListener('input',e=>{query=e.target.value.toLowerCase().trim();render()});
 $('#theme').addEventListener('click',()=>{document.body.classList.toggle('dark');localStorage.setItem('linkbook-theme',document.body.classList.contains('dark')?'dark':'light')});
 if(localStorage.getItem('linkbook-theme')==='dark')document.body.classList.add('dark');
 document.addEventListener('input',e=>{
  if(e.target.id!=='friendNameSearch'||page!=='friends')return;
  friendSearch=e.target.value.slice(0,70);
  const results=root.querySelector('#friendSearchResults');
  if(results)results.innerHTML=friendResults();
 });
 document.addEventListener('click',click);
 document.addEventListener('submit',submit);
 document.addEventListener('change',change);
 channel=db.channel('linkbook-social-'+user.id)
  .on('postgres_changes',{event:'*',schema:'public',table:'posts'},()=>schedule())
  .on('postgres_changes',{event:'*',schema:'public',table:'post_likes'},()=>schedule())
  .on('postgres_changes',{event:'*',schema:'public',table:'comments'},()=>schedule())
  .on('postgres_changes',{event:'*',schema:'public',table:'friendships'},()=>schedule())
  .on('postgres_changes',{event:'*',schema:'public',table:'messages',filter:'recipient_id=eq.'+user.id},()=>schedule())
  .on('postgres_changes',{event:'*',schema:'public',table:'notifications',filter:'recipient_id=eq.'+user.id},event=>{if(event.eventType==='INSERT'&&event.new?.recipient_id===user.id)window.LinkBookDeviceAlerts?.onNotification?.(event.new);schedule()})
  .subscribe();
 window.addEventListener('focus',()=>schedule());
}
let selectedMediaUrl=null;
function discardMediaPreview(){if(selectedMediaUrl){URL.revokeObjectURL(selectedMediaUrl);selectedMediaUrl=null;}}
let scheduled=null;
function schedule(){clearTimeout(scheduled);scheduled=setTimeout(()=>{refresh().catch(e=>console.error(e))},750)}
async function refresh(){
 const requests=[
 db.from('profiles').select('id,display_name,bio,location,avatar_url,cover_url').limit(400),
 db.from('posts').select('id,author_id,body,media_url,media_type,created_at').order('created_at',{ascending:false}).limit(100),
 db.from('post_likes').select('post_id,user_id').limit(3000),
 db.from('comments').select('id,post_id,author_id,body,created_at').order('created_at',{ascending:true}).limit(3000),
 db.from('saved_posts').select('post_id,user_id').eq('user_id',user.id),
 db.from('friendships').select('*'),
 db.from('messages').select('id,sender_id,recipient_id,body,created_at').order('created_at',{ascending:true}).limit(500),
 db.from('notifications').select('*').order('created_at',{ascending:false}).limit(100)
 ];
 const data=await Promise.all(requests.map(check));
 [people,posts,likes,comments,saved,friends,messages,notifications]=data.map(x=>x||[]);
 me=person(user.id);
 const nav=$('#navName');if(nav)nav.textContent=profileName(me);
 const top=$('#userTop');if(top)top.textContent=icon(profileName(me));
 const note=$('.note');if(note)note.innerHTML='LinkBook Pro<br><small>Signed-in posts and messages are shared online securely through Supabase.</small>';
 const tip=$('.rightbar .panel:nth-child(2) p');if(tip)tip.textContent='Your posts, messages, friend requests and notifications now sync between signed-in members.';
 // Never rebuild the open composer while Android's file picker is returning focus.
 // Rebuilding its DOM drops the selected FileList and any unpublished caption.
 if(!(page==='feed'&&composer&&root.querySelector('#cloudPost')) && !(page==='status'&&root.querySelector('#lbStatusPost')))render();
}
function switchPage(p){window.LinkBookHomeStories?.close?.();pendingMedia=null;pendingPostId=null;selectedMediaFile=null;discardMediaPreview();if(page==='live'&&p!=='live')window.LinkBookLive?.leavePage();page=p;composer=false;render();window.scrollTo({top:0,behavior:'smooth'})}
function render(){
 if(selectedMediaUrl && (!composer||page!=='feed'))discardMediaPreview();
 document.querySelectorAll('[data-page]').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
 if(page==='live'){window.LinkBookLive?.render?.(root);return;}
 if(page==='safety'){window.LinkBookSafety?.render?.(root,db,user);return;}
 if(page==='status'){window.LinkBookStatus?.render?.(root);return;}
 let html=page==='feed'?feed():page==='friends'?friendsPage():page==='messages'?messagesPage():page==='saved'?'<h1 class="page-title">Saved posts</h1>'+listPosts(posts.filter(p=>saved.some(s=>s.post_id===p.id))):page==='profile'?profilePage():page==='settings'?settingsPage():page==='notifications'?notificationsPage():'';
 root.innerHTML=html;
 if(page==='feed')window.LinkBookHomeStories?.render?.(root.querySelector('#lbHomeStories'));
 window.LinkBookRegion?.applyStatic?.();
}
function feed(){
 let rows=posts.filter(p=>!query||(p.body+' '+profileName(person(p.author_id))).toLowerCase().includes(query));
 if(filter==='top')rows=[...rows].sort((a,b)=>likes.filter(l=>l.post_id===b.id).length-likes.filter(l=>l.post_id===a.id).length);
 if(filter==='friends')rows=rows.filter(p=>p.author_id===user.id||connected(p.author_id));
 return '<h1 class="page-title">Your feed ✦</h1><section id="lbHomeStories" class="panel lb-home-stories" aria-label="Recent stories"></section><section class="panel composer"><div class="composer-header">'+avatar(me)+'<button class="write" id="openComposer">What’s on your mind, '+esc(profileName(me).split(' ')[0])+'?</button></div>'+
 (composer?'<form id="cloudPost"><textarea name="body" maxlength="4000" placeholder="Share your news, photos or moments..." aria-label="Write a post"></textarea><div class="cloud-upload"><label class="cloud-pick">📷 Choose photo or video <input type="file" name="media" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" aria-describedby="fileHelp"></label><span id="fileLabel" aria-live="polite"></span></div><small id="fileHelp" class="muted">JPEG, PNG, WebP, GIF, MP4 or WebM · Maximum 25 MB</small><div id="mediaPreview" class="cloud-media-preview" hidden></div><div id="uploadStatus" class="cloud-upload-status" role="status" aria-live="polite" hidden></div><div class="composer-actions"><small class="muted">Visible to signed-in LinkBook members</small><button class="primary" type="submit">Publish</button></div></form>':'<div class="composer-actions"><span class="muted">✎ Share your thoughts</span><button class="primary" id="openComposer">Create post</button></div>')+
 '</section><div class="filters"><button data-filter="latest" class="'+(filter==='latest'?'active':'')+'">Latest</button><button data-filter="top" class="'+(filter==='top'?'active':'')+'">Popular</button><button data-filter="friends" class="'+(filter==='friends'?'active':'')+'">Friends</button></div>'+listPosts(rows);
}
function listPosts(rows){
 if(!rows.length)return '<section class="panel empty">No posts to display yet. Start the conversation ✨</section>';
 return rows.map(p=>{
 const a=person(p.author_id),pl=likes.filter(l=>l.post_id===p.id),cm=comments.filter(c=>c.post_id===p.id),liked=pl.some(l=>l.user_id===user.id),bookmarked=saved.some(s=>s.post_id===p.id);
 const media=p.media_url?(p.media_type==='video'?'<video class="post-image" controls preload="metadata" src="'+esc(p.media_url)+'"></video>':'<img class="post-image" loading="lazy" src="'+esc(p.media_url)+'" alt="Post photo">'):'';
 return '<article class="post"><div class="post-author">'+avatar(a)+'<div><div class="name">'+esc(profileName(a))+'</div><small>'+time(p.created_at)+' · 🌐 Members</small></div><div class="spacer"></div><button class="more" data-action="save" data-id="'+p.id+'" aria-label="Save post">'+(bookmarked?'★':'☆')+'</button>'+(p.author_id===user.id?'<button class="more" data-action="delete" data-id="'+p.id+'" aria-label="Delete post">🗑</button>':'<button class="more" data-action="report" data-id="'+p.id+'" aria-label="Report post">⚑</button><button class="more" data-action="block" data-id="'+p.author_id+'" aria-label="Block member">🚫</button>')+'</div><div class="post-body">'+esc(p.body)+'</div>'+media+'<div class="counts"><span>👍 '+pl.length+' likes</span><span>'+cm.length+' comments</span></div><div class="post-actions"><button class="'+(liked?'liked':'')+'" data-action="like" data-id="'+p.id+'">'+(liked?'💙 Liked':'♡ Like')+'</button><button data-action="comment" data-id="'+p.id+'">◌ Comment</button><button data-action="share" data-id="'+p.id+'">↗ Share</button></div><div class="comments">'+cm.map(c=>'<div class="comment"><b>'+esc(profileName(person(c.author_id)))+'</b> '+esc(c.body)+'</div>').join('')+'<form class="comment-entry" data-comment="'+p.id+'"><input name="comment" required maxlength="600" placeholder="Write a comment..." aria-label="Write comment"><button class="primary">Send</button></form></div></article>';
 }).join('');
}
function friendCard(p){
 const f=relation(p.id),status=f?.status;
 let controls='';
 if(!f)controls='<button type="button" class="primary" data-person="'+p.id+'" data-friend="add">Add Friend</button>';
 else if(status==='pending'&&f.requester_id===user.id)controls='<button type="button" class="secondary" data-person="'+p.id+'" data-friend="remove">Request Sent · Cancel</button>';
 else if(status==='pending')controls='<button type="button" class="primary" data-person="'+p.id+'" data-friend="accept">Accept Friend</button><button type="button" class="secondary" data-person="'+p.id+'" data-friend="remove">Decline</button>';
 else if(status==='accepted')controls='<button type="button" class="primary" data-message-person="'+p.id+'">Message</button><button type="button" class="secondary" data-person="'+p.id+'" data-friend="remove">Remove friend</button>';
 else controls='<button type="button" class="secondary" data-person="'+p.id+'" data-friend="remove">Dismissed</button>';
 return '<div class="member lb-friend-result">'+avatar(p)+'<div class="member-info"><b>'+esc(profileName(p))+'</b><small>'+esc(p.location||'Mauritius')+'</small></div><div class="lb-friend-buttons">'+controls+'</div></div>';
}
function friendResults(){
 const q=friendSearch.trim().toLocaleLowerCase();
 const found=people.filter(p=>p.id!==user.id&&(!q||profileName(p).toLocaleLowerCase().includes(q))).slice(0,100);
 return found.length?found.map(friendCard).join(''):'<p class="empty">No members found with that name. Try a different spelling, or invite your friend to join LinkBook.</p>';
}
function friendsPage(){
 const pending=friends.filter(f=>f.addressee_id===user.id&&f.status==='pending');
 return '<h1 class="page-title">Find Friends</h1><section class="panel lb-friend-search"><h2>🔎 Search people by name</h2><label for="friendNameSearch">Search LinkBook members</label><input type="search" id="friendNameSearch" autocomplete="off" maxlength="70" placeholder="Type a name, e.g. Vikash" value="'+esc(friendSearch)+'" aria-controls="friendSearchResults"><p class="muted">Find someone, tap Add Friend, then they can accept your request.</p><div id="friendSearchResults" aria-live="polite">'+friendResults()+'</div></section>'+
 '<section class="panel"><h3>Friend requests ('+pending.length+')</h3>'+(pending.length?pending.map(f=>friendCard(person(f.requester_id))).join(''):'<p>No pending requests.</p>')+'</section>'+
 '<section class="panel lb-invite-panel"><h3>Invite friends to LinkBook</h3><p>Share LinkBook with friends who are not yet registered.</p><div class="lb-invite-actions"><button type="button" class="primary" data-invite="share">Invite friends</button><button type="button" class="secondary" data-invite="copy">Copy invitation link</button></div></section>';
}
function messagesPage(){
 const contacts=people.filter(p=>p.id!==user.id&&connected(p.id));
 if(!peer&&contacts.length)peer=contacts[0].id;
 if(!contacts.some(p=>p.id===peer))peer=contacts[0]?.id||null;
 const chat=messages.filter(m=>[m.sender_id,m.recipient_id].includes(user.id)&&[m.sender_id,m.recipient_id].includes(peer)&&m.sender_id!==m.recipient_id);
 return '<h1 class="page-title">Messages</h1><section class="panel"><p>Private conversations with your accepted friends.</p><div class="cloud-contact">'+contacts.map(p=>'<button class="'+(peer===p.id?'selected':'')+'" data-peer="'+p.id+'">'+esc(profileName(p))+'</button>').join('')+'</div>'+(peer?'<h3>Chat with '+esc(profileName(person(peer)))+'</h3><div class="lb-call-launch"><button type="button" data-private-call="'+esc(peer)+'" data-mode="audio">📞 Voice call</button><button type="button" data-private-call="'+esc(peer)+'" data-mode="video">📹 Video call</button><p>Private calls beta — both friends must have LinkBook open. Allow microphone/camera when prompted.</p></div><div class="cloud-chat">'+(chat.length?chat.map(m=>'<div class="cloud-bubble '+(m.sender_id===user.id?'mine':'')+'">'+esc(m.body)+'<small>'+time(m.created_at)+'</small></div>').join(''):'<p class="muted">Start the conversation.</p>')+'</div><form id="cloudMessage" class="comment-entry"><input name="body" required maxlength="2000" placeholder="Write a private message..." autocomplete="off"><button class="primary">Send</button></form>':'<div class="empty"><p>Add an accepted friend to start messaging.</p><button type="button" class="primary" data-page="friends">Find Friends</button></div>')+'</section>';
}
function profilePage(){
 const p=me, mine=posts.filter(x=>x.author_id===user.id);
 return '<h1 class="page-title">My profile</h1><section class="panel"><div class="cloud-cover">'+(p.cover_url?'<img class="cloud-cover-photo" loading="lazy" src="'+esc(p.cover_url)+'" alt="Profile cover photo">':'')+'<label class="lb-change-cover">📷 '+(p.cover_url?'Change cover photo':'Add cover photo')+'<input class="lb-profile-pick-input" type="file" name="quickCover" data-quick-profile="cover" accept="image/jpeg,image/png,image/webp" aria-label="Choose cover photo from Gallery"></label></div><div class="cloud-profile-avatar">'+avatar(p)+'<label class="lb-change-avatar">📷 '+(p.avatar_url?'Change profile photo':'Add profile photo')+'<input class="lb-profile-pick-input" type="file" name="quickAvatar" data-quick-profile="avatar" accept="image/jpeg,image/png,image/webp" aria-label="Choose profile picture from Gallery"></label></div><h2>'+esc(profileName(p))+'</h2><p>'+esc(p.bio||'Welcome to my profile!')+'</p><p>📍 '+esc(p.location||'Mauritius')+'</p><button class="secondary" data-page="settings">Edit profile</button></section><h3>Your posts ('+mine.length+')</h3>'+listPosts(mine);
}
function settingsPage(){
 return '<h1 class="page-title">Profile settings</h1><section class="panel"><form id="cloudProfile" class="settings-row"><label>Display name</label><input class="form-input" name="display_name" maxlength="70" required value="'+esc(me.display_name)+'"><label>Bio</label><textarea class="form-input" name="bio" maxlength="300">'+esc(me.bio||'')+'</textarea><label>Location</label><input class="form-input" name="location" maxlength="100" value="'+esc(me.location||'Mauritius')+'"><label>Profile picture</label><input class="form-input" type="file" name="avatar" accept="image/jpeg,image/png,image/webp" aria-describedby="avatarHelp"><small id="avatarHelp" class="muted">Choose a JPG, PNG or WebP image up to 25 MB, then click Save profile below.</small><div class="lb-avatar-preview" id="lbAvatarPreview">'+(me.avatar_url?'<img src="'+esc(me.avatar_url)+'" alt="Current profile photo">':'<span class="avatar">'+icon(profileName(me))+'</span>')+'</div><label>Cover photo (banner)</label><input class="form-input" type="file" name="cover" accept="image/jpeg,image/png,image/webp" aria-describedby="coverHelp"><small id="coverHelp" class="muted">Recommended 1500 × 500 pixels, JPEG, PNG or WebP, up to 25 MB. Banner adapts to your screen.</small><div id="lbCoverPreview" class="cloud-cover cloud-cover-preview">'+(me.cover_url?'<img class="cloud-cover-photo" src="'+esc(me.cover_url)+'" alt="Current profile cover">':'')+'</div><button class="primary" type="submit">Save profile</button></form></section><section class="panel"><h3>🇲🇺 Mauritius</h3><p>Times shown in Indian/Mauritius (UTC+4).</p></section><section class="panel"><h3>Privacy &amp; safety</h3><p>Your posts are visible to signed-in LinkBook members. You can block members, report content, export your data and delete your account.</p><button class="primary" type="button" data-page="safety">Open Safety &amp; privacy</button></section>';
}
function notificationsPage(){
 return '<h1 class="page-title">Notifications</h1>'+(window.LinkBookDeviceAlerts?.controls?.()||'')+'<section class="panel"><button class="secondary" data-action="readall">Mark all as read</button>'+(notifications.length?notifications.map(n=>'<div class="member"><div class="member-info"><b>'+esc(profileName(person(n.actor_id)))+'</b><small>'+esc(({friend_request:'sent you a friend request',friend_accept:'accepted your friend request',like:'liked your post',comment:'commented on your post',message:'sent you a message'})[n.kind]||n.kind)+'</small><small>'+time(n.created_at)+'</small></div>'+(n.is_read?'':'<span class="cloud-dot">●</span>')+'</div>').join(''):'<p>No notifications yet.</p>')+'</section>';
}
function validateMedia(file){
 if(!file)return;
 const good=['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'];
 if(!good.includes(file.type))throw Error('Unsupported format. Select JPEG, PNG, WebP, GIF, MP4 or WebM.');
 if(file.size>25*1024*1024)throw Error('This file is over 25 MB. Choose a smaller photo or video.');
 if(!file.size)throw Error('The selected file is empty. Choose another file.');
}
function mediaStatus(message,error=false){
 const label=root.querySelector('#uploadStatus');if(!label)return;
 label.hidden=!message;label.textContent=message||'';label.classList.toggle('is-error',error);
}
function previewMedia(file){
 discardMediaPreview();const holder=root.querySelector('#mediaPreview'), label=root.querySelector('#fileLabel');
 if(!holder||!label)return;
 if(selectedMediaFile!==file){pendingMedia=null;pendingPostId=null;}
 selectedMediaFile=file||null;
 holder.replaceChildren();holder.hidden=true;label.textContent='';
 if(!file){mediaStatus('');return;}
 try{validateMedia(file)}catch(err){selectedMediaFile=null;const input=root.querySelector('#cloudPost input[name=media]');if(input)input.value='';mediaStatus(err.message,true);return;}
 selectedMediaUrl=URL.createObjectURL(file);
 const media=document.createElement(file.type.startsWith('video/')?'video':'img');
 media.src=selectedMediaUrl;media.className='cloud-media-thumb';
 if(media.tagName==='VIDEO'){media.controls=true;media.preload='metadata';media.playsInline=true;}else media.alt='Selected photo preview';
 const info=document.createElement('p');info.className='muted';info.textContent=file.name+' · '+(file.size/1048576).toFixed(1)+' MB';
 const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='✕ Remove attachment';remove.dataset.removeMedia='true';
 holder.append(media,info,remove);holder.hidden=false;label.textContent='Ready to publish';mediaStatus('');
}
const LARGE_FILE_THRESHOLD=6*1024*1024;
let activeMediaUpload=null;
function userUploadError(err){
 const raw=errText(err);
 if(/bucket not found|not found.*bucket/i.test(raw))return new Error('LinkBook media storage is unavailable. Please contact support.');
 if(/row.level.security|permission|unauthorized|401|403|jwt|session/i.test(raw))
  return new Error('Your session may have expired or media upload is not permitted. Sign out, sign in again, and retry. '+raw);
 if(/payload.too.large|too large|413|maximum.allowed|size.limit/i.test(raw))
  return new Error('This file exceeds the upload limit of 25 MB. Choose a smaller file.');
 if(/network|fetch|failed to fetch|timeout|connection/i.test(raw))
  return new Error('Connection interrupted after retries. Your selected file and draft are preserved. Check internet and press Publish again. '+raw);
 return err instanceof Error ? err : new Error(raw);
}
async function resumableUpload(file,path){
 // Supabase recommends the TUS protocol for media larger than 6 MB.
 let tus;
 try { tus=await import('https://cdn.jsdelivr.net/npm/tus-js-client@4.3.1/+esm'); }
 catch(e){throw new Error('The secure upload helper could not load. Check your internet connection and retry.');}
 const auth=await db.auth.getSession();
 if(auth.error)throw auth.error;
 if(!auth.data?.session?.access_token || auth.data.session.user?.id!==user.id)
  throw new Error('Please sign in again before uploading a video.');
 const host=new URL(db.supabaseUrl).hostname.replace('.supabase.co','.storage.supabase.co');
 const endpoint='https://'+host+'/storage/v1/upload/resumable';
 await new Promise((resolve,reject)=>{
  const task=new tus.Upload(file,{
   endpoint,
   retryDelays:[0,2000,5000,10000],
   chunkSize:6*1024*1024,
   uploadDataDuringCreation:true,
   removeFingerprintOnSuccess:true,
   headers:{
    authorization:'Bearer '+auth.data.session.access_token,
    apikey:window.LINKBOOK_AUTH?.publishableKey||''
   },
   metadata:{bucketName:'linkbook-media',objectName:path,contentType:file.type,cacheControl:'3600'},
   onProgress(done,total){if(total)mediaStatus('Uploading '+Math.min(100,Math.floor(done/total*100))+'% — keep this page open.');},
   onError(error){activeMediaUpload=null;reject(error);},
   onSuccess(){activeMediaUpload=null;resolve();}
  });
  activeMediaUpload=task;
  task.findPreviousUploads().then(previous=>{
   if(previous?.length)task.resumeFromPreviousUpload(previous[0]);
   task.start();
  }).catch(error=>{activeMediaUpload=null;reject(error);});
 });
}
async function upload(file){
 if(!file)return null;
 validateMedia(file);
 const ext=file.type==='image/jpeg'?'jpg':file.type==='image/png'?'png':file.type==='image/webp'?'webp':file.type==='image/gif'?'gif':file.type==='video/mp4'?'mp4':'webm';
 if(!pendingMedia||pendingMedia.file!==file)pendingMedia={file,path:user.id+'/'+crypto.randomUUID()+'.'+ext,complete:false};
 const item=pendingMedia,path=item.path,bucket=db.storage.from('linkbook-media');
 const result={url:bucket.getPublicUrl(path).data.publicUrl,type:file.type.startsWith('video/')?'video':'image',path};
 if(item.complete)return result;
 async function exists(){
  try{const response=await fetch(result.url,{method:'GET',cache:'no-store'});return response.ok;}
  catch{return false;}
 }
 try{
  if(file.size>LARGE_FILE_THRESHOLD){
   mediaStatus('Starting resumable upload…');await resumableUpload(file,path);
  }else{
   let route='direct-storage';
   await retryTools.run(async attempt=>{
    mediaStatus(attempt===1?'Uploading '+file.name+' through Storage…':'Retrying upload ('+attempt+'/3)…');
    const auth=await db.auth.getSession();
    if(auth.error)throw auth.error;
    if(!auth.data?.session?.access_token||auth.data.session.user?.id!==user.id)
     throw Error('Please sign in again before uploading.');
    try {
     await storageTools.directUpload({projectUrl:db.supabaseUrl,
      apiKey:window.LINKBOOK_AUTH?.publishableKey,session:auth.data.session,file,path});
     route='direct-storage';
    }catch(error){
     if(storageTools.issue(error,'direct-storage').kind!=='network')throw error;
     if(await exists()){route='direct-storage-recovered';return;}
     route='api-gateway';
     const response=await bucket.upload(path,file,{contentType:file.type,upsert:false,cacheControl:'3600'});
     if(response.error){response.error.route=route;throw response.error;}
    }
   },{attempts:3,verify:exists,onRetry:n=>mediaStatus('Network interruption; retrying ('+(n+1)+'/3)…')});
   mediaStatus('Transfer finished ('+route+'). Saving post…');
  }
  item.complete=true;
 }catch(err){
  if((retryTools.retryable(err)||Number(err?.status||err?.statusCode)===409)&&await exists())item.complete=true;
  else {
   const issue=storageTools.issue(err,err?.route||'storage');
   // Some Android networks pass Storage OPTIONS but interrupt POST.
   // Try a different Supabase-supported protocol before giving up.
   if(issue.kind==='network'){
    mediaStatus('Normal upload connection failed. Trying resumable transfer…');
    try{
     await resumableUpload(file,path);
     item.complete=true;
    }catch(tusError){
     if(await exists())item.complete=true;
     else{
      console.warn('LinkBook resumable upload failed:',String(tusError?.message||tusError).slice(0,180));
      throw userUploadError(new Error('LB-UPLOAD-NET (direct, gateway and resumable). Storage was unreachable using all upload routes. Please retry on another network. Your selected file remains in the form.'));
     }
    }
   }else{
    console.warn('LinkBook storage upload:',issue);
    throw userUploadError(new Error(storageTools.diagnostic(err,err?.route||'storage')));
   }
  }
 }
 return result;
}
async function savePost(body,uploaded){
 if(!pendingPostId)pendingPostId=crypto.randomUUID();
 const id=pendingPostId,payload={id,author_id:user.id,body,media_url:uploaded?.url||null,media_type:uploaded?.type||null};
 async function alreadySaved(){
  try{const result=await db.from('posts').select('id').eq('id',id).eq('author_id',user.id).maybeSingle();return !result.error&&!!result.data;}
  catch{return false;}
 }
 try{
  await retryTools.run(async attempt=>{
   if(attempt>1&&await alreadySaved())return;
   mediaStatus(attempt>1?'Checking post and retrying save…':'Saving your post…');
   await check(db.from('posts').insert(payload));
  },{attempts:3,verify:alreadySaved});
 }catch(err){if(await alreadySaved())return;throw userUploadError(err);}
}

async function click(e){
 const invite=e.target.closest('[data-invite]');
 if(invite){
  e.preventDefault();
  const link=location.origin+location.pathname;
  const message='Join me on LinkBook! Create your free account, share photos and videos, chat and video call with friends. '+link;
  if(invite.dataset.invite==='share'&&navigator.share){
   navigator.share({title:'Join me on LinkBook',text:'Join me on LinkBook! Connect with friends, share photos and videos, chat and call.',url:link})
    .catch(error=>{if(error?.name!=='AbortError')notify('Unable to open Share menu. Use Copy invitation link.',true);});
  }else{
   const copy=async()=>{
    if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(message);notify('Invitation copied! Paste it into WhatsApp or Messenger.');}
    else prompt('Copy this invitation and share it with your friends:',message);
   };
   copy().catch(()=>prompt('Copy this invitation and share it with your friends:',message));
  }
  return;
 }
 const messagePerson=e.target.closest('[data-message-person]');if(messagePerson){const id=messagePerson.dataset.messagePerson;if(connected(id)){peer=id;switchPage('messages');}return;}
 const pg=e.target.closest('[data-page]');if(pg){switchPage(pg.dataset.page);return}
 const fs=e.target.closest('[data-filter]');if(fs){filter=fs.dataset.filter;render();return}
 if(e.target.closest('#openComposer')){pendingMedia=null;pendingPostId=null;selectedMediaFile=null;composer=true;render();return}
 if(e.target.closest('[data-remove-media]')){const input=root.querySelector('#cloudPost input[name=media]');if(input)input.value='';pendingMedia=null;pendingPostId=null;selectedMediaFile=null;previewMedia(null);return;}
 const p=e.target.closest('[data-peer]');if(p){peer=p.dataset.peer;render();return}
 const f=e.target.closest('[data-friend]');if(f)return call(async()=>{
 const other=f.dataset.person,action=f.dataset.friend,link=relation(other);
 if(action==='add')await check(db.from('friendships').insert({requester_id:user.id,addressee_id:other}));
 if(action==='remove'&&link)await check(db.from('friendships').delete().eq('id',link.id));
 if(action==='accept'&&link)await check(db.from('friendships').update({status:'accepted',updated_at:new Date().toISOString()}).eq('id',link.id).eq('status','pending'));
 await refresh();
 });
 const act=e.target.closest('[data-action]');if(!act)return;
 return call(async()=>{
 const id=act.dataset.id,action=act.dataset.action;
 if(action==='like'){
  if(likes.some(l=>l.post_id===id&&l.user_id===user.id))await check(db.from('post_likes').delete().eq('post_id',id).eq('user_id',user.id));
  else await check(db.from('post_likes').insert({post_id:id,user_id:user.id}));
 }else if(action==='save'){
  if(saved.some(s=>s.post_id===id))await check(db.from('saved_posts').delete().eq('post_id',id).eq('user_id',user.id));
  else await check(db.from('saved_posts').insert({post_id:id,user_id:user.id}));
 }else if(action==='comment'){act.closest('.post')?.querySelector('[name=comment]')?.focus();return}
 else if(action==='share'){
  const url=location.origin+location.pathname+'?post='+encodeURIComponent(id);
  if(navigator.share)await navigator.share({title:'LinkBook',url}).catch(()=>{});
  else {await navigator.clipboard.writeText(url);notify('Post link copied')}
  return;
 }else if(action==='delete'){
  if(!confirm('Delete this post?'))return;await check(db.from('posts').delete().eq('id',id).eq('author_id',user.id));
 }else if(action==='block'){
  if(!confirm('Block '+profileName(person(id))+'? You will not be able to contact each other.'))return;
  await check(db.from('user_blocks').insert({blocker_id:user.id,blocked_id:id}));
  notify('Member blocked.');
 }else if(action==='report'){
  const reason=prompt('Why are you reporting this post?');if(!reason)return;
  await check(db.from('reports').insert({reporter_id:user.id,post_id:id,reason:reason.slice(0,500)}));
  notify('Report submitted.');return;
 }else if(action==='readall'){
  await check(db.from('notifications').update({is_read:true}).eq('recipient_id',user.id).eq('is_read',false));
 }
 await refresh();
 });
}
async function submit(e){
 const form=e.target,id=form.id;
 if(!['cloudPost','cloudProfile','cloudMessage'].includes(id)&&!form.dataset.comment)return;
 e.preventDefault();if(busy)return;
 busy=true;const btn=form.querySelector('button[type=submit],button.primary');if(btn)btn.disabled=true;
 try {
 if(id==='cloudPost'){
  const text=form.elements.body.value.trim(),f=form.elements.media.files[0]||selectedMediaFile;
  if(!text&&!f)throw Error('Write a post or choose a photo/video.');
  validateMedia(f);mediaStatus(f?'Uploading your photo/video…':'Publishing your post…');
  let uploaded;
  uploaded=await upload(f);
  await savePost(text,uploaded);
  if(incomingShareApplied){window.LinkBookIncomingShare?.clear().catch(()=>{});incomingShareApplied=false;}
  composer=false;pendingMedia=null;pendingPostId=null;selectedMediaFile=null;discardMediaPreview();notify('Your post is online!');
 }else if(id==='cloudProfile'){
  const d=new FormData(form),patch={display_name:String(d.get('display_name')||'').trim(),bio:String(d.get('bio')||'').trim(),location:String(d.get('location')||'').trim(),updated_at:new Date().toISOString()};
  if(!patch.display_name)throw Error('Display name required.');
  const avatarFile=form.elements.avatar.files[0],coverFile=form.elements.cover.files[0];
  if(avatarFile||coverFile)notify('Uploading selected profile image'+(avatarFile&&coverFile?'s':'')+'… Please keep this page open.');
  if(avatarFile&&!avatarFile.type.startsWith('image/'))throw Error('Profile picture must be an image.');
  if(coverFile&&!['image/jpeg','image/png','image/webp'].includes(coverFile.type))throw Error('Cover photo must be JPEG, PNG or WebP.');
  if(coverFile)validateMedia(coverFile);
  if(avatarFile)validateMedia(avatarFile);
  const uploaded=await upload(avatarFile);if(uploaded)patch.avatar_url=uploaded.url;
  const coverUploaded=await upload(coverFile);if(coverUploaded)patch.cover_url=coverUploaded.url;
  const updated=await check(db.from('profiles').update(patch).eq('id',user.id).select('id,avatar_url,cover_url').single());
  if(avatarFile&&updated.avatar_url!==patch.avatar_url)throw Error('Profile picture did not save. Please retry.');
  if(coverFile&&updated.cover_url!==patch.cover_url)throw Error('Cover photo did not save. Please retry.');
  pendingMedia=null;page='profile';notify('Profile pictures and details saved successfully!');
 }else if(id==='cloudMessage'){
  const text=form.elements.body.value.trim();if(!text||!peer)return;
  await check(db.from('messages').insert({sender_id:user.id,recipient_id:peer,body:text}));
 }else{
  const text=form.elements.comment.value.trim();if(!text)return;
  await check(db.from('comments').insert({post_id:form.dataset.comment,author_id:user.id,body:text}));
 }
 await refresh();
 }catch(err){console.error(err);if(id==='cloudPost')mediaStatus(errText(err),true);else notify(errText(err),true)}
 finally{busy=false;if(btn?.isConnected)btn.disabled=false}
}
let quickProfileUploading=false;
async function saveQuickProfileImage(input){
 const field=input.dataset.quickProfile,selected=input.files?.[0];
 if(!selected||!['avatar','cover'].includes(field))return;
 if(quickProfileUploading){notify('An image is uploading. Please finish the current upload first.',true);input.value='';return;}
 if(!['image/jpeg','image/png','image/webp'].includes(selected.type)||selected.size<=0||selected.size>25*1024*1024){
  notify('Choose a JPEG, PNG or WebP image up to 25 MB.',true);input.value='';return;
 }
 quickProfileUploading=true;
 try{
  notify((field==='cover'?'Cover photo':'Profile picture')+' uploading… Please keep LinkBook open.');
  pendingMedia=null;
  const uploaded=await upload(selected);
  if(!uploaded?.url)throw Error('Image upload did not return an address.');
  const patch={updated_at:new Date().toISOString(),[field==='cover'?'cover_url':'avatar_url']:uploaded.url};
  const row=await check(db.from('profiles').update(patch).eq('id',user.id).select('id,avatar_url,cover_url').single());
  if(row[field==='cover'?'cover_url':'avatar_url']!==uploaded.url)throw Error('Image saved incorrectly. Please retry.');
  pendingMedia=null;
  await refresh();
  notify(field==='cover'?'Cover photo saved!':'Profile picture saved!');
 }catch(err){console.error('Quick profile upload:',err);notify('Could not save photo: '+errText(err),true);}
 finally{quickProfileUploading=false;}
}
function change(e){
 if(e.target.matches('input[data-quick-profile]')){saveQuickProfileImage(e.target);return;}
 if(e.target.name==='media'&&e.target.closest('#cloudPost'))previewMedia(e.target.files[0]||null);
 if(e.target.name==='avatar'&&e.target.closest('#cloudProfile')){
  const holder=root.querySelector('#lbAvatarPreview'),file=e.target.files?.[0];
  if(!holder)return;
  if(!file){holder.innerHTML=me.avatar_url?'<img src="'+esc(me.avatar_url)+'" alt="Current profile photo">':'<span class="avatar">'+icon(profileName(me))+'</span>';return;}
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>25*1024*1024||!file.size){
   notify('Choose a non-empty JPEG, PNG or WebP profile picture up to 25 MB.',true);e.target.value='';return;
  }
  const url=URL.createObjectURL(file),img=document.createElement('img');img.alt='Selected profile photo preview';img.src=url;
  img.onload=()=>URL.revokeObjectURL(url);img.onerror=()=>URL.revokeObjectURL(url);
  holder.replaceChildren(img);
 }
 if(e.target.name==='cover'&&e.target.closest('#cloudProfile')){
  const holder=root.querySelector('#lbCoverPreview'),file=e.target.files?.[0];
  if(!holder)return;
  holder.querySelector('img')?.remove();
  if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>25*1024*1024){
   notify('Choose a JPEG, PNG or WebP banner up to 25 MB.',true);e.target.value='';return;
  }
  const objectUrl=URL.createObjectURL(file),image=document.createElement('img');
  image.className='cloud-cover-photo';image.alt='Selected cover photo preview';image.src=objectUrl;
  image.onload=()=>URL.revokeObjectURL(objectUrl);
  image.onerror=()=>URL.revokeObjectURL(objectUrl);
  holder.append(image);
 }
}
const badge=document.createElement('button');badge.className='cloud-notifications';badge.type='button';badge.title='Notifications';badge.setAttribute('aria-label','Notifications');badge.textContent='🔔';badge.addEventListener('click',()=>switchPage('notifications'));$('.header-actions')?.prepend(badge);
root.innerHTML='<section class="panel empty">Connecting LinkBook Pro…</section>';
if(new URLSearchParams(location.search).has('notifications'))page='notifications';
else if(new URLSearchParams(location.search).has('live'))page='live';
boot().catch(e=>{console.error(e);root.innerHTML='<section class="panel"><h2>Cannot connect to LinkBook Pro</h2><p>'+esc(errText(e))+'</p><button class="primary" id="cloudRetry">Retry</button></section>';$('#cloudRetry').onclick=()=>location.reload()});
})();
