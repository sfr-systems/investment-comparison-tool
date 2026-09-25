import { el, numberInput, debounce, confirmDelete, icon } from './format.js';
import { Models } from './Models.js';
import { StrategyView } from './StrategyView.js';

/** Project page: settings bar + stacked strategies. Owns saving and live recalculation. */
export class ProjectView {
  constructor(project, storage) {
    this.project = Models.upgradeProject(project);
    this.storage = storage;
    this.children = [];
    this.save = debounce(() => {
      this.storage.saveProject(this.project).catch(() => this.showSaveError());
    }, 400);
    this.onPageHide = () => this.save.flush();
    window.addEventListener('pagehide', this.onPageHide);

    // Context shared with all descendant views.
    this.ctx = {
      project,
      datalistId: `individuals-${project.id}`,
      /** Value changed: save, and recalc unless it was a cosmetic (title/collapse) edit. */
      changed: ({ light = false } = {}) => {
        this.save();
        if (!light) this.refresh();
      },
      /** Items added/removed: save and rebuild the strategy list. */
      structureChanged: () => {
        this.save();
        this.renderStrategies();
      },
    };
  }

  render() {
    const { project, ctx } = this;
    const s = project.settings;

    const name = el('input', {
      type: 'text', class: 'title-input project-title', value: project.name,
      placeholder: 'Untitled Project', 'aria-label': 'Project name',
      oninput: () => { project.name = name.value.trim() || 'Untitled Project'; ctx.changed({ light: true }); },
    });

    const rateRule = { greaterThan: -100, message: 'Enter a rate greater than -100%' };
    const setting = (label, key, hint, { suffix = '%', rule = rateRule } = {}) =>
      el('label', { class: 'field setting' },
        el('span', { class: 'field-label' }, label),
        el('span', { class: suffix.length > 1 ? 'with-suffix suffix-wide' : 'with-suffix' },
          numberInput({
            value: s[key], emptyAs: null, 'aria-label': label, ...rule,
            onValue: (n) => { s[key] = n; ctx.changed(); },
          }),
          el('span', { class: 'suffix' }, suffix)),
        hint && el('span', { class: 'hint' }, hint));

    this.datalist = el('datalist', { id: ctx.datalistId });
    this.strategyList = el('div', { class: 'strategy-list' });
    this.saveError = el('div', { class: 'save-error', hidden: true },
      'Could not save changes to browser storage.');

    this.root = el('div', { class: 'project-page' },
      el('div', { class: 'project-top' },
        el('a', { href: '#/', class: 'back-link' }, icon('arrowLeft'), 'All projects'),
        name),
      el('div', { class: 'settings-bar', role: 'group', 'aria-label': 'Project settings' },
        el('div', { class: 'settings-title' },
          el('strong', {}, 'Assumptions'),
          el('span', {}, 'Applied to every opportunity')),
        setting('Discount rate', 'discountRate', 'Discounts all cash flows'),
        setting('S&P 500 return', 'sp500Rate', 'Linked standard rate'),
        setting('Loan interest rate', 'loanRate', 'Linked standard rate'),
        setting('Default timespan', 'defaultYears', 'Linked default timespan', {
          suffix: 'yrs',
          rule: { min: 1, integer: true, message: 'Timespan must be a whole number of years ≥ 1' },
        })),
      this.saveError,
      this.datalist,
      this.strategyList,
      el('button', {
        class: 'btn add-btn add-strategy',
        onclick: () => {
          project.strategies.push(Models.strategy(`Strategy ${project.strategies.length + 1}`));
          ctx.structureChanged();
        },
      }, icon('plus'), 'Add strategy'));

    this.renderStrategies();
    return this.root;
  }

  renderStrategies() {
    const { project, ctx } = this;
    this.children = project.strategies.map((strategy) => new StrategyView(strategy, ctx, {
      onDelete: () => {
        if (!confirmDelete('strategy', strategy.title)) return;
        project.strategies = project.strategies.filter((s) => s !== strategy);
        ctx.structureChanged();
      },
    }));
    const nodes = this.children.map((c) => c.render());
    if (!nodes.length) {
      nodes.push(el('p', { class: 'empty big' }, 'No strategies yet. Add one to start comparing.'));
    }
    this.strategyList.replaceChildren(...nodes);
    this.refreshIndividuals();
  }

  /** Recompute every PV readout and linked rate label in place (keeps input focus). */
  refresh() {
    this.children.forEach((c) => c.update());
    this.refreshIndividuals();
  }

  refreshIndividuals() {
    const names = new Set();
    for (const st of this.project.strategies)
      for (const sg of st.subGroups)
        for (const opp of sg.opportunities) {
          const n = (opp.individual || '').trim();
          if (n) names.add(n);
        }
    this.datalist.replaceChildren(...[...names].sort().map((n) => el('option', { value: n })));
  }

  showSaveError() {
    this.saveError.hidden = false;
  }

  destroy() {
    this.save.flush();
    window.removeEventListener('pagehide', this.onPageHide);
  }
}
