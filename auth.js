/* LinkBook: Supabase accounts + cloud-backed social experience. */
const cfg = window.LINKBOOK_AUTH || {};
const enabled = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(cfg.url || '') && /^(sb_publishable_|eyJ)/.test(cfg.publishableKey || '');
const root = document.getElementById('authRoot');
let client, mode='login', loaded=false, recovery=false;
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
    '<button type="button" class="auth-demo" id="authDemo">Continue with the free demo</button>'+
    '<p class="auth-footnote">Accounts use secure Supabase authentication. Signed-in posts, likes and messages sync through a secure cloud database. Free demo mode remains local to this browser.</p></div>';
  root.querySelector('form').addEventListener('submit',submit);
  root.querySelectorAll('[data-auth-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.authMode;draw()}));
  root.querySelector('#authDemo').addEventListener('click',()=>{
    window.linkbookSignedInUser=null;
    window.linkbookSupabase=null;
    root.hidden=true;
    document.documentElement.classList.remove('auth-locked');
    loadApp();
  });
  if(message)notice(message,error);
}
function notice(text,error=false){
  const el=root.querySelector('#authStatus');
  if(!el)return;
  el.textContent=text;el.hidden=false;el.classList.toggle('error',error);
}
async function start(){
  const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm');
  client=createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'linkbook-auth-session'}});
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
