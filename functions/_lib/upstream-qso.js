import{normalizeCallsign}from'./http.js';
import{fingerprintQso,insertQsoStatement,normalizeQsoInput,updateQsoStatement}from'./qso.js';

const DEFAULT_API_BASE='https://api.mzyyun.com';
const DEFAULT_SITE_ORIGIN='https://qso.mizuki.top';
const DEFAULT_USER_AGENT='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';

function mapUpstreamQso(x){
  return{
    myCallsign:x?.myCallsign,
    theirCallsign:x?.theirCallsign,
    qsoDatetime:x?.qsoDatetime??x?.qsoDatetimeUtc,
    frequency:x?.frequency??x?.frequencyDisplay,
    mode:x?.mode,
    rstSent:x?.rstSent,
    rstReceived:x?.rstReceived,
    myGrid:x?.myGrid??x?.my_grid??null,
    theirGrid:x?.theirGrid??x?.their_grid??x?.grid??null,
    myQth:x?.myQth,
    theirQth:x?.theirQth,
    myEquipment:x?.myEquipment,
    theirEquipment:x?.theirEquipment,
    myAntenna:x?.myAntenna,
    theirAntenna:x?.theirAntenna,
    myPower:x?.myPower??x?.myPowerW??x?.my_power_w,
    theirPower:x?.theirPower??x?.theirPowerW??x?.their_power_w,
    notes:x?.notes,
    weather:x?.weather,
    theirWeather:x?.theirWeather,
    qslSent:x?.qslSent,
    qslSentAt:x?.qslSentAt,
    qslReceived:x?.qslReceived,
    qslReceivedAt:x?.qslReceivedAt,
    isPublic:true
  };
}

export async function archiveUpstreamItems(db,items,operatorCall,options={}){
  const call=normalizeCallsign(operatorCall||'BA4THG');
  const expectedTheir=normalizeCallsign(options.expectedTheirCallsign||'');
  const sourceName=String(options.sourceName||'mzyyun_api');
  const updateQso=options.updateQso!==false;
  const promoteExisting=options.promoteExisting===undefined?sourceName==='mzyyun_api':Boolean(options.promoteExisting);
  let inserted=0,updated=0,linked=0,rejected=0;
  const now=new Date().toISOString();

  for(const x of Array.isArray(items)?items:[]){
    try{
      const sourceId=String(x?.id??'').trim();
      if(!sourceId)throw new Error('缺少上游 id');
      if(normalizeCallsign(x?.myCallsign||call)!==call)throw new Error('本台呼号不匹配');
      if(expectedTheir&&normalizeCallsign(x?.theirCallsign)!==expectedTheir)throw new Error('对方呼号不匹配');

      const q=normalizeQsoInput(mapUpstreamQso(x),{myCallsign:call});
      const fingerprint=await fingerprintQso(q);
      const source=await db.prepare('SELECT q.id,q.managed_by,s.raw_json FROM qso_sources s JOIN qsos q ON q.id=s.qso_id WHERE s.source=? AND s.source_id=?')
        .bind(sourceName,sourceId).first();

      if(source){
        const raw=JSON.stringify(x);
        if(options.skipUnchanged&&source.raw_json===raw){linked++;continue;}
        await db.prepare('UPDATE qso_sources SET raw_json=?,last_seen_at=? WHERE source=? AND source_id=?')
          .bind(raw,now,sourceName,sourceId).run();
        if(updateQso&&source.managed_by==='external'){
          await updateQsoStatement(db,source.id,q,fingerprint,now).run();
          updated++;
        }else linked++;
        continue;
      }

      const existing=await db.prepare('SELECT id,managed_by FROM qsos WHERE fingerprint=? AND deleted_at IS NULL').bind(fingerprint).first();
      let id=existing?.id||'';
      if(!id){
        const proposedId=crypto.randomUUID();
        const result=await insertQsoStatement(db,proposedId,q,fingerprint,'external',now).run();
        if(Number(result.meta?.changes||0)>0){
          id=proposedId;
          inserted++;
        }else{
          const raced=await db.prepare('SELECT id,managed_by FROM qsos WHERE fingerprint=? AND deleted_at IS NULL').bind(fingerprint).first();
          if(!raced?.id)throw new Error('并发写入后无法定位记录');
          id=raced.id;
          if(promoteExisting&&updateQso&&raced.managed_by==='external'){
            await updateQsoStatement(db,id,q,fingerprint,now).run();
            updated++;
          }else linked++;
        }
      }else if(promoteExisting&&updateQso&&existing.managed_by==='external'){
        await updateQsoStatement(db,id,q,fingerprint,now).run();
        updated++;
      }else linked++;

      await db.prepare('INSERT OR IGNORE INTO qso_sources(qso_id,source,source_id,raw_json,first_seen_at,last_seen_at) VALUES(?,?,?,?,?,?)')
        .bind(id,sourceName,sourceId,JSON.stringify(x),now,now).run();
    }catch{
      rejected++;
    }
  }

  return{fetched:Array.isArray(items)?items.length:0,inserted,updated,linkedToExisting:linked,rejected};
}

