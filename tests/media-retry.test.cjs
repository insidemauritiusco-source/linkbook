const test=require('node:test'), assert=require('node:assert/strict');
const {retryable,run}=require('../media-retry.js');
test('retries temporary fetch errors',async()=>{
 let n=0; const result=await run(async()=>{if(++n<3)throw Error('Failed to fetch');return 'saved';},{pause:async()=>{}});
 assert.equal(result,'saved');assert.equal(n,3);
});
test('does not retry permission errors',async()=>{
 let n=0;await assert.rejects(()=>run(async()=>{n++;throw Object.assign(Error('Forbidden'),{status:403});},{pause:async()=>{}}),/Forbidden/);assert.equal(n,1);
});
test('checks server state before retrying ambiguous result',async()=>{
 let n=0;const result=await run(async()=>{n++;throw Error('Failed to fetch');},{verify:async()=>true,pause:async()=>{}});
 assert.deepEqual(result,{recovered:true});assert.equal(n,1);
});
test('does not treat 409 conflicts as transient',()=>assert.equal(retryable({status:409,message:'duplicate'}),false));
test('enforces retry limit',async()=>{
 let n=0;await assert.rejects(()=>run(async()=>{n++;throw Error('Failed to fetch');},{pause:async()=>{}}),/Failed to fetch/);assert.equal(n,3);
});
