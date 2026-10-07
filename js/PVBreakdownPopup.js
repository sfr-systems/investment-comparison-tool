import { el, formatDollars, formatUSD, openPopup } from './format.js';
import { Calculator } from './Calculator.js';
import { GROUPS, shown, YearlyTable } from './YearlyTable.js';
import { FILING_STATUSES } from './taxData.js';

const pct = (rate) => `${Math.round(rate * 1e4) / 100}%`; // 0.07 → "7%", 0.0725 → "7.25%"

/**
 * The popup behind the "See income & taxes by year" button at the end of an income source's card:
 * how its present value adds up. A summary line (income − expenses − taxes = net cash, discounted to
 * the present value), then a table of each year's income by source, expenses, taxes by kind (with the
 * income they're figured on and the effective rate) and net cash, then the discounting: what the net
 * is divided by, its value today and a running total that ends at the present value
 * (Calculator.yearlyLedger). Indefinite timespans list the start and "every year", valued as a
 * perpetuity (Calculator.perpetuityLedger).
 */
export class PVBreakdownPopup {
  constructor(opp, ctx) {
    this.opp = opp;
    this.ctx = ctx;
  }

  open() {
    const { opp } = this;
    const settings = this.ctx.project.settings;
    this.d = (Number(settings.discountRate) || 0) / 100;
    this.taxesOn = Calculator.taxesOn(settings);
    this.pv = Calculator.opportunityPV(opp, settings);

    const ledger = Calculator.yearlyLedger(opp, settings);
    this.indefinite = !ledger;
    if (ledger) {
      this.rows = ledger.map((row) => ({ ...row, label: row.year === 0 ? 'Start' : String(row.year) }));
      let running = 0;
      for (const row of this.rows) row.running = running += row.pv;
    } else {
      const { start, every } = Calculator.perpetuityLedger(opp, settings);
      this.rows = [
        ...(shown(start.net) || shown(start.taxed) ? [{ ...start, label: 'Start' }] : []),
        { ...every, label: 'Every year' },
      ];
    }
    this.groups = this.columnGroups();
    const empty = !this.groups.some((g) => g.key === 'income' || g.key === 'expenses');
    const n = Calculator.resolveYears(opp, settings);

    openPopup({
      className: 'pvb-dialog',
      label: 'How the present value adds up, year by year',
      kicker: el('div', { class: 'yt-kicker' },
        el('span', { class: 'eyebrow' }, 'Income & taxes by year'),
        el('span', { class: 'yt-basis' }, [
          this.taxesOn ? `After taxes (${FILING_STATUSES[Calculator.filingStatus(opp)].toLowerCase()})` : 'Before taxes',
          `${pct(this.d)} discount rate`,
          this.indefinite ? 'Indefinite timespan' : `${n} ${n === 1 ? 'year' : 'years'}`,
        ].join(' · '))),
      title: opp.title || 'Untitled income source',
      body: el('div', { class: 'pvb-body' },
        empty ? el('p', { class: 'cf-note' }, 'Enter amounts on the card to see each year’s income, taxes and present value.')
          : [this.summary(), this.table(),
            el('div', { class: 'pvb-notes' }, this.notes(settings, n).map((text) => el('p', {}, text)))]),
    });
  }

