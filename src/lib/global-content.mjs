import { slugify } from './utils.mjs';

const COUNTRY_ALIASES = new Map([
  ['south africa','ZA'],['za','ZA'],['zaf','ZA'],
  ['united kingdom','GB'],['uk','GB'],['gb','GB'],['gbr','GB'],
  ['united states','US'],['united states of america','US'],['usa','US'],['us','US'],
  ['nigeria','NG'],['ng','NG'],['kenya','KE'],['ke','KE'],['ghana','GH'],['gh','GH'],['uganda','UG'],['ug','UG'],
  ['tanzania','TZ'],['tz','TZ'],['zambia','ZM'],['zm','ZM'],['zimbabwe','ZW'],['zw','ZW'],['botswana','BW'],['bw','BW'],
  ['canada','CA'],['ca','CA'],['australia','AU'],['au','AU'],['germany','DE'],['de','DE'],['france','FR'],['fr','FR'],
  ['netherlands','NL'],['nl','NL'],['ireland','IE'],['ie','IE'],['india','IN'],['in','IN'],['singapore','SG'],['sg','SG'],
  ['new zealand','NZ'],['nz','NZ'],['united arab emirates','AE'],['uae','AE'],['ae','AE'],['brazil','BR'],['br','BR'],
  ['mexico','MX'],['mx','MX'],['spain','ES'],['es','ES'],['italy','IT'],['it','IT'],['poland','PL'],['pl','PL'],
  ['sweden','SE'],['se','SE'],['norway','NO'],['no','NO'],['denmark','DK'],['dk','DK'],['switzerland','CH'],['ch','CH']
]);

const COUNTRY_NAMES = {
  ZA:'South Africa',GB:'United Kingdom',US:'United States',NG:'Nigeria',KE:'Kenya',GH:'Ghana',UG:'Uganda',TZ:'Tanzania',ZM:'Zambia',ZW:'Zimbabwe',BW:'Botswana',CA:'Canada',AU:'Australia',DE:'Germany',FR:'France',NL:'Netherlands',IE:'Ireland',IN:'India',SG:'Singapore',NZ:'New Zealand',AE:'United Arab Emirates',BR:'Brazil',MX:'Mexico',ES:'Spain',IT:'Italy',PL:'Poland',SE:'Sweden',NO:'Norway',DK:'Denmark',CH:'Switzerland'
};

export function normalizeCountryCode(value='') {
  const raw=String(value||'').trim();
  if(!raw)return null;
  const lower=raw.toLowerCase();
  if(COUNTRY_ALIASES.has(lower))return COUNTRY_ALIASES.get(lower);
  if(/^[a-z]{2}$/i.test(raw))return raw.toUpperCase();
  return raw.slice(0,3).toUpperCase();
}

export function normalizeGeo(input={}) {
  const country_code=normalizeCountryCode(input.country_code||input.countryCode||input.country||'');
  const country_name=String(input.country_name||input.countryName||COUNTRY_NAMES[country_code]||input.country||'').trim()||null;
  const region_code=String(input.region_code||input.regionCode||'').trim()||null;
  const region_name=String(input.region_name||input.regionName||input.region||input.province||input.state||'').trim()||null;
  const city=String(input.city||'').trim()||null;
  const location=String(input.location||input.location_text||'').trim()||null;
  return {country_code,country_name,region_code,region_name,city,location};
}

export function normalizeClassification(input={}) {
  const arr=v=>[...new Set((Array.isArray(v)?v:String(v||'').split(',')).map(x=>String(x).trim()).filter(Boolean))].slice(0,40);
  const salary=input.salary&&typeof input.salary==='object'?input.salary:{};
  return {
    subcategory:String(input.subcategory||'').trim()||null,
    opportunity_type:String(input.opportunity_type||input.opportunityType||'').trim()||null,
    organisation:String(input.organisation||input.organization||input.company||input.provider||'').trim()||null,
    education_level:arr(input.education_level||input.educationLevel),
    fields_of_study:arr(input.fields_of_study||input.fieldsOfStudy),
    job_type:String(input.job_type||input.jobType||'').trim()||null,
    work_mode:String(input.work_mode||input.workMode||'').trim()||null,
    salary:{
      min:Number.isFinite(Number(salary.min))?Number(salary.min):null,
      max:Number.isFinite(Number(salary.max))?Number(salary.max):null,
      currency:String(salary.currency||'').trim().toUpperCase()||null,
      period:String(salary.period||'').trim()||null,
      stipend:Boolean(salary.stipend)
    },
    eligibility_tags:arr(input.eligibility_tags||input.eligibilityTags),
    keywords:arr(input.keywords)
  };
}

export function rootForType(type='other') {
  return {
    bursary:'bursaries',scholarship:'scholarships',job:'jobs',internship:'internships',
    learnership:'learnerships',news:'news',announcement:'news',story:'stories',
    opportunity:'opportunities',other:'pages'
  }[type]||'pages';
}

export function seoPath(post={}) {
  const root=rootForType(post.content_type);
  const cc=normalizeCountryCode(post.geo?.country_code||post.geo?.country||'');
  const prefix=cc?`/${cc.toLowerCase()}`:'';
  if(['news','announcement'].includes(post.content_type)&&post.category){
    return `${prefix}/${root}/${slugify(post.category)}/${post.slug}`;
  }
  return `${prefix}/${root}/${post.slug}`;
}

export function compactLocation(geo={}) {
  const g=normalizeGeo(geo);
  return {
    country:{code:g.country_code,name:g.country_name},
    region:{code:g.region_code,name:g.region_name},
    city:g.city,
    location:g.location
  };
}

