import { el, numberInput, formatUSD, icon } from './format.js';
import { RateSelector } from './RateSelector.js';
import { Calculator } from './Calculator.js';

const BREAKDOWN_LABELS = {
  initial: 'Investment',
  yearlyReturn: 'Returns',
  salary: 'Salary',
  payout: 'Payout',
  loan: 'Loan',
};

/** One opportunity card: inputs + live PV. */
export class OpportunityView {
  constructor(opp, ctx, { onDelete }) {
    this.opp = opp;
    this.ctx = ctx;
    this.onDelete = onDelete;
    this.rateSelectors = [];
  }

  render() {
    const { opp, ctx } = this;

    const title = el('input', {
      type: 'text', class: 'title-input', value: opp.title, placeholder: 'Opportunity title',
      'aria-label': 'Opportunity title',
      oninput: () => { opp.title = title.value; ctx.changed({ light: true }); },
    });

    const individual = el('input', {
      type: 'text', value: opp.individual, placeholder: 'Unassigned',
      'aria-label': 'Individual', autocomplete: 'off',
      oninput: () => { opp.individual = individual.value; ctx.changed(); },
    });
    individual.setAttribute('list', ctx.datalistId);

    const years = numberInput({
      value: opp.years, min: 1, integer: true, emptyAs: null,
      message: 'Timespan must be a whole number of years ≥ 1',
      'aria-label': 'Timespan (years)',
      onValue: (n) => { opp.years = n; ctx.changed(); },
    });

    this.pvEl = el('div', { class: 'pv-value' });
    this.breakdownEl = el('dl', { class: 'pv-breakdown' });

    this.root = el('article', { class: 'opportunity' },
      el('header', { class: 'opp-header' },
        title,
        el('button', {
          class: 'icon-btn danger', title: 'Delete opportunity', 'aria-label': 'Delete opportunity',
          onclick: () => this.onDelete(),
        }, icon('trash'))),
      el('div', { class: 'opp-meta' },
        this.field('Individual', individual),
        this.field('Timespan (years)', years)),
      el('div', { class: 'opp-grid' },
        this.amountWithRate('Initial investment', opp.initial, 'Growth rate'),
        this.amountWithRate('Yearly return', opp.yearlyReturn, 'Growth rate'),
        this.amountWithRate('Yearly salary', opp.salary, 'Growth rate'),
        this.field('One-time payout at end', this.amountInput(opp.payout, (n) => { opp.payout = n; }, 'One-time payout at end')),
        this.amountWithRate('Loan amount', opp.loan, 'Loan interest rate')),
      el('footer', { class: 'opp-footer' },
        el('div', { class: 'pv' }, el('span', { class: 'pv-label' }, 'Present value'), this.pvEl),
        this.breakdownEl));

    this.update();
    return this.root;
  }

  field(label, control) {
    return el('label', { class: 'field' }, el('span', { class: 'field-label' }, label), control);
  }

  amountInput(value, assign, label) {
    const input = numberInput({
      value, min: 0, class: 'amount', 'aria-label': label,
      message: 'Amount must be zero or positive',
      onValue: (n) => { assign(n); this.ctx.changed(); },
    });
    return el('span', { class: 'with-prefix' }, el('span', { class: 'prefix' }, '$'), input);
  }

  amountWithRate(label, group, rateLabel) {
    const selector = new RateSelector(group.rate, this.ctx, { label: `${label} ${rateLabel.toLowerCase()}` });
    this.rateSelectors.push(selector);
    return el('div', { class: 'field-group' },
      this.field(label, this.amountInput(group.amount, (n) => { group.amount = n; }, label)),
      el('div', { class: 'field' },
        el('span', { class: 'field-label' }, rateLabel),
        selector.render()));
  }

  update() {
    const b = Calculator.opportunityBreakdown(this.opp, this.ctx.project.settings);
    this.pvEl.textContent = formatUSD(b.total);
    this.pvEl.classList.toggle('negative', b.total < -0.005);
    this.breakdownEl.replaceChildren(...Object.entries(BREAKDOWN_LABELS)
      .filter(([key]) => Math.abs(b[key]) >= 0.005)
      .flatMap(([key, label]) => [el('dt', {}, label), el('dd', {}, formatUSD(b[key]))]));
    this.rateSelectors.forEach((r) => r.update());
  }
}
