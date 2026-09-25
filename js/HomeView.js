import { el, confirmDelete, icon } from './format.js';
import { Models } from './Models.js';

/** Home page: create, open, and delete projects. */
export class HomeView {
  constructor(storage, router) {
    this.storage = storage;
    this.router = router;
  }

  render() {
    const nameInput = el('input', {
      type: 'text', placeholder: 'Untitled Project', 'aria-label': 'New project name', maxLength: 120,
    });
    const form = el('form', {
      class: 'new-project',
      onsubmit: async (e) => {
        e.preventDefault();
        const project = Models.project(nameInput.value);
        await this.storage.saveProject(project);
        this.router.navigate(`/project/${project.id}`);
      },
    }, nameInput, el('button', { type: 'submit', class: 'btn primary' }, icon('plus'), 'New Project'));

    this.list = el('ul', { class: 'project-list' });
    this.count = el('span', { class: 'count' });
    this.root = el('div', { class: 'home-page' },
      el('section', { class: 'hero' },
        el('span', { class: 'eyebrow' }, 'Present value analysis'),
        el('h1', {}, 'Compare investment strategies'),
        el('p', {}, 'Model opportunities side by side and see what each strategy is worth in today’s dollars.'),
        form),
      el('div', { class: 'section-head' },
        el('h2', { class: 'eyebrow' }, 'Projects'),
        this.count),
      this.list);
    this.loadList();
    return this.root;
  }

  async loadList() {
    const projects = await this.storage.listProjects();
    this.count.textContent = projects.length ? `${projects.length} ${projects.length === 1 ? 'project' : 'projects'}` : '';
    if (!projects.length) {
      this.list.replaceChildren(el('li', { class: 'empty' }, 'No projects yet.'));
      return;
    }
    this.list.replaceChildren(...projects.map((p) => el('li', { class: 'project-item' },
      el('a', { href: `#/project/${encodeURIComponent(p.id)}`, class: 'project-link' },
        el('span', { class: 'project-mono', 'aria-hidden': 'true' }, (p.name || '?').trim().charAt(0).toUpperCase()),
        el('span', { class: 'project-text' },
          el('span', { class: 'project-name' }, p.name),
          el('span', { class: 'project-date' },
            p.updatedAt ? `Updated ${new Date(p.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : '')),
        el('span', { class: 'project-open' }, el('span', {}, 'Open'), icon('arrowRight'))),
      el('button', {
        class: 'btn danger-outline',
        onclick: async () => {
          if (!confirmDelete('project', p.name)) return;
          await this.storage.deleteProject(p.id);
          this.loadList();
        },
      }, 'Delete'))));
  }
}
