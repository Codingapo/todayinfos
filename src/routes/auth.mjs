import { Router } from 'express';
import { z } from 'zod';
import { verifyLogin, issueSession, clearSession, requireAuth, requireCsrf } from '../lib/auth.mjs';
import { ROLE_PERMISSIONS, ROLE_LABELS } from '../lib/rbac.mjs';

export const authRouter=Router();
const attempts=new Map();
const loginLimiter=(req,res,next)=>{const key=req.ip||'unknown';const now=Date.now();const row=attempts.get(key)||{count:0,until:0};if(row.until>now)return res.status(429).json({error:'Too many login attempts. Try again in a few minutes.'});if(row.until&&row.until<=now)attempts.delete(key);req.loginKey=key;next();};
const loginSchema=z.object({username:z.string().min(1).max(100),password:z.string().min(1).max(200)});
authRouter.post('/login',loginLimiter,async(req,res)=>{const parsed=loginSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Username and password are required'});const user=await verifyLogin(parsed.data.username,parsed.data.password);if(!user){const key=req.loginKey;const row=attempts.get(key)||{count:0,until:0};row.count+=1;if(row.count>=5){row.count=0;row.until=Date.now()+5*60*1000;}attempts.set(key,row);return res.status(401).json({error:'Invalid username or password'});}attempts.delete(req.loginKey);const csrf=issueSession(user,res);res.json({data:{user:{id:user.id,username:user.username,display_name:user.display_name,role:user.role,role_label:ROLE_LABELS[user.role]||user.role},csrf,permissions:ROLE_PERMISSIONS[user.role]||[]}});});
authRouter.get('/me',requireAuth,(req,res)=>res.json({data:{user:{id:req.user.id,username:req.user.username,display_name:req.user.display_name,role:req.user.role,role_label:ROLE_LABELS[req.user.role]||req.user.role,email:req.user.email},csrf:req.cookies?.ti_csrf||'',permissions:ROLE_PERMISSIONS[req.user.role]||[]}}));
authRouter.post('/logout',requireAuth,requireCsrf,(req,res)=>{clearSession(res);res.json({data:{ok:true}})});
