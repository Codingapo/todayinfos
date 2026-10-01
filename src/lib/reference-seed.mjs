import fs from 'node:fs';
import path from 'node:path';
import { contentQuality } from './content-rules.mjs';
import { hashKey } from './utils.mjs';
import { normalizeClassification, normalizeGeo } from './global-content.mjs';
import { learnFromImports } from './import-learning.mjs';

export const SOUTH_AFRICA_SEED_PATH=path.resolve('data','seeds','south-africa-opportunities-drafts.json');

const toDraft=record=>{
  const td=record.type_data||{};
  const organisation=td.company||td.provider||record.organization||record.organisation||'';
  const draft={
    title:record.title||'Untitled',
    slug:record.slug,
    content_type:record.content_type||'other',
    summary:record.summary||'',
    body_markdown:record.body_markdown||'',
    posted_date:record.posted_date||null,
    category:record.category||'',
    categories:record.categories||[],
    tags:record.tags||[],
    topics:record.topics||[],
    related_links:record.related_links||[],
    related_ids:record.related_ids||[],
    recommendation_ids:record.recommendation_ids||[],
    recommendation_links:record.recommendation_links||[],
    documents:record.documents||[],
    navigation_links:record.navigation_links||[],
    type_data:td,
    geo:normalizeGeo({
      country_code:'ZA',
      country_name:'South Africa',
      location:td.location||'South Africa'
    }),
    classification:normalizeClassification({
      organisation,
      opportunity_type:record.content_type||'other'
    }),
    main_image_url:record.main_image_url||null,
    seo_title:record.seo_title||record.title||'',
    seo_description:record.seo_description||record.summary||'',
    is_trending:Boolean(record.is_trending),
    status:'draft'
  };
  return draft;
};

export function loadSouthAfricaReferenceSeed(){
  const payload=JSON.parse(fs.readFileSync(SOUTH_AFRICA_SEED_PATH,'utf8'));
  const records=Array.isArray(payload.records)?payload.records:[];
  const rows=records.map(record=>{
    const prepared_draft=toDraft(record);
    const quality=contentQuality(prepared_draft);
    const source=record.source||{};
    return {
      source_key:`reference:sa-opportunities:${record.id||record.slug}`,
      source_hash:hashKey(JSON.stringify(record)),
      source_name:'TodayInfo South Africa verified reference seed',
      source_id:record.id||null,
      source_url:source.source_url||null,
      source_slug:record.slug||null,
      source_payload:record,
      detected_type:record.content_type||'other',
      prepared_draft,
      review_status:'unreviewed',
      source_changed:false,
      quality_score:quality.score,
      quality_issues:quality.issues,
      source_record_date:record.posted_date||source.verified_as_of||payload.researched_on||null
    };
  });
  return {
    metadata:{
      dataset_title:payload.dataset_title||'South Africa Opportunities Reference Seed',
      researched_on:payload.researched_on||null,
      publishing_note:payload.publishing_note||null,
      record_count:records.length
    },
    rows
  };
}

export async function bootstrapSouthAfricaReferenceSeed(store){
  const seed=loadSouthAfricaReferenceSeed();
  const learning=await learnFromImports(seed.rows);
  let storage={inserted:0,changed:0,unchanged:0,total:seed.rows.length,deferred:false};
  try{
    storage=await store.upsertImports(seed.rows);
  }catch(error){
    storage={inserted:0,changed:0,unchanged:0,total:seed.rows.length,deferred:true,error:error.message};
  }
  return {
    ...storage,
    seed_records:seed.rows.length,
    dataset_title:seed.metadata.dataset_title,
    researched_on:seed.metadata.researched_on,
    learning_records_seen:learning.records_seen||0
  };
}
