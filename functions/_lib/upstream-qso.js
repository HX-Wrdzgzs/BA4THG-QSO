import{normalizeCallsign}from'./http.js';
import{fingerprintQso,insertQsoStatement,normalizeQsoInput,updateQsoStatement}from'./qso.js';

const DEFAULT_API_BASE='https://api.mzyyun.com';
const DEFAULT_SITE_ORIGIN='https://qso.mizuki.top';

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
        if(source.managed_by==='external'){
          await updateQsoStatement(db,source.id,q,fingerprint,now).run();
          updated++;
        }else linked++;
        continue;
      }

      const existing=await db.prepare('SELECT id FROM qsos WHERE fingerprint=? AND deleted_at IS NULL').bind(fingerprint).first();
      let id=existing?.id||'';
      if(!id){
        const proposedId=crypto.randomUUID();
        const result=await insertQsoStatement(db,proposedId,q,fingerprint,'external',now).run();
        if(Number(result.meta?.changes||0)>0){
          id=proposedId;
          inserted++;
        }else{
          const raced=await db.prepare('SELECT id FROM qsos WHERE fingerprint=? AND deleted_at IS NULL').bind(fingerprint).first();
          if(!raced?.id)throw new Error('并发写入后无法定位记录');
          id=raced.id;
          linked++;
        }
      }else linked++;

      await db.prepare('INSERT OR IGNORE INTO qso_sources(qso_id,source,source_id,raw_json,first_seen_at,last_seen_at) VALUES(?,?,?,?,?,?)')
        .bind(id,sourceName,sourceId,JSON.stringify(x),now,now).run();
    }catch{
      rejected++;
    }
  }

  return{fetched:Array.isArray(items)?items.length:0,inserted,updated,linkedToExisting:linked,rejected};
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
    const response=await (options.fetchImpl||fetch)(`${apiBase}/public/qso?${params}`,{
      headers:{accept:'application/json',origin:siteOrigin},
      signal:controller.signal
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      return{
        ok:false,
        status:response.status,
        error:String(data?.error||`上游返回 HTTP ${response.status}`),
        captchaRequired:Boolean(data?.captchaRequired),
        captchaId:String(data?.captchaId||'')
      };
    }
    return{ok:true,status:response.status,data};
  }catch(error){
    return{ok:false,status:0,error:error?.name==='AbortError'?'上游请求超时':'上游暂不可用',captchaRequired:false,captchaId:''};
  }finally{
    clearTimeout(timeout);
  }
}
