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
  payout: 'Final payout',
  salary: 'Salary',
  salaryInvested: 'Invested salary',
};

/** One opportunity card: inputs + live PV. */
export class OpportunityView {
  constructor(opp, ctx, { onDelete }) {
    this.opp = Models.upgradeOpportunity(opp, ctx.project.settings);
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
        this.indefiniteNote = this.buildIndefiniteNote(),
        this.amountWithRate('Loan amount', opp.loan, 'Loan interest rate', 'loan'),
        this.amountWithRate('Initial investment', opp.initial, 'Growth rate', 'lump'),
        this.initialPayoutGroup(opp.initialPayout),
        this.amountWithRate('Yearly return', opp.yearlyReturn, 'Growth rate', 'stream'),
        this.finalPayoutField = this.field('Final payout (one-time)',
          this.amountInput(opp.payout, (n) => { opp.payout = n; }, 'Final payout (one-time)')),

        this.salaryGroup(opp.salary)),
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

  /** Caution shown on indefinite timespans; its text is filled in by update(). */
  buildIndefiniteNote() {
    this.noteBody = el('span', { class: 'note-body' });
    const note = this.collapsibleNote({
      className: 'indefinite-note', iconName: 'alert', collapsedKey: 'indefiniteNoteCollapsed',
      heading: 'Growth rates below are fixed on an indefinite timespan. ', body: this.noteBody,
    });
    note.hidden = true;
    return note;
  }

  /**
   * Note with a bold heading and a body. Open by default; the chevron collapses it to its
   * heading line, and that choice is saved on the opportunity under `collapsedKey`.
   */
  collapsibleNote({ className, iconName, heading, body, collapsedKey }) {
    const { opp, ctx } = this;
    body.id = `${collapsedKey}-${opp.id}`;
    const toggle = el('button', {
      type: 'button', class: 'icon-btn note-toggle-btn', 'aria-controls': body.id,
      onclick: () => {
        opp[collapsedKey] = !opp[collapsedKey];
        sync();
        ctx.changed({ light: true });
      },
    }, icon('chevronUp'));
    const note = el('div', { class: `${className} collapsible-note`, role: 'note' },
      icon(iconName, 'note-icon'),
      el('p', { class: 'note-content' }, el('strong', {}, heading), body),
      toggle);
    const sync = () => {
      const collapsed = !!opp[collapsedKey];
      note.classList.toggle('is-collapsed', collapsed);
      toggle.setAttribute('aria-expanded', String(!collapsed));
      toggle.setAttribute('aria-label', collapsed ? 'Show details' : 'Hide details');
      toggle.title = collapsed ? 'Show details' : 'Hide details';
    };
    sync();
    return note;
  }

  /**
   * Yearly salary: amount, yearly increase (% or fixed $), optional cap (enabled once there's an increase),
   * and an "invest some or all" option with its % and growth rate plus a timing note.
   */
  salaryGroup(sal) {
    const { ctx } = this;
    const investSelector = new RateSelector(sal.investRate, ctx, { label: 'Invested salary growth rate' });
    investSelector.kind = 'lump';
    this.rateSelectors.push(investSelector);

    const pctField = (input) => el('span', { class: 'with-suffix' }, input, el('span', { class: 'suffix' }, '%'));
    const raiseInput = numberInput({
      value: sal.raise ?? 0, greaterThan: -100, arrowStep: 1,
      message: 'Increase must be greater than -100%', 'aria-label': 'Yearly salary increase (%)',
      onValue: (n) => { sal.raise = n; ctx.changed(); },
    });
    const raiseAmountInput = numberInput({
      value: sal.raiseAmount ?? 0, arrowStep: 1000, class: 'amount',
      message: 'Enter a dollar amount', 'aria-label': 'Yearly salary increase ($)',
      onValue: (n) => { sal.raiseAmount = n; ctx.changed(); },
    });
    this.raiseLocked = el('span', { class: 'rate-locked' });
    this.raiseBox = el('div', { class: 'lockable raise-box' },
      el('span', { class: 'raise-percent' }, pctField(raiseInput)),
      el('span', { class: 'raise-fixed with-prefix' }, el('span', { class: 'prefix' }, '$'), raiseAmountInput),
      this.raiseModeToggle(sal),
      this.raiseLocked);
    this.raiseBox.classList.toggle('is-fixed', sal.raiseMode === 'fixed');

    this.capInput = numberInput({
      value: sal.cap ?? '', min: 0, optional: true, class: 'amount', placeholder: 'No cap',
      message: 'Cap must be zero or positive', 'aria-label': 'Salary cap',
      onValue: (n) => { sal.cap = n; ctx.changed(); },
    });
    this.capField = this.field('Salary cap',
      el('span', { class: 'with-prefix' }, el('span', { class: 'prefix' }, '$'), this.capInput));

    const investPct = numberInput({
      value: sal.investPct ?? 100, min: 0, max: 100, arrowStep: 5,
      message: 'Enter a percentage from 0 to 100', 'aria-label': 'Percent of salary invested',
      onValue: (n) => { sal.investPct = n; ctx.changed(); },
    });

    const root = el('div', { class: 'field-group salary-group' });
    const sync = () => root.classList.toggle('is-investing', !!sal.invest);
    const checkbox = el('input', {
      type: 'checkbox', checked: !!sal.invest,
      onchange: () => { sal.invest = checkbox.checked; sync(); ctx.changed(); },
    });

    root.append(
      this.field('Yearly salary', this.amountInput(sal.amount, (n) => { sal.amount = n; }, 'Yearly salary')),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Yearly increase'), this.raiseBox),
      this.capField,
      el('label', { class: 'checkbox' }, checkbox,
        el('span', {}, 'Invest some or all salary earnings at the end of each year')),
      Object.assign(this.field('Salary invested', pctField(investPct)), { className: 'field salary-invest' }),
      el('div', { class: 'field salary-invest' },
        el('span', { class: 'field-label' }, 'Growth rate'), investSelector.render()),
      Object.assign(this.collapsibleNote({
        className: 'info-note', iconName: 'info', collapsedKey: 'salaryNoteCollapsed',
        heading: 'How invested salary grows. ',
        body: el('span', { class: 'note-body' },
          'Invested salary goes in at the end of each year, so it earns nothing in the year it was earned. '
          + 'It starts growing the following year and compounds every year after that; the balance is '
          + 'counted at its value at the end of the timespan.'),
      }), { className: 'info-note collapsible-note salary-invest' }));
    sync();
    return root;
  }

