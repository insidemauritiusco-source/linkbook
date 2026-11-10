/* Receive Android system shares into LinkBook composer (never auto-publish). */
(function(root){
 'use strict';
 const DB='linkbook-incoming-shares-v1',STORE='shares',KEY='linkbook-pending-share-id';
 const query=new URL(location.href);
 const id=query.searchParams.get('shared');
 if(id&&/^[a-f0-9-]{36}$/i.test(id)){sessionStorage.setItem(KEY,id);}
 const error=query.searchParams.get('share_error');
 if(id||error){
  query.searchParams.delete('shared');query.searchParams.delete('share_error');
  history.replaceState(history.state,'',query.pathname+query.search+query.hash);
 }
 function openDb(){
  return new Promise((resolve,reject)=>{
   const request=indexedDB.open(DB,1);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);};
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error);
  });
 }
 async function read(){
  const key=sessionStorage.getItem(KEY);
  if(!key)return null;
  const db=await openDb();
  try{
   return await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readonly');
    const req=tx.objectStore(STORE).get(key);
    req.onsuccess=()=>resolve(req.result||null);
    req.onerror=()=>reject(req.error);
   });
  }finally{db.close();}
 }
 async function clear(){
  const key=sessionStorage.getItem(KEY);
  if(!key)return;
  const db=await openDb();
  try{
   await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
   });
   sessionStorage.removeItem(KEY);
  }finally{db.close();}
 }
 root.LinkBookIncomingShare={read,clear,error};
 if('serviceWorker' in navigator&&window.isSecureContext){
  navigator.serviceWorker.register('./share-worker.js',{scope:'./'})
   .catch(()=>console.warn('LinkBook Android sharing needs service-worker support.'));
 }
})(window);
