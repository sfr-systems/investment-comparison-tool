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
    this.writeSummary(excluded);
  }

  /** How the values are worked out. */
  writeSummary(excluded) {
    const taxesOn = Calculator.taxesOn(this.ctx.project.settings);
    const loans = this.strategy.subGroups.some((sg) => sg.opportunities.some((o) => +o.loan?.amount > 0));
    const deductions = ChartPanel.list(['what was paid in', loans && 'loan repayments made', taxesOn && 'taxes'].filter(Boolean));
    const plural = excluded > 1;
    this.summary.replaceChildren(
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
