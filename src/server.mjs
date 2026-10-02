import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { config } from './config.mjs';
import { authRouter } from './routes/auth.mjs';
import { adminRouter } from './routes/admin.mjs';
import { publicRouter } from './routes/public.mjs';
import { internalRouter } from './routes/internal.mjs';
import { retryPublicationQueue } from './lib/r2.mjs';
import { store } from './lib/store.mjs';
import { bootstrapReferenceSeeds } from './lib/reference-seed.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
let referenceSeedStatus={state:'pending',records:null,last_attempt_at:null,error:null};
async function ensureReferenceSeed(){
  referenceSeedStatus={...referenceSeedStatus,state:'loading',last_attempt_at:new Date().toISOString(),error:null};
  try{
    const result=await bootstrapReferenceSeeds(store);
    referenceSeedStatus={state:result.deferred?'deferred':'ready',records:Number(result.seed_records||0),last_attempt_at:new Date().toISOString(),error:result.error||null,storage:result};
    if(!result.deferred)console.log(`Reference seed sync ready: ${result.seed_records} seed records; private ingestion can keep growing the catalog.`);
  }catch(error){
    referenceSeedStatus={...referenceSeedStatus,state:'deferred',error:error.message,last_attempt_at:new Date().toISOString()};
    console.warn(`Reference seed deferred: ${error.message}`);
  }
}

const app=express();
const frontendRoot=path.resolve(__dirname,'..',config.frontendDir);
const publicCache=(req,res,next)=>{
  if(req.method!=='GET')return next();
  const sensitive=/^\/(?:personalized|search)(?:\/|$)/.test(req.path);
  if(sensitive){
    res.setHeader('Cache-Control','private, no-cache, max-age=0, must-revalidate');
  }else{
    res.setHeader('Cache-Control',`public, max-age=${config.publicCacheSeconds}, s-maxage=${config.publicEdgeCacheSeconds}, stale-while-revalidate=600`);
  }
  next();
};
const frontendHeaders=(res,filePath)=>{
  const rel=path.relative(frontendRoot,filePath).replaceAll('\\','/');
  if(rel==='index.html'||rel==='data/api-config.js'){
    res.setHeader('Cache-Control','public, max-age=0, must-revalidate');
  }else{
    res.setHeader('Cache-Control','public, max-age=3600, stale-while-revalidate=86400');
  }
};

app.disable('x-powered-by');
app.set('trust proxy',1);
app.use(compression({threshold:1024}));
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'","data:","https:"],connectSrc:["'self'"],fontSrc:["'self'","data:"],objectSrc:["'none'"],baseUri:["'self'"],frameAncestors:["'none'"]}}}));
app.use(express.json({limit:'2mb'}));
app.use(express.urlencoded({extended:false,limit:'2mb'}));
app.use(cookieParser());

app.get('/health',(req,res)=>res.json({status:'ok',service:'todayinfo-control-center',mode:config.dataStore,database_fallback:config.dataStoreFallback,store:store.health?.()||{mode:config.dataStore},reference_seed:referenceSeedStatus,time:new Date().toISOString()}));
app.use('/api/v1',cors({origin:'*',methods:['GET','POST','OPTIONS']}),publicCache,publicRouter);
app.use('/internal/ingest/v1',internalRouter);
app.use('/admin/api/auth',authRouter);
app.use('/admin/api',adminRouter);
app.use('/uploads',express.static(path.resolve(__dirname,'../uploads'),{fallthrough:false,maxAge:'1y',immutable:true}));
app.use('/admin',express.static(path.resolve(__dirname,'../public/admin'),{index:false,maxAge:0,setHeaders(res){res.setHeader('Cache-Control','no-store, no-cache, must-revalidate')}}));
app.get(/^\/admin(?:\/.*)?$/,(req,res)=>res.sendFile(path.resolve(__dirname,'../public/admin/index.html')));
app.get('/openapi.yaml',(req,res)=>res.sendFile(path.resolve(__dirname,'../public/openapi.yaml')));
app.get('/api-info',(req,res)=>res.json({name:'TodayInfo Managed API',version:'v1',admin:'/admin/',publicApi:'/api/v1',health:'/health',openapi:'/openapi.yaml',frontend:config.serveFrontend?'same-origin':'external'}));

if(config.serveFrontend){
  app.use(express.static(frontendRoot,{index:false,etag:true,fallthrough:true,setHeaders:frontendHeaders}));
}else{
  app.get('/',(req,res)=>res.json({name:'TodayInfo Managed API',version:'v1',admin:'/admin/',publicApi:'/api/v1',health:'/health',openapi:'/openapi.yaml'}));
}

app.use('/api/v1',(req,res)=>res.status(404).json({error:'API route not found',path:req.originalUrl}));

if(config.serveFrontend){
  app.use((req,res,next)=>{
    if(req.method!=='GET'||!req.accepts('html'))return next();
    if(/^\/(?:api|admin|internal|uploads|openapi\.yaml|health|api-info)(?:\/|$)/.test(req.path))return next();
    res.setHeader('Cache-Control','public, max-age=0, must-revalidate');
    return res.sendFile(path.join(frontendRoot,'index.html'));
  });
}

app.use((req,res)=>res.status(404).json({error:'Route not found',path:req.originalUrl}));
app.use((err,req,res,next)=>{console.error(err);if(res.headersSent)return next(err);res.status(err.status||500).json({error:config.nodeEnv==='production'?'Unexpected server error':err.message});});

app.listen(config.port,()=>{
  console.log(`TodayInfo Control Center: http://localhost:${config.port}/admin/`);
  console.log(`Public API: http://localhost:${config.port}/api/v1`);
  console.log(`Data store: ${config.dataStore}`);
  if(config.dataStoreFallback){
    const d=config.databaseDiagnostic;
    console.warn(`DATABASE_URL was not usable (${d.reason}${d.host?`, host=${d.host}`:''}); using demo storage for this deployment.`);
    console.warn('Demo storage is for testing and may be ephemeral on hosting platforms. Configure a real DATABASE_URL for persistent production data.');
  }
  if(config.demoMode)console.log(`DEMO MODE login: ${config.demoAdminUsername} / ${config.demoAdminPassword} (development/testing only)`);
  ensureReferenceSeed().catch(()=>{});
});


const publicationRetryTimer=setInterval(()=>{
  retryPublicationQueue({limit:100}).then(result=>{
    if(result.synced)console.log(`Publication retry synced ${result.synced} queued object(s).`);
  }).catch(error=>console.warn(`Publication retry failed: ${error.message}`));
},5*60*1000);
publicationRetryTimer.unref?.();

setTimeout(()=>{
  retryPublicationQueue({limit:100}).catch(()=>{});
},5000).unref?.();


const databaseRetryTimer=setInterval(()=>{
  if(typeof store.retryDatabaseQueue!=='function')return;
  store.retryDatabaseQueue({limit:100}).then(result=>{
    if(result.synced)console.log(`Database retry synced ${result.synced} queued operation(s).`);
  }).catch(error=>console.warn(`Database retry failed: ${error.message}`));
},5*60*1000);
databaseRetryTimer.unref?.();

setTimeout(()=>{
  if(typeof store.retryDatabaseQueue==='function')store.retryDatabaseQueue({limit:100}).catch(()=>{});
},7000).unref?.();


const referenceSeedTimer=setInterval(()=>{
  if(referenceSeedStatus.state!=='ready')ensureReferenceSeed().catch(()=>{});
},10*60*1000);
referenceSeedTimer.unref?.();
