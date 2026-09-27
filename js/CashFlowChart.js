import { el, formatPV, icon } from './format.js';
import { Calculator } from './Calculator.js';

/** Longest timespan the chart draws; longer ones show a note instead. */
const MAX_YEARS = 20;

/** Stack order, bottom to top, with each source's CSS color token. Keys match Calculator.yearlyCashFlows. */
const INCOME = [
  { key: 'salary', label: 'Salary', color: '--cf-salary' },
  { key: 'salaryInvested', label: 'Invested salary', color: '--cf-salary-invested' },
  { key: 'yearlyReturn', label: 'Yearly return', color: '--cf-return' },
  { key: 'initial', label: 'Investment value', color: '--cf-investment' },
  { key: 'initialPayout', label: 'Initial payout', color: '--cf-initial-payout' },
  { key: 'payout', label: 'Final payout', color: '--cf-final-payout' },
];
/** Deductions, drawn as positive amounts in their own bar. Only loan repayments are charted. */
const COSTS = [
  { key: 'loan', label: 'Loan repayment', color: '--cf-loan' },
];

const compact = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1,
});
const axisLabel = (v) => compact.format(v);
const signed = (v) => formatPV(v).replace('-', '−');

/**
 * Stacked bar chart of an opportunity's cash flows, one column per year: income sources stacked
 * and, when there's a loan, a red bar just to the right with that year's repayment (shown as a
 * positive amount; it's a deduction). With no loan each column is a single, wider bar.
 * Hovering (or arrow keys on the focused plot) shows each source's amount for that year.
 */
export class CashFlowChart {
  /** expanded: the large copy shown in the popup, which has no header of its own (see openExpanded). */
  constructor(opp, ctx, { expanded = false } = {}) {
    this.opp = opp;
    this.ctx = ctx;
    this.expanded = expanded;
    this.active = -1;
  }

  render() {
    this.body = el('div', { class: 'cf-body' });
    this.controls = el('div', { class: 'cf-controls' }, this.modeToggle(), this.cumulativeToggle());
    this.titleEl = el('span', { class: 'eyebrow' });
    this.root = el('section', { class: 'cash-flow-chart', 'aria-label': 'Yearly cash flow' });
    if (!this.expanded) {
      this.head = el('div', { class: 'cf-head' },
        this.titleEl,
        el('div', { class: 'cf-actions' }, this.controls,
          el('button', {
            type: 'button', class: 'icon-btn cf-expand', title: 'Expand chart', 'aria-label': 'Expand chart',
            onclick: () => this.openExpanded(),
          }, icon('expand'))));
      this.root.append(this.head);
    }
    this.root.append(this.body);
    this.update();
    return this.root;
  }

