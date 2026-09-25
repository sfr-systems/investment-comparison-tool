import { el, showPV, confirmDelete, icon } from './format.js';
import { Models } from './Models.js';
import { Calculator } from './Calculator.js';
import { SubGroupView } from './SubGroupView.js';
import { Beacon } from './Beacon.js';
import { Risk } from './Risk.js';

/** Collapsible strategy containing sub groups. */
export class StrategyView {
  constructor(strategy, ctx, { position, count, onMove, onDelete }) {
    this.strategy = strategy;
    this.position = position; // 1-based order in the project; drives the beacon numeral/color
    this.count = count;
    this.onMove = onMove;
    this.ctx = ctx;
    this.onDelete = onDelete;
    this.children = [];
  }

  render() {
    const { strategy, ctx } = this;

    const title = el('input', {
      type: 'text', class: 'title-input strategy-title', value: strategy.title,
      placeholder: 'Strategy title', 'aria-label': 'Strategy title',
      oninput: () => { strategy.title = title.value; fitTitle(); ctx.changed({ light: true }); },
    });
    // Browsers without CSS field-sizing: approximate a content-width box via `size`.
    const fitTitle = () => {
      if (!CSS.supports('field-sizing', 'content')) title.size = Math.max(title.value.length, 8) + 1;
    };
    fitTitle();

    const toggleCollapsed = () => {
      strategy.collapsed = !strategy.collapsed;
      this.syncCollapsed();
      ctx.changed({ light: true });
    };
    this.toggle = el('button', {
      class: 'icon-btn collapse-btn', 'aria-label': 'Toggle strategy',
      onclick: toggleCollapsed,
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

    const beacon = Beacon.describe(this.position);
    this.root = el('section', { class: 'strategy' },
      el('header', {
        class: 'strategy-header',
        dataset: { numeral: beacon.numeral },
        // The whole header toggles, except its controls (title input, delete, the arrow itself).
        onclick: (e) => {
          if (e.target.closest('input, button, a, select, textarea')) return;
          if (window.getSelection()?.toString()) return; // don't toggle after selecting text
          toggleCollapsed();
        },
      },
        this.toggle,
        title,
        this.riskWrap = el('span', { class: 'strategy-risk' },
          el('span', { class: 'eyebrow' }, 'Overall risk'),
          this.riskEl = Risk.indicator()),
        el('span', { class: 'header-total-wrap' }, el('span', { class: 'eyebrow' }, 'Total present value'), this.totalEl),
        el('button', {
          class: 'icon-btn danger', title: 'Delete strategy', 'aria-label': 'Delete strategy',
          onclick: () => this.onDelete(),
        }, icon('trash'))),
      body);

    // The badge straddles the strategy's top border, so it lives on an outer wrapper
    // (the strategy itself clips its content to its rounded corners).
    const wrapper = el('div', { class: 'strategy-wrap' },
      Beacon.badge(this.position), this.moveControls(), this.root);
    this.wrapper = wrapper;
    Beacon.paint(wrapper, this.position);
    this.syncCollapsed();
    this.update();
    return wrapper;
  }

  /** Up/down arrows on the left edge, shown on hover/focus; omitted where a move isn't possible. */
  moveControls() {
    this.moveButtons = {};
    const button = (dir, label, glyph) => el('button', {
      type: 'button', class: 'move-btn', title: label, 'aria-label': label,
      onclick: () => this.onMove(dir),
    }, icon(glyph));
    if (this.position > 1) this.moveButtons.up = button(-1, 'Move strategy up', 'chevronUp');
    if (this.position < this.count) this.moveButtons.down = button(1, 'Move strategy down', 'chevron');
    const buttons = Object.values(this.moveButtons);
    return buttons.length ? el('div', { class: 'strategy-move' }, ...buttons) : null;
  }

  /** Brief highlight after the strategy is moved. */
  flash() {
    this.wrapper.classList.remove('just-moved');
    void this.wrapper.offsetWidth; // restart the animation
    this.wrapper.classList.add('just-moved');
  }

  syncCollapsed() {
    this.root.classList.toggle('collapsed', !!this.strategy.collapsed);
    this.toggle.setAttribute('aria-expanded', String(!this.strategy.collapsed));
  }

  update() {
    this.children.forEach((c) => c.update());
    const total = Calculator.strategyTotal(this.strategy, this.ctx.project.settings);
    showPV(this.totalEl, total);
    Risk.render(this.riskEl, this.strategy.subGroups.flatMap((sg) => sg.opportunities),
      this.ctx.project.settings);
    this.riskWrap.hidden = this.riskEl.hidden;
    this.totalEl.classList.toggle('negative', total < -0.005);
  }
}
