export const CONTENT_LIMITS=Object.freeze({
  title:220,
  slug:180,
  summary:2000,
  category:160,
  tag:120,
  tags:30,
  seo_title:220,
  seo_description:1000,
  link_title:240,
  document_title:240,
  topic_title:240,
  topic_body:150000,
  type_text:240,
  type_long_text:100000,
  url:2048
});

export const SEO_GUIDANCE=Object.freeze({
  title_recommended:60,
  description_recommended:160
});

export function zodValidationDetails(error){
  const issues=(error?.issues||[]).map(issue=>({
    path:(issue.path||[]).join('.'),
    message:issue.message,
    code:issue.code,
    maximum:issue.maximum??null,
    minimum:issue.minimum??null
  }));
  const fieldErrors={};
  for(const issue of issues){
    const root=issue.path.split('.')[0]||'_form';
    (fieldErrors[root]||=[]).push(issue.message);
  }
  return{issues,fieldErrors};
}
