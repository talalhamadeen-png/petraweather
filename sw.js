/* Petra Weather alerts service worker — shows local notifications (works on Android Chrome where `new Notification()` is blocked)
   and, where the browser allows it (installed PWA / Chrome periodic sync), re-checks the weather in the background.
   Scoped to ./pw-alerts/ so it never conflicts with the OneSignal worker. */
importScripts('petra-alerts-core.js');
const STATE_CACHE='petra-alerts-state-v1', STATE_URL='petra-alerts-state.json';
self.addEventListener('install',e=>{self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(self.clients.claim())});
async function saveState(s){const c=await caches.open(STATE_CACHE);await c.put(STATE_URL,new Response(JSON.stringify(s),{headers:{'Content-Type':'application/json'}}))}
async function loadState(){try{const c=await caches.open(STATE_CACHE);const r=await c.match(STATE_URL);return r?await r.json():null}catch(e){return null}}
self.addEventListener('message',e=>{
  const d=e.data||{};
  if(d.type==='state'){e.waitUntil(saveState(d.state))}
});
async function backgroundCheck(){
  const st=await loadState();
  if(!st||!st.settings||!st.settings.enabled||!st.location)return;
  const data=await PetraAlertsCore.fetchData(st.location.lat,st.location.lon);
  const res=PetraAlertsCore.evaluate(data,Date.now());
  const sent=st.sent||{};const now=Date.now();const locKey=(st.location.name||'')+'|';
  for(const ev of res.events){
    if(!st.settings[ev.id])continue;
    const k=locKey+ev.id;
    if(sent[k]&&now-sent[k]<6*36e5)continue;
    sent[k]=now;
    await self.registration.showNotification(ev.title,{
      body:st.location.name+': '+ev.detail+' — '+ev.when,tag:'petra-'+ev.id,renotify:true,dir:'rtl',lang:'ar',
      icon:'logo-petra-weather.png',badge:'logo-petra-weather.png',vibrate:[200,100,200],data:{url:st.url||'./'}
    });
  }
  st.sent=sent;await saveState(st);
}
self.addEventListener('periodicsync',e=>{if(e.tag==='petra-alerts')e.waitUntil(backgroundCheck())});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const url=(e.notification.data&&e.notification.data.url)||'./';
  e.waitUntil((async()=>{
    const all=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const c of all){if('focus' in c){await c.focus();return}}
    if(self.clients.openWindow)await self.clients.openWindow(url);
  })());
});
