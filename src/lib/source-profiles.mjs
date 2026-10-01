const MONTHS={january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
const clean=v=>String(v||'').replace(/\r/g,'').replace(/[ \t]+/g,' ').trim();
const list=v=>Array.isArray(v)?v:[];

export function sourceFamily(record={}){
  const hay=`${record.sourceId||''} ${record.sourceName||''} ${record.url||''} ${record.source?.url||''} ${record.source?.canonicalUrl||''}`.toLowerCase();
  if(/zabursar|za bursar|bursaries south africa/.test(hay))return 'zabursaries';
  if(/dailyupdate|daily update/.test(hay))return 'dailyupdate';
  return 'generic';
}

export function isSourceIndexRecord(record={}){
  const family=sourceFamily(record);
  const title=clean(record.title).toLowerCase();
  const path=String(record.path||record.url||'').toLowerCase();
  if(family==='zabursaries'&&/bursaries closing in [a-z]+ 20\d{2}/i.test(title))return true;
  if(family==='zabursaries'&&/\/bursaries-closing-in-[a-z]+-20\d{2}\/?/.test(path))return true;
  if(family==='dailyupdate'&&/\/page\/\d+\/?(?:$|[?#])/.test(path))return true;
  if(family==='dailyupdate'&&/^page\s+\d+/i.test(title))return true;
  return false;
}

const sourceLineJunk=(line,family)=>{
  if(family==='dailyupdate'&&/^(table of contents|toggle|read more|by admin)$/i.test(line))return true;
  if(family==='dailyupdate'&&/^\*?\s*[a-z]+ \d{1,2}, 20\d{2}(?:[a-z]+ \d{1,2}, 20\d{2})?$/i.test(line))return true;
  if(family==='zabursaries'&&/^enter [“"']?www\.zabursaries\.co\.za/i.test(line))return true;
  if(family==='zabursaries'&&/^please do not contact .* if .* closed/i.test(line))return true;
  return false;
};

export function cleanForSource(text='',family='generic',title=''){
  const lines=String(text||'').replace(/\r/g,'').split('\n');
  const out=[];const normalizedTitle=clean(title).toLowerCase();
  for(const raw of lines){
    const line=clean(raw);
    if(!line){if(out.at(-1)!=='')out.push('');continue}
    if(sourceLineJunk(line,family))continue;
    if(normalizedTitle&&line.toLowerCase()===normalizedTitle&&out.some(Boolean))continue;
    if(out.at(-1)===line)continue;
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g,'\n\n').trim();
}

const headingLike=line=>/^(?:#{1,4}\s*)?(?:eligibility requirements?|minimum requirements?|requirements?|how to apply|application process|supporting documents?|documents required|closing date|application deadline|contact(?: the)? .*provider|location|overview|about .+)\b/i.test(clean(line));

function section(text,patterns=[]){
  const lines=String(text||'').replace(/\r/g,'').split('\n');
  let start=-1;
  for(let i=0;i<lines.length;i++){
    if(patterns.some(r=>r.test(clean(lines[i])))){start=i+1;break}
  }
  if(start<0)return '';
  const out=[];
  for(let i=start;i<lines.length;i++){
    const line=clean(lines[i]);
    if(i>start&&headingLike(line))break;
    if(line)out.push(line.replace(/^[-*•]\s*/,''));
  }
  return out.join('\n').trim();
}

function safeHttp(value){
  try{const u=new URL(String(value||''));return ['http:','https:'].includes(u.protocol)}catch{return false}
}
function host(value){try{return new URL(String(value||'')).hostname.toLowerCase().replace(/^www\./,'')}catch{return ''}}

function bestApplicationUrl(record,family){
  const links=[
    ...list(record.applicationLinks),
    ...list(record.links),
    ...list(record.relatedLinks)
  ].map(x=>typeof x==='string'?{url:x,title:''}:{url:x?.url||x?.href||x?.link,title:x?.title||x?.text||x?.label||''})
   .filter(x=>safeHttp(x.url));
  const sourceHost=family==='zabursaries'?'zabursaries.co.za':family==='dailyupdate'?'dailyupdate.co.za':host(record.url);
  const scored=links.map(x=>{
    const h=`${x.title} ${x.url}`.toLowerCase();let score=0;
    if(/apply|application|career|vacanc|recruit|erecruit|form/.test(h))score+=8;
    if(host(x.url)&&host(x.url)!==sourceHost)score+=5;
    if(/privacy|contact|facebook|instagram|twitter|whatsapp|terms|cookie/.test(h))score-=20;
    if(/\/category\/|\/tag\/|\/page\//.test(x.url))score-=12;
    return {...x,score};
  }).sort((a,b)=>b.score-a.score);
  return scored[0]?.score>0?scored[0].url:'';
}

function parseDate(text){
  const s=clean(text);
  let m=s.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if(m)return `${m[1]}-${m[2]}-${m[3]}`;
  m=s.match(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/i);
  if(m){const mm=String(MONTHS[m[2].toLowerCase()]).padStart(2,'0');return `${m[3]}-${mm}-${String(m[1]).padStart(2,'0')}`}
  return null;
}

export function improveDraftForSource(record={},draft={}){
  const family=sourceFamily(record);
  if(family==='generic')return {...draft,source_family:family};
  const next=structuredClone(draft);
  const raw=record.contentText||record.content||record.description||record.excerpt||next.body_markdown||'';
  next.body_markdown=cleanForSource(raw,family,record.title||next.title);
  next.source_family=family;
  next.type_data={...(next.type_data||{})};

  if(family==='dailyupdate'){
    const title=clean(record.title||next.title).toLowerCase();
    if(/\bintern(ship|ships)?\b/.test(title))next.content_type='internship';
    else if(/\blearnership|apprentice/.test(title))next.content_type='learnership';
    else if(/\bhiring|vacanc|jobs?|career/.test(title))next.content_type='job';
    const req=section(raw,[/^(?:#{1,4}\s*)?.*requirements?\b/i,/^(?:#{1,4}\s*)?who can apply/i]);
    const apply=section(raw,[/^(?:#{1,4}\s*)?how to apply/i,/^(?:#{1,4}\s*)?application process/i]);
    if(req)next.type_data.requirements=req;
    if(apply)next.type_data.how_to_apply=apply;
    const app=bestApplicationUrl(record,family);if(app)next.type_data.application_url=app;
  }

  if(family==='zabursaries'){
    if(/scholarship/i.test(record.title||'')&&!/bursar/i.test(record.title||''))next.content_type='scholarship';
    else next.content_type='bursary';
    const eligibility=section(raw,[/eligibility requirements?/i,/minimum entry criteria/i,/who can apply/i]);
    const apply=section(raw,[/how to apply/i,/application process/i]);
    const docs=section(raw,[/supporting documents?/i,/documents required/i,/what documents/i]);
    const closing=section(raw,[/closing date/i,/application deadline/i]);
    if(eligibility){next.type_data.eligibility=eligibility;if(!next.type_data.requirements)next.type_data.requirements=eligibility}
    if(apply)next.type_data.how_to_apply=apply;
    if(docs)next.type_data.supporting_documents=docs;
    if(!next.type_data.closing_date){const d=parseDate(closing||raw);if(d)next.type_data.closing_date=d}
    const app=bestApplicationUrl(record,family);if(app)next.type_data.application_url=app;
  }
  return next;
}

function usefulOpportunityLink(item,family){
  const title=clean(item?.title||item?.text||item?.label||item?.name||'');
  const url=clean(item?.url||item?.href||item?.link||'');
  if(!title||!safeHttp(url))return null;
  const hay=`${title} ${url}`.toLowerCase();
  if(/privacy|terms|cookie|contact|facebook|instagram|twitter|whatsapp|youtube|login|register/.test(hay))return null;
  if(/\/tag\/|\/category\/|\/author\/|\/feed\/?$/.test(url))return null;
  if(family==='zabursaries'){
    if(!/bursar|scholarship|funding|nsfas|student funding/i.test(hay))return null;
    return {title,url,suggested_type:/scholarship/i.test(hay)?'scholarship':'bursary'};
  }
  if(family==='dailyupdate'){
    if(!/job|hiring|vacanc|career|intern|learnership|apprentice|programme|opportunit/i.test(hay))return null;
    const suggested_type=/intern/i.test(hay)?'internship':/learnership|apprentice/i.test(hay)?'learnership':'job';
    return {title,url,suggested_type};
  }
  return null;
}

export function discoverSourceLinks(records=[]){
  const out=new Map();
  for(const record of records){
    const family=sourceFamily(record);
    if(family==='generic')continue;
    const sourceUrl=record.url||record.source?.canonicalUrl||record.source?.url||null;
    const pools=[...list(record.links),...list(record.relatedLinks),...list(record.recommendations),...list(record.relatedContent)];
    for(const item of pools){
      const found=usefulOpportunityLink(item,family);if(!found)continue;
      const key=found.url.replace(/\/$/,'');
      if(key===String(sourceUrl||'').replace(/\/$/,''))continue;
      if(!out.has(key))out.set(key,{...found,source_family:family,discovered_from:sourceUrl,reason:isSourceIndexRecord(record)?'source_index':'source_related'});
    }
  }
  return [...out.values()];
}
