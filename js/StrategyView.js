import { el, formatUSD, confirmDelete, icon } from './format.js';
import { Models } from './Models.js';
import { Calculator } from './Calculator.js';
import { SubGroupView } from './SubGroupView.js';
import { Beacon } from './Beacon.js';

/** Collapsible strategy containing sub groups. */
export class StrategyView {
  constructor(strategy, ctx, { onDelete }) {
    this.strategy = strategy;
    this.ctx = ctx;
    this.onDelete = onDelete;
    this.children = [];
  }

  render() {
    const { strategy, ctx } = this;

    const title = el('input', {
      type: 'text', class: 'title-input strategy-title', value: strategy.title,
      placeholder: 'Strategy title', 'aria-label': 'Strategy title',
      oninput: () => { strategy.title = title.value; ctx.changed({ light: true }); },
    });

    this.toggle = el('button', {
      class: 'icon-btn collapse-btn', 'aria-label': 'Toggle strategy',
      onclick: () => {
        strategy.collapsed = !strategy.collapsed;
        this.syncCollapsed();
        ctx.changed({ light: true });
      },
    }, icon('chevron'));

    this.totalEl = el('span', { class: 'header-total' });
    const body = el('div', { class: 'strategy-body' });

    this.children = strategy.subGroups.map((sg) => {
      const view = new SubGroupView(sg, ctx, {
        onDelete: () => {
          if (!confirmDelete('sub group', sg.title)) return;
          strategy.subGroups = strategy.subGroups.filter((s) => s !== sg);
          ctx.structureChanged();
        },
      });
      body.append(view.render());
      return view;
    });
    if (!strategy.subGroups.length) {
      body.append(el('p', { class: 'empty' }, 'No sub groups yet.'));
    }
    body.append(el('button', {
      class: 'btn add-btn',
      onclick: () => {
        strategy.subGroups.push(Models.subGroup());
        ctx.structureChanged();
      },
    }, icon('plus'), 'Add sub group'));

    const beacon = Beacon.describe(strategy.beacon);
    this.root = el('section', { class: 'strategy' },
      el('header', { class: 'strategy-header', dataset: { numeral: beacon.numeral } },
        this.toggle,
        title,
        el('span', { class: 'header-total-wrap' }, el('span', { class: 'eyebrow' }, 'Total present value'), this.totalEl),
        el('button', {
          class: 'icon-btn danger', title: 'Delete strategy', 'aria-label': 'Delete strategy',
          onclick: () => this.onDelete(),
        }, icon('trash'))),
      body);

    // The badge straddles the strategy's top border, so it lives on an outer wrapper
    // (the strategy itself clips its content to its rounded corners).
    const wrapper = el('div', { class: 'strategy-wrap' }, Beacon.badge(strategy.beacon), this.root);
    Beacon.paint(wrapper, strategy.beacon);
    this.syncCollapsed();
    this.update();
    return wrapper;
  }

  syncCollapsed() {
    this.root.classList.toggle('collapsed', !!this.strategy.collapsed);
    this.toggle.setAttribute('aria-expanded', String(!this.strategy.collapsed));
  }

  update() {
    this.children.forEach((c) => c.update());
    const total = Calculator.strategyTotal(this.strategy, this.ctx.project.settings);
    this.totalEl.textContent = formatUSD(total);
    this.totalEl.classList.toggle('negative', total < -0.005);
  }
}
