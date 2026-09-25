import { el, numberInput, showPV, icon, setValidity } from './format.js';
import { RateSelector } from './RateSelector.js';
import { Calculator } from './Calculator.js';
import { Models } from './Models.js';
import { Risk } from './Risk.js';

const BREAKDOWN_LABELS = {
  loan: 'Loan',
  initial: 'Investment',
  initialPayout: 'Initial payout',
  yearlyReturn: 'Returns',
  salary: 'Salary',
  payout: 'Final payout',
};

/** One opportunity card: inputs + live PV. */
export class OpportunityView {
  constructor(opp, ctx, { onDelete }) {
    this.opp = Models.upgradeOpportunity(opp);
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
        el('div', { class: 'field' },
          el('span', { class: 'field-label' }, 'Timespan'),
          this.timespanSelector()),
        el('div', { class: 'field risk-field' },
          el('span', { class: 'field-label' }, 'Risk'),
          Risk.toggle(opp, () => ctx.changed()))),
      el('div', { class: 'opp-grid' },
        this.indefiniteNote = el('p', { class: 'indefinite-note', role: 'note', hidden: true }),
        this.amountWithRate('Loan amount', opp.loan, 'Loan interest rate', 'loan'),
        this.amountWithRate('Initial investment', opp.initial, 'Growth rate', 'lump'),
        this.initialPayoutGroup(opp.initialPayout),
        this.amountWithRate('Yearly return', opp.yearlyReturn, 'Growth rate', 'stream'),
        this.amountWithRate('Yearly salary', opp.salary, 'Growth rate', 'stream'),
        this.finalPayoutField = this.field('Final payout (one-time)',
          this.amountInput(opp.payout, (n) => { opp.payout = n; }, 'Final payout (one-time)'))),
      el('footer', { class: 'opp-footer' },
        el('div', { class: 'pv' }, el('span', { class: 'pv-label' }, 'Present value'), this.pvEl),
        this.warningEl = el('p', { class: 'pv-warning', hidden: true }),
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

  /** kind: 'lump' (one-time growth), 'stream' (yearly growth) or 'loan' (interest rate). */
  amountWithRate(label, group, rateLabel, kind) {
    const selector = new RateSelector(group.rate, this.ctx, { label: `${label} ${rateLabel.toLowerCase()}` });
    selector.kind = kind;
    this.rateSelectors.push(selector);
    return el('div', { class: 'field-group' },
      this.field(label, this.amountInput(group.amount, (n) => { group.amount = n; }, label)),
      el('div', { class: 'field' },
        el('span', { class: 'field-label' }, rateLabel),
        selector.render()));
  }

  /** Amount + "invest it" checkbox; the growth rate only shows while invested. */
  initialPayoutGroup(group) {
    const label = 'Initial payout (one-time)';
    const selector = new RateSelector(group.rate, this.ctx, { label: `${label} growth rate` });
    selector.kind = 'lump';
    this.rateSelectors.push(selector);

    const root = el('div', { class: 'field-group payout-group' });
    const sync = () => root.classList.toggle('is-invested', !!group.invest);
    const checkbox = this.payoutCheckbox = el('input', {
      type: 'checkbox',
      checked: !!group.invest,
      onchange: () => { group.invest = checkbox.checked; sync(); this.ctx.changed(); },
    });

    root.append(
      this.field(label, this.amountInput(group.amount, (n) => { group.amount = n; }, label)),
      el('div', { class: 'field payout-rate' },
        el('span', { class: 'field-label' }, 'Growth rate'),
        selector.render()),
      el('label', { class: 'checkbox' }, checkbox,
        el('span', {}, 'Invest for the remainder of the timespan')));
    sync();
    return root;
  }

  /** [Default (N yrs) | Custom] — default follows the project's default timespan. */
  timespanSelector() {
    const { opp, ctx } = this;
    const years = numberInput({
      value: opp.years, min: 1, integer: true, emptyAs: null,
      message: 'Timespan must be a whole number of years ≥ 1',
      'aria-label': 'Custom timespan (years)',
      onValue: (n) => { opp.years = n; ctx.changed(); },
    });
    this.defaultYearsOption = el('option', { value: 'default' });
    const select = el('select', {
      'aria-label': 'Timespan',
      onchange: () => {
        opp.yearsMode = select.value;
        if (opp.yearsMode === 'custom') {
          // Start the custom value from the default the user was just seeing.
          opp.years = Calculator.resolveYears({ yearsMode: 'default' }, ctx.project.settings);
          years.value = String(opp.years);
          setValidity(years, true);
        }
        root.classList.toggle('is-custom', opp.yearsMode === 'custom');
        ctx.changed();
      },
    }, this.defaultYearsOption, el('option', { value: 'custom' }, 'Custom'),
    el('option', { value: 'indefinite' }, 'Indefinite (∞)'));
    select.value = ['default', 'indefinite'].includes(opp.yearsMode) ? opp.yearsMode : 'custom';

    const root = el('div', { class: 'rate-selector timespan-selector' },
      select,
      el('span', { class: 'rate-custom-wrap' }, years, el('span', { class: 'suffix' }, 'yrs')));
    root.classList.toggle('is-custom', select.value === 'custom');
    return root;
  }

  update() {
    const n = Calculator.resolveYears({ yearsMode: 'default' }, this.ctx.project.settings);
    this.defaultYearsOption.textContent = `Default (${n} ${n === 1 ? 'yr' : 'yrs'})`;

    const b = Calculator.opportunityBreakdown(this.opp, this.ctx.project.settings);
    showPV(this.pvEl, b.total);
    this.pvEl.classList.toggle('negative', b.total < -0.005);

    // Indefinite timespan: the final payout never arrives, and some parts may not converge.
    const indefinite = this.opp.yearsMode === 'indefinite';
    this.root.classList.toggle('is-indefinite', indefinite);
    const payoutInput = this.finalPayoutField.querySelector('input');
    payoutInput.disabled = indefinite;
    this.finalPayoutField.title = indefinite ? 'Never received on an indefinite timespan' : '';

    // Indefinite: growth rates are fixed (see Calculator.opportunityBreakdown) and explained.
    const d = Number(this.ctx.project.settings.discountRate) || 0;
    this.rateSelectors.forEach((r) => {
      if (r.kind === 'lump') r.setLocked(indefinite ? `Discount rate (${d}%)` : null);
      if (r.kind === 'stream') r.setLocked(indefinite ? 'None (held constant)' : null);
    });
    this.payoutCheckbox.disabled = indefinite;
    this.indefiniteNote.hidden = !indefinite;
    if (indefinite) {
      this.indefiniteNote.replaceChildren(
        icon('alert', 'note-icon'),
        el('span', {},
          el('strong', {}, 'Growth rates below are fixed on an indefinite timespan. '),
          'Any growth at or above the discount rate would make the present value infinite, so '
          + `one-time amounts grow at the discount rate (${d}%), keeping their value in today's dollars, `
          + 'and yearly return and salary are held constant, valued as a perpetuity (amount ÷ discount rate). '
          + 'The final payout is never received. Your chosen rates are kept for when you pick a set timespan.'));
    }
    const unbounded = Object.entries(BREAKDOWN_LABELS)
      .filter(([key]) => !Number.isFinite(b[key])).map(([, label]) => label.toLowerCase());
    this.warningEl.hidden = !unbounded.length;
    if (unbounded.length) {
      this.warningEl.textContent = `Unbounded: with a discount rate of ${d}%, the ${unbounded.join(' and ')} `
        + `${unbounded.length > 1 ? 'have' : 'has'} no finite present value when ${unbounded.length > 1 ? 'they continue' : 'it continues'} forever. `
        + 'Use a discount rate above 0%, or a set timespan.';
    }
    this.breakdownEl.replaceChildren(...Object.entries(BREAKDOWN_LABELS)
      .filter(([key]) => Math.abs(b[key]) >= 0.005)
      .flatMap(([key, label]) => [el('dt', {}, label), showPV(el('dd'), b[key])]));
    this.rateSelectors.forEach((r) => r.update());
  }
}
