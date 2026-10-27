// Petra Weather — background alerts sender (runs on GitHub Actions, no browser needed).
// Evaluates every zone with the same rules the website uses, then sends Web Push via OneSignal
// to the devices tagged with that zone and with that alert type enabled.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.join(here,'..');
globalThis.self=globalThis;
const require=createRequire(import.meta.url);
const core=(()=>{require(path.join(root,'petra-alerts-core.js'));return globalThis.PetraAlertsCore})();

const APP_ID=process.env.ONESIGNAL_APP_ID, KEY=process.env.ONESIGNAL_REST_API_KEY;
const SITE=process.env.SITE_URL||'https://talalhamadeen-png.github.io/petraweather/';
const DRY=process.env.DRY_RUN==='1';
const COOLDOWN=6*36e5;
const TYPES=['rain','storm','wind','frost','fog','dust','heavyrain','flood','snow'];
const zones=JSON.parse(fs.readFileSync(path.join(root,'data','zones.json'),'utf8'));
const statePath=path.join(root,'data','alerts-state.json');
let state={};try{state=JSON.parse(fs.readFileSync(statePath,'utf8'))}catch(e){}

async function getJSON(url,tries=3){
  let err;
  for(let i=0;i<tries;i++){
    try{const r=await fetch(url,{headers:{'user-agent':'petra-weather-alerts'}});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json()}
    catch(e){err=e;await new Promise(r=>setTimeout(r,1500*(i+1)))}
  }
  throw err;
}
const chunk=(a,n)=>a.length?[a.slice(0,n),...chunk(a.slice(n),n)]:[];
async function fetchAll(){
  const out=new Map();
  for(const part of chunk(zones,40)){
    const lat=part.map(z=>z.lat).join(','),lon=part.map(z=>z.lon).join(',');
    const fcU='https://api.open-meteo.com/v1/forecast?latitude='+lat+'&longitude='+lon+
      '&current=temperature_2m,weather_code,wind_speed_10m,wind_gusts_10m,precipitation'+
      '&hourly=temperature_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m,visibility,snowfall,cape'+
      '&forecast_days=3&past_hours=2&timezone=Asia%2FAmman';
    const aqU='https://air-quality-api.open-meteo.com/v1/air-quality?latitude='+lat+'&longitude='+lon+
      '&hourly=dust,pm10&forecast_days=3&past_hours=2&timezone=Asia%2FAmman';
    const fc=await getJSON(fcU);
    let aq=null;try{aq=await getJSON(aqU)}catch(e){console.warn('air quality unavailable:',e.message)}
    const F=Array.isArray(fc)?fc:[fc],A=aq?(Array.isArray(aq)?aq:[aq]):[];
    part.forEach((z,i)=>out.set(z.id,{fc:F[i],aq:A[i]||null}));
  }
  return out;
}
async function send(zone,ev){
  const title=ev.title, body=zone.name+': '+ev.detail+' — '+ev.when;
  const payload={
    app_id:APP_ID,target_channel:'push',
    filters:[{field:'tag',key:'zone',relation:'=',value:zone.id},{operator:'AND'},{field:'tag',key:'t_'+ev.id,relation:'=',value:'1'}],
    headings:{en:title,ar:title},contents:{en:body,ar:body},
    web_push_topic:(zone.id+'-'+ev.id).slice(0,64),url:SITE,ttl:6*3600
  };
  if(DRY){console.log('[dry] would send',JSON.stringify({zone:zone.id,title,body}));return true}
  const r=await fetch('https://api.onesignal.com/notifications',{method:'POST',headers:{'content-type':'application/json',authorization:'Key '+KEY},body:JSON.stringify(payload)});
  const t=await r.text();
  if(!r.ok){console.error('OneSignal error',r.status,t);return false}
  console.log('sent',zone.id,zone.name,ev.id,t.slice(0,120));return true;
}
async function main(){
  if(!DRY&&(!APP_ID||!KEY)){console.error('Missing ONESIGNAL_APP_ID / ONESIGNAL_REST_API_KEY secrets.');process.exit(1)}
  const data=await fetchAll(),now=Date.now();
  const active=new Set();let sentN=0;
  for(const z of zones){
    const d=data.get(z.id);if(!d||!d.fc||!d.fc.hourly)continue;
    let res;try{res=core.evaluate(d,now)}catch(e){console.warn('evaluate failed',z.name,e.message);continue}
    for(const ev of res.events){
      if(!TYPES.includes(ev.id))continue;
      const k=z.id+'|'+ev.id;active.add(k);
      if(state[k]&&now-state[k]<COOLDOWN)continue;
      if(await send(z,ev)){state[k]=now;sentN++}
    }
  }
  for(const k of Object.keys(state)){if(!active.has(k)&&now-state[k]>COOLDOWN)delete state[k]}
  fs.writeFileSync(statePath,JSON.stringify(state,null,1));
  console.log('done: zones',zones.length,'active events',active.size,'sent',sentN);
}
main().catch(e=>{console.error(e);process.exit(1)});
