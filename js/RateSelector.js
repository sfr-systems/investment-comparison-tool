import { el, numberInput, formatPct } from './format.js';

/**
 * Rate picker: [S&P 500 | Standard loan | Custom % | None].
 * Mutates the given rate object ({ mode, custom }). Standard modes are stored
 * by reference (mode only), so they track project settings automatically.
 */
export class RateSelector {
  constructor(rate, ctx, { label = 'Rate' } = {}) {
    this.rate = rate;
    this.ctx = ctx;
    this.label = label;
  }

  render() {
    this.select = el('select', {
      'aria-label': this.label,
      onchange: () => {
        this.rate.mode = this.select.value;
        this.syncCustomVisibility();
        this.ctx.changed();
      },
    });
    this.options = {
      sp500: el('option', { value: 'sp500' }),
      loan: el('option', { value: 'loan' }),
      custom: el('option', { value: 'custom' }, 'Custom %'),
      none: el('option', { value: 'none' }, 'None'),
    };
    this.select.append(...Object.values(this.options));
    this.select.value = this.rate.mode || 'none';

    this.customInput = numberInput({
      value: this.rate.custom ?? 0,
      greaterThan: -100,
      message: 'Rate must be greater than -100%',
      class: 'rate-custom',
      'aria-label': `${this.label} custom %`,
      onValue: (n) => { this.rate.custom = n; this.ctx.changed(); },
    });

    this.root = el('div', { class: 'rate-selector' },
      this.select,
      el('span', { class: 'rate-custom-wrap' }, this.customInput, el('span', { class: 'suffix' }, '%')));
    this.syncCustomVisibility();
    this.update();
    return this.root;
  }

  syncCustomVisibility() {
    this.root?.classList.toggle('is-custom', this.select.value === 'custom');
  }

  /** Refresh option labels with current project standard rates. */
  update() {
    const s = this.ctx.project.settings;
    this.options.sp500.textContent = `S&P 500 (${formatPct(s.sp500Rate)})`;
    this.options.loan.textContent = `Standard loan (${formatPct(s.loanRate)})`;
  }
}
