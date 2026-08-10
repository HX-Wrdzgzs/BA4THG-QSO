import{after,before,test}from'node:test';
import assert from'node:assert/strict';
import{generateKeyPair,exportJWK,SignJWT}from'jose';
import{authorize}from'../functions/_lib/http.js';

const teamDomain='https://team.example.com';
const audience='aud-test';
const jwksUrl=`${teamDomain}/cdn-cgi/access/certs`;
let privateKey;
let invalidPrivateKey;
let originalFetch;

before(async()=>{
  const valid=await generateKeyPair('RS256');
  const invalid=await generateKeyPair('RS256');
  privateKey=valid.privateKey;
  invalidPrivateKey=invalid.privateKey;
  const publicJwk=await exportJWK(valid.publicKey);
  publicJwk.kid='access-key';
  publicJwk.alg='RS256';
  publicJwk.use='sig';
  originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>{
    if(String(url)!==jwksUrl)return new Response('not found',{status:404});
    return new Response(JSON.stringify({keys:[publicJwk]}),{
      status:200,
      headers:{'content-type':'application/json'}
    });
  };
});

after(()=>{
  globalThis.fetch=originalFetch;
});

function request(headers={}){
  return new Request('https://qso.mizuki.top/api/admin/session',{headers});
}

function env(overrides={}){
  return{ACCESS_TEAM_DOMAIN:teamDomain,ACCESS_AUD:audience,...overrides};
}

async function token({issuer=teamDomain,aud=audience,key=privateKey}={}){
  return new SignJWT({email:'admin@example.com'})
    .setProtectedHeader({alg:'RS256',kid:'access-key'})
    .setIssuer(issuer)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);
}

async function assertForbidden(result){
  assert.equal(result.ok,false);
  assert.equal(result.response.status,403);
}

test('missing configuration and ordinary identity headers fail closed',async()=>{
  await assertForbidden(await authorize(request({'cf-access-authenticated-user-email':'admin@example.com'}),{}));
  await assertForbidden(await authorize(request(),env({ACCESS_AUD:''})));
  await assertForbidden(await authorize(request(),env({ACCESS_TEAM_DOMAIN:'not-a-url'})));
});

test('missing JWT is rejected',async()=>{
  await assertForbidden(await authorize(request(),env()));
});

test('valid Access JWT is accepted',async()=>{
  const result=await authorize(request({'cf-access-jwt-assertion':await token()}),env());
  assert.equal(result.ok,true);
  assert.equal(result.payload.iss,teamDomain);
  assert.equal(result.payload.aud,audience);
});

test('invalid signature is rejected',async()=>{
  await assertForbidden(await authorize(request({'cf-access-jwt-assertion':await token({key:invalidPrivateKey})}),env()));
});

test('invalid issuer is rejected',async()=>{
  await assertForbidden(await authorize(request({'cf-access-jwt-assertion':await token({issuer:'https://other.example.com'})}),env()));
});

test('invalid audience is rejected',async()=>{
  await assertForbidden(await authorize(request({'cf-access-jwt-assertion':await token({aud:'wrong-audience'})}),env()));
});
