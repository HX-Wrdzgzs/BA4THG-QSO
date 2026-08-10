"use strict";

const API=window.BA4THGPublicApi;
const UPSTREAM_CALL='BA4THG';
const $=selector=>document.querySelector(selector);
const loading=$('[data-admin-loading]');
const denied=$('[data-admin-denied]');
const connection=$('[data-connection]');
const adminContent=$('[data-admin-content]');
const form=$('[data-entry-form]');
const resetBtn=$('[data-reset]');
const submit=$('[data-submit]');
const operation=$('[data-operation]');
const adminList=$('[data-admin-list]');
const adminError=$('[data-admin-error]');
const refresh=$('[data-refresh]');
const importFile=$('[data-import-file]');
const importBtn=$('[data-import]');
const importState=$('[data-import-state]');
const syncBtn=$('[data-sync]');
const syncState=$('[data-sync-state]');

let records=[];
let accessReady=false;

function setStatus(node,message,type=''){
  node.textContent=message;
  node.className=`status${type?` ${type}`:''}`;
}

function sourceName(value){
  const source=String(value||'').toLowerCase();
  if(source==='mzyyun_api'||source==='mzyyun_api_browser')return'近期记录同步';
  if(source==='adif_import')return'ADIF 文件导入';
  if(source==='csv_import')return'CSV 文件导入';
  if(source==='json_import')return'JSON 文件导入';
  if(source==='local'||source==='manual')return'手工录入';
  return value||'本站记录';
}

async function api(path,init={}){
  if(!accessReady)throw new Error('当前无法打开记录管理。');
  const headers=new Headers(init.headers||{});
  if(init.body&&!headers.has('content-type'))headers.set('content-type','application/json');
  const response=await fetch(path,{...init,credentials:'same-origin',headers});
  const contentType=response.headers.get('content-type')||'';
  const data=contentType.includes('json')?await response.json():await response.text();
  if(!response.ok)throw new Error(data?.error||'操作未完成，请稍后重试。');
  return{response,data};
}

function localValue(date=new Date()){
  return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
}

function reset(){
  form.reset();
  form.elements.id.value='';
  form.elements.myCallsign.value=UPSTREAM_CALL;
  form.elements.mode.value='FM';
  form.elements.qsoDatetime.value=localValue();
  form.elements.isPublic.checked=true;
  submit.textContent='保存记录';
  setStatus(operation,'');
}

function payload(){
  const data=new FormData(form);
  return{
    myCallsign:String(data.get('myCallsign')||'').trim().toUpperCase(),
    theirCallsign:String(data.get('theirCallsign')||'').trim().toUpperCase(),
    qsoDatetime:new Date(String(data.get('qsoDatetime'))).toISOString(),
    frequency:data.get('frequency')||null,
    mode:String(data.get('mode')||'').trim().toUpperCase(),
    myPower:data.get('myPower')||null,
    myEquipment:data.get('myEquipment')||null,
    myAntenna:data.get('myAntenna')||null,
    myQth:data.get('myQth')||null,
    theirQth:data.get('theirQth')||null,
    rstSent:data.get('rstSent')||null,
    rstReceived:data.get('rstReceived')||null,
    notes:data.get('notes')||null,
    qslSent:data.get('qslSent')==='on',
    qslReceived:data.get('qslReceived')==='on',
    isPublic:data.get('isPublic')==='on'
  };
}

function formatDate(value){
  const date=new Date(value);
  return Number.isNaN(date.getTime())?String(value||''):new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
}

function record(item){
  const article=document.createElement('article');
  article.className='qso-record';
  const primary=document.createElement('div');
  primary.className='record-primary';
  const callsign=document.createElement('strong');
  callsign.textContent=item.theirCallsign||'—';
  const date=document.createElement('time');
  date.textContent=formatDate(item.qsoDatetime);
  const summary=document.createElement('span');
  summary.textContent=`${item.frequency||'—'} · ${item.mode||'—'} · ${item.myPower?`${item.myPower} W`:'功率未填写'}`;
  primary.append(callsign,date,summary);

  const details=document.createElement('dl');
  details.className='record-details';
  for(const [label,value] of [
    ['设备',item.myEquipment],['天线',item.myAntenna],['本台地点',item.myQth],
    ['对方地点',item.theirQth],['RST',`${item.rstSent||'—'} / ${item.rstReceived||'—'}`],
    ['记录来源',sourceName(item.source)]
  ]){
    const wrapper=document.createElement('div');
    const title=document.createElement('dt');
    const text=document.createElement('dd');
    title.textContent=label;
    text.textContent=value||'—';
    wrapper.append(title,text);
    details.append(wrapper);
  }

  const actions=document.createElement('div');
  actions.className='record-actions';
  const editButton=document.createElement('button');
  editButton.type='button';
  editButton.textContent='编辑';
  editButton.addEventListener('click',()=>edit(item));
  const deleteButton=document.createElement('button');
  deleteButton.type='button';
  deleteButton.textContent='移入回收站';
  deleteButton.className='danger';
  deleteButton.addEventListener('click',()=>remove(item));
  actions.append(editButton,deleteButton);
  article.append(primary,details,actions);
  return article;
}

