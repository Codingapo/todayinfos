import { slugify } from './utils.mjs';
import { normalizeClassification, normalizeGeo } from './global-content.mjs';
import { contentQuality } from './content-rules.mjs';

const clean=v=>String(v||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const list=v=>Array.isArray(v)?v:String(v||'').split(/[\n,]+/).map(x=>x.trim()).filter(Boolean);
const dedupe=arr=>[...new Set(arr.map(x=>String(x||'').trim()).filter(Boolean))];

const TYPE_META={
  job:{category:'Jobs',root:'jobs',organisationField:'company'},
  internship:{category:'Internships',root:'internships',organisationField:'company'},
  learnership:{category:'Learnerships',root:'learnerships',organisationField:'company'},
  opportunity:{category:'Opportunities',root:'opportunities',organisationField:'company'},
  bursary:{category:'Bursaries',root:'bursaries',organisationField:'provider'},
  scholarship:{category:'Scholarships',root:'scholarships',organisationField:'provider'}
};

const normalizeType=value=>{
  const type=String(value||'job').trim().toLowerCase();
  return TYPE_META[type]?type:'job';
};

const nestedValue=(item,key,...aliases)=>{
  const td=item?.type_data||{};
  for(const name of [key,...aliases]){
    if(item?.[name]!==undefined&&item?.[name]!==null&&item?.[name]!=='')return item[name];
    if(td?.[name]!==undefined&&td?.[name]!==null&&td?.[name]!=='')return td[name];
  }
  return undefined;
};

const sourceValue=(item,key,...aliases)=>{
  const src=item?.source||{};
  for(const name of [key,...aliases]){
    if(item?.[name]!==undefined&&item?.[name]!==null&&item?.[name]!=='')return item[name];
    if(src?.[name]!==undefined&&src?.[name]!==null&&src?.[name]!=='')return src[name];
    if(item?.type_data?.[name]!==undefined&&item?.type_data?.[name]!==null&&item?.type_data?.[name]!=='')return item.type_data[name];
  }
  return undefined;
};

const yearOf=item=>{
  const raw=nestedValue(item,'closing_date')||item.posted_date||item.date||new Date().toISOString();
  const m=String(raw).match(/20\d{2}/);return m?.[0]||String(new Date().getFullYear());
};

export function descriptiveOpportunitySlug(item={},type='job',countryCode=''){
  const contentType=normalizeType(type||item.content_type);
  const org=clean(nestedValue(item,'company','organisation','organization','provider')||'');
  const title=clean(item.title||item.job_title||item.name||contentType);
  const city=clean(item.city||nestedValue(item,'location')||'');
  const year=yearOf(item);
  const country=String(countryCode||item.country_code||item.geo?.country_code||nestedValue(item,'country')||'').toLowerCase();
  const parts=['bursary','scholarship'].includes(contentType)
    ?[org,title,contentType,country,year]
    :[org,title,city,country,year];
  return slugify(dedupe(parts).join(' ')).slice(0,120).replace(/-+$/,'');
}

function standardBody(item,type){
  const contentType=normalizeType(type);
  const rewritten=clean(item.rewritten_body||item.rewritten_content||'');
  if(item.body_markdown&&String(item.body_markdown).trim())return String(item.body_markdown).trim();

  const org=clean(nestedValue(item,'company','organisation','organization','provider')||'');
  const title=clean(item.title||item.job_title||item.name||contentType);
  const place=clean(nestedValue(item,'location')||item.city||'');
  const funding=['bursary','scholarship'].includes(contentType);
  const description=rewritten||clean(item.description||item.summary||'')||(
    funding
      ?`${org||'The provider'} is offering ${title}. This TodayInfo page organises the main eligibility, documents, dates and application steps in a simpler format.`
      :`${org||'The organisation'} is accepting applications for ${title}${place?` in ${place}`:''}. This TodayInfo page organises the main role, requirements and application steps in a simpler format.`
  );
  const requirements=list(nestedValue(item,'requirements'));
  const responsibilities=list(nestedValue(item,'responsibilities'));
  const eligibility=list(nestedValue(item,'eligibility'));
  const documents=list(nestedValue(item,'supporting_documents','documents'));
  const howToApply=list(nestedValue(item,'how_to_apply','application_steps'));
  const sections=[];
  const add=(heading,values)=>{if(!values?.length)return;sections.push(`## ${heading}`,...values.map(x=>`- ${clean(x)}`),'')};

  if(description)sections.push('## Overview',description,'');
  if(funding){
    add('Who can apply',eligibility.length?eligibility:requirements);
    add('Requirements',requirements);
    add('Supporting documents',documents);
  }else{
    add('Requirements',requirements);
    add('Responsibilities',responsibilities);
    add('Supporting documents',documents);
  }
  add('How to apply',howToApply);
  sections.push('## Application','Use the official application link shown on this TodayInfo page.','');
  return sections.join('\n').trim();
}

function organisationFor(item,contentType){
  const td=item.type_data||{};
  if(['bursary','scholarship'].includes(contentType))return clean(
    item.provider||td.provider||item.company||td.company||item.organisation||item.organization||''
  );
  return clean(item.company||td.company||item.organisation||item.organization||item.provider||td.provider||'');
}

function statusOverride(item){
  const value=nestedValue(item,'status_override');
  if(value)return String(value);
  const research=String(item.research_status||'').trim().toLowerCase();
  if(['open','closed','closing_soon','upcoming','unknown','auto'].includes(research))return research;
  return 'auto';
}

export function preparePrivateIngestItem(item={},{
  type,country_code,country_name,source_name='TodayInfo Private Ingest'
}={}){
  const contentType=normalizeType(type||item.content_type);
  const meta=TYPE_META[contentType];
  const td=item.type_data||{};
  const src=item.source||{};
  const inputGeo=item.geo||{};

  const suppliedCountryName=item.country_name||inputGeo.country_name||td.country||country_name||null;
  const geo=normalizeGeo({
    country_code:item.country_code||inputGeo.country_code||country_code,
    country_name:suppliedCountryName,
    country:suppliedCountryName,
    region_name:item.region_name||inputGeo.region_name||item.region||item.province||item.state,
    region_code:item.region_code||inputGeo.region_code,
    city:item.city||inputGeo.city,
    location:item.location||inputGeo.location||td.location
  });

  // Preserve a human-readable global label without fabricating an ISO country code.
  if(!geo.country_code&&suppliedCountryName)geo.country_name=String(suppliedCountryName).trim();

  const organisation=organisationFor(item,contentType);
  const title=clean(item.title||item.job_title||item.name||'');
  const funding=['bursary','scholarship'].includes(contentType);
  const summary=clean(
    item.rewritten_summary||
    item.summary||
    item.description||
    (funding
      ?`${organisation||'The provider'} is offering ${title}. See the main eligibility, closing date and official application details.`
      :`${organisation||'The organisation'} is recruiting for ${title}${td.location||item.location?` in ${clean(td.location||item.location)}`:''}. See the main requirements and official application details.`)
  ).slice(0,1000);

  const applicationUrl=clean(
    item.application_url||item.apply_url||item.applicationLink||td.application_url||td.apply_url||''
  );
  const sourceUrl=clean(
    item.source_url||item.sourceUrl||item.url||src.source_url||td.source_url||''
  );
  const requirements=list(nestedValue(item,'requirements')).join('\n');
  const eligibility=list(nestedValue(item,'eligibility')).join('\n');
  const documents=list(nestedValue(item,'supporting_documents','documents')).join('\n');
  const responsibilities=list(nestedValue(item,'responsibilities')).join('\n');
  const howToApply=list(nestedValue(item,'how_to_apply','application_steps')).join('\n');
  const location=nestedValue(item,'location')||[geo.city,geo.region_name,geo.country_name].filter(Boolean).join(', ');

  const typeData=funding?{
    provider:organisation,
    opening_date:nestedValue(item,'opening_date')||null,
    closing_date:nestedValue(item,'closing_date')||null,
    status_override:statusOverride(item),
    requirements,eligibility,how_to_apply:howToApply,supporting_documents:documents,
    application_url:applicationUrl,
    application_email:nestedValue(item,'application_email')||null,
    subtype:nestedValue(item,'subtype')||null
  }:{
    company:organisation,location,
    salary:nestedValue(item,'salary')||'',
    closing_date:nestedValue(item,'closing_date')||null,
    status_override:statusOverride(item),
    requirements,responsibilities,how_to_apply:howToApply,supporting_documents:documents,
    application_url:applicationUrl,
    application_email:nestedValue(item,'application_email')||null,
    subtype:nestedValue(item,'subtype')||null
  };

  const classification=normalizeClassification({
    organisation,
    subcategory:item.classification?.subcategory,
    opportunity_type:item.classification?.opportunity_type||contentType,
    education_level:item.education_level||item.classification?.education_level,
    fields_of_study:item.fields_of_study||item.classification?.fields_of_study,
    job_type:item.job_type||item.classification?.job_type,
    work_mode:item.work_mode||item.classification?.work_mode,
    salary:item.salary||item.classification?.salary,
    eligibility_tags:item.eligibility_tags||item.classification?.eligibility_tags||item.eligibility,
    keywords:item.keywords||item.classification?.keywords
  });

  const draft={
    title,
    slug:clean(item.slug)||descriptiveOpportunitySlug(item,contentType,geo.country_code),
    content_type:contentType,
    summary,
    body_markdown:standardBody(item,contentType),
    posted_date:item.posted_date||item.date||null,
    category:clean(item.category)||meta.category,
    categories:dedupe([...(Array.isArray(item.categories)?item.categories:[]),meta.category,geo.country_name,geo.region_name]),
    tags:dedupe([...(list(item.tags)),meta.category,geo.country_name,organisation]).slice(0,30),
    topics:Array.isArray(item.topics)?item.topics:[],
    related_links:Array.isArray(item.related_links)?item.related_links:[],
    related_ids:Array.isArray(item.related_ids)?item.related_ids:[],
    recommendation_ids:Array.isArray(item.recommendation_ids)?item.recommendation_ids:[],
    recommendation_links:Array.isArray(item.recommendation_links)?item.recommendation_links:[],
    documents:Array.isArray(item.documents)?item.documents:[],
    navigation_links:Array.isArray(item.navigation_links)?item.navigation_links:[],
    type_data:typeData,geo,classification,
    main_image_url:item.main_image_url||item.image_url||null,
    seo_title:clean(item.seo_title||title).slice(0,180),
    seo_description:clean(item.seo_description||summary).slice(0,500),
    is_trending:Boolean(item.is_trending),
    status:'draft',
    source:{
      source_name:src.source_name||source_name,
      source_url:sourceUrl,
      source_title:src.source_title||null,
      verified_as_of:src.verified_as_of||item.verified_as_of||null,
      confidence:src.confidence||null,
      notes:src.notes||null,
      source_type:src.source_type||null,
      private_ingest:true,
      rewrite_mode:item.rewritten_body||item.rewritten_content?'provided-rewrite':(item.body_markdown?'provided-structured-content':'structured-rule-rewrite')
    }
  };

  const quality=contentQuality(draft);
  return{draft,quality,source_url:sourceUrl,application_url:applicationUrl};
}
