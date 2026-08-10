(function(global){
  'use strict';

  const BASE_URL='https://api.mzyyun.com';
  const QUERY_TOKEN_KEY='public-qso-query-token';
  const QSL_SESSION_PREFIX='qsl-apply-session:';
  const CAPTCHA_SCRIPT='https://static.alicaptcha.com/v4/ct4.js';

  class PublicApiError extends Error{
    constructor(message,options={}){
      super(message);
      this.name='PublicApiError';
      this.status=Number(options.status||0);
      this.data=options.data||{};
      this.captchaRequired=Boolean(options.captchaRequired);
      this.captchaId=String(options.captchaId||'');
    }
  }

  class RateLimitError extends PublicApiError{
    constructor(message,options={}){
      super(message,{...options,status:429});
      this.name='RateLimitError';
    }
  }

  async function request(path,init={}){
    const headers=new Headers(init.headers||{});
    headers.set('accept','application/json');
    const response=await fetch(`${BASE_URL}${path}`,{
      ...init,
      mode:'cors',
      credentials:'omit',
      cache:'no-store',
      headers
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      const options={status:response.status,data,captchaRequired:Boolean(data.captchaRequired),captchaId:data.captchaId||''};
      if(response.status===429)throw new RateLimitError(data.error||'查询较为频繁，请稍后再试。',options);
      throw new PublicApiError(data.error||'请求未完成，请稍后重试。',options);
    }
    return data;
  }

  function readStorage(storage,key){
    try{return storage.getItem(key)||'';}catch{return'';}
  }

  function getQueryToken(){
    try{
      const raw=sessionStorage.getItem(QUERY_TOKEN_KEY);
      if(!raw)return null;
      const value=JSON.parse(raw);
      if(!value?.token||!value?.expiresAt||Date.now()>=Number(value.expiresAt)){
        sessionStorage.removeItem(QUERY_TOKEN_KEY);
        return null;
      }
      return value.token;
    }catch{
      try{sessionStorage.removeItem(QUERY_TOKEN_KEY);}catch{}
      return null;
    }
  }

  function saveQueryToken(token,expiresInSeconds=900){
    if(!token)return;
    try{
      const seconds=Number(expiresInSeconds);
      const lifetime=Number.isFinite(seconds)&&seconds>0?seconds:900;
      sessionStorage.setItem(QUERY_TOKEN_KEY,JSON.stringify({token,expiresAt:Date.now()+1000*lifetime}));
    }catch{}
  }

  function clearQueryToken(){try{sessionStorage.removeItem(QUERY_TOKEN_KEY);}catch{}}

  function qslSessionKey(callsign){return`${QSL_SESSION_PREFIX}${String(callsign||'').trim().toUpperCase()}`;}
  function getQslSession(callsign){return readStorage(localStorage,qslSessionKey(callsign));}
  function saveQslSession(callsign,token){if(token)try{localStorage.setItem(qslSessionKey(callsign),token);}catch{};}
  function clearQslSession(callsign){try{localStorage.removeItem(qslSessionKey(callsign));}catch{}}

  let captchaScriptPromise=null;
  function loadCaptchaScript(){
    if(typeof global.initAlicom4==='function')return Promise.resolve();
    if(captchaScriptPromise)return captchaScriptPromise;
    captchaScriptPromise=new Promise((resolve,reject)=>{
      const existing=document.querySelector(`script[src="${CAPTCHA_SCRIPT}"]`);
      if(existing){
        existing.addEventListener('load',resolve,{once:true});
        existing.addEventListener('error',()=>reject(new Error('安全验证组件加载失败。')),{once:true});
        return;
      }
      const script=document.createElement('script');
      script.src=CAPTCHA_SCRIPT;
      script.async=true;
      script.onload=resolve;
      script.onerror=()=>{captchaScriptPromise=null;reject(new Error('安全验证组件加载失败。'));};
      document.head.append(script);
    });
    return captchaScriptPromise;
  }

  class CaptchaController{
    async run(captchaId){
      if(!captchaId)throw new Error('请先完成安全验证。');
      await loadCaptchaScript();
      if(typeof global.initAlicom4!=='function')throw new Error('安全验证组件未就绪。');
      return new Promise((resolve,reject)=>{
        let finished=false,instance=null;
        const finish=(callback,value)=>{
          if(finished)return;
          finished=true;
          try{instance?.destroy?.();}catch{}
          callback(value);
        };
        global.initAlicom4({captchaId,product:'bind',language:'zho'},captcha=>{
          instance=captcha;
          captcha.onNextReady(()=>captcha.showCaptcha())
            .onSuccess(()=>{
              const value=captcha.getValidate?.();
              if(!value)return finish(reject,new Error('请完成安全验证。'));
              finish(resolve,{lotNumber:value.lot_number||value.lotNumber||'',captchaOutput:value.captcha_output||value.captchaOutput||'',passToken:value.pass_token||value.passToken||'',genTime:value.gen_time||value.genTime||''});
            })
            .onError(()=>finish(reject,new Error('安全验证失败，请稍后重试。')))
            .onClose(()=>finish(reject,new Error('请完成安全验证后再继续。')));
        });
      });
    }

    verify(captchaId){return this.run(captchaId);}
  }

  const captcha=new CaptchaController();

  async function verifyQueryCaptcha(fields){
    const data=await request('/public/qso/verify-captcha',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(fields)});
    saveQueryToken(data.queryToken,data.expiresInSeconds);
    return data;
  }

  async function fetchPublicQso({callsign,page=1,role='contact',limit=20,queryToken,signal}={}){
    const currentPage=Math.max(1,Number.parseInt(page,10)||1);
    const params=new URLSearchParams({callsign:String(callsign||''),role,page:String(currentPage),limit:String(limit)});
    if(currentPage===1){
      const token=queryToken||getQueryToken();
      if(token)params.set('queryToken',token);
    }
    return request(`/public/qso?${params}`,signal?{signal}:{});
  }

  const qsl={
    getSession:callsign=>getQslSession(callsign),
    saveSession:(callsign,token)=>saveQslSession(callsign,token),
    clearSession:callsign=>clearQslSession(callsign),
    lookup(callsign,signal,options={}){
      const params=new URLSearchParams({callsign:String(callsign||'')});
      const session=Object.prototype.hasOwnProperty.call(options,'sessionToken')?String(options.sessionToken||''):(options.includeSession===false?'':getQslSession(callsign));
      if(session)params.set('sessionToken',session);
      return request(`/public/qsl-apply/lookup?${params}`,signal?{signal}:{});
    },
    unlock({callsign,middleDigits,captchaFields={}}){return request('/public/qsl-apply/unlock',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({callsign,middleDigits,...captchaFields})});},
    verifyPhone({callsign,middleDigits,captchaFields={}}){return request('/public/qsl-apply/verify-phone',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({callsign,middleDigits,...captchaFields})});},
    sendSms({callsign,phone,captchaFields={}}){return request('/public/qsl-apply/send-sms',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({callsign,phone,...captchaFields})});},
    verifySms({callsign,phone,code}){return request('/public/qsl-apply/verify-sms',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({callsign,phone,code})});},
    submit({verifyToken,qsoIds,recipientName,mailingAddress,postalCode,email,notifySentEmail}){return request('/public/qsl-apply/submit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({verifyToken,qsoIds,recipientName,mailingAddress,postalCode,email,notifySentEmail})});},
    sendAddressSms({callsign,captchaFields={}}){return request('/public/qsl-apply/address/send-sms',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({callsign,sessionToken:getQslSession(callsign),...captchaFields})});},
    verifyAddressUpdate({callsign,code,mailingAddress,postalCode,email,notifySentEmail}){return request('/public/qsl-apply/address/verify-update',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({callsign,sessionToken:getQslSession(callsign),code,mailingAddress,postalCode,email,notifySentEmail})});}
  };

  global.BA4THGPublicApi={BASE_URL,PublicApiError,RateLimitError,getQueryToken,saveQueryToken,clearQueryToken,fetchPublicQso,verifyQueryCaptcha,captcha,qsl};
})(window);
