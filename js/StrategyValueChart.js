import { el, formatPV, icon, openPopup } from './format.js';
import { Calculator } from './Calculator.js';
import { Models } from './Models.js';

/** Categorical line colors, in fixed order (validated palette, `--series-*` in styles.css). */
const SERIES = 8;
const SVG_NS = 'http://www.w3.org/2000/svg';

const compact = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2,
});
const signed = (v) => formatPV(v).replace('-', '−');
const yearLabel = (t) => (t === 0 ? 'Start' : `Year ${t}`);

/**
 * Line chart at the bottom of a strategy comparing its sub groups' net value if, at the end of
 * each year, they cashed out every investment and paid all taxes (Calculator.cashOutSeries), with
 * a short summary under it. Collapsible (saved as `strategy.valueChartCollapsed`) and expandable
 * into the large popup (`expanded: true` is the popup's copy). Hover or arrow keys on the plot
 * show every sub group's value for a year.
 */
export class StrategyValueChart {
  constructor(strategy, ctx, { expanded = false } = {}) {
    this.strategy = strategy;
    this.ctx = ctx;
    this.expanded = expanded;
    this.active = -1;
  }

  render() {
    this.body = el('div', { class: 'cf-body sv-body' });
    this.summary = el('div', { class: 'sv-summary' });
    this.content = el('div', { class: 'sv-content' }, this.body, this.summary);
    this.root = el('section', { class: `sv-chart${this.expanded ? ' is-expanded' : ''}`, 'aria-label': 'Net value if cashed out' });
    if (!this.expanded) {
      this.toggle = el('button', {
        type: 'button', class: 'icon-btn collapse-btn sv-toggle', 'aria-label': 'Show or hide the chart',
        onclick: () => {
          this.strategy.valueChartCollapsed = !this.strategy.valueChartCollapsed;
          this.update();
          this.ctx.changed({ light: true });
        },
      }, icon('chevron'));
      this.root.append(el('header', {
        class: 'sv-head',
        onclick: (e) => { if (!e.target.closest('button')) this.toggle.click(); },
      },
      this.toggle,
      el('span', { class: 'eyebrow' }, 'Net value if cashed out, by year'),
      this.expandBtn = el('button', {
        type: 'button', class: 'icon-btn cf-expand sv-expand', title: 'Expand chart', 'aria-label': 'Expand chart',
        onclick: () => this.expand(),
      }, icon('expand'))));
    }
    this.root.append(this.content);
    this.update();
    return this.root;
  }

  /** Open the large copy in a popup; closing it redraws this one. */
  expand() {
    const big = new StrategyValueChart(this.strategy, this.ctx, { expanded: true });
    openPopup({
      className: 'sv-dialog',
      label: 'Net value if cashed out, by year',
      kicker: el('span', { class: 'eyebrow' }, 'Net value if cashed out, by year'),
      title: this.strategy.title || 'Untitled strategy',
      body: big.render(),
      onClose: () => this.update(),
    });
  }

  update() {
    const collapsed = !this.expanded && !!this.strategy.valueChartCollapsed;
    this.root.classList.toggle('collapsed', collapsed);
    this.toggle?.setAttribute('aria-expanded', String(!collapsed));
    if (this.expandBtn) this.expandBtn.hidden = collapsed;
    this.content.hidden = collapsed;
    if (collapsed) return; // drawn when opened
    this.draw();
  }

  draw() {
    this.plot = null;
    const settings = this.ctx.project.settings;
    const series = Calculator.cashOutSeries(this.strategy, settings);
    const labels = Models.subGroupLabels(this.strategy.subGroups);
    this.years = series.years;
    this.lines = series.lines.map((line) => {
      const i = this.strategy.subGroups.indexOf(line.subGroup);
      return { ...line, label: labels[i], color: i < SERIES ? `var(--series-${i + 1})` : 'var(--muted)' };
    });
    const hasAmounts = this.lines.some((l) => l.values.some((v) => Math.abs(v) >= 0.005));
    if (!hasAmounts) {
      this.body.replaceChildren(el('p', { class: 'cf-note' }, series.excluded && !this.lines.length
        ? 'Income sources on an indefinite timespan never cash out, so there’s nothing to chart.'
        : 'Enter amounts in this strategy’s income sources to compare its sub groups here.'));
      this.summary.replaceChildren();
      return;
    }
    const all = this.lines.flatMap((l) => l.values);
    this.buildPlot(StrategyValueChart.scale(Math.min(0, ...all), Math.max(0, ...all), this.expanded ? 8 : 4));
    this.writeSummary(series.excluded);
  }

