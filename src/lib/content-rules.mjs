import { slugify } from './utils.mjs';

const BOILERPLATE_LINES = [
  /^post navigation$/i,/^leave a reply$/i,/^recent posts$/i,/^recent comments$/i,/^archives$/i,/^categories$/i,
  /^sponsored$/i,/^advertisement$/i,/^menu$/i,/^home$/i,/^search$/i,/^copyright/i,/^cookie/i,
  /^share this/i,/^related posts?$/i,/^previous post$/i,/^next post$/i,/^read more$/i,/^follow us/i,
  /^author:?$/i,/^tags:?$/i,/^posted in:?$/i
];

export const CONTENT_TYPES = ['news','bursary','job','other','internship','learnership','announcement','story'];

export function cleanSourceText(value='') {
  const lines=String(value||'').replace(/\r/g,'').split('\n').map(x=>x.replace(/\s+/g,' ').trim());
  const kept=[];
  for(const line of lines){
    if(!line) { if(kept.at(-1)!=='') kept.push(''); continue; }
    if(BOILERPLATE_LINES.some(r=>r.test(line))) continue;
    if(/^https?:\/\/\S+$/i.test(line)) continue;
    if(/^(facebook|twitter|instagram|linkedin|whatsapp)$/i.test(line)) continue;
    if(kept.at(-1)===line) continue;
    kept.push(line);
  }
  return kept.join('\n').replace(/\n{3,}/g,'\n\n').trim();
}

