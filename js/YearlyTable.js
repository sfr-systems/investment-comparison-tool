import { el, formatDollars, formatUSD, icon } from './format.js';
import { Calculator } from './Calculator.js';
import { STATES, TAX_YEAR } from './taxData.js';

/** Years listed while the table is collapsed (plus the start, when there is one). */
const COLLAPSED_YEARS = 2;

/**
 * Column groups, in order; keys match Calculator.yearlyLedger. Income and expense columns show only when
 * used, tax columns whenever taxes are included (capital gains only when there are some).
 */
export const GROUPS = [
  {
    key: 'income', label: 'Income', columns: [
      { key: 'salary', label: 'Salary', title: 'Yearly salary, including any part invested' },
      { key: 'yearlyReturn', label: 'Return', title: 'Yearly return, including any part invested' },
      { key: 'initialPayout', label: 'Initial payout', title: 'Initial payout (one-time), received at the start' },
      { key: 'payout', label: 'Final payout', title: 'Final payout (one-time), received at the end' },
      { key: 'cashedOut', label: 'Cashed out', title: 'Investments cashed out at the end of the timespan' },
    ],
  },
  {
    key: 'expenses', label: 'Expenses', columns: [
      { key: 'invested', label: 'Invested', title: 'Put into investments: the initial investment and any invested payout, salary or returns' },
      { key: 'loan', label: 'Loan', title: 'Loan repayment' },
    ],
  },
  {
    key: 'taxes', label: 'Taxes', columns: [
      { key: 'federal', label: 'Federal', title: 'Federal income tax on everything but capital gains, including any alternative minimum tax and net investment income tax' },
      {
        key: 'gains', label: 'Cap. gains',
        title: 'Federal tax on the gains of investments cashed out at the end of the timespan: long-term capital gains rates '
          + '(0, 15 or 20%), plus what else the gains add, such as the net investment income tax or alternative minimum tax',
      },
      { key: 'payroll', label: 'FICA', title: 'Social Security and Medicare' },
      { key: 'state', label: 'State', title: 'State income tax, including any on capital gains (most states tax them as ordinary income)' },
    ],
  },
];

export const shown = (v) => Math.abs(v) >= 0.5; // at least a dollar once rounded

/**
 * Table under an income source's chart spelling out each year's income, expenses, taxes and net
 * cash (from Calculator.yearlyLedger). Lists the first two years until expanded (saved as
 * `opp.tableExpanded`); hidden on indefinite timespans. The expand button opens a large copy in a
 * popup (IncomeSourcePopup) that always lists every year.
 */
export class YearlyTable {
  /**
   * expanded: the large copy shown in the popup, which has no header of its own (the popup's shows
   * its basis). onExpand: opens that popup (the card's expand button).
   */
  constructor(opp, ctx, { expanded = false, onExpand = null } = {}) {
    this.opp = opp;
    this.ctx = ctx;
    this.expanded = expanded;
    this.onExpand = onExpand;
  }

  render() {
    this.basis = el('span', { class: 'yt-basis' });
    this.body = el('div', { class: 'yt-body' });
    this.moreBtn = el('button', {
      type: 'button', class: 'yt-more',
      onclick: () => {
        this.opp.tableExpanded = !this.opp.tableExpanded;
        this.update();
        this.ctx.changed({ light: true });
      },
    });
    this.footnote = el('p', { class: 'yt-foot' });
    this.root = el('section', { class: 'yearly-table', 'aria-label': 'Yearly income, expenses and taxes' });
    if (!this.expanded) {
      this.expandBtn = el('button', {
        type: 'button', class: 'icon-btn yt-expand', title: 'Expand table', 'aria-label': 'Expand table',
        onclick: () => this.onExpand?.(),
      }, icon('expand'));
      this.root.append(el('div', { class: 'yt-head' },
        el('span', { class: 'eyebrow' }, 'Yearly breakdown'),
        el('div', { class: 'yt-actions' }, this.basis, this.expandBtn)));
    }
    this.root.append(this.body, this.moreBtn, this.footnote);
    this.update();
    return this.root;
  }