  /** Round axis bounds covering [min, max] (which include 0) with about `count` steps. */
  static scale(min, max, count) {
    const range = max - min || 1;
    const raw = range / count;
    const step = [1, 2, 2.5, 5, 10].map((m) => m * 10 ** Math.floor(Math.log10(raw))).find((s) => s >= raw);
    const bottom = Math.floor(min / step + 1e-9) * step;
    const top = Math.max(bottom + step, Math.ceil(max / step - 1e-9) * step);
    const ticks = [];
    for (let v = bottom; v <= top + step / 1e6; v += step) ticks.push(Math.abs(v) < step / 1e6 ? 0 : v);
    return { bottom, top, ticks };
  }

  buildPlot({ bottom, top, ticks }) {
    const H = this.years;
    const xPct = (t) => (H ? (t / H) * 100 : 50);
    const yPct = (v) => ((v - bottom) / (top - bottom)) * 100; // from the bottom

    const yAxis = el('div', { class: 'cf-y-axis', 'aria-hidden': 'true' },
      ticks.map((v) => el('span', { style: { bottom: `${yPct(v)}%` } }, compact.format(v).replace('-', '−'))));
    const grid = el('div', { class: 'cf-grid', 'aria-hidden': 'true' },
      ticks.map((v) => el('span', { class: v === 0 ? 'is-zero' : '', style: { bottom: `${yPct(v)}%` } })));

    // Lines stretch with the plot (viewBox 0..1000 both ways); strokes keep their width.
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'sv-lines');
    svg.setAttribute('viewBox', '0 0 1000 1000');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    for (const line of this.lines) {
      const path = document.createElementNS(SVG_NS, 'polyline');
      path.setAttribute('points', line.values
        .map((v, t) => `${xPct(t) * 10},${1000 - yPct(v) * 10}`).join(' '));
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      path.style.stroke = line.color;
      svg.append(path);
    }

    this.crosshair = el('div', { class: 'sv-crosshair', hidden: true });
    this.dots = this.lines.map((line) => el('span', { class: 'sv-dot', hidden: true, style: { background: line.color } }));
    this.tooltip = el('div', { class: 'cf-tooltip', role: 'status', hidden: true });
    this.xPct = xPct;
    this.yPct = yPct;
    this.plot = el('div', {
      class: 'cf-plot sv-plot', tabindex: '0',
      'aria-label': 'Net value by year. Use the left and right arrow keys to read each year.',
      onmousemove: (e) => {
        const box = this.plot.getBoundingClientRect();
        this.setActive(H ? Math.round(((e.clientX - box.left) / box.width) * H) : 0);
      },
      onmouseleave: () => this.setActive(-1),
      onfocus: () => { if (this.active < 0) this.setActive(H); },
      onblur: () => this.setActive(-1),
      onkeydown: (e) => {
        const next = { ArrowRight: this.active + 1, ArrowLeft: this.active - 1, Home: 0, End: H }[e.key];
        if (next == null) return;
        e.preventDefault();
        this.setActive(Math.max(0, Math.min(H, next)));
      },
    }, grid, svg, this.crosshair, ...this.dots, this.tooltip);

    // About 6 year labels on the card, 12 in the popup.
    const target = this.expanded ? 12 : 6;
    const every = [1, 2, 5, 10, 20, 25, 50, 100].find((k) => H / k <= target) ?? Math.ceil(H / target);
    const xTicks = [];
    for (let t = 0; t <= H; t += every) xTicks.push(t);
    const xAxis = el('div', { class: 'sv-x-axis', 'aria-hidden': 'true' },
      xTicks.map((t) => el('span', { style: { left: `${xPct(t)}%` } }, String(t))));

    const legend = this.lines.length > 1 && el('ul', { class: 'cf-legend' },
      this.lines.map((l) => el('li', {}, el('span', { class: 'sv-swatch', style: { background: l.color } }), l.label)));

