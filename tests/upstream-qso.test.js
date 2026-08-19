import{test}from'node:test';
import assert from'node:assert/strict';
import{archiveUpstreamItems,fetchUpstreamContact}from'../functions/_lib/upstream-qso.js';
import{getVerifiedReciprocalSnapshot}from'../functions/_lib/verified-reciprocal.js';

test('server-side upstream query uses contact role and browser-compatible first-party headers',async()=>{
  const calls=[];
  const fetchImpl=async(url,init)=>{
    calls.push({url:String(url),init});
    return new Response(JSON.stringify({station:'BA4THG',total:1,items:[]}),{status:200,headers:{'content-type':'application/json','cf-ray':'test-ray'}});
  };
  const result=await fetchUpstreamContact({callsign:'BA4VRM',page:1,limit:20,queryToken:'query-token',fetchImpl});
  assert.equal(result.ok,true);
  assert.equal(result.diagnostic.cfRay,'test-ray');
  const request=new URL(calls[0].url);
  assert.equal(request.origin,'https://api.mzyyun.com');
  assert.equal(request.pathname,'/public/qso');
  assert.equal(request.searchParams.get('callsign'),'BA4VRM');
  assert.equal(request.searchParams.get('role'),'contact');
  assert.equal(request.searchParams.get('page'),'1');
  assert.equal(request.searchParams.get('limit'),'20');
  assert.equal(request.searchParams.get('queryToken'),'query-token');
  assert.equal(calls[0].init.headers.origin,'https://qso.mizuki.top');
  assert.equal(calls[0].init.headers.referer,'https://qso.mizuki.top/');
  assert.equal(calls[0].init.headers['sec-fetch-mode'],'cors');
  assert.equal(calls[0].init.headers['sec-fetch-site'],'cross-site');
  assert.match(calls[0].init.headers['user-agent'],/Chrome\//);
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

test('plain-text upstream errors are retained without exposing html bodies',async()=>{
  const plain=await fetchUpstreamContact({callsign:'BA4VRM',fetchImpl:async()=>new Response('Internal Server Error',{status:500,headers:{'content-type':'text/plain','cf-ray':'ray-500'}})});
  assert.equal(plain.ok,false);
  assert.equal(plain.status,500);
  assert.equal(plain.error,'Internal Server Error');
  assert.equal(plain.diagnostic.cfRay,'ray-500');

  const html=await fetchUpstreamContact({callsign:'BA4VRM',fetchImpl:async()=>new Response('<html>stack trace</html>',{status:500,headers:{'content-type':'text/html'}})});
  assert.equal(html.error,'上游返回 HTTP 500');
});

test('verified BA4VRM reciprocal snapshot is stored in BA4THG orientation',()=>{
  const snapshot=getVerifiedReciprocalSnapshot('ba4thg','ba4vrm');
  assert.ok(snapshot);
  assert.equal(snapshot.source,'mzyyun_public_reciprocal_snapshot');
  assert.equal(snapshot.items.length,4);
  assert.equal(snapshot.items[0].myCallsign,'BA4THG');
  assert.equal(snapshot.items[0].theirCallsign,'BA4VRM');
  assert.equal(snapshot.items[1].rstSent,'59');
  assert.equal(snapshot.items[1].rstReceived,'57');
  assert.equal(snapshot.items[1].myEquipment,'八重洲 FT-1907');
  assert.equal(snapshot.items[1].theirEquipment,'自由通 D878UVII PLUS');
  assert.equal(snapshot.items.at(-1).qslSent,false);
  assert.equal(snapshot.items.at(-1).qslReceived,true);
  assert.equal(getVerifiedReciprocalSnapshot('BA4THG','BG4ZZZ'),null);
});

function fakeDb({existing={id:'q1',managed_by:'external'},source=null}={}){
  const calls=[];
  return{
    calls,
    prepare(sql){
      return{
        bind(...args){
          return{
            async first(){
              if(sql.includes('FROM qso_sources'))return source;
              if(sql.startsWith('SELECT id,managed_by FROM qsos'))return existing;
              return null;
            },
            async run(){calls.push({sql,args});return{meta:{changes:1}};}
          };
        }
      };
    }
  };
}

const sample={
  id:'upstream-1',myCallsign:'BA4THG',theirCallsign:'BA4VRM',qsoDatetime:'2026-08-19T09:35:00.000Z',frequency:'430.610 MHz',mode:'FM',rstSent:'59',rstReceived:'59',isPublic:true
};

test('direct mzyyun source promotes an external fingerprint match',async()=>{
  const db=fakeDb();
  const result=await archiveUpstreamItems(db,[sample],'BA4THG',{sourceName:'mzyyun_api',expectedTheirCallsign:'BA4VRM',promoteExisting:true,updateQso:true});
  assert.equal(result.updated,1);
  assert.equal(result.rejected,0);
  assert.equal(db.calls.some(call=>call.sql.startsWith('UPDATE qsos SET')),true);
  assert.equal(db.calls.some(call=>call.sql.startsWith('INSERT OR IGNORE INTO qso_sources')),true);
});

test('verified reciprocal source can link but cannot overwrite an existing QSO',async()=>{
  const db=fakeDb();
  const result=await archiveUpstreamItems(db,[sample],'BA4THG',{sourceName:'mzyyun_public_reciprocal_snapshot',expectedTheirCallsign:'BA4VRM',promoteExisting:false,updateQso:false});
  assert.equal(result.updated,0);
  assert.equal(result.linkedToExisting,1);
  assert.equal(result.rejected,0);
  assert.equal(db.calls.some(call=>call.sql.startsWith('UPDATE qsos SET')),false);
  assert.equal(db.calls.some(call=>call.sql.startsWith('INSERT OR IGNORE INTO qso_sources')),true);
});
