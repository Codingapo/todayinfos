import { config } from '../config.mjs';

export async function sendInvite({email,displayName,inviteUrl,role}) {
  if(!config.resendApiKey) return { sent:false, reason:'RESEND_API_KEY not configured', inviteUrl };
  const res=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${config.resendApiKey}`,'content-type':'application/json'},body:JSON.stringify({from:config.resendFrom,to:[email],subject:'You are invited to TodayInfo Admin',html:`<h2>TodayInfo Admin</h2><p>Hello ${escapeHtml(displayName||'there')},</p><p>You have been invited as <strong>${escapeHtml(role)}</strong>.</p><p><a href="${escapeHtml(inviteUrl)}">Accept invitation</a></p>`})});
  if(!res.ok)throw new Error(`Resend returned ${res.status}`);return {sent:true,response:await res.json()};
}
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
