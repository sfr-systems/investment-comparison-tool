const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function formatUSD(value) {
  if (Number.isNaN(value)) return '—';
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '−∞';
  const v = Math.abs(value) < 0.005 ? 0 : value; // avoid "-$0.00"
  return usd.format(v);
}

const usdWhole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/**
 * Display rounding for present values: round to the largest power of ten that is no more than
 * 0.1% of the value (e.g. $187,086.31 → $187,100). Whole dollars once that step reaches $1;
 * otherwise cents are kept (never finer than $0.01).
 */
export function roundPV(value) {
  const abs = Math.abs(value);
  if (abs < 0.005) return { value: 0, step: 0.01 };
  const step = Math.max(0.01, 10 ** Math.floor(Math.log10(abs * 0.001)));
  return { value: Math.round(value / step) * step, step };
}

export function formatPV(value) {
  if (!Number.isFinite(value)) return formatUSD(value);
  const { value: rounded, step } = roundPV(value);
  return step >= 1 ? usdWhole.format(rounded) : formatUSD(rounded);
}

/** Show a rounded PV in `node`, with the exact amount on hover. */
export function showPV(node, value) {
  node.textContent = formatPV(value);
  node.title = Number.isNaN(value) ? 'Undefined: combines unbounded gains and losses'
    : !Number.isFinite(value) ? 'Unbounded: grows without limit on an indefinite timespan'
      : `Exact: ${formatUSD(value)}`;
  return node;
}

export function formatPct(value) {
  return `${Number(value) || 0}%`;
}

/**
 * Tiny DOM builder: el('div', { class: 'x', onclick: fn }, child, 'text').
 * Keys starting with "on" become listeners; `dataset` and `style` objects are merged.
 */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'dataset' || key === 'style') {
      Object.assign(node[key], value);
    } else if (key in node && key !== 'list') {
      node[key] = value;
    } else {
      node.setAttribute(key, value === true ? '' : value);
    }
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function debounce(fn, ms) {
  let timer = null;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(...args); }, ms);
  };
  debounced.flush = () => {
    if (timer) { clearTimeout(timer); timer = null; fn(); }
  };
  return debounced;
}

export function confirmDelete(kind, name) {
  return window.confirm(`Delete ${kind} "${name || 'Untitled'}"? This cannot be undone.`);
}

/** Mark a field invalid with a message, or clear it. Returns `ok`. */
export function setValidity(input, ok, message = '') {
  input.classList.toggle('invalid', !ok);
  input.setAttribute('aria-invalid', String(!ok));
  input.title = ok ? '' : message;
  return ok;
}

/** "6000000.5" → "6,000,000.5". Keeps a trailing "." or partial decimals while typing. */
export function groupDigits(str) {
  const m = /^(-?)(\d*)(\.?\d*)$/.exec(str);
  if (!m) return str;
  const [, sign, int, frac] = m;
  return sign + int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + frac;
}

/**
 * Validated numeric text input with thousands separators (type="number" can't show commas).
 * Calls onValue(number) only when the value passes:
 *   min (inclusive), greaterThan (exclusive), integer, emptyAs (value used when blank; null = blank invalid).
 * arrowStep: when set, ArrowUp/ArrowDown add/subtract this amount (staying within the rules above).
 */
export function numberInput({ value, min, greaterThan, integer = false, emptyAs = 0,
  arrowStep = null, message = 'Invalid value', onValue, ...attrs }) {
  const input = el('input', {
    type: 'text',
    inputMode: integer ? 'numeric' : 'decimal',
    autocomplete: 'off',
    value: value == null || value === '' ? '' : groupDigits(String(value)),
    ...attrs,
  });
  input.classList.add('num-input');

  const reformat = () => {
    const old = input.value;
    const caret = input.selectionStart ?? old.length;
    // Count meaningful characters left of the caret so it can be restored after regrouping.
    const keepBefore = old.slice(0, caret).replace(/[^\d.-]/g, '').length;
    const cleaned = old.replace(/[^\d.-]/g, '');
    const next = groupDigits(cleaned);
    if (next === old) return;
    input.value = next;
    let pos = 0;
    for (let seen = 0; pos < next.length && seen < keepBefore; pos++) {
      if (/[\d.-]/.test(next[pos])) seen++;
    }
    input.setSelectionRange(pos, pos);
  };

  const validate = () => {
    const raw = input.value.replace(/,/g, '').trim();
    const wellFormed = raw === '' || /^-?(\d+\.?\d*|\.\d+)$/.test(raw);
    const n = raw === '' ? emptyAs : Number(raw);
    let ok = wellFormed && n != null && Number.isFinite(n);
    if (ok && min != null && n < min) ok = false;
    if (ok && greaterThan != null && n <= greaterThan) ok = false;
    if (ok && integer && !Number.isInteger(n)) ok = false;
    if (setValidity(input, ok, message)) onValue(n);
  };

  input.addEventListener('input', () => { reformat(); validate(); });

  if (arrowStep) {
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault(); // keep the caret where it is
      const current = Number(input.value.replace(/,/g, ''));
      const base = input.value.trim() !== '' && Number.isFinite(current) ? current : (min ?? 0);
      // Round to avoid float drift (e.g. 5.1 + 1 = 6.1, not 6.1000000000000005).
      const next = Math.round((base + (e.key === 'ArrowUp' ? arrowStep : -arrowStep)) * 1e6) / 1e6;
      if (min != null && next < min) return;
      if (greaterThan != null && next <= greaterThan) return;
      if (integer && !Number.isInteger(next)) return;
      input.value = groupDigits(String(next));
      validate();
    });
  }
  return input;
}

const ICON_PATHS = {
  chevron: '<path d="M6 9l6 6 6-6"/>',
  chevronUp: '<path d="M6 15l6-6 6 6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrowLeft: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  arrowRight: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  alert: '<path d="M10.3 3.9 1.8 18.2a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4.5M12 17.5h.01"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
};

/** Inline stroke icon (decorative; pair with a text label or aria-label). */
export function icon(name, className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `icon ${className}`.trim());
  svg.innerHTML = ICON_PATHS[name];
  return svg;
}
