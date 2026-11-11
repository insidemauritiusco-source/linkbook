/* LinkBook home feed: Facebook-style, clickable 24-hour Status stories. */
(() => {
'use strict';
let db,member,displayName,avatarUrl;
let activeStories=[],modal=null,previousFocus=null;
const escapeHtml = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl = value => {
 try {const u=new URL(value);return u.protocol==='https:'&&u.hostname==='dcmxqlrodbckqbeaxnqd.supabase.co'&&u.pathname.startsWith('/storage/v1/object/public/linkbook-media/')?u.href:null;}catch{return null;}
};
function latestPerAuthor(statuses){
 const seen=new Set();
 return statuses.filter(s=>{
  if(seen.has(s.author_id))return false;
  seen.add(s.author_id);return true;
 });
}
function photoFor(status){
 const media=status.media_type==='image'?safeUrl(status.media_url):null;
 return media||avatarUrl(status.author_id);
}
function close(){
 if(!modal)return;
 modal.querySelector('video')?.pause();
 modal.remove();
 modal=null;
 document.body.classList.remove('lb-story-open');
 if(previousFocus?.isConnected)previousFocus.focus();
 previousFocus=null;
}
function view(index){
 const item=activeStories[index];
 if(!item||new Date(item.expires_at).getTime()<=Date.now()){close();return;}
 if(!modal)previousFocus=document.activeElement;else closeWithoutFocus();
 const dialog=document.createElement('section');
 dialog.className='lb-story-modal';
 dialog.setAttribute('role','dialog');
 dialog.setAttribute('aria-modal','true');
 dialog.setAttribute('aria-label','Status by '+displayName(item.author_id));
 dialog.innerHTML='<div class="lb-story-card"><header class="lb-story-modal-head"><strong>'+escapeHtml(displayName(item.author_id))+'</strong><button type="button" class="lb-story-close" aria-label="Close status">✕</button></header><div class="lb-story-content"></div><footer class="lb-story-modal-foot"><button type="button" class="lb-story-prev">Previous</button><span>'+String(index+1)+' of '+String(activeStories.length)+'</span><button type="button" class="lb-story-next">Next</button></footer></div>';
 const content=dialog.querySelector('.lb-story-content');
 const url=safeUrl(item.media_url);
 if(url){
  const media=document.createElement(item.media_type==='video'?'video':'img');
  media.src=url;media.className='lb-story-view-media';
  if(item.media_type==='video'){media.controls=true;media.playsInline=true;media.preload='metadata';}
  else media.alt='Status photo';
  content.append(media);
 }
 if(item.body){
  const text=document.createElement('p');text.className='lb-story-view-text';text.textContent=item.body;content.append(text);
 }
 dialog.querySelector('.lb-story-close').onclick=close;
 dialog.querySelector('.lb-story-prev').disabled=index===0;
 dialog.querySelector('.lb-story-next').disabled=index===activeStories.length-1;
 dialog.querySelector('.lb-story-prev').onclick=()=>view(index-1);
 dialog.querySelector('.lb-story-next').onclick=()=>view(index+1);
 dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
 document.body.append(dialog);modal=dialog;
 document.body.classList.add('lb-story-open');
 dialog.querySelector('.lb-story-close').focus();
}
function closeWithoutFocus(){
 if(!modal)return;
 modal.querySelector('video')?.pause();
 modal.remove();
 modal=null;
}
async function render(holder){
 if(!db||!member||!holder)return;
 const timestamp=Date.now().toString();
 holder.dataset.storiesLoad=timestamp;
 holder.innerHTML='<div class="lb-stories-heading"><strong>Stories · 24h</strong><span>Share your moments</span></div><div class="lb-stories-scroller"><button class="lb-story-add" type="button" data-page="status"><span class="lb-story-add-icon">+</span><span>Add Story</span></button><span class="lb-stories-loading">Loading stories…</span></div>';
 try{
  const {data,error}=await db.from('member_statuses').select('id,author_id,body,media_url,media_type,created_at,expires_at')
   .gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(100);
  if(error)throw error;
  if(!holder.isConnected||holder.dataset.storiesLoad!==timestamp)return;
  activeStories=latestPerAuthor((data||[]).filter(x=>new Date(x.expires_at).getTime()>Date.now()));
  const scroller=holder.querySelector('.lb-stories-scroller');
  scroller.querySelector('.lb-stories-loading')?.remove();
  activeStories.forEach((item,index)=>{
   const button=document.createElement('button');button.type='button';
   button.className='lb-story-button';button.dataset.storyIndex=String(index);
   button.setAttribute('aria-label','View status from '+displayName(item.author_id));
   const ring=document.createElement('span');ring.className='lb-story-ring';
   const url=photoFor(item);
   if(url){
    const img=document.createElement('img');img.src=url;img.alt='';img.loading='lazy';ring.append(img);
   }else{
    const initial=document.createElement('span');initial.className='lb-story-initial';
    initial.textContent=String(displayName(item.author_id)).charAt(0).toUpperCase()||'?';
    ring.append(initial);
   }
   const name=document.createElement('span');name.className='lb-story-label';name.textContent=displayName(item.author_id);
   button.append(ring,name);scroller.append(button);
  });
  if(!activeStories.length){
   const empty=document.createElement('p');empty.className='lb-stories-empty';empty.textContent='No active stories yet';scroller.append(empty);
  }
 }catch(error){
  if(holder.isConnected&&holder.dataset.storiesLoad===timestamp){
   const span=holder.querySelector('.lb-stories-loading');
   if(span)span.textContent='Stories unavailable — open Status to try again.';
  }
 }
}
function init(config){
 db=config.db;member=config.user;displayName=config.displayName;avatarUrl=config.avatarUrl;
 document.addEventListener('click',e=>{
  const button=e.target.closest('[data-story-index]');
  if(button&&button.closest('#lbHomeStories'))view(Number(button.dataset.storyIndex));
 });
 document.addEventListener('keydown',e=>{
  if(!modal)return;
  if(e.key==='Escape'){e.preventDefault();close();}
  else if(e.key==='Tab'){e.preventDefault();modal.querySelector('.lb-story-close')?.focus();}
 });
}
window.LinkBookHomeStories={init,render,close};
})();