function edit(item){
  form.elements.id.value=item.id;
  for(const name of ['myCallsign','theirCallsign','frequency','mode','myPower','myEquipment','myAntenna','myQth','theirQth','rstSent','rstReceived','notes']){
    if(form.elements[name])form.elements[name].value=item[name]||'';
  }
  form.elements.qsoDatetime.value=localValue(new Date(item.qsoDatetime));
  form.elements.qslSent.checked=!!item.qslSent;
  form.elements.qslReceived.checked=!!item.qslReceived;
  form.elements.isPublic.checked=item.isPublic!==false;
  submit.textContent='保存修改';
  form.scrollIntoView({behavior:'smooth',block:'start'});
}

async function remove(item){
  if(!confirm(`确认将 ${item.theirCallsign} 的这条通联记录移入回收站？`))return;
  try{
    await api(`./api/admin/qsos/${encodeURIComponent(item.id)}`,{method:'DELETE'});
    setStatus(operation,'记录已移入回收站。','success');
    await load();
  }catch(error){setStatus(operation,error.message,'error');}
}

async function load(){
  adminError.hidden=true;
  try{
    const {data}=await api('./api/admin/qsos?limit=50');
    records=data.items||[];
    const fragment=document.createDocumentFragment();
    for(const item of records)fragment.append(record(item));
    adminList.replaceChildren(fragment);
    connection.textContent=`已准备 · 共 ${data.total||0} 条记录`;
    adminContent.hidden=false;
  }catch(error){
    adminContent.hidden=true;
    adminError.textContent=error.message;
    adminError.hidden=false;
    connection.textContent='记录管理暂不可用';
  }
}

form.addEventListener('submit',async event=>{
  event.preventDefault();
  submit.disabled=true;
  try{
    const id=form.elements.id.value;
    await api(id?`./api/admin/qsos/${encodeURIComponent(id)}`:'./api/admin/qsos',{method:id?'PATCH':'POST',body:JSON.stringify(payload())});
    setStatus(operation,id?'修改已保存。':'通联记录已保存。','success');
    reset();
    await load();
  }catch(error){setStatus(operation,error.message,'error');}
  finally{submit.disabled=false;}
});

function parseAdif(text){
  const output=[];
  for(const raw of text.split(/<EOR\s*>/i)){
    const fields={};
    const regex=/<([A-Z0-9_]+):(\d+)(?::[^>]*)?>([^<]*)/gi;
    let match;
    while((match=regex.exec(raw)))fields[match[1].toUpperCase()]=match[3].slice(0,+match[2]);
    if(!fields.CALL||!fields.QSO_DATE)continue;
    const time=(fields.TIME_ON||'000000').padEnd(6,'0').slice(0,6);
    const date=fields.QSO_DATE;
    output.push({sourceId:fields.APP_QSO_ID||date+time+fields.CALL,myCallsign:fields.STATION_CALLSIGN||fields.OPERATOR||UPSTREAM_CALL,theirCallsign:fields.CALL,qsoDatetime:`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T${time.slice(0,2)}:${time.slice(2,4)}:${time.slice(4,6)}Z`,frequency:fields.FREQ||null,band:fields.BAND||null,mode:fields.MODE||fields.SUBMODE||'UNKNOWN',rstSent:fields.RST_SENT||null,rstReceived:fields.RST_RCVD||null,myQth:fields.MY_QTH||null,theirQth:fields.QTH||null,myGrid:fields.MY_GRIDSQUARE||null,theirGrid:fields.GRIDSQUARE||null,myEquipment:fields.MY_RIG||null,myAntenna:fields.MY_ANTENNA||null,myPower:fields.TX_PWR||null,notes:fields.COMMENT||fields.NOTES||null,qslSent:fields.QSL_SENT==='Y',qslReceived:fields.QSL_RCVD==='Y',isPublic:true});
  }
  return output;
}

function parseCsv(text){
  const lines=text.replace(/\r/g,'').split('\n').filter(Boolean);
  const headers=(lines.shift()||'').split(',').map(value=>value.trim());
  return lines.map((line,index)=>{
    const values=line.split(','),item={sourceId:`csv-${index+1}`};
    headers.forEach((header,column)=>{item[header]=values[column]?.trim()||null;});
    return item;
  });
}

