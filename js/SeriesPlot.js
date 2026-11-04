import { el, formatPV } from './format.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const compact = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2,
});
const short = (v) => compact.format(v).replace('-', '−');
const signed = (v) => formatPV(v).replace('-', '−');
/** Smallest gaps (px) between neighbouring value labels / year labels before some are skipped. */
const LABEL_GAP = { value: 46, year: 22 };
const LABEL_HEIGHT = 14;

/**
 * Plot for the strategy charts: one series per sub group across years, drawn as lines (with a
 * marker and a value label at each year) or as grouped bars (one bar per series in each year).
 * Hover or arrow keys show every series' value for a year. Value labels and year labels that
 * would collide are thinned out (every 2nd, 5th… year) and stacked labels are nudged apart.
 */
export class SeriesPlot {
  /** expanded: the popup's large copy (more ticks and labels). */
  constructor({ expanded = false } = {}) {
    this.expanded = expanded;
    this.active = -1;
    this.observer = new ResizeObserver(() => this.layout());
  }

  /**
   * Draw into `body`. years: the year of each point ([0..H] or [1..H]); series: [{ label, color,
   * values }] with values parallel to years; type: 'line' | 'bar'; ariaLabel names the plot;
   * tipNote follows the year in the tooltip title.
   */
  draw(body, { years, series, type = 'line', ariaLabel, tipNote = '' }) {
    this.years = years;
    this.series = series;
    this.type = type;
    this.tipNote = tipNote;
    const values = series.flatMap((s) => s.values);
    const { bottom, top, ticks } = SeriesPlot.scale(Math.min(0, ...values), Math.max(0, ...values), this.expanded ? 8 : 4);
    const count = years.length;
    // Lines run edge to edge; bars sit in the middle of each year's column.
    this.xPct = type === 'bar'
      ? (i) => ((i + 0.5) / count) * 100
      : (i) => (count > 1 ? (i / (count - 1)) * 100 : 50);
    this.yPct = (v) => ((v - bottom) / (top - bottom)) * 100; // from the bottom

    const yAxis = el('div', { class: 'cf-y-axis', 'aria-hidden': 'true' },
      ticks.map((v) => el('span', { style: { bottom: `${this.yPct(v)}%` } }, short(v))));
    const grid = el('div', { class: 'cf-grid', 'aria-hidden': 'true' },
      ticks.map((v) => el('span', { class: v === 0 ? 'is-zero' : '', style: { bottom: `${this.yPct(v)}%` } })));

    this.crosshair = el('div', { class: 'sv-crosshair', hidden: true });
    this.tooltip = el('div', { class: 'cf-tooltip', role: 'status', hidden: true });
    this.markers = [];
    this.labels = [];
    const marks = type === 'bar' ? this.bars(bottom, top) : this.lines();
    this.plot = el('div', {
      class: `cf-plot sv-plot is-${type}`, tabindex: '0',
      'aria-label': `${ariaLabel}. Use the left and right arrow keys to read each year.`,
      onmousemove: (e) => {
        const box = this.plot.getBoundingClientRect();
        const f = (e.clientX - box.left) / box.width;
        this.setActive(type === 'bar' ? Math.floor(f * count) : Math.round(f * (count - 1)));
      },
      onmouseleave: () => this.setActive(-1),
      onfocus: () => { if (this.active < 0) this.setActive(count - 1); },
      onblur: () => this.setActive(-1),
      onkeydown: (e) => {
        const next = { ArrowRight: this.active + 1, ArrowLeft: this.active - 1, Home: 0, End: count - 1 }[e.key];
        if (next == null) return;
        e.preventDefault();
        this.setActive(next);
      },
    }, grid, ...marks, this.crosshair, ...this.markers, ...this.labels, this.tooltip);

    this.yearLabels = years.map((t, i) => el('span', { style: { left: `${this.xPct(i)}%` } }, String(t)));
    const xAxis = el('div', { class: 'sv-x-axis', 'aria-hidden': 'true' }, this.yearLabels);
    const legend = series.length > 1 && el('ul', { class: 'cf-legend' },
      series.map((s) => el('li', {}, el('span', { class: `sv-swatch${type === 'bar' ? ' is-bar' : ''}`, style: { background: s.color } }), s.label)));

    this.active = -1;
    body.replaceChildren(
      el('div', { class: 'cf-frame' }, yAxis, this.plot, el('span'), xAxis, el('span'),
        el('span', { class: 'cf-x-title' }, years[0] === 0 ? 'Year (0 = start)' : 'Year')),
      legend || '');
    this.observer.disconnect();
    this.observer.observe(this.plot);
  }

