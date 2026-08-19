import{test}from'node:test';
import assert from'node:assert/strict';
import{fetchUpstreamContact}from'../functions/_lib/upstream-qso.js';

test('server-side upstream query uses contact role and first-party origin',async()=>{
  const calls=[];
  const fetchImpl=async(url,init)=>{
    calls.push({url:String(url),init});
    return new Response(JSON.stringify({station:'BA4THG',total:1,items:[]}),{status:200,headers:{'content-type':'application/json'}});
  };
  const result=await fetchUpstreamContact({callsign:'BA4VRM',page:1,limit:20,queryToken:'query-token',fetchImpl});
  assert.equal(result.ok,true);
  const request=new URL(calls[0].url);
  assert.equal(request.origin,'https://api.mzyyun.com');
  assert.equal(request.pathname,'/public/qso');
  assert.equal(request.searchParams.get('callsign'),'BA4VRM');
  assert.equal(request.searchParams.get('role'),'contact');
  assert.equal(request.searchParams.get('page'),'1');
  assert.equal(request.searchParams.get('limit'),'20');
  assert.equal(request.searchParams.get('queryToken'),'query-token');
  assert.equal(calls[0].init.headers.origin,'https://qso.mizuki.top');
});

test('queryToken is not forwarded beyond page one',async()=>{
  let seen;
  const fetchImpl=async(url)=>{
    seen=new URL(String(url));
    return new Response(JSON.stringify({station:'BA4THG',total:0,items:[]}),{status:200,headers:{'content-type':'application/json'}});
  };
  await fetchUpstreamContact({callsign:'BA4VRM',page:2,limit:20,queryToken:'query-token',fetchImpl});
  assert.equal(seen.searchParams.has('queryToken'),false);
});

test('upstream captcha metadata is preserved for API clients',async()=>{
  const fetchImpl=async()=>new Response(JSON.stringify({error:'请完成安全验证',captchaRequired:true,captchaId:'captcha-1'}),{status:429,headers:{'content-type':'application/json'}});
  const result=await fetchUpstreamContact({callsign:'BA4VRM',fetchImpl});
  assert.equal(result.ok,false);
  assert.equal(result.status,429);
  assert.equal(result.captchaRequired,true);
  assert.equal(result.captchaId,'captcha-1');
});
