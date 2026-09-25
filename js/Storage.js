/**
 * Low-level key/value adapter over localStorage. Async so a network-backed
 * adapter (backend + auth) can be dropped in later with the same interface.
 */
export class LocalStorageAdapter {
  constructor(prefix = 'ict:') {
    this.prefix = prefix;
  }

  async get(key) {
    try {
      const raw = localStorage.getItem(this.prefix + key);
      return raw == null ? null : JSON.parse(raw);
    } catch (err) {
      console.warn('Storage read failed', key, err);
      return null;
    }
  }

  async set(key, value) {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(value));
    } catch (err) {
      console.error('Storage write failed', key, err);
      throw err;
    }
  }

  async remove(key) {
    try {
      localStorage.removeItem(this.prefix + key);
    } catch (err) {
      console.warn('Storage remove failed', key, err);
    }
  }
}

/**
 * The single persistence entry point for the app. Views only talk to this.
 * Layout: "index" → [{ id, name, updatedAt }], "project:<id>" → full project,
 * "pref:<key>" → UI preference.
 */
export class Storage {
  constructor(adapter = new LocalStorageAdapter()) {
    this.adapter = adapter;
  }

  async listProjects() {
    const index = (await this.adapter.get('index')) || [];
    return [...index].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  async getProject(id) {
    return this.adapter.get(`project:${id}`);
  }

  async saveProject(project) {
    project.updatedAt = Date.now();
    await this.adapter.set(`project:${project.id}`, project);
    const index = (await this.adapter.get('index')) || [];
    const entry = { id: project.id, name: project.name, updatedAt: project.updatedAt };
    const i = index.findIndex((p) => p.id === project.id);
    if (i >= 0) index[i] = entry; else index.push(entry);
    await this.adapter.set('index', index);
    return project;
  }

  /** Small per-device UI preferences (e.g. theme). */
  async getPreference(key) {
    return this.adapter.get(`pref:${key}`);
  }

  async setPreference(key, value) {
    await this.adapter.set(`pref:${key}`, value);
  }

  async deleteProject(id) {
    await this.adapter.remove(`project:${id}`);
    const index = (await this.adapter.get('index')) || [];
    await this.adapter.set('index', index.filter((p) => p.id !== id));
  }
}