  /** Columns by group (income, expenses, taxes, net, present value), keeping only those used. */
  columnGroups() {
    const used = (get) => this.rows.some((row) => shown(get(row)));
    const withTotal = (columns, side) => (columns.length > 1
      ? [...columns, { key: 'total', label: 'Total', title: `Total ${side}`, get: (row) => sumOf(row[side]), strong: true }]
      : columns);
    const amounts = (group) => group.columns
      .map((c) => ({ ...c, get: (row) => row[group.key][c.key] }))
      .filter((c) => used(c.get));
    const [income, expenses, taxes] = GROUPS;
    const groups = [
      { key: 'income', label: income.label, columns: withTotal(amounts(income), 'income') },
      { key: 'expenses', label: expenses.label, columns: withTotal(amounts(expenses), 'expenses') },
    ];
    if (this.indefinite) {
      const loan = groups[1].columns.find((c) => c.key === 'loan');
      if (loan) Object.assign(loan, { label: 'Loan interest', title: 'Loan paid interest-only, forever: the loan amount × its interest rate' });
    }
    if (this.taxesOn) {
      groups.push({
        key: 'taxes', label: taxes.label, columns: [
          {
            key: 'taxed', label: 'Taxed income', aux: true, get: (row) => row.taxed,
            title: 'The income the year’s taxes are figured on, before deductions: salary, returns and payouts, '
              + 'plus the gains on investments cashed out (not what was paid into them)',
          },
          ...taxes.columns.filter((c) => c.key !== 'gains' || used((row) => row.taxes.gains))
            .map((c) => ({ ...c, get: (row) => row.taxes[c.key] })),
          { key: 'total', label: 'Total', title: 'Total taxes', get: (row) => sumOf(row.taxes), strong: true },
          {
            key: 'rate', label: 'Rate', aux: true, format: 'rate', get: (row) => (row.taxed > 0 ? sumOf(row.taxes) / row.taxed : null),
            title: 'Effective tax rate: the year’s taxes as a share of its taxed income',
          },
        ],
      });
    }
    groups.push({
      key: 'net', label: 'Net cash', single: true,
      columns: [{ key: 'net', label: 'Net cash', title: 'Income − expenses − taxes', get: (row) => row.net, strong: true }],
    });
    groups.push({
      key: 'pv', label: 'Present value', columns: [
        {
          key: 'factor', label: 'Divided by', format: 'factor', aux: true, get: (row) => row.factor,
          title: this.indefinite
            ? 'Every year’s net, forever, is worth net ÷ the discount rate today (a perpetuity)'
            : `Net ÷ (1 + ${pct(this.d)})^year: money further away is worth less today`,
        },
        { key: 'pv', label: 'Value today', title: 'The year’s net cash in today’s dollars', get: (row) => row.pv, strong: true, pv: true },
        ...(this.indefinite ? [] : [{
          key: 'running', label: 'Running total', get: (row) => row.running,
          title: 'Present value so far: the last year’s is the income source’s present value',
        }]),
      ],
    });
    return groups.filter((g) => g.columns.length);
  }

  /** Income − expenses − taxes = net cash → present value (set timespans); start + every year ÷ d (indefinite). */
  summary() {
    const total = (get) => this.rows.reduce((a, row) => a + get(row), 0);
    const tile = (label, value, { caption, result = false } = {}) => el('div', { class: `pvb-tile${result ? ' is-result' : ''}` },
      el('span', { class: 'pvb-tile-label' }, label),
      el('span', {
        class: `pvb-tile-value${value <= -0.5 ? ' negative' : ''}`,
        title: Number.isFinite(value) ? `Exact: ${formatUSD(value)}` : '',
      }, formatDollars(value)),
      caption ? el('span', { class: 'pvb-tile-caption' }, caption) : null);
    // An operator stays with the tile after it when the line wraps.
    const step = (symbol, caption, next) => el('div', { class: 'pvb-step' },
      el('div', { class: 'pvb-op', 'aria-hidden': 'true' },
        el('span', {}, symbol), caption ? el('span', { class: 'pvb-op-caption' }, caption) : null),
      next);
    const result = tile('Present value', this.pv, { result: true });

    let parts;
    if (this.indefinite) {
      const start = this.rows.find((row) => row.label === 'Start');
      const every = this.rows[this.rows.length - 1];
      const yearly = tile('Net every year', every.net, { caption: `÷ ${pct(this.d)} = ${formatDollars(every.pv)}` });
      parts = [start ? [tile('Net at the start', start.net), step('+', null, yearly)] : yearly, step('=', null, result)];
    } else {
      const expenses = total((row) => sumOf(row.expenses));
      parts = [
        tile('Income', total((row) => sumOf(row.income))),
        shown(expenses) ? step('−', null, tile('Expenses', expenses)) : null,
        this.taxesOn ? step('−', null, tile('Taxes', total((row) => sumOf(row.taxes)))) : null,
        step('=', null, tile('Net cash', total((row) => row.net))),
        step('→', `discounted at ${pct(this.d)} a year`, result),
      ];
    }
    return el('div', { class: 'pvb-summary', role: 'group', 'aria-label': 'How the present value adds up' }, parts);
  }

