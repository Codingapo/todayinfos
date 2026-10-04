import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import compression from 'compression';
import helmet from 'helmet';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const projectRoot=path.resolve(__dirname,'..');
const frontendRoot=path.resolve(projectRoot,process.env.FRONTEND_DIR||'frontend');
const port=Math.max(1,Math.min(65535,Number(process.env.FRONTEND_PORT||3011)));
const host=process.env.FRONTEND_HOST||'127.0.0.1';
const siteOrigin=(process.env.PUBLIC_SITE_ORIGIN||'https://todayinfo.co.za').replace(/\/$/,'');
const apiOrigin=(process.env.PUBLIC_API_ORIGIN||'https://api.todayinfo.co.za').replace(/\/$/,'');

const app=express();
app.disable('x-powered-by');
app.set('etag','strong');
app.set('trust proxy',1);
app.use(compression({threshold:768}));
app.use(helmet({
  contentSecurityPolicy:{
    directives:{
      defaultSrc:["'self'"],
      scriptSrc:["'self'","'unsafe-inline'"],
      styleSrc:["'self'","'unsafe-inline'"],
      imgSrc:["'self'","data:","https:"],
      connectSrc:["'self'",apiOrigin],
      fontSrc:["'self'","data:"],
      objectSrc:["'none'"],
      baseUri:["'self'"],
      frameAncestors:["'none'"]
    }
  },
  crossOriginResourcePolicy:{policy:'cross-origin'}
}));

const noStore=(res)=>{
  res.setHeader('Cache-Control','no-store, no-cache, must-revalidate');
  res.setHeader('Pragma','no-cache');
};

app.get('/__frontend_health',(req,res)=>{
  noStore(res);
  res.json({status:'ok',service:'todayinfo-frontend',site:siteOrigin,api:apiOrigin,time:new Date().toISOString()});
});

// Runtime config is generated from .env so the frontend can move without rebuilding files.
app.get('/data/api-config.js',(req,res)=>{
  noStore(res);
  res.type('application/javascript').send(`(() => {
  const local = ['localhost','127.0.0.1'].includes(location.hostname)
    ? 'http://localhost:3009/api/v1'
    : null;
  const apiBases = [local, ${JSON.stringify(apiOrigin+'/api/v1')}].filter(Boolean);
  window.TODAYINFO_CONFIG = {
    siteOrigin: ${JSON.stringify(siteOrigin)},
    apiBases,
    cacheTtlMs: 60000,
    staleTtlMs: 86400000,
    requestTimeoutMs: 20000
  };
  window.TODAYINFO_API_BASES = apiBases;
  window.TODAYINFO_API_BASE = apiBases[0];
})();`);
});

app.use(express.static(frontendRoot,{
  index:false,
  etag:true,
  fallthrough:true,
  setHeaders(res,filePath){
    const rel=path.relative(frontendRoot,filePath).split(path.sep).join('/');
    if(rel==='index.html'||rel==='data/api-config.js'){
      res.setHeader('Cache-Control','public, max-age=0, must-revalidate');
    }else if(/^assets\//.test(rel)){
      res.setHeader('Cache-Control','public, max-age=86400, stale-while-revalidate=604800');
    }else{
      res.setHeader('Cache-Control','public, max-age=3600, stale-while-revalidate=86400');
    }
  }
}));

// SPA fallback: public extension-free URLs always load index.html instead of "Cannot GET".
app.use((req,res,next)=>{
  if(req.method!=='GET'||!req.accepts('html'))return next();
  if(/^\/(?:__frontend_health)(?:\/|$)/.test(req.path))return next();
  res.setHeader('Cache-Control','public, max-age=0, must-revalidate');
  return res.sendFile(path.join(frontendRoot,'index.html'));
});

app.use((req,res)=>res.status(404).json({error:'Frontend route not found',path:req.originalUrl}));

app.listen(port,host,()=>{
  console.log(`TodayInfo frontend: http://${host}:${port}`);
  console.log(`Public site: ${siteOrigin}`);
  console.log(`API origin: ${apiOrigin}`);
});
