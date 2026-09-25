import { el, numberInput, debounce, confirmDelete, icon } from './format.js';
import { Models } from './Models.js';
import { StrategyView } from './StrategyView.js';
import { REFERENCE_RATES as REF } from './referenceRates.js';

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
        hint && this.expandableNote('hint', hint));

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
        setting('Discount rate', 'discountRate',
          `Used only for present-value calculations. Typically 6–10% (8% is common); `
          + `the risk-free 10-yr Treasury yields ≈ ${REF.treasury10y.toFixed(1)}%.`),
        setting('S&P 500 return', 'sp500Rate',
          `25-yr average: ${REF.sp500Avg25y.toFixed(1)}% per year `
          + `(${REF.sp500Period}, compounded, dividends reinvested).`),
        setting('Loan interest rate', 'loanRate',
          `U.S. prime rate: ${REF.primeNow.toFixed(2)}% today; `
          + `25-yr average ${REF.primeAvg25y.toFixed(1)}%. Consumer loans typically price above prime.`),
        setting('Default timespan', 'defaultYears', 'Applies to opportunities set to Default.', {
          suffix: 'yrs',
          rule: { min: 1, integer: true, message: 'Timespan must be a whole number of years ≥ 1' },
        }),
        this.expandableNote('settings-note',
          `Reference figures as of ${REF.asOf}, for context only; they don't change your inputs. Sources: `,
          ...REF.sources.flatMap((src, i) => [
            i ? ', ' : '',
            el('a', { href: src.url, target: '_blank', rel: 'noopener noreferrer' }, src.label),
          ]),
          '.')),
      this.saveError,
      this.datalist,
      this.strategyList,
      el('button', {
        class: 'btn add-btn add-strategy',
        onclick: () => {
          project.strategies.push(Models.strategy());
          ctx.structureChanged();
        },
      }, icon('plus'), 'Add strategy'));

    this.watchSettingsBar();
    this.renderStrategies();
    return this.root;
  }

  /**
   * A note shown on one line; when it doesn't fit, it ends in "…" with a "+" toggle
   * that expands it in place ("−" collapses it).
   */
  expandableNote(className, ...content) {
    const text = el('span', { class: 'note-text' }, ...content);
    const toggle = el('button', {
      type: 'button',
      class: 'note-toggle',
      'aria-expanded': 'false',
      'aria-label': 'Show more',
      title: 'Show more',
      onclick: (e) => {
        e.preventDefault(); // notes sit inside <label>s; don't focus the input
        const open = !root.classList.contains('is-open');
        root.classList.toggle('is-open', open);
        toggle.textContent = open ? '−' : '+';
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Show less' : 'Show more');
        toggle.title = open ? 'Show less' : 'Show more';
      },
    }, '+');
    const root = el('span', { class: `note ${className}` }, text, toggle);
    // Only offer "+" when the single line is actually cut off.
    const measure = () => {
      if (!root.classList.contains('is-open')) {
        root.classList.toggle('is-truncated', text.scrollWidth > text.clientWidth + 1);
      }
    };
    this.noteObserver ??= new ResizeObserver((entries) => entries.forEach((en) => en.target.measure()));
    text.measure = measure;
    this.noteObserver.observe(text);
    return root;
  }

  /** Hide the Assumptions notes while the bar is pinned to the top, so it stays compact. */
  watchSettingsBar() {
    const bar = this.root.querySelector('.settings-bar');
    const sentinel = el('div', { class: 'settings-sentinel', 'aria-hidden': 'true' });
    bar.before(sentinel);
    this.stickyObserver = new IntersectionObserver(([entry]) => {
      bar.classList.toggle('is-stuck', !entry.isIntersecting);
    }, { rootMargin: '-12px 0px 0px 0px' });
    this.stickyObserver.observe(sentinel);
  }

  renderStrategies() {
    const { project, ctx } = this;
    this.children = project.strategies.map((strategy, i) => new StrategyView(strategy, ctx, {
      position: i + 1,
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
    this.stickyObserver?.disconnect();
    this.noteObserver?.disconnect();
    window.removeEventListener('pagehide', this.onPageHide);
  }
}
