/* LinkBook Storage transport. Diagnostics never include credentials or file paths. */
(function(root){
'use strict';
function storageHost(projectUrl){
 const match=/^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/.exec(projectUrl||'');
 if(!match)throw Error('Invalid Supabase project URL');
 return match[1]+'.storage.supabase.co';
}
function objectUrl(projectUrl,bucket,path){
 if(!/^[a-z0-9-]+$/.test(bucket)||!path||path.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('Invalid storage object path');
 return 'https://'+storageHost(projectUrl)+'/storage/v1/object/'+bucket+'/'+path.split('/').map(encodeURIComponent).join('/');
}
function issue(error,route){
 const status=Number(error?.status||error?.statusCode||0);
 const network=!!error?.network||(!status&&/failed to fetch|network|connection|load failed|timeout|abort/i.test(String(error?.message||error)));
 const kind=network?'network':status===401||status===403?'authentication':status===413?'size':status>=500?'server':status?'http':'unknown';
 return {route,kind,status:status||null,code:network?'LB-UPLOAD-NET':status?'LB-UPLOAD-HTTP-'+status:'LB-UPLOAD-UNKNOWN'};
}
function diagnostic(error,route){
 const info=issue(error,route);
 const hint=info.kind==='network'?'The browser could not complete the request (network or CORS restriction is possible).':
 info.kind==='authentication'?'Check your LinkBook session and storage permissions.':'The storage server rejected the request.';
 return info.code+' ('+route+'). '+hint+' Your selected file is retained.';
}
async function directUpload({projectUrl,apiKey,session,file,bucket='linkbook-media',path,fetchImpl}){
 if(!apiKey||!session?.access_token)throw Error('Please sign in again before uploading.');
 if(!session.user?.id||path.split('/')[0]!==session.user.id)throw Error('Invalid upload owner.');
 const endpoint=objectUrl(projectUrl,bucket,path);
 let response;
 try{
  response=await (fetchImpl||fetch)(endpoint,{method:'POST',mode:'cors',credentials:'omit',redirect:'error',cache:'no-store',
   headers:{apikey:apiKey,Authorization:'Bearer '+session.access_token,'Content-Type':file.type||'application/octet-stream','cache-control':'3600'},body:file});
 }catch(cause){
  const err=new Error('Direct storage request failed');err.network=true;err.route='direct-storage';err.cause=cause;throw err;
 }
 if(!response.ok){
  const err=new Error('Storage returned HTTP '+response.status);err.status=response.status;err.route='direct-storage';throw err;
 }
 return {route:'direct-storage',status:response.status};
}
const api={storageHost,objectUrl,issue,diagnostic,directUpload};
root.LinkBookStorageTransport=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
