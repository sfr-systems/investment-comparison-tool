import { el, formatPV, icon, openPopup } from './format.js';
import { Models } from './Models.js';
import { SeriesPlot } from './SeriesPlot.js';
import { SubGroupColor } from './SubGroupColor.js';


/**
 * One chart in a strategy's comparison section (StrategyCharts): a header (title, controls, expand
 * button), a SeriesPlot and a short summary. Subclasses supply `title`, `controls()` and `draw()`.
 * The expand button opens a large copy (`expanded: true`) in a popup, with its controls in the
 * popup's header; closing it redraws this one.
 */
export class ChartPanel {
  constructor(strategy, ctx, { expanded = false } = {}) {
    this.strategy = strategy;
    this.ctx = ctx;
    this.expanded = expanded;
  }

  /** Calculator lines ({ subGroup, values }) → SeriesPlot series ({ label, color, values }). */
  series(lines, from = 0) {
    const labels = Models.subGroupLabels(this.strategy.subGroups);
    return lines.map(({ subGroup, values }) => ({
      key: subGroup.id,
      label: labels[this.strategy.subGroups.indexOf(subGroup)],
      color: SubGroupColor.of(this.strategy, subGroup),
      values: values.slice(from),
    }));
  }

  static money(v) {
    return formatPV(v).replace('-', '−');
  }

  /** "a", "a and b", "a, b and c". */
  static list(items) {
    return items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0] ?? '';
  }

  render() {
    this.plot = new SeriesPlot({ expanded: this.expanded });
    this.body = el('div', { class: 'cf-body sv-body' });
    this.summary = el('div', { class: 'sv-summary' });
    this.controlsEl = this.controls();
    this.root = el('section', { class: 'sv-panel', 'aria-label': this.title });
    if (!this.expanded) {
      this.root.append(el('div', { class: 'sv-panel-head' },
        el('span', { class: 'eyebrow' }, this.title),
        el('div', { class: 'cf-actions' }, this.controlsEl || '',
          el('button', {
            type: 'button', class: 'icon-btn cf-expand', title: 'Expand chart', 'aria-label': 'Expand chart',
            onclick: () => this.expand(),
          }, icon('expand')))));
    }
    this.root.append(this.body, this.summary);
    this.update();
    return this.root;
  }

  controls() {
    return null;
  }

  /** On/off button that shows or hides the line chart's value labels (saved as `strategy[field]`, hidden when true). */
  labelsButton(field) {
    const button = el('button', {
      type: 'button', class: 'cf-cumulative', title: 'Show or hide the value labels on the lines',
      onclick: () => {
        this.strategy[field] = !this.strategy[field];
        this.update();
        this.ctx.changed({ light: true });
      },
    }, 'Labels');
    return { button, sync: () => button.setAttribute('aria-pressed', String(!this.strategy[field])) };
  }

  expand() {
    const big = new this.constructor(this.strategy, this.ctx, { expanded: true });
    const body = big.render();
    openPopup({
      className: 'sv-dialog',
      label: this.title,
      kicker: el('span', { class: 'eyebrow' }, this.title),
      title: this.strategy.title || 'Untitled strategy',
      controls: big.controlsEl,
      body,
      onClose: () => this.update(),
    });
  }

  update() {
    this.syncControls?.();
    this.draw();
  }

  /** A note in place of the plot (nothing to chart). */
  note(text) {
    this.body.replaceChildren(el('p', { class: 'cf-note' }, text));
    this.summary.replaceChildren();
  }

  /** [a | b] segmented toggle over `options` ({ key, label, title }) for a saved strategy field. */
  segmented(field, options, fallback, ariaLabel) {
    const group = el('div', { class: 'unit-toggle cf-mode', role: 'radiogroup', 'aria-label': ariaLabel });
    const value = () => this.strategy[field] ?? fallback;
    const buttons = options.map((o) => el('button', {
      type: 'button', class: 'unit-option', role: 'radio', title: o.title,
      onclick: () => {
        if (value() === o.key) return;
        this.strategy[field] = o.key;
        this.update();
        this.ctx.changed({ light: true });
      },
    }, o.label));
    group.addEventListener('keydown', (e) => {
      const i = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: 0, ArrowUp: 0 }[e.key];
      if (i == null) return;
      e.preventDefault();
      buttons[i].click();
      buttons[i].focus();
    });
    group.append(...buttons);
    const sync = () => buttons.forEach((b, i) => {
      const on = options[i].key === value();
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    return { group, sync };
  }
}