    this.active = -1;
    this.body.replaceChildren(
      el('div', { class: 'cf-frame' }, yAxis, this.plot, el('span'), xAxis, el('span'),
        el('span', { class: 'cf-x-title' }, 'Year (0 = start)')),
      legend || '');
  }

  /** Crosshair, dots and tooltip for year t (−1 hides them). */
  setActive(t) {
    if (!this.plot) return;
    this.active = t;
    const on = t >= 0;
    this.crosshair.hidden = !on;
    this.tooltip.hidden = !on;
    this.dots.forEach((d) => { d.hidden = !on; });
    if (!on) return;
    const x = this.xPct(t);
    this.crosshair.style.left = `${x}%`;
    this.lines.forEach((line, i) => {
      Object.assign(this.dots[i].style, { left: `${x}%`, bottom: `${this.yPct(line.values[t])}%` });
    });
    this.tooltip.replaceChildren(
      el('div', { class: 'cf-tip-title' }, yearLabel(t), el('span', { class: 'muted' }, ' · if cashed out')),
      ...this.lines.map((line) => el('div', { class: 'cf-tip-row' },
        el('span', { class: 'sv-swatch', style: { background: line.color } }),
        el('span', {}, line.label), el('span', { class: 'cf-tip-value' }, signed(line.values[t])))));
    // Beside the crosshair, flipping to its left in the right half of the plot.
    const right = x > 50;
    this.tooltip.style.left = right ? '' : `calc(${x}% + 12px)`;
    this.tooltip.style.right = right ? `calc(${100 - x}% + 12px)` : '';
  }

  /** What the chart shows, and what it says about these sub groups. */
  writeSummary(excluded) {
    const H = this.years;
    const lines = this.lines;
    const taxesOn = Calculator.taxesOn(this.ctx.project.settings);
    const at = (t) => [...lines].sort((a, b) => b.values[t] - a.values[t]);
    const money = (v) => signed(v);
    const findings = [];
    const when = H ? `Cashed out after year ${H}` : 'Cashed out at the start';
    if (lines.length === 1) {
      const [only] = lines;
      findings.push(`${when}, ${only.label} would be worth ${money(only.values[H])}.`);
    } else {
      const [first, second] = at(H);
      const lead = first.values[H] - second.values[H];
      findings.push(lead < 0.5
        ? `${when}, ${first.label} and ${second.label} come out even at ${money(first.values[H])}.`
        : `${when}, ${first.label} comes out ahead at ${money(first.values[H])}, ${money(lead)} more than ${second.label}.`);
      // The last year the lead changed hands, if it did (ignoring the start, where most are even;
      // a tie keeps the current leader).
      let leader = at(Math.min(1, H))[0];
      let since = 0;
      let before = leader;
      for (let t = 2; t <= H; t++) {
        const top = at(t)[0];
        if (top !== leader && top.values[t] > leader.values[t] + 0.5) {
          before = leader;
          leader = top;
          since = t;
        }
      }
      if (since) findings.push(`${before.label} leads through year ${since - 1}; ${leader.label} pulls ahead from year ${since}.`);
    }
    const loans = this.strategy.subGroups.some((sg) => sg.opportunities.some((o) => +o.loan?.amount > 0));
    const less = ['what was paid in', loans && 'loan repayments made', taxesOn && 'taxes'].filter(Boolean);
    const deductions = less.length > 1 ? `${less.slice(0, -1).join(', ')} and ${less.at(-1)}` : less[0];
    this.summary.replaceChildren(
      el('p', {}, findings.join(' ')),
      el('p', { class: 'sv-fine' },
        `Each line is what a sub group would be worth if, at the end of that year, it sold every investment`
        + (taxesOn ? ' and paid all taxes owed, including the capital gains tax on the sale' : '')
        + `: everything received so far, less ${deductions}`
        + ', plus what the investments sell for. Amounts are as received, not discounted'
        + (taxesOn ? '' : ', and taxes aren’t included (turn on Include taxes above)')
        + '. After an income source’s timespan ends, it keeps its final value.'
        + (loans ? ' Loan balances still owed aren’t subtracted.' : '')
        + (excluded ? ` ${excluded} income source${excluded > 1 ? 's' : ''} on an indefinite timespan ${excluded > 1 ? 'aren’t' : 'isn’t'} shown, since ${excluded > 1 ? 'they' : 'it'} never cash${excluded > 1 ? '' : 'es'} out.` : '')));
  }
}
