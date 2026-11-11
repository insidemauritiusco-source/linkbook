/* LinkBook device alerts: permission and push subscription, opt-in only. */
(() => {
'use strict';
const PUBLIC_VAPID_KEY='BNl_fm05sThO2DMGI3c4pVXHWlZ0n9NdW41QDE_1ib6lvpYdtrogVQzjmMwkwcqAtHTQHUSXU5aEF7RNBDCoIGQ';
let db,user,notice;
let processing=false,ready=false;
function available(){return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;}
function decode(value){
 const padded=value+'='.repeat((4-value.length%4)%4);
 const binary=atob(padded.replace(/-/g,'+').replace(/_/g,'/'));
 return Uint8Array.from(binary,c=>c.charCodeAt(0));
}
function label(){
 if(!available())return 'This browser does not support secure push notifications.';
 if(Notification.permission==='denied')return 'Notifications are blocked. Enable them in Android/Chrome site settings.';
 if(Notification.permission==='granted')return 'Device alerts allowed. Background delivery still requires server activation and testing.';
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
  const existing=await reg.pushManager.getSubscription();
  const subscription=existing||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decode(PUBLIC_VAPID_KEY)});
  const json=subscription.toJSON();
  if(!json?.keys?.p256dh||!json?.keys?.auth)throw Error('Push subscription keys could not be created.');
  const {error}=await db.from('push_subscriptions').upsert({
   user_id:user.id,endpoint:subscription.endpoint,p256dh:json.keys.p256dh,auth_key:json.keys.auth,updated_at:new Date().toISOString()
  },{onConflict:'endpoint'});
  if(error)throw error;
  notice?.('Device registered. Notification delivery will start after server setup.');
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
function onNotification(item){
 if(!available()||Notification.permission!=='granted'||!item?.id||item.recipient_id!==user?.id)return;
 registration().then(reg=>reg.showNotification('New LinkBook notification',{
  body:'Open LinkBook to see your update.',icon:'./icon.svg',tag:'linkbook-'+item.id,
  data:{url:'/linkbook/'}
 })).catch(error=>console.warn('Local notification unavailable:',error?.message||error));
}
async function dispatch(){
 if(!db||!user)return;
 try{
  const {error}=await db.functions.invoke('linkbook-push-dispatch',{body:{kind:'recent'}});
  if(error)console.info('Background push not available yet:',error.message);
 }catch(error){console.info('Background push attempt pending configuration:',error?.message);}
}
function init(config){
 db=config.db;user=config.user;notice=config.notice;ready=true;
 document.addEventListener('click',event=>{
  const command=event.target.closest('[data-push-action]')?.dataset.pushAction;
  if(!command)return;
  event.preventDefault();
  if(command==='enable')enable();
  else if(command==='disable')disable();
  else if(command==='test')test();
 });
}
function controls(){
 return '<section class="panel lb-push-panel"><h3>🔔 Device notifications (beta)</h3><p>Get notifications on this device for LinkBook activity. You can choose whether to allow alerts. Background delivery is not active until server VAPID setup is completed.</p>'+
 '<div class="lb-push-actions"><button type="button" data-push-action="enable" id="lb-push-enable">Enable device alerts</button><button type="button" data-push-action="test">Send test alert</button><button type="button" data-push-action="disable" id="lb-push-disable">Disable on this device</button></div>'+
 '<p class="lb-push-detail" id="lb-push-status" role="status">'+label()+'</p></section>';
}
window.LinkBookDeviceAlerts={init,controls,onNotification,dispatch};
})();