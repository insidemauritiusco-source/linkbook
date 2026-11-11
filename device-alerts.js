/* LinkBook device alerts: permission and push subscription, opt-in only. */
(() => {
'use strict';
// The server derives the matching public VAPID key from its protected private key.
async function currentVapidKey(){
 const base=window.LINKBOOK_AUTH?.url;
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base||''))throw Error('LinkBook backend is not configured.');
 const session=await db.auth.getSession();
 if(session.error||!session.data?.session?.access_token)throw Error('Sign in again to register notifications.');
 const response=await fetch(base+'/functions/v1/linkbook-push-dispatch',{method:'GET',cache:'no-store',headers:{'Authorization':'Bearer '+session.data.session.access_token,'apikey':window.LINKBOOK_AUTH?.publishableKey||''}});
 if(!response.ok)throw Error('Background notification server is not ready ('+response.status+').');
 const data=await response.json();
 if(!data?.ready||typeof data.publicKey!=='string')throw Error('Server signing key is unavailable.');
 const bytes=decode(data.publicKey);
 if(bytes.length!==65||bytes[0]!==4)throw Error('Server public signing key is invalid.');
 return bytes;
}
let db,user,notice;
let processing=false;
function available(){return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;}
function decode(value){
 const padded=value+'='.repeat((4-value.length%4)%4);
 const binary=atob(padded.replace(/-/g,'+').replace(/_/g,'/'));
 return Uint8Array.from(binary,c=>c.charCodeAt(0));
}
function label(){
 if(!available())return 'This browser does not support secure push notifications.';
 if(Notification.permission==='denied')return 'Notifications are blocked. Enable them in Android/Chrome site settings.';
 if(Notification.permission==='granted')return 'Permission granted. Tap Enable to register/rekey this device, then send a background test.';
 return 'Notifications are off. Choose Enable to allow alerts for this device.';
}
function refreshLabel(){
 const text=document.getElementById('lb-push-status');
 if(text)text.textContent=label();
 const enable=document.getElementById('lb-push-enable');
 if(enable)enable.disabled=!available()||processing||Notification.permission==='denied';
 const disable=document.getElementById('lb-push-disable');
 if(disable)disable.disabled=!available()||processing;
}
async function registration(){return navigator.serviceWorker.register('./share-worker.js',{scope:'./'});}
async function enable(){
 if(!available()||processing)return;
 processing=true;refreshLabel();
 try{
  const response=await Notification.requestPermission();
  if(response!=='granted')throw Error('Notifications were not allowed in this browser.');
  const reg=await registration();
  let existing=await reg.pushManager.getSubscription();
  const requiredKey=await currentVapidKey();
  const actualKey=existing?.options?.applicationServerKey;
  const sameKey=actualKey&&actualKey.byteLength===requiredKey.length&&Array.from(new Uint8Array(actualKey)).every((value,index)=>value===requiredKey[index]);
  if(existing&&!sameKey){
   // Older LinkBook installs used a different public key. Re-subscribe by user choice.
   const formerEndpoint=existing.endpoint;
   await existing.unsubscribe();
   const cleanup=await db.from('push_subscriptions').delete().eq('user_id',user.id).eq('endpoint',formerEndpoint);
   if(cleanup.error)console.warn('Old push endpoint cleanup failed:',cleanup.error.message);
   existing=null;
  }
  const subscription=existing||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:requiredKey});
  const json=subscription.toJSON();
  if(!json?.keys?.p256dh||!json?.keys?.auth)throw Error('Push subscription keys could not be created.');
  const {error}=await db.from('push_subscriptions').upsert({
   user_id:user.id,endpoint:subscription.endpoint,p256dh:json.keys.p256dh,auth_key:json.keys.auth,updated_at:new Date().toISOString()
  },{onConflict:'endpoint'});
  if(error)throw error;
  notice?.('Device subscription saved. Use Send background test to check delivery.');
 }catch(error){notice?.('Could not enable push: '+(error?.message||'Please retry.'),true);}
 finally{processing=false;refreshLabel();}
}
async function disable(){
 if(!available()||processing)return;
 processing=true;refreshLabel();
 try{
  const reg=await registration(),subscription=await reg.pushManager.getSubscription();
  if(subscription){
   const {error}=await db.from('push_subscriptions').delete().eq('user_id',user.id).eq('endpoint',subscription.endpoint);
   if(error)throw error;
   await subscription.unsubscribe();
  }
  notice?.('Push subscription disabled on this device.');
 }catch(error){notice?.('Could not disable device alerts: '+(error?.message||'Retry.'),true);}
 finally{processing=false;refreshLabel();}
}
async function test(){
 if(!available()||Notification.permission!=='granted'){notice?.('Enable notifications first.',true);return;}
 try{
  const reg=await registration();
  await reg.showNotification('LinkBook test notification',{body:'This confirms notifications can appear on this device.',icon:'./icon.svg',tag:'linkbook-device-test',data:{url:'/linkbook/'}});
  notice?.('Test notification sent to this device.');
 }catch(error){notice?.('Test failed: '+(error?.message||'Check device permissions.'),true);}
}
async function backgroundTest(){
 if(!available()||processing)return;
 processing=true;refreshLabel();
 try{
  if(Notification.permission!=='granted')throw Error('First tap Enable device alerts and grant permission.');
  const reg=await registration();
  if(!await reg.pushManager.getSubscription())throw Error('First tap Enable device alerts to register this device.');
  const {data,error}=await db.functions.invoke('linkbook-push-dispatch',{body:{kind:'self_test'}});
  if(error)throw Error(error.message||'Background sender unavailable');
  if(!data?.accepted||!data?.sent)throw Error(data?.error||'No push accepted; check server setup and device subscription.');
  notice?.('Background push accepted by server. Close LinkBook and check whether a phone alert appears.');
 }catch(error){notice?.('Background push test failed: '+(error?.message||'Please retry.'),true);}
 finally{processing=false;refreshLabel();}
}
function onNotification(item){
 if(!available()||Notification.permission!=='granted'||!item?.id||item.recipient_id!==user?.id)return;
 registration().then(reg=>reg.showNotification('New LinkBook notification',{
  body:'Open LinkBook to see your update.',icon:'./icon.svg',tag:'linkbook-'+item.id,
  data:{url:'/linkbook/'}
 })).catch(error=>console.warn('Local notification unavailable:',error?.message||error));
}
function init(config){
 db=config.db;user=config.user;notice=config.notice;
 document.addEventListener('click',event=>{
  const command=event.target.closest('[data-push-action]')?.dataset.pushAction;
  if(!command)return;
  event.preventDefault();
  if(command==='enable')enable();
  else if(command==='disable')disable();
  else if(command==='test')test();
  else if(command==='background-test')backgroundTest();
 });
}
function controls(){
 return '<section class="panel lb-push-panel"><h3>🔔 Device notifications (beta)</h3><p>Get notifications on this device for LinkBook activity. You can choose whether to allow alerts. Background push delivery is in beta. Device registration and a real background test are required before relying on alerts.</p>'+
 '<div class="lb-push-actions"><button type="button" data-push-action="enable" id="lb-push-enable">Enable device alerts</button><button type="button" data-push-action="test">Test on this screen</button><button type="button" data-push-action="background-test">Send background test</button><button type="button" data-push-action="disable" id="lb-push-disable">Disable on this device</button></div>'+
 '<p class="lb-push-detail" id="lb-push-status" role="status">'+label()+'</p></section>';
}
window.LinkBookDeviceAlerts={init,controls,onNotification};
})();