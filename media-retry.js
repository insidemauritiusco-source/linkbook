/* LinkBook: bounded network retries; safe to test without a browser. */
(function(root){
'use strict';
function retryable(error){
 const status=Number(error?.status||error?.statusCode||error?.originalError?.status||0);
 if([408,425,429,500,502,503,504].includes(status))return true;
 if(status && ![0].includes(status))return false;
 const message=String(error?.message||error||'').toLowerCase();
 return /failed to fetch|network|timeout|timed out|connection|load failed|fetch failed|networkerror|aborterror/.test(message);
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function run(operation,options={}){
 const attempts=Math.max(1,Math.min(4,options.attempts||3));
 for(let attempt=1;attempt<=attempts;attempt++){
  try{return await operation(attempt);}
  catch(error){
   if(!retryable(error))throw error;
   if(options.verify && await options.verify(error))return {recovered:true};
   if(attempt===attempts)throw error;
   options.onRetry?.(attempt,attempts,error);
   await (options.pause||pause)(Math.min(6000,750*2**(attempt-1)));
  }
 }
}
const api={retryable,run};
root.LinkBookMediaRetry=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
