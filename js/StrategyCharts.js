import { el, icon } from './format.js';
import { NetValueChart } from './NetValueChart.js';
import { GrowthChart } from './GrowthChart.js';

/**
 * Sub group comparison at the bottom of a strategy: net value if cashed out (NetValueChart) with
 * investment growth (GrowthChart) to its right, side by side on wide screens. Each sub
 * group has the same color in both. The section collapses as one (saved as
 * `strategy.valueChartCollapsed`); each chart expands on its own.
 */
export class StrategyCharts {
  constructor(strategy, ctx) {
    this.strategy = strategy;
    this.ctx = ctx;
    this.panels = [new NetValueChart(strategy, ctx), new GrowthChart(strategy, ctx)];
  }

  render() {
    this.toggle = el('button', {
      type: 'button', class: 'icon-btn collapse-btn sv-toggle', 'aria-label': 'Show or hide the comparison charts',
      onclick: () => {
        this.strategy.valueChartCollapsed = !this.strategy.valueChartCollapsed;
        this.update();
        this.ctx.changed({ light: true });
      },
    }, icon('chevron'));
    this.content = el('div', { class: 'sv-grid' });
    this.root = el('section', { class: 'sv-chart', 'aria-label': 'Sub group comparison' },
      el('header', {
        class: 'sv-head',
        onclick: (e) => { if (!e.target.closest('button')) this.toggle.click(); },
      }, this.toggle, el('span', { class: 'eyebrow' }, 'Sub group comparison')),
      this.content);
    this.update();
    return this.root;
  }

  update() {
    const collapsed = !!this.strategy.valueChartCollapsed;
    this.root.classList.toggle('collapsed', collapsed);
    this.toggle.setAttribute('aria-expanded', String(!collapsed));
    this.content.hidden = collapsed;
    if (collapsed) return; // drawn when opened
    if (!this.content.childElementCount) this.content.append(...this.panels.map((p) => p.render()));
    else this.panels.forEach((p) => p.update());
  }
}
