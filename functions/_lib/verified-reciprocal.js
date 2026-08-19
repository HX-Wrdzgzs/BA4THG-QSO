import{normalizeCallsign}from'./http.js';

const SNAPSHOTS=[{
  operator:'BA4THG',
  counterpart:'BA4VRM',
  verifiedAt:'2026-08-19T10:43:00.000Z',
  source:'mzyyun_public_reciprocal_snapshot',
  evidenceStation:'BA4VRM',
  items:[
    {
      id:'BA4VRM:272',
      myCallsign:'BA4THG',theirCallsign:'BA4VRM',qsoDatetime:'2026-08-19T09:35:00.000Z',frequency:'430.610 MHz',mode:'FM',rstSent:'59',rstReceived:'59',
      myQth:'江苏省南京市栖霞区',theirQth:'江苏省扬州市江都区金鹰国际购物中心(江都店)',
      myEquipment:'泉盛 UV-K5',theirEquipment:'NRL链路',myAntenna:'原装天线',theirAntenna:null,myPower:'5',theirPower:null,
      weather:null,theirWeather:'多云 32°C 东风2-3级 湿度69%',notes:null,
      qslSent:false,qslSentAt:null,qslReceived:false,qslReceivedAt:null,isPublic:true
    },
    {
      id:'BA4VRM:150',
      myCallsign:'BA4THG',theirCallsign:'BA4VRM',qsoDatetime:'2026-08-11T12:32:00.000Z',frequency:'439.390 MHz',mode:'FM',rstSent:'59',rstReceived:'57',
      myQth:'江苏省南京市栖霞区',theirQth:'江苏省扬州市江都区',
      myEquipment:'八重洲 FT-1907',theirEquipment:'自由通 D878UVII PLUS',myAntenna:'2.2米玻璃钢天线',theirAntenna:'钻石 SRJ77',myPower:'25',theirPower:'10',
      weather:null,theirWeather:'雨 26°C 东风2-3级 湿度100%',notes:null,
      qslSent:false,qslSentAt:null,qslReceived:false,qslReceivedAt:null,isPublic:true
    },
    {
      id:'BA4VRM:106',
      myCallsign:'BA4THG',theirCallsign:'BA4VRM',qsoDatetime:'2026-08-06T13:59:00.000Z',frequency:'430.610 MHz',mode:'FM',rstSent:'59',rstReceived:'59',
      myQth:'江苏省南京市栖霞区',theirQth:'江苏省扬州市广陵区扬州航空馆',
      myEquipment:'八重洲 FT-1970',theirEquipment:'自由通 D878UVII PLUS',myAntenna:'2.2米玻璃钢天线',theirAntenna:'钻石 SRJ77',myPower:'5',theirPower:'10',
      weather:null,theirWeather:'多云 29°C 东风1-2级 湿度81%',notes:null,
      qslSent:false,qslSentAt:null,qslReceived:false,qslReceivedAt:null,isPublic:true
    },
    {
      id:'BA4VRM:101',
      myCallsign:'BA4THG',theirCallsign:'BA4VRM',qsoDatetime:'2026-07-31T15:28:00.000Z',frequency:'430.610 MHz',mode:'FM',rstSent:'59',rstReceived:'59',
      myQth:'江苏省南京市栖霞区',theirQth:'江苏省扬州市江都区',
      myEquipment:'摩托罗拉 GM3688',theirEquipment:'NRL链路',myAntenna:'2.2米玻璃钢天线',theirAntenna:null,myPower:'5',theirPower:null,
      weather:null,theirWeather:'晴天 27°C 北风无风 湿度96%',notes:'南京省协会中继',
      qslSent:false,qslSentAt:null,qslReceived:true,qslReceivedAt:'2026-08-03T00:00:00.000Z',isPublic:true
    }
  ]
}];

export function getVerifiedReciprocalSnapshot(operatorCall,counterpartCall){
  const operator=normalizeCallsign(operatorCall||'');
  const counterpart=normalizeCallsign(counterpartCall||'');
  const match=SNAPSHOTS.find(x=>x.operator===operator&&x.counterpart===counterpart);
  if(!match)return null;
  return{
    operator:match.operator,
    counterpart:match.counterpart,
    verifiedAt:match.verifiedAt,
    source:match.source,
    evidenceStation:match.evidenceStation,
    items:match.items.map(item=>({...item}))
  };
}