  update() {
    const settings = this.ctx.project.settings;
    const ledger = Calculator.yearlyLedger(this.opp, settings);
    this.root.hidden = !ledger;
    if (!ledger) return;

    const taxesOn = Calculator.taxesOn(settings);
    const used = (g, c) => ledger.some((row) => shown(row[g.key][c.key]));
    const groups = GROUPS.map((g) => ({
      ...g,
      columns: g.key !== 'taxes' ? g.columns.filter((c) => used(g, c))
        : taxesOn ? g.columns.filter((c) => c.key !== 'gains' || used(g, c)) : [],
    })).filter((g) => g.columns.length);
    this.basis.textContent = taxesOn ? 'After taxes' : 'Before taxes';
    this.footnote.replaceChildren(...YearlyTable.notes(settings, ledger, groups));

    const empty = !groups.some((g) => g.key !== 'taxes');
    if (this.expandBtn) this.expandBtn.hidden = empty;
    if (empty) {
      this.body.replaceChildren(el('p', { class: 'cf-note' }, 'Enter amounts above to see each year’s income, expenses and taxes.'));
      this.moreBtn.hidden = true;
      return;
    }

    const lastYear = ledger[ledger.length - 1].year;
    const collapsible = !this.expanded && ledger.some((row) => row.year > COLLAPSED_YEARS);
    const showAll = this.expanded || (collapsible && !!this.opp.tableExpanded);
    const rows = showAll ? ledger : ledger.filter((row) => row.year <= COLLAPSED_YEARS);

    const cell = (v, className = '') => el('td', {
      class: [className, !shown(v) && 'yt-zero', v <= -0.5 && 'negative'].filter(Boolean).join(' '),
      title: shown(v) ? `Exact: ${formatUSD(v)}` : '',
    }, shown(v) ? formatDollars(v) : '–');
    const line = (label, values, net, className = '') => el('tr', { class: className },
      el('th', { scope: 'row', class: 'yt-year' }, label),
      groups.flatMap((g) => g.columns.map((c, i) => cell(values[g.key][c.key], i === 0 ? 'yt-first' : ''))),
      cell(net, 'yt-net'));

    const head = el('thead', {},
      el('tr', {},
        el('th', { scope: 'col', rowSpan: 2, class: 'yt-year' }, 'Year'),
        groups.map((g) => el('th', { scope: 'colgroup', colSpan: g.columns.length, class: 'yt-group yt-first' }, g.label)),
        el('th', { scope: 'col', rowSpan: 2, class: 'yt-net', title: 'Income − expenses − taxes' }, 'Net')),
      el('tr', {}, groups.flatMap((g) => g.columns.map((c, i) =>
        el('th', { scope: 'col', title: c.title, class: i === 0 ? 'yt-first' : '' }, c.label)))));
    const body = el('tbody', {},
      rows.map((row) => line(row.year === 0 ? 'Start' : String(row.year), row, row.net)),
      showAll && ledger.length > 1
        ? line('Total', YearlyTable.totals(ledger), ledger.reduce((a, r) => a + r.net, 0), 'yt-total') : null);

    this.body.replaceChildren(el('div', {
      class: 'yt-scroll', tabindex: '0', role: 'region', 'aria-label': 'Yearly breakdown table (scrolls sideways)',
    }, el('table', { class: 'yt' }, head, body)));

    this.moreBtn.hidden = !collapsible;
    this.moreBtn.setAttribute('aria-expanded', String(showAll));
    this.moreBtn.replaceChildren(
      el('span', {}, showAll ? `Show first ${COLLAPSED_YEARS} years` : `Show all ${lastYear} years`),
      icon(showAll ? 'chevronUp' : 'chevron'));
  }

  /** Per-column sums across every year, shaped like a ledger row. */
  static totals(ledger) {
    const sum = { income: {}, expenses: {}, taxes: {} };
    for (const row of ledger) {
      for (const side of Object.keys(sum)) {
        for (const [key, v] of Object.entries(row[side])) sum[side][key] = (sum[side][key] || 0) + v;
      }
    }
    return sum;
  }

  /** What the figures assume: whether taxes are in, and when investments are cashed out. */
  static notes(settings, ledger, groups) {
    const parts = [];
    if (!Calculator.taxesOn(settings)) {
      parts.push('Before taxes: turn on “Include taxes” under Assumptions to deduct them.');
    } else {
      const state = STATES[settings.taxes.state];
      parts.push(state
        ? `${TAX_YEAR} federal and ${state.name} taxes for a single filer, as if this were the only income.`
        : `${TAX_YEAR} federal taxes for a single filer. Choose a state under Assumptions to add state tax.`);
    }
    if (groups.some((g) => g.columns.some((c) => c.key === 'cashedOut'))) {
      const n = ledger[ledger.length - 1].year;
      parts.push(` Investments are cashed out in year ${n}${Calculator.taxesOn(settings)
        ? ', and their gains taxed then as long-term capital gains' : ''}.`);
    }
    return parts;
  }
}
