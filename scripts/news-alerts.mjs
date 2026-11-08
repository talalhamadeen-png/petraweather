// Collects weather-related headlines published by Jordanian outlets (via Google News RSS search)
// and writes data/weather-news.json for the website. Runs on GitHub Actions.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const outPath=path.join(root,'data','weather-news.json');
const QUERIES=(process.env.NEWS_QUERIES||[
 'طقس الأردن','حالة الطقس في الأردن','الأرصاد الجوية الأردنية','طقس العرب الأردن','منخفض جوي الأردن','كتلة هوائية الأردن',
 'أمطار الأردن','ثلوج الأردن','غبار الأردن','سيول الأردن','تحذير أحوال جوية الأردن',
 'site:royanews.tv طقس','site:almamlakatv.com طقس','site:jo24.net طقس','site:arabiaweather.com الأردن','site:jometeo.gov.jo',
 'site:alrai.com طقس','site:ammonnews.net طقس','site:petra.gov.jo الأرصاد'
].join('|')).split('|');
const DOMAINS=['royanews.tv','royanews.com','royanews.net','roya.tv','almamlakatv.com','almamlaka.jo','jo24.net','arabiaweather.com','jometeo.gov.jo','jmd.gov.jo','alrai.com','alghad.com','ammonnews.net','sarayanews.com','jordannews.jo','petra.gov.jo','khaberni.com','factjo.com','gerasanews.com','alawalnews.com','almadenahnews.com','jordanzad.com','hala.jo','ro7.net','jordan24.jo','alanbatnews.net','alwakeelnews.com','amnaonline.com'];
const KEYWORDS=/طقس|الأحوال الجوية|أحوال جوية|الأرصاد|منخفض جوي|كتلة هوائية|أمطار|مطر|ثلوج|ثلج|سيول|سيل|غبار|أتربة|صقيع|ضباب|عاصفة|رعدية|رياح|درجات الحرارة|الحرارة|برد|انخفاض/;
const decode=s=>String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();
const tag=(x,n)=>{const m=x.match(new RegExp('<'+n+'\\b[^>]*>([\\s\\S]*?)</'+n+'>','i'));return m?decode(m[1]):''};
const attr=(x,n,a)=>{const m=x.match(new RegExp('<'+n+'\\b[^>]*\\b'+a+'="([^"]*)"','i'));return m?decode(m[1]):''};
async function get(url){
  const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; PetraWeatherBot/1.0)','accept-language':'ar'}});
  if(!r.ok)throw new Error('HTTP '+r.status);return await r.text();
}
function host(u){try{return new URL(u).hostname.replace(/^www\./,'')}catch(e){return ''}}
function parse(xml){
  const out=[],re=/<item>([\s\S]*?)<\/item>/gi;let m;
  while((m=re.exec(xml))){
    const x=m[1];let title=tag(x,'title');const link=tag(x,'link'),pub=Date.parse(tag(x,'pubDate'));
    const src=tag(x,'source'),srcUrl=attr(x,'source','url');
    if(src&&title.endsWith(' - '+src))title=title.slice(0,-(src.length+3)).trim();
    if(title&&link&&Number.isFinite(pub))out.push({title,url:link,srcHost:host(srcUrl),ms:pub});
  }
  return out;
}
async function main(){
  const debug={queries:[],errors:[],kept:0};let all=[];
  for(const q of QUERIES){
    const url='https://news.google.com/rss/search?q='+encodeURIComponent(q)+'&hl=ar&gl=JO&ceid=JO:ar';
    try{const items=parse(await get(url));debug.queries.push({q,items:items.length});all=all.concat(items)}
    catch(e){debug.errors.push(q+': '+String(e.message||e))}
  }
  const now=Date.now(),seen=new Set(),items=[];
  for(const it of all){
    const k=it.title.replace(/\s+/g,' ').slice(0,70);
    const okSrc=DOMAINS.some(d=>it.srcHost===d||it.srcHost.endsWith('.'+d));
    if(seen.has(k)||!okSrc||!KEYWORDS.test(it.title)||now-it.ms>36*36e5||it.ms>now+36e5)continue;
    seen.add(k);items.push({title:it.title,url:it.url,publishedAt:new Date(it.ms).toISOString()});
  }
  items.sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
  debug.total=all.length;debug.kept=items.length;
  const ok=debug.queries.length>0;
  fs.writeFileSync(outPath,JSON.stringify({updatedAt:new Date().toISOString(),ok,items:items.slice(0,15),debug},null,1));
  console.log(JSON.stringify({queriesOk:debug.queries.length,errors:debug.errors.length,total:debug.total,kept:debug.kept}));
  if(!ok){console.error('No news feed could be fetched.',debug.errors.slice(0,3));process.exit(1)}
}
main().catch(e=>{console.error(e);process.exit(1)});
