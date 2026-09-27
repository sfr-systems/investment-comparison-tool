import { el, formatUSD, showPV, confirmDelete, icon } from './format.js';
import { Models } from './Models.js';
import { Calculator } from './Calculator.js';
import { OpportunityView } from './OpportunityView.js';
import { Risk } from './Risk.js';

/** Totals footer groupings; `sg.totalsBy` saves the choice (individual by default). */
const TOTALS_BY = [
  { key: 'individual', label: 'Individual', caption: 'Present value by individual' },
  { key: 'opportunity', label: 'Source', caption: 'Present value by income source' },
];

/** Collapsible sub group: income sources (opportunities) + a PV footer by individual or by source. */
export class SubGroupView {
  constructor(subGroup, ctx, { onDelete }) {
    this.sg = subGroup;
    this.ctx = ctx;
    this.onDelete = onDelete;
    this.children = [];
  }

  render() {
    const { sg, ctx } = this;

    const title = el('input', {
      type: 'text', class: 'title-input', value: sg.title, placeholder: 'Sub group title',
      'aria-label': 'Sub group title',
      oninput: () => { sg.title = title.value; this.syncTotalLabel(); ctx.changed({ light: true }); },
    });

    this.toggle = el('button', {
      class: 'icon-btn collapse-btn', 'aria-label': 'Toggle sub group',
      onclick: () => {
        sg.collapsed = !sg.collapsed;
        this.syncCollapsed();
        ctx.changed({ light: true });
      },
    }, icon('chevron'));

    this.headerTotal = el('span', { class: 'header-total' });
    this.riskEl = Risk.indicator('risk-compact');
    this.list = el('div', { class: 'opportunity-list' });
    // Reads as "Present value by [Individual | Source]".
    const totalsCaption = el('div', { class: 'eyebrow totals-caption' }, 'Present value by');
    this.totalsRows = el('div', { class: 'totals-rows' });
    this.footer = el('div', { class: 'subgroup-totals' },
      el('div', { class: 'totals-head' }, totalsCaption, this.totalsByToggle()),
      this.totalsRows);

    this.children = sg.opportunities.map((opp) => {
      const view = new OpportunityView(opp, ctx, {
        onDelete: () => {
          if (!confirmDelete('income source', opp.title)) return;
          sg.opportunities = sg.opportunities.filter((o) => o !== opp);
          ctx.structureChanged();
        },
      });
      this.list.append(view.render());
      return view;
    });
    if (!sg.opportunities.length) {
      this.list.append(el('p', { class: 'empty' }, 'No income sources yet.'));
    }

    this.root = el('section', { class: 'subgroup' },
      el('header', { class: 'subgroup-header' },
        this.toggle, title, this.riskEl, this.headerTotal,
        el('button', {
          class: 'icon-btn danger', title: 'Delete sub group', 'aria-label': 'Delete sub group',
          onclick: () => this.onDelete(),
        }, icon('trash'))),
      el('div', { class: 'subgroup-body' },
        this.list,
        el('button', {
          class: 'btn add-btn',
          onclick: () => {
            sg.opportunities.push(Models.opportunity());
            ctx.structureChanged();
          },
        }, icon('plus'), 'Add Income Source'),
        this.footer));

    this.syncCollapsed();
    this.update();
    return this.root;
  }

  /** [Individual | Source] toggle for the totals footer. */
  totalsByToggle() {
    const { sg, ctx } = this;
    const group = el('div', { class: 'unit-toggle totals-by', role: 'radiogroup', 'aria-label': 'Summarize by' });
    const buttons = TOTALS_BY.map((m) => el('button', {
      type: 'button', class: 'unit-option', role: 'radio', title: m.caption,
      onclick: () => {
        if ((sg.totalsBy ?? 'individual') === m.key) return;
        sg.totalsBy = m.key;
        this.update();
        ctx.changed({ light: true });
      },
    }, m.label));
    this.syncTotalsBy = () => buttons.forEach((b, i) => {
      const on = TOTALS_BY[i].key === (sg.totalsBy ?? 'individual');
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    group.addEventListener('keydown', (e) => {
      const i = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: 0, ArrowUp: 0 }[e.key];
      if (i == null) return;
      e.preventDefault();
      buttons[i].click();
      buttons[i].focus();
    });
    group.append(...buttons);
    return group;
  }

  /** The grand total is labeled with the sub group's title once it's been named. */
  syncTotalLabel() {
    const name = (this.sg.title || '').trim();
    const named = name && name !== Models.DEFAULT_SUBGROUP_TITLE;
    this.totalLabel.textContent = named ? name : 'Sub group total';
    this.totalLabel.title = named ? `${name} total` : '';
  }

  syncCollapsed() {
    this.root.classList.toggle('collapsed', !!this.sg.collapsed);
    this.toggle.setAttribute('aria-expanded', String(!this.sg.collapsed));
  }

  update() {
    this.children.forEach((c) => c.update());
    const { byIndividual, total } = Calculator.subGroupTotals(this.sg, this.ctx.project.settings);
    showPV(this.headerTotal, total);
    Risk.render(this.riskEl, this.sg.opportunities, this.ctx.project.settings);
    const amount = (pv) => showPV(el('span', { class: pv < -0.005 ? 'negative' : '' }), pv);
    const by = TOTALS_BY.find((m) => m.key === this.sg.totalsBy) ?? TOTALS_BY[0];
    this.syncTotalsBy();
    const settings = this.ctx.project.settings;
    const labels = Models.opportunityLabels(this.sg.opportunities);
    const lines = by.key === 'opportunity'
      ? this.sg.opportunities.map((opp, i) => [labels[i], Calculator.opportunityPV(opp, settings)])
      : byIndividual;
    const rows = lines.map(([name, pv]) =>
      el('div', { class: 'total-row' }, el('span', { title: name }, name), amount(pv)));
    // The one place the exact (unrounded) present value is shown.
    rows.push(el('div', { class: 'total-row grand' },
      this.totalLabel = el('span', {}),
      el('span', { class: total < -0.005 ? 'negative' : '' }, formatUSD(total))));
    this.headerTotal.classList.toggle('negative', total < -0.005);
    this.totalsRows.replaceChildren(...rows);
    this.syncTotalLabel();
  }
}
