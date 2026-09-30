import crypto from 'node:crypto';

export const nowIso = () => new Date().toISOString();
export const id = () => crypto.randomUUID();

export function slugify(input = '') {
  return String(input)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 100) || 'untitled';
}

export function uniqueSlug(base, existing = []) {
  const root = slugify(base);
  const taken = new Set(existing.filter(Boolean));
  if (!taken.has(root)) return root;
  let n = 2;
  while (taken.has(`${root}-${n}`)) n += 1;
  return `${root}-${n}`;
}

export function safeText(value, max = 20000) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

export function parseDateLoose(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function paginate(rows, page = 1, limit = 20) {
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / l));
  return {
    data: rows.slice((p - 1) * l, p * l),
    meta: { pagination: { page: p, limit: l, total, totalPages, hasNext: p < totalPages, hasPrevious: p > 1 } }
  };
}

export function hashKey(...parts) {
  return crypto.createHash('sha256').update(parts.filter(Boolean).join('|')).digest('hex').slice(0, 24);
}
