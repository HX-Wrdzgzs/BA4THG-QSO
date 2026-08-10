"use strict";

const API=window.BA4THGPublicApi;
const STATION='BA4THG';
const form=document.querySelector('[data-query-form]');
const list=document.querySelector('[data-list]');
const loading=document.querySelector('[data-loading]');
const errorBox=document.querySelector('[data-error]');
const empty=document.querySelector('[data-empty]');
const pagination=document.querySelector('[data-pagination]');
const previous=document.querySelector('[data-prev]');
const next=document.querySelector('[data-next]');
const pageLabel=document.querySelector('[data-page-label]');
const meta=document.querySelector('[data-result-meta]');
const qslPanel=document.querySelector('[data-qsl-panel]');
const qslStart=document.querySelector('[data-qsl-start]');

const state={page:1,limit:20,total:0,busy:false,callsign:'',items:[]};
const qsl=new window.QslApplyController(qslPanel,API,API.captcha);

const text=(value,fallback='—')=>value===null||value===undefined||value===''?fallback:String(value);
const normalizeCallsign=value=>String(value||'').trim().toUpperCase().replace(/\s+/g,'');
const validCallsign=value=>/^[A-Z0-9/]{3,16}$/.test(value);

function formatDate(value){
  const date=new Date(value);
  return Number.isNaN(date.getTime())?text(value):new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
}

function formatFrequency(value){
  if(value===null||value===undefined||value==='')return'频率未记录';
  const result=String(value).trim().replace(/\s*MHz\s*$/i,'');
  return `${result} MHz`;
}

function power(value){return value===null||value===undefined||value===''?'—':`${value} W`;}

function node(tag,className,content){
  const item=document.createElement(tag);
  if(className)item.className=className;
  if(content!==undefined)item.textContent=content;
  return item;
}

function field(parent,label,value){
  const row=node('div','station-field');
  row.append(node('span','field-label',label),node('span','field-value',text(value)));
  parent.append(row);
}

function station(title,item,side){
  const box=node('section','station-side');
  box.append(node('h3','station-call',title));
  field(box,'地点',side==='their'?item.theirQth:item.myQth);
  field(box,'设备',side==='their'?item.theirEquipment:item.myEquipment);
  field(box,'天线',side==='their'?item.theirAntenna:item.myAntenna);
  field(box,'功率',power(side==='their'?item.theirPower:item.myPower));
  field(box,'天气',side==='their'?item.theirWeather:item.weather);
  return box;
}

function record(item){
  const article=node('article','qso-record');
  const head=node('div','record-head');
  const summary=node('div','record-summary');
  const headline=`${text(item.theirCallsign)} ↔ ${text(item.myCallsign||STATION)}`;
  const details=`${formatDate(item.qsoDatetime)} · ${text(item.mode)} · ${formatFrequency(item.frequency)} · RST ${text(item.rstSent)}/${text(item.rstReceived)}`;
  summary.append(node('strong','',headline),node('span','',details));
  const flags=node('div','flags');
  flags.append(node('span',`flag${item.qslSent?' on':''}`,item.qslSent?'已寄 QSL':'未寄 QSL'),node('span',`flag${item.qslReceived?' on':''}`,item.qslReceived?'已收 QSL':'未收 QSL'));
  head.append(summary,flags);
  const pair=node('div','station-pair');
  pair.append(station(text(item.theirCallsign),item,'their'),station(text(item.myCallsign||STATION),item,'my'));
  article.append(head,pair);
  if(item.notes){
    const note=node('div','record-note');
    note.append(node('span','field-label','备注'),node('span','field-value',item.notes));
    article.append(note);
  }
  return article;
}

function normalizeLive(item){
  return{
    ...item,
    myCallsign:normalizeCallsign(item.myCallsign||STATION),
    theirCallsign:normalizeCallsign(item.theirCallsign||''),
    qsoDatetime:item.qsoDatetime||item.qsoDatetimeUtc,
    frequency:item.frequency??item.frequencyDisplay??null,
    myGrid:item.myGrid??item.my_grid??null,
    theirGrid:item.theirGrid??item.their_grid??item.grid??null,
    myPower:item.myPower??item.myPowerW??item.my_power_w??null,
    theirPower:item.theirPower??item.theirPowerW??item.their_power_w??null
  };
}

function frequencyKey(value){return String(value??'').replace(/\s*MHz\s*$/i,'').trim();}

function dateKey(value){
  const date=new Date(value);
  return Number.isNaN(date.getTime())?String(value||''):date.toISOString();
}

function recordKey(item){
  const date=item.qsoDatetime||'';
  if(!date&&item.id)return`id:${item.id}`;
  return[
    normalizeCallsign(item.myCallsign||STATION),
    normalizeCallsign(item.theirCallsign),
    dateKey(date),
    frequencyKey(item.frequency),
    String(item.mode||'').trim().toUpperCase()
  ].join('|');
}

function reset(message='请输入呼号开始查询。'){
  state.total=0;
  state.callsign='';
  state.items=[];
  list.replaceChildren();
  loading.hidden=true;
  errorBox.hidden=true;
  empty.hidden=true;
  pagination.hidden=true;
  qslPanel.hidden=true;
  qslStart.hidden=false;
  qsl.body.hidden=true;
  meta.textContent=message;
}

