import { el } from './format.js';
import { Calculator } from './Calculator.js';
import { ChartPanel } from './ChartPanel.js';

const TYPES = [
  { key: 'bar', label: 'Bar', title: 'Bars: one per sub group in each year' },
  { key: 'line', label: 'Line', title: 'Lines: one per sub group' },
];

/**
 * Each year's growth on everything invested, by sub group (Calculator.investedGrowthSeries): the
 * initial investment, invested initial payouts, and invested salary and returns. Bars by default or
 * lines ([Bar | Line], saved as `strategy.growthChartType`), before tax by default or after tax (the
 * After tax button, saved as `strategy.growthAfterTax`; needs Include taxes).
 */
export class GrowthChart extends ChartPanel {
  get title() {
    return 'Investment growth, by year';
  }
  controls() {
    const type = this.segmented('growthChartType', TYPES, 'bar', 'Chart type');
    this.taxBtn = el('button', {
      type: 'button', class: 'cf-cumulative',
      onclick: () => {
        this.strategy.growthAfterTax = !this.strategy.growthAfterTax;
        this.update();
        this.ctx.changed({ light: true });
      },
    }, 'After tax');
    const labels = this.labelsButton('hideGrowthLabels');
    this.syncControls = () => {
      type.sync();
      labels.sync();
      labels.button.hidden = this.strategy.growthChartType !== 'line'; // bars have no value labels
      const taxesOn = Calculator.taxesOn(this.ctx.project.settings);
      this.taxBtn.disabled = !taxesOn;
      this.taxBtn.setAttribute('aria-pressed', String(this.afterTax()));
      this.taxBtn.title = taxesOn
        ? 'Show growth after taxes: only what’s left of salary, returns and payouts after their taxes is invested, and growth is net of the capital gains tax due when sold'
        : 'Turn on Include taxes above to see growth after taxes';
    };
    return el('div', { class: 'cf-controls' }, type.group, labels.button, this.taxBtn);
  }

  /** After tax only while the project includes taxes. */
  afterTax() {
    return !!this.strategy.growthAfterTax && Calculator.taxesOn(this.ctx.project.settings);
  }

  draw() {
    const settings = this.ctx.project.settings;
    const afterTax = this.afterTax();
    const { years: H, lines } = Calculator.investedGrowthSeries(this.strategy, settings, { afterTax });
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
      ariaLabel: this.title, tipNote: afterTax ? 'growth after tax' : 'growth before tax',
      labels: !this.strategy.hideGrowthLabels,
    });
    this.writeSummary(series, H, afterTax);
  }

  writeSummary(series, H, afterTax) {
    const { money } = ChartPanel;
    const total = (s) => s.values.reduce((a, b) => a + b, 0);
    const [first, second] = [...series].sort((a, b) => total(b) - total(a));
    const finding = series.length === 1 || total(second) < 0.5
      ? `${first.label}’s investments grow by ${money(total(first))} over ${H} year${H > 1 ? 's' : ''}, `
        + `${money(first.values.at(-1))} of it in year ${H}.`
      : `Over ${H} years, ${first.label}’s investments grow the most, by ${money(total(first))}, `
        + `${money(total(first) - total(second))} more than ${second.label}’s.`;
    this.summary.replaceChildren(
      el('p', {}, finding),
      el('p', { class: 'sv-fine' },
        'Each year’s growth on everything invested, added up across each sub group’s income sources: the initial '
        + 'investment, an invested initial payout, and salary and returns invested in earlier years (amounts invested '
        + 'at the end of a year start growing the next year). Over a timespan it adds up to the gains cashed out at its end. '
        + (afterTax
          ? 'After tax: only what’s left of the salary, returns and payout after their taxes is invested, and the growth '
            + 'is net of the capital gains tax it owes when cashed out at the end of the timespan.'
          : 'Before tax: taxes are left out, so the whole invested share goes in and its growth isn’t taxed.')
        + ' Growth stops when an income source’s timespan ends; indefinite ones aren’t shown.'));
  }
}
