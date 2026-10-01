import crypto from 'node:crypto';
import { publicPost } from './serializers.mjs';
import { normalizeCountryCode, rootForType } from './global-content.mjs';
import { publishedObjectKey, readPublishedJson, removePublishedJson, savePublishedJson } from './r2.mjs';
import { removePublishedIndex, upsertPublishedIndex } from './published-index.mjs';

export const PUBLICATION_SCHEMA='todayinfo.content.v1';
export const APPLICATION_GUIDE_SCHEMA='todayinfo.application-guide.v1';

async function relatedPayload(store,row){
  const related=[];const recommendations=[];
  for(const id of row.related_ids||[]){
    const p=await store.getPost(id);
    if(p&&p.status==='published'&&!p.deleted_at)related.push(publicPost(p,{compact:true}));
  }
  for(const id of row.recommendation_ids||[]){
    const p=await store.getPost(id);
    if(p&&p.status==='published'&&!p.deleted_at)recommendations.push(publicPost(p,{compact:true}));
  }
  return {related,recommendations};
}

export async function buildPublishedContent(store,row){
  const base=publicPost(row);
  const {related,recommendations}=await relatedPayload(store,row);
  return {...base,related_content:related,recommendations};
}

export function applicationGuideKey(row){
  const country=normalizeCountryCode(row.geo?.country_code||'')?.toLowerCase()||'global';
  return publishedObjectKey({countryCode:country,collection:'guides',slug:`${row.slug}-how-to-apply`});
}

export function buildApplicationGuideContent(row){
  const guide=row.type_data?.application_guide;
  if(!guide?.useful||!Array.isArray(guide.steps)||guide.steps.length<4)return null;
  const country=normalizeCountryCode(row.geo?.country_code||'')?.toLowerCase()||'global';
  return{
    id:`guide:${row.id}`,
    type:'application_guide',
    slug:`${row.slug}-how-to-apply`,
    path:`/${country}/guides/${row.slug}-how-to-apply`,
    title:guide.title||`How to apply for ${row.title}`,
    description:guide.summary||'Plain-English application guidance based on the official opportunity instructions.',
    parent:{id:row.id,title:row.title,slug:row.slug,path:publicPost(row,{compact:true}).path,type:row.content_type},
    steps:guide.steps||[],
    supporting_documents:guide.supporting_documents||[],
    requirements:guide.requirements||'',
    official_application_url:guide.official_application_url||row.type_data?.application_url||null,
    verification:guide.verification||row.type_data?.application_route||null,
    source:row.source?{source_name:row.source.source_name||null,source_url:row.source.source_url||null,reviewed:true}:null,
    updated_date:row.updated_at||null
  };
}

export function publicationKey(row){
  const country=normalizeCountryCode(row.geo?.country_code||'')?.toLowerCase()||'global';
  return publishedObjectKey({countryCode:country,collection:rootForType(row.content_type),slug:row.slug});
}

export async function publishPostArtifact(store,row){
  const content=await buildPublishedContent(store,row);
  const payload={
    schema:PUBLICATION_SCHEMA,
    generated_at:new Date().toISOString(),
    content
  };
  const serialized=JSON.stringify(payload);
  const sha256=crypto.createHash('sha256').update(serialized).digest('hex');
  const key=publicationKey(row);
  const stored=await savePublishedJson({key,payload});
  const publication={
    schema:PUBLICATION_SCHEMA,key,sha256,
    provider:stored.provider,url:stored.url||null,local_path:stored.local_path||null,
    sync_status:stored.sync_status,last_synced_at:stored.last_synced_at||null,last_error:stored.last_error||null
  };
  const guideContent=buildApplicationGuideContent(row);
  if(guideContent){
    const guideKey=applicationGuideKey(row);
    const guidePayload={schema:APPLICATION_GUIDE_SCHEMA,generated_at:new Date().toISOString(),content:guideContent};
    const guideStored=await savePublishedJson({key:guideKey,payload:guidePayload});
    publication.application_guide={
      key:guideKey,slug:guideContent.slug,path:guideContent.path,
      provider:guideStored.provider,url:guideStored.url||null,local_path:guideStored.local_path||null,
      sync_status:guideStored.sync_status,last_synced_at:guideStored.last_synced_at||null,last_error:guideStored.last_error||null
    };
  }else if(row.publication?.application_guide?.key){
    try{await removePublishedJson(row.publication.application_guide.key)}catch{}
  }
  try{
    const indexResult=await upsertPublishedIndex({...row,publication});
    publication.index_sync_status=indexResult.sync_status||'synced';
  }catch(error){
    publication.index_sync_status='pending';
    publication.index_error=error.message;
  }
  return publication;
}

export async function loadPostArtifact(row){
  const key=row.publication?.key||publicationKey(row);
  const found=await readPublishedJson(key);
  if(!found?.payload?.content)return null;
  return {...found.payload.content,_artifact:{provider:found.provider,key,schema:found.payload.schema||null,generated_at:found.payload.generated_at||null}};
}

export async function loadApplicationGuideArtifact(row){
  const key=row.publication?.application_guide?.key||applicationGuideKey(row);
  const found=await readPublishedJson(key);
  if(!found?.payload?.content)return null;
  return {...found.payload.content,_artifact:{provider:found.provider,key,schema:found.payload.schema||null,generated_at:found.payload.generated_at||null}};
}

export async function unpublishPostArtifact(row){
  const key=row.publication?.key||publicationKey(row);
  const result=await removePublishedJson(key);
  const guideKey=row.publication?.application_guide?.key;
  if(guideKey)try{await removePublishedJson(guideKey)}catch{}
  try{await removePublishedIndex(row)}catch{}
  return result;
}