  /** SVG polylines (stretched with the plot; strokes keep their width), plus a marker and label per point. */
  lines() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'sv-lines');
    svg.setAttribute('viewBox', '0 0 1000 1000');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    this.series.forEach((s, si) => {
      const path = document.createElementNS(SVG_NS, 'polyline');
      path.setAttribute('points', s.values.map((v, i) => `${this.xPct(i) * 10},${1000 - this.yPct(v) * 10}`).join(' '));
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      path.style.stroke = s.color;
      svg.append(path);
      s.values.forEach((v, i) => {
        const pos = { left: `${this.xPct(i)}%`, bottom: `${this.yPct(v)}%` };
        this.markers.push(el('span', { class: 'sv-marker', dataset: { i, s: si }, style: { ...pos, background: s.color } }));
        this.labels.push(el('span', { class: 'sv-value', dataset: { i, s: si }, style: pos }, short(v)));
      });
    });
    return [svg];
  }

  /** One column per year with a bar per series (2px apart), growing up or down from 0. */
  bars(bottom, top) {
    const zero = this.yPct(0);
    this.cols = this.years.map((_, i) => el('div', { class: 'sv-col' },
      this.series.map((s) => {
        const v = s.values[i];
        const h = Math.abs(this.yPct(v) - zero);
        return el('span', { class: 'sv-slot' }, el('span', {
          class: `sv-bar${v < 0 ? ' is-negative' : ''}`,
          style: { background: s.color, height: `${h}%`, bottom: `${v < 0 ? zero - h : zero}%` },
        }));
      })));
    return [el('div', { class: 'sv-cols', 'aria-hidden': 'true' }, this.cols)];
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

  /** Thin out year and value labels to what fits, and nudge stacked value labels apart. */
  layout() {
    if (!this.plot?.isConnected) return;
    const width = this.plot.clientWidth;
    const height = this.plot.clientHeight;
    const count = this.years.length;
    const pitch = width / Math.max(1, this.type === 'bar' ? count : count - 1);
    const every = (gap) => [1, 2, 5, 10, 20, 25, 50, 100].find((k) => k * pitch >= gap) ?? count;
    const yearStep = every(LABEL_GAP.year);
    const last = count - 1;
    // Every yearStep-th year, and the last; the one before the last steps aside if they'd touch.
    const tail = last % yearStep;
    this.yearLabels.forEach((span, i) => {
      span.hidden = (i % yearStep !== 0 && i !== last) || (tail && i === last - tail && tail * pitch < LABEL_GAP.year);
    });
    if (!this.labels.length) return;

    const valueStep = every(LABEL_GAP.value);
    const shown = (i) => i % valueStep === 0 || (i === last && last % valueStep >= valueStep / 2);
    const byYear = new Map();
    for (const label of this.labels) {
      const i = Number(label.dataset.i);
      // Zeros (the start, or after a timespan ends) would only crowd the axis.
      const s = this.series[label.dataset.s];
      label.hidden = !shown(i) || Math.abs(s.values[i]) < 0.5;
      label.style.transform = '';
      if (label.hidden) continue;
      if (!byYear.has(i)) byYear.set(i, []);
      byYear.get(i).push(label);
    }
    // Labels sit just above their marker; in a year, the lower of two that overlap moves down
    // below its marker instead, or further down if that's taken too.
    for (const labels of byYear.values()) {
      const items = labels.map((label) => {
        const s = this.series[label.dataset.s];
        const y = (1 - this.yPct(s.values[label.dataset.i]) / 100) * height; // marker, from the top
        return { label, y };
      }).sort((a, b) => a.y - b.y);
      let floor = -Infinity; // bottom edge of the label placed above
      for (const item of items) {
        let top = item.y - 7 - LABEL_HEIGHT; // above the marker
        if (top < floor) top = Math.max(item.y + 7, floor); // else below it
        if (top + LABEL_HEIGHT > height) { // no room below the plot's floor
          item.label.hidden = true;
          continue;
        }
        // The label's bottom edge sits on the marker until moved; the first and last years' labels
        // run inward so they stay inside the plot.
        const i = Number(item.label.dataset.i);
        const x = i === 0 ? '0%' : i === count - 1 ? '-100%' : '-50%';
        item.label.style.transform = `translate(${x}, ${top - item.y + LABEL_HEIGHT}px)`;
        floor = top + LABEL_HEIGHT;
      }
    }
  }

  /** Crosshair, highlighted markers or bars, and the tooltip for point i (−1 hides them). */
  setActive(i) {
    if (!this.plot) return;
    const count = this.years.length;
    if (i >= count) i = count - 1;
    this.active = i;
    const on = i >= 0;
    this.plot.classList.toggle('has-active', on);
    this.crosshair.hidden = !on || this.type === 'bar';
    this.tooltip.hidden = !on;
    this.markers.forEach((m) => m.classList.toggle('is-active', on && Number(m.dataset.i) === i));
    this.cols?.forEach((c, j) => c.classList.toggle('is-active', j === i));
    if (!on) return;
    const x = this.xPct(i);
    this.crosshair.style.left = `${x}%`;
    const t = this.years[i];
    this.tooltip.replaceChildren(
      el('div', { class: 'cf-tip-title' }, t === 0 ? 'Start' : `Year ${t}`,
        this.tipNote && el('span', { class: 'muted' }, ` · ${this.tipNote}`)),
      ...this.series.map((s) => el('div', { class: 'cf-tip-row' },
        el('span', { class: 'sv-swatch', style: { background: s.color } }),
        el('span', {}, s.label), el('span', { class: 'cf-tip-value' }, signed(s.values[i])))));
    // Beside the point, flipping to its left in the right half of the plot.
    const right = x > 50;
    this.tooltip.style.left = right ? '' : `calc(${x}% + 14px)`;
    this.tooltip.style.right = right ? `calc(${100 - x}% + 14px)` : '';
  }
}
