import { Storage, LocalStorageAdapter } from './Storage.js';
import { Router } from './Router.js';
import { HomeView } from './HomeView.js';
import { ProjectView } from './ProjectView.js';
import { ThemeToggle } from './ThemeToggle.js';
import { SampleProject } from './SampleProject.js';

class App {
  constructor(root) {
    this.root = root;
    this.storage = new Storage(new LocalStorageAdapter());
    this.router = new Router();
    this.view = null;
    new ThemeToggle(this.storage).mount(document.querySelector('.app-bar-inner'));

    this.router
      .on('/', () => this.mount(new HomeView(this.storage, this.router)))
      .on('/project/:id', ({ id }) => this.openProject(id))
      .otherwise(() => this.router.navigate('/'));
  }

  async start() {
    await this.seedSample();
    this.router.resolve();
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

  mount(view) {
    this.view?.destroy?.();
    this.view = view;
    this.root.replaceChildren(view.render());
    window.scrollTo(0, 0);
  }
}

new App(document.getElementById('app')).start();
