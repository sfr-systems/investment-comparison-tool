import { CloudSync, SyncError } from './CloudSync.js';
import { SyncMerge } from './SyncMerge.js';
import { Models } from './Models.js';

const KEY_PREF = 'syncKey';
const REFRESH_GAP = 5000; // skip a refresh within this long of the last full sync

/**
 * Keeps this device's projects in step with the cloud copy (api/sync.mjs) so they can be opened
 * on any device that has the sync passphrase. Projects always save locally first; uploads follow
 * a moment after each edit, and anything that couldn't go up (offline, page closed) is sent on
 * the next sync. How each project is reconciled is decided by SyncMerge.
 *
 * status: 'unavailable' (no sync API here) | 'not-configured' | 'off' (no passphrase on this
 * device) | 'syncing' | 'synced' | 'offline' | 'unauthorized' | 'throttled' | 'error'.
 * Events (on): 'status', 'remote-change' { ids: Set } after cloud versions were applied here,
 * 'conflict' { name, copyName } when edits from two devices were both kept.
 */
export class ProjectSync {
  /**
   * @param {Storage} storage
   * @param {object} [options]
   * @param {CloudSync} [options.cloud]
   * @param {() => void} [options.beforeSync] save any edits still waiting in the open view
   * @param {(id: string) => boolean} [options.isEditing] true while that project has unsaved edits
   * @param {number} [options.pushDelay] ms after a local change before uploading it
   */
  constructor(storage, { cloud = new CloudSync(), beforeSync = null, isEditing = null, pushDelay = 1500 } = {}) {
    this.storage = storage;
    this.cloud = cloud;
    this.beforeSync = beforeSync;
    this.isEditing = isEditing;
    this.pushDelay = pushDelay;
    this.key = null;
    this.status = 'unavailable';
    this.error = null;
    this.lastSyncedAt = null;
    this.listeners = {};
    this.timer = null;
    this.active = Promise.resolve();
    this.waiting = null;
    storage.onChange(() => this.schedule());
  }

  on(type, fn) {
    (this.listeners[type] ||= new Set()).add(fn);
    return () => this.listeners[type].delete(fn);
  }

  emit(type, detail) {
    for (const fn of this.listeners[type] || []) fn(detail);
  }

  get connected() {
    return !!this.key;
  }

  setStatus(status, error = null) {
    this.status = status;
    this.error = error;
    this.emit('status', status);
  }

  /** Load this device's key and sync, or find out whether sync is available here. */
  async start() {
    this.key = await this.storage.getPreference(KEY_PREF);
    if (this.key) return this.syncNow();
    const found = await this.cloud.probe();
    this.setStatus(found === 'available' || found === 'offline' ? 'off' : found);
  }

  /** Check the passphrase, remember it on this device, and sync. Throws SyncError if refused. */
  async connect(passphrase) {
    const key = await CloudSync.keyFor(passphrase);
    await this.cloud.pull(key);
    this.key = key;
    await this.storage.setPreference(KEY_PREF, key);
    await this.syncNow();
  }

  /** Stop syncing on this device. Projects stay here; nothing is deleted anywhere. */
  async disconnect() {
    this.stop();
    this.key = null;
    await this.storage.removePreference(KEY_PREF);
    this.setStatus('off');
  }

  stop() {
    clearTimeout(this.timer);
  }

