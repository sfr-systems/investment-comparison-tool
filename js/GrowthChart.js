import { el } from './format.js';
import { Calculator } from './Calculator.js';
import { ChartPanel } from './ChartPanel.js';

const TYPES = [
  { key: 'bar', label: 'Bar', title: 'Bars: one per sub group in each year' },
  { key: 'line', label: 'Line', title: 'Lines: one per sub group' },
];

/**
 * Each year's growth on everything invested, by sub group (Calculator.investedGrowthSeries): the
 * initial investment, invested initial payouts, and invested salary and returns, before tax. Bars by
 * default or lines ([Bar | Line], saved as `strategy.growthChartType`).
 */
export class GrowthChart extends ChartPanel {
  get title() {
    return 'Investment growth, by year';
  }

  controls() {
    const type = this.segmented('growthChartType', TYPES, 'bar', 'Chart type');
    const labels = this.labelsButton('hideGrowthLabels');
    this.syncControls = () => {
      type.sync();
      labels.sync();
      labels.button.hidden = this.strategy.growthChartType !== 'line'; // bars have no value labels
    };
    return el('div', { class: 'cf-controls' }, type.group, labels.button);
  }

  draw() {
    const { years: H, lines } = Calculator.investedGrowthSeries(this.strategy, this.ctx.project.settings);
    // Year 0 never earns growth, so the chart starts at year 1.
    const series = this.series(lines, 1);
    if (!H || !series.some((s) => s.values.some((v) => Math.abs(v) >= 0.005))) {
      this.note('Nothing here is invested yet. Add an initial investment, or invest an initial payout, salary or '
        + 'returns (with a growth rate) in an income source to compare its growth here.');
      return;
    }
    this.plot.draw(this.body, {
      years: Array.from({ length: H }, (_, i) => i + 1), series,
      type: this.strategy.growthChartType === 'line' ? 'line' : 'bar',
      ariaLabel: this.title, tipNote: 'growth before tax',
      labels: !this.strategy.hideGrowthLabels,
    });
    this.writeSummary();
  }

  /** How the values are worked out. */
  writeSummary() {
    this.summary.replaceChildren(
      el('p', { class: 'sv-fine' },
        'Each year’s growth on everything invested, added up across each sub group’s income sources: the initial '
        + 'investment, an invested initial payout, and salary and returns invested in earlier years (amounts invested '
        + 'at the end of a year start growing the next year). Over a timespan it adds up to the gains cashed out at its end. '
        + 'Taxes are left out, so the whole invested share goes in and its growth isn’t taxed.'
        + ' Growth stops when an income source’s timespan ends; indefinite ones aren’t shown.'));
  }
}
