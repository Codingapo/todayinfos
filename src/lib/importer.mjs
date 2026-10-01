import { config } from '../config.mjs';
import { hashKey } from './utils.mjs';
import { detectContentType, ruleDraftFromRecord, isIndexLikeRecord, contentQuality } from './content-rules.mjs';

const MAX_SOURCE_PAGES = 100;
const PAGE_SIZE = 100;

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

const includesYear = (record, year) => {
  if (!year) return true;
  const y = String(year).replace(/[^0-9]/g,'');
  if (!y) return true;
  return new RegExp(`\\b${y}\\b`).test(JSON.stringify(record));
};

const recordDate = (r={}) =>
  r.modifiedAt || r.updatedAt || r.publishedAt || r.posted_date || r.closingDate || r.openingDate || null;

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'TodayInfo-Control-Center/0.3' },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`Source API returned HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCollection(endpoint, maxPages) {
  const sep = endpoint.includes('?') ? '&' : '?';
  const makeUrl = page => `${config.sourceApiBase}${endpoint}${sep}page=${page}&limit=${PAGE_SIZE}`;

  const first = await fetchJson(makeUrl(1));
  const firstBatch = extractRecords(first);
  const pagination = first?.meta?.pagination || {};
  const declaredTotalPages = Number(pagination.totalPages || pagination.total_pages || 0);
  const wanted = Math.min(MAX_SOURCE_PAGES, Math.max(1, Number(maxPages || MAX_SOURCE_PAGES)));
  const totalPages = declaredTotalPages > 0 ? Math.min(wanted, declaredTotalPages) : wanted;
  const all = [...firstBatch];
  let pagesFetched = 1;

  if (declaredTotalPages > 0) {
    const remaining = [];
    for (let page=2; page<=totalPages; page+=1) remaining.push(page);
    for (let i=0; i<remaining.length; i+=4) {
      const chunk = remaining.slice(i,i+4);
      const payloads = await Promise.all(chunk.map(page => fetchJson(makeUrl(page)).catch(() => null)));
      payloads.forEach(payload => {
        if (!payload) return;
        pagesFetched += 1;
        all.push(...extractRecords(payload));
      });
    }
  } else {
    let hasNext = Boolean(pagination?.hasNext);
    for (let page=2; page<=wanted && hasNext; page+=1) {
      const payload = await fetchJson(makeUrl(page));
      const batch = extractRecords(payload);
      pagesFetched += 1;
      all.push(...batch);
      hasNext = Boolean(payload?.meta?.pagination?.hasNext) && batch.length > 0;
    }
  }

  return { records: all, pagesFetched };
}

async function expandTagRecords(records, tagSlug) {
  const needles = String(tagSlug || '').split('-').filter(Boolean);
  const urls = new Set();
  for (const record of records) {
    for (const link of record.links || []) {
      const hay = `${link.title || ''} ${link.url || ''}`.toLowerCase();
      if (
        needles.length &&
        needles.every(n => hay.includes(n)) &&
        /^https?:/i.test(link.url || '') &&
        !/\/tag\//i.test(link.url)
      ) urls.add(link.url);
    }
  }

  const expanded = [];
  for (const url of [...urls].slice(0, 30)) {
    try {
      const u = new URL(url);
      let payload;
      try {
        payload = await fetchJson(`${config.sourceApiBase}/extract?path=${encodeURIComponent(u.pathname + u.search)}`);
      } catch {
        payload = await fetchJson(`${config.sourceApiBase}/extract?url=${encodeURIComponent(url)}`);
      }
      expanded.push(...extractRecords(payload));
    } catch {
      // Keep the tag sync useful even if a single expansion fails.
    }
  }
  return expanded;
}

export async function fetchImports(options={}) {
  const endpoint = endpointFor(options);
  const isCollection = ['pages','bursaries','articles','dailyupdate','dailyupdate/jobs'].includes(options.kind);
  const maxPages = Math.min(MAX_SOURCE_PAGES, Math.max(1, Number(options.maxPages || MAX_SOURCE_PAGES)));
  let records = [];
  let pagesFetched = 1;

  if (isCollection) {
    const result = await fetchCollection(endpoint,maxPages);
    records = result.records;
    pagesFetched = result.pagesFetched;
  } else {
    const payload = await fetchJson(`${config.sourceApiBase}${endpoint}`);
    records = extractRecords(payload);
  }

  if (options.kind === 'tag' && options.expand !== false) {
    records.push(...await expandTagRecords(records, options.tagSlug || 'psychometric-test'));
  }

  const rawRecords = records.length;
  const seen = new Set();
  let duplicates = 0;
  let skippedIndexPages = 0;
  let skippedYear = 0;

  records = records.filter(record => {
    const key = record.url || record.id || `${record.sourceId || ''}:${record.slug || ''}:${record.title || ''}`;
    if (seen.has(key)) { duplicates += 1; return false; }
    seen.add(key);
    if (!includesYear(record, options.year)) { skippedYear += 1; return false; }
    if (isIndexLikeRecord(record)) { skippedIndexPages += 1; return false; }
    return true;
  });

  records.sort((a,b) => String(recordDate(b)||'').localeCompare(String(recordDate(a)||'')));

  const rows = records.map(record => {
    const prepared = ruleDraftFromRecord(record);
    const quality = contentQuality(prepared);
    return {
      source_key: hashKey(record.sourceId || 'source', record.id || record.url || record.slug || record.title),
      source_hash: hashKey(JSON.stringify(record)),
      source_name: record.sourceName || record.sourceId || 'TodayInfo source API',
      source_id: record.sourceId || null,
      source_url: record.url || record.source?.canonicalUrl || record.source?.url || null,
      source_slug: record.slug || null,
      source_payload: record,
      detected_type: detectContentType(record),
      prepared_draft: prepared,
      review_status: 'unreviewed',
      source_changed: false,
      quality_score: quality.score,
      quality_issues: quality.issues,
      source_record_date: recordDate(record)
    };
  });

  return {
    rows,
    stats: {
      pagesFetched,
      rawRecords,
      keptRecords: rows.length,
      duplicates,
      skippedIndexPages,
      skippedYear,
      pageSize: PAGE_SIZE,
      maxPages
    }
  };
}