async function importData(){
  const file=importFile.files?.[0];
  if(!file){setStatus(importState,'请先选择要导入的文件。','error');return;}
  importBtn.disabled=true;
  try{
    const text=await file.text(),name=file.name.toLowerCase();
    let source,items;
    if(/\.adi(f)?$/.test(name)){source='adif_import';items=parseAdif(text);}
    else if(name.endsWith('.csv')){source='csv_import';items=parseCsv(text);}
    else{source='json_import';const parsed=JSON.parse(text);items=Array.isArray(parsed)?parsed:(parsed.qsos||parsed.records||[]);}
    if(!items.length)throw new Error('文件中没有识别到可导入的通联记录。');
    let inserted=0,skipped=0,rejected=0;
    for(let index=0;index<items.length;index+=100){
      setStatus(importState,`正在导入第 ${index+1}–${Math.min(index+100,items.length)} 条，共 ${items.length} 条……`);
      const {data}=await api('./api/admin/import',{method:'POST',body:JSON.stringify({source,records:items.slice(index,index+100)})});
      inserted+=Number(data.inserted||0);
      skipped+=Number(data.skippedAsDuplicate||0);
      rejected+=(data.rejected||[]).length;
    }
    setStatus(importState,`导入完成：新增 ${inserted} 条，重复 ${skipped} 条，无效 ${rejected} 条。`,'success');
    await load();
  }catch(error){setStatus(importState,error.message,'error');}
  finally{importBtn.disabled=false;}
}

async function upstreamPage(page,queryToken){
  return API.fetchPublicQso({callsign:UPSTREAM_CALL,role:'operator',page,limit:50,queryToken});
}

async function upstreamPageWithCaptcha(page){
  try{return await upstreamPage(page);}
  catch(error){
    if(page===1&&error.captchaRequired&&error.captchaId){
      const fields=await API.captcha.verify(error.captchaId);
      const result=await API.verifyQueryCaptcha(fields);
      return upstreamPage(page,result.queryToken||API.getQueryToken());
    }
    throw error;
  }
}

async function sync(){
  const first=await upstreamPageWithCaptcha(1);
  const pages=Math.max(1,Math.ceil(Number(first.total||0)/50));
  let fetched=0,inserted=0,updated=0,linked=0,rejected=0;
  for(let page=1;page<=pages;page++){
    setStatus(syncState,`正在读取第 ${page}/${pages} 页……`);
    const data=page===1?first:await upstreamPage(page);
    if(!data.items?.length)continue;
    const result=await api('./api/admin/import-upstream',{method:'POST',body:JSON.stringify({station:data.station||UPSTREAM_CALL,items:data.items})});
    fetched+=Number(result.data.fetched||0);
    inserted+=Number(result.data.inserted||0);
    updated+=Number(result.data.updated||0);
    linked+=Number(result.data.linkedToExisting||0);
    rejected+=Number(result.data.rejected||0);
  }
  return{total:Number(first.total||0),fetched,inserted,updated,linked,rejected};
}

async function exportData(format){
  try{
    const response=await fetch(`./api/admin/export?format=${format}`,{credentials:'same-origin'});
    if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||'导出失败，请稍后重试。');}
    const blob=await response.blob();
    const link=document.createElement('a');
    link.href=URL.createObjectURL(blob);
    link.download=`ba4thg-qso.${format==='adif'?'adi':'json'}`;
    link.click();
    setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  }catch(error){setStatus(operation,error.message,'error');}
}

refresh.addEventListener('click',load);
resetBtn.addEventListener('click',reset);
importBtn.addEventListener('click',importData);
syncBtn.addEventListener('click',async()=>{
  syncBtn.disabled=true;
  try{
    setStatus(syncState,'正在准备同步近期记录……');
    const result=await sync();
    setStatus(syncState,`同步完成：读取 ${result.total} 条；归档 ${result.fetched} 条，新增 ${result.inserted} 条，更新 ${result.updated} 条，关联已有 ${result.linked} 条，无效 ${result.rejected} 条。`,'success');
    await load();
  }catch(error){
    const message=error.status===429?'查询较为频繁，请稍后再试。':error.message;
    setStatus(syncState,message,'error');
  }finally{syncBtn.disabled=false;}
});
document.querySelectorAll('[data-export]').forEach(button=>button.addEventListener('click',()=>exportData(button.dataset.export)));

async function bootstrap(){
  try{
    const response=await fetch('./api/admin/session',{credentials:'same-origin',headers:{accept:'application/json'}});
    if(!response.ok)throw new Error('当前无法打开记录管理。');
    accessReady=true;
    loading.hidden=true;
    connection.textContent='已准备';
    reset();
    await load();
  }catch(error){
    loading.hidden=true;
    denied.textContent='当前无法打开记录管理。';
    denied.hidden=false;
    adminContent.hidden=true;
  }
}

bootstrap();
