(function(global){
  'use strict';

  const text=(value,fallback='—')=>value===null||value===undefined||value===''?fallback:String(value);

  function errorText(error){
    return[error?.message,error?.data?.error,error?.data?.message].filter(Boolean).map(String).join(' ');
  }

  function isSessionExpired(error){
    if(Number(error?.status)===401)return true;
    if(Number(error?.status)!==403)return false;
    const message=errorText(error);
    return/(?:会话|session\s*token|sessionToken).*(?:无效|失效|过期)|(?:无效|失效|过期).*(?:会话|session\s*token|sessionToken)/i.test(message);
  }

  function isVerifyTokenExpired(error){
    if(Number(error?.status)!==400)return false;
    const message=errorText(error);
    return/核验凭证/.test(message)&&/(?:无效|失效|过期|已使用|已经使用)/.test(message);
  }

  function validPostalCode(value){
    return value===''||/^[A-Za-z0-9 -]{1,12}$/.test(value);
  }

  function apiError(error,kind='操作'){
    if(error?.status===429)return kind==='查询'?'查询较为频繁，请稍后再试。':'操作较为频繁，请稍后再试。';
    if(error?.captchaRequired||/验证码|安全验证|captcha/i.test(error?.message||''))return'验证码错误或已过期。';
    if(isSessionExpired(error))return'身份验证已失效，请重新验证。';
    if(error?.status===403)return'当前无法申请 QSL 卡片。';
    if(error?.status===409)return'申请状态已更新，请查看最新结果。';
    if(error?.status===404)return'当前没有可申请的 QSL 卡片。';
    return'申请操作未完成，请稍后重试。';
  }

  function element(tag,className,content){
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(content!==undefined)node.textContent=content;
    return node;
  }

  function addField(parent,label,value,required=false){
    const wrapper=element('label','qsl-field');
    const title=element('span','',required?`${label}（必填）`:label);
    const input=element('input');
    input.name=label;
    input.value=value||'';
    if(required)input.required=true;
    wrapper.append(title,input);
    parent.append(wrapper);
    return input;
  }

  class QslApplyController{
    constructor(root,api,captcha){
      this.root=root;
      this.api=api;
      this.captcha=captcha;
      this.startButton=root.querySelector('[data-qsl-start]');
      this.body=root.querySelector('[data-qsl-body]');
      this.heading=root.querySelector('[data-qsl-message]');
      this.callsign='';
      this.qsoItems=[];
      this.eligibleIds=[];
      this.appliedIds=[];
      this.appliedItems=[];
      this.data={};
      this.state='idle';
      this.message='';
      this.captchaId='';
      this.verifyToken='';
      this.unlockMode='mask';
      this.smsSent=false;
      this.phone='';
      this.addressEditing=false;
      this.cooldowns={sms:0,address:0};
      this.timers={};
      this.startButton?.addEventListener('click',()=>this.open(this.callsign,this.qsoItems));
    }

    setItems(items){this.qsoItems=Array.isArray(items)?items.slice():[];}

    open(callsign,items=[]){
      Object.values(this.timers).forEach(timer=>clearInterval(timer));
      this.timers={};
      this.callsign=String(callsign||'').trim().toUpperCase();
      this.setItems(items);
      this.data={};
      this.eligibleIds=[];
      this.appliedIds=[];
      this.appliedItems=[];
      this.verifyToken='';
      this.captchaId='';
      this.unlockMode='mask';
      this.smsSent=false;
      this.phone='';
      this.addressEditing=false;
      this.cooldowns={sms:0,address:0};
      this.root.hidden=false;
      if(this.startButton)this.startButton.hidden=true;
      this.body.hidden=false;
      this.state='loading';
      this.message='';
      this.render();
      this.lookup();
    }

    async lookup(retryWithoutSession=true,messageAfter=''){
      const hadSession=Boolean(this.api.qsl.getSession?.(this.callsign));
      try{
        const data=await this.api.qsl.lookup(this.callsign);
        this.data={};
        this.eligibleIds=[];
        this.appliedIds=[];
        this.appliedItems=[];
        this.verifyToken='';
        this.capture(data);
        this.stateByMode(data.mode);
        if(messageAfter){this.message=messageAfter;this.render();}
      }catch(error){
        if(retryWithoutSession&&hadSession&&isSessionExpired(error)){
          this.api.qsl.clearSession(this.callsign);
          return this.lookup(false,messageAfter||'身份验证已失效，请重新验证。');
        }
        this.message=error.status===404?'当前没有可申请的 QSL 卡片。':apiError(error,'查询');
        this.state='error';
        this.render();
      }
    }

    capture(data={}){
      this.data={...this.data,...data};
      if(data.captchaId)this.captchaId=String(data.captchaId);
      if(data.sessionToken)this.api.qsl.saveSession(this.callsign,data.sessionToken);
      if(Array.isArray(data.eligibleQsoIds))this.eligibleIds=data.eligibleQsoIds.slice();
      if(Array.isArray(data.appliedQsoIds))this.appliedIds=data.appliedQsoIds.map(value=>String(value));
      if(Array.isArray(data.appliedItems))this.appliedItems=data.appliedItems.slice();
      const remoteItems=data.eligibleItems||data.qsoItems||data.qsos;
      if(Array.isArray(remoteItems)&&remoteItems.length)this.qsoItems=[...this.qsoItems,...remoteItems];
    }

    stateByMode(mode){
      switch(String(mode||'')){
        case'mask':
          this.state='maskVerify';
          break;
        case'sms':
          this.state='smsSend';
          this.smsSent=false;
          break;
        case'locked':
          this.unlockMode=String(this.data.unlock||this.data.unlockMode||(this.data.phoneMask?'mask':'sms')).toLowerCase();
          if(this.unlockMode!=='mask'&&this.unlockMode!=='sms'){
            this.message='申请状态无法识别，请稍后重试。';
            this.state='error';
            break;
          }
          this.state='locked';
          break;
        case'session':
          this.authenticated(this.data);
          return;
        case'status':
          this.state='status';
          break;
        case'already_sent':
          this.state='already_sent';
          break;
        default:
          this.message='申请状态无法识别，请稍后重试。';
          this.state='error';
          break;
      }
      this.render();
    }

    async withCaptcha(action){
      try{return await action({});}
      catch(error){
        if(!error.captchaRequired&&!error.captchaId)throw error;
        this.captchaId=error.captchaId||this.captchaId;
        const runner=this.captcha?.run||this.captcha?.verify;
        if(typeof runner!=='function')throw new Error('安全验证组件未就绪。');
        const fields=await runner.call(this.captcha,this.captchaId);
        this.capture(fields);
        return action(fields);
      }
    }

    authenticated(data){
      this.capture(data);
      if(data.verifyToken)this.verifyToken=String(data.verifyToken);
      this.addressEditing=false;
      this.smsSent=false;
      this.state=data.mode==='status'?'status':data.mode==='already_sent'?'already_sent':'ready';
      this.message='';
      this.render();
    }

    async verifyMask(unlock=false){
      const input=this.body.querySelector('[data-middle-digits]');
      const middleDigits=input?.value.trim()||'';
      if(!/^\d{4}$/.test(middleDigits)){this.message='请输入手机号中间 4 位。';this.render();return;}
      this.busy(true);
      try{
        const data=await this.withCaptcha(fields=>unlock?this.api.qsl.unlock({callsign:this.callsign,middleDigits,captchaFields:fields}):this.api.qsl.verifyPhone({callsign:this.callsign,middleDigits,captchaFields:fields}));
        this.authenticated(data);
      }catch(error){this.message=apiError(error);this.busy(false);this.render();}
    }

    async sendSms(address=false){
      if(address){
        if(!this.api.qsl.getSession(this.callsign)){this.message='身份验证已失效，请重新验证。';this.render();return;}
        if(this.cooldowns.address>0)return;
      }else{
        const phone=this.body.querySelector('[data-phone]')?.value.trim()||'';
        if(!/^1[3-9]\d{9}$/.test(phone)){this.message='请输入有效的国内 11 位手机号。';this.render();return;}
        this.phone=phone;
      }
      this.busy(true);
      try{
        const phone=this.body.querySelector('[data-phone]')?.value.trim()||this.phone;
        const data=await this.withCaptcha(fields=>address?this.api.qsl.sendAddressSms({callsign:this.callsign,captchaFields:fields}):this.api.qsl.sendSms({callsign:this.callsign,phone,captchaFields:fields}));
        this.capture(data);
        this.smsSent=true;
        this.startCooldown(address?'address':'sms',Number(data.cooldownSeconds||60));
        this.state='smsVerify';
        this.message='验证码已发送。';
        this.busy(false);
        this.render();
      }catch(error){
        if(address&&isSessionExpired(error)){
          this.api.qsl.clearSession(this.callsign);
          this.addressEditing=false;
          this.isBusy=false;
          return this.lookup(false,'身份验证已失效，请重新验证。');
        }
        if(error.status===403){this.addressEditing=false;this.state='error';}
        this.message=apiError(error);this.busy(false);this.render();
      }
    }

    async verifySms(){
      const phone=this.body.querySelector('[data-phone]')?.value.trim()||this.phone;
      const code=this.body.querySelector('[data-sms-code]')?.value.trim()||'';
      if(!/^1[3-9]\d{9}$/.test(phone)){this.message='请输入有效的国内 11 位手机号。';this.render();return;}
      if(!code){this.message='请输入短信验证码。';this.render();return;}
      this.busy(true);
      try{
        const data=await this.api.qsl.verifySms({callsign:this.callsign,phone,code});
        this.authenticated(data);
      }catch(error){this.message=apiError(error);this.busy(false);this.render();}
    }

    async submit(){
      const selectedKeys=[...this.body.querySelectorAll('input[name="qsoIds"]:checked')].map(input=>String(input.value));
      const eligibleByKey=new Map(this.eligibleIds.map(id=>[String(id),id]));
      const selected=selectedKeys.map(key=>eligibleByKey.get(key));
      if(!selected.length){this.message='请至少选择一条通联。';this.render();return;}
      if(selected.some(id=>id===undefined)||selected.length!==selectedKeys.length){this.message='所选通联不可申请，请重新选择。';this.render();return;}
      const recipient=this.body.querySelector('[data-recipient]')?.value.trim()||'';
      const address=this.body.querySelector('[data-address]')?.value.trim()||'';
      const postalCode=this.body.querySelector('[data-postal]')?.value.trim()||'';
      const email=this.body.querySelector('[data-email]')?.value.trim()||'';
      const notifySentEmail=Boolean(this.body.querySelector('[data-notify]')?.checked);
      if(this.data.needAddress&&( !recipient||!address)){this.message='请填写收件人和邮寄地址。';this.render();return;}
      if(!validPostalCode(postalCode)){this.message='邮编格式无效。';this.render();return;}
      if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){this.message='邮箱格式无效。';this.render();return;}
      if(!this.verifyToken){this.message='身份验证已失效，请重新验证。';this.render();return;}
      this.busy(true);
      try{
        const data=await this.api.qsl.submit({verifyToken:this.verifyToken,qsoIds:selected,recipientName:recipient||undefined,mailingAddress:address||undefined,postalCode:postalCode||undefined,email:email||undefined,notifySentEmail});
        this.verifyToken='';
        this.capture({...data,mode:'status'});
        this.state='status';
        this.isBusy=false;
        this.message='申请已提交。';
        this.render();
      }catch(error){
        if(isVerifyTokenExpired(error)){
          this.verifyToken='';
          this.isBusy=false;
          return this.lookup(true,'身份验证已失效，请重新验证。');
        }
        if(error.status===409){
          this.verifyToken='';
          this.isBusy=false;
          return this.lookup(true,'申请状态已更新，请查看最新结果。');
        }
        if(isSessionExpired(error)){
          this.api.qsl.clearSession(this.callsign);
          this.verifyToken='';
          this.isBusy=false;
          return this.lookup(false,'身份验证已失效，请重新验证。');
        }
        if(error.status===403)this.state='error';
        this.message=apiError(error);
        this.busy(false);
        this.render();
      }
    }

    async updateAddress(){
      const code=this.body.querySelector('[data-sms-code]')?.value.trim()||'';
      const address=this.body.querySelector('[data-address]')?.value.trim()||'';
      const postalCode=this.body.querySelector('[data-postal]')?.value.trim()||'';
      const email=this.body.querySelector('[data-email]')?.value.trim()||'';
      const notifySentEmail=Boolean(this.body.querySelector('[data-notify]')?.checked);
      if(!code||!address){this.message='请输入验证码和邮寄地址。';this.render();return;}
      if(!validPostalCode(postalCode)){this.message='邮编格式无效。';this.render();return;}
      if(email&&!/^\S+@\S+\.\S+$/.test(email)){this.message='邮箱格式无效。';this.render();return;}
      if(!this.api.qsl.getSession(this.callsign)){this.message='身份验证已失效，请重新验证。';this.render();return;}
      this.busy(true);
      try{
        const data=await this.api.qsl.verifyAddressUpdate({callsign:this.callsign,code,mailingAddress:address,postalCode,email,notifySentEmail});
        this.message='邮寄信息已更新。';
        this.authenticated({...data,mode:'status'});
      }catch(error){
        if(isSessionExpired(error)){
          this.api.qsl.clearSession(this.callsign);
          this.addressEditing=false;
          this.isBusy=false;
          return this.lookup(false,'身份验证已失效，请重新验证。');
        }
        if(error.status===403){this.addressEditing=false;this.state='error';}
        this.message=apiError(error);this.busy(false);this.render();
      }
    }

    editAddress(){
      if(!this.api.qsl.getSession(this.callsign)){this.message='身份验证已失效，请重新验证。';this.render();return;}
      this.addressEditing=true;
      this.smsSent=false;
      this.state='smsSend';
      this.message='修改邮寄信息前需要短信验证。';
      this.render();
    }

    startCooldown(type,seconds){
      this.cooldowns[type]=Math.max(0,Number(seconds)||60);
      clearInterval(this.timers[type]);
      this.timers[type]=setInterval(()=>{
        this.cooldowns[type]=Math.max(0,this.cooldowns[type]-1);
        if(this.cooldowns[type]===0)clearInterval(this.timers[type]);
        this.render();
      },1000);
    }

    busy(value){this.isBusy=value;this.render();}

    matchItem(id,fallback){
      const found=this.qsoItems.find(item=>String(item.id)===String(id));
      return found||fallback||null;
    }

    summary(item){
      const date=item.qsoDatetime?new Date(item.qsoDatetime):null;
      const dateText=date&&!Number.isNaN(date.getTime())?new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'}).format(date):'';
      return[dateText,item.frequency,item.mode].filter(Boolean).join(' · ')||'通联记录';
    }

    isSent(item){
      const value=item?.qslSent??item?.qsl_sent;
      return value===true||value===1||value==='1';
    }

    statusSummary(item){
      const parts=[this.summary(item),this.statusLabel(item)];
      const sentAt=item?.qslSentAt??item?.qsl_sent_at;
      const tracking=item?.qslSentTracking??item?.qsl_sent_tracking;
      if(sentAt)parts.push(`寄出时间：${text(sentAt)}`);
      if(tracking)parts.push(`物流 / 单号：${text(tracking)}`);
      return parts.join(' · ');
    }

    renderMessage(parent){
      if(this.message)parent.append(element('p','qsl-message',this.message));
    }

    render(){
      if(!this.body)return;
      this.body.replaceChildren();
      this.body.className='qsl-body';
      this.heading.textContent=this.state==='loading'?'正在准备申请……':this.state==='error'?'申请暂时无法继续。':'填写必要信息后继续。';
      if(this.state==='loading'){this.body.append(element('div','notice','正在查询申请状态……'));return;}
      if(this.state==='error'){this.body.append(element('div','notice error',this.message||'申请操作未完成，请稍后重试。'));return;}
      if(this.state==='maskVerify')this.renderMask(this.body,false);
      else if(this.state==='smsSend')this.addressEditing?this.renderAddressSend(this.body):this.renderSmsSend(this.body);
      else if(this.state==='smsVerify')this.addressEditing?this.renderAddressVerify(this.body):this.renderSmsVerify(this.body);
      else if(this.state==='locked')this.renderLocked(this.body);
      else if(this.state==='ready')this.renderReady(this.body);
      else if(this.state==='status')this.renderStatus(this.body);
      else if(this.state==='already_sent')this.renderAlreadySent(this.body);
      this.renderMessage(this.body);
    }

    renderMask(parent,unlock){
      const section=element('div','qsl-flow');
      section.append(element('p','',this.data.phoneMask?`手机号：${this.data.phoneMask}`:'请完成手机号验证。'),element('p','qsl-help','请输入手机号中间 4 位：'));
      const input=element('input');
      input.type='text';input.inputMode='numeric';input.maxLength=4;input.placeholder='____';input.autocomplete='off';input.dataset.middleDigits='';
      const button=element('button','primary',this.isBusy?'验证中……':unlock?'解锁并继续':'验证');
      button.type='button';button.disabled=Boolean(this.isBusy);button.addEventListener('click',()=>this.verifyMask(unlock));
      const row=element('div','qsl-actions');row.append(input,button);section.append(row);parent.append(section);
    }

    renderLocked(parent){
      const section=element('div','qsl-flow');
      section.append(element('p','',this.eligibleIds.length?'该呼号已有申请，请完成身份核验后查看。':'该呼号已有申请，请完成身份核验后查看。'));
      if(this.unlockMode==='sms'){
        this.renderSmsSend(section,true);
      }else{
        this.renderMask(section,true);
      }
      parent.append(section);
    }

    renderSmsSend(parent,locked=false){
      const section=element('div','qsl-flow');
      section.append(element('p','',locked?'请输入手机号并完成短信验证：':'请输入手机号并完成短信验证：'));
      const phone=element('input');phone.type='tel';phone.inputMode='numeric';phone.maxLength=11;phone.pattern='1[3-9][0-9]{9}';phone.placeholder='手机号';phone.autocomplete='tel';phone.value=this.phone;phone.dataset.phone='';
      const send=element('button','secondary',this.cooldowns.sms>0?`${this.cooldowns.sms} 秒后可重发`:'发送验证码');
      send.type='button';send.disabled=Boolean(this.isBusy||this.cooldowns.sms>0);send.addEventListener('click',()=>this.sendSms(false));
      const row=element('div','qsl-actions');row.append(phone,send);section.append(row);parent.append(section);
    }

    renderSmsVerify(parent){
      const section=element('div','qsl-flow');
      section.append(element('p','', '请输入短信验证码：'));
      const phone=element('input');phone.type='tel';phone.inputMode='numeric';phone.maxLength=11;phone.pattern='1[3-9][0-9]{9}';phone.placeholder='手机号';phone.autocomplete='tel';phone.value=this.phone;phone.dataset.phone='';
      const code=element('input');code.type='text';code.inputMode='numeric';code.maxLength=8;code.placeholder='验证码';code.autocomplete='one-time-code';code.dataset.smsCode='';
      const verify=element('button','primary',this.isBusy?'验证中……':'验证');verify.type='button';verify.disabled=Boolean(this.isBusy);verify.addEventListener('click',()=>this.verifySms());
      const row=element('div','qsl-actions');row.append(phone,code,verify);section.append(row);parent.append(section);
    }

    renderReady(parent){
      const available=this.eligibleIds.map(id=>({id,item:this.matchItem(id)})).filter(entry=>entry.item&&!this.appliedIds.includes(String(entry.id))&&!this.isSent(entry.item));
      if(!available.length){this.state='already_sent';this.renderAlreadySent(parent);return;}
      const section=element('div','qsl-flow');
      section.append(element('p','qsl-help','请选择要申请的通联（不会自动全选）：'));
      const list=element('div','qsl-choice-list');
      available.forEach(({id,item})=>{
        const label=element('label','qsl-choice');
        const checkbox=element('input');checkbox.type='checkbox';checkbox.name='qsoIds';checkbox.value=id;
        label.append(checkbox,element('span','',this.summary(item)));list.append(label);
      });
      section.append(list);
      const fields=element('div','qsl-form-grid');
      const recipient=addField(fields,'收件人',this.data.recipientName||'',Boolean(this.data.needAddress));recipient.dataset.recipient='';
      const address=addField(fields,'邮寄地址',this.data.mailingAddress||'',Boolean(this.data.needAddress));address.dataset.address='';
      const postal=addField(fields,'邮编',this.data.postalCode||'');postal.dataset.postal='';
      const email=addField(fields,'邮箱',this.data.email||'');email.type='email';email.dataset.email='';
      const notify=element('label','check');const notifyInput=element('input');notifyInput.type='checkbox';notifyInput.checked=Boolean(this.data.qslSentEmailNotify);notifyInput.dataset.notify='';notify.append(notifyInput,element('span','', '接收寄出通知'));fields.append(notify);
      section.append(fields);
      const submit=element('button','primary',this.isBusy?'提交中……':'提交申请');submit.type='button';submit.disabled=Boolean(this.isBusy);submit.addEventListener('click',()=>this.submit());section.append(submit);
      parent.append(section);
    }

    renderStatus(parent){
      const section=element('div','qsl-flow');
      section.append(element('p','',`申请状态：${this.statusLabel(this.data)}`));
      const summary=element('div','qsl-private-summary');
      for(const [label,value] of [['收件人',this.data.recipientName||this.data.recipientNameMask],['邮寄地址',this.data.mailingAddress||this.data.mailingAddressMask],['邮编',this.data.postalCode||this.data.postalCodeMask],['邮箱',this.data.email||this.data.emailMask]]){
        if(value)summary.append(element('p','',`${label}：${value}`));
      }
      if(summary.childElementCount)section.append(summary);
      const sentAt=this.data.qslSentAt??this.data.qsl_sent_at;
      const tracking=this.data.qslSentTracking??this.data.qsl_sent_tracking;
      if(sentAt)section.append(element('p','',`寄出时间：${text(sentAt)}`));
      if(tracking)section.append(element('p','',`物流 / 单号：${text(tracking)}`));
      const applied=this.appliedItems.length?this.appliedItems:this.data.appliedItems||[];
      if(applied.length){
        const list=element('ul','qsl-applied-list');
        applied.forEach(item=>list.append(element('li','',this.statusSummary(item))));
        section.append(element('p','qsl-help','已申请通联：'),list);
      }
      if(this.api.qsl.getSession(this.callsign)){
        const button=element('button','secondary','修改邮寄信息');button.type='button';button.disabled=Boolean(this.isBusy);button.addEventListener('click',()=>this.editAddress());section.append(button);
      }
      parent.append(section);
    }

    statusLabel(item){
      if(this.isSent(item))return'已寄出';
      if(item?.statusLabel&&item.statusLabel!=='已寄出')return String(item.statusLabel);
      return'待寄出';
    }

    renderAlreadySent(parent){
      const section=element('div','qsl-flow');
      section.append(element('p','', '当前没有可申请的 QSL 卡片。'));
      const applied=this.appliedItems.length?this.appliedItems:this.data.appliedItems||[];
      if(applied.length){const list=element('ul','qsl-applied-list');applied.forEach(item=>list.append(element('li','',this.statusSummary(item))));section.append(list);}
      parent.append(section);
    }

    renderAddressSend(parent){
      const section=element('div','qsl-flow');
      section.append(element('p','', '修改邮寄信息前需要短信验证。'));
      const send=element('button','secondary',this.cooldowns.address>0?`${this.cooldowns.address} 秒后可重发`:'发送验证码');send.type='button';send.disabled=Boolean(this.isBusy||this.cooldowns.address>0);send.addEventListener('click',()=>this.sendSms(true));section.append(send);parent.append(section);
    }

    renderAddressVerify(parent){
      const section=element('div','qsl-flow');
      section.append(element('p','', '请输入验证码并填写新的邮寄信息：'));
      const code=element('input');code.type='text';code.inputMode='numeric';code.maxLength=8;code.placeholder='验证码';code.autocomplete='one-time-code';code.dataset.smsCode='';section.append(code);
      const fields=element('div','qsl-form-grid');
      const address=addField(fields,'邮寄地址','',true);address.dataset.address='';
      const postal=addField(fields,'邮编','');postal.dataset.postal='';
      const email=addField(fields,'邮箱',this.data.email||'');email.type='email';email.dataset.email='';
      const notify=element('label','check');const notifyInput=element('input');notifyInput.type='checkbox';notifyInput.checked=Boolean(this.data.qslSentEmailNotify);notifyInput.dataset.notify='';notify.append(notifyInput,element('span','', '接收寄出通知'));fields.append(notify);
      section.append(fields);
      const button=element('button','primary',this.isBusy?'保存中……':'验证并保存');button.type='button';button.disabled=Boolean(this.isBusy);button.addEventListener('click',()=>this.updateAddress());section.append(button);parent.append(section);
    }
  }

  global.QslApplyController=QslApplyController;
})(window);
