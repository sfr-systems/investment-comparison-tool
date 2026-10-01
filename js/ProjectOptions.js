import { el, icon } from './format.js';
import { STATES, TAX_YEAR } from './taxData.js';

/** States sorted by name, for the state pickers. */
const STATE_OPTIONS = Object.entries(STATES)
  .sort(([, a], [, b]) => a.name.localeCompare(b.name))
  .map(([code, st]) => ({ code, name: st.name }));

/**
 * Switches along the bottom of the Assumptions bar: include taxes (asking for the state of
 * residence the first time) with a state picker, and show or hide every income source's
 * cash-flow chart and yearly table (project.display).
 */
export class ProjectOptions {
  constructor(project, ctx) {
    this.project = project;
    this.ctx = ctx;
  }

  render() {
    const { project, ctx } = this;
    const taxes = project.settings.taxes;

    this.taxSwitch = this.toggleSwitch('Include taxes', {
      title: 'Deduct federal income tax, Social Security & Medicare, and state income tax',
      onToggle: (on) => (on ? this.enableTaxes() : this.setTaxes(false)),
    });
    this.stateSelect = this.stateSelector({
      'aria-label': 'State of residence',
      onchange: () => {
        taxes.state = this.stateSelect.value;
        this.sync();
        ctx.changed();
      },
    });
    this.stateField = el('label', { class: 'option-state' },
      el('span', { class: 'field-label' }, 'State'), this.stateSelect);
    this.taxHint = el('span', { class: 'option-hint' },
      `${TAX_YEAR} rates · single filer · each income source taxed on its own`);

    const display = (key, label) => this.toggleSwitch(label, {
      checked: project.display[key] !== false,
      onToggle: (on) => { project.display[key] = on; ctx.changed(); },
    });

    this.root = el('div', { class: 'settings-options' },
      el('div', { class: 'option-group tax-options' }, this.taxSwitch, this.stateField, this.taxHint),
      el('div', { class: 'option-group display-options', role: 'group', 'aria-label': 'Show on income sources' },
        el('span', { class: 'field-label' }, 'Show'),
        display('charts', 'Charts'),
        display('tables', 'Yearly tables')));
    this.sync();
    return this.root;
  }

  /** On/off switch button; `onToggle(on)` decides what happens (the taxes switch may ask first). */
  toggleSwitch(label, { checked = false, title = '', onToggle }) {
    const button = el('button', {
      type: 'button', class: 'switch', role: 'switch', title,
      'aria-checked': String(checked),
      onclick: () => {
        const on = button.getAttribute('aria-checked') !== 'true';
        if (onToggle(on) !== false) button.setAttribute('aria-checked', String(on));
      },
    }, el('span', { class: 'switch-track', 'aria-hidden': 'true' }, el('span', { class: 'switch-knob' })),
    el('span', { class: 'switch-label' }, label));
    return button;
  }

  stateSelector(attrs) {
    return el('select', attrs,
      el('option', { value: '', disabled: true }, 'Choose a state…'),
      STATE_OPTIONS.map(({ code, name }) => el('option', { value: code }, name)));
  }

  /** Reflect the saved tax settings (also after a change from another device). */
  sync() {
    const { enabled, state } = this.project.settings.taxes;
    this.taxSwitch.setAttribute('aria-checked', String(!!enabled));
    this.stateField.hidden = !enabled;
    this.taxHint.hidden = !enabled;
    this.stateSelect.value = state || '';
    this.stateSelect.classList.toggle('invalid', !!enabled && !STATES[state]);
  }

  /** Turning taxes on asks for the state of residence first, unless one was already chosen. */
  enableTaxes() {
    const taxes = this.project.settings.taxes;
    if (STATES[taxes.state]) {
      this.setTaxes(true);
      return true;
    }
    this.promptState().then((state) => {
      if (!state) return;
      taxes.state = state;
      this.setTaxes(true);
    });
    return false; // the switch flips once a state is chosen
  }

  setTaxes(enabled) {
    this.project.settings.taxes.enabled = enabled;
    this.sync();
    this.ctx.changed();
  }

  /** Modal asking for the state of residence; resolves to its postal code, or null if dismissed. */
  promptState() {
    return new Promise((resolve) => {
      const select = this.stateSelector({ id: 'tax-state', required: true });
      select.value = '';
      const confirm = el('button', { type: 'submit', class: 'btn primary', value: 'ok', disabled: true }, 'Include taxes');
      select.addEventListener('change', () => { confirm.disabled = !select.value; });
      const dialog = el('dialog', { class: 'app-dialog tax-dialog', 'aria-labelledby': 'tax-dialog-title' },
        el('form', { method: 'dialog', class: 'app-dialog-inner' },
          el('header', { class: 'app-dialog-head' },
            el('h2', { id: 'tax-dialog-title' }, 'Where do you live?'),
            el('button', {
              type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: () => dialog.close(),
            }, icon('close'))),
          el('p', {}, 'Every present value will deduct federal income tax, Social Security and Medicare, '
            + 'and your state’s income tax.'),
          el('label', { class: 'field', for: 'tax-state' },
            el('span', { class: 'field-label' }, 'State of residence'), select),
          el('p', { class: 'app-dialog-fine' }, `Uses ${TAX_YEAR} brackets for a single filer with the standard deduction. `
            + 'Each income source is taxed as if it were the only income; investments are taxed as long-term '
            + 'capital gains when cashed out at the end of the timespan. Local taxes aren’t included.'),
          el('div', { class: 'app-dialog-actions' },
            el('button', { type: 'button', class: 'btn', onclick: () => dialog.close() }, 'Cancel'),
            confirm)));
      dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
      dialog.addEventListener('close', () => {
        dialog.remove();
        resolve(dialog.returnValue === 'ok' && select.value ? select.value : null);
        this.taxSwitch.focus();
      });
      document.body.append(dialog);
      dialog.showModal();
      select.focus();
    });
  }
}
