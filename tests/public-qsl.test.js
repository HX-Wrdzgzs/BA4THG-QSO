import{test}from'node:test';
import assert from'node:assert/strict';
import{readFileSync}from'node:fs';
import vm from'node:vm';

const publicApiSource=readFileSync(new URL('../public-api.js',import.meta.url),'utf8');
const qslSource=readFileSync(new URL('../qsl-apply.js',import.meta.url),'utf8');
const appSource=readFileSync(new URL('../app.js',import.meta.url),'utf8');

function storage(){
  const values=new Map();
  return{
    getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key),
    key:index=>[...values.keys()][index]||null,
    get length(){return values.size;},
    values
  };
}

function loadScripts(fetchImpl,documentOverride=null){
  const localStorage=storage();
  const sessionStorage=storage();
  const document=documentOverride||{
    querySelector:()=>null,
    createElement:tag=>({tagName:tag,addEventListener(){},append(){}}),
    head:{append(){}}
  };
  const context={
    Headers,
    URLSearchParams,
    URL,
    Date,
    Intl,
    Promise,
    console,
    document,
    fetch:fetchImpl,
    localStorage,
    sessionStorage,
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
    window:{}
  };
  vm.runInNewContext(publicApiSource,context,{filename:'public-api.js'});
  vm.runInNewContext(qslSource,context,{filename:'qsl-apply.js'});
  return{context,api:context.window.BA4THGPublicApi,QslApplyController:context.window.QslApplyController,localStorage,sessionStorage};
}

function response(status,data){
  return{ok:status>=200&&status<300,status,json:async()=>data};
}

class FakeNode{
  constructor(tag='div'){
    this.tagName=tag;
    this.children=[];
    this.dataset={};
    this.hidden=false;
    this.value='';
    this.checked=false;
    this.disabled=false;
    this.textContent='';
    this.className='';
  }
  append(...nodes){this.children.push(...nodes.filter(Boolean));}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  addEventListener(){}
  get childElementCount(){return this.children.length;}
}

function controllerFixture(overrides={}){
  const body=new FakeNode('div');
  body.querySelector=()=>null;
  body.querySelectorAll=()=>[];
  const root=new FakeNode('section');
  root.querySelector=selector=>selector==='[data-qsl-body]'?body:null;
  const api={
    qsl:{
      getSession:()=>'',
      saveSession(){},
      clearSession(){},
      lookup:async()=>({mode:'sms'}),
      submit:async()=>({mode:'status'}),
      ...overrides.qsl
    },
    ...overrides
  };
  const fixture=overrides.fixture||{};
  const controller=new fixture.QslApplyController(root,api,{run:async()=>({})});
  controller.render=()=>{};
  return{controller,body,api};
}

test('public QSO query uses contact role and page-scoped queryToken',async()=>{
  const calls=[];
  const{api,sessionStorage}=loadScripts(async(url,init)=>{
    calls.push({url:String(url),init});
    return response(200,{total:1,items:[]});
  });

  await api.fetchPublicQso({callsign:'BG4ABC',page:1,role:'contact',limit:20});
  let url=new URL(calls.at(-1).url);
  assert.equal(url.searchParams.get('callsign'),'BG4ABC');
  assert.equal(url.searchParams.get('role'),'contact');
  assert.equal(url.searchParams.get('page'),'1');
  assert.equal(url.searchParams.get('limit'),'20');
  assert.equal(url.searchParams.has('queryToken'),false);

  api.saveQueryToken('query-1',30);
  const saved=JSON.parse(sessionStorage.getItem('public-qso-query-token'));
  assert.ok(saved.expiresAt>Date.now());
  assert.ok(saved.expiresAt<=Date.now()+30000);

  await api.fetchPublicQso({callsign:'BG4ABC',page:1,role:'contact'});
  url=new URL(calls.at(-1).url);
  assert.equal(url.searchParams.get('queryToken'),'query-1');

  await api.fetchPublicQso({callsign:'BG4ABC',page:2,role:'contact'});
  url=new URL(calls.at(-1).url);
  assert.equal(url.searchParams.get('page'),'2');
  assert.equal(url.searchParams.has('queryToken'),false);
  sessionStorage.setItem('public-qso-query-token',JSON.stringify({token:'expired',expiresAt:Date.now()-1}));
  assert.equal(api.getQueryToken(),null);
  assert.equal(sessionStorage.getItem('public-qso-query-token'),null);
});

