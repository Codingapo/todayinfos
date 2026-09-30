import { Router } from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { store } from '../lib/store.mjs';
import { requireAuth, requireCsrf, permit } from '../lib/auth.mjs';
import { fetchImports } from '../lib/importer.mjs';
import { saveUpload, mediaKind } from '../lib/r2.mjs';
import { sendInvite } from '../lib/resend.mjs';
import { ROLE_PERMISSIONS } from '../lib/rbac.mjs';
import { config } from '../config.mjs';
import { CONTENT_TYPE_DEFINITIONS, resolvedDefinition } from '../lib/content-types.mjs';
import { isSafeUrl, normalizeTags } from '../lib/content-rules.mjs';

export const adminRouter=Router();
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:25*1024*1024}});
adminRouter.use(requireAuth,requireCsrf);
const ok=(res,data,meta)=>res.json({data,...(meta?{meta}:{})});
const audit=(req,action,type,id,meta={})=>store.audit(req.user.id,action,type,id,meta).catch(()=>{});
const safeUrl=z.string().max(2048).refine(v=>!v||isSafeUrl(v),{message:'Use a valid http(s) or internal / URL'});
const nullableUrl=safeUrl.nullable().optional().or(z.literal(''));
const linkSchema=z.object({title:z.string().min(1).max(160),url:safeUrl,type:z.string().max(40).optional(),icon:z.string().max(40).optional().nullable()});
const documentSchema=z.object({title:z.string().min(1).max(180),url:safeUrl,type:z.string().max(40).optional().default('document'),mime_type:z.string().max(120).optional().nullable(),size_bytes:z.number().nonnegative().optional().nullable()});
const topicSchema=z.object({id:z.string().regex(/^t(?:[1-9]|10)$/).optional(),key:z.string().regex(/^t(?:[1-9]|10)$/).optional(),title:z.string().min(1).max(180),body:z.string().max(100000).optional().default(''),links:z.array(linkSchema).max(30).optional().default([]),images:z.array(z.object({title:z.string().max(160).optional(),url:safeUrl})).max(20).optional().default([]),documents:z.array(documentSchema).max(20).optional().default([])});
const contentTypes=Object.keys(CONTENT_TYPE_DEFINITIONS);

function cleanTypeData(type,input={}){
  const allowed={
    news:['event_date'],announcement:['event_date'],
    bursary:['provider','opening_date','closing_date','status_override','requirements','eligibility','how_to_apply','application_url'],
    job:['company','location','salary','closing_date','status_override','requirements','responsibilities','how_to_apply','application_url'],
    internship:['company','location','salary','closing_date','status_override','requirements','responsibilities','how_to_apply','application_url'],
    learnership:['company','location','salary','closing_date','status_override','requirements','responsibilities','how_to_apply','application_url'],
    other:['subtype'],story:[]
  }[type]||[];
  return Object.fromEntries(Object.entries(input||{}).filter(([k])=>allowed.includes(k)));
}
function publishProblems(post){
  const issues=[];if(!post.title?.trim())issues.push('Title is required.');if(!post.body_markdown?.trim())issues.push('Main content is required before publishing.');if(!post.tags?.length)issues.push('Add at least one tag.');
  if(post.content_type==='bursary'){if(!post.type_data?.provider?.trim())issues.push('Bursary provider is required.');if(!post.type_data?.closing_date)issues.push('Bursary closing date is required.');}
  if(['job','internship','learnership'].includes(post.content_type)&&!post.type_data?.company?.trim())issues.push('Company / organisation is required.');
  return issues;
}
const postSchema=z.object({
  title:z.string().min(2).max(220),slug:z.string().max(140).optional(),content_type:z.enum(contentTypes).default('other'),summary:z.string().max(1000).optional().default(''),body_markdown:z.string().max(250000).optional().default(''),posted_date:z.string().nullable().optional(),category:z.string().max(120).optional().default(''),categories:z.array(z.string().max(100)).max(20).optional().default([]),tags:z.array(z.string().max(60)).max(30).optional().default([]),topics:z.array(topicSchema).max(10).optional().default([]),related_links:z.array(linkSchema).max(40).optional().default([]),related_ids:z.array(z.string()).max(40).optional().default([]),recommendation_ids:z.array(z.string()).max(40).optional().default([]),documents:z.array(documentSchema).max(40).optional().default([]),navigation_links:z.array(linkSchema).max(30).optional().default([]),type_data:z.record(z.string(),z.any()).optional().default({}),main_image_url:nullableUrl,seo_title:z.string().max(220).optional().default(''),seo_description:z.string().max(320).optional().default(''),status:z.enum(['draft','scheduled','published','archived','trash']).optional().default('draft'),is_trending:z.boolean().optional().default(false)
});
function normalizePost(input){
  const topics=(input.topics||[]).map((t,i)=>({...t,id:`t${i+1}`,key:`t${i+1}`}));
  return{...input,tags:normalizeTags(input.tags),topics,type_data:cleanTypeData(input.content_type,input.type_data)};
}

