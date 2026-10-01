import fs from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config.mjs';
import { id } from './utils.mjs';

const MIME_EXT = {
  'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif',
  'application/pdf':'pdf','application/zip':'zip','application/x-zip-compressed':'zip',
  'application/msword':'doc','application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx',
  'application/vnd.ms-excel':'xls','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx'
};
const IMAGE_MIMES=new Set(['image/jpeg','image/png','image/webp','image/gif']);
const DOC_MIMES=new Set(Object.keys(MIME_EXT).filter(x=>!IMAGE_MIMES.has(x)));

function signature(buffer) {
  if (!buffer || buffer.length < 8) return 'unknown';
  if (buffer[0]===0xff && buffer[1]===0xd8 && buffer[2]===0xff) return 'jpeg';
  if (buffer.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'png';
  if (buffer.subarray(0,4).toString()==='GIF8') return 'gif';
  if (buffer.subarray(0,4).toString()==='RIFF' && buffer.subarray(8,12).toString()==='WEBP') return 'webp';
  if (buffer.subarray(0,5).toString()==='%PDF-') return 'pdf';
  if (buffer[0]===0x50 && buffer[1]===0x4b && [0x03,0x05,0x07].includes(buffer[2])) return 'zip';
  if (buffer.subarray(0,8).equals(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]))) return 'ole';
  return 'unknown';
}
function validate(file){
  if(!file)throw new Error('File required');
  if(!MIME_EXT[file.mimetype])throw new Error('Unsupported file type. Use JPG, PNG, WebP, GIF, PDF, DOC/DOCX, XLS/XLSX or ZIP.');
  const sig=signature(file.buffer);
  const expected={
    'image/jpeg':'jpeg','image/png':'png','image/webp':'webp','image/gif':'gif','application/pdf':'pdf',
    'application/zip':'zip','application/x-zip-compressed':'zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'zip',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'zip',
    'application/msword':'ole','application/vnd.ms-excel':'ole'
  }[file.mimetype];
  if(sig!==expected)throw new Error('File contents do not match the declared file type.');
  const max=IMAGE_MIMES.has(file.mimetype)?10*1024*1024:25*1024*1024;
  if(file.size>max)throw new Error(`File too large. Maximum ${Math.round(max/1024/1024)} MB.`);
}
async function uploadSupabase(file,key){
  const base=config.supabase.url;const bucket=encodeURIComponent(config.supabase.bucket);const objectPath=key.split('/').map(encodeURIComponent).join('/');
  const res=await fetch(`${base}/storage/v1/object/${bucket}/${objectPath}`,{method:'POST',headers:{apikey:config.supabase.key,authorization:`Bearer ${config.supabase.key}`,'content-type':file.mimetype,'x-upsert':'false'},body:file.buffer});
  if(!res.ok){const detail=await res.text().catch(()=>'');throw new Error(`Supabase upload failed (${res.status})${detail?`: ${detail.slice(0,180)}`:''}`);}
  return {provider:'supabase',key,url:`${base}/storage/v1/object/public/${bucket}/${objectPath}`};
}
async function uploadR2(file,key){
  const client=new S3Client({region:'auto',endpoint:`https://${config.r2.accountId}.r2.cloudflarestorage.com`,credentials:{accessKeyId:config.r2.accessKeyId,secretAccessKey:config.r2.secretAccessKey}});
  await client.send(new PutObjectCommand({Bucket:config.r2.bucket,Key:key,Body:file.buffer,ContentType:file.mimetype,CacheControl:'public, max-age=31536000, immutable'}));
  if(!config.r2.publicBaseUrl)throw new Error('R2_PUBLIC_BASE_URL is required to return public media URLs.');
  return {provider:'r2',key,url:`${config.r2.publicBaseUrl}/${key}`};
}
async function uploadLocal(file,key){
  const name=key.replaceAll('/','_');const target=path.resolve('uploads',name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,file.buffer);return{provider:'local',key:name,url:`/uploads/${name}`};
}
export async function saveUpload(file){
  validate(file);
  const ext=MIME_EXT[file.mimetype];const group=IMAGE_MIMES.has(file.mimetype)?'images':'documents';
  const key=`${group}/${new Date().toISOString().slice(0,10)}/${id()}.${ext}`;
  // Testing/demo mode does NOT disable cloud uploads. Supabase credentials take priority whenever configured.
  if(config.supabase.url&&config.supabase.key)return uploadSupabase(file,key);
  if(config.r2.accountId&&config.r2.accessKeyId&&config.r2.secretAccessKey)return uploadR2(file,key);
  return uploadLocal(file,key);
}

export function mediaKind(mime=''){
  if(IMAGE_MIMES.has(mime))return'image';
  if(DOC_MIMES.has(mime))return'document';
  return'file';
}


