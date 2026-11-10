/* LinkBook installed-PWA Share Target. Files stay local until user presses Publish. */
'use strict';
const DB='linkbook-incoming-shares-v1',STORE='shares',PREFIX='/linkbook/';
const ALLOWED=new Set(['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm']);
function database(){
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB,1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE);};
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error);
 });
}
async function storeShare(key,value){
 const db=await database();
 try{
  await new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,'readwrite');
   tx.objectStore(STORE).put(value,key);
   tx.oncomplete=resolve;
   tx.onerror=()=>reject(tx.error);
   tx.onabort=()=>reject(tx.error);
  });
 }finally{db.close();}
}
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='POST'||url.origin!==self.location.origin||url.pathname!==PREFIX+'share-target/')return;
 event.respondWith((async()=>{
  try{
   const form=await event.request.formData();
   const files=form.getAll('media').filter(item=>item instanceof File&&item.size>0);
   const file=files[0]||null;
   if(files.length>1) return Response.redirect(new URL(PREFIX+'?share_error=one_file',self.location.origin).href,303);
   if(file&&(!ALLOWED.has(file.type)||file.size>25*1024*1024))
    return Response.redirect(new URL(PREFIX+'?share_error=unsupported_file',self.location.origin).href,303);
   const title=String(form.get('title')||'').slice(0,800);
   const text=String(form.get('text')||'').slice(0,4000);
   const urlText=String(form.get('url')||'').slice(0,2000);
   if(!file&&!title&&!text&&!urlText)return Response.redirect(new URL(PREFIX+'?share_error=empty',self.location.origin).href,303);
   const key=crypto.randomUUID();
   await storeShare(key,{file,title,text,url:urlText,created:Date.now()});
   return Response.redirect(new URL(PREFIX+'?shared='+encodeURIComponent(key),self.location.origin).href,303);
  }catch(_){return Response.redirect(new URL(PREFIX+'?share_error=storage',self.location.origin).href,303);}
 })());
});
