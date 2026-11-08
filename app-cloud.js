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
let page='feed',filter='latest',query='',peer=null,busy=false,composer=false,file=null,channel=null;
function notify(text,error=false){let el=$('#cloudStatus');if(!el){el=document.createElement('div');el.id='cloudStatus';el.className='cloud-toast';document.body.appendChild(el)}el.textContent=text;el.classList.toggle('error',error);el.hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>{el.hidden=true},4500)}
async function call(fn){try{await fn()}catch(e){console.error(e);notify(errText(e),true)}}
async function check(promise){const r=await promise;if(r.error)throw r.error;return r.data}
function person(id){return people.find(p=>p.id===id)||{id,display_name:id===user.id?profileName(me):'Member'};}
function avatar(p){const name=profileName(p);return p?.avatar_url?'<img class="avatar cloud-avatar" src="'+esc(p.avatar_url)+'" alt="">':'<span class="avatar">'+icon(name)+'</span>'}
function relation(id){return friends.find(f=>(f.requester_id===user.id&&f.addressee_id===id)||(f.addressee_id===user.id&&f.requester_id===id));}
function connected(id){return friends.some(f=>f.status==='accepted'&&[f.requester_id,f.addressee_id].includes(id));}
async function boot(){
 const rows=await check(db.from('profiles').select('id,display_name,bio,location,avatar_url').eq('id',user.id).maybeSingle());
 if(!rows){await check(db.from('profiles').insert({id:user.id,display_name:(user.user_metadata?.display_name||user.email?.split('@')[0]||'Member').slice(0,70)}));}
 await refresh();
 $('#search').addEventListener('input',e=>{query=e.target.value.toLowerCase().trim();render()});
 $('#theme').addEventListener('click',()=>{document.body.classList.toggle('dark');localStorage.setItem('linkbook-theme',document.body.classList.contains('dark')?'dark':'light')});
 if(localStorage.getItem('linkbook-theme')==='dark')document.body.classList.add('dark');
 document.addEventListener('click',click);
 document.addEventListener('submit',submit);
 document.addEventListener('change',change);
 channel=db.channel('linkbook-social-'+user.id)
  .on('postgres_changes',{event:'*',schema:'public',table:'posts'},()=>schedule())
  .on('postgres_changes',{event:'*',schema:'public',table:'post_likes'},()=>schedule())
  .on('postgres_changes',{event:'*',schema:'public',table:'comments'},()=>schedule())
  .on('postgres_changes',{event:'*',schema:'public',table:'friendships'},()=>schedule())
  .on('postgres_changes',{event:'*',schema:'public',table:'messages',filter:'recipient_id=eq.'+user.id},()=>schedule())
  .on('postgres_changes',{event:'*',schema:'public',table:'notifications',filter:'recipient_id=eq.'+user.id},()=>schedule())
  .subscribe();
 window.addEventListener('focus',()=>schedule());
}
let scheduled=null;
function schedule(){clearTimeout(scheduled);scheduled=setTimeout(()=>{refresh().catch(e=>console.error(e))},750)}
async function refresh(){
 const requests=[
 db.from('profiles').select('id,display_name,bio,location,avatar_url').limit(400),
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
 render();
}
function switchPage(p){page=p;composer=false;render();window.scrollTo({top:0,behavior:'smooth'})}
function render(){
 document.querySelectorAll('[data-page]').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
 let html=page==='feed'?feed():page==='friends'?friendsPage():page==='messages'?messagesPage():page==='saved'?'<h1 class="page-title">Saved posts</h1>'+listPosts(posts.filter(p=>saved.some(s=>s.post_id===p.id))):page==='profile'?profilePage():page==='settings'?settingsPage():page==='notifications'?notificationsPage():'';
 root.innerHTML=html;
 window.LinkBookRegion?.applyStatic?.();
}
function feed(){
 let rows=posts.filter(p=>!query||(p.body+' '+profileName(person(p.author_id))).toLowerCase().includes(query));
 if(filter==='top')rows=[...rows].sort((a,b)=>likes.filter(l=>l.post_id===b.id).length-likes.filter(l=>l.post_id===a.id).length);
 if(filter==='friends')rows=rows.filter(p=>p.author_id===user.id||connected(p.author_id));
 return '<h1 class="page-title">Your feed ✦</h1><section class="panel composer"><div class="composer-header">'+avatar(me)+'<button class="write" id="openComposer">What’s on your mind, '+esc(profileName(me).split(' ')[0])+'?</button></div>'+
 (composer?'<form id="cloudPost"><textarea name="body" maxlength="4000" placeholder="Share your news, photos or moments..." aria-label="Write a post"></textarea><div class="cloud-upload"><label>📷 Photo or video <input type="file" name="media" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"></label><span id="fileLabel"></span></div><div class="composer-actions"><small class="muted">Visible to signed-in LinkBook members</small><button class="primary" type="submit">Publish</button></div></form>':'<div class="composer-actions"><span class="muted">✎ Share your thoughts</span><button class="primary" id="openComposer">Create post</button></div>')+
 '</section><div class="filters"><button data-filter="latest" class="'+(filter==='latest'?'active':'')+'">Latest</button><button data-filter="top" class="'+(filter==='top'?'active':'')+'">Popular</button><button data-filter="friends" class="'+(filter==='friends'?'active':'')+'">Friends</button></div>'+listPosts(rows);
}
function listPosts(rows){
 if(!rows.length)return '<section class="panel empty">No posts to display yet. Start the conversation ✨</section>';
 return rows.map(p=>{
 const a=person(p.author_id),pl=likes.filter(l=>l.post_id===p.id),cm=comments.filter(c=>c.post_id===p.id),liked=pl.some(l=>l.user_id===user.id),bookmarked=saved.some(s=>s.post_id===p.id);
 const media=p.media_url?(p.media_type==='video'?'<video class="post-image" controls preload="metadata" src="'+esc(p.media_url)+'"></video>':'<img class="post-image" loading="lazy" src="'+esc(p.media_url)+'" alt="Post photo">'):'';
 return '<article class="post"><div class="post-author">'+avatar(a)+'<div><div class="name">'+esc(profileName(a))+'</div><small>'+time(p.created_at)+' · 🌐 Members</small></div><div class="spacer"></div><button class="more" data-action="save" data-id="'+p.id+'" aria-label="Save post">'+(bookmarked?'★':'☆')+'</button>'+(p.author_id===user.id?'<button class="more" data-action="delete" data-id="'+p.id+'" aria-label="Delete post">🗑</button>':'<button class="more" data-action="report" data-id="'+p.id+'" aria-label="Report post">⚑</button>')+'</div><div class="post-body">'+esc(p.body)+'</div>'+media+'<div class="counts"><span>👍 '+pl.length+' likes</span><span>'+cm.length+' comments</span></div><div class="post-actions"><button class="'+(liked?'liked':'')+'" data-action="like" data-id="'+p.id+'">'+(liked?'💙 Liked':'♡ Like')+'</button><button data-action="comment" data-id="'+p.id+'">◌ Comment</button><button data-action="share" data-id="'+p.id+'">↗ Share</button></div><div class="comments">'+cm.map(c=>'<div class="comment"><b>'+esc(profileName(person(c.author_id)))+'</b> '+esc(c.body)+'</div>').join('')+'<form class="comment-entry" data-comment="'+p.id+'"><input name="comment" required maxlength="600" placeholder="Write a comment..." aria-label="Write comment"><button class="primary">Send</button></form></div></article>';
 }).join('');
}
function friendsPage(){
 const pending=friends.filter(f=>f.addressee_id===user.id&&f.status==='pending');
 const found=people.filter(p=>p.id!==user.id&&(!query||profileName(p).toLowerCase().includes(query)));
 function card(p){const f=relation(p.id),status=f?.status;let controls;
 if(!f)controls='<button class="primary" data-person="'+p.id+'" data-friend="add">Add friend</button>';
 else if(status==='pending'&&f.requester_id===user.id)controls='<button class="secondary" data-person="'+p.id+'" data-friend="remove">Cancel request</button>';
 else if(status==='pending')controls='<button class="primary" data-person="'+p.id+'" data-friend="accept">Accept</button><button class="secondary" data-person="'+p.id+'" data-friend="remove">Decline</button>';
 else if(status==='accepted')controls='<button class="secondary" data-person="'+p.id+'" data-friend="remove">Remove friend</button>';
 else controls='<button class="secondary" data-person="'+p.id+'" data-friend="remove">Dismissed</button>';
 return '<div class="member">'+avatar(p)+'<div class="member-info"><b>'+esc(profileName(p))+'</b><small>'+esc(p.location||'Mauritius')+'</small></div>'+controls+'</div>';
 }
 return '<h1 class="page-title">Friends & requests</h1><section class="panel"><h3>Friend requests ('+pending.length+')</h3>'+(pending.length?pending.map(f=>card(person(f.requester_id))).join(''):'<p>No pending requests.</p>')+'</section><section class="panel"><h3>Discover members</h3>'+(found.length?found.map(card).join(''):'<p>No other members registered yet.</p>')+'</section>';
}
function messagesPage(){
 const contacts=people.filter(p=>p.id!==user.id&&connected(p.id));
 if(!peer&&contacts.length)peer=contacts[0].id;
 if(!contacts.some(p=>p.id===peer))peer=contacts[0]?.id||null;
 const chat=messages.filter(m=>[m.sender_id,m.recipient_id].includes(user.id)&&[m.sender_id,m.recipient_id].includes(peer)&&m.sender_id!==m.recipient_id);
 return '<h1 class="page-title">Messages</h1><section class="panel"><p>Private conversations with your accepted friends.</p><div class="cloud-contact">'+contacts.map(p=>'<button class="'+(peer===p.id?'selected':'')+'" data-peer="'+p.id+'">'+esc(profileName(p))+'</button>').join('')+'</div>'+(peer?'<h3>Chat with '+esc(profileName(person(peer)))+'</h3><div class="cloud-chat">'+(chat.length?chat.map(m=>'<div class="cloud-bubble '+(m.sender_id===user.id?'mine':'')+'">'+esc(m.body)+'<small>'+time(m.created_at)+'</small></div>').join(''):'<p class="muted">Start the conversation.</p>')+'</div><form id="cloudMessage" class="comment-entry"><input name="body" required maxlength="2000" placeholder="Write a private message..." autocomplete="off"><button class="primary">Send</button></form>':'<p class="empty">Add a friend first to start messaging.</p>')+'</section>';
}
function profilePage(){
 const p=me, mine=posts.filter(x=>x.author_id===user.id);
 return '<h1 class="page-title">My profile</h1><section class="panel"><div class="cloud-cover"></div><div class="cloud-profile-avatar">'+avatar(p)+'</div><h2>'+esc(profileName(p))+'</h2><p>'+esc(p.bio||'Welcome to my profile!')+'</p><p>📍 '+esc(p.location||'Mauritius')+'</p><button class="secondary" data-page="settings">Edit profile</button></section><h3>Your posts ('+mine.length+')</h3>'+listPosts(mine);
}
function settingsPage(){
 return '<h1 class="page-title">Profile settings</h1><section class="panel"><form id="cloudProfile" class="settings-row"><label>Display name</label><input class="form-input" name="display_name" maxlength="70" required value="'+esc(me.display_name)+'"><label>Bio</label><textarea class="form-input" name="bio" maxlength="300">'+esc(me.bio||'')+'</textarea><label>Location</label><input class="form-input" name="location" maxlength="100" value="'+esc(me.location||'Mauritius')+'"><label>Profile picture</label><input class="form-input" type="file" name="avatar" accept="image/jpeg,image/png,image/webp"><button class="primary">Save profile</button></form></section><section class="panel"><h3>🇲🇺 Mauritius</h3><p>Times shown in Indian/Mauritius (UTC+4).</p></section><section class="panel"><h3>Privacy</h3><p>Your posts are visible to signed-in LinkBook members. Your private messages can only be read by their participants. Reporting tools help flag inappropriate posts.</p></section>';
}
function notificationsPage(){
 return '<h1 class="page-title">Notifications</h1><section class="panel"><button class="secondary" data-action="readall">Mark all as read</button>'+(notifications.length?notifications.map(n=>'<div class="member"><div class="member-info"><b>'+esc(profileName(person(n.actor_id)))+'</b><small>'+esc(({friend_request:'sent you a friend request',friend_accept:'accepted your friend request',like:'liked your post',comment:'commented on your post',message:'sent you a message'})[n.kind]||n.kind)+'</small><small>'+time(n.created_at)+'</small></div>'+(n.is_read?'':'<span class="cloud-dot">●</span>')+'</div>').join(''):'<p>No notifications yet.</p>')+'</section>';
}
async function upload(file){
 if(!file)return null;
 const good=['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'];
 if(!good.includes(file.type)||file.size>25*1024*1024)throw Error('Choose a JPEG, PNG, WebP, GIF, MP4 or WebM file under 25 MB.');
 const ext=file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g,'')||'bin';
 const path=user.id+'/'+crypto.randomUUID()+'.'+ext;
 const r=await db.storage.from('linkbook-media').upload(path,file,{contentType:file.type,upsert:false});
 if(r.error)throw r.error;
 return {url:db.storage.from('linkbook-media').getPublicUrl(path).data.publicUrl,type:file.type.startsWith('video/')?'video':'image',path};
}
async function click(e){
 const pg=e.target.closest('[data-page]');if(pg){switchPage(pg.dataset.page);return}
 const fs=e.target.closest('[data-filter]');if(fs){filter=fs.dataset.filter;render();return}
 if(e.target.closest('#openComposer')){composer=true;render();return}
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
  const text=form.elements.body.value.trim(),f=form.elements.media.files[0];
  if(!text&&!f)throw Error('Write a post or choose a photo/video.');
  let uploaded;
  try{uploaded=await upload(f);await check(db.from('posts').insert({author_id:user.id,body:text,media_url:uploaded?.url||null,media_type:uploaded?.type||null}));}
  catch(err){if(uploaded?.path)await db.storage.from('linkbook-media').remove([uploaded.path]);throw err}
  composer=false;notify('Your post is online!');
 }else if(id==='cloudProfile'){
  const d=new FormData(form),patch={display_name:String(d.get('display_name')||'').trim(),bio:String(d.get('bio')||'').trim(),location:String(d.get('location')||'').trim(),updated_at:new Date().toISOString()};
  if(!patch.display_name)throw Error('Display name required.');
  const uploaded=await upload(form.elements.avatar.files[0]);if(uploaded){if(uploaded.type!=='image')throw Error('Profile photo must be an image.');patch.avatar_url=uploaded.url;}
  await check(db.from('profiles').update(patch).eq('id',user.id));page='profile';notify('Profile updated!');
 }else if(id==='cloudMessage'){
  const text=form.elements.body.value.trim();if(!text||!peer)return;
  await check(db.from('messages').insert({sender_id:user.id,recipient_id:peer,body:text}));
 }else{
  const text=form.elements.comment.value.trim();if(!text)return;
  await check(db.from('comments').insert({post_id:form.dataset.comment,author_id:user.id,body:text}));
 }
 await refresh();
 }catch(err){console.error(err);notify(errText(err),true)}
 finally{busy=false;if(btn?.isConnected)btn.disabled=false}
}
function change(e){if(e.target.name==='media'&&e.target.closest('#cloudPost')){$('#fileLabel').textContent=e.target.files[0]?.name||''}}
const badge=document.createElement('button');badge.className='cloud-notifications';badge.type='button';badge.title='Notifications';badge.setAttribute('aria-label','Notifications');badge.textContent='🔔';badge.addEventListener('click',()=>switchPage('notifications'));$('.header-actions')?.prepend(badge);
root.innerHTML='<section class="panel empty">Connecting LinkBook Pro…</section>';
boot().catch(e=>{console.error(e);root.innerHTML='<section class="panel"><h2>Cannot connect to LinkBook Pro</h2><p>'+esc(errText(e))+'</p><button class="primary" id="cloudRetry">Retry</button></section>';$('#cloudRetry').onclick=()=>location.reload()});
})();
