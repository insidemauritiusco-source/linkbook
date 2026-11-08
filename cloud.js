/* LinkBook Pro: shared social networking for authenticated members. */
(async()=>{
'use strict';
const db=window.linkbookClient, user=window.linkbookSignedInUser;
if(!db||!user){return;}
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>new Intl.DateTimeFormat('en-GB',{timeZone:'Indian/Mauritius',dateStyle:'medium',timeStyle:'short'}).format(new Date(v));
const avatar=p=>'<span class="avatar">'+esc((p?.display_name||'?').charAt(0).toUpperCase())+'</span>';
const me=user.id;
let profile=null,people=[],posts=[],friendships=[],messages=[],notifications=[],saved=[],selectedChat=null,page='feed',filter='latest',search='',status='',busy=false;
const content=$('#content'),note=$('.note'),right=$('.rightbar');
if(note)note.innerHTML='LinkBook Pro<br><small>Online posts, real friends and private chats. Account required.</small>';
if(right)right.innerHTML='<section class="panel"><h3>LinkBook Pro 🌐</h3><p>Your posts and friends are securely stored online. Welcome to the community!</p></section>';
const profileBy=id=>people.find(p=>p.id===id)||{id,display_name:'Member'};
const nameOf=id=>profileBy(id).display_name||'Member';
const check=(r)=>{if(r.error)throw r.error;return r.data};
const flash=(message)=>{status=message;paint();};
async function loadAll(){
 const [pr,pe,po,fr,ma,no,sa]=await Promise.all([
 db.from('profiles').select('*').eq('id',me).maybeSingle(),
 db.from('profiles').select('*').order('created_at',{ascending:false}).limit(200),
 db.from('posts').select('*').order('created_at',{ascending:false}).limit(100),
 db.from('friendships').select('*').or('requester_id.eq.'+me+',addressee_id.eq.'+me),
 db.from('messages').select('*').order('created_at',{ascending:false}).limit(500),
 db.from('notifications').select('*').order('created_at',{ascending:false}).limit(100),
 db.from('saved_posts').select('post_id').eq('user_id',me)
 ]);
 [pr,pe,po,fr,ma,no,sa].forEach(check);
 profile=pr.data;
 people=pe.data||[];posts=po.data||[];friendships=fr.data||[];messages=ma.data||[];notifications=no.data||[];saved=(sa.data||[]).map(x=>x.post_id);
 if(profile&&!people.some(p=>p.id===me))people.push(profile);
}
async function ensureProfile(){
 const display_name=(user.user_metadata?.display_name||user.email?.split('@')[0]||'LinkBook member').slice(0,70);
 const {data,error}=await db.from('profiles').select('*').eq('id',me).maybeSingle();
 if(error)throw error;
 if(!data){check(await db.from('profiles').insert({id:me,display_name,location:'Mauritius'}));}
}
const likeMap=Object.create(null),commentMap=Object.create(null);
async function loadInteractions(){
 const ids=posts.map(p=>p.id);
 for(const k of Object.keys(likeMap))delete likeMap[k];
 for(const k of Object.keys(commentMap))delete commentMap[k];
 if(!ids.length)return;
 const [a,b]=await Promise.all([db.from('post_likes').select('post_id,user_id').in('post_id',ids),db.from('comments').select('*').in('post_id',ids).order('created_at',{ascending:true})]);
 [a,b].forEach(check);
 for(const row of a.data||[])(likeMap[row.post_id]??=[]).push(row.user_id);
 for(const row of b.data||[])(commentMap[row.post_id]??=[]).push(row);
}
async function refresh(){await loadAll();await loadInteractions();paint();}
const friends=()=>friendships.filter(f=>f.status==='accepted').map(f=>f.requester_id===me?f.addressee_id:f.requester_id);
const relationship=id=>friendships.find(f=>(f.requester_id===me&&f.addressee_id===id)||(f.requester_id===id&&f.addressee_id===me));
const numberUnread=()=>notifications.filter(n=>!n.is_read).length;
function cardPost(p){
 const author=profileBy(p.author_id),likes=likeMap[p.id]||[],comments=commentMap[p.id]||[];
 const mine=p.author_id===me;
 const media=p.media_url?(p.media_type==='video'?'<video class="lb-media" controls preload="metadata" src="'+esc(p.media_url)+'"></video>':'<img class="lb-media" loading="lazy" src="'+esc(p.media_url)+'" alt="Post image">'):'';
 return '<article class="post"><div class="post-author">'+avatar(author)+'<div><div class="name">'+esc(author.display_name)+'</div><small>'+esc(date(p.created_at))+' MUT · 🌐 Public</small></div><div class="spacer"></div>'+
 (mine?'<button class="secondary" data-remove-post="'+p.id+'">Delete</button>':'<button class="more" aria-label="Report post" data-report="'+p.id+'">⚑</button>')+
 '<button class="more" aria-label="Save post" data-save="'+p.id+'">'+(saved.includes(p.id)?'★':'☆')+'</button></div><div class="post-body">'+esc(p.body)+'</div>'+media+
 '<div class="counts"><span>👍 '+likes.length+' likes</span><span>'+comments.length+' comments</span></div><div class="post-actions">'+
 '<button data-like="'+p.id+'" class="'+(likes.includes(me)?'liked':'')+'">♡ '+(likes.includes(me)?'Liked':'Like')+'</button><button data-focus-comment="'+p.id+'">◌ Comment</button><button data-share="'+p.id+'">↗ Share</button></div>'+
 '<div class="comments">'+comments.map(c=>'<div class="comment"><b>'+esc(nameOf(c.author_id))+'</b> '+esc(c.body)+'</div>').join('')+
 '<form class="comment-entry" data-comment="'+p.id+'"><input name="body" maxlength="600" required placeholder="Write a comment" aria-label="Write a comment"><button class="primary">Send</button></form></div></article>';
}
function feed(){
 let visible=[...posts].filter(p=>(p.body+' '+nameOf(p.author_id)).toLowerCase().includes(search));
 if(filter==='friends')visible=visible.filter(p=>p.author_id===me||friends().includes(p.author_id));
 if(filter==='popular')visible.sort((a,b)=>(likeMap[b.id]?.length||0)-(likeMap[a.id]?.length||0));
 return '<h1 class="page-title">Your feed ✦</h1><section class="panel composer"><div class="composer-header">'+avatar(profile)+'<h3>Share something with your community</h3></div>'+
 '<form id="cloud-post"><textarea required name="body" maxlength="4000" placeholder="What\'s on your mind?"></textarea><div class="composer-actions"><label class="lb-upload">📷 Photo / 🎬 Video <input type="file" name="media" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"></label><button class="primary" '+(busy?'disabled':'')+'>Publish post</button></div><small class="muted">Public posts. Upload limit 25 MB.</small></form></section>'+
 '<div class="filters">'+['latest','popular','friends'].map(x=>'<button data-filter="'+x+'" class="'+(filter===x?'active':'')+'">'+x[0].toUpperCase()+x.slice(1)+'</button>').join('')+'</div>'+
 (visible.length?visible.map(cardPost).join(''):'<section class="panel empty">No posts here yet. Create the first post!</section>');
}
function friendsPage(){
 let list=people.filter(p=>p.id!==me&&p.display_name.toLowerCase().includes(search));
 const rows=list.map(p=>{
 const r=relationship(p.id);
 let action=!r?'<button class="primary" data-add="'+p.id+'">Add friend</button>':r.status==='accepted'?'<button class="secondary" data-unfriend="'+r.id+'">Remove</button>':r.status==='pending'&&r.addressee_id===me?'<button class="primary" data-accept="'+r.id+'">Accept</button><button class="secondary" data-decline="'+r.id+'">Decline</button>':'<button class="secondary" data-unfriend="'+r.id+'">Cancel</button>':'<button class="primary" data-add="'+p.id+'">Add friend</button>';
 return '<div class="member">'+avatar(p)+'<div class="member-info"><b>'+esc(p.display_name)+'</b><small>'+esc(p.location||'Mauritius')+'</small></div>'+action+'</div>';
 }).join('');
 return '<h1 class="page-title">Find friends</h1><section class="panel"><p>Connect with members to send private messages.</p>'+ (rows||'<p>No other members yet. Invite someone to register!</p>')+'</section>';
}
function messagesPage(){
 const ids=friends();
 if(selectedChat&&!ids.includes(selectedChat))selectedChat=null;
 if(!selectedChat)selectedChat=ids[0]||null;
 const chat=messages.filter(m=>(m.sender_id===me&&m.recipient_id===selectedChat)||(m.sender_id===selectedChat&&m.recipient_id===me)).reverse();
 return '<h1 class="page-title">Private messages</h1><section class="panel"><div class="lb-chats">'+
 '<div class="lb-chat-people">'+(ids.length?ids.map(id=>'<button class="lb-chat-person '+(id===selectedChat?'selected':'')+'" data-chat="'+id+'">'+esc(nameOf(id))+'</button>').join(''):'<p>Add a friend to start chatting.</p>')+'</div>'+
 '<div class="lb-chat-main">'+(selectedChat?'<h3>Chat with '+esc(nameOf(selectedChat))+'</h3><div class="lb-chat-log">'+(chat.map(m=>'<div class="lb-bubble '+(m.sender_id===me?'mine':'')+'">'+esc(m.body)+'<small>'+esc(date(m.created_at))+'</small></div>').join('')||'<div class="muted">Say hello!</div>')+'</div><form id="send-message" class="comment-entry"><input name="body" maxlength="2000" required placeholder="Write a message"><button class="primary">Send</button></form>':'<p>Choose a friend to chat.</p>')+'</div></div></section>';
}
function profilePage(){
 return '<h1 class="page-title">My profile</h1><section class="panel"><div class="lb-cover"></div><div class="lb-profile-heading">'+avatar(profile)+'<div><h2>'+esc(profile.display_name)+'</h2><p>'+esc(profile.bio||'Welcome to my LinkBook!')+'</p><small>📍 '+esc(profile.location||'Mauritius')+'</small></div></div><button class="secondary" data-page="settings">Edit profile</button></section><h3>Your posts</h3>'+posts.filter(p=>p.author_id===me).map(cardPost).join('');
}
function settingsPage(){
 return '<h1 class="page-title">Profile settings</h1><section class="panel"><form id="profileForm" class="settings-row"><label>Display name</label><input class="form-input" name="name" required maxlength="70" value="'+esc(profile.display_name)+'"><label>Bio</label><textarea class="form-input" name="bio" maxlength="300">'+esc(profile.bio||'')+'</textarea><label>Location</label><input class="form-input" name="location" maxlength="100" value="'+esc(profile.location||'Mauritius')+'"><button class="primary">Save profile</button></form><p>Times displayed in Mauritius (GMT+4). Your profile and public posts are visible to signed-in users.</p></section>';
}
function notificationsPage(){
 return '<h1 class="page-title">Notifications ('+numberUnread()+' unread)</h1><section class="panel"><button class="secondary" id="mark-notifications">Mark all as read</button>'+
 (notifications.map(n=>'<div class="member"><div class="member-info"><b>'+esc(nameOf(n.actor_id))+'</b> '+esc(({friend_request:'sent a friend request',friend_accept:'accepted your friend request',like:'liked your post',comment:'commented on your post',message:'sent you a message'})[n.kind]||n.kind)+'<small>'+esc(date(n.created_at))+' MUT '+(n.is_read?'':'• New')+'</small></div></div>').join('')||'<p>No notifications yet.</p>')+'</section>';
}
function paint(){
 $('#navName').textContent=profile?.display_name||'Member';
 $('#userTop').textContent=(profile?.display_name||'?').charAt(0).toUpperCase();
 document.querySelectorAll('[data-page]').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
 content.innerHTML=(status?'<div class="lb-banner" role="status">'+esc(status)+' <button id="dismiss-status">×</button></div>':'')+
 (page==='feed'?feed():page==='friends'?friendsPage():page==='messages'?messagesPage():page==='saved'?'<h1 class="page-title">Saved posts</h1>'+posts.filter(p=>saved.includes(p.id)).map(cardPost).join('')||'<section class="panel empty">No saved posts yet</section>':page==='profile'?profilePage():page==='settings'?settingsPage():notificationsPage());
 if(page==='messages')content.querySelector('.lb-chat-log')?.scrollTo(0,100000);
}
async function operation(fn){
 if(busy)return;
 busy=true;
 try{await fn();status='';await refresh();}
 catch(e){console.error(e);status=e.message||'Something went wrong. Try again.';paint();}
 finally{busy=false;}
}
document.addEventListener('click',async event=>{
 const b=event.target.closest('button');if(!b||!window.linkbookSignedInUser)return;
 const d=b.dataset;
 if(d.page){page=d.page;status='';paint();return;}
 if(d.filter){filter=d.filter;paint();return;}
 if(d.chat){selectedChat=d.chat;paint();return;}
 if(b.id==='dismiss-status'){status='';paint();return;}
 if(b.id==='mark-notifications')return operation(async()=>{check(await db.from('notifications').update({is_read:true}).eq('recipient_id',me).eq('is_read',false));});
 if(d.add)return operation(async()=>{check(await db.from('friendships').insert({requester_id:me,addressee_id:d.add}));});
 if(d.accept||d.decline)return operation(async()=>{check(await db.from('friendships').update({status:d.accept?'accepted':'declined',updated_at:new Date().toISOString()}).eq('id',d.accept||d.decline));});
 if(d.unfriend)return operation(async()=>{check(await db.from('friendships').delete().eq('id',d.unfriend));});
 if(d.like)return operation(async()=>{
 const liked=(likeMap[d.like]||[]).includes(me);
 check(await(liked?db.from('post_likes').delete().eq('post_id',d.like).eq('user_id',me):db.from('post_likes').insert({post_id:d.like,user_id:me})));
 });
 if(d.save)return operation(async()=>{check(await(saved.includes(d.save)?db.from('saved_posts').delete().eq('post_id',d.save).eq('user_id',me):db.from('saved_posts').insert({post_id:d.save,user_id:me})));});
 if(d.removePost){if(!confirm('Delete this post?'))return;return operation(async()=>{check(await db.from('posts').delete().eq('id',d.removePost).eq('author_id',me));});}
 if(d.report){const reason=prompt('Why are you reporting this post? (5–500 characters)');if(!reason)return;return operation(async()=>{check(await db.from('reports').insert({reporter_id:me,post_id:d.report,reason:reason.slice(0,500)}));flash('Report submitted.');});}
 if(d.focusComment){content.querySelector('[data-comment="'+d.focusComment+'"] input')?.focus();return;}
 if(d.share){const url=location.origin+location.pathname+'#post-'+d.share;if(navigator.share)navigator.share({title:'LinkBook post',url}).catch(()=>{});else navigator.clipboard?.writeText(url).then(()=>flash('Link copied')).catch(()=>flash(url));return;}
});
document.addEventListener('submit',e=>{
 const form=e.target;if(!form.closest('#content'))return;
 e.preventDefault();
 if(form.id==='cloud-post')return operation(async()=>{
 const body=form.elements.body.value.trim(),file=form.elements.media.files[0];
 if(!body&&!file)throw Error('Write something or choose a photo/video.');
 let media_url=null,media_type=null;
 if(file){
  if(file.size>25*1024*1024)throw Error('File must be smaller than 25 MB.');
  if(!['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'].includes(file.type))throw Error('This file type is not supported.');
  const ext=({ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','video/mp4':'mp4','video/webm':'webm'})[file.type];
  const path=me+'/'+crypto.randomUUID()+'.'+ext;
  check(await db.storage.from('linkbook-media').upload(path,file,{contentType:file.type,upsert:false}));
  media_url=db.storage.from('linkbook-media').getPublicUrl(path).data.publicUrl;
  media_type=file.type.startsWith('image/')?'image':'video';
 }
 check(await db.from('posts').insert({author_id:me,body,media_url,media_type}));
 });
 if(form.dataset.comment)return operation(async()=>{const body=form.elements.body.value.trim();if(body)check(await db.from('comments').insert({post_id:form.dataset.comment,author_id:me,body}));});
 if(form.id==='send-message')return operation(async()=>{const body=form.elements.body.value.trim();if(body&&selectedChat)check(await db.from('messages').insert({sender_id:me,recipient_id:selectedChat,body}));});
 if(form.id==='profileForm')return operation(async()=>{const d=new FormData(form);check(await db.from('profiles').update({display_name:String(d.get('name')).trim().slice(0,70),bio:String(d.get('bio')).slice(0,300),location:String(d.get('location')).slice(0,100),updated_at:new Date().toISOString()}).eq('id',me));page='profile';});
});
$('#search').addEventListener('input',e=>{search=e.target.value.toLowerCase();if(!['feed','friends'].includes(page))page='friends';paint();});
$('#userTop').addEventListener('click',()=>{page='profile';paint();});
$('#theme').addEventListener('click',()=>{document.body.classList.toggle('dark');localStorage.setItem('linkbook-theme',document.body.classList.contains('dark')?'dark':'light');});
if(localStorage.getItem('linkbook-theme')==='dark')document.body.classList.add('dark');
try{
 await ensureProfile();await refresh();
 const unread=()=>{let button=$('#lbNotify');if(!button){button=document.createElement('button');button.id='lbNotify';button.className='circle';button.title='Notifications';button.setAttribute('aria-label','Notifications');button.onclick=()=>{page='notifications';paint();};$('.header-actions')?.prepend(button);}button.textContent='🔔'+(numberUnread()?' '+numberUnread():'');};
 const repaint=paint;paint=function(){repaint();unread();};
 unread();
 const channel=db.channel('linkbook-community-'+me)
 .on('postgres_changes',{event:'*',schema:'public',table:'posts'},()=>refresh().catch(console.error))
 .on('postgres_changes',{event:'*',schema:'public',table:'post_likes'},()=>refresh().catch(console.error))
 .on('postgres_changes',{event:'*',schema:'public',table:'comments'},()=>refresh().catch(console.error))
 .on('postgres_changes',{event:'*',schema:'public',table:'friendships'},()=>refresh().catch(console.error))
 .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages'},()=>refresh().catch(console.error))
 .on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications'},()=>refresh().catch(console.error))
 .subscribe();
 window.addEventListener('beforeunload',()=>db.removeChannel(channel));
}catch(e){console.error(e);content.innerHTML='<section class="panel"><h2>Unable to load online feed</h2><p>'+esc(e.message||'Check your connection')+'</p><button class="primary" onclick="location.reload()">Retry</button></section>';}
})();