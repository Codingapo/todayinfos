import fs from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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
