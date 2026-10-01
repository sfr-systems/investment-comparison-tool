// Run: node js/tests/sync.test.mjs
// Cloud sync: SyncMerge rules, the api/sync.mjs endpoint (against an in-memory fake of Upstash's
// REST API), and two simulated devices syncing through that endpoint with ProjectSync.
import { webcrypto } from 'node:crypto';
import { SyncMerge } from '../SyncMerge.js';
import { Storage, LocalStorageAdapter } from '../Storage.js';
import { ProjectSync } from '../ProjectSync.js';
import { CloudSync, SyncError } from '../CloudSync.js';
import { Models } from '../Models.js';
import { SampleProject } from '../SampleProject.js';
import api from '../../api/sync.mjs';

globalThis.crypto ??= webcrypto;

let failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`);
}

// ---------------------------------------------------------------------------- SyncMerge.plan
const plan = (args) => {
  const p = SyncMerge.plan(args);
  return Object.fromEntries(Object.entries(p).filter(([, v]) => v.length));
};
check('new local project, empty cloud → push',
  plan({ local: { a: { rev: 'r5' } }, full: true }),
  { push: [{ id: 'a', base: null, deleted: false }] });
check('untouched sample stays local',
  plan({ local: { s: { rev: 'r5', sample: true } }, full: true }), {});
check('in the cloud only → pull',
  plan({ remote: { a: { rev: 'r5' } }, full: true }), { pull: ['a'] });
check('clean here, changed in cloud → pull',
  plan({ local: { a: { rev: 'r5' } }, state: { a: { base: 'r5' } }, remote: { a: { rev: 'r9' } }, full: true }),
  { pull: ['a'] });
check('edited here, cloud unchanged → push from base',
  plan({ local: { a: { rev: 'r7' } }, state: { a: { base: 'r5' } }, remote: { a: { rev: 'r5' } }, full: true }),
  { push: [{ id: 'a', base: 'r5', deleted: false }] });
check('edited in both → conflicted copy + pull',
  plan({ local: { a: { rev: 'r7' } }, state: { a: { base: 'r5' } }, remote: { a: { rev: 'r9' } }, full: true }),
  { pull: ['a'], copy: ['a'] });
check('deleted here, cloud unchanged → push deletion',
  plan({ state: { a: { base: 'r5', deleted: 'r8' } }, remote: { a: { rev: 'r5' } }, full: true }),
  { push: [{ id: 'a', base: 'r5', deleted: true }] });
check('deleted here, edited in cloud → edit wins (pull)',
  plan({ state: { a: { base: 'r5', deleted: 'r8' } }, remote: { a: { rev: 'r9' } }, full: true }),
  { pull: ['a'] });
check('edited here, deleted in cloud → keep the edits (push over the deletion)',
  plan({ local: { a: { rev: 'r7' } }, state: { a: { base: 'r5' } }, remote: { a: { rev: 'r9', deleted: true } }, full: true }),
  { push: [{ id: 'a', base: 'r9', deleted: false }] });
check('clean here, deleted in cloud → pull (delete)',
  plan({ local: { a: { rev: 'r5' } }, state: { a: { base: 'r5' } }, remote: { a: { rev: 'r9', deleted: true } }, full: true }),
  { pull: ['a'] });
check('same version, base not recorded (lost reply) → settle',
  plan({ local: { a: { rev: 'r7' } }, state: { a: { base: 'r5' } }, remote: { a: { rev: 'r7' } }, full: true }),
  { settle: [{ id: 'a', base: 'r7' }] });
check('synced before, cloud lost it → upload again',
  plan({ local: { a: { rev: 'r5' } }, state: { a: { base: 'r5' } }, full: true }),
  { push: [{ id: 'a', base: 'r5', deleted: false }] });
check('bookkeeping for a project gone everywhere → forget',
  plan({ state: { a: { base: 'r5' } }, full: true }), { forget: ['a'] });
check('upload only (not full): clean projects are left alone',
  plan({ local: { a: { rev: 'r5' }, b: { rev: 'r8' } }, state: { a: { base: 'r5' }, b: { base: 'r6' } } }),
  { push: [{ id: 'b', base: 'r6', deleted: false }] });

// ---------------------------------------------------------------------------- fake network
const REDIS_URL = 'https://fake-redis.test';
const API_URL = 'https://app.test/api/sync';
const redisData = new Map();
let online = true;
let ip = '10.0.0.1';

function runRedis([cmd, ...args]) {
  switch (cmd) {
    case 'GET': return redisData.get(args[0]) ?? null;
    case 'SET': {
      const nx = args.includes('NX');
      if (nx && redisData.has(args[0])) return null;
      redisData.set(args[0], String(args[1]));
      return 'OK';
    }
    case 'INCR': {
      const n = Number(redisData.get(args[0]) || 0) + 1;
      redisData.set(args[0], String(n));
      return n;
    }
    case 'HGETALL': return [...(redisData.get(args[0]) || new Map())].flat();
    case 'HMGET': return args.slice(1).map((f) => redisData.get(args[0])?.get(f) ?? null);
    case 'HSET': {
      const h = redisData.get(args[0]) || new Map();
      for (let i = 1; i < args.length; i += 2) h.set(args[i], args[i + 1]);
      redisData.set(args[0], h);
      return (args.length - 1) / 2;
    }
    default: throw new Error(`fake redis: ${cmd} not supported`);
  }
}

globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url === `${REDIS_URL}/pipeline`) {
    if (init.headers.Authorization !== 'Bearer redis-token') return new Response('nope', { status: 401 });
    return Response.json(JSON.parse(init.body).map((c) => ({ result: runRedis(c) })));
  }
  if (url.split('?')[0] === API_URL) {
    if (!online) throw new TypeError('Failed to fetch');
    return api.fetch(new Request(url, {
      method: init.method || 'GET',
      headers: { ...init.headers, 'x-forwarded-for': ip },
      body: init.body,
    }));
  }
  throw new Error(`unexpected fetch ${url}`);
};

const call = async (method, { key, body } = {}) => {
  const res = await fetch(API_URL, {
    method,
    headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
};

// ---------------------------------------------------------------------------- api/sync.mjs
check('unconfigured → 503 not_configured', (await call('GET')).data.error, 'not_configured');
check('unconfigured → probe says so', await new CloudSync(API_URL).probe(), 'not-configured');
Object.assign(process.env, {
  SYNC_PASSPHRASE: 'correct horse battery staple', KV_REST_API_URL: `${REDIS_URL}/`, KV_REST_API_TOKEN: 'redis-token',
});
const KEY = await CloudSync.keyFor('correct horse battery staple');
check('client key matches the server’s hash format', KEY.length, 64);
check('no key → 401 (sync exists here)', (await call('GET')).status, 401);
check('probe sees it as available', await new CloudSync(API_URL).probe(), 'available');
check('right key → empty list', (await call('GET', { key: KEY })).data, { records: [] });
check('wrong key → 401', (await call('GET', { key: 'f'.repeat(64) })).status, 401);

const proj = { id: 'p1', name: 'Plan', strategies: [] };
let r = await call('POST', { key: KEY, body: { records: [{ id: 'p1', base: null, rev: 'v1', updatedAt: 100, project: proj }] } });
check('upload new project', r.data, { accepted: ['p1'], conflicts: [] });
r = await call('POST', { key: KEY, body: { records: [{ id: 'p1', base: null, rev: 'v2', updatedAt: 100, project: proj }] } });
check('upload not based on the cloud’s version → conflict returns the cloud’s (even at the same time)',
  r.data, { accepted: [], conflicts: [{ id: 'p1', rev: 'v1', updatedAt: 100, project: proj }] });
r = await call('POST', { key: KEY, body: { records: [{ id: 'p1', base: null, rev: 'v1', updatedAt: 100, project: proj }] } });
check('retrying an upload that already landed is accepted', r.data.accepted, ['p1']);
r = await call('POST', { key: KEY, body: { records: [{ id: 'p1', base: 'v1', rev: 'v3', updatedAt: 200, deleted: true }] } });
check('deletion from the current version', r.data.accepted, ['p1']);
check('deletion is kept as a marker', (await call('GET', { key: KEY })).data.records, [{ id: 'p1', rev: 'v3', updatedAt: 200, deleted: true }]);
r = await call('POST', { key: KEY, body: { records: [{ id: 'p2', rev: 'v1', updatedAt: 1, project: { id: 'other' } }] } });
check('project id must match its record → 400', r.status, 400);
r = await call('POST', { key: KEY, body: { records: [{ id: '../x', rev: 'v1', updatedAt: 1, deleted: true }] } });
check('bad id → 400', r.status, 400);
r = await call('POST', { key: KEY, body: { records: [{ id: 'p3', updatedAt: 1, deleted: true }] } });
check('missing rev → 400', r.status, 400);

ip = '10.9.9.9';
for (let i = 0; i < 20; i++) await call('GET', { key: 'bad' });
check('20 wrong passphrases → that IP is throttled, even with the right key', (await call('GET', { key: KEY })).status, 429);
ip = '10.0.0.1';
check('other IPs are unaffected', (await call('GET', { key: KEY })).status, 200);

// ---------------------------------------------------------------------------- two devices
function device() {
  const mem = new Map();
  const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const storage = new Storage(new LocalStorageAdapter('ict:', store));
  const sync = new ProjectSync(storage, { cloud: new CloudSync(API_URL), pushDelay: 60_000 });
  const events = { conflicts: [], changed: [] };
  sync.on('conflict', (e) => events.conflicts.push(e));
  sync.on('remote-change', ({ ids }) => events.changed.push(...ids));
  return { storage, sync, events };
}
const names = async (d) => (await d.storage.listProjects()).map((p) => p.name).sort();
redisData.clear();

const A = device();
const B = device();
await A.storage.saveProject(SampleProject.create());
const retire = await A.storage.saveProject(Models.project('Retirement'));

let error = null;
try { await A.sync.connect('wrong'); } catch (e) { error = e; }
check('wrong passphrase is refused', error instanceof SyncError && error.kind, 'unauthorized');
check('…and not remembered', A.sync.connected, false);

await A.sync.connect('correct horse battery staple');
check('A connected and synced', A.sync.status, 'synced');
await B.sync.connect('correct horse battery staple');
check('B gets A’s project, not A’s untouched sample', await names(B), ['Retirement']);
check('B was told which projects arrived', B.events.changed, [retire.id]);

const onB = await B.storage.getProject(retire.id);
onB.name = 'Retirement plan';
await B.storage.saveProject(onB);
await B.sync.syncNow({ full: false });
await A.sync.syncNow();
check('B’s edit reaches A', (await A.storage.getProject(retire.id)).name, 'Retirement plan');

const sample = (await A.storage.listProjects()).find((p) => p.name === 'Career Options');
const edited = await A.storage.getProject(sample.id);
delete edited.sample; // what ProjectView does on the first edit
await A.storage.saveProject(edited);
await A.sync.syncNow();
await B.sync.syncNow();
check('an edited sample is synced like any project', await names(B), ['Career Options', 'Retirement plan']);

await A.storage.deleteProject(sample.id);
await A.sync.syncNow();
await B.sync.syncNow();
check('a deletion on A removes it from B', await names(B), ['Retirement plan']);

// Both devices edit the same project before syncing.
const a1 = await A.storage.getProject(retire.id);
a1.settings.discountRate = 4;
await A.storage.saveProject(a1);
const b1 = await B.storage.getProject(retire.id);
b1.settings.discountRate = 9;
await B.storage.saveProject(b1);
await B.sync.syncNow();
await A.sync.syncNow();
check('A now has B’s version…', (await A.storage.getProject(retire.id)).settings.discountRate, 9);
const copy = (await A.storage.listProjects()).find((p) => p.name === 'Retirement plan (conflicted copy)');
check('…and keeps its own edits as a conflicted copy', copy && (await A.storage.getProject(copy.id)).settings.discountRate, 4);
check('A was told about the conflict', A.events.conflicts.map((c) => c.copyName), ['Retirement plan (conflicted copy)']);
await B.sync.syncNow();
check('the conflicted copy reaches B too', await names(B), ['Retirement plan', 'Retirement plan (conflicted copy)']);

// Offline edits wait on the device and go up on the next sync.
online = false;
const a2 = await A.storage.getProject(retire.id);
a2.name = 'Retirement (offline edit)';
await A.storage.saveProject(a2);
await A.sync.syncNow();
check('offline sync reports offline', A.sync.status, 'offline');
online = true;
await A.sync.syncNow();
await B.sync.syncNow();
check('offline edit uploads once back online', (await B.storage.getProject(retire.id)).name, 'Retirement (offline edit)');

// Deleted on one device while edited on the other: the edit wins.
await A.storage.deleteProject(copy.id);
const b2 = await B.storage.getProject(copy.id);
b2.name = 'Keep me';
await B.storage.saveProject(b2);
await B.sync.syncNow();
await A.sync.syncNow();
check('edit beats a deletion made elsewhere', (await A.storage.getProject(copy.id))?.name, 'Keep me');

// The passphrase is changed on the server: devices stop syncing until it's re-entered.
process.env.SYNC_PASSPHRASE = 'a new passphrase';
await A.sync.syncNow();
check('changed passphrase pauses sync', [A.sync.status, A.sync.connected], ['unauthorized', false]);
await A.sync.connect('a new passphrase');
check('re-entering it resumes', A.sync.status, 'synced');

A.sync.stop();
B.sync.stop();
console.log(failed ? `\n${failed} FAILED` : '\nAll sync tests passed');
process.exit(failed ? 1 : 0);
