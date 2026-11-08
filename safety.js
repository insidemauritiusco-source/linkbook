/* LinkBook member safety, data export and moderator tools. Requires signed-in Supabase client. */
(() => {
  'use strict';
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let renderGeneration = 0;
  function formatTime(s){try{return new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Indian/Mauritius'}).format(new Date(s));}catch{return '';}}
  function panel(s){return '<section class="panel">'+s+'</section>';}
  function errorText(e){return String(e?.message||e||'Please try again.');}
  async function read(q){const {data,error}=await q;if(error)throw error;return data||[];}
  function showError(root,e){const box=root.querySelector('#safetyMessage');if(box){box.textContent=errorText(e);box.hidden=false;}}
  function download(content,name){
    const blob=new Blob([JSON.stringify(content,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function render(root,db,user){
    const generation=++renderGeneration;
    root.innerHTML='<h1 class="page-title">Safety & privacy</h1>'+panel('<p>Loading your privacy and safety settings…</p>');
    try{
      const [blocks,people,ownReports,roleResult] = await Promise.all([
        read(db.from('user_blocks').select('blocked_id,created_at').eq('blocker_id',user.id).order('created_at',{ascending:false})),
        read(db.from('profiles').select('id,display_name').neq('id',user.id).limit(200)),
        read(db.from('reports').select('id,post_id,reason,status,created_at').eq('reporter_id',user.id).order('created_at',{ascending:false}).limit(50)),
        db.from('moderator_roles').select('role').eq('user_id',user.id).maybeSingle()
      ]);
      if(roleResult.error)throw roleResult.error;
      let moderation=[];
      if(roleResult.data?.role) moderation=await read(db.from('reports').select('id,post_id,reason,status,reporter_id,created_at,moderator_note').order('created_at',{ascending:false}).limit(150));
      if(generation!==renderGeneration || !root.isConnected)return;
      const blockedSet=new Set(blocks.map(x=>x.blocked_id));
      const options=people.filter(p=>!blockedSet.has(p.id)).map(p=>'<option value="'+escapeHtml(p.id)+'">'+escapeHtml(p.display_name||'Member')+'</option>').join('');
      const blockList=blocks.map(row=>'<div class="member"><div class="member-info"><strong>Blocked member</strong><small>'+escapeHtml(row.blocked_id.slice(0,8))+'… · '+escapeHtml(formatTime(row.created_at))+'</small></div><button type="button" class="secondary" data-unblock="'+escapeHtml(row.blocked_id)+'">Unblock</button></div>').join('')||'<p>No blocked accounts.</p>';
      const reports=ownReports.map(r=>'<div class="member"><div class="member-info"><b>'+escapeHtml(r.status)+'</b><small>'+escapeHtml(r.reason)+' · '+escapeHtml(formatTime(r.created_at))+'</small></div></div>').join('')||'<p>You have not submitted a report.</p>';
      const queue=moderation.filter(r=>r.status==='open'||r.status==='reviewing').map(r=>
        '<article class="safety-report"><b>'+escapeHtml(r.reason)+'</b><small>'+escapeHtml(formatTime(r.created_at))+' · '+escapeHtml(r.status)+'</small>'+
        '<form data-moderate="'+escapeHtml(r.id)+'"><textarea class="form-input" name="moderator_note" maxlength="2000" placeholder="Internal review notes (optional)">'+escapeHtml(r.moderator_note||'')+'</textarea><div class="safety-actions"><button type="submit" class="secondary" name="decision" value="reviewing">Review</button><button type="submit" class="primary" name="decision" value="resolved">Resolve</button><button type="submit" class="secondary" name="decision" value="dismissed">Dismiss</button>'+
        (r.post_id?'<button class="secondary" type="button" data-remove-reported="'+escapeHtml(r.post_id)+'" data-report-id="'+escapeHtml(r.id)+'">Remove reported post</button>':'')+
        '</div></form></article>').join('')||'<p>No unresolved reports.</p>';
      root.innerHTML='<h1 class="page-title">Safety & privacy</h1><p id="safetyMessage" class="lb-safety-status" role="status" hidden></p>'+
        panel('<h3>Block an account</h3><p>Blocking prevents new messages and friend requests in both directions, and hides each other’s posts and profiles.</p><form id="safetyBlock" class="safety-actions"><select class="form-input" name="blocked_id" required aria-label="Member to block"><option value="">Select a member</option>'+options+'</select><button class="primary" type="submit" '+(!options?'disabled':'')+'>Block member</button></form><h3>Blocked accounts</h3>'+blockList)+
        panel('<h3>Your reports</h3><p>Report an inappropriate post using the flag next to it in the feed. Reports are reviewed by authorized moderators.</p>'+reports)+
        panel('<h3>Your data & account</h3><p>Export your own posts, comments, messages and profile. To permanently delete your account, use the protected deletion flow. This removes your account and associated content and cannot be undone.</p><div class="safety-actions"><button class="secondary" id="safetyExport">Download my data</button><button class="safety-danger" id="safetyDelete">Permanently delete my account</button></div><p class="muted">Media you uploaded is included as URLs in exports; download copies of your photos/videos separately before deleting your account.</p><p><a href="privacy.html">Privacy policy</a> · <a href="terms.html">Community rules</a></p>')+
        (roleResult.data?.role?panel('<h3>Moderator dashboard</h3><p>Role: '+escapeHtml(roleResult.data.role)+'. The report queue is private to moderators. Review carefully before deleting content.</p>'+queue):'');
      root.querySelector('#safetyBlock').addEventListener('submit',async e=>{
        e.preventDefault();const id=new FormData(e.target).get('blocked_id');if(!id||!confirm('Block this member?'))return;
        try{const {error}=await db.from('user_blocks').insert({blocker_id:user.id,blocked_id:id});if(error)throw error;await render(root,db,user);}catch(err){showError(root,err);}
      });
      root.querySelectorAll('[data-unblock]').forEach(b=>b.addEventListener('click',async()=>{
        if(!confirm('Unblock this member?'))return;
        try{const {error}=await db.from('user_blocks').delete().eq('blocker_id',user.id).eq('blocked_id',b.dataset.unblock);if(error)throw error;await render(root,db,user);}catch(err){showError(root,err);}
      }));
      root.querySelector('#safetyExport').addEventListener('click',async ()=>{
        const button=root.querySelector('#safetyExport');button.disabled=true;
        try{
          const own=async(table,query)=>read(query);
          const [profile,posts,comments,messages,friendships,saved,notifications,reports]=await Promise.all([
            own('profiles',db.from('profiles').select('*').eq('id',user.id)),
            own('posts',db.from('posts').select('*').eq('author_id',user.id).limit(1000)),
            own('comments',db.from('comments').select('*').eq('author_id',user.id).limit(1000)),
            own('messages',db.from('messages').select('*').or('sender_id.eq.'+user.id+',recipient_id.eq.'+user.id).limit(2000)),
            own('friendships',db.from('friendships').select('*').or('requester_id.eq.'+user.id+',addressee_id.eq.'+user.id).limit(1000)),
            own('saved_posts',db.from('saved_posts').select('*').eq('user_id',user.id).limit(1000)),
            own('notifications',db.from('notifications').select('*').eq('recipient_id',user.id).limit(1000)),
            own('reports',db.from('reports').select('id,post_id,reason,status,created_at').eq('reporter_id',user.id).limit(1000))
          ]);
          download({exported_at:new Date().toISOString(),profile,posts,comments,messages,friendships,saved,notifications,reports},'linkbook-my-data.json');
        }catch(err){showError(root,err);}finally{if(button.isConnected)button.disabled=false;}
      });
      root.querySelector('#safetyDelete').addEventListener('click',async()=>{
        const typed=prompt('This permanently deletes your LinkBook account, posts and messages. Type DELETE MY ACCOUNT to proceed.');
        if(typed!=='DELETE MY ACCOUNT')return;
        if(!confirm('Final confirmation: permanently delete your LinkBook account? This cannot be undone.'))return;
        const button=root.querySelector('#safetyDelete');button.disabled=true;
        try{
          const {data,error}=await db.functions.invoke('linkbook-delete-account',{body:{confirmation:'DELETE MY ACCOUNT'}});
          if(error)throw error;
          if(data?.message!=='Your LinkBook account was deleted.')throw Error(data?.message||'Deletion was not confirmed.');
          await db.auth.signOut();
          location.replace(location.pathname);
        }catch(err){showError(root,err);if(button.isConnected)button.disabled=false;}
      });
      root.querySelectorAll('form[data-moderate]').forEach(form=>form.addEventListener('submit',async e=>{
        e.preventDefault();const clicked=e.submitter,decision=clicked?.value;
        if(!['reviewing','resolved','dismissed'].includes(decision))return;
        try{
          const {error}=await db.from('reports').update({status:decision,moderator_note:new FormData(form).get('moderator_note')||''}).eq('id',form.dataset.moderate);
          if(error)throw error;await render(root,db,user);
        }catch(err){showError(root,err);}
      }));
      root.querySelectorAll('[data-remove-reported]').forEach(button=>button.addEventListener('click',async ()=>{
        if(!confirm('Remove the reported post permanently?'))return;
        try{
          const {error}=await db.from('posts').delete().eq('id',button.dataset.removeReported);
          if(error)throw error;
          const {error:reportError}=await db.from('reports').update({status:'resolved',moderator_note:'Post removed by moderator.'}).eq('id',button.dataset.reportId);
          if(reportError)throw reportError;
          await render(root,db,user);
        }catch(err){showError(root,err);}
      }));
    }catch(e){if(generation===renderGeneration)root.innerHTML='<h1 class="page-title">Safety & privacy</h1>'+panel('<p role="alert">Unable to load safety settings: '+escapeHtml(errorText(e))+'</p><button class="secondary" id="safetyRetry">Retry</button>');root.querySelector('#safetyRetry')?.addEventListener('click',()=>render(root,db,user));}
  }
  window.LinkBookSafety={render};
})();