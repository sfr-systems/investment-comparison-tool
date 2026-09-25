import { Storage, LocalStorageAdapter } from './Storage.js';
import { Router } from './Router.js';
import { HomeView } from './HomeView.js';
import { ProjectView } from './ProjectView.js';
import { ThemeToggle } from './ThemeToggle.js';

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

  start() {
    this.router.resolve();
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
