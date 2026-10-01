import { calculateOpportunityStatus, isSafeUrl } from './content-rules.mjs';

const OPPORTUNITY_TYPES=new Set(['bursary','scholarship','job','internship','learnership','opportunity']);

export function autoPublishIssues({importRow,draft,threshold=80,now=new Date()}){
  const issues=[];
  const score=Number(importRow?.quality_score||0);
  if(score<threshold)issues.push(`Quality score ${score}% is below ${threshold}%`);
  if(!isSafeUrl(importRow?.source_url||'',{allowRelative:false}))issues.push('A valid source URL is required');
  if(!draft?.title?.trim())issues.push('Title is required');
  if(!draft?.body_markdown?.trim())issues.push('Main content is required');
  if(!(draft?.tags||[]).length)issues.push('At least one tag is required');

  const type=String(draft?.content_type||'other');
  const td=draft?.type_data||{};
  if(['bursary','scholarship'].includes(type)){
    if(!td.provider?.trim())issues.push('Funding provider is required');
    if(!td.closing_date)issues.push('Funding closing date is required');
  }
  if(['job','internship','learnership'].includes(type)&&!td.company?.trim())issues.push('Company / organisation is required');

  if(OPPORTUNITY_TYPES.has(type)){
    const close=td.closing_date?new Date(`${td.closing_date}T23:59:59`):null;
    if(close&&!Number.isNaN(close.getTime())&&now>close)issues.push('Opportunity closing date has already passed');
    if(calculateOpportunityStatus(td,now)==='closed')issues.push('Opportunity is closed');
    const hasUrl=isSafeUrl(td.application_url||'',{allowRelative:false});
    const hasInstructions=String(td.how_to_apply||'').trim().length>=30;
    if(!hasUrl&&!hasInstructions)issues.push('A usable application route or detailed application instructions are required');
  }

  return [...new Set(issues)];
}

export function autoPublishDecision(input){
  const issues=autoPublishIssues(input);
  return {eligible:issues.length===0,issues};
}
