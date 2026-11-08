// Collects weather / road related news from the Public Security Directorate (Jordan) site
// and writes data/psd-alerts.json for the website. Runs on GitHub Actions.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const outPath=path.join(root,'data','psd-alerts.json'),statePath=path.join(root,'data','psd-state.json');
const PAGES=(process.env.PSD_URLS||'https://www.psd.gov.jo/ar-jo/المحتوى/أرشيف-الأخبار/|https://www.psd.gov.jo/ar-jo/').split('|');
const KEYWORDS=/الطقس|أحوال جوية|الأحوال الجوية|منخفض جوي|كتلة هوائية|ثلوج|ثلج|صقيع|أمطار|مطر|سيول|سيل|ضباب|غبار|أتربة|رياح|عاصفة|رعدية|انزلاق|تحذير|الطرق|الطريق|طريق|إغلاق|اغلاق|فتح|حركة السير|تحويلات|الصحراوي|المتجمد/;
const AR='٠١٢٣٤٥٦٧٨٩';
const latin=s=>String(s).replace(/[٠-٩]/g,d=>AR.indexOf(d));
const decode=s=>String(s).replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n));
const strip=s=>decode(String(s).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
function parseDate(txt){
  const t=latin(txt);
  let m=t.match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[ T,]+(\d{1,2}):(\d{2}))?/),y,mo,d,h=12,mi=0,hasTime=false;
  if(m){y=+m[1];mo=+m[2];d=+m[3];if(m[4]){h=+m[4];mi=+m[5];hasTime=true}}
  else{m=t.match(/(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})(?:[ T,]+(\d{1,2}):(\d{2}))?/);if(!m)return null;d=+m[1];mo=+m[2];y=+m[3];if(m[4]){h=+m[4];mi=+m[5];hasTime=true}}
  if(mo<1||mo>12||d<1||d>31||y<2020)return null;
  const iso=y+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0')+'T'+String(h).padStart(2,'0')+':'+String(mi).padStart(2,'0')+':00+03:00';
  const ms=Date.parse(iso);return Number.isFinite(ms)?{ms,hasTime,label:String(d).padStart(2,'0')+'/'+String(mo).padStart(2,'0')+'/'+y+(hasTime?' '+String(h).padStart(2,'0')+':'+String(mi).padStart(2,'0'):'')}:null;
}
async function get(url){
  const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; PetraWeatherBot/1.0)','accept-language':'ar,en;q=0.8','accept':'text/html,application/xhtml+xml'}});
  if(!r.ok)throw new Error('HTTP '+r.status+' '+url);
  return await r.text();
}
function extract(html,base){
  const out=[],re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m;
  while((m=re.exec(html))){
    const href=m[1];if(/^(#|javascript:|mailto:|tel:)/i.test(href))continue;
    const title=strip(m[2]);if(title.length<14||title.length>400)continue;
    let url;try{url=new URL(decode(href),base).href}catch(e){continue}
    const end=m.index+m[0].length;
    let after=html.slice(end,end+450);const nx=after.search(/<a\b[^>]*href/i);if(nx>60)after=after.slice(0,nx);
    const before=html.slice(Math.max(0,m.index-160),m.index);
    out.push({title,url,date:parseDate(strip(after))||parseDate(strip(before))});
  }
  return out;
}
const GN_QUERIES=['"الأمن العام" الأحوال الجوية','"الأمن العام" حالة الطرق','"الأمن العام" تحذر منخفض جوي','"مديرية الأمن العام" ثلوج','"مديرية الأمن العام" سيول','"الأمن العام" إغلاق طريق الطقس','site:petra.gov.jo الأمن العام الطقس'];
const GN_DOMAINS=['royanews.tv','royanews.com','royanews.net','roya.tv','almamlakatv.com','jo24.net','alrai.com','alghad.com','ammonnews.net','sarayanews.com','jordannews.jo','petra.gov.jo','khaberni.com','factjo.com','gerasanews.com','alawalnews.com','almadenahnews.com','jordanzad.com','hala.jo','psd.gov.jo'];
const tagx=(x,n)=>{const m=x.match(new RegExp('<'+n+'\\b[^>]*>([\\s\\S]*?)</'+n+'>','i'));return m?decode(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')):''};
async function fromNews(debug){
  const out=[];
  for(const q of GN_QUERIES){
    try{
      const xml=await get('https://news.google.com/rss/search?q='+encodeURIComponent(q)+'&hl=ar&gl=JO&ceid=JO:ar');
      const re=/<item>([\s\S]*?)<\/item>/gi;let m,n=0;
      while((m=re.exec(xml))){
        const x=m[1];let title=tagx(x,'title');const link=tagx(x,'link'),pub=Date.parse(tagx(x,'pubDate')),src=tagx(x,'source');
        const su=(x.match(/<source\b[^>]*url="([^"]*)"/i)||[])[1]||'';let h='';try{h=new URL(su).hostname.replace(/^www\./,'')}catch(e){}
        if(src&&title.endsWith(' - '+src))title=title.slice(0,-(src.length+3)).trim();
        if(!title||!link||!Number.isFinite(pub))continue;
        if(!GN_DOMAINS.some(d=>h===d||h.endsWith('.'+d)))continue;
        if(!/الأمن العام|الأمن|المرور|الدفاع المدني/.test(title)||!KEYWORDS.test(title))continue;
        out.push({title,url:link,date:{ms:pub,label:new Date(pub).toLocaleString('ar-JO',{timeZone:'Asia/Amman',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})}});n++;
      }
      debug.pages.push({url:'news:'+q,items:n});
    }catch(e){debug.errors.push('news '+q+': '+String(e.message||e))}
  }
  return out;
}
async function main(){
  let state={};try{state=JSON.parse(fs.readFileSync(statePath,'utf8'))}catch(e){}
  const firstRun=!state.seen;state.seen=state.seen||{};
  const debug={pages:[],anchors:0,matched:0,errors:[]};let all=[];
  for(const p of PAGES){
    try{const html=await get(p);const items=extract(html,p);debug.pages.push({url:p,bytes:html.length,anchors:items.length});all=all.concat(items)}
    catch(e){debug.errors.push(String(e.message||e));console.warn('page failed',p,e.message)}
  }
  try{all=all.concat(await fromNews(debug))}catch(e){debug.errors.push(String(e.message||e))}
  debug.anchors=all.length;
  const now=Date.now(),seenUrls=new Set(),items=[];
  for(const it of all){
    const tk=it.title.replace(/\s+/g,' ').slice(0,70);if(seenUrls.has(it.url)||seenUrls.has(tk))continue;seenUrls.add(it.url);seenUrls.add(tk);
    if(!KEYWORDS.test(it.title))continue;
    debug.matched++;
    let first=state.seen[it.url];
    if(!first){first=it.date?it.date.ms:(firstRun?0:now);state.seen[it.url]=first}
    const pub=it.date?it.date.ms:first;
    if(!pub||now-pub>72*36e5)continue;
    items.push({title:it.title,url:it.url,summary:'',date:it.date?it.date.label:new Date(pub).toLocaleString('ar-JO',{timeZone:'Asia/Amman'}),publishedAt:new Date(pub).toISOString()});
  }
  items.sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
  for(const k of Object.keys(state.seen)){if(now-state.seen[k]>14*864e5&&state.seen[k]!==0)delete state.seen[k]}
  const ok=debug.pages.length>0;
  const out={updatedAt:new Date().toISOString(),ok,source:'psd.gov.jo',items:items.slice(0,12),debug};
  fs.writeFileSync(outPath,JSON.stringify(out,null,1));fs.writeFileSync(statePath,JSON.stringify(state));
  console.log(JSON.stringify(debug),'items',items.length);
  if(!ok){console.error('No PSD page could be fetched.');process.exit(1)}
}
main().catch(e=>{console.error(e);process.exit(1)});
