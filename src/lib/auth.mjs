import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config.mjs';
import { store } from './store.mjs';
import { hasPermission } from './rbac.mjs';

export async function verifyLogin(username, password) {
  const user = await store.findUserByUsername(username);
  if (!user) return null;
  if (config.demoMode && user.username === config.demoAdminUsername) {
    return password === config.demoAdminPassword ? user : null;
  }
  if (!user.password_hash) return null;
  return (await bcrypt.compare(password, user.password_hash)) ? user : null;
}

export function issueSession(user, res) {
  const token = jwt.sign({ sub:user.id, role:user.role, username:user.username }, config.jwtSecret, { expiresIn:'8h', issuer:'todayinfo-admin' });
  const csrf = crypto.randomBytes(24).toString('hex');
  const secure = config.nodeEnv === 'production';
  res.cookie('ti_admin', token, { httpOnly:true, sameSite:'lax', secure, maxAge:8*60*60*1000, path:'/' });
  res.cookie('ti_csrf', csrf, { httpOnly:false, sameSite:'lax', secure, maxAge:8*60*60*1000, path:'/' });
  return csrf;
}

export function clearSession(res) {
  res.clearCookie('ti_admin',{path:'/'}); res.clearCookie('ti_csrf',{path:'/'});
}

export async function requireAuth(req,res,next) {
  const token=req.cookies?.ti_admin;
  if(!token)return res.status(401).json({error:'Authentication required'});
  try{
    const payload=jwt.verify(token,config.jwtSecret,{issuer:'todayinfo-admin'});
    try{
      const user=await store.getUser(payload.sub);
      if(!user||!user.active)return res.status(401).json({error:'Account unavailable'});
      req.user=user;return next();
    }catch(databaseError){
      // During a database outage, an already-signed and unexpired session may continue.
      // New logins still require the primary admin database.
      if(config.dataStore==='postgres'&&payload.sub&&payload.role&&payload.username){
        req.user={id:payload.sub,role:payload.role,username:payload.username,active:true,offline_session:true};
        return next();
      }
      throw databaseError;
    }
  }catch{return res.status(401).json({error:'Session expired or invalid'});}
}

export function requireCsrf(req,res,next){
  if(['GET','HEAD','OPTIONS'].includes(req.method))return next();
  const cookie=req.cookies?.ti_csrf; const header=req.get('x-csrf-token');
  if(!cookie||!header||cookie!==header)return res.status(403).json({error:'Invalid CSRF token'});
  next();
}

export const permit = permission => (req,res,next) => hasPermission(req.user?.role,permission) ? next() : res.status(403).json({error:`Missing permission: ${permission}`});