export function searchTokens(value=''){
  return [...new Set(String(value||'').toLowerCase().split(/[^a-z0-9]+/).map(x=>x.trim()).filter(x=>x.length>1))].slice(0,20);
}

export function postSearchText(post={}){
  return [
    post.title,post.summary,post.body_markdown,post.category,...(post.categories||[]),...(post.tags||[]),
    post.type_data?.company,post.type_data?.provider,post.type_data?.location,
    post.geo?.country_code,post.geo?.country_name,post.geo?.region_name,post.geo?.city,post.geo?.location,
    post.classification?.organisation,post.classification?.subcategory,post.classification?.opportunity_type,
    ...(post.classification?.education_level||[]),...(post.classification?.fields_of_study||[]),
    post.classification?.job_type,post.classification?.work_mode,...(post.classification?.eligibility_tags||[]),
    ...(post.classification?.keywords||[])
  ].filter(Boolean).join(' ').toLowerCase();
}

export function matchesSearch(post={},query=''){
  const terms=searchTokens(query);
  if(!terms.length)return true;
  const hay=postSearchText(post);
  return terms.every(term=>hay.includes(term));
}

export function queryFilters(query={}) {
  const pick=(...keys)=>keys.map(k=>query[k]).find(v=>v!==undefined&&v!==null&&String(v).trim()!=='');
  return {
    q:pick('q','query','keywords'),
    type:pick('type','content_type'),
    country:normalizeCountryCode(pick('country','country_code')),
    region:pick('region','region_name','province','state'),
    city:pick('city'),
    category:pick('category'),
    subcategory:pick('subcategory'),
    organisation:pick('organisation','organization','company','provider'),
    opportunity_type:pick('opportunity_type'),
    education_level:pick('education_level'),
    field_of_study:pick('field_of_study','field'),
    job_type:pick('job_type'),
    work_mode:pick('work_mode','remote'),
    salary_min:pick('salary_min'),salary_max:pick('salary_max'),currency:pick('currency'),
    stipend:pick('stipend'),eligibility:pick('eligibility'),tag:pick('tag'),
    opportunity_status:pick('opportunity_status','status_filter'),
    closing_before:pick('closing_before'),
    closing_after:pick('closing_after'),
    posted_before:pick('posted_before'),
    posted_after:pick('posted_after')
  };
}

export function filterPost(post={},filters={}) {
  const g=normalizeGeo(post.geo||{});
  const c=normalizeClassification(post.classification||{});
  const td=post.type_data||{};
  const lc=v=>String(v||'').toLowerCase();
  if(filters.type&&post.content_type!==filters.type)return false;
  if(filters.q&&!matchesSearch(post,filters.q))return false;
  if(filters.category){const wanted=slugify(filters.category);if(slugify(post.category||'')!==wanted&&!(post.categories||[]).some(x=>slugify(x)===wanted))return false;}
  if(filters.country&&g.country_code!==normalizeCountryCode(filters.country))return false;
  if(filters.region&&!lc(g.region_name).includes(lc(filters.region))&&!lc(g.region_code).includes(lc(filters.region)))return false;
  if(filters.city&&!lc(g.city).includes(lc(filters.city)))return false;
  if(filters.subcategory&&lc(c.subcategory)!==lc(filters.subcategory))return false;
  if(filters.organisation&&!lc(c.organisation||td.company||td.provider).includes(lc(filters.organisation)))return false;
  if(filters.opportunity_type&&lc(c.opportunity_type)!==lc(filters.opportunity_type))return false;
  if(filters.education_level&&!c.education_level.some(x=>lc(x)===lc(filters.education_level)))return false;
  if(filters.field_of_study&&!c.fields_of_study.some(x=>lc(x).includes(lc(filters.field_of_study))))return false;
  if(filters.job_type&&lc(c.job_type)!==lc(filters.job_type))return false;
  if(filters.work_mode&&lc(c.work_mode)!==lc(filters.work_mode))return false;
  if(filters.salary_min!==undefined&&filters.salary_min!==null&&filters.salary_min!==''&&Number(c.salary?.max??c.salary?.min??0)<Number(filters.salary_min))return false;
  if(filters.salary_max!==undefined&&filters.salary_max!==null&&filters.salary_max!==''&&Number(c.salary?.min??c.salary?.max??0)>Number(filters.salary_max))return false;
  if(filters.currency&&lc(c.salary?.currency)!==lc(filters.currency))return false;
  if(filters.stipend!==undefined&&filters.stipend!==null&&filters.stipend!==''&&Boolean(c.salary?.stipend)!==['1','true','yes'].includes(lc(filters.stipend)))return false;
  if(filters.eligibility&&!c.eligibility_tags.some(x=>lc(x).includes(lc(filters.eligibility))))return false;
  if(filters.tag&&!(post.tags||[]).some(x=>lc(x)===lc(filters.tag)))return false;
  const closing=td.closing_date?new Date(td.closing_date):null;
  if(filters.closing_before&&closing&&closing>new Date(filters.closing_before))return false;
  if(filters.closing_after&&closing&&closing<new Date(filters.closing_after))return false;
  const posted=post.posted_date?new Date(post.posted_date):null;
  if(filters.posted_before&&posted&&posted>new Date(filters.posted_before))return false;
  if(filters.posted_after&&posted&&posted<new Date(filters.posted_after))return false;
  return true;
}

export const GLOBAL_FILTERS=[
  'q','type','country','region','city','category','subcategory','organisation','opportunity_type',
  'education_level','field_of_study','job_type','work_mode','salary_min','salary_max','currency','stipend',
  'eligibility','tag','opportunity_status','closing_before','closing_after','posted_before','posted_after'
];
