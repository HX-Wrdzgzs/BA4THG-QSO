import{authorize,json}from'../../_lib/http.js';

export async function onRequestGet(c){
  const a=await authorize(c.request,c.env);
  if(!a.ok)return a.response;
  return json({ok:true});
}
