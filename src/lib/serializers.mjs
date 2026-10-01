import { slugify } from './utils.mjs';
import { calculateOpportunityStatus } from './content-rules.mjs';
import { markdownToBlocks, renderBlocksHtml, extractInlineTags } from './rich-content.mjs';
import { compactLocation, normalizeClassification, rootForType, seoPath } from './global-content.mjs';

const legacyContentPath=post=>{
  const root=rootForType(post.content_type);
  return `/${root}/${post.slug}`;
};
const cleanLink=x=>({title:String(x?.title||'').trim(),url:String(x?.url||'').trim(),type:x?.type||'link',icon:x?.icon||null});
const trackedLink=(x,eventType,post)=>{const link=cleanLink(x);return{...link,tracking:{event_type:eventType,post_id:post.id,target_url:link.url,target_title:link.title,target_type:x?.content_type||x?.type_hint||null}}};
const topicPayload=t=>{const blocks=markdownToBlocks(t.body||'');return{id:t.id||t.key,key:t.key||t.id,title:t.title||'',body:{markdown:t.body||'',blocks,html:renderBlocksHtml(blocks)},links:(t.links||[]).map(cleanLink),images:t.images||[],documents:t.documents||[]}};

export function publicPost(post,{compact=false}={}){
  const blocks=compact?[]:markdownToBlocks(post.body_markdown||'');
  const tags=[...new Set([...(post.tags||[]),...extractInlineTags(post.body_markdown||'')])];
  const location=compactLocation(post.geo||{});
  const classification=normalizeClassification(post.classification||{});
  const path=seoPath(post);
  const common={
    id:post.id,type:post.content_type,slug:post.slug,path,legacy_path:legacyContentPath(post),
    title:post.title,description:post.summary||'',
    main_image:post.main_image_url||null,posted_date:post.posted_date||post.published_at||post.created_at,updated_date:post.updated_at,
    category:post.category||null,categories:post.categories||[],subcategory:classification.subcategory,
    tags:tags.map(name=>({name,slug:slugify(name),url:`/tags/${slugify(name)}`})),
    location,classification,
    organisation:classification.organisation||post.type_data?.company||post.type_data?.provider||null,
    publishing_status:post.status,is_trending:Boolean(post.is_trending),views:Number(post.views||0),reads:Number(post.reads||0),
    seo:{
      title:post.seo_title||post.title,
      description:post.seo_description||post.summary||'',
      canonical_path:path,
      country_code:location.country.code,
      content_type:post.content_type
    },
    source:post.source?{source_name:post.source.source_name||null,source_url:post.source.source_url||null,reviewed:true}:null,
    tracking:{endpoint:'/api/v1/analytics/events',post_id:post.id,view:{event_type:'view',post_id:post.id},read:{event_type:'read',post_id:post.id}}
  };
  if(compact)return common;

  const typeData=post.type_data||{};
  const metadata={};
  if(['bursary','scholarship'].includes(post.content_type))Object.assign(metadata,{
    provider:typeData.provider||classification.organisation||null,
    status:calculateOpportunityStatus(typeData),status_override:typeData.status_override||'auto',
    opening_date:typeData.opening_date||null,closing_date:typeData.closing_date||null,
    requirements:typeData.requirements||'',eligibility:typeData.eligibility||'',
    how_to_apply:typeData.how_to_apply||'',supporting_documents:typeData.supporting_documents||'',application_url:typeData.application_url||null,application_url_verified:Boolean(typeData.application_url_verified),application_route:typeData.application_route||null,application_guide:typeData.application_guide||null
  });
  else if(['job','internship','learnership'].includes(post.content_type))Object.assign(metadata,{
    company:typeData.company||classification.organisation||null,location:typeData.location||location.location||null,
    salary:typeData.salary||null,status:calculateOpportunityStatus(typeData),status_override:typeData.status_override||'auto',
    closing_date:typeData.closing_date||null,requirements:typeData.requirements||'',
    responsibilities:typeData.responsibilities||'',how_to_apply:typeData.how_to_apply||'',supporting_documents:typeData.supporting_documents||'',
    application_url:typeData.application_url||null,application_url_verified:Boolean(typeData.application_url_verified),application_route:typeData.application_route||null,application_guide:typeData.application_guide||null
  });
  else if(post.content_type==='opportunity')Object.assign(metadata,{
    status:calculateOpportunityStatus(typeData),status_override:typeData.status_override||'auto',
    closing_date:typeData.closing_date||null,requirements:typeData.requirements||'',
    how_to_apply:typeData.how_to_apply||'',supporting_documents:typeData.supporting_documents||'',application_url:typeData.application_url||null,application_url_verified:Boolean(typeData.application_url_verified),application_route:typeData.application_route||null,application_guide:typeData.application_guide||null
  });
  else if(['news','announcement'].includes(post.content_type))Object.assign(metadata,{event_date:typeData.event_date||null});
  else Object.assign(metadata,typeData);

  const label={
    bursary:'Bursaries',scholarship:'Scholarships',job:'Jobs',internship:'Internships',
    learnership:'Learnerships',news:'News',announcement:'News',story:'Stories',
    opportunity:'Opportunities',other:'Pages'
  }[post.content_type]||'Pages';

  const breadcrumbs=[{title:'Home',url:'/'}];
  if(location.country.code)breadcrumbs.push({
    title:location.country.name||location.country.code,
    url:`/${location.country.code.toLowerCase()}`
  });
  breadcrumbs.push({
    title:label,
    url:`${location.country.code?'/'+location.country.code.toLowerCase():''}/${slugify(label)}`
  });
  if(post.category)breadcrumbs.push({title:post.category,url:`/categories/${slugify(post.category)}`});
  breadcrumbs.push({title:post.title,url:path});

  return {
    ...common,metadata,
    body:{markdown:post.body_markdown||'',blocks,html:renderBlocksHtml(blocks)},
    topics:(post.topics||[]).map(topicPayload),
    topic_navigation:(post.topics||[]).map((t,i)=>({
      id:t.id||t.key||`t${i+1}`,key:t.key||t.id||`t${i+1}`,
      title:t.title||`Section ${i+1}`,anchor:`#${t.key||t.id||`t${i+1}`}`
    })),
    related_links:(post.related_links||[]).map(x=>trackedLink(x,'related_click',post)),
    recommendation_links:(post.recommendation_links||[]).map(x=>trackedLink(x,'recommendation_click',post)),
    documents:(post.documents||[]).map(d=>({
      title:d.title||'Download file',url:d.url,type:d.type||'document',
      mime_type:d.mime_type||null,size_bytes:d.size_bytes||null
    })),
    navigation:{breadcrumbs,links:(post.navigation_links||[]).map(cleanLink)},
    application_tracking:metadata.application_url?{event_type:'application_click',post_id:post.id,target_url:metadata.application_url}:null,
    related_content:[],recommendations:[]
  };
}
