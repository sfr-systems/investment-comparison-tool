import { Models } from './Models.js';

/**
 * Low-level key/value adapter over localStorage. Async so a network-backed
 * adapter (backend + auth) can be dropped in later with the same interface.
 */
export class LocalStorageAdapter {
  constructor(prefix = 'ict:', store = null) {
    this.prefix = prefix;
    this.backing = store; // defaults to window.localStorage (tests pass an in-memory store)
  }

  get store() {
    return this.backing || globalThis.localStorage;
  }

  async get(key) {
    try {
      const raw = this.store.getItem(this.prefix + key);
      return raw == null ? null : JSON.parse(raw);
    } catch (err) {
      console.warn('Storage read failed', key, err);
      return null;
    }
  }

  async set(key, value) {
    try {
      this.store.setItem(this.prefix + key, JSON.stringify(value));
    } catch (err) {
      console.error('Storage write failed', key, err);
      throw err;
    }
  }

  async remove(key) {
    try {
      this.store.removeItem(this.prefix + key);
    } catch (err) {
      console.warn('Storage remove failed', key, err);
    }
  }
}

/**
 * The single persistence entry point for the app. Views only talk to this.
 * Layout: "index" → [{ id, name, updatedAt }], "project:<id>" → full project,
 * "pref:<key>" → UI preference, "sync" → { [id]: { base, deleted? } } cloud-sync bookkeeping
 * (see ProjectSync). Projects always save here first; ProjectSync copies them to the cloud.
 */
export class Storage {
  constructor(adapter = new LocalStorageAdapter()) {
    this.adapter = adapter;
    this.listeners = new Set();
  }

  /** Called with { id } after each user save or delete. Returns an unsubscribe function. */
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async listProjects() {
    const index = (await this.adapter.get('index')) || [];
    return [...index].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  async getProject(id) {
    return this.adapter.get(`project:${id}`);
  }

  /** Every project on this device, by id. */
  async allProjects() {
    const index = (await this.adapter.get('index')) || [];
    const out = {};
    for (const { id } of index) {
      const project = await this.getProject(id);
      if (project) out[id] = project;
    }
    return out;
  }

  /** Save a user edit as a new version: a fresh `rev` (unique across devices) and timestamp. */
  async saveProject(project) {
    project.updatedAt = Date.now();
    project.rev = Models.id();
    await this.storeProject(project);
    this.notify(project.id);
    return project;
  }

  /** Write a project as-is, keeping its version (e.g. one downloaded from the cloud). */
  async storeProject(project) {
    await this.adapter.set(`project:${project.id}`, project);
    const index = (await this.adapter.get('index')) || [];
    const entry = { id: project.id, name: project.name, updatedAt: project.updatedAt };
    const i = index.findIndex((p) => p.id === project.id);
    if (i >= 0) index[i] = entry; else index.push(entry);
    await this.adapter.set('index', index);
  }

  /** Small per-device UI preferences (e.g. theme). */
  async getPreference(key) {
    return this.adapter.get(`pref:${key}`);
  }

  async setPreference(key, value) {
    await this.adapter.set(`pref:${key}`, value);
  }

  async removePreference(key) {
    await this.adapter.remove(`pref:${key}`);
  }

  /** User deletes a project. If it was ever synced, remember that so other devices drop it too. */
  async deleteProject(id) {
    await this.removeProject(id);
    const synced = (await this.getSyncState())[id]?.base != null;
    await this.patchSyncState({ [id]: synced ? { deleted: Models.id(), deletedAt: Date.now() } : null });
    this.notify(id);
  }

  /** Drop a project from this device only. */
  async removeProject(id) {
    await this.adapter.remove(`project:${id}`);
    const index = (await this.adapter.get('index')) || [];
    await this.adapter.set('index', index.filter((p) => p.id !== id));
  }

  async getSyncState() {
    return (await this.adapter.get('sync')) || {};
  }

  /**
   * Merge changes into the sync bookkeeping: { [id]: fields } (a field set to undefined is
   * removed) or { [id]: null } to forget an id. Read-modify-write in one step, so concurrent
   * deletes aren't lost.
   */
  async patchSyncState(patch) {
    const state = await this.getSyncState();
    for (const [id, fields] of Object.entries(patch)) {
      if (fields === null) {
        delete state[id];
        continue;
      }
      const entry = { ...state[id], ...fields };
      for (const k of Object.keys(entry)) if (entry[k] === undefined) delete entry[k];
      state[id] = entry;
    }
    await this.adapter.set('sync', state);
  }

  notify(id) {
    for (const fn of this.listeners) fn({ id });
  }
}
