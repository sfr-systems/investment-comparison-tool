import { el, icon } from './format.js';

const PREF_KEY = 'theme';

/**
 * Light/dark switch for the app bar. Follows the OS setting until the user
 * picks a theme, then remembers that choice. Initial theme is applied before
 * paint by js/theme-init.js; this class keeps it in sync afterwards.
 */
export class ThemeToggle {
  constructor(storage) {
    this.storage = storage;
    this.media = window.matchMedia('(prefers-color-scheme: dark)');
    this.saved = null;
    this.timer = null;
  }

  async mount(container) {
    this.button = el('button', {
      type: 'button',
      class: 'theme-toggle',
      role: 'switch',
      'aria-label': 'Dark mode',
      onclick: () => this.toggle(),
    },
    icon('sun', 'theme-icon-sun'),
    icon('moon', 'theme-icon-moon'),
    el('span', { class: 'theme-toggle-knob', 'aria-hidden': 'true' }));
    container.append(this.button);
    this.sync();

    this.saved = await this.storage.getPreference(PREF_KEY);
    this.media.addEventListener('change', () => {
      if (!this.saved) this.apply(this.systemTheme(), { animate: true });
    });
  }

  get current() {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  }

  systemTheme() {
    return this.media.matches ? 'dark' : 'light';
  }

  toggle() {
    const next = this.current === 'dark' ? 'light' : 'dark';
    this.saved = next;
    this.apply(next, { animate: true });
    this.storage.setPreference(PREF_KEY, next).catch(() => {});
  }

  apply(theme, { animate = false } = {}) {
    const root = document.documentElement;
    if (animate) {
      // Briefly cross-fade colors (disabled for reduced-motion users in CSS).
      root.classList.add('theme-transition');
      clearTimeout(this.timer);
      this.timer = setTimeout(() => root.classList.remove('theme-transition'), 300);
    }
    root.dataset.theme = theme;
    this.sync();
  }

  sync() {
    const dark = this.current === 'dark';
    this.button.setAttribute('aria-checked', String(dark));
    this.button.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
  }
}
