import{createRemoteJWKSet,jwtVerify}from'jose';

export function json(data, init={}){const h=new Headers(init.headers||{});h.set('content-type','application/json; charset=utf-8');h.set('cache-control',h.get('cache-control')||'no-store');h.set('x-content-type-options','nosniff');return new Response(JSON.stringify(data),{...init,headers:h})}
export function error(message,status=400,details){return json({error:message,...(details===undefined?{}:{details})},{status})}
export function parsePositiveInt(value,fallback,min,max){const n=Number.parseInt(value??'',10);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback}
export function normalizeCallsign(value){return String(value??'').trim().toUpperCase().replace(/\s+/g,'')}
export function isValidCallsign(value){return /^[A-Z0-9/]{3,16}$/.test(value)}

const jwksByTeamDomain=new Map();

function accessConfig(env){
  const rawDomain=String(env?.ACCESS_TEAM_DOMAIN??'').trim();
  const audience=String(env?.ACCESS_AUD??'').trim();
  if(!rawDomain||!audience)return null;
  try{
    const domain=new URL(rawDomain);
    if(domain.protocol!=='https:'||domain.pathname!=='/'||domain.search||domain.hash)return null;
    const teamDomain=domain.origin;
    let jwks=jwksByTeamDomain.get(teamDomain);
    if(!jwks){
      jwks=createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
      jwksByTeamDomain.set(teamDomain,jwks);
    }
    return{teamDomain,audience,jwks};
  }catch{return null}
}

// 所有管理入口共用此函数。只验证 Cf-Access-Jwt-Assertion，绝不信任普通身份头。
// 配置、JWT、签名、issuer 或 audience 任一不满足时都 fail closed 为 403。
export async function authorize(request,env){
  const config=accessConfig(env);
  const token=request.headers.get('cf-access-jwt-assertion')||'';
  if(!config||!token)return{ok:false,response:error('管理入口未授权',403)};
  try{
    const result=await jwtVerify(token,config.jwks,{issuer:config.teamDomain,audience:config.audience,algorithms:['RS256']});
    return{ok:true,payload:result.payload};
  }catch{return{ok:false,response:error('管理入口未授权',403)}}
}

export async function readJson(request,maxBytes=512000){const len=Number(request.headers.get('content-length')||0);if(len>maxBytes)throw new Error('请求体过大');const text=await request.text();if(new TextEncoder().encode(text).length>maxBytes)throw new Error('请求体过大');try{return JSON.parse(text||'{}')}catch{throw new Error('JSON 格式无效')}}
