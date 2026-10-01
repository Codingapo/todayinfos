import crypto from 'node:crypto';
import { publicPost } from './serializers.mjs';
import { normalizeCountryCode, rootForType } from './global-content.mjs';
import { publishedObjectKey, readPublishedJson, removePublishedJson, savePublishedJson } from './r2.mjs';

export const PUBLICATION_SCHEMA='todayinfo.content.v1';

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
  return {
    schema:PUBLICATION_SCHEMA,key,sha256,
    provider:stored.provider,url:stored.url||null,local_path:stored.local_path||null,
    sync_status:stored.sync_status,last_synced_at:stored.last_synced_at||null,last_error:stored.last_error||null
  };
}

export async function loadPostArtifact(row){
  const key=row.publication?.key||publicationKey(row);
  const found=await readPublishedJson(key);
  if(!found?.payload?.content)return null;
  return {...found.payload.content,_artifact:{provider:found.provider,key,schema:found.payload.schema||null,generated_at:found.payload.generated_at||null}};
}

export async function unpublishPostArtifact(row){
  const key=row.publication?.key||publicationKey(row);
  return removePublishedJson(key);
}
