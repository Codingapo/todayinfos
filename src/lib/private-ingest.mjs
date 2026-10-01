import { slugify } from './utils.mjs';
import { normalizeClassification, normalizeGeo } from './global-content.mjs';
import { contentQuality } from './content-rules.mjs';

const clean=v=>String(v||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const list=v=>Array.isArray(v)?v:String(v||'').split(/[\n,]+/).map(x=>x.trim()).filter(Boolean);
const yearOf=item=>{
  const raw=item.closing_date||item.posted_date||item.date||new Date().toISOString();
  const m=String(raw).match(/20\d{2}/);return m?.[0]||String(new Date().getFullYear());
};
const dedupe=arr=>[...new Set(arr.map(x=>String(x||'').trim()).filter(Boolean))];

export function descriptiveOpportunitySlug(item={},type='job',countryCode=''){
  const org=clean(item.company||item.organisation||item.organization||item.provider||'');
  const title=clean(item.title||item.job_title||item.name||type);
  const city=clean(item.city||item.location||'');
  const year=yearOf(item);
  const country=String(countryCode||item.country_code||item.country||'').toLowerCase();
  const parts=type==='bursary'
    ?[org,title,'bursary',country,year]
    :[org,title,city,country,year];
  return slugify(dedupe(parts).join(' ')).slice(0,120).replace(/-+$/,'');
}

function standardBody(item,type){
  const rewritten=clean(item.rewritten_body||item.rewritten_content||'');
  const org=clean(item.company||item.organisation||item.organization||item.provider||'');
  const title=clean(item.title||item.job_title||item.name||type);
  const place=clean(item.location||item.city||'');
  const description=rewritten||(type==='bursary'?`${org||'The provider'} is offering the ${title}. This TodayInfo page organises the main eligibility, documents, dates and application steps in a simpler format.`:`${org||'The organisation'} is accepting applications for ${title}${place?` in ${place}`:''}. This TodayInfo page organises the main role, requirements and application steps in a simpler format.`);
  const requirements=list(item.requirements);
  const responsibilities=list(item.responsibilities);
  const eligibility=list(item.eligibility);
  const documents=list(item.supporting_documents||item.documents);
  const howToApply=list(item.how_to_apply||item.application_steps);
  const sections=[];
  const add=(heading,values)=>{if(!values?.length)return;sections.push(`## ${heading}`,...values.map(x=>`- ${clean(x)}`),'')};
  if(description)sections.push('## Overview',description,'');
  if(type==='bursary'){
    add('Who can apply',eligibility.length?eligibility:requirements);
    add('Requirements',requirements);
    add('Supporting documents',documents);
  }else{
    add('Requirements',requirements);
    add('Responsibilities',responsibilities);
  }
  add('How to apply',howToApply);
  sections.push('## Application','Use the verified official application link on this TodayInfo page.','');
  return sections.join('\n').trim();
}

export function preparePrivateIngestItem(item={},{
  type,country_code,country_name,source_name='TodayInfo Private Ingest'
}={}){
  const contentType=type==='bursary'?'bursary':'job';
  const geo=normalizeGeo({
    country_code:item.country_code||country_code,
    country_name:item.country_name||country_name,
    region_name:item.region_name||item.region||item.province||item.state,
    city:item.city,
    location:item.location
  });
  const organisation=clean(item.company||item.organisation||item.organization||item.provider||'');
  const title=clean(item.title||item.job_title||item.name||'');
  const summary=clean(item.rewritten_summary||(
    contentType==='bursary'
      ?`${organisation||'The provider'} is offering the ${title}. See the main eligibility, closing date and verified application link.`
      :`${organisation||'The organisation'} is recruiting for ${title}${item.location?` in ${clean(item.location)}`:''}. See the main requirements and verified application link.`
  )).slice(0,420);
  const applicationUrl=clean(item.application_url||item.apply_url||item.applicationLink||'');
  const sourceUrl=clean(item.source_url||item.sourceUrl||item.url||'');
  const requirements=list(item.requirements).join('\n');
  const eligibility=list(item.eligibility).join('\n');
  const documents=list(item.supporting_documents||item.documents).join('\n');
  const howToApply=list(item.how_to_apply||item.application_steps).join('\n');

  const typeData=contentType==='bursary'?{
    provider:organisation,opening_date:item.opening_date||null,closing_date:item.closing_date||null,
    status_override:item.status||'auto',requirements,eligibility,
    how_to_apply:howToApply,supporting_documents:documents,application_url:applicationUrl
  }:{
    company:organisation,location:item.location||[geo.city,geo.region_name,geo.country_name].filter(Boolean).join(', '),
    salary:item.salary||'',closing_date:item.closing_date||null,status_override:item.status||'auto',
    requirements,responsibilities:list(item.responsibilities).join('\n'),
    how_to_apply:howToApply,supporting_documents:documents,application_url:applicationUrl
  };

  const classification=normalizeClassification({
    organisation,opportunity_type:contentType,
    education_level:item.education_level,fields_of_study:item.fields_of_study,
    job_type:item.job_type,work_mode:item.work_mode,
    eligibility_tags:item.eligibility_tags||item.eligibility,
    keywords:item.keywords
  });

  const draft={
    title,
    slug:descriptiveOpportunitySlug(item,contentType,geo.country_code),
    content_type:contentType,
    summary,
    body_markdown:standardBody(item,contentType),
    posted_date:item.posted_date||item.date||new Date().toISOString(),
    category:contentType==='bursary'?'Bursaries':'Jobs',
    categories:dedupe([contentType==='bursary'?'Bursaries':'Jobs',geo.country_name,geo.region_name]),
    tags:dedupe([...(list(item.tags)),contentType==='bursary'?'Bursaries':'Jobs',geo.country_name,organisation]).slice(0,30),
    topics:[],related_links:[],related_ids:[],recommendation_ids:[],recommendation_links:[],
    documents:[],navigation_links:[],type_data:typeData,geo,classification,
    main_image_url:item.main_image_url||item.image_url||null,
    seo_title:clean(item.seo_title||`${title}${organisation?` at ${organisation}`:''}`).slice(0,70),
    seo_description:clean(item.seo_description||summary).slice(0,170),
    is_trending:false,status:'draft',
    source:{
      source_name,source_url:sourceUrl,private_ingest:true,
      rewrite_mode:item.rewritten_body||item.rewritten_content?'provided-rewrite':'structured-rule-rewrite'
    }
  };
  const quality=contentQuality(draft);
  return{draft,quality,source_url:sourceUrl,application_url:applicationUrl};
}
