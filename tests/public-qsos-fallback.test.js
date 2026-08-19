import{test}from'node:test';
import assert from'node:assert/strict';
import{onRequestGet}from'../functions/api/public/qsos.js';

function memoryD1(){
  const qsos=[];
  const sources=[];

  function sourceRow(source,sourceId){
    const link=sources.find(x=>x.source===source&&x.source_id===sourceId);
    if(!link)return null;
    const q=qsos.find(x=>x.id===link.qso_id);
    return q?{id:q.id,managed_by:q.managed_by,raw_json:link.raw_json}:null;
  }

  return{
    qsos,
    sources,
    prepare(sql){
      return{
        bind(...args){
          return{
            async first(){
              if(sql.includes('FROM qso_sources s JOIN qsos q'))return sourceRow(args[0],args[1]);
              if(sql.startsWith('SELECT id,managed_by FROM qsos WHERE fingerprint=')){
                const q=qsos.find(x=>x.fingerprint===args[0]&&!x.deleted_at);
                return q?{id:q.id,managed_by:q.managed_by}:null;
              }
              if(sql.startsWith('SELECT COUNT(*) total FROM qsos WHERE')){
                const [myCall,theirCall]=args;
                return{total:qsos.filter(q=>q.is_public===1&&!q.deleted_at&&q.my_callsign===myCall&&q.their_callsign.toUpperCase()===String(theirCall).toUpperCase()).length};
              }
              return null;
            },
            async all(){
              if(!sql.startsWith('SELECT * FROM qsos WHERE'))return{results:[]};
              const [myCall,theirCall,limit,offset]=args;
              const rows=qsos
                .filter(q=>q.is_public===1&&!q.deleted_at&&q.my_callsign===myCall&&q.their_callsign.toUpperCase()===String(theirCall).toUpperCase())
                .sort((a,b)=>b.qso_datetime_utc.localeCompare(a.qso_datetime_utc)||b.id.localeCompare(a.id))
                .slice(Number(offset),Number(offset)+Number(limit));
              return{results:rows.map(x=>({...x}))};
            },
            async run(){
              if(sql.startsWith('INSERT OR IGNORE INTO qsos(')){
                const [id,my_callsign,their_callsign,qso_datetime_utc,frequency_hz,frequency_display,band,mode,rst_sent,rst_received,my_qth,their_qth,my_grid,their_grid,my_equipment,their_equipment,my_antenna,their_antenna,my_power_w,their_power_w,notes,weather,their_weather,qsl_sent,qsl_sent_at,qsl_received,qsl_received_at,is_public,managed_by,fingerprint,created_at,updated_at]=args;
                if(qsos.some(q=>q.id===id||q.fingerprint===fingerprint))return{meta:{changes:0}};
                qsos.push({id,my_callsign,their_callsign,qso_datetime_utc,frequency_hz,frequency_display,band,mode,rst_sent,rst_received,my_qth,their_qth,my_grid,their_grid,my_equipment,their_equipment,my_antenna,their_antenna,my_power_w,their_power_w,notes,weather,their_weather,qsl_sent,qsl_sent_at,qsl_received,qsl_received_at,is_public,managed_by,fingerprint,created_at,updated_at,deleted_at:null});
                return{meta:{changes:1}};
              }
              if(sql.startsWith('INSERT OR IGNORE INTO qso_sources(')){
                const [qso_id,source,source_id,raw_json,first_seen_at,last_seen_at]=args;
                if(!sources.some(x=>x.source===source&&x.source_id===source_id))sources.push({qso_id,source,source_id,raw_json,first_seen_at,last_seen_at});
                return{meta:{changes:1}};
              }
              if(sql.startsWith('UPDATE qso_sources SET raw_json=')){
                const [raw,lastSeen,source,sourceId]=args;
                const row=sources.find(x=>x.source===source&&x.source_id===sourceId);
                if(row){row.raw_json=raw;row.last_seen_at=lastSeen;}
                return{meta:{changes:row?1:0}};
              }
              throw new Error(`memoryD1 unsupported SQL: ${sql}`);
            }
          };
        }
      };
    }
  };
}

test('public BA4VRM query seeds verified snapshot into D1 exactly once',async()=>{
  const DB=memoryD1();
  const request=new Request('https://qso.mizuki.top/api/public/qsos?q=BA4VRM&page=1&limit=20&refresh=0');
  const env={DB,OPERATOR_CALLSIGN:'BA4THG'};

  const first=await onRequestGet({request,env});
  assert.equal(first.status,200);
  const firstBody=await first.json();
  assert.equal(firstBody.total,4);
  assert.equal(firstBody.items.length,4);
  assert.equal(firstBody.fallback.ok,true);
  assert.equal(firstBody.fallback.archived.inserted,4);
  assert.equal(firstBody.items[0].theirCallsign,'BA4VRM');
  assert.equal(DB.qsos.length,4);
  assert.equal(DB.sources.length,4);

  const second=await onRequestGet({request:new Request(request.url),env});
  assert.equal(second.status,200);
  const secondBody=await second.json();
  assert.equal(secondBody.total,4);
  assert.equal(secondBody.items.length,4);
  assert.equal(secondBody.fallback.attempted,false);
  assert.equal(DB.qsos.length,4);
  assert.equal(DB.sources.length,4);
});
