/* Petra Weather — alerts core (shared by the page and the service worker).
   Sources (open, no API key): Open-Meteo forecast (best-match NWP incl. ECMWF IFS/ICON/GFS)
   and Open-Meteo Air Quality (Copernicus CAMS) for dust / PM10. */
(function(root){
 'use strict';
 var SNOW=[71,73,75,77,85,86], FREEZING=[56,57,66,67], FOG=[45,48], STORM=[95,96,99];
 var TH={heavyRain:5,flood3h:12,flood6h:18,flood24h:30,wind:45,gust:65,dust:100,pm10:150,fogVis:1000,frost:2};
 function forecastUrl(lat,lon){
  return 'https://api.open-meteo.com/v1/forecast?latitude='+lat+'&longitude='+lon+
  '&current=temperature_2m,weather_code,wind_speed_10m,wind_gusts_10m,precipitation'+
  '&hourly=temperature_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m,visibility,snowfall,cape'+
  '&forecast_days=3&past_hours=2&timezone=Asia%2FAmman';
 }
 function airUrl(lat,lon){
  return 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude='+lat+'&longitude='+lon+
  '&hourly=dust,pm10&forecast_days=3&past_hours=2&timezone=Asia%2FAmman';
 }
 function getJSON(url,ms){
  var ctl=(typeof AbortController!=='undefined')?new AbortController():null, t=ctl?setTimeout(function(){ctl.abort()},ms||9000):null;
  return fetch(url,{cache:'no-store',signal:ctl?ctl.signal:undefined}).then(function(r){if(t)clearTimeout(t);if(!r.ok)throw new Error('HTTP '+r.status);return r.json()});
 }
 function fetchData(lat,lon){
  return Promise.all([getJSON(forecastUrl(lat,lon)),getJSON(airUrl(lat,lon)).catch(function(){return null})]).then(function(a){return {fc:a[0],aq:a[1]}});
 }
 function times(h,off){return (h.time||[]).map(function(t){return Date.parse(t+':00Z')-off*1000})}
 function col(h,k){return Array.isArray(h[k])?h[k]:[]}
 function two(n){return n<10?'0'+n:''+n}
 function fmtTime(ms,off){var d=new Date(ms+off*1000),h=d.getUTCHours(),m=d.getUTCMinutes(),p=h>=12?'م':'ص';h=h%12||12;return h+':'+two(m)+' '+p}
 function dayWord(ms,now,off){
  var a=Math.floor((ms+off*1000)/864e5), b=Math.floor((now+off*1000)/864e5), diff=a-b;
  return diff<=0?'':diff===1?'غدًا ':'بعد غد ';
 }
 function whenText(r,now,off){
  if(!r)return '';
  if(r.start<=now)return 'حتى '+dayWord(r.end,now,off)+fmtTime(r.end,off);
  return 'من '+dayWord(r.start,now,off)+fmtTime(r.start,off)+' إلى '+dayWord(r.end,now,off)+fmtTime(r.end,off);
 }
 /* first contiguous run of hours (index list sorted) where mark[i] is true and which has not ended yet */
 function firstRun(T,idx,mark,now){
  var run=null;
  for(var n=0;n<idx.length;n++){
   var i=idx[n];
   if(mark[i]){
    if(!run)run={a:i,b:i};else if(i===run.b+1)run.b=i;else{ if(T[run.b]+36e5>now)break; run={a:i,b:i}; }
   }else if(run){ if(T[run.b]+36e5>now)break; run=null; }
  }
  if(!run||T[run.b]+36e5<=now)return null;
  return {a:run.a,b:run.b,start:Math.max(T[run.a],T[run.a]),end:T[run.b]+36e5};
 }
 function evaluate(data,now){
  now=now||Date.now();
  var fc=data.fc,aq=data.aq,off=fc.utc_offset_seconds||10800,h=fc.hourly||{},T=times(h,off);
  var N=T.length,cur=-1,i;
  for(i=0;i<N;i++){if(T[i]<=now)cur=i;}
  if(cur<0)cur=0;
  var idx=[];for(i=Math.max(0,cur);i<N&&T[i]<=now+36*36e5;i++)idx.push(i);
  var pr=col(h,'precipitation'),pp=col(h,'precipitation_probability'),wc=col(h,'weather_code'),ws=col(h,'wind_speed_10m'),wg=col(h,'wind_gusts_10m'),
      vis=col(h,'visibility'),sn=col(h,'snowfall'),cape=col(h,'cape'),tp=col(h,'temperature_2m');
  function v(a,j){var x=a[j];return (x===null||x===undefined||isNaN(x))?0:Number(x)}
  var m={storm:[],fog:[],heavyrain:[],flood:[],wind:[],snow:[],frost:[],rain:[],dust:[]};
  for(i=0;i<N;i++){
   var code=v(wc,i);
   m.storm[i]=STORM.indexOf(code)>-1||(v(cape,i)>=1000&&v(pr,i)>=0.1);
   m.fog[i]=(vis[i]!==null&&vis[i]!==undefined&&Number(vis[i])<TH.fogVis)||FOG.indexOf(code)>-1;
   m.heavyrain[i]=v(pr,i)>=TH.heavyRain;
   m.wind[i]=v(ws,i)>=TH.wind||v(wg,i)>=TH.gust;
   m.snow[i]=v(sn,i)>0.1||SNOW.indexOf(code)>-1||(v(tp,i)<=0&&(FREEZING.indexOf(code)>-1||v(pr,i)>0.1));
   m.frost[i]=v(tp,i)<=TH.frost;
   m.rain[i]=v(pp,i)>=60&&v(pr,i)>=0.1;
   m.flood[i]=false;
  }
  for(i=0;i<N;i++){
   var s3=0,s6=0,k;for(k=0;k<3&&i+k<N;k++)s3+=v(pr,i+k);for(k=0;k<6&&i+k<N;k++)s6+=v(pr,i+k);
   if(s3>=TH.flood3h)for(k=0;k<3&&i+k<N;k++)if(v(pr,i+k)>0.1)m.flood[i+k]=true;
   if(s6>=TH.flood6h)for(k=0;k<6&&i+k<N;k++)if(v(pr,i+k)>0.1)m.flood[i+k]=true;
  }
  var s24=0;for(i=cur;i<Math.min(N,cur+24);i++)s24+=v(pr,i);
  if(s24>=TH.flood24h)for(i=cur;i<Math.min(N,cur+24);i++)if(v(pr,i)>0.2)m.flood[i]=true;
  /* dust (CAMS) has its own time axis */
  var dustRun=null,dustPeak=0,pm10Peak=0,aqOff=0;
  if(aq&&aq.hourly&&aq.hourly.time){
   aqOff=aq.utc_offset_seconds||off;var AT=times(aq.hourly,aqOff),dd=col(aq.hourly,'dust'),pm=col(aq.hourly,'pm10'),aidx=[],ac=-1,mk=[];
   for(i=0;i<AT.length;i++)if(AT[i]<=now)ac=i;
   if(ac<0)ac=0;
   for(i=ac;i<AT.length&&AT[i]<=now+36*36e5;i++){aidx.push(i);}
   for(i=0;i<AT.length;i++){mk[i]=v(dd,i)>=TH.dust||v(pm,i)>=TH.pm10;}
   dustRun=firstRun(AT,aidx,mk,now);
   var lo=dustRun?dustRun.a:ac,hi=dustRun?dustRun.b:Math.min(AT.length-1,ac+24);
   for(i=lo;i<=hi;i++){dustPeak=Math.max(dustPeak,v(dd,i));pm10Peak=Math.max(pm10Peak,v(pm,i));}
  }
  function lvl(r){return !r?'ok':(r.start<=now?'active':'watch')}
  var R={};['storm','fog','heavyrain','flood','wind','snow','frost','rain'].forEach(function(k){R[k]=firstRun(T,idx,m[k],now)});
  R.dust=dustRun;
  function peak(a,r){var mx=0;if(r)for(var j=r.a;j<=r.b;j++)mx=Math.max(mx,v(a,j));return mx}
  function minOf(a,r){var mn=1e9;if(r)for(var j=r.a;j<=r.b;j++)mn=Math.min(mn,v(a,j));return mn===1e9?0:mn}
  var curVis=(vis[cur]===null||vis[cur]===undefined)?null:Number(vis[cur])/1000;
  var nowPrecip=v(pr,cur);
  var H={};
  H.storm={level:lvl(R.storm),run:R.storm,detail:R.storm?'مؤشر عواصف رعدية'+(peak(cape,R.storm)>=500?' (طاقة الحمل الحراري '+Math.round(peak(cape,R.storm))+' جول/كغ)':''):'لا مؤشرات عواصف رعدية في التوقعات'};
  H.dust={level:lvl(R.dust),run:R.dust,detail:R.dust?'تركيز الغبار حتى '+Math.round(dustPeak)+' ميكروغرام/م³':(aq?'تركيز الغبار الحالي ضمن الحدود الآمنة':'تعذّر جلب بيانات الغبار (CAMS)')};
  H.fog={level:lvl(R.fog),run:R.fog,detail:R.fog?('أقل رؤية متوقعة '+(minOf(vis,R.fog)/1000).toFixed(1)+' كم'):('الرؤية الحالية: '+(curVis===null?'غير متاحة':(curVis>=10?'أكثر من 10 كم':curVis.toFixed(1)+' كم')))};
  H.heavyrain={level:lvl(R.heavyrain),run:R.heavyrain,detail:R.heavyrain?'ذروة الهطول '+peak(pr,R.heavyrain).toFixed(1)+' مم/س':'الهطول الحالي: '+nowPrecip.toFixed(1)+' مم/س'};
  H.flood={level:lvl(R.flood),run:R.flood,detail:R.flood?'هطول متراكم متوقع '+(function(){var s=0;for(var j=R.flood.a;j<=R.flood.b;j++)s+=v(pr,j);return s.toFixed(1)})()+' مم — خطر جريان في الأودية':'مجموع الهطول خلال 24 ساعة: '+s24.toFixed(1)+' مم'};
  H.wind={level:lvl(R.wind),run:R.wind,detail:R.wind?'هبات حتى '+Math.round(Math.max(peak(wg,R.wind),peak(ws,R.wind)))+' كم/س':'الرياح الحالية: '+Math.round(v(ws,cur))+' كم/س (ضمن المعدل)'};
  H.snow={level:lvl(R.snow),run:R.snow,detail:R.snow?((function(){var sn1=false;for(var j=R.snow.a;j<=R.snow.b;j++)if(v(sn,j)>0.1||SNOW.indexOf(v(wc,j))>-1)sn1=true;return sn1})()?'ثلوج متوقعة':'انجماد/هطول متجمد (حتى '+Math.round(minOf(tp,R.snow))+'°)'):'أقل حرارة متوقعة '+Math.round(Math.min.apply(null,idx.slice(0,24).map(function(j){return v(tp,j)})))+'°'};
  /* thunder-lightning card shares the storm hazard */
  var events=[];
  function ev(id,title,hz,soon){
   var r=hz.run;if(!r)return;
   if(r.start>now+soon*36e5)return;
   events.push({id:id,title:title,detail:hz.detail,when:whenText(r,now,off),level:hz.level,start:r.start,end:r.end});
  }
  ev('storm','⛈️ تنبيه عواصف رعدية',H.storm,12);
  ev('heavyrain','🌧️ تنبيه أمطار غزيرة',H.heavyrain,12);
  ev('flood','🌊 تنبيه احتمال سيول',H.flood,12);
  ev('wind','💨 تنبيه رياح قوية',H.wind,12);
  ev('fog','🌫️ تنبيه ضباب وضعف الرؤية',H.fog,12);
  ev('dust','🌪️ تنبيه غبار وأتربة',H.dust,12);
  ev('snow','❄️ تنبيه ثلوج / انجماد',H.snow,12);
  if(R.rain&&!R.heavyrain)ev('rain','🌧️ تنبيه أمطار متوقعة',{run:R.rain,level:lvl(R.rain),detail:'احتمال هطول مرتفع (60% فأكثر)'},12);
  if(R.frost){var fm=minOf(tp,R.frost);ev('frost','🥶 تنبيه برودة شديدة / صقيع',{run:R.frost,level:lvl(R.frost),detail:'الحرارة قد تصل إلى '+Math.round(fm)+'°م'},12);}
  return {hazards:H,events:events,offset:off,now:now,updated:now,
          current:{temp:fc.current&&fc.current.temperature_2m,wind:fc.current&&fc.current.wind_speed_10m}};
 }
 root.PetraAlertsCore={evaluate:evaluate,fetchData:fetchData,fmtTime:fmtTime,whenText:whenText,thresholds:TH};
})(typeof self!=='undefined'?self:window);
