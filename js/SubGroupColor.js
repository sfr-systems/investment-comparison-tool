import { el } from './format.js';

/**
 * Sub group colors for the strategy comparison charts. A sub group without a chosen color
 * (`sg.color` unset) takes the categorical palette's color for its position (`--series-1..8`, in
 * fixed order; 9+ muted). The picker offers those eight plus four more bright hues
 * (`--pick-*` in styles.css, each with a dark-theme step), saved by key.
 */
export const COLORS = [
  { key: 'blue', name: 'Blue', token: '--series-1' },
  { key: 'orange', name: 'Orange', token: '--series-2' },
  { key: 'aqua', name: 'Aqua', token: '--series-3' },
  { key: 'yellow', name: 'Yellow', token: '--series-4' },
  { key: 'pink', name: 'Pink', token: '--series-5' },
  { key: 'green', name: 'Green', token: '--series-6' },
  { key: 'violet', name: 'Violet', token: '--series-7' },
  { key: 'red', name: 'Red', token: '--series-8' },
  { key: 'cyan', name: 'Cyan', token: '--pick-cyan' },
  { key: 'lime', name: 'Lime', token: '--pick-lime' },
  { key: 'magenta', name: 'Magenta', token: '--pick-magenta' },
  { key: 'gold', name: 'Gold', token: '--pick-gold' },
];
const SERIES = 8;

export class SubGroupColor {
  /** The CSS color a sub group is drawn in (its chosen color, else its position's). */
  static of(strategy, subGroup) {
    const chosen = COLORS.find((c) => c.key === subGroup.color);
    if (chosen) return `var(${chosen.token})`;
    const i = strategy.subGroups.indexOf(subGroup);
    return i >= 0 && i < SERIES ? `var(--series-${i + 1})` : 'var(--muted)';
  }

  /** Name of the color a sub group is drawn in, for labels. */
  static nameOf(strategy, subGroup) {
    const chosen = COLORS.find((c) => c.key === subGroup.color);
    if (chosen) return chosen.name;
    const i = strategy.subGroups.indexOf(subGroup);
    return i >= 0 && i < SERIES ? `${COLORS[i].name} (automatic)` : 'Gray (automatic)';
  }

  /**
   * A color circle button with a dropdown of color circles (and Automatic). `onChange` runs after
   * `subGroup.color` changes. Returns { root, sync } (sync redraws the circle, e.g. after reordering).
   */
  static picker(strategy, subGroup, onChange) {
    const swatch = el('span', { class: 'sg-color-dot' });
    const button = el('button', {
      type: 'button', class: 'icon-btn sg-color-btn', 'aria-haspopup': 'true', 'aria-expanded': 'false',
      onclick: (e) => { e.stopPropagation(); toggle(); },
    }, swatch);
    const choose = (key) => {
      if (key) subGroup.color = key;
      else delete subGroup.color;
      sync();
      close(true);
      onChange();
    };
    const option = (c) => el('button', {
      type: 'button', class: 'sg-color-option', role: 'menuitemradio', title: c.name, 'aria-label': c.name,
      dataset: { key: c.key ?? '' },
      style: c.token ? { background: `var(${c.token})` } : {},
      onclick: () => choose(c.key),
    });
    const options = [{ key: null, name: 'Automatic (by position)' }, ...COLORS].map(option);
    options[0].classList.add('is-auto');
    const menu = el('div', { class: 'sg-color-menu', role: 'menu', 'aria-label': 'Chart color', hidden: true }, options);
    const root = el('div', { class: 'sg-color' }, button, menu);

    const sync = () => {
      swatch.style.background = SubGroupColor.of(strategy, subGroup);
      const name = SubGroupColor.nameOf(strategy, subGroup);
      button.title = `Chart color: ${name}`;
      button.setAttribute('aria-label', `Chart color: ${name}`);
      options.forEach((o) => o.setAttribute('aria-checked', String((o.dataset.key || undefined) === subGroup.color)));
    };
    const onOutside = (e) => { if (!root.contains(e.target)) close(); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
      const i = options.indexOf(document.activeElement);
      const step = { ArrowRight: 1, ArrowDown: 4, ArrowLeft: -1, ArrowUp: -4 }[e.key];
      if (step == null || i < 0) return;
      e.preventDefault();
      options[Math.max(0, Math.min(options.length - 1, i + step))].focus();
    };
    function close(refocus = false) {
      if (menu.hidden) return;
      menu.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', onOutside, true);
      root.removeEventListener('keydown', onKey);
      if (refocus) button.focus();
    }
    function toggle() {
      if (!menu.hidden) { close(); return; }
      menu.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      document.addEventListener('pointerdown', onOutside, true);
      root.addEventListener('keydown', onKey);
      (options.find((o) => o.getAttribute('aria-checked') === 'true') ?? options[0]).focus();
    }
    sync();
    return { root, sync };
  }
}
