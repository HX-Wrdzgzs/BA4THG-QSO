import{isValidCallsign,json,normalizeCallsign,parsePositiveInt}from'../../_lib/http.js';
import{rowToItem}from'../../_lib/qso.js';
import{archiveUpstreamItems,fetchUpstreamContact}from'../../_lib/upstream-qso.js';
import{getVerifiedReciprocalSnapshot}from'../../_lib/verified-reciprocal.js';

const corsHeaders={
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'GET, OPTIONS',
  'access-control-allow-headers':'accept, x-upstream-query-token'
};

function publicError(message,status=400,details){
  return json({error:message,...(details===undefined?{}:{details})},{status,headers:corsHeaders});
}

function refreshEnabled(url,request){
  if(url.searchParams.has('refresh')){
    return !['0','false','no','off'].includes(String(url.searchParams.get('refresh')||'').trim().toLowerCase());
  }
  // 首页本身已经在浏览器直连 mzyyun 并处理验证码；同源 fetch 默认只读 D1，避免重复打上游。
  const site=String(request.headers.get('sec-fetch-site')||'').toLowerCase();
  if(site==='same-origin')return false;
  try{
    const referer=request.headers.get('referer');
    if(referer&&new URL(referer).origin===url.origin)return false;
  }catch{}
  return true;
}

async function readArchive(db,call,q,page,limit){
  const offset=(page-1)*limit;
  const where=['is_public=1','deleted_at IS NULL','my_callsign=?','their_callsign=? COLLATE NOCASE'].join(' AND ');
  const bind=[call,q];
  const total=await db.prepare(`SELECT COUNT(*) total FROM qsos WHERE ${where}`).bind(...bind).first();
  const rows=await db.prepare(`SELECT * FROM qsos WHERE ${where} ORDER BY qso_datetime_utc DESC,id DESC LIMIT ? OFFSET ?`).bind(...bind,limit,offset).all();
  return{total:Number(total?.total||0),items:(rows.results||[]).map(rowToItem)};
}

export function onRequestOptions(){return new Response(null,{status:204,headers:corsHeaders});}

export async function onRequestGet(c){
  if(!c.env.DB)return publicError('通联档案数据库尚未配置',503);
  const url=new URL(c.request.url);
  const call=normalizeCallsign(c.env.OPERATOR_CALLSIGN||'BA4THG');
  const page=parsePositiveInt(url.searchParams.get('page'),1,1,100000);
  const limit=parsePositiveInt(url.searchParams.get('limit'),20,1,50);
  let q=normalizeCallsign(url.searchParams.get('q')||'');
  const legacy=normalizeCallsign(url.searchParams.get('callsign')||'');
  if(!q&&legacy&&legacy!==call)q=legacy;
  if(!q)return publicError('请输入要查询的呼号',400);
  if(!isValidCallsign(q))return publicError('呼号格式无效',400);

  const refresh=refreshEnabled(url,c.request);
  const queryToken=String(c.request.headers.get('x-upstream-query-token')||'').slice(0,8192);
  let upstream={attempted:false,ok:false,status:0,captchaRequired:false,captchaId:'',archived:null};
  let live=null;

  if(refresh){
    live=await fetchUpstreamContact({
      callsign:q,
      page,
      limit,
      queryToken,
      apiBase:c.env.UPSTREAM_API_BASE||undefined,
      siteOrigin:c.env.PUBLIC_SITE_ORIGIN||'https://qso.mizuki.top'
    });
    upstream={
      attempted:true,
      ok:live.ok,
      status:live.status,
      captchaRequired:Boolean(live.captchaRequired),
      captchaId:String(live.captchaId||''),
      diagnostic:live.diagnostic||null,
      archived:null
    };
    if(!live.ok)upstream.error=live.error||'上游暂不可用';
  }

  try{
    if(live?.ok){
      // contact 查询的 station 字段语义由上游定义，真正的写入边界在逐条 QSO 校验。
      upstream.station=normalizeCallsign(live.data?.station||'');
      const items=Array.isArray(live.data?.items)?live.data.items:[];
      upstream.total=Number(live.data?.total||0);
      upstream.archived=await archiveUpstreamItems(c.env.DB,items,call,{
        sourceName:'mzyyun_api',
        expectedTheirCallsign:q,
        skipUnchanged:true,
        updateQso:true,
        promoteExisting:true
      });
    }

    let archive=await readArchive(c.env.DB,call,q,page,limit);
    let fallback={attempted:false,ok:false,kind:'verified-reciprocal-snapshot',archived:null};

    // 上游当前对未正确绑定的 Origin 会异常返回 500。仅在 D1 尚无记录时使用人工核验过的公开互证快照做一次性回填。
    if(archive.total===0){
      const snapshot=getVerifiedReciprocalSnapshot(call,q);
      if(snapshot){
        fallback={
          attempted:true,
          ok:true,
          kind:'verified-reciprocal-snapshot',
          source:snapshot.source,
          evidenceStation:snapshot.evidenceStation,
          verifiedAt:snapshot.verifiedAt,
          archived:null
        };
        fallback.archived=await archiveUpstreamItems(c.env.DB,snapshot.items,call,{
          sourceName:snapshot.source,
          expectedTheirCallsign:q,
          skipUnchanged:true,
          updateQso:false,
          promoteExisting:false
        });
        archive=await readArchive(c.env.DB,call,q,page,limit);
      }
    }

    const accepted=Number(upstream.archived?.fetched||0)-Number(upstream.archived?.rejected||0);
    const total=Math.max(archive.total,upstream.ok&&accepted>0?Number(upstream.total||0):0);
    const upstreamFailed=Boolean(refresh&&!upstream.ok);
    const fallbackUsed=Boolean(fallback.ok&&Number(fallback.archived?.fetched||0)>0);
    const source=upstream.ok
      ?'本站长期档案（已尝试实时刷新并归档）'
      :fallbackUsed
        ?'本站长期档案（已用经验证的公开互证快照补齐）'
        :'本站长期档案';
    const warning=upstreamFailed
      ?fallbackUsed
        ?'实时上游当前异常；已使用经验证的公开互证快照补齐 D1。快照之后的新变化仍需等待上游绑定恢复。'
        :'实时上游当前异常；已返回本站现有长期档案，结果可能不完整。'
      :null;

    return json({
      station:call,
      search:q,
      page,
      limit,
      total,
      items:archive.items,
      source,
      stale:upstreamFailed,
      complete:Boolean(upstream.ok),
      degraded:Boolean(upstreamFailed||fallbackUsed),
      warning,
      upstream,
      fallback
    },{headers:{...corsHeaders,'cache-control':'no-store'}});
  }catch(e){
    return publicError(e instanceof Error?e.message:'查询失败',500);
  }
}