export function isIndexLikeRecord(record={}) {
  const title=String(record.title||'').trim();
  const path=String(record.path||record.url||'').toLowerCase();
  const pageType=String(record.pageType||'').toLowerCase();
  if (/^(month|year|category|tag|author|archive):/i.test(title)) return true;
  if (/^page\s+\d+$/i.test(title)) return true;
  if (/\/(category|tag|author)\//i.test(path)) return true;
  if (/\/page\/\d+\/?(?:$|[?#])/i.test(path)) return true;
  if (['archive','tag','category'].includes(pageType)) return true;
  return false;
}

export function detectContentType(record={}) {
  const declared=String(record.pageType||record.type||'').toLowerCase();
  const text=`${record.title||''} ${(record.categories||[]).join(' ')} ${(record.tags||[]).join(' ')} ${record.path||''} ${record.url||''}`.toLowerCase();

  if (/\b(job|jobs|vacanc(y|ies)|hiring|career opportunity|recruitment|positions? available)\b/.test(text)) return 'job';
  if (/\bintern(ship|ships)\b|graduate programme|graduate program/.test(text)) return 'internship';
  if (/\blearnerships?\b|apprenticeship/.test(text)) return 'learnership';
  if (/\bbursar(y|ies)\b|funding opportunity|scholarship/.test(text)) return 'bursary';
  if (declared==='job') return 'job';
  if (declared==='bursary') return 'bursary';
  if (declared==='article'||/\b(news|announcement|update|notice)\b/.test(text)) return 'news';
  return 'other';
}

function firstUrl(record={}) {
  const candidates=[record.applicationUrl,record.application_url,...(record.applicationLinks||[]).map(x=>x?.url||x),...(record.links||[]).map(x=>x?.url||x)];
  return candidates.find(x=>isSafeUrl(x))||'';
}
function firstImage(record={}) {
  const values=[record.featuredImage,record.featured_image_url,record.image,...(record.images||[]).map(x=>x?.url||x?.src||x)];
  return values.find(x=>isSafeUrl(x))||'';
}
export function isSafeUrl(value,{allowRelative=true}={}) {
  if(!value) return false;
  const v=String(value).trim();
  if(allowRelative && /^\/(?!\/)/.test(v)) return true;
  try { const u=new URL(v); return ['http:','https:'].includes(u.protocol); } catch { return false; }
}
const safeList=(arr=[])=>[...new Set((Array.isArray(arr)?arr:[]).map(x=>String(x||'').replace(/^#/,'').trim()).filter(Boolean))].slice(0,40);
const cleanCategories=(arr=[])=>safeList(arr).filter(x=>!/^(?:\d+|page\s*\d+)$/i.test(x) && !/^https?:/i.test(x));
const titleCaseType=t=>({bursary:'Bursaries',job:'Jobs',internship:'Internships',learnership:'Learnerships',news:'News',announcement:'Announcements',story:'Stories'}[t]||'TodayInfo');

export function ruleDraftFromRecord(record={}) {
  const content_type=detectContentType(record);
  const title=String(record.title||record.name||'Untitled import').replace(/\s+/g,' ').trim();
  const content=cleanSourceText(record.contentText||record.content||record.description||record.excerpt||'');
  const explicitSummary=cleanSourceText(record.description||record.excerpt||'');
  const summary=(explicitSummary || content.replace(/\n+/g,' ').slice(0,420)).slice(0,1000);
  const categories=cleanCategories(record.categories);
  const year=(title.match(/\b20\d{2}\b/)||[])[0];
  const tags=safeList([...(record.tags||[]),...categories,titleCaseType(content_type),...(year?[year]:[])]);
  const type_data={};

  if(content_type==='bursary') {
    type_data.provider=record.organization||record.provider||'';
    type_data.opening_date=record.openingDate||record.opening_date||null;
    type_data.closing_date=record.closingDate||record.closing_date||null;
    type_data.status_override=['open','closed','upcoming','closing_soon'].includes(record.opportunityStatus)?record.opportunityStatus:'auto';
    type_data.requirements=Array.isArray(record.requirements)?record.requirements.join('\n'):String(record.requirements||'');
    type_data.eligibility=Array.isArray(record.eligibility)?record.eligibility.join('\n'):String(record.eligibility||'');
    type_data.how_to_apply=String(record.howToApply||record.how_to_apply||'');
    type_data.application_url=firstUrl(record);
  } else if(content_type==='job'||content_type==='internship'||content_type==='learnership') {
    type_data.company=record.organization||record.company||'';
    type_data.location=record.location||'';
    type_data.salary=record.salary||'';
    type_data.closing_date=record.closingDate||record.closing_date||null;
    type_data.status_override='auto';
    type_data.requirements=Array.isArray(record.requirements)?record.requirements.join('\n'):String(record.requirements||'');
    type_data.responsibilities=Array.isArray(record.responsibilities)?record.responsibilities.join('\n'):String(record.responsibilities||'');
    type_data.how_to_apply=String(record.howToApply||record.how_to_apply||'');
    type_data.application_url=firstUrl(record);
  } else if(content_type==='news') {
    type_data.event_date=record.eventDate||record.event_date||null;
  }

  const topics=(record.sections||[]).slice(0,10).map((s,i)=>({
    id:`t${i+1}`,key:`t${i+1}`,title:s.title||s.heading||`Section ${i+1}`,
    body:cleanSourceText(s.body||s.content||''),links:[],images:[],documents:[]
  })).filter(x=>x.title && x.body);

  return {
    title,slug:slugify(record.slug||title),content_type,summary,body_markdown:content,
    posted_date:record.publishedAt||record.modifiedAt||record.posted_date||null,
    category:categories[0]||titleCaseType(content_type),categories,tags,
    topics,related_links:[],related_ids:[],recommendation_ids:[],documents:[],navigation_links:[],
    main_image_url:firstImage(record),seo_title:title,seo_description:summary,type_data,
    is_trending:false,status:'draft'
  };
}

export function contentQuality(draft={}) {
  let score=0;
  const issues=[];
  if(draft.title && draft.title.length>=8) score+=15; else issues.push('Weak or missing title');
  if(draft.body_markdown && draft.body_markdown.length>=180) score+=25; else issues.push('Main content is short');
  if(draft.summary && draft.summary.length>=60) score+=10; else issues.push('Summary needs review');
  if(draft.tags?.length>=2) score+=10; else issues.push('Add more tags');
  if(draft.posted_date) score+=8; else issues.push('Posted date missing');
  if(draft.main_image_url) score+=7; else issues.push('Main image missing');

  if(draft.content_type==='bursary') {
    if(draft.type_data?.provider) score+=10; else issues.push('Provider missing');
    if(draft.type_data?.closing_date) score+=10; else issues.push('Closing date missing');
    if(draft.type_data?.application_url) score+=5; else issues.push('Application link missing');
  } else if(['job','internship','learnership'].includes(draft.content_type)) {
    if(draft.type_data?.company) score+=10; else issues.push('Company missing');
    if(draft.type_data?.closing_date) score+=5; else issues.push('Closing date missing');
    if(draft.type_data?.application_url) score+=5; else issues.push('Application link missing');
  } else {
    score+=20;
  }

  return {score:Math.min(100,score),issues:issues.slice(0,8)};
}

export function calculateOpportunityStatus(typeData={}, now=new Date()) {
  const override=String(typeData.status_override||'auto');
  if(['open','closed','upcoming','closing_soon','unknown'].includes(override) && override!=='auto') return override;
  const open=typeData.opening_date?new Date(typeData.opening_date):null;
  const close=typeData.closing_date?new Date(typeData.closing_date):null;
  if(open&&!Number.isNaN(open)&&now<open) return 'upcoming';
  if(close&&!Number.isNaN(close)) {
    if(now>close) return 'closed';
    const days=(close-now)/86400000;
    if(days>=0&&days<=14) return 'closing_soon';
    return 'open';
  }
  if(open&&!Number.isNaN(open)&&now>=open) return 'open';
  return 'unknown';
}

export function normalizeTags(tags=[]) {
  return [...new Set((tags||[]).map(x=>String(x).replace(/^#/,'').trim()).filter(Boolean))].slice(0,30);
}
