/* LinkBook device alerts: permission and push subscription, opt-in only. */
(() => {
'use strict';
// The matching public key is derived by the server from its private VAPID key.
async function serverPublicKey(){
 const origin=String(db?.supabaseUrl||'');
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(origin))throw Error('LinkBook server URL is invalid.');
 const response=await fetch(origin+'/functions/v1/linkbook-push-dispatch',{method:'GET',cache:'no-store',mode:'cors'});
 if(!response.ok)throw Error('Background push server unavailable (HTTP '+response.status+').');
 const result=await response.json();
 if(!result.ready||!result.background||!/^[A-Za-z0-9_-]{80,95}$/.test(result.publicKey))throw Error('Push signing key is not available yet.');
 return result.publicKey;
}
function keyMatches(subscription,keyBytes){
 const old=subscription?.options?.applicationServerKey;
 if(!old)return false;
 const bytes=new Uint8Array(old);
 return bytes.length===keyBytes.length && bytes.every((v,i)=>v===keyBytes[i]);
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
 if(Notification.permission==='granted')return 'Device permission allowed. Use Enable to renew your subscription, then test a background alert.';
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
  const signingKey=decode(await serverPublicKey());
  const reg=await registration();
  let existing=await reg.pushManager.getSubscription();
  if(existing&&!keyMatches(existing,signingKey)){
   // Previously registered endpoints used an obsolete signing key.
   // Remove only this signed-in user's old endpoint, then renew the browser subscription.
   const {error:removeError}=await db.from('push_subscriptions').delete().eq('user_id',user.id).eq('endpoint',existing.endpoint);
   if(removeError)throw removeError;
   const removed=await existing.unsubscribe();
   if(!removed)throw Error('Could not replace your old device registration. Try again.');
   existing=null;
  }
  const subscription=existing||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:signingKey});
  const json=subscription.toJSON();
  if(!json?.keys?.p256dh||!json?.keys?.auth)throw Error('Push subscription keys could not be created.');
  const {error}=await db.from('push_subscriptions').upsert({
   user_id:user.id,endpoint:subscription.endpoint,p256dh:json.keys.p256dh,auth_key:json.keys.auth,updated_at:new Date().toISOString()
  },{onConflict:'endpoint'});
  if(error)throw error;
  notice?.('Device registered with the current server signing key. Now test a background alert.');
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
 if(!available()||Notification.permission!=='granted'){notice?.('Enable device alerts first.',true);return;}
 if(processing)return;
 processing=true;refreshLabel();
 try{
  const reg=await registration();
  if(!await reg.pushManager.getSubscription())throw Error('No push subscription. Tap Enable device alerts first.');
  const {data,error}=await db.functions.invoke('linkbook-push-dispatch',{body:{kind:'test'}});
  if(error)throw error;
  if(data?.sent>0)notice?.('Server accepted '+data.sent+' push message(s). Check your Samsung notification panel.');
  else if(data?.error==='rate_limited_2_minutes')notice?.('Please retry the background test after two minutes.',true);
  else throw Error(data?.error||'No device accepted the push notification.');
 }catch(error){notice?.('Background test unsuccessful: '+(error?.message||'Please retry.'),true);}
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
 return '<section class="panel lb-push-panel"><h3>🔔 Device notifications (beta)</h3><p>Get notifications on this device for LinkBook activity. You can choose whether to allow alerts. Background delivery is connected to the secure server but still requires a successful end-to-end test on your device. If previously enabled, tap Enable again to renew your subscription.</p>'+
 '<div class="lb-push-actions"><button type="button" data-push-action="enable" id="lb-push-enable">Enable device alerts</button><button type="button" data-push-action="test">Send test alert</button><button type="button" data-push-action="background-test">Test background push</button><button type="button" data-push-action="disable" id="lb-push-disable">Disable on this device</button></div>'+
 '<p class="lb-push-detail" id="lb-push-status" role="status">'+label()+'</p></section>';
}
window.LinkBookDeviceAlerts={init,controls,onNotification};
})();