async function archivedPage(callsign,page){
  const params=new URLSearchParams({q:callsign,page:String(page),limit:String(state.limit)});
  const response=await fetch(`./api/public/qsos?${params}`,{headers:{accept:'application/json'},cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error('查询暂时无法完成，请稍后重试。');
  return data;
}

async function livePage(callsign,page){
  try{return await API.fetchPublicQso({callsign,page,role:'contact',limit:state.limit});}
  catch(error){
    if(page===1&&error.captchaRequired&&error.captchaId){
      try{
        const fields=await API.captcha.verify(error.captchaId);
        const result=await API.verifyQueryCaptcha(fields);
        return API.fetchPublicQso({callsign,page,role:'contact',limit:state.limit,queryToken:result.queryToken});
      }catch(captchaError){
        if(captchaError.status===429||captchaError.captchaRequired)throw new Error('查询较为频繁，请稍后再试。');
        throw new Error('请先完成安全验证。');
      }
    }
    if(error.status===429)throw new Error('查询较为频繁，请稍后再试。');
    throw new Error('查询暂时无法完成，请稍后重试。');
  }
}

function renderPages(){
  const pages=Math.max(1,Math.ceil(state.total/state.limit));
  pageLabel.textContent=`第 ${state.page} / ${pages} 页`;
  previous.disabled=state.page<=1||state.busy;
  next.disabled=state.page>=pages||state.busy;
  pagination.hidden=state.total<=state.limit;
}

async function load(){
  if(state.busy)return;
  const callsign=normalizeCallsign(new FormData(form).get('q'));
  if(!callsign){
    const url=new URL(location.href);url.search='';history.replaceState(null,'',url);reset();return;
  }
  if(!validCallsign(callsign)){
    reset('请输入有效的业余无线电呼号。');
    errorBox.textContent='呼号格式无效。';
    errorBox.hidden=false;
    return;
  }

  state.busy=true;
  state.callsign=callsign;
  loading.hidden=false;
  errorBox.hidden=true;
  empty.hidden=true;
  list.replaceChildren();
  qslPanel.hidden=true;
  const url=new URL(location.href);
  url.search='';url.searchParams.set('q',callsign);if(state.page>1)url.searchParams.set('page',String(state.page));
  history.replaceState(null,'',url);

  try{
    const [archiveResult,liveResult]=await Promise.allSettled([archivedPage(callsign,state.page),livePage(callsign,state.page)]);
    const archive=archiveResult.status==='fulfilled'?archiveResult.value:{items:[],total:0};
    const live=liveResult.status==='fulfilled'?liveResult.value:{items:[],total:0};
    const archiveItems=archive.items||[];
    const liveItems=(live.items||[]).map(normalizeLive);
    const seen=new Set();
    const combined=[...liveItems,...archiveItems].filter(item=>{const key=recordKey(item);if(seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>new Date(b.qsoDatetime)-new Date(a.qsoDatetime));
    if(archiveResult.status==='rejected'&&liveResult.status==='rejected')throw new Error('查询暂时无法完成，请稍后重试。');
    state.items=combined;
    state.total=Math.max(Number(archive.total||0),Number(live.total||0),combined.length);
    state.limit=Number(archive.limit||state.limit);
    meta.textContent=combined.length?`${callsign} · 找到 ${state.total} 条通联记录`:`${callsign} · 没有找到通联记录`;
    const fragment=document.createDocumentFragment();
    combined.forEach(item=>fragment.append(record(item)));
    list.append(fragment);
    empty.hidden=combined.length>0;
    if(liveResult.status==='rejected'&&archiveItems.length){
      errorBox.textContent=liveResult.reason?.message||'近期查询暂时无法完成，已显示本站留存记录。';
      errorBox.hidden=false;
    }else if(archiveResult.status==='rejected'&&liveItems.length){
      errorBox.textContent='历史记录暂时无法读取，已显示当前可用记录。';
      errorBox.hidden=false;
    }
    if(state.total>0){
      qslPanel.hidden=false;
      qsl.setItems(combined);
      qsl.callsign=callsign;
      qslStart.hidden=false;
      qsl.body.hidden=true;
    }
  }catch(error){
    state.total=0;
    state.items=[];
    meta.textContent='查询失败';
    errorBox.textContent=error.message||'查询暂时无法完成，请稍后重试。';
    errorBox.hidden=false;
  }finally{
    state.busy=false;
    loading.hidden=true;
    renderPages();
  }
}

form.addEventListener('submit',event=>{event.preventDefault();state.page=1;load();});
previous.addEventListener('click',()=>{if(state.page>1){state.page-=1;load();}});
next.addEventListener('click',()=>{if(state.page*state.limit<state.total){state.page+=1;load();}});

const initial=new URL(location.href);
form.elements.q.value=normalizeCallsign(initial.searchParams.get('q')||'');
state.page=Math.max(1,Number.parseInt(initial.searchParams.get('page')||'1',10)||1);
if(form.elements.q.value)load();else reset();
