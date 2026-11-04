import { el } from './format.js';
import { Calculator } from './Calculator.js';
import { ChartPanel } from './ChartPanel.js';

/**
 * Line chart comparing a strategy's sub groups by their net value if, at the end of each year,
 * they cashed out every investment and paid all taxes (Calculator.cashOutSeries), with a summary.
 */
export class NetValueChart extends ChartPanel {
  get title() {
    return 'Net cash out value, by year';
  }

  controls() {
    const labels = this.labelsButton('hideNetLabels');
    this.syncControls = labels.sync;
    return el('div', { class: 'cf-controls' }, labels.button);
  }

  draw() {
    const settings = this.ctx.project.settings;
    const { years: H, lines, excluded } = Calculator.cashOutSeries(this.strategy, settings);
    const series = this.series(lines);
    if (!series.some((s) => s.values.some((v) => Math.abs(v) >= 0.005))) {
      this.note(excluded && !lines.length
        ? 'Income sources on an indefinite timespan never cash out, so there’s nothing to chart.'
        : 'Enter amounts in this strategy’s income sources to compare its sub groups here.');
      return;
    }
    this.plot.draw(this.body, {
      years: Array.from({ length: H + 1 }, (_, t) => t), series, type: 'line',
      ariaLabel: this.title, tipNote: 'if cashed out', labels: !this.strategy.hideNetLabels,
    });
    this.writeSummary(series, H, excluded);
  }

  /** Who comes out ahead, when the lead last changed, and how the values are worked out. */
  writeSummary(series, H, excluded) {
    const { money } = ChartPanel;
    const taxesOn = Calculator.taxesOn(this.ctx.project.settings);
    const at = (t) => [...series].sort((a, b) => b.values[t] - a.values[t]);
    const findings = [];
    const when = H ? `Cashed out after year ${H}` : 'Cashed out at the start';
    if (series.length === 1) {
      findings.push(`${when}, ${series[0].label} would be worth ${money(series[0].values[H])}.`);
    } else {
      const [first, second] = at(H);
      const lead = first.values[H] - second.values[H];
      findings.push(lead < 0.5
        ? `${when}, ${first.label} and ${second.label} come out even at ${money(first.values[H])}.`
        : `${when}, ${first.label} comes out ahead at ${money(first.values[H])}, ${money(lead)} more than ${second.label}.`);
      // The last year the lead changed hands (ignoring the start, where most are even; a tie keeps the leader).
      let leader = at(Math.min(1, H))[0];
      let before = leader;
      let since = 0;
      for (let t = 2; t <= H; t++) {
        const top = at(t)[0];
        if (top !== leader && top.values[t] > leader.values[t] + 0.5) [before, leader, since] = [leader, top, t];
      }
      if (since) findings.push(`${before.label} leads through year ${since - 1}; ${leader.label} pulls ahead from year ${since}.`);
    }
    const loans = this.strategy.subGroups.some((sg) => sg.opportunities.some((o) => +o.loan?.amount > 0));
    const deductions = ChartPanel.list(['what was paid in', loans && 'loan repayments made', taxesOn && 'taxes'].filter(Boolean));
    const plural = excluded > 1;
    this.summary.replaceChildren(
      el('p', {}, findings.join(' ')),
      el('p', { class: 'sv-fine' },
        'Each line is what a sub group would be worth if, at the end of that year, it sold every investment'
        + (taxesOn ? ' and paid all taxes owed, including the capital gains tax on the sale' : '')
        + `: everything received so far, less ${deductions}, plus what the investments sell for. `
        + 'Amounts are as received, not discounted'
        + (taxesOn ? '' : ', and taxes aren’t included (turn on Include taxes above)')
        + '. After an income source’s timespan ends, it keeps its final value.'
        + (loans ? ' Loan balances still owed aren’t subtracted.' : '')
        + (excluded ? ` ${excluded} income source${plural ? 's' : ''} on an indefinite timespan ${plural ? 'aren’t' : 'isn’t'} shown, since ${plural ? 'they never cash' : 'it never cashes'} out.` : '')));
  }
}