function responseDiagnostic(response){
  return{
    contentType:String(response.headers.get('content-type')||''),
    server:String(response.headers.get('server')||''),
    cfRay:String(response.headers.get('cf-ray')||''),
    requestId:String(response.headers.get('x-request-id')||response.headers.get('x-amzn-requestid')||'')
  };
}

export async function fetchUpstreamContact(options={}){
  const callsign=normalizeCallsign(options.callsign||'');
  const page=Math.max(1,Number.parseInt(options.page,10)||1);
  const limit=Math.min(50,Math.max(1,Number.parseInt(options.limit,10)||20));
  const apiBase=String(options.apiBase||DEFAULT_API_BASE).replace(/\/+$/,'');
  const siteOrigin=String(options.siteOrigin||DEFAULT_SITE_ORIGIN).replace(/\/+$/,'');
  const token=page===1?String(options.queryToken||'').slice(0,8192):'';
  const params=new URLSearchParams({callsign,role:'contact',page:String(page),limit:String(limit)});
  if(token)params.set('queryToken',token);

  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),8000);
  try{
    const headers={
      accept:'application/json, text/plain, */*',
      'accept-language':'zh-CN,zh;q=0.9,en;q=0.8',
      origin:siteOrigin,
      referer:`${siteOrigin}/`,
      'user-agent':String(options.userAgent||DEFAULT_USER_AGENT),
      'sec-fetch-dest':'empty',
      'sec-fetch-mode':'cors',
      'sec-fetch-site':'cross-site'
    };
    const response=await (options.fetchImpl||fetch)(`${apiBase}/public/qso?${params}`,{
      method:'GET',
      headers,
      redirect:'follow',
      signal:controller.signal
    });
    const raw=await response.text();
    let data={};
    try{data=JSON.parse(raw||'{}');}catch{}
    const diagnostic=responseDiagnostic(response);
    if(!response.ok){
      const plainText=!diagnostic.contentType.toLowerCase().includes('html')&&!diagnostic.contentType.toLowerCase().includes('json')?raw.trim().slice(0,160):'';
      return{
        ok:false,
        status:response.status,
        error:String(data?.error||plainText||`上游返回 HTTP ${response.status}`),
        captchaRequired:Boolean(data?.captchaRequired),
        captchaId:String(data?.captchaId||''),
        diagnostic
      };
    }
    return{ok:true,status:response.status,data,diagnostic};
  }catch(error){
    return{
      ok:false,
      status:0,
      error:error?.name==='AbortError'?'上游请求超时':'上游暂不可用',
      captchaRequired:false,
      captchaId:'',
      diagnostic:{exception:String(error?.name||'Error')}
    };
  }finally{
    clearTimeout(timeout);
  }
}
