import { Router } from 'express';
import { z } from 'zod';
import { store } from '../lib/store.mjs';
import { publicPost } from '../lib/serializers.mjs';
import { paginate } from '../lib/utils.mjs';

export const publicRouter=Router();
const sendList=async(req,res,filters={})=>{const rows=(await store.listPosts({status:'published',...filters})).map(p=>publicPost(p,{compact:true}));res.json(paginate(rows,req.query.page,req.query.limit))};

publicRouter.get('/site',async(req,res)=>{const s=await store.settings();res.json({data:{name:s.site_name||'TodayInfo',managed:true,publicApi:true,logo:s.main_logo_url||null,dark_logo:s.dark_logo_url||null,favicon:s.favicon_url||null,default_social_image:s.default_social_image_url||null,contact:{whatsapp:s.whatsapp_number||null,email:s.contact_email||null}}})});
publicRouter.get('/posts',async(req,res)=>sendList(req,res,{q:req.query.q}));
publicRouter.get('/pages',async(req,res)=>sendList(req,res,{q:req.query.q}));
publicRouter.get('/news',async(req,res)=>{const rows=(await store.listPosts({status:'published',q:req.query.q})).filter(p=>['news','announcement'].includes(p.content_type)).map(p=>publicPost(p,{compact:true}));res.json(paginate(rows,req.query.page,req.query.limit))});
publicRouter.get('/announcements',async(req,res)=>sendList(req,res,{type:'announcement',q:req.query.q}));
publicRouter.get('/stories',async(req,res)=>sendList(req,res,{type:'story',q:req.query.q}));
publicRouter.get('/articles',async(req,res)=>sendList(req,res,{type:'news',q:req.query.q}));
publicRouter.get('/bursaries',async(req,res)=>sendList(req,res,{type:'bursary',q:req.query.q}));
publicRouter.get('/jobs',async(req,res)=>sendList(req,res,{type:'job',q:req.query.q}));
publicRouter.get('/internships',async(req,res)=>sendList(req,res,{type:'internship',q:req.query.q}));
publicRouter.get('/learnerships',async(req,res)=>sendList(req,res,{type:'learnership',q:req.query.q}));
publicRouter.get('/trending',async(req,res)=>sendList(req,res,{trending:true,q:req.query.q}));
publicRouter.get('/dailyupdate/jobs',async(req,res)=>sendList(req,res,{type:'job',q:req.query.q}));

async function detailPayload(row){
  const base=publicPost(row);const related=[];const recs=[];
  for(const id of row.related_ids||[]){const p=await store.getPost(id);if(p&&p.status==='published'&&!p.deleted_at)related.push(publicPost(p,{compact:true}))}
  for(const id of row.recommendation_ids||[]){const p=await store.getPost(id);if(p&&p.status==='published'&&!p.deleted_at)recs.push(publicPost(p,{compact:true}))}
  return{...base,related_content:related,recommendations:recs};
}
const expected={news:['news','announcement'],announcements:['announcement'],articles:['news','announcement'],bursaries:['bursary'],jobs:['job'],internships:['internship'],learnerships:['learnership'],stories:['story']};
for(const prefix of ['posts','pages','news','announcements','articles','bursaries','jobs','internships','learnerships','stories'])publicRouter.get(`/${prefix}/:slug`,async(req,res)=>{const row=await store.getPostBySlug(req.params.slug);if(!row)return res.status(404).json({error:'Not found'});if(expected[prefix]&&!expected[prefix].includes(row.content_type))return res.status(404).json({error:'Not found'});res.json({data:await detailPayload(row)})});

publicRouter.get('/search',async(req,res)=>{const q=String(req.query.q||'').trim();if(!q)return res.json({data:[],meta:{query:q,total:0}});const rows=(await store.listPosts({status:'published',q})).map(p=>publicPost(p,{compact:true}));res.json({data:rows.slice(0,100),meta:{query:q,total:rows.length}})});
publicRouter.get('/tags',async(req,res)=>res.json({data:await store.tags()}));
publicRouter.get('/tags/:slug',async(req,res)=>{const tags=await store.tags();const tag=tags.find(t=>t.slug===req.params.slug);const records=(await store.listPosts({status:'published',tag:req.params.slug})).map(p=>publicPost(p,{compact:true}));res.json({data:{name:tag?.name||req.params.slug.replaceAll('-',' '),slug:req.params.slug,count:records.length,records}})});
publicRouter.get('/categories',async(req,res)=>res.json({data:await store.categories()}));
publicRouter.get('/categories/:slug',async(req,res)=>{const categories=await store.categories();const category=categories.find(t=>t.slug===req.params.slug);const records=(await store.listPosts({status:'published',category:req.params.slug})).map(p=>publicPost(p,{compact:true}));res.json({data:{title:category?.title||req.params.slug.replaceAll('-',' '),slug:req.params.slug,count:records.length,records}})});

publicRouter.post('/analytics/events',async(req,res)=>{const schema=z.object({visitor_id:z.string().max(120).optional(),event_type:z.enum(['view','read','search','application_click','download','related_click','recommendation_click','tag_click']),post_id:z.string().optional(),meta:z.record(z.string(),z.any()).optional()});const p=schema.safeParse(req.body);if(!p.success)return res.status(400).json({error:'Invalid analytics event'});await store.recordEvent(p.data);res.status(202).json({data:{accepted:true}})});
publicRouter.get('/crawl/status',(req,res)=>res.json({data:{state:'managed',publicCountsHidden:true,message:'Raw crawler/index statistics are private to TodayInfo administrators.'}}));
publicRouter.get('/redirect/:slug',async(req,res)=>{const r=await store.findRedirect(req.params.slug);if(!r)return res.status(404).json({error:'Not found'});res.json({data:{from:r.from_slug,to:r.to_slug}})});