test('QSL session tokens are isolated by callsign and lookup can omit one',async()=>{
  const calls=[];
  const{api,localStorage}=loadScripts(async(url,init)=>{
    calls.push({url:String(url),init});
    return response(200,{mode:'sms'});
  });
  api.qsl.saveSession('BG4ABC','session-a');
  api.qsl.saveSession('BD4XYZ','session-b');
  assert.equal(localStorage.getItem('qsl-apply-session:BG4ABC'),'session-a');
  assert.equal(localStorage.getItem('qsl-apply-session:BD4XYZ'),'session-b');

  await api.qsl.lookup('BG4ABC');
  let url=new URL(calls.at(-1).url);
  assert.equal(url.searchParams.get('sessionToken'),'session-a');

  await api.qsl.lookup('BG4ABC',undefined,{includeSession:false});
  url=new URL(calls.at(-1).url);
  assert.equal(url.searchParams.has('sessionToken'),false);
  api.qsl.clearSession('BG4ABC');
  assert.equal(localStorage.getItem('qsl-apply-session:BG4ABC'),null);
  assert.equal(localStorage.getItem('qsl-apply-session:BD4XYZ'),'session-b');
});

test('captcha response, captcha controller and address request use documented fields',async()=>{
  const calls=[];
  const{api}=loadScripts(async(url,init)=>{
    calls.push({url:String(url),init});
    if(String(url).includes('/public/qsl-apply/address/send-sms'))return response(200,{cooldownSeconds:60});
    return response(200,{queryToken:'query-2',expiresInSeconds:120});
  });
  assert.equal(typeof api.captcha.run,'function');
  assert.equal(typeof api.captcha.verify,'function');
  await api.verifyQueryCaptcha({lotNumber:'lot',captchaOutput:'output',passToken:'pass',genTime:'time'});
  assert.equal(calls[0].url,'https://api.mzyyun.com/public/qso/verify-captcha');
  assert.deepEqual(JSON.parse(calls[0].init.body),{lotNumber:'lot',captchaOutput:'output',passToken:'pass',genTime:'time'});

  api.qsl.saveSession('BG4ABC','session-a');
  await api.qsl.sendAddressSms({callsign:'BG4ABC',captchaFields:{lotNumber:'lot',captchaOutput:'output',passToken:'pass',genTime:'time'}});
  const request=calls[1];
  assert.equal(request.url,'https://api.mzyyun.com/public/qsl-apply/address/send-sms');
  assert.deepEqual(JSON.parse(request.init.body),{callsign:'BG4ABC',sessionToken:'session-a',lotNumber:'lot',captchaOutput:'output',passToken:'pass',genTime:'time'});
});

test('QSL client uses the documented verification and submit endpoints',async()=>{
  const calls=[];
  const{api}=loadScripts(async(url,init)=>{
    calls.push({url:String(url),init});
    return response(200,{mode:'session'});
  });
  api.qsl.saveSession('BG4ABC','session-a');
  const captchaFields={lotNumber:'lot',captchaOutput:'output',passToken:'pass',genTime:'time'};
  await api.qsl.verifyPhone({callsign:'BG4ABC',middleDigits:'1234',captchaFields});
  await api.qsl.unlock({callsign:'BG4ABC',middleDigits:'1234',captchaFields});
  await api.qsl.sendSms({callsign:'BG4ABC',phone:'13812345678',captchaFields});
  await api.qsl.verifySms({callsign:'BG4ABC',phone:'13812345678',code:'123456'});
  await api.qsl.submit({verifyToken:'verify-1',qsoIds:[101],recipientName:'张三',mailingAddress:'南京市',postalCode:'210000',email:'test@example.com',notifySentEmail:true});
  await api.qsl.verifyAddressUpdate({callsign:'BG4ABC',code:'123456',mailingAddress:'南京市鼓楼区',postalCode:'210000',email:'test@example.com',notifySentEmail:false});
  assert.deepEqual(calls.map(call=>call.url),[
    'https://api.mzyyun.com/public/qsl-apply/verify-phone',
    'https://api.mzyyun.com/public/qsl-apply/unlock',
    'https://api.mzyyun.com/public/qsl-apply/send-sms',
    'https://api.mzyyun.com/public/qsl-apply/verify-sms',
    'https://api.mzyyun.com/public/qsl-apply/submit',
    'https://api.mzyyun.com/public/qsl-apply/address/verify-update'
  ]);
  assert.deepEqual(JSON.parse(calls[0].init.body),{callsign:'BG4ABC',middleDigits:'1234',...captchaFields});
  assert.deepEqual(JSON.parse(calls[1].init.body),{callsign:'BG4ABC',middleDigits:'1234',...captchaFields});
  assert.deepEqual(JSON.parse(calls[2].init.body),{callsign:'BG4ABC',phone:'13812345678',...captchaFields});
  assert.deepEqual(JSON.parse(calls[3].init.body),{callsign:'BG4ABC',phone:'13812345678',code:'123456'});
  assert.deepEqual(JSON.parse(calls[4].init.body),{verifyToken:'verify-1',qsoIds:[101],recipientName:'张三',mailingAddress:'南京市',postalCode:'210000',email:'test@example.com',notifySentEmail:true});
  assert.deepEqual(JSON.parse(calls[5].init.body),{callsign:'BG4ABC',sessionToken:'session-a',code:'123456',mailingAddress:'南京市鼓楼区',postalCode:'210000',email:'test@example.com',notifySentEmail:false});
});

