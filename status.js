/* LinkBook Status: text, photo and video updates visible for 24 hours. */
(() => {
'use strict';
const safe = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let db,user,upload,displayName,notice,refresh,working=false,objectUrl=null;
const acceptedTypes=['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'];
const maxBytes=25*1024*1024;
function feedback(text,isError=false){
 const el=document.querySelector('#lb-status-feedback');
 if(el){el.textContent=text;el.hidden=false;el.classList.toggle('error',isError);}
 if(notice)notice(text,isError);
}
function clearPreview(){
 if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}
}
function asTime(s){
 return new Intl.DateTimeFormat('en-GB',{timeZone:'Indian/Mauritius',dateStyle:'medium',timeStyle:'short'}).format(new Date(s))+' MUT';
}
function mediaHtml(item){
 if(!item.media_url)return '';
 // Only storage URLs from the same public media bucket are accepted in the database.
 const url=safe(item.media_url);
 if(item.media_type==='video')return '<video class="lb-status-media" src="'+url+'" controls preload="metadata" playsinline></video>';
 return '<img class="lb-status-media" src="'+url+'" alt="Status photo" loading="lazy">';
}
function itemHtml(item){
 const owner=item.author_id===user.id;
 const expiry=new Date(item.expires_at).getTime();
 const minutes=Math.max(0,Math.ceil((expiry-Date.now())/60000));
 const lifetime=minutes>60?Math.ceil(minutes/60)+'h remaining':minutes+'m remaining';
 return '<article class="lb-status-item"><div class="lb-status-item-head"><strong>'+safe(displayName(item.author_id))+'</strong><small>'+safe(asTime(item.created_at))+' · '+safe(lifetime)+'</small>'+
 (owner?'<button type="button" data-remove-status="'+safe(item.id)+'" aria-label="Delete my status">Delete</button>':'')+
 '</div>'+(item.body?'<p class="lb-status-text">'+safe(item.body)+'</p>':'')+mediaHtml(item)+'</article>';
}
async function load(container){
 try{
  const rows=await db.from('member_statuses').select('id,author_id,body,media_type,media_url,created_at,expires_at')
   .gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(60);
  if(rows.error)throw rows.error;
  if(container.dataset.lbView!=='status')return;
  const feed=container.querySelector('#lb-status-feed');
  if(feed)feed.innerHTML=rows.data?.length?rows.data.map(itemHtml).join(''):'<p class="lb-status-empty">No recent statuses yet. Share the first one!</p>';
 }catch(error){
  const feed=container.querySelector('#lb-status-feed');
  if(container.dataset.lbView==='status'&&feed)feed.textContent='Status feed could not load: '+(error.message||'Please refresh.');
 }
}
function preview(form){
 const file=form.elements.media.files?.[0];
 const holder=form.querySelector('#lb-status-preview');
 if(!holder)return;
 clearPreview();
 holder.replaceChildren();
 if(!file)return;
 if(!acceptedTypes.includes(file.type)||file.size<=0||file.size>maxBytes){
  form.elements.media.value='';
  feedback('Choose a photo or MP4/WebM video up to 25 MB.',true);
  return;
 }
 objectUrl=URL.createObjectURL(file);
 const media=document.createElement(file.type.startsWith('video/')?'video':'img');
 media.src=objectUrl;media.className='lb-status-media';
 if(media.tagName==='VIDEO'){media.controls=true;media.preload='metadata';media.playsInline=true;}
 else media.alt='New status preview';
 const label=document.createElement('small');label.textContent=file.name+' · '+(file.size/1048576).toFixed(1)+' MB';
 holder.append(media,label);
}
function render(container){
 container.dataset.lbView='status';
 clearPreview();
 container.innerHTML='<h1 class="page-title">Status · 24 hours</h1>'+
 '<section class="panel lb-status-compose"><h2>Share a status</h2><p>Share a short update, photo or video with LinkBook members. Statuses disappear from the feed after 24 hours.</p>'+
 '<form id="lbStatusPost"><label for="lbStatusText">What’s happening?</label><textarea id="lbStatusText" name="body" maxlength="500" placeholder="Write a short status…"></textarea>'+
 '<label class="lb-status-select">📷 Choose photo or video<input type="file" name="media" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"></label>'+
 '<small>JPEG, PNG, WebP, GIF, MP4 or WebM · Maximum 25 MB</small><div id="lb-status-preview"></div>'+
 '<p id="lb-status-feedback" role="status" aria-live="polite" hidden></p><button class="primary" type="submit">Post status</button></form></section>'+
 '<section class="panel"><h2>Recent statuses</h2><div id="lb-status-feed" class="lb-status-list"><p>Loading statuses…</p></div></section>';
 const form=container.querySelector('#lbStatusPost');
 form.elements.media.addEventListener('change',()=>preview(form));
 form.addEventListener('submit',async event=>{
  event.preventDefault();event.stopPropagation();
  if(working)return;
  const body=form.elements.body.value.trim(),file=form.elements.media.files?.[0];
  if(!body&&!file){feedback('Write something or choose a photo/video.',true);return;}
  if(file&&(!acceptedTypes.includes(file.type)||file.size>maxBytes||file.size===0)){feedback('Unsupported photo/video or larger than 25 MB.',true);return;}
  working=true;const button=form.querySelector('button[type="submit"]');button.disabled=true;
  try{
   feedback('Publishing status…');
   const stored=file?await upload(file):null;
   const result=await db.from('member_statuses').insert({author_id:user.id,body,media_url:stored?.url||null,media_type:stored?.type||null});
   if(result.error)throw result.error;
   clearPreview();
   if(container.dataset.lbView==='status')render(container);
   if(notice)notice('Status posted for 24 hours!');
  }catch(error){feedback('Could not publish status: '+(error.message||'Please try again.'),true);}
  finally{working=false;if(button.isConnected)button.disabled=false;}
 });
 container.addEventListener('click',async function onDelete(event){
  const button=event.target.closest('[data-remove-status]');
  if(!button||working)return;
  if(!confirm('Delete this status?'))return;
  working=true;button.disabled=true;
  try{
   const result=await db.from('member_statuses').delete().eq('id',button.dataset.removeStatus).eq('author_id',user.id);
   if(result.error)throw result.error;
   if(container.dataset.lbView==='status')await load(container);
   if(notice)notice('Status deleted.');
  }catch(error){feedback('Delete failed: '+(error.message||'Retry'),true);}
  finally{working=false;if(button.isConnected)button.disabled=false;}
 },{once:false});
 load(container);
}
function init(config){
 db=config.db;user=config.user;upload=config.upload;displayName=config.displayName;notice=config.notice;
}
window.LinkBookStatus={init,render};
})();