adminRouter.get('/dashboard',permit('dashboard.view'),async(req,res)=>ok(res,await store.dashboard()));
adminRouter.get('/content-types',permit('posts.view'),(req,res)=>ok(res,Object.fromEntries(contentTypes.map(t=>[t,resolvedDefinition(t)]))));
adminRouter.get('/source-presets',permit('imports.view'),(req,res)=>ok(res,[
  {id:'pages',label:'All source pages'},{id:'bursaries',label:'Bursaries'},{id:'articles',label:'Articles / news'},{id:'dailyupdate/jobs',label:'DailyUpdate jobs'},
  {id:'tag:psychometric-test',label:'Psychometric Test tag',kind:'tag',tagSlug:'psychometric-test'}
]));
adminRouter.get('/imports',permit('imports.view'),async(req,res)=>ok(res,await store.listImports({status:req.query.status,type:req.query.type,q:req.query.q})));
adminRouter.post('/imports/fetch',permit('imports.fetch'),async(req,res)=>{const schema=z.object({kind:z.enum(['pages','bursaries','articles','dailyupdate','dailyupdate/jobs','tag','search']).default('pages'),tagSlug:z.string().max(120).optional(),query:z.string().max(200).optional(),year:z.union([z.string(),z.number()]).optional(),expand:z.boolean().optional().default(true),maxPages:z.number().int().min(1).max(20).optional()});const p=schema.safeParse(req.body);if(!p.success)return res.status(400).json({error:'Invalid fetch options',details:p.error.flatten()});const rows=await fetchImports(p.data);const result=await store.upsertImports(rows);await audit(req,'imports.fetch','source',p.data.kind,{...p.data,...result});ok(res,{...result,records:rows.slice(0,20)})});
adminRouter.get('/imports/:id',permit('imports.view'),async(req,res)=>{const row=await store.getImport(req.params.id);if(!row)return res.status(404).json({error:'Import not found'});ok(res,row)});
adminRouter.patch('/imports/:id',permit('imports.review'),async(req,res)=>{const schema=z.object({review_status:z.enum(['unreviewed','reviewing','promoted','ignored']).optional(),detected_type:z.enum(contentTypes).optional(),prepared_draft:postSchema.partial().optional()});const p=schema.safeParse(req.body);if(!p.success)return res.status(400).json({error:'Invalid import update',details:p.error.flatten()});const patch={...p.data};if(patch.prepared_draft)patch.prepared_draft=normalizePost({...patch.prepared_draft,content_type:patch.prepared_draft.content_type||patch.detected_type||'other'});const row=await store.updateImport(req.params.id,patch);if(!row)return res.status(404).json({error:'Import not found'});await audit(req,'import.update','raw_import',row.id,{fields:Object.keys(patch)});ok(res,row)});
adminRouter.post('/imports/:id/promote',permit('imports.review'),async(req,res)=>{const row=await store.promoteImport(req.params.id,req.user.id);if(!row)return res.status(404).json({error:'Import not found'});await audit(req,'import.promote','post',row.id,{source_import:req.params.id});res.status(201).json({data:row})});
adminRouter.delete('/imports/:id',permit('imports.review'),async(req,res)=>{const row=await store.updateImport(req.params.id,{review_status:'ignored'});if(!row)return res.status(404).json({error:'Import not found'});await audit(req,'import.ignore','raw_import',row.id);ok(res,row)});