  /** Show a large copy of the chart in a modal popup; closing it syncs this chart (e.g. its value mode). */
  openExpanded() {
    const big = new CashFlowChart(this.opp, this.ctx, { expanded: true });
    const chart = big.render();
    const dialog = el('dialog', { class: 'cf-dialog', 'aria-label': 'Yearly cash flow' },
      el('div', { class: 'cf-dialog-inner' },
        el('header', { class: 'cf-dialog-head' },
          el('div', { class: 'cf-dialog-title' },
            big.titleEl,
            el('h2', {}, this.opp.title || 'Untitled opportunity')),
          big.controls,
          el('button', {
            type: 'button', class: 'icon-btn', title: 'Close', 'aria-label': 'Close',
            onclick: () => dialog.close(),
          }, icon('close'))),
        chart));
    // A click on the backdrop lands on the dialog itself (the inner panel covers the rest).
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => { dialog.remove(); this.update(); });
    document.body.append(dialog);
    dialog.showModal();
  }

  /** [Received | PV]: amounts as paid that year, or discounted to today. */
  modeToggle() {
    const modes = [
      { key: 'nominal', label: 'Received', title: 'Amounts as received each year' },
      { key: 'pv', label: 'PV', title: 'Present value: each year’s amounts discounted to today' },
    ];
    const group = el('div', { class: 'unit-toggle cf-mode', role: 'radiogroup', 'aria-label': 'Chart values' });
    const buttons = modes.map((m) => el('button', {
      type: 'button', class: 'unit-option', role: 'radio', title: m.title,
      onclick: () => {
        if ((this.opp.chartMode ?? 'nominal') === m.key) return;
        this.opp.chartMode = m.key;
        this.update();
        this.ctx.changed({ light: true });
      },
    }, m.label));
    this.syncToggle = () => buttons.forEach((b, i) => {
      const on = modes[i].key === (this.opp.chartMode ?? 'nominal');
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

  /** On/off button: show running totals (everything received and repaid through each year). */
  cumulativeToggle() {
    const button = el('button', {
      type: 'button', class: 'cf-cumulative', title: 'Running totals through each year',
      onclick: () => {
        this.opp.chartCumulative = !this.opp.chartCumulative;
        this.update();
        this.ctx.changed({ light: true });
      },
    }, 'Cumulative');
    this.syncCumulative = () => button.setAttribute('aria-pressed', String(!!this.opp.chartCumulative));
    return button;
  }

  update() {
    this.syncToggle();
    this.syncCumulative();
    this.titleEl.textContent = this.opp.chartCumulative ? 'Cumulative cash flow' : 'Yearly cash flow';
    const settings = this.ctx.project.settings;
    const n = Calculator.resolveYears(this.opp, settings);
    if (this.head) this.head.hidden = n > MAX_YEARS; // the note stands alone
    if (n > MAX_YEARS) {
      this.body.replaceChildren(el('p', { class: 'cf-note' },
        `Charts are only available for timespans of ${MAX_YEARS} years or less`));
      return;
    }
    // Keep income and loan repayments (as positive amounts); the start column only shows when
    // something is received then.
    this.years = Calculator.yearlyCashFlows(this.opp, settings, { discounted: this.opp.chartMode === 'pv' })
      .map(({ year, income, costs }) => ({ year, income, costs: costs.loan ? { loan: -costs.loan } : {} }))
      .filter((row) => row.year > 0 || Object.keys(row.income).length);
    if (this.opp.chartCumulative) this.years = CashFlowChart.runningTotals(this.years);
    const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
    const max = Math.max(0, ...this.years.map((y) => Math.max(sum(y.income), sum(y.costs))));
    if (max < 0.005) {
      this.body.replaceChildren(el('p', { class: 'cf-note' }, 'Enter amounts above to see each year’s cash flow.'));
      return;
    }
    this.buildPlot(this.scale(max, this.expanded ? 8 : 4));
  }

  /** Each row's amounts replaced by totals through that year, per source. */
  static runningTotals(rows) {
    const income = {};
    const costs = {};
    const addInto = (acc, amounts) => {
      for (const [key, v] of Object.entries(amounts)) acc[key] = (acc[key] || 0) + v;
      return { ...acc };
    };
    return rows.map((row) => ({ year: row.year, income: addInto(income, row.income), costs: addInto(costs, row.costs) }));
  }

  /** Axis top (a round number ≥ max) and about `count` evenly spaced round ticks from 0. */
  scale(max, count) {
    const raw = max / count;
    const step = [1, 2, 2.5, 5, 10].map((m) => m * 10 ** Math.floor(Math.log10(raw))).find((s) => s >= raw);
    const top = Math.ceil(max / step - 1e-9) * step;
    const ticks = [];
    for (let i = 0; i * step <= top + step / 1e6; i++) ticks.push(i * step);
    return { top, ticks };
  }

  buildPlot({ top, ticks }) {
    const pct = (v) => `${(v / top) * 100}%`;
    const hasCosts = this.years.some((y) => Object.keys(y.costs).length);
    const used = (list, side) => list.filter((s) => this.years.some((y) => y[side][s.key]));

    const yAxis = el('div', { class: 'cf-y-axis', 'aria-hidden': 'true' },
      ticks.map((v) => el('span', { style: { bottom: pct(v) } }, axisLabel(v))));
    const grid = el('div', { class: 'cf-grid', 'aria-hidden': 'true' },
      ticks.map((v) => el('span', { class: v === 0 ? 'is-zero' : '', style: { bottom: pct(v) } })));

    const stack = (row, list, side) => {
      const items = list.filter((s) => row[side][s.key]);
      const total = items.reduce((a, s) => a + row[side][s.key], 0);
      if (!total) return null;
      return el('div', {
        class: `cf-bar cf-${side}`,
        style: { bottom: 0, height: pct(total) },
      }, items.map((s) => el('span', {
        class: 'cf-seg', dataset: { key: `${side}:${s.key}` },
        style: { flexGrow: String(row[side][s.key]), background: `var(${s.color})` },
      })));
    };

    this.cols = this.years.map((row, i) => el('div', {
      class: 'cf-col',
      onmouseenter: () => this.setActive(i),
      onmousemove: (e) => this.hoverSegment(e.target),
    },
    el('div', { class: 'cf-slot' }, stack(row, INCOME, 'income')),
    hasCosts && el('div', { class: 'cf-slot' }, stack(row, COSTS, 'costs'))));

    this.tooltip = el('div', { class: 'cf-tooltip', role: 'status', hidden: true });
    this.plot = el('div', {
      class: 'cf-plot', tabindex: '0',
      'aria-label': 'Cash flow by year. Use the left and right arrow keys to read each year.',
      onmouseleave: () => this.setActive(-1),
      onfocus: () => { if (this.active < 0) this.setActive(0); },
      onblur: () => this.setActive(-1),
      onkeydown: (e) => {
        const last = this.years.length - 1;
        const next = { ArrowRight: this.active + 1, ArrowLeft: this.active - 1, Home: 0, End: last }[e.key];
        if (next == null) return;
        e.preventDefault();
        this.setActive(Math.max(0, Math.min(last, next)));
      },
    }, grid, el('div', { class: 'cf-cols' }, this.cols), this.tooltip);

    const xAxis = el('div', { class: 'cf-x-axis', 'aria-hidden': 'true' },
      this.years.map((row) => el('span', {}, String(row.year))));
    const startNote = this.years[0].year === 0 ? ' (0 = start)' : '';

    const legend = el('ul', { class: 'cf-legend' },
      [...used(INCOME, 'income'), ...used(COSTS, 'costs')].map((s) =>
        el('li', {}, el('span', { class: 'cf-swatch', style: { background: `var(${s.color})` } }), s.label)));

    this.active = -1;
    this.body.replaceChildren(
      el('div', { class: 'cf-frame' }, yAxis, this.plot, el('span'), xAxis, el('span'),
        el('span', { class: 'cf-x-title' }, `Year${startNote}`)),
      legend);
  }

  /** Show the tooltip for column i (−1 hides it). */
  setActive(i) {
    if (!this.cols) return;
    this.active = i;
    this.cols.forEach((c, j) => c.classList.toggle('is-active', j === i));
    this.plot.classList.toggle('has-active', i >= 0);
    this.tooltip.hidden = i < 0;
    if (i < 0) return;

    const row = this.years[i];
    const line = (s, side) => el('div', { class: 'cf-tip-row', dataset: { key: `${side}:${s.key}` } },
      el('span', { class: 'cf-swatch', style: { background: `var(${s.color})` } }),
      el('span', {}, s.label), el('span', { class: 'cf-tip-value' }, signed(row[side][s.key])));
    const incomeRows = INCOME.filter((s) => row.income[s.key]);
    const costRows = COSTS.filter((s) => row.costs[s.key]);
    const income = incomeRows.reduce((a, s) => a + row.income[s.key], 0);
    const costs = costRows.reduce((a, s) => a + row.costs[s.key], 0);
    const total = (label, v) => el('div', { class: 'cf-tip-row cf-tip-total' },
      el('span'), el('span', {}, label), el('span', { class: 'cf-tip-value' }, signed(v)));

    this.tooltip.replaceChildren(...[
      el('div', { class: 'cf-tip-title' }, row.year === 0 ? 'Start (year 0)' : `Year ${row.year}`,
        ...[this.opp.chartCumulative && 'total to date', this.opp.chartMode === 'pv' && 'present value']
          .filter(Boolean).map((note) => el('span', { class: 'muted' }, ` · ${note}`))),
      ...incomeRows.map((s) => line(s, 'income')),
      incomeRows.length > 1 ? total('Income', income) : null,
      ...costRows.map((s) => line(s, 'costs')),
      incomeRows.length && costRows.length ? total('Net', income - costs) : null,
      !incomeRows.length && !costRows.length ? el('div', { class: 'muted' }, 'No cash flow this year') : null,
    ].filter(Boolean));

    // Beside the column, flipping to its left in the right half of the plot.
    const col = this.cols[i];
    const right = col.offsetLeft + col.offsetWidth / 2 > this.plot.clientWidth / 2;
    this.tooltip.style.left = right ? '' : `${col.offsetLeft + col.offsetWidth + 6}px`;
    this.tooltip.style.right = right ? `${this.plot.clientWidth - col.offsetLeft + 6}px` : '';
  }

  /** Emphasize the tooltip row for the segment under the pointer. */
  hoverSegment(target) {
    const key = target.closest?.('.cf-seg')?.dataset.key;
    this.cols.forEach((c) => c.querySelectorAll('.cf-seg').forEach((s) =>
      s.classList.toggle('is-hover', s.dataset.key === key && c.classList.contains('is-active'))));
    this.tooltip.querySelectorAll('.cf-tip-row[data-key]').forEach((r) =>
      r.classList.toggle('is-hover', r.dataset.key === key));
  }
}
