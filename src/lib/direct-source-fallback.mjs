const UA='TodayInfo-Direct-Source-Fallback/0.8.4';

const decode=value=>String(value||'')
  .replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'")
  .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');

const strip=value=>decode(String(value||'')
  .replace(/<script[\s\S]*?<\/script>/gi,' ')
  .replace(/<style[\s\S]*?<\/style>/gi,' ')
  .replace(/<svg[\s\S]*?<\/svg>/gi,' ')
  .replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();

async function fetchHtml(url){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
  try{
    const res=await fetch(url,{
      headers:{accept:'text/html,application/xhtml+xml','user-agent':UA},
      redirect:'follow',signal:controller.signal
    });
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const type=res.headers.get('content-type')||'';
    if(!/html|xhtml/i.test(type))throw new Error(`Unexpected content type ${type||'unknown'}`);
    return{html:await res.text(),url:res.url||url,status:res.status};
  }finally{clearTimeout(timer)}
}

function absolute(base,href=''){
  try{const u=new URL(href,base);if(!['http:','https:'].includes(u.protocol))return'';u.hash='';return u.toString()}catch{return''}
}

function anchors(html,base){
  const out=[];const seen=new Set();const re=/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;while((m=re.exec(html))){
    const url=absolute(base,m[1]);const title=strip(m[2]);if(!url||seen.has(url))continue;seen.add(url);out.push({title,url});
  }
  return out;
}

function documentTitle(html,url){
  const h1=html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);if(h1&&strip(h1[1]))return strip(h1[1]);
  const title=html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if(title&&strip(title[1]))return strip(title[1]).replace(/\s*[|–-]\s*(Daily Update|Bursaries South Africa|SA Bursaries).*$/i,'').trim();
  try{return new URL(url).pathname.split('/').filter(Boolean).at(-1)?.replace(/-/g,' ')||'Source page'}catch{return'Source page'}
}

function publishedDate(html){
  const m=html.match(/<time\b[^>]*datetime\s*=\s*["']([^"']+)["']/i);return m?.[1]||null;
}

function mainText(html){
  const x=html
    .replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi,' ').replace(/<footer[\s\S]*?<\/footer>/gi,' ')
    .replace(/<(?:br|p|li|h1|h2|h3|h4|section|article)\b[^>]*>/gi,'\n')
    .replace(/<\/\s*(?:p|li|h1|h2|h3|h4|section|article)\s*>/gi,'\n');
  return decode(x.replace(/<[^>]+>/g,' ')).split('\n').map(v=>v.replace(/\s+/g,' ').trim()).filter(Boolean).join('\n').slice(0,180000);
}

function familyForUrl(url=''){
  try{
    const host=new URL(url).hostname.replace(/^www\./,'').toLowerCase();
    if(host==='dailyupdate.co.za')return'dailyupdate';
    if(host==='zabursaries.co.za')return'zabursaries';
  }catch{}
  return null;
}

function recordFromHtml({html,url,family}){
  return{
    sourceId:family,sourceName:family==='dailyupdate'?'DailyUpdate':'ZA Bursaries',
    url,title:documentTitle(html,url),contentText:mainText(html),links:anchors(html,url),
    publishedAt:publishedDate(html),pageType:'article',directFallback:true
  };
}

function usefulDailyUpdateLink(link){
  try{
    const u=new URL(link.url);if(u.hostname.replace(/^www\./,'').toLowerCase()!=='dailyupdate.co.za')return false;
    if(/\/category\/|\/tag\/|\/author\/|\/page\/|\/feed\/?$|\/privacy|\/contact/i.test(u.pathname))return false;
    return /job|hiring|vacanc|career|intern|learnership|apprentice|employment|taking-cv/i.test(`${link.title} ${u.pathname}`);
  }catch{return false}
}

