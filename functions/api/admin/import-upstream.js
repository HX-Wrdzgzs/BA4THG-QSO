import{authorize,error,json,normalizeCallsign,readJson}from'../../_lib/http.js';
import{archiveUpstreamItems}from'../../_lib/upstream-qso.js';

export async function onRequestPost(c){
  const auth=await authorize(c.request,c.env);
  if(!auth.ok)return auth.response;
  if(!c.env.DB)return error('D1 数据库尚未绑定为 DB',503);

  const call=normalizeCallsign(c.env.OPERATOR_CALLSIGN||'BA4THG');
  const run=crypto.randomUUID();
  const started=new Date().toISOString();
  try{
    const body=await readJson(c.request,1_000_000);
    const items=Array.isArray(body.items)?body.items:[];
    const station=normalizeCallsign(body.station||call);
    if(station&&station!==call)return error(`上游返回台站 ${station}，与本站 ${call} 不一致`,409);
    if(items.length>50)return error('单批最多接收 50 条上游记录',400);

    await c.env.DB.prepare("INSERT INTO sync_runs(id,source,status,started_at) VALUES(?,'mzyyun_api_browser','running',?)").bind(run,started).run();
    const result=await archiveUpstreamItems(c.env.DB,items,call);
    await c.env.DB.prepare("UPDATE sync_runs SET status='success',finished_at=?,fetched_count=?,inserted_count=?,updated_count=? WHERE id=?")
      .bind(new Date().toISOString(),result.fetched,result.inserted,result.updated,run).run();
    return json({ok:true,runId:run,...result});
  }catch(e){
    const message=e instanceof Error?e.message:'同步入库失败';
    await c.env.DB.prepare("INSERT OR REPLACE INTO sync_runs(id,source,status,started_at,finished_at,error_message) VALUES(?,'mzyyun_api_browser','failed',?,?,?)")
      .bind(run,started,new Date().toISOString(),message.slice(0,1000)).run().catch(()=>{});
    return error(message,500);
  }
}
