import{test}from'node:test';
import assert from'node:assert/strict';
import{readFileSync}from'node:fs';
import vm from'node:vm';

const source=readFileSync(new URL('../public-api.js',import.meta.url),'utf8');

function storage(){
  const values=new Map();
  return{
    getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key)
  };
}

function response(status,data){
  return{ok:status>=200&&status<300,status,json:async()=>data};
}

function load(fetchImpl){
  const context={
    Headers,URLSearchParams,URL,Date,Promise,console,
    fetch:fetchImpl,
    localStorage:storage(),sessionStorage:storage(),
    document:{querySelector:()=>null,createElement:()=>({}),head:{append(){}}},
    window:{}
  };
  vm.runInNewContext(source,context,{filename:'public-api.js'});
  return context.window.BA4THGPublicApi;
}

test('lookup captchaId is used before protected QSL request',async()=>{
  const calls=[];
  const api=load(async(url,init={})=>{
    calls.push({url:String(url),init});
    if(String(url).includes('/public/qsl-apply/lookup'))return response(200,{mode:'mask',captchaId:'captcha-from-lookup'});
    if(String(url).includes('/public/qsl-apply/verify-phone'))return response(200,{mode:'session',verifyToken:'verify-1',sessionToken:'session-1'});
    return response(500,{error:'unexpected'});
  });

  let captchaRuns=0;
  api.captcha.run=async captchaId=>{
    captchaRuns++;
    assert.equal(captchaId,'captcha-from-lookup');
    return{lotNumber:'lot',captchaOutput:'output',passToken:'pass',genTime:'time'};
  };

  const lookup=await api.qsl.lookup('BG4ABC');
  assert.equal(lookup.captchaId,'captcha-from-lookup');

  await api.qsl.verifyPhone({callsign:'BG4ABC',middleDigits:'1234'});
  assert.equal(captchaRuns,1);

  const verifyCall=calls.find(call=>call.url.endsWith('/public/qsl-apply/verify-phone'));
  assert.ok(verifyCall);
  assert.deepEqual(JSON.parse(verifyCall.init.body),{
    callsign:'BG4ABC',
    middleDigits:'1234',
    lotNumber:'lot',
    captchaOutput:'output',
    passToken:'pass',
    genTime:'time'
  });
});

test('explicit captcha fields are not replaced by another challenge',async()=>{
  const calls=[];
  const api=load(async(url,init={})=>{
    calls.push({url:String(url),init});
    if(String(url).includes('/public/qsl-apply/lookup'))return response(200,{mode:'sms',captchaId:'captcha-from-lookup'});
    if(String(url).includes('/public/qsl-apply/send-sms'))return response(200,{ok:true,cooldownSeconds:60});
    return response(500,{error:'unexpected'});
  });

  await api.qsl.lookup('BG4ABC');
  api.captcha.run=async()=>{throw new Error('不应重复弹出验证码');};
  const fields={lotNumber:'lot',captchaOutput:'output',passToken:'pass',genTime:'time'};
  await api.qsl.sendSms({callsign:'BG4ABC',phone:'13812345678',captchaFields:fields});

  const sendCall=calls.find(call=>call.url.endsWith('/public/qsl-apply/send-sms'));
  assert.deepEqual(JSON.parse(sendCall.init.body),{callsign:'BG4ABC',phone:'13812345678',...fields});
});
