export function json(data, init={}){const h=new Headers(init.headers||{});h.set('content-type','application/json; charset=utf-8');h.set('cache-control',h.get('cache-control')||'no-store');h.set('x-content-type-options','nosniff');return new Response(JSON.stringify(data),{...init,headers:h})}
export function error(message,status=400,details){return json({error:message,...(details===undefined?{}:{details})},{status})}
export function parsePositiveInt(value,fallback,min,max){const n=Number.parseInt(value??'',10);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback}
export function normalizeCallsign(value){return String(value??'').trim().toUpperCase().replace(/\s+/g,'')}
export function isValidCallsign(value){return /^[A-Z0-9/]{3,16}$/.test(value)}

// 管理路径由站点边缘访问策略保护。函数层只接受该策略注入的身份头，
// 不再维护第二套页面令牌；真正的策略配置见 DEPLOYMENT.md。
export function authorize(request){
  const email=request.headers.get('cf-access-authenticated-user-email')||'';
  const assertion=request.headers.get('cf-access-jwt-assertion')||'';
  if(!email&&!assertion)return{ok:false,response:error('管理入口未授权',401)};
  return{ok:true,email:email||null};
}

export async function readJson(request,maxBytes=512000){const len=Number(request.headers.get('content-length')||0);if(len>maxBytes)throw new Error('请求体过大');const text=await request.text();if(new TextEncoder().encode(text).length>maxBytes)throw new Error('请求体过大');try{return JSON.parse(text||'{}')}catch{throw new Error('JSON 格式无效')}}