adminRouter.get('/posts',permit('posts.view'),async(req,res)=>ok(res,await store.listPosts({status:req.query.status,type:req.query.type,q:req.query.q,include_deleted:req.query.include_deleted==='true'})));
adminRouter.post('/posts',permit('posts.create'),async(req,res)=>{const p=postSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:'Invalid content',details:p.error.flatten()});const body=normalizePost(p.data);if(body.status==='published'){const issues=publishProblems(body);if(issues.length)return res.status(400).json({error:'Publishing checklist failed',details:{formErrors:issues}})}const row=await store.createPost(body,req.user.id);await audit(req,'post.create','post',row.id,{title:row.title,type:row.content_type});res.status(201).json({data:row})});
adminRouter.get('/posts/:id',permit('posts.view'),async(req,res)=>{const row=await store.getPost(req.params.id);if(!row)return res.status(404).json({error:'Post not found'});ok(res,row)});
adminRouter.patch('/posts/:id',permit('posts.edit'),async(req,res)=>{const p=postSchema.partial().safeParse(req.body);if(!p.success)return res.status(400).json({error:'Invalid content update',details:p.error.flatten()});const current=await store.getPost(req.params.id);if(!current)return res.status(404).json({error:'Post not found'});const merged=normalizePost({...current,...p.data,content_type:p.data.content_type||current.content_type,type_data:{...(current.type_data||{}),...(p.data.type_data||{})}});if(p.data.status==='published'&&!['owner','super_admin','content_manager','hiring_manager'].includes(req.user.role))return res.status(403).json({error:'Your role cannot publish'});if(p.data.status==='published'){const issues=publishProblems(merged);if(issues.length)return res.status(400).json({error:'Publishing checklist failed',details:{formErrors:issues}})}const patch=Object.fromEntries(Object.keys(p.data).map(k=>[k,merged[k]]));const row=await store.updatePost(req.params.id,patch,req.user.id);await audit(req,p.data.status==='published'?'post.publish':'post.update','post',row.id,{fields:Object.keys(patch)});ok(res,row)});
adminRouter.delete('/posts/:id',permit('posts.delete'),async(req,res)=>{const row=await store.trashPost(req.params.id,req.user.id);if(!row)return res.status(404).json({error:'Post not found'});await audit(req,'post.trash','post',row.id);ok(res,row)});
adminRouter.post('/posts/:id/restore',permit('posts.edit'),async(req,res)=>{const row=await store.restorePost(req.params.id,req.user.id);if(!row)return res.status(404).json({error:'Post not found'});await audit(req,'post.restore','post',row.id);ok(res,row)});
adminRouter.get('/posts/:id/revisions',permit('posts.view'),async(req,res)=>ok(res,await store.revisions(req.params.id)));

adminRouter.get('/analytics',permit('analytics.view'),async(req,res)=>ok(res,await store.analyticsSummary()));
adminRouter.get('/team',permit('team.view'),async(req,res)=>ok(res,await store.listUsers()));
adminRouter.post('/team',permit('team.create'),async(req,res)=>{const schema=z.object({username:z.string().min(3).max(80),email:z.string().email(),display_name:z.string().min(2).max(120),role:z.enum(Object.keys(ROLE_PERMISSIONS)),password:z.string().min(8).max(200)});const p=schema.safeParse(req.body);if(!p.success)return res.status(400).json({error:'Invalid team member',details:p.error.flatten()});const password_hash=await bcrypt.hash(p.data.password,12);const user=await store.createUser({...p.data,password_hash});let email=null;try{email=await sendInvite({email:user.email,displayName:user.display_name,role:user.role,inviteUrl:`${config.appOrigin}/admin/`})}catch(e){email={sent:false,reason:e.message}}await audit(req,'team.create','admin_user',user.id,{role:user.role});res.status(201).json({data:{user:{id:user.id,username:user.username,email:user.email,display_name:user.display_name,role:user.role},email}})});
adminRouter.patch('/team/:id',permit('team.edit'),async(req,res)=>{const allowed=['role','active','display_name'];const patch=Object.fromEntries(Object.entries(req.body||{}).filter(([k])=>allowed.includes(k)));if(patch.role&&!ROLE_PERMISSIONS[patch.role])return res.status(400).json({error:'Invalid role'});const row=await store.updateUser(req.params.id,patch);if(!row)return res.status(404).json({error:'User not found'});await audit(req,'team.update','admin_user',row.id,patch);ok(res,row)});
adminRouter.get('/roles',permit('team.view'),(req,res)=>ok(res,ROLE_PERMISSIONS));

adminRouter.get('/settings',permit('settings.view'),async(req,res)=>ok(res,await store.settings()));
adminRouter.patch('/settings',permit('settings.edit'),async(req,res)=>{const allowed=['site_name','whatsapp_number','contact_email','main_logo_url','dark_logo_url','favicon_url','default_social_image_url'];const patch=Object.fromEntries(Object.entries(req.body||{}).filter(([k])=>allowed.includes(k)));const row=await store.updateSettings(patch);await audit(req,'settings.update','settings','site',{fields:Object.keys(patch)});ok(res,row)});
adminRouter.get('/media',permit('media.view'),async(req,res)=>ok(res,await store.listMedia()));
adminRouter.post('/media/upload',permit('media.upload'),upload.single('file'),async(req,res)=>{try{const saved=await saveUpload(req.file);const row=await store.addMedia({...saved,media_kind:mediaKind(req.file.mimetype),mime_type:req.file.mimetype,size_bytes:req.file.size,title:req.body?.title||req.file.originalname||'',alt_text:req.body?.alt_text||'',uploaded_by:req.user.id});await audit(req,'media.upload','media',row.id,{provider:saved.provider,mime:req.file.mimetype,size:req.file.size});res.status(201).json({data:row})}catch(e){res.status(400).json({error:e.message})}});
adminRouter.get('/audit',permit('audit.view'),async(req,res)=>ok(res,await store.listAudit()));
