import { Storage, LocalStorageAdapter } from './Storage.js';
import { Router } from './Router.js';
import { HomeView } from './HomeView.js';
import { ProjectView } from './ProjectView.js';
import { ThemeToggle } from './ThemeToggle.js';
import { SampleProject } from './SampleProject.js';
import { ProjectSync } from './ProjectSync.js';
import { SyncControl } from './SyncControl.js';
import { el } from './format.js';

const REFRESH_EVERY = 2 * 60 * 1000; // pick up other devices' changes while the page stays open

class App {
  constructor(root) {
    this.root = root;
    this.storage = new Storage(new LocalStorageAdapter());
    this.router = new Router();
    this.view = null;

    this.sync = new ProjectSync(this.storage, {
      beforeSync: () => this.view?.flushSave?.(),
      isEditing: (id) => this.view instanceof ProjectView && this.view.project.id === id && this.view.hasPendingSave(),
    });
    this.syncControl = new SyncControl(this.sync);
    this.sync.on('remote-change', ({ ids }) => this.onRemoteChange(ids));
    this.sync.on('conflict', ({ name, copyName }) => this.syncControl.toast(
      `“${name}” was changed on two devices. Both versions are kept: this device’s is “${copyName}”.`));

    const actions = el('div', { class: 'app-bar-actions' });
    document.querySelector('.app-bar-inner').append(actions);
    this.syncControl.mount(actions);
    new ThemeToggle(this.storage).mount(actions);

    this.router
      .on('/', () => this.mount(new HomeView(this.storage, this.router, this.syncControl)))
      .on('/project/:id', ({ id }) => this.openProject(id))
      .otherwise(() => this.router.navigate('/'));
  }

  async start() {
    await this.seedSample();
    this.router.resolve();
    this.watchForSync();
    await this.sync.start();
  }

  /** Sync when the page comes back into view, goes away, or reconnects, and every so often. */
  watchForSync() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.sync.flush();
      else this.sync.refresh();
    });
    window.addEventListener('pagehide', () => this.sync.flush());
    window.addEventListener('focus', () => this.sync.refresh());
    window.addEventListener('online', () => this.sync.syncNow());
    setInterval(() => {
      if (document.visibilityState === 'visible') this.sync.refresh();
    }, REFRESH_EVERY);
  }

  /** First visit only: give new visitors the sample project to explore. */
  async seedSample() {
    if (await this.storage.getPreference('sampleSeeded')) return;
    const existing = await this.storage.listProjects();
    if (!existing.length) await this.storage.saveProject(SampleProject.create());
    await this.storage.setPreference('sampleSeeded', true);
  }

  async openProject(id) {
    this.view?.destroy?.();
    this.view = null;
    const project = await this.storage.getProject(id);
    if (!project) {
      this.router.navigate('/');
      return;
    }
    this.mount(new ProjectView(project, this.storage));
  }

  /** Projects changed by another device were just applied here: refresh what's on screen. */
  async onRemoteChange(ids) {
    const view = this.view;
    if (view instanceof HomeView) {
      view.loadList();
    } else if (view instanceof ProjectView && ids.has(view.project.id)) {
      const project = await this.storage.getProject(view.project.id);
      if (this.view !== view) return;
      if (!project) {
        this.syncControl.toast(`“${view.project.name}” was deleted on another device.`);
        this.router.navigate('/');
        return;
      }
      this.mount(new ProjectView(project, this.storage), { keepScroll: true });
      this.syncControl.toast('Updated with changes from another device.');
    }
  }

  mount(view, { keepScroll = false } = {}) {
    this.view?.destroy?.();
    this.view = view;
    this.root.replaceChildren(view.render());
    if (!keepScroll) window.scrollTo(0, 0);
  }
}

new App(document.getElementById('app')).start();