function usefulBursaryLink(link){
  try{
    const u=new URL(link.url);if(u.hostname.replace(/^www\./,'').toLowerCase()!=='zabursaries.co.za')return false;
    if(/wp-content|privacy|contact|about|bursary-news|closing-in-|\/search\/|\?s=/i.test(link.url))return false;
    const hay=`${link.title} ${u.pathname}`.toLowerCase();
    return /bursar|scholarship|funding/.test(hay)&&u.pathname.split('/').filter(Boolean).length>=1;
  }catch{return false}
}

function monthSlug(date){return date.toLocaleString('en-US',{month:'long'}).toLowerCase()}

async function fetchDetails(links,family,limit){
  const selected=links.slice(0,limit),records=[];let failed=0;
  for(let i=0;i<selected.length;i+=4){
    const chunk=selected.slice(i,i+4);
    const pages=await Promise.all(chunk.map(async link=>{
      try{const page=await fetchHtml(link.url);return recordFromHtml({html:page.html,url:page.url,family})}
      catch{failed+=1;return null}
    }));
    records.push(...pages.filter(Boolean));
  }
  return{records,failed};
}

async function dailyUpdateFallback(maxPages){
  const pages=Math.min(30,Math.max(1,Number(maxPages)||10));const links=[];let listingPages=0;
  for(let page=1;page<=pages;page++){
    const url=page===1?'https://dailyupdate.co.za/category/vacancies/':`https://dailyupdate.co.za/category/vacancies/page/${page}/`;
    try{const res=await fetchHtml(url);listingPages+=1;links.push(...anchors(res.html,res.url).filter(usefulDailyUpdateLink))}
    catch{if(page===1)throw new Error('DailyUpdate website fallback is unavailable');break}
  }
  const unique=[...new Map(links.map(x=>[x.url.replace(/\/$/,''),x])).values()];
  const detail=await fetchDetails(unique,'dailyupdate',Math.min(300,Math.max(20,pages*12)));
  return{records:detail.records,stats:{mode:'direct-website',listingPages,discovered:unique.length,detailFailed:detail.failed}};
}

async function zaBursariesFallback(maxPages,year){
  const now=new Date();const y=Number(String(year||now.getFullYear()).replace(/\D/g,''))||now.getFullYear();
  const seeds=['https://www.zabursaries.co.za/','https://www.zabursaries.co.za/bursary-news/',`https://www.zabursaries.co.za/?s=${y}`];
  for(let offset=-1;offset<=2;offset++){
    const d=new Date(now.getFullYear(),now.getMonth()+offset,1);
    seeds.push(`https://www.zabursaries.co.za/bursaries-closing-in-${monthSlug(d)}-${d.getFullYear()}/`);
  }
  const links=[];let listingPages=0;
  for(const url of seeds.slice(0,Math.min(seeds.length,Math.max(3,Number(maxPages)||6)))){
    try{const res=await fetchHtml(url);listingPages+=1;links.push(...anchors(res.html,res.url).filter(usefulBursaryLink))}catch{}
  }
  if(!listingPages)throw new Error('ZA Bursaries website fallback is unavailable');
  const unique=[...new Map(links.map(x=>[x.url.replace(/\/$/,''),x])).values()];
  const detail=await fetchDetails(unique,'zabursaries',Math.min(250,Math.max(30,(Number(maxPages)||10)*10)));
  return{records:detail.records,stats:{mode:'direct-website',listingPages,discovered:unique.length,detailFailed:detail.failed}};
}

export async function fetchDirectUrlFallback(url){
  const family=familyForUrl(url);
  if(!family)return null;
  const page=await fetchHtml(url);
  return{record:recordFromHtml({html:page.html,url:page.url,family}),stats:{mode:'direct-detail',family,status:page.status}};
}

export async function fetchDirectSourceFallback(kind,options={}){
  if(kind==='dailyupdate'||kind==='dailyupdate/jobs')return dailyUpdateFallback(options.maxPages);
  if(kind==='bursaries')return zaBursariesFallback(options.maxPages,options.year);
  return null;
}
