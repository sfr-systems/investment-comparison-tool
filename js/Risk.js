import { el } from './format.js';

/**
 * Opportunity risk levels and their aggregate display.
 * Aggregates score each opportunity Low = 0, Neutral = 1, High = 2 and average them
 * (unweighted); the gauge needle shows the average and a bar shows the mix.
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

  /** { total, counts: {low, neutral, high}, avg (0–2), level } or null when empty. */
  static summarize(opportunities) {
    if (!opportunities.length) return null;
    const counts = { low: 0, neutral: 0, high: 0 };
    for (const opp of opportunities) counts[Risk.byKey(opp.risk).key]++;
    const total = opportunities.length;
    const avg = (counts.neutral + 2 * counts.high) / total;
    const level = avg < 2 / 3 ? 'low' : avg > 4 / 3 ? 'high' : 'neutral';
    return { total, counts, avg, level };
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
  static render(node, opportunities) {
    const summary = Risk.summarize(opportunities);
    node.hidden = !summary;
    if (!summary) return;
    const { counts, total, avg, level } = summary;
    const label = level === 'neutral' ? 'Neutral risk' : `${Risk.byKey(level).label} risk`;
    node.className = node.className.replace(/\brisk-(low|neutral|high)\b/g, '').trim() + ` risk-${level}`;
    node.title = `${label}: ${counts.low} low, ${counts.neutral} neutral, ${counts.high} high `
      + `(${total} ${total === 1 ? 'opportunity' : 'opportunities'})`;
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', node.title);
    node.replaceChildren(
      Risk.gauge(avg),
      el('span', { class: 'risk-text' },
        el('span', { class: 'risk-label' }, label),
        el('span', { class: 'risk-bar' },
          ...['low', 'neutral', 'high'].filter((k) => counts[k])
            .map((k) => el('span', { class: `risk-bar-${k}`, style: { flexGrow: counts[k] } })))));
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
