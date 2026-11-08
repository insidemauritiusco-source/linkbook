/* LinkBook: Supabase accounts + cloud-backed social experience. */
const cfg = window.LINKBOOK_AUTH || {};
const enabled = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(cfg.url || '') && /^(sb_publishable_|eyJ)/.test(cfg.publishableKey || '');
const root = document.getElementById('authRoot');
let client, mode='login', loaded=false, recovery=false;
let pendingPhone='', phoneOtpSentAt=0;
let authServices=null,authServicesError='';
function updateLoginReadiness(){
  const status=root.querySelector('#authProviderReadiness');
  if(status){
    if(authServicesError)status.textContent='Google / SMS configuration could not be checked. You can still try email sign-in.';
    else if(!authServices)status.textContent='Checking available sign-in methods…';
    else status.textContent='Google: '+(authServices.google?'enabled — complete a Google login to test':'not enabled')+
      ' · Phone SMS: '+(authServices.phone?'configured — test SMS delivery':'not configured');
  }
  const google=root.querySelector('#authGoogle');
  if(google&&authServices&&!authServices.google){
    google.disabled=true;google.title='Google login needs to be enabled in Supabase Authentication';
  }
  const phone=root.querySelector('[data-auth-mode="phone"]');
  if(phone&&authServices&&!authServices.phone){
    phone.disabled=true;phone.title='Phone login requires an enabled SMS provider in Supabase';
  }
  const send=root.querySelector('#authPhoneForm button[type="submit"]');
  if(send&&mode==='phone'&&authServices&&!authServices.phone){
    send.disabled=true;send.title='SMS login is not configured in Supabase';
  }
}
async function checkAuthProviderSettings(){
  try{
    const response=await fetch(cfg.url+'/auth/v1/settings',{
      headers:{apikey:cfg.publishableKey},cache:'no-store'
    });
    if(!response.ok)throw Error('Provider configuration unavailable');
    const settings=await response.json();
    const provider=String(settings.sms_provider||'').toLowerCase();
    authServices={
      google:settings.external?.google===true,
      phone:settings.external?.phone===true && provider!=='' && provider!=='none' && provider!=='disabled'
    };
    authServicesError='';
  }catch(err){
    authServicesError='unavailable';
    console.warn('Could not check login provider settings:',err?.message||'Network issue');
  }
  updateLoginReadiness();
}
if(!enabled) {
  document.documentElement.classList.remove('auth-locked');
  loadApp();
} else {
  document.documentElement.classList.add('auth-locked');
  root.hidden=false; draw();
  start().catch(err => notice('Unable to start login: '+(err.message||'Check settings.'),true));
}
function loadApp(){
  if(loaded)return;
  loaded=true;
  const s=document.createElement('script');
  s.src=window.linkbookSignedInUser && window.linkbookSupabase ? 'app-cloud.js' : 'app.js';
  s.onerror=()=>alert('LinkBook could not load. Please refresh.');
  document.body.appendChild(s);
}
function draw(message='',error=false){
  if(mode==='phone'||mode==='phone-code'){drawPhone(message,error);return;}
  const headings={login:'Welcome to LinkBook',signup:'Join LinkBook',forgot:'Reset your password',recover:'Choose a new password'};
  const explanations={login:'Sign in to continue.',signup:'Create your free LinkBook account.',forgot:'Get a secure password reset email.',recover:'Choose a secure new password.'};
  const signup=mode==='signup',forgot=mode==='forgot',reset=mode==='recover';
  root.innerHTML=
    '<div class="auth-card"><div class="auth-intro"><div class="auth-mark">L</div><h1>'+headings[mode]+'</h1><p>'+explanations[mode]+'</p></div>'+
    '<p id="authStatus" class="auth-status" role="status" aria-live="polite" hidden></p>'+
    '<form id="authForm" class="auth-form">'+
    (signup?'<label for="authName">Your name</label><input id="authName" name="display_name" autocomplete="name" maxlength="70" required placeholder="Full name">':'')+
    (!reset?'<label for="authEmail">Email address</label><input id="authEmail" name="email" type="email" autocomplete="email" required placeholder="you@example.com">':'')+
    (!forgot?'<label for="authPass">'+(reset?'New password':'Password')+'</label><input id="authPass" type="password" name="password" required minlength="8" maxlength="128" autocomplete="'+(signup||reset?'new-password':'current-password')+'" placeholder="At least 8 characters">':'')+
    (signup||reset?'<label for="authConfirm">Confirm password</label><input id="authConfirm" type="password" name="confirm" minlength="8" maxlength="128" required autocomplete="new-password" placeholder="Repeat password">':'')+
    '<button class="auth-submit" id="authSubmit" type="submit">'+(signup?'Create account':forgot?'Email reset link':reset?'Update password':'Sign in')+'</button></form>'+
    '<div class="auth-switch">'+(signup?'Already registered? <button type="button" data-auth-mode="login">Sign in</button>':forgot?'<button type="button" data-auth-mode="login">Back to sign in</button>':reset?'':'New to LinkBook? <button type="button" data-auth-mode="signup">Create account</button>')+'</div>'+
    (mode==='login'?'<button type="button" class="auth-forgot" data-auth-mode="forgot">Forgot password?</button>':'')+
    (mode==='login'||mode==='signup'?'<div class="auth-phone-option"><span>or</span><button type="button" class="auth-phone-button" data-auth-mode="phone">📱 Continue with phone number</button></div>':'')+
    (mode==='login'||mode==='signup'?'<button type="button" class="auth-google-button" id="authGoogle"><span class="auth-google-mark" aria-hidden="true">G</span> Continue with Google</button>':'')+
    (mode==='login'||mode==='signup'?'<p id="authProviderReadiness" class="auth-footnote" role="status" aria-live="polite">Checking available sign-in methods…</p>':'')+
    '<button type="button" class="auth-demo" id="authDemo">Continue with the free demo</button>'+
    '<p class="auth-footnote">Accounts use secure Supabase authentication. Signed-in posts, likes and messages sync through a secure cloud database. Free demo mode remains local to this browser. LinkBook is in public beta. Please review our <a href="privacy.html">Privacy Notice</a> and <a href="terms.html">Community Rules</a> before registering.</p></div>';
  root.querySelector('form').addEventListener('submit',submit);
  root.querySelector('#authGoogle')?.addEventListener('click',signInWithGoogle);
  root.querySelectorAll('[data-auth-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.authMode;draw()}));
  root.querySelector('#authDemo').addEventListener('click',()=>{
    window.linkbookSignedInUser=null;
    window.linkbookSupabase=null;
    root.hidden=true;
    document.documentElement.classList.remove('auth-locked');
    loadApp();
  });
  updateLoginReadiness();
  if(message)notice(message,error);
}

function normalizePhone(value){
  const clean=String(value||'').trim().replace(/[\s().-]/g,'');
  if(!/^\+?\d+$/.test(clean))throw Error('Enter a valid phone number using digits and a country code.');
  let phone=clean;
  if(/^\d{8}$/.test(phone))phone='+230'+phone;
  else if(phone.startsWith('00'))phone='+'+phone.slice(2);
  else if(!phone.startsWith('+'))throw Error('Include your country code, for example +230 for Mauritius.');
  if(!/^\+[1-9]\d{6,14}$/.test(phone))throw Error('Use an international phone number, such as +230 5xxxxxxx.');
  return phone;
}
function phoneError(error){
  const message=String(error?.message||error||'Phone verification failed.');
  if(/sms.*(disabled|provider|not configured)|phone provider.*disabled|unsupported.*phone|provider.*not enabled|sms provider/i.test(message))
    return 'Phone sign-in needs an SMS provider enabled in LinkBook Supabase Auth settings. Email sign-in still works.';
  if(/rate limit|too many|429/i.test(message))return 'Too many verification requests. Please wait before trying again.';
  return message;
}
function drawPhone(message='',error=false){
  const verify=mode==='phone-code';
  root.innerHTML=
    '<div class="auth-card"><div class="auth-intro"><div class="auth-mark">L</div>'+
    '<h1>'+(verify?'Verify your phone':'Phone number login')+'</h1>'+
    '<p>'+(verify?'Enter the SMS verification code sent to your phone.':'Sign in or create an account with an SMS code.')+'</p></div>'+
    '<p id="authStatus" class="auth-status" role="status" aria-live="polite" hidden></p>'+
    '<form id="authPhoneForm" class="auth-form">'+
    (verify?
      '<p class="auth-phone-target">Code sent to <strong>'+pendingPhone.replace(/[&<>"]/g,'')+'</strong></p>'+
      '<label for="authOtp">Verification code</label><input id="authOtp" name="token" type="text" inputmode="numeric" pattern="[0-9]{6,8}" minlength="6" maxlength="8" autocomplete="one-time-code" required placeholder="Enter SMS code">'+
      '<button class="auth-submit" type="submit">Verify and sign in</button>':
      '<label for="authPhoneNumber">Mobile phone number</label>'+
      '<input id="authPhoneNumber" name="phone" type="tel" autocomplete="tel" inputmode="tel" required maxlength="25" placeholder="+230 5xxxxxxx" aria-describedby="authPhoneHint">'+
      '<p id="authPhoneHint" class="auth-phone-hint">For Mauritius, enter 8 digits or add +230. Other countries: include +country code.</p>'+
      '<button class="auth-submit" type="submit">Send verification code</button>')+
    '</form>'+
    (verify?'<button type="button" class="auth-phone-text-button" id="authResendPhone">Resend SMS code</button>'+
      '<button type="button" class="auth-phone-text-button" id="authChangePhone">Change phone number</button>':'')+
    '<div class="auth-switch">Prefer email? <button type="button" data-auth-mode="login">Email and password login</button></div>'+ 
    '<button type="button" class="auth-google-button" id="authGoogle"><span class="auth-google-mark" aria-hidden="true">G</span> Continue with Google</button>'+
    '<p id="authProviderReadiness" class="auth-footnote" role="status" aria-live="polite">Checking available sign-in methods…</p>'+
    '<p class="auth-footnote">SMS delivery requires an enabled provider and may incur charges. Phone login may create a separate account from an existing email account; sign in with email to keep your previous posts.</p></div>';
  root.querySelector('#authPhoneForm').addEventListener('submit',submitPhone);
  root.querySelector('#authGoogle')?.addEventListener('click',signInWithGoogle);
  root.querySelector('[data-auth-mode="login"]').addEventListener('click',()=>{mode='login';draw()});
  root.querySelector('#authChangePhone')?.addEventListener('click',()=>{mode='phone';pendingPhone='';draw()});
  root.querySelector('#authResendPhone')?.addEventListener('click',()=>sendPhoneCode(pendingPhone,true));
  updateLoginReadiness();
  if(message)notice(message,error);
}
async function sendPhoneCode(phone,resend=false){
  if(authServices&&!authServices.phone){notice('Phone SMS login is not enabled in Supabase yet. Please use email sign-in.',true);return;}
  if(!client){notice('Authentication is loading. Please try again.',true);return;}
  if(Date.now()-phoneOtpSentAt<60000){
    const seconds=Math.ceil((60000-(Date.now()-phoneOtpSentAt))/1000);
    notice('For security, wait '+seconds+' seconds before requesting another code.',true);return;
  }
  const form=root.querySelector('#authPhoneForm');
  const button=resend?root.querySelector('#authResendPhone'):form?.querySelector('button[type="submit"]');
  const prior=button?.textContent;
  if(button){button.disabled=true;button.textContent='Sending…';}
  try{
    const {error}=await client.auth.signInWithOtp({phone,options:{channel:'sms'}});
    if(error)throw error;
    pendingPhone=phone;phoneOtpSentAt=Date.now();mode='phone-code';
    draw('Verification code requested. Check your SMS messages.');
  }catch(error){notice(phoneError(error),true);}
  finally{if(button?.isConnected){button.disabled=false;button.textContent=prior;}}
}
async function submitPhone(event){
  event.preventDefault();
  const form=event.currentTarget;
  if(mode==='phone'){
    let phone;
    try{phone=normalizePhone(new FormData(form).get('phone'));}
    catch(error){notice(error.message,true);return;}
    await sendPhoneCode(phone);return;
  }
  if(mode!=='phone-code'||!pendingPhone)return;
  if(!client){notice('Authentication is loading. Please try again.',true);return;}
  const token=String(new FormData(form).get('token')||'').trim();
  if(!/^\d{6,8}$/.test(token)){notice('Enter the numeric SMS verification code.',true);return;}
  const button=form.querySelector('button[type="submit"]');
  button.disabled=true;const oldLabel=button.textContent;button.textContent='Verifying…';
  try{
    const {data,error}=await client.auth.verifyOtp({phone:pendingPhone,token,type:'sms'});
    if(error)throw error;
    if(!data?.user)throw Error('Unable to sign in. Please request a new code.');
    enter(data.user);
  }catch(error){notice(phoneError(error),true);}
  finally{if(button.isConnected){button.disabled=false;button.textContent=oldLabel;}}
}

async function signInWithGoogle(){
  if(authServices&&!authServices.google){notice('Google login is not enabled in Supabase yet. Please use email sign-in.',true);return;}
  if(!client){notice('Sign-in is loading. Please try again.',true);return;}
  const button=root.querySelector('#authGoogle');
  if(!button)return;
  button.disabled=true;
  const original=button.innerHTML;
  button.textContent='Connecting to Google…';
  try{
    // Hosted GitHub Pages app: the provider returns to this exact project path.
    const redirectTo=location.origin+location.pathname;
    const {error}=await client.auth.signInWithOAuth({
      provider:'google',
      options:{redirectTo}
    });
    if(error)throw error;
    // A successful browser OAuth attempt navigates to Google.
  }catch(err){
    notice('Google sign-in could not start. The Google provider must be enabled in LinkBook Supabase. '+(err.message||''),true);
    if(button.isConnected){button.disabled=false;button.innerHTML=original;}
  }
}
function notice(text,error=false){
  const el=root.querySelector('#authStatus');
  if(!el)return;
  el.textContent=text;el.hidden=false;el.classList.toggle('error',error);
}
async function start(){
  const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm');
  client=createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'linkbook-auth-session'}});
  window.linkbookClient=client;
  checkAuthProviderSettings();
  client.auth.onAuthStateChange((event,session)=>{
    if(event==='PASSWORD_RECOVERY'){
      recovery=true;mode='recover';document.documentElement.classList.add('auth-locked');root.hidden=false;draw();
    }else if(event==='SIGNED_OUT'){
      window.linkbookSignedInUser=null;
      document.documentElement.classList.add('auth-locked');root.hidden=false;
      recovery=false;mode='login';draw();
    }else if(event==='SIGNED_IN'&&session?.user&&!recovery)queueMicrotask(()=>enter(session.user));
  });
  const {data,error}=await client.auth.getSession();
  if(error)throw error;
  if(data.session?.user&&!recovery)enter(data.session.user);
}
function enter(user){
  if(!user||recovery)return;
  if(loaded && window.linkbookSignedInUser?.id !== user.id){location.reload();return;}
  window.linkbookSignedInUser=user;
  window.linkbookSupabase=client;
  root.hidden=true;document.documentElement.classList.remove('auth-locked');
  loadApp();
  if(!document.getElementById('linkbookSignout')){
    const btn=document.createElement('button');
    btn.id='linkbookSignout';btn.className='signout-button';btn.textContent='Sign out';
    btn.addEventListener('click',async()=>{
      btn.disabled=true;
      try{const {error}=await client.auth.signOut();if(error)throw error;location.reload()}
      catch(err){btn.disabled=false;alert(err.message||'Could not sign out.')}
    });
    document.querySelector('.header-actions')?.prepend(btn);
  }
  const note=document.querySelector('.note small');
  if(note)note.textContent='LinkBook Pro connects your posts, friendships and messages online.';
}
async function submit(e){
  e.preventDefault();
  const form=e.currentTarget,d=new FormData(form);
  const email=String(d.get('email')||'').trim().toLowerCase();
  const password=String(d.get('password')||'');
  const confirmation=String(d.get('confirm')||'');
  if((mode==='signup'||mode==='recover')&&password!==confirmation){notice('Passwords do not match.',true);return;}
  if(mode!=='forgot'&&password.length<8){notice('Use a password of at least 8 characters.',true);return;}
  const btn=form.querySelector('button[type="submit"]'),label=btn.textContent;
  btn.disabled=true;btn.textContent='Please wait…';
  try{
    let result;
    const redirectTo=location.origin+location.pathname;
    if(mode==='signup'){
      const name=String(d.get('display_name')||'').trim();
      if(!name){notice('Please enter your name.',true);return;}
      result=await client.auth.signUp({email,password,options:{data:{display_name:name},emailRedirectTo:redirectTo}});
      if(result.error)throw result.error;
      if(result.data.session?.user)enter(result.data.user);
      else{notice('Please check your email and follow the confirmation link, then sign in.');form.reset();}
    }else if(mode==='login'){
      result=await client.auth.signInWithPassword({email,password});
      if(result.error)throw result.error;
      enter(result.data.user);
    }else if(mode==='forgot'){
      result=await client.auth.resetPasswordForEmail(email,{redirectTo});
      if(result.error)throw result.error;
      notice('If the email exists, a reset link will arrive in your inbox.');
      form.reset();
    }else{
      result=await client.auth.updateUser({password});
      if(result.error)throw result.error;
      recovery=false;
      const {data}=await client.auth.getUser();
      if(data.user)enter(data.user);
    }
  }catch(err){notice(err.message||'Unable to complete this request.',true)}
  finally{if(btn.isConnected){btn.disabled=false;btn.textContent=label;}}
}