test('429 captcha metadata is retained for the unified captcha flow',async()=>{
  const{api}=loadScripts(async()=>response(429,{captchaRequired:true,captchaId:'captcha-1'}));
  await assert.rejects(
    api.fetchPublicQso({callsign:'BG4ABC',page:1,role:'contact'}),
    error=>error.status===429&&error.captchaRequired&&error.captchaId==='captcha-1'
  );
});

test('public page blocks empty/invalid callsigns and sends valid queries directly as contact',async()=>{
  const calls=[];
  const form=new FakeNode('form');
  form.elements={q:{value:''}};
  const submitHandlers=[];
  form.addEventListener=(type,handler)=>{if(type==='submit')submitHandlers.push(handler);};
  const nodes=new Map([
    ['[data-query-form]',form],
    ['[data-list]',new FakeNode('div')],
    ['[data-loading]',new FakeNode('div')],
    ['[data-error]',new FakeNode('div')],
    ['[data-empty]',new FakeNode('div')],
    ['[data-pagination]',new FakeNode('div')],
    ['[data-prev]',new FakeNode('button')],
    ['[data-next]',new FakeNode('button')],
    ['[data-page-label]',new FakeNode('span')],
    ['[data-result-meta]',new FakeNode('p')]
  ]);
  const qslPanel=new FakeNode('section');
  const qslStart=new FakeNode('button');
  const qslBody=new FakeNode('div');
  const qslMessage=new FakeNode('p');
  qslPanel.querySelector=selector=>selector==='[data-qsl-start]'?qslStart:selector==='[data-qsl-body]'?qslBody:selector==='[data-qsl-message]'?qslMessage:null;
  nodes.set('[data-qsl-panel]',qslPanel);
  nodes.set('[data-qsl-start]',qslStart);
  nodes.set('[data-qsl-body]',qslBody);
  const document={
    querySelector:selector=>nodes.get(selector)||null,
    createElement:tag=>new FakeNode(tag),
    createDocumentFragment:()=>new FakeNode('fragment'),
    head:{append(){}}
  };
  const fixture=loadScripts(async(url,init)=>{
    calls.push({url:String(url),init});
    if(String(url).startsWith('https://api.mzyyun.com'))return response(200,{total:1,items:[{id:101,myCallsign:'BA4THG',theirCallsign:'BG4ABC',qsoDatetime:'2026-08-01T00:00:00Z',frequency:'145.100',mode:'FM'}]});
    return response(200,{total:0,items:[]});
  },document);
  fixture.context.FormData=class{constructor(target){this.target=target;}get(name){return this.target.elements[name]?.value||null;}};
  fixture.context.history={replaceState(){}};
  fixture.context.location={href:'https://qso.mizuki.top/'};
  vm.runInNewContext(appSource,fixture.context,{filename:'app.js'});

  await submitHandlers[0]({preventDefault(){}});
  assert.equal(calls.length,0,'empty callsign must not send a request');
  form.elements.q.value='INVALID!';
  await submitHandlers[0]({preventDefault(){}});
  assert.equal(calls.length,0,'invalid callsign must not send a request');
  form.elements.q.value='BG4ABC';
  await submitHandlers[0]({preventDefault(){}});
  await new Promise(resolve=>setTimeout(resolve,50));
  const liveCall=calls.find(call=>call.url.startsWith('https://api.mzyyun.com'));
  assert.ok(liveCall);
  const liveUrl=new URL(liveCall.url);
  assert.equal(liveUrl.searchParams.get('callsign'),'BG4ABC');
  assert.equal(liveUrl.searchParams.get('role'),'contact');
  assert.equal(liveUrl.searchParams.get('page'),'1');
  assert.equal(qslPanel.hidden,false,`qsl panel hidden; calls=${calls.map(call=>call.url).join('|')}`);
});