  /** [% | #] toggle: a yearly percentage increase or a fixed dollar increase. */
  raiseModeToggle(sal) {
    const modes = [
      { key: 'percent', label: '%', title: 'Percentage increase' },
      { key: 'fixed', label: '#', title: 'Fixed dollar increase' },
    ];
    const group = el('div', { class: 'unit-toggle', role: 'radiogroup', 'aria-label': 'Yearly increase type' });
    const buttons = modes.map((m) => el('button', {
      type: 'button', class: 'unit-option', role: 'radio', title: m.title, 'aria-label': m.title,
      onclick: () => {
        if (sal.raiseMode === m.key) return;
        sal.raiseMode = m.key;
        sync();
        this.raiseBox.classList.toggle('is-fixed', m.key === 'fixed');
        this.ctx.changed();
      },
    }, m.label));
    const sync = () => buttons.forEach((b, i) => {
      const on = modes[i].key === (sal.raiseMode ?? 'percent');
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
    sync();
    return group;
  }

  /** Salary controls that depend on the raise and the timespan. */
  syncSalary(indefinite) {
    const sal = this.opp.salary;
    const hasRaise = Number(sal.raiseMode === 'fixed' ? sal.raiseAmount : sal.raise) > 0;
    const capOff = indefinite || !hasRaise;
    this.capInput.disabled = capOff;
    this.capField.classList.toggle('is-disabled', capOff);
    this.capField.title = indefinite ? 'Not used on an indefinite timespan'
      : hasRaise ? '' : 'Set a yearly increase above 0 to use a cap';
    this.raiseBox.classList.toggle('is-locked', indefinite);
    this.raiseBox.querySelectorAll('input, button').forEach((c) => { c.disabled = indefinite; });
    this.raiseLocked.replaceChildren(...(indefinite ? [icon('alert'), el('span', {}, 'None (held constant)')] : []));
    this.raiseLocked.title = indefinite ? 'Fixed while the timespan is Indefinite' : '';
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
    this.finalPayoutField.classList.add('final-payout-field');

    // Indefinite: growth rates are fixed (see Calculator.opportunityBreakdown) and explained.
    const d = Number(this.ctx.project.settings.discountRate) || 0;
    this.rateSelectors.forEach((r) => {
      if (r.kind === 'lump') r.setLocked(indefinite ? `Discount rate (${d}%)` : null);
      if (r.kind === 'stream') r.setLocked(indefinite ? 'None (held constant)' : null);
    });
    this.payoutCheckbox.disabled = indefinite;
    this.syncSalary(indefinite);
    this.indefiniteNote.hidden = !indefinite;
    if (indefinite) {
      this.noteBody.textContent = 'Any growth at or above the discount rate would make the present value infinite, so '
        + `one-time amounts grow at the discount rate (${d}%), keeping their value in today's dollars, `
        + 'yearly return and salary are held constant (no salary increase or cap), valued as a perpetuity '
        + '(amount ÷ discount rate), and invested salary grows at the discount rate. '
        + 'The final payout is never received. Your chosen rates are kept for when you pick a set timespan.';
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
