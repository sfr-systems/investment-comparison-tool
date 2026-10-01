/**
 * Cloud sync endpoint (Vercel Function at /api/sync) so projects can be opened on any device.
 * Stores records in Upstash Redis through its REST API (no npm dependencies): one hash, field =
 * project id, value = JSON { id, rev, updatedAt, project } or a deletion marker
 * { id, rev, updatedAt, deleted: true }. `rev` identifies a version (unique per save).
 *
 * Environment (Vercel → Project → Settings → Environment Variables):
 *   SYNC_PASSPHRASE                         required; entered once on each device
 *   KV_REST_API_URL + KV_REST_API_TOKEN     added when an Upstash Redis store is connected
 *   (or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)
 *
 * Requests carry `Authorization: Bearer <key>`, key = SHA-256 hex of "ict-sync:" + passphrase.
 *   GET   → { records }                     every record, deletion markers included
 *   POST  { records: [{ id, base, rev, updatedAt, project | deleted }] } → { accepted: [id], conflicts: [record] }
 *         A record is stored only if the cloud copy is still the version it was based on (`base`
 *         rev), so one device can't overwrite changes it hasn't seen; otherwise the cloud's comes back.
 *   GET ?status → { configured } without a key, so the app can tell whether sync is set up here.
 * Wrong or missing key: 401 (20 wrong tries from one IP lock it out for 15 minutes: 429).
 */
import { createHash, timingSafeEqual } from 'node:crypto';

const RECORDS = 'ict:records';
const MAX_FAILS = 20; // wrong passphrases per IP…
const FAIL_WINDOW = 15 * 60; // …per 15 minutes
const MAX_RECORDS = 200;
const MAX_RECORD_CHARS = 1_000_000;
const ID_PATTERN = /^[\w-]{1,64}$/;
const REV_PATTERN = /^[\w.-]{1,64}$/;

export default {
  async fetch(request) {
    try {
      return await handle(request, process.env);
    } catch (err) {
      console.error('sync failed', err);
      return json({ error: 'server', message: 'The sync storage could not be reached.' }, 502);
    }
  },
};

async function handle(request, env) {
  const db = redisConfig(env);
  if (request.method === 'GET' && new URL(request.url).searchParams.has('status')) {
    return json({ configured: !!(db && env.SYNC_PASSPHRASE) });
  }
  if (!db || !env.SYNC_PASSPHRASE) {
    const missing = [!env.SYNC_PASSPHRASE && 'SYNC_PASSPHRASE', !db && 'KV_REST_API_URL / KV_REST_API_TOKEN'];
    return json({ error: 'not_configured', missing: missing.filter(Boolean) }, 503);
  }
  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET, POST' });
  }

  const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!given) return json({ error: 'unauthorized' }, 401);
  const failKey = `ict:authfail:${clientIp(request)}`;
  const [fails] = await redis(db, [['GET', failKey]]);
  if (Number(fails) >= MAX_FAILS) {
    return json({ error: 'throttled' }, 429, { 'Retry-After': String(FAIL_WINDOW) });
  }
  if (!sameKey(given, keyFor(env.SYNC_PASSPHRASE))) {
    await redis(db, [['SET', failKey, 0, 'EX', FAIL_WINDOW, 'NX'], ['INCR', failKey]]);
    return json({ error: 'unauthorized' }, 401);
  }

  if (request.method === 'GET') {
    const [all] = await redis(db, [['HGETALL', RECORDS]]);
    return json({ records: hashValues(all).map((v) => JSON.parse(v)) });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request', message: 'Body must be JSON.' }, 400);
  }
  const problem = invalid(body?.records);
  if (problem) return json({ error: 'bad_request', message: problem }, 400);

  const incoming = body.records;
  const [stored] = await redis(db, [['HMGET', RECORDS, ...incoming.map((r) => r.id)]]);
  const accepted = [];
  const conflicts = [];
  const writes = [];
  incoming.forEach((rec, i) => {
    const current = stored?.[i] ? JSON.parse(stored[i]) : null;
    if (current && current.rev !== rec.base && current.rev !== rec.rev) {
      conflicts.push(current);
      return;
    }
    accepted.push(rec.id);
    if (current?.rev !== rec.rev) {
      const record = rec.deleted
        ? { id: rec.id, rev: rec.rev, updatedAt: rec.updatedAt, deleted: true }
        : { id: rec.id, rev: rec.rev, updatedAt: rec.updatedAt, project: rec.project };
      writes.push(rec.id, JSON.stringify(record));
    }
  });
  if (writes.length) await redis(db, [['HSET', RECORDS, ...writes]]);
  return json({ accepted, conflicts });
}

/** Problem with an upload's records, or null when they're fine. */
function invalid(records) {
  if (!Array.isArray(records) || !records.length) return 'Expected a non-empty "records" array.';
  if (records.length > MAX_RECORDS) return `At most ${MAX_RECORDS} records per request.`;
  const seen = new Set();
  for (const r of records) {
    if (!r || typeof r.id !== 'string' || !ID_PATTERN.test(r.id)) return 'Each record needs a valid id.';
    if (seen.has(r.id)) return `Duplicate id ${r.id}.`;
    seen.add(r.id);
    if (typeof r.rev !== 'string' || !REV_PATTERN.test(r.rev)) return `Record ${r.id} needs a valid rev.`;
    if (r.base != null && (typeof r.base !== 'string' || !REV_PATTERN.test(r.base))) return `Record ${r.id} has an invalid base.`;
    if (!Number.isFinite(r.updatedAt)) return `Record ${r.id} needs a numeric updatedAt.`;
    if (r.deleted === true) continue;
    if (!r.project || typeof r.project !== 'object' || r.project.id !== r.id) {
      return `Record ${r.id} needs a project with the same id (or deleted: true).`;
    }
    if (JSON.stringify(r.project).length > MAX_RECORD_CHARS) return `Project ${r.id} is too large.`;
  }
  return null;
}

function keyFor(passphrase) {
  return createHash('sha256').update(`ict-sync:${passphrase}`).digest('hex');
}

function sameKey(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function clientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  return (forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || 'unknown').trim();
}

function redisConfig(env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

/** Run Redis commands in one round trip; returns each command's result. */
async function redis({ url, token }, commands) {
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Redis responded ${res.status}`);
  return (await res.json()).map((r) => {
    if (r.error) throw new Error(`Redis: ${r.error}`);
    return r.result;
  });
}

/** HGETALL comes back as [field, value, field, value…] over REST (or an object from some clients). */
function hashValues(result) {
  if (!result) return [];
  if (!Array.isArray(result)) return Object.values(result);
  return result.filter((_, i) => i % 2 === 1);
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}
