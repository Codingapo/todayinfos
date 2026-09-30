import { isSafeUrl } from './content-rules.mjs';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function extractInlineTags(text='') {
  const found=[];const re=/(^|\s)#([A-Za-z0-9][A-Za-z0-9_-]{0,49})\b/g;let m;
  while((m=re.exec(String(text)))&&found.length<10){const tag=m[2];if(!found.some(x=>x.toLowerCase()===tag.toLowerCase()))found.push(tag)}
  return found;
}

function inlineResult(text='') {
  let source=String(text);const tokens=[];const links=[];
  source=source.replace(/\[([^\]\n]{1,160})\]\(([^)\s]{1,2048})\)/g,(all,label,url)=>{
    if(!isSafeUrl(url))return esc(label);
    const token=`@@LINK${tokens.length}@@`;const safeLabel=String(label).trim();const safeUrl=String(url).trim();
    links.push({title:safeLabel,url:safeUrl,internal:/^\/(?!\/)/.test(safeUrl)});
    tokens.push(`<a href="${esc(safeUrl)}"${/^https?:/i.test(safeUrl)?' target="_blank" rel="noopener noreferrer"':''}>${esc(safeLabel)}</a>`);return token;
  });
  source=esc(source).replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/@@LINK(\d+)@@/g,(_,i)=>tokens[Number(i)]||'');
  const tags=extractInlineTags(text);
  source=source.replace(/(^|\s)#([A-Za-z0-9][A-Za-z0-9_-]{0,49})\b/g,(all,pre,tag)=>`${pre}<a class="topic-tag" href="/tags/${encodeURIComponent(tag.toLowerCase())}">#${esc(tag)}</a>`);
  return {html:source,links,tags};
}

export function markdownToBlocks(text='') {
  const lines=String(text||'').replace(/\r/g,'').split('\n');const blocks=[];let paragraph=[];let list=[];let listType='ul';
  const flushP=()=>{if(paragraph.length){const text=paragraph.join(' '),r=inlineResult(text);blocks.push({type:'paragraph',text,html:r.html,links:r.links,tags:r.tags});paragraph=[]}};
  const flushL=()=>{if(list.length){blocks.push({type:'list',ordered:listType==='ol',items:list.map(text=>{const r=inlineResult(text);return{text,html:r.html,links:r.links,tags:r.tags}})});list=[]}};
  for(const raw of lines){const line=raw.trim();const h=line.match(/^(#{1,4})\s+(.+)$/);if(h){flushP();flushL();const r=inlineResult(h[2]);blocks.push({type:'heading',level:h[1].length,text:h[2],html:r.html,links:r.links,tags:r.tags});continue}const ul=line.match(/^[-*]\s+(.+)$/);if(ul){flushP();if(list.length&&listType!=='ul')flushL();listType='ul';list.push(ul[1]);continue}const ol=line.match(/^\d+[.)]\s+(.+)$/);if(ol){flushP();if(list.length&&listType!=='ol')flushL();listType='ol';list.push(ol[1]);continue}if(!line){flushP();flushL();continue}flushL();paragraph.push(line)}
  flushP();flushL();return blocks;
}

export function renderBlocksHtml(blocks=[]) {
  return blocks.map(b=>{if(b.type==='paragraph')return`<p>${b.html}</p>`;if(b.type==='heading'){const level=Math.min(4,Math.max(1,b.level||2));return`<h${level}>${b.html}</h${level}>`}if(b.type==='list'){const t=b.ordered?'ol':'ul';return`<${t}>${b.items.map(i=>`<li>${i.html}</li>`).join('')}</${t}>`}return''}).join('\n');
}
