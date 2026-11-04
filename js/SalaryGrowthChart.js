import { el } from './format.js';
import { Calculator } from './Calculator.js';
import { ChartPanel } from './ChartPanel.js';

const TYPES = [
  { key: 'bar', label: 'Bar', title: 'Bars: one per sub group in each year' },
  { key: 'line', label: 'Line', title: 'Lines: one per sub group' },
];

/**
 * Each year's growth on invested salary, by sub group (Calculator.salaryGrowthSeries): bars by
 * default or lines ([Bar | Line], saved as `strategy.growthChartType`), before tax by default or
 * after tax (the After tax button, saved as `strategy.growthAfterTax`; needs Include taxes).
 */
export class SalaryGrowthChart extends ChartPanel {
  get title() {
    return 'Invested salary growth, by year';
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
    this.syncControls = () => {
      type.sync();
      const taxesOn = Calculator.taxesOn(this.ctx.project.settings);
      this.taxBtn.disabled = !taxesOn;
      this.taxBtn.setAttribute('aria-pressed', String(this.afterTax()));
      this.taxBtn.title = taxesOn
        ? 'Show growth after taxes: only after-tax salary is invested, and growth is net of the capital gains tax due when sold'
        : 'Turn on Include taxes above to see growth after taxes';
    };
    return el('div', { class: 'cf-controls' }, type.group, this.taxBtn);
  }

  /** After tax only while the project includes taxes. */
  afterTax() {
    return !!this.strategy.growthAfterTax && Calculator.taxesOn(this.ctx.project.settings);
  }

  draw() {
    const settings = this.ctx.project.settings;
    const afterTax = this.afterTax();
    const { years: H, lines } = Calculator.salaryGrowthSeries(this.strategy, settings, { afterTax });
    // Year 0 never earns growth, so the chart starts at year 1.
    const series = this.series(lines, 1);
    if (!H || !series.some((s) => s.values.some((v) => Math.abs(v) >= 0.005))) {
      this.note('No income source here invests salary yet. Turn on “Invest some or all salary” in an income source '
        + '(with a growth rate) to compare its growth here.');
      return;
    }
    this.plot.draw(this.body, {
      years: Array.from({ length: H }, (_, i) => i + 1), series,
      type: this.strategy.growthChartType === 'line' ? 'line' : 'bar',
      ariaLabel: this.title, tipNote: afterTax ? 'growth after tax' : 'growth before tax',
    });
    this.writeSummary(series, H, afterTax);
  }

  writeSummary(series, H, afterTax) {
    const { money } = ChartPanel;
    const total = (s) => s.values.reduce((a, b) => a + b, 0);
    const ranked = [...series].sort((a, b) => total(b) - total(a));
    const [first, second] = ranked;
    const finding = series.length === 1 || total(second) < 0.5
      ? `${first.label} earns ${money(total(first))} of growth on invested salary over ${H} year${H > 1 ? 's' : ''}, `
        + `${money(first.values.at(-1))} of it in year ${H}.`
      : `Over ${H} years, ${first.label} earns the most growth on invested salary, ${money(total(first))}, `
        + `${money(total(first) - total(second))} more than ${second.label}.`;
    this.summary.replaceChildren(
      el('p', {}, finding),
      el('p', { class: 'sv-fine' },
        'Each year’s growth on the salary invested in earlier years (salary invested at the end of a year starts '
        + 'growing the next year), added up across each sub group’s income sources. '
        + (afterTax
          ? 'After tax: only the invested share of salary left after its taxes goes in, and the growth is net of the '
            + 'capital gains tax it would owe when cashed out at the end of the timespan.'
          : 'Before tax: taxes are left out, so the whole invested share of the salary goes in and its growth isn’t taxed.')
        + ' Growth stops when an income source’s timespan ends; indefinite ones aren’t shown.'));
  }
}