  /** Upload local changes shortly (edits come in bursts). */
  schedule() {
    if (!this.key) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.syncNow({ full: false }), this.pushDelay);
  }

  /** Upload unsent changes now; used when the page is hidden or closing. */
  flush() {
    if (!this.key) return Promise.resolve();
    return this.syncNow({ full: false, keepalive: true });
  }

  /** Full sync, unless one just finished (focus/visibility events come in clusters). */
  refresh() {
    if (this.lastSyncedAt && Date.now() - this.lastSyncedAt < REFRESH_GAP) return Promise.resolve();
    return this.syncNow();
  }

  /**
   * Run a sync after any in progress. `full` downloads everything; otherwise only local changes
   * go up. Calls made while one is already queued join it.
   */
  syncNow({ full = true, keepalive = false } = {}) {
    if (!this.key) return Promise.resolve();
    clearTimeout(this.timer);
    if (this.waiting) {
      this.waiting.full ||= full;
      this.waiting.keepalive ||= keepalive;
      return this.waiting.done;
    }
    const job = (this.waiting = { full, keepalive });
    job.done = this.active.then(() => {
      this.waiting = null;
      return this.run(job);
    });
    this.active = job.done;
    return job.done;
  }

  async run({ full, keepalive }) {
    const key = this.key;
    if (!key) return;
    this.beforeSync?.();
    this.setStatus('syncing');
    try {
      let remote = full ? byId(await this.cloud.pull(key)) : {};
      let complete = full;
      // Usually one round; more only when an upload raced another device or a copy was made.
      for (let round = 0; round < 4; round++) {
        const projects = await this.storage.allProjects();
        const state = await this.storage.getSyncState();
        const local = Object.fromEntries(Object.entries(projects)
          .map(([id, p]) => [id, { rev: revOf(p), sample: !!p.sample }]));
        const plan = SyncMerge.plan({ local, state, remote, full: complete });

        const patch = {};
        const changed = new Set();
        let copies = 0;
        for (const { id, base } of plan.settle) patch[id] = { base };
        for (const id of plan.forget) patch[id] = null;
        for (const id of plan.pull) {
          if (!(await this.applyRemote(remote[id], projects[id]))) continue;
          patch[id] = { base: remote[id].rev, deleted: undefined, deletedAt: undefined };
          changed.add(id);
          // Edited in both places: this device's version lives on as a separate project.
          if (plan.copy.includes(id)) {
            changed.add(await this.keepConflictCopy(projects[id]));
            copies++;
          }
        }
        await this.storage.patchSyncState(patch);
        // Tell views right away (no network wait in between), before any further edit can land.
        if (changed.size) this.emit('remote-change', { ids: changed });

        const records = plan.push.map(({ id, base, deleted }) => {
          if (deleted) return { id, base, rev: state[id].deleted, updatedAt: state[id].deletedAt, deleted: true };
          const project = projects[id];
          return { id, base, rev: revOf(project), updatedAt: project.updatedAt, project: { ...project, rev: revOf(project) } };
        });
        let conflicts = [];
        if (records.length) {
          const result = await this.cloud.push(key, records, { keepalive });
          const accepted = new Set(result.accepted);
          const done = {};
          for (const r of records) {
            if (accepted.has(r.id)) done[r.id] = r.deleted ? { base: r.rev, deleted: undefined, deletedAt: undefined } : { base: r.rev };
          }
          await this.storage.patchSyncState(done);
          conflicts = result.conflicts || [];
        }
        if (!conflicts.length && !copies) break;
        remote = byId(conflicts);
        complete = false;
      }
      this.lastSyncedAt = Date.now();
      this.setStatus('synced');
    } catch (err) {
      if (!(err instanceof SyncError)) console.error('Sync failed', err);
      const kind = err instanceof SyncError ? err.kind : 'error';
      if (kind === 'unauthorized') {
        // The passphrase changed: stop retrying (each try counts as a wrong guess) until re-entered.
        this.stop();
        this.key = null;
        await this.storage.removePreference(KEY_PREF);
      }
      this.setStatus(kind === 'server' || kind === 'unavailable' ? 'error' : kind, err);
    }
  }

  /**
   * Replace the local copy with the cloud record, unless the project changed here since this
   * sync looked at it (or still has unsaved edits): then it's left for the next sync to merge.
   */
  async applyRemote(record, seen) {
    const current = await this.storage.getProject(record.id);
    if (current?.rev !== seen?.rev || current?.updatedAt !== seen?.updatedAt || this.isEditing?.(record.id)) return false;
    if (record.deleted) await this.storage.removeProject(record.id);
    else await this.storage.storeProject({ ...record.project, id: record.id, rev: record.rev });
    return true;
  }

  /** Save this device's version as a separate project (uploaded next round); returns its id. */
  async keepConflictCopy(project) {
    const names = new Set((await this.storage.listProjects()).map((p) => p.name));
    let copyName = `${project.name} (conflicted copy)`;
    for (let i = 2; names.has(copyName); i++) copyName = `${project.name} (conflicted copy ${i})`;
    const copy = Models.cloneProject(project, copyName);
    await this.storage.storeProject(copy);
    this.emit('conflict', { name: project.name, copyName });
    return copy.id;
  }
}

/** Projects saved before sync existed have no rev; their timestamp stands in (stable per device). */
function revOf(project) {
  return project.rev ?? `t${project.updatedAt}`;
}

function byId(records) {
  return Object.fromEntries(records.map((r) => [r.id, r]));
}