test('QSL lookup implements all documented modes without unknown-mode fallback',async()=>{
  const fixture=loadScripts(async()=>response(200,{}));
  const{controller}=controllerFixture({fixture,QslApplyController:fixture.QslApplyController});
  const expected={mask:'maskVerify',sms:'smsSend',locked:'locked',session:'ready',status:'status',already_sent:'already_sent'};
  for(const[mode,state]of Object.entries(expected)){
    controller.data=mode==='locked'?{mode,unlock:'mask'}:{mode};
    controller.stateByMode(mode);
    assert.equal(controller.state,state,mode);
  }
  controller.stateByMode('unrecognized');
  assert.equal(controller.state,'error');
});

test('expired session is cleared and lookup retries without the token',async()=>{
  let lookupCount=0;
  let cleared=0;
  const fixture=loadScripts(async()=>response(200,{}));
  const{controller,api}=controllerFixture({fixture,QslApplyController:fixture.QslApplyController,qsl:{
    getSession:()=>lookupCount===0?'expired-session':'',
    clearSession:()=>{cleared++;},
    lookup:async()=>{lookupCount++;if(lookupCount===1)throw{status:401};return{mode:'sms'};}
  }});
  await controller.lookup();
  assert.equal(lookupCount,2);
  assert.equal(cleared,1);
  assert.equal(controller.state,'smsSend');
  assert.equal(api.qsl.getSession(),'');
});

test('ordinary 403 is an application restriction and does not clear sessionToken',async()=>{
  let lookupCount=0;
  let cleared=0;
  const fixture=loadScripts(async()=>response(200,{}));
  const{controller}=controllerFixture({fixture,QslApplyController:fixture.QslApplyController,qsl:{
    getSession:()=> 'still-valid',
    clearSession:()=>{cleared++;},
    lookup:async()=>{lookupCount++;throw{status:403,message:'该手机号无法申请 QSL'};}
  }});
  await controller.lookup();
  assert.equal(lookupCount,1);
  assert.equal(cleared,0);
  assert.equal(controller.state,'error');
  assert.equal(controller.message,'当前无法申请 QSL 卡片。');
});

test('postalCode accepts the API character set and rejects invalid values',async()=>{
  const fixture=loadScripts(async()=>response(200,{}));
  async function submitPostal(postalCode){
    let submitted=false;
    const{controller,body}=controllerFixture({fixture,QslApplyController:fixture.QslApplyController,qsl:{
      submit:async()=>{submitted=true;return{mode:'status',statusLabel:'待寄出'};}
    }});
    const fields=new Map([
      ['[data-recipient]',{value:'张三'}],
      ['[data-address]',{value:'南京市'}],
      ['[data-postal]',{value:postalCode}],
      ['[data-email]',{value:''}],
      ['[data-notify]',{checked:false}]
    ]);
    body.querySelectorAll=()=>[{value:'101'}];
    body.querySelector=selector=>fields.get(selector)||null;
    controller.eligibleIds=[101];
    controller.data={needAddress:false};
    controller.verifyToken='verify-postal';
    await controller.submit();
    return{submitted,message:controller.message};
  }

  for(const value of['','210000','SW1A 1AA','12345-6789']){
    assert.equal((await submitPostal(value)).submitted,true,value||'<empty>');
  }
  for(const value of['ABCDEFGHIJKLM','210000@']){
    const result=await submitPostal(value);
    assert.equal(result.submitted,false,value);
    assert.equal(result.message,'邮编格式无效。');
  }
});

test('submit preserves API id types, rejects non-eligible ids, validates address and clears verifyToken only after success',async()=>{
  const fixture=loadScripts(async()=>response(200,{}));
  let submitted=null;
  const{controller,body,api}=controllerFixture({fixture,QslApplyController:fixture.QslApplyController,qsl:{
    submit:async payload=>{submitted=payload;return{mode:'status',statusLabel:'待寄出'};}
  }});
  const checkbox={value:'101'};
  const fields=new Map([
    ['[data-recipient]',{value:'张三'}],
    ['[data-address]',{value:'南京市'}],
    ['[data-postal]',{value:'210000'}],
    ['[data-email]',{value:'test@example.com'}],
    ['[data-notify]',{checked:true}]
  ]);
  body.querySelectorAll=()=>[checkbox];
  body.querySelector=selector=>fields.get(selector)||null;
  controller.eligibleIds=[101,102];
  controller.data={needAddress:true};
  controller.verifyToken='verify-1';
  await controller.submit();
  assert.deepEqual([...submitted.qsoIds],[101]);
  assert.equal(submitted.verifyToken,'verify-1');
  assert.equal(controller.verifyToken,'');

  submitted=null;
  checkbox.value='999';
  controller.verifyToken='verify-2';
  await controller.submit();
  assert.equal(submitted,null);
  assert.match(controller.message,/不可申请/);

  checkbox.value='101';
  fields.get('[data-address]').value='';
  controller.verifyToken='verify-3';
  await controller.submit();
  assert.equal(submitted,null);
  assert.match(controller.message,/收件人和邮寄地址/);

  fields.get('[data-address]').value='南京市';
  api.qsl.submit=async()=>{throw{status:500};};
  controller.verifyToken='verify-4';
  await controller.submit();
  assert.equal(controller.verifyToken,'verify-4');
});

