import { el } from './format.js';
import { Calculator } from './Calculator.js';

/**
 * Opportunity risk levels and their aggregate display.
 * Aggregates score each opportunity Low = 0, Neutral = 1, High = 2 and take the average
 * weighted by the size of each opportunity's present value (|PV|), so larger opportunities
 * count for more. If every PV is zero, each opportunity counts equally. The gauge needle
 * shows the weighted average; the bar shows each level's share of value.
 */
export class Risk {
  static LEVELS = [
    { key: 'low', label: 'Low', score: 0 },
    { key: 'neutral', label: 'Neutral', score: 1 },
    { key: 'high', label: 'High', score: 2 },
  ];

  static byKey(key) {
    return Risk.LEVELS.find((l) => l.key === key) ?? Risk.LEVELS[1];
  }

  /**
   * { total, counts, shares, avg (0–2), level, weighted } or null when empty.
   * counts: opportunities per level; shares: fraction of value per level (sums to 1).
   */
  static summarize(opportunities, settings) {
    if (!opportunities.length) return null;
    const counts = { low: 0, neutral: 0, high: 0 };
    const weights = { low: 0, neutral: 0, high: 0 };
    const values = opportunities.map((opp) => Math.abs(Calculator.opportunityPV(opp, settings)));
    // Unbounded (indefinite, divergent) opportunities dominate: weigh only those, equally.
    const unbounded = values.some((v) => !Number.isFinite(v));
    opportunities.forEach((opp, i) => {
      const key = Risk.byKey(opp.risk).key;
      counts[key]++;
      weights[key] += unbounded ? (Number.isFinite(values[i]) ? 0 : 1) : values[i];
    });
    const totalWeight = weights.low + weights.neutral + weights.high;
    const weighted = totalWeight > 0.005;
    const basis = weighted ? weights : counts; // all-zero PVs: count each opportunity equally
    const sum = basis.low + basis.neutral + basis.high;
    const shares = { low: basis.low / sum, neutral: basis.neutral / sum, high: basis.high / sum };
    const avg = shares.neutral + 2 * shares.high;
    const level = avg < 2 / 3 ? 'low' : avg > 4 / 3 ? 'high' : 'neutral';
    return { total: opportunities.length, counts, shares, avg, level, weighted };
  }

  /** Speedometer icon: green/amber/red arc with a needle at `score` (0 = low … 2 = high). */
  static gauge(score) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 18');
    svg.setAttribute('class', 'risk-gauge');
    svg.setAttribute('aria-hidden', 'true');
    // Arc centre (12, 15), radius 8, split into three 60° segments.
    svg.innerHTML = `
      <path class="seg seg-low" d="M4 15A8 8 0 0 1 8 8.07"/>
      <path class="seg seg-neutral" d="M8.6 7.75A8 8 0 0 1 15.4 7.75"/>
      <path class="seg seg-high" d="M16 8.07A8 8 0 0 1 20 15"/>
      <g class="needle" transform="rotate(${(-90 + score * 90).toFixed(1)} 12 15)">
        <path d="M12 15V8.6"/>
      </g>
      <circle class="hub" cx="12" cy="15" r="1.7"/>`;
    return svg;
  }

  /** Empty container for an aggregate indicator; fill it with Risk.render(). */
  static indicator(extraClass = '') {
    return el('span', { class: `risk-indicator ${extraClass}`.trim() });
  }

  /** Draw (or hide) an aggregate indicator for a list of opportunities. */
  static render(node, opportunities, settings) {
    const summary = Risk.summarize(opportunities, settings);
    node.hidden = !summary;
    if (!summary) return;
    const { counts, shares, total, avg, level, weighted } = summary;
    const label = `${Risk.byKey(level).label} risk`;
    const pct = (x) => `${Math.round(x * 100)}%`;
    node.className = node.className.replace(/\brisk-(low|neutral|high)\b/g, '').trim() + ` risk-${level}`;
    node.title = `${label} (${weighted ? 'weighted by present value' : 'no value yet, counted equally'}): `
      + `${pct(shares.low)} low, ${pct(shares.neutral)} neutral, ${pct(shares.high)} high. `
      + `${total} ${total === 1 ? 'opportunity' : 'opportunities'}: `
      + `${counts.low} low, ${counts.neutral} neutral, ${counts.high} high.`;
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', node.title);
    node.replaceChildren(
      Risk.gauge(avg),
      el('span', { class: 'risk-text' },
        el('span', { class: 'risk-label' }, label),
        el('span', { class: 'risk-bar' },
          ...['low', 'neutral', 'high'].filter((k) => shares[k] > 0)
            .map((k) => el('span', { class: `risk-bar-${k}`, style: { flexGrow: shares[k] } })))));
  }

  /** Three-way Low / Neutral / High toggle for one opportunity. */
  static toggle(opp, onChange) {
    const group = el('div', { class: 'risk-toggle', role: 'radiogroup', 'aria-label': 'Risk' });
    const buttons = Risk.LEVELS.map((level) => el('button', {
      type: 'button',
      class: `risk-option risk-${level.key}`,
      role: 'radio',
      onclick: () => {
        opp.risk = level.key;
        sync();
        onChange();
      },
    }, Risk.gauge(level.score), level.label));
    const sync = () => buttons.forEach((b, i) => {
      const on = Risk.LEVELS[i].key === (opp.risk ?? 'neutral');
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    // Arrow keys move the selection, like a native radio group.
    group.addEventListener('keydown', (e) => {
      const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!dir) return;
      e.preventDefault();
      const i = Risk.LEVELS.findIndex((l) => l.key === (opp.risk ?? 'neutral'));
      const next = Math.min(Risk.LEVELS.length - 1, Math.max(0, i + dir));
      buttons[next].click();
      buttons[next].focus();
    });
    group.append(...buttons);
    sync();
    return group;
  }
}
