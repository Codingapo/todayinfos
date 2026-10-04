import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import compression from 'compression';
import helmet from 'helmet';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const projectRoot=path.resolve(__dirname,'..');
const adminRoot=path.resolve(projectRoot,'public/admin');
const port=Math.max(1,Math.min(65535,Number(process.env.ADMIN_PORT||3020)));
const host=process.env.ADMIN_HOST||'127.0.0.1';
const adminOrigin=(process.env.ADMIN_ORIGIN||'https://admin.todayinfo.co.za').replace(/\/$/,'');
const apiOrigin=(process.env.PUBLIC_API_ORIGIN||'https://api.todayinfo.co.za').replace(/\/$/,'');

const app=express();
app.disable('x-powered-by');
app.set('etag','strong');
app.set('trust proxy',1);
app.use(compression({threshold:512}));
app.use(helmet({
  contentSecurityPolicy:{
    directives:{
      defaultSrc:["'self'"],
      scriptSrc:["'self'"],
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
  res.setHeader('Expires','0');
};

app.get('/__admin_health',(req,res)=>{
  noStore(res);
  res.json({status:'ok',service:'todayinfo-admin',admin:adminOrigin,api:apiOrigin,time:new Date().toISOString()});
});

app.use('/admin',express.static(adminRoot,{
  index:false,
  etag:true,
  fallthrough:true,
  setHeaders(res,filePath){
    if(path.basename(filePath)==='index.html')noStore(res);
    else res.setHeader('Cache-Control','private, max-age=0, must-revalidate');
  }
}));

app.get('/',(req,res)=>{
  noStore(res);
  res.sendFile(path.join(adminRoot,'index.html'));
});

app.get(/^\/admin(?:\/.*)?$/,(req,res)=>{
  noStore(res);
  res.sendFile(path.join(adminRoot,'index.html'));
});

app.use((req,res)=>res.status(404).json({error:'Admin route not found',path:req.originalUrl}));

app.listen(port,host,()=>{
  console.log(`TodayInfo admin: http://${host}:${port}`);
  console.log(`Admin origin: ${adminOrigin}`);
  console.log(`API origin: ${apiOrigin}`);
});