  table() {
    const { groups, rows } = this;
    // Totals: every column sums except the discount factor and running total (blank) and the rate (overall).
    // Indefinite: one-time and yearly amounts don't add up, so only the present value does (when there's a start).
    const total = this.total = { label: 'Total', taxes: {}, taxed: rows.reduce((a, row) => a + row.taxed, 0) };
    for (const row of rows) for (const [k, v] of Object.entries(row.taxes)) total.taxes[k] = (total.taxes[k] || 0) + v;
    const totalOf = (c) => (c.key === 'factor' || c.key === 'running' || (this.indefinite && c.key !== 'pv') ? null
      : c.format === 'rate' ? c.get(total) : rows.reduce((a, row) => a + c.get(row), 0));

    const line = (row, values, className = '') => el('tr', { class: className },
      el('th', { scope: 'row', class: 'yt-year' }, row.label),
      groups.flatMap((g) => g.columns.map((c, i) => this.cell(c, values(c), row, i === 0))));
    const head = el('thead', {},
      el('tr', {},
        el('th', { scope: 'col', rowSpan: 2, class: 'yt-year' }, 'Year'),
        groups.map((g) => (g.single
          ? el('th', { scope: 'col', rowSpan: 2, class: 'yt-first', title: g.columns[0].title }, g.label)
          : el('th', { scope: 'colgroup', colSpan: g.columns.length, class: 'yt-group yt-first' }, g.label)))),
      el('tr', {}, groups.filter((g) => !g.single).flatMap((g) => g.columns.map((c, i) =>
        el('th', { scope: 'col', title: c.title, class: i === 0 ? 'yt-first' : '' }, c.label)))));
    const body = el('tbody', {},
      rows.map((row) => line(row, (c) => c.get(row))),
      rows.length > 1 ? line(total, totalOf, 'yt-total') : null);
    return el('div', {
      class: 'yt-scroll', tabindex: '0', role: 'region', 'aria-label': 'Income, taxes and present value by year (scrolls)',
    }, el('table', { class: 'yt pvb-table' }, head, body));
  }

  /** One amount, rate or discount factor (`v` null: blank), with its exact value or how it's figured on hover. */
  cell(c, v, row, first) {
    const d = pct(this.d);
    const now = row.label === 'Start';
    let text;
    let title = '';
    if (v == null) {
      text = row === this.total ? '' : '–';
    } else if (c.format === 'rate') {
      text = `${(v * 100).toFixed(1)}%`;
      title = `${formatDollars(sumOf(row.taxes))} of taxes on ${formatDollars(row.taxed)} of taxed income`;
    } else if (c.format === 'factor') {
      text = this.indefinite ? (now ? '1' : d) : (1 / v).toFixed(4);
      title = now ? 'Received now: counted as it is'
        : this.indefinite ? `Every year, forever: net ÷ ${d}`
          : `(1 + ${d})^${row.year}: $1 received in year ${row.year} is worth ${formatUSD(v)} today`;
    } else {
      text = shown(v) || !Number.isFinite(v) ? formatDollars(v) : '–';
      if (shown(v) && Number.isFinite(v)) title = `Exact: ${formatUSD(v)}`;
    }
    const amount = !c.format && v != null;
    return el('td', {
      class: [first && 'yt-first', c.strong && 'pvb-strong', c.aux && 'pvb-aux', c.pv && 'pvb-pv',
        amount && !shown(v) && Number.isFinite(v) && 'yt-zero', amount && v <= -0.5 && 'negative'].filter(Boolean).join(' '),
      title,
    }, text);
  }

  /** How to read the table: discounting, what the taxes assume, and what's invested or left out. */
  notes(settings, n) {
    const { opp, d } = this;
    const notes = [];
    if (this.indefinite) {
      notes.push(d > 0
        ? `On an indefinite timespan the yearly amounts continue forever without change, so every year’s net is worth `
          + `net ÷ ${pct(d)} (the discount rate) today, a perpetuity.${this.rows.length > 1 ? ' Amounts at the start count as they are.' : ''}`
        : `With a discount rate of ${pct(d)}, a yearly net that continues forever has no finite present value. `
          + 'Use a discount rate above 0%, or a set timespan.');
      const investing = +opp.initial?.amount > 0 || [opp.initialPayout, opp.yearlyReturn, opp.salary]
        .some((group) => group?.invest && +group.amount > 0);
      const left = [
        investing && 'Amounts invested grow at the discount rate, so they keep their value in today’s dollars and don’t '
          + 'change the present value; they’re left out here.',
        +opp.payout > 0 && 'The final payout is never received.',
      ].filter(Boolean);
      if (left.length) notes.push(left.join(' '));
    } else {
      notes.push(`Each year’s net cash is divided by (1 + ${pct(d)}) once for every year it’s away, giving its value today; `
        + `adding those up gives the present value, ${formatDollars(this.pv)}.`);
      if (this.groups.some((g) => g.key === 'expenses' && g.columns.some((c) => c.key === 'invested'))) {
        notes.push(`Amounts invested count as expenses in the year they go in, and come back with their growth in year ${n} (Cashed out).`);
      }
    }
    // Tax basis, and when investments are cashed out (set timespans).
    const basis = YearlyTable.notes(settings, this.rows, this.indefinite ? [] : this.groups, Calculator.filingStatus(opp)).join('');
    notes.push(!this.taxesOn ? basis : `${basis}${this.indefinite
      ? ' Taxes are the same every year; investments are never cashed out, so their gains aren’t taxed.' : ''
    } Rate is the year’s taxes as a share of its taxed income.`);
    return notes;
  }
}

function sumOf(obj) {
  return Object.values(obj).reduce((a, b) => a + b, 0);
}