const publishedRoot=path.resolve('data','published');
const queueRoot=path.resolve('data','publication-queue');
const r2Configured=()=>Boolean(config.r2.accountId&&config.r2.accessKeyId&&config.r2.secretAccessKey);
const r2Client=()=>new S3Client({
  region:'auto',
  endpoint:`https://${config.r2.accountId}.r2.cloudflarestorage.com`,
  credentials:{accessKeyId:config.r2.accessKeyId,secretAccessKey:config.r2.secretAccessKey}
});

export function publishedObjectKey({countryCode='global',collection='pages',slug}) {
  const country=String(countryCode||'global').toLowerCase().replace(/[^a-z0-9-]/g,'')||'global';
  const group=String(collection||'pages').toLowerCase().replace(/[^a-z0-9-]/g,'')||'pages';
  const safeSlug=String(slug||'untitled').toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-');
  return `published/${country}/${group}/${safeSlug}.json`;
}

const localObjectPath=key=>path.resolve(publishedRoot,key.replace(/^published\//,''));
const queueFile=idValue=>path.resolve(queueRoot,`${idValue}.json`);

async function writeLocalPublished(key,payload){
  const target=localObjectPath(key);
  await fs.mkdir(path.dirname(target),{recursive:true});
  await fs.writeFile(target,JSON.stringify(payload,null,2));
  return target;
}

async function queuePublication(operation){
  await fs.mkdir(queueRoot,{recursive:true});
  const name=`${Date.now()}-${id()}`;
  await fs.writeFile(queueFile(name),JSON.stringify(operation));
  return name;
}

async function putR2Json(key,payload){
  if(!r2Configured())throw new Error('R2 is not configured');
  await r2Client().send(new PutObjectCommand({
    Bucket:config.r2.bucket,Key:key,Body:Buffer.from(JSON.stringify(payload)),
    ContentType:'application/json; charset=utf-8',CacheControl:'public, max-age=60, stale-while-revalidate=300'
  }));
  return config.r2.publicBaseUrl?`${config.r2.publicBaseUrl}/${key}`:null;
}

export async function savePublishedJson({key,payload}){
  const local_path=await writeLocalPublished(key,payload);
  if(!r2Configured()){
    await queuePublication({action:'put',key,payload,created_at:new Date().toISOString()});
    return {provider:'local',key,url:null,local_path,sync_status:'pending_r2'};
  }
  try{
    const url=await putR2Json(key,payload);
    return {provider:'r2',key,url,local_path,sync_status:'synced',last_synced_at:new Date().toISOString()};
  }catch(error){
    await queuePublication({action:'put',key,payload,created_at:new Date().toISOString(),last_error:error.message});
    return {provider:'local',key,url:null,local_path,sync_status:'pending_r2',last_error:error.message};
  }
}

export async function readPublishedJson(key){
  if(r2Configured()){
    try{
      const result=await r2Client().send(new GetObjectCommand({Bucket:config.r2.bucket,Key:key}));
      const body=await result.Body.transformToString();
      return {payload:JSON.parse(body),provider:'r2'};
    }catch{}
  }
  try{
    const raw=await fs.readFile(localObjectPath(key),'utf8');
    return {payload:JSON.parse(raw),provider:'local'};
  }catch{return null}
}

export async function removePublishedJson(key){
  try{await fs.rm(localObjectPath(key),{force:true})}catch{}
  if(!r2Configured()){
    await queuePublication({action:'delete',key,created_at:new Date().toISOString()});
    return {sync_status:'pending_r2'};
  }
  try{
    await r2Client().send(new DeleteObjectCommand({Bucket:config.r2.bucket,Key:key}));
    return {sync_status:'deleted',last_synced_at:new Date().toISOString()};
  }catch(error){
    await queuePublication({action:'delete',key,created_at:new Date().toISOString(),last_error:error.message});
    return {sync_status:'pending_r2',last_error:error.message};
  }
}

export async function retryPublicationQueue({limit=100}={}){
  if(!r2Configured())return {processed:0,synced:0,failed:0,reason:'r2_not_configured'};
  await fs.mkdir(queueRoot,{recursive:true});
  const names=(await fs.readdir(queueRoot)).filter(x=>x.endsWith('.json')).sort().slice(0,limit);
  let synced=0,failed=0;
  for(const name of names){
    const full=path.resolve(queueRoot,name);
    try{
      const op=JSON.parse(await fs.readFile(full,'utf8'));
      if(op.action==='put')await putR2Json(op.key,op.payload);
      else if(op.action==='delete')await r2Client().send(new DeleteObjectCommand({Bucket:config.r2.bucket,Key:op.key}));
      await fs.rm(full,{force:true});synced+=1;
    }catch{failed+=1}
  }
  return {processed:names.length,synced,failed};
}
