import { el, formatUSD, showPV, confirmDelete, icon } from './format.js';
import { Models } from './Models.js';
import { Calculator } from './Calculator.js';
import { OpportunityView } from './OpportunityView.js';

/** Collapsible sub group: opportunities + per-individual PV footer. */
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
      oninput: () => { sg.title = title.value; ctx.changed({ light: true }); },
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
    this.list = el('div', { class: 'opportunity-list' });
    this.footer = el('div', { class: 'subgroup-totals' });

    this.children = sg.opportunities.map((opp) => {
      const view = new OpportunityView(opp, ctx, {
        onDelete: () => {
          if (!confirmDelete('opportunity', opp.title)) return;
          sg.opportunities = sg.opportunities.filter((o) => o !== opp);
          ctx.structureChanged();
        },
      });
      this.list.append(view.render());
      return view;
    });
    if (!sg.opportunities.length) {
      this.list.append(el('p', { class: 'empty' }, 'No opportunities yet.'));
    }

    this.root = el('section', { class: 'subgroup' },
      el('header', { class: 'subgroup-header' },
        this.toggle, title, this.headerTotal,
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
        }, icon('plus'), 'Add opportunity'),
        this.footer));

    this.syncCollapsed();
    this.update();
    return this.root;
  }

  syncCollapsed() {
    this.root.classList.toggle('collapsed', !!this.sg.collapsed);
    this.toggle.setAttribute('aria-expanded', String(!this.sg.collapsed));
  }

  update() {
    this.children.forEach((c) => c.update());
    const { byIndividual, total } = Calculator.subGroupTotals(this.sg, this.ctx.project.settings);
    showPV(this.headerTotal, total);
    const amount = (pv) => showPV(el('span', { class: pv < -0.005 ? 'negative' : '' }), pv);
    const rows = [el('div', { class: 'eyebrow totals-caption' }, 'Present value by individual')];
    rows.push(...byIndividual.map(([name, pv]) =>
      el('div', { class: 'total-row' }, el('span', {}, name), amount(pv))));
    // The one place the exact (unrounded) present value is shown.
    rows.push(el('div', { class: 'total-row grand' },
      el('span', {}, 'Sub group total'),
      el('span', { class: total < -0.005 ? 'negative' : '' }, formatUSD(total))));
    this.headerTotal.classList.toggle('negative', total < -0.005);
    this.footer.replaceChildren(...rows);
  }
}
