import { config } from '../config.mjs';
import { hashKey } from './utils.mjs';
import { detectContentType, ruleDraftFromRecord } from './content-rules.mjs';

const endpointFor = ({ kind, tagSlug, query }) => {
  if (kind === 'tag') return `/tags/${encodeURIComponent(tagSlug || 'psychometric-test')}`;
  if (kind === 'search') return `/search?q=${encodeURIComponent(query || '')}`;
  const allowed = new Set(['pages','bursaries','articles','dailyupdate','dailyupdate/jobs']);
  return `/${allowed.has(kind) ? kind : 'pages'}`;
};

function extractRecords(payload) {
  const data = payload?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.records)) return data.records;
  if (data && typeof data === 'object' && (data.id || data.title)) return [data];
  return [];
}

const includesYear = (record, year) => !year || new RegExp(`\\b${String(year).replace(/[^0-9]/g,'')}\\b`).test(JSON.stringify(record));

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'TodayInfo-Control-Center/0.2' }, signal: controller.signal });
    if (!res.ok) throw new Error(`Source API returned HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(timer); }
}

async function expandTagRecords(records, tagSlug) {
  const needles = String(tagSlug || '').split('-').filter(Boolean);
  const urls = new Set();
  for (const record of records) {
    for (const link of record.links || []) {
      const hay = `${link.title || ''} ${link.url || ''}`.toLowerCase();
      if (needles.length && needles.every(n => hay.includes(n)) && /^https?:/i.test(link.url || '') && !/\/tag\//i.test(link.url)) urls.add(link.url);
    }
  }
  const expanded = [];
  for (const url of [...urls].slice(0, 12)) {
    try {
      const payload = await fetchJson(`${config.sourceApiBase}/extract?url=${encodeURIComponent(url)}`);
      expanded.push(...extractRecords(payload));
    } catch { /* keep archive import reviewable even when expansion fails */ }
  }
  return expanded;
}

export async function fetchImports(options) {
  const endpoint = endpointFor(options);
  const isCollection = ['pages','bursaries','articles','dailyupdate','dailyupdate/jobs'].includes(options.kind);
  const maxPages = Math.min(20, Math.max(1, Number(options.maxPages || (options.year && isCollection ? 10 : 1))));
  let records = [];
  if (isCollection) {
    for (let page = 1; page <= maxPages; page += 1) {
      const sep = endpoint.includes('?') ? '&' : '?';
      const payload = await fetchJson(`${config.sourceApiBase}${endpoint}${sep}page=${page}&limit=100`);
      const batch = extractRecords(payload);
      records.push(...batch);
      const pagination = payload?.meta?.pagination;
      if (!pagination?.hasNext || batch.length === 0) break;
    }
  } else {
    const payload = await fetchJson(`${config.sourceApiBase}${endpoint}`);
    records = extractRecords(payload);
  }
  if (options.kind === 'tag' && options.expand !== false) records.push(...await expandTagRecords(records, options.tagSlug || 'psychometric-test'));
  const seen = new Set();
  records = records.filter(r => {
    const key = r.url || r.id || `${r.sourceId || ''}:${r.slug || ''}:${r.title || ''}`;
    if (seen.has(key) || !includesYear(r, options.year)) return false;
    seen.add(key); return true;
  });
  return records.map(record => ({
    source_key: hashKey(record.sourceId || 'source', record.id || record.url || record.slug || record.title),
    source_name: record.sourceName || record.sourceId || 'TodayInfo source API',
    source_id: record.sourceId || null,
    source_url: record.url || record.source?.canonicalUrl || record.source?.url || null,
    source_slug: record.slug || null,
    source_payload: record,
    detected_type: detectContentType(record),
    prepared_draft: ruleDraftFromRecord(record),
    review_status: 'unreviewed'
  }));
}
