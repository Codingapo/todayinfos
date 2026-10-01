import { slugify } from './utils.mjs';
import { calculateOpportunityStatus } from './content-rules.mjs';
import { markdownToBlocks, renderBlocksHtml, extractInlineTags } from './rich-content.mjs';

const contentPath=post=>{
  const roots={bursary:'bursaries',job:'jobs',internship:'internships',learnership:'learnerships',news:'news',announcement:'news',story:'stories',other:'pages'};
  return `/${roots[post.content_type]||'pages'}/${post.slug}`;
};
const cleanLink=x=>({title:String(x?.title||'').trim(),url:String(x?.url||'').trim(),type:x?.type||'link',icon:x?.icon||null});
const topicPayload=t=>{const blocks=markdownToBlocks(t.body||'');return{id:t.id||t.key,key:t.key||t.id,title:t.title||'',body:{markdown:t.body||'',blocks,html:renderBlocksHtml(blocks)},links:(t.links||[]).map(cleanLink),images:t.images||[],documents:t.documents||[]}};

export function publicPost(post,{compact=false}={}){
  const blocks=compact?[]:markdownToBlocks(post.body_markdown||'');
  const tags=[...new Set([...(post.tags||[]),...extractInlineTags(post.body_markdown||'')])];
  const common={
    id:post.id,type:post.content_type,slug:post.slug,path:contentPath(post),title:post.title,description:post.summary||'',
    main_image:post.main_image_url||null,posted_date:post.posted_date||post.published_at||post.created_at,updated_date:post.updated_at,
    category:post.category||null,categories:post.categories||[],tags:tags.map(name=>({name,slug:slugify(name),url:`/tags/${slugify(name)}`})),
    publishing_status:post.status,is_trending:Boolean(post.is_trending),views:Number(post.views||0),reads:Number(post.reads||0),
    seo:{title:post.seo_title||post.title,description:post.seo_description||post.summary||''},
    source:post.source?{source_name:post.source.source_name||null,source_url:post.source.source_url||null,reviewed:true}:null
  };
  if(compact)return common;
  const typeData=post.type_data||{};
  const metadata={};
  if(post.content_type==='bursary')Object.assign(metadata,{provider:typeData.provider||null,status:calculateOpportunityStatus(typeData),status_override:typeData.status_override||'auto',opening_date:typeData.opening_date||null,closing_date:typeData.closing_date||null,requirements:typeData.requirements||'',eligibility:typeData.eligibility||'',how_to_apply:typeData.how_to_apply||'',application_url:typeData.application_url||null});
  else if(['job','internship','learnership'].includes(post.content_type))Object.assign(metadata,{company:typeData.company||null,location:typeData.location||null,salary:typeData.salary||null,status:calculateOpportunityStatus(typeData),status_override:typeData.status_override||'auto',closing_date:typeData.closing_date||null,requirements:typeData.requirements||'',responsibilities:typeData.responsibilities||'',how_to_apply:typeData.how_to_apply||'',application_url:typeData.application_url||null});
  else if(['news','announcement'].includes(post.content_type))Object.assign(metadata,{event_date:typeData.event_date||null});
  else Object.assign(metadata,typeData);
  const label={bursary:'Bursaries',job:'Jobs',internship:'Internships',learnership:'Learnerships',news:'News',announcement:'News',story:'Stories',other:'Pages'}[post.content_type]||'Pages';
  const breadcrumbs=[{title:'Home',url:'/'},{title:label,url:`/${slugify(label)}`}];
  if(post.category)breadcrumbs.push({title:post.category,url:`/categories/${slugify(post.category)}`});
  breadcrumbs.push({title:post.title,url:contentPath(post)});
  return {...common,metadata,body:{markdown:post.body_markdown||'',blocks,html:renderBlocksHtml(blocks)},topics:(post.topics||[]).map(topicPayload),topic_navigation:(post.topics||[]).map((t,i)=>({id:t.id||t.key||`t${i+1}`,key:t.key||t.id||`t${i+1}`,title:t.title||`Section ${i+1}`,anchor:`#${t.key||t.id||`t${i+1}`}`})),related_links:(post.related_links||[]).map(cleanLink),recommendation_links:(post.recommendation_links||[]).map(cleanLink),documents:(post.documents||[]).map(d=>({title:d.title||'Download file',url:d.url,type:d.type||'document',mime_type:d.mime_type||null,size_bytes:d.size_bytes||null})),navigation:{breadcrumbs,links:(post.navigation_links||[]).map(cleanLink)},related_content:[],recommendations:[]};
}
