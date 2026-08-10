import{authorize,error,json}from'../../_lib/http.js';

export function onRequestGet(c){
  const a=authorize(c.request);
  if(!a.ok)return a.response;
  return json({ok:true});
}
