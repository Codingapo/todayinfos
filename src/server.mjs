import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config.mjs';
import { authRouter } from './routes/auth.mjs';
import { adminRouter } from './routes/admin.mjs';
import { publicRouter } from './routes/public.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=express();
app.disable('x-powered-by');
app.set('trust proxy',1);
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'","data:","https:"],connectSrc:["'self'"],fontSrc:["'self'","data:"],objectSrc:["'none'"],baseUri:["'self'"],frameAncestors:["'none'"]}}}));
app.use(express.json({limit:'2mb'}));
app.use(express.urlencoded({extended:false,limit:'2mb'}));
app.use(cookieParser());

app.get('/health',(req,res)=>res.json({status:'ok',service:'todayinfo-control-center',mode:config.dataStore,database_fallback:config.dataStoreFallback,time:new Date().toISOString()}));
app.use('/api/v1',cors({origin:'*',methods:['GET','POST','OPTIONS']}),publicRouter);
app.use('/admin/api/auth',authRouter);
app.use('/admin/api',adminRouter);
app.use('/uploads',express.static(path.resolve(__dirname,'../uploads'),{fallthrough:false,maxAge:'1y',immutable:true}));
app.use('/admin',express.static(path.resolve(__dirname,'../public/admin'),{index:false,maxAge:config.nodeEnv==='production'?'1h':0}));
app.get(/^\/admin(?:\/.*)?$/,(req,res)=>res.sendFile(path.resolve(__dirname,'../public/admin/index.html')));
app.get('/openapi.yaml',(req,res)=>res.sendFile(path.resolve(__dirname,'../public/openapi.yaml')));
app.get('/',(req,res)=>res.json({name:'TodayInfo Managed API',version:'v1',admin:'/admin/',publicApi:'/api/v1',health:'/health',openapi:'/openapi.yaml'}));
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
});