test('submit clears only invalid or used HTTP 400 verifyToken errors and refreshes lookup',async()=>{
  const fixture=loadScripts(async()=>response(200,{}));
  async function submitWith(error){
    let lookupCount=0;
    const{controller,body}=controllerFixture({fixture,QslApplyController:fixture.QslApplyController,qsl:{
      submit:async()=>{throw error;},
      lookup:async()=>{lookupCount++;return{mode:'mask',phoneMask:'138****5678'};}
    }});
    const fields=new Map([
      ['[data-recipient]',{value:''}],
      ['[data-address]',{value:''}],
      ['[data-postal]',{value:''}],
      ['[data-email]',{value:''}],
      ['[data-notify]',{checked:false}]
    ]);
    body.querySelectorAll=()=>[{value:'101'}];
    body.querySelector=selector=>fields.get(selector)||null;
    controller.eligibleIds=[101];
    controller.data={needAddress:false};
    controller.verifyToken='verify-400';
    await controller.submit();
    return{controller,lookupCount};
  }

  for(const message of['核验凭证无效或已过期','核验凭证已使用']){
    const result=await submitWith({status:400,message,data:{error:message}});
    assert.equal(result.controller.verifyToken,'',message);
    assert.equal(result.lookupCount,1,message);
    assert.equal(result.controller.state,'maskVerify',message);
    assert.equal(result.controller.message,'身份验证已失效，请重新验证。');
  }

  const ordinary=await submitWith({status:400,message:'邮寄地址格式错误',data:{error:'邮寄地址格式错误'}});
  assert.equal(ordinary.controller.verifyToken,'verify-400');
  assert.equal(ordinary.lookupCount,0);
});

test('submit HTTP 409 refreshes eligible and applied state from lookup',async()=>{
  let lookupCount=0;
  const fixture=loadScripts(async()=>response(200,{}));
  const{controller,body}=controllerFixture({fixture,QslApplyController:fixture.QslApplyController,qsl:{
    submit:async()=>{throw{status:409,message:'所选通联包含已申请的记录'};},
    lookup:async()=>{
      lookupCount++;
      return{mode:'status',eligibleQsoIds:[],appliedQsoIds:[101],appliedItems:[{qsoId:101,statusLabel:'待寄出'}]};
    }
  }});
  const fields=new Map([
    ['[data-recipient]',{value:''}],
    ['[data-address]',{value:''}],
    ['[data-postal]',{value:''}],
    ['[data-email]',{value:''}],
    ['[data-notify]',{checked:false}]
  ]);
  body.querySelectorAll=()=>[{value:'101'}];
  body.querySelector=selector=>fields.get(selector)||null;
  controller.eligibleIds=[101];
  controller.data={needAddress:false};
  controller.verifyToken='verify-conflict';
  await controller.submit();
  assert.equal(lookupCount,1);
  assert.equal(controller.verifyToken,'');
  assert.deepEqual([...controller.eligibleIds],[]);
  assert.deepEqual([...controller.appliedIds],['101']);
  assert.equal(controller.appliedItems.length,1);
  assert.equal(controller.state,'status');
  assert.equal(controller.message,'申请状态已更新，请查看最新结果。');
});

test('status summaries never expose internal ids and show sent time/tracking',async()=>{
  const fixture=loadScripts(async()=>response(200,{}));
  const{controller}=controllerFixture({fixture,QslApplyController:fixture.QslApplyController});
  const summary=controller.statusSummary({id:'internal-id',qsoDatetime:'2026-08-01T00:00:00Z',frequency:'145.100',mode:'FM',qslSent:true,qslSentAt:'2026-08-02T00:00:00Z',qslSentTracking:'TRACK-1'});
  assert.match(summary,/145\.100/);
  assert.match(summary,/已寄出/);
  assert.match(summary,/寄出时间/);
  assert.match(summary,/TRACK-1/);
  assert.doesNotMatch(summary,/internal-id/);
});
