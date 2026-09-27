import { el } from './format.js';
import { Beacon } from './Beacon.js';

/**
 * Wayfinding for long project pages:
 * - a rail of strategy beacons (Roman numerals) in the left gutter, desktop only (see CSS).
 *   The strategy in focus is enlarged; the others are buttons that scroll to their strategy.
 *   The line under each numeral fills as you read through that strategy.
 * - a faint page tint in the focused strategy's color (on every screen size).
 * Both appear only with 2+ strategies on a page at least twice the window's height.
 *
 * "In focus" = the last strategy whose top has passed a reading line ~30% down the area below
 * the pinned settings bar. Near the end of the page the line slides to the bottom, so the last
 * strategies can take focus even when they're too short to reach it.
 */
export class StrategyRail {
  /** stickyBar: the settings bar pinned to the top of the page (scroll targets land below it). */
  constructor(stickyBar) {
    this.stickyBar = stickyBar;
    this.views = [];
    this.items = [];
    this.active = -1;
    this.visible = false;
    this.lockedUntil = 0; // after a click, keep the target highlighted while the page glides there

    this.onScroll = () => {
      if (this.locked()) this.extendLock();
      this.schedule();
    };
    this.onResize = () => this.schedule(true);
    window.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('resize', this.onResize);
  }

  /** The rail and the tint layer, to be placed anywhere in the page (both are position: fixed). */
  render() {
    this.list = el('ol', { class: 'rail-list' });
    this.nav = el('nav', { class: 'strategy-rail', 'aria-label': 'Strategies' }, this.list);
    this.tint = el('div', { class: 'page-tint', 'aria-hidden': 'true' });
    return [this.nav, this.tint];
  }

  /** Called after the strategy list is (re)built. views: StrategyView[] in order. */
  setStrategies(views) {
    this.views = views;
    this.active = -1;
    this.items = views.map((view, i) => {
      const { numeral } = Beacon.describe(view.position);
      const button = el('button', {
        type: 'button', class: 'rail-item', onclick: () => this.scrollToStrategy(i),
      }, numeral);
      const track = el('span', { class: 'rail-track', 'aria-hidden': 'true' });
      const li = el('li', {}, button, track);
      Beacon.paint(li, view.position);
      return { button, track };
    });
    this.list.replaceChildren(...this.items.map(({ button }) => button.parentNode));
    this.refreshLabels();

    // Page height changes with every edit, collapse and chart; re-check whether the rail is needed.
    this.resizeObserver ??= new ResizeObserver(() => this.schedule(true));
    this.resizeObserver.disconnect();
    this.resizeObserver.observe(document.body);
    this.schedule(true);
  }

  /** Strategy titles for the hover label and screen readers (they change as the user types). */
  refreshLabels() {
    this.items.forEach(({ button }, i) => {
      const view = this.views[i];
      const numeral = Beacon.describe(view.position).numeral;
      const title = view.strategy.title.trim() || 'Untitled strategy';
      button.dataset.label = title;
      button.setAttribute('aria-label', `Strategy ${numeral}: ${title}`);
    });
  }

  /** Batch scroll/resize work into one measurement per frame. */
  schedule(checkSize = false) {
    this.pendingSize ||= checkSize;
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.pendingSize) this.checkVisibility();
      this.pendingSize = false;
      if (this.visible) this.update();
    });
  }

  checkVisibility() {
    const show = this.views.length >= 2
      && document.documentElement.scrollHeight >= 2 * window.innerHeight;
    if (show === this.visible) return;
    this.visible = show;
    this.nav.classList.toggle('is-visible', show);
    this.tint.classList.toggle('is-visible', show);
    if (!show) this.active = -1;
  }

  /** Top of the visible reading area: just below the settings bar while it's on screen. */
  readingTop() {
    return Math.max(0, this.stickyBar.getBoundingClientRect().bottom);
  }

  update() {
    const vh = window.innerHeight;
    const top = this.readingTop();
    let line = top + Math.min(Math.max((vh - top) * 0.3, 100), 240);
    const maxScroll = document.documentElement.scrollHeight - vh;
    const remaining = Math.max(0, maxScroll - window.scrollY);
    const tail = Math.min(vh * 0.5, maxScroll);
    if (tail > 0 && remaining < tail) line += (vh - line) * (1 - remaining / tail);

    const rects = this.views.map((v) => v.wrapper.getBoundingClientRect());
    let active = 0;
    rects.forEach((r, i) => {
      if (r.top <= line) active = i;
      // How far the line has travelled from this strategy's top to the next one's (or its own bottom).
      const end = i + 1 < rects.length ? rects[i + 1].top : r.bottom;
      const fill = Math.min(1, Math.max(0, (line - r.top) / Math.max(1, end - r.top)));
      this.items[i].track.style.setProperty('--fill', fill.toFixed(3));
    });
    if (!this.locked()) this.setActive(active);
  }

  setActive(index) {
    if (index === this.active) return;
    this.active = index;
    this.items.forEach(({ button }, i) => {
      if (i === index) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
    const { light, dark } = Beacon.describe(this.views[index].position);
    this.tint.style.setProperty('--tint-light', light);
    this.tint.style.setProperty('--tint-dark', dark);
  }

  /** Glide to the start of strategy `index`, landing just below the pinned settings bar. */
  scrollToStrategy(index) {
    const target = this.views[index]?.wrapper;
    if (!target) return;
    // The beacon badge straddles the strategy's top border; land with it in view.
    const badge = target.querySelector('.beacon-badge');
    let gap = 20 + (badge ? Math.max(0, target.getBoundingClientRect().top - badge.getBoundingClientRect().top) : 0);

    // Measure as laid out once the settings bar is pinned: it turns compact, shifting the page up.
    const bar = this.stickyBar;
    const sticky = getComputedStyle(bar).position === 'sticky';
    const y = window.scrollY;
    const wasStuck = bar.classList.contains('is-stuck');
    if (sticky) {
      bar.classList.add('is-stuck');
      gap += (parseFloat(getComputedStyle(bar).top) || 0) + bar.offsetHeight;
    }
    const top = target.getBoundingClientRect().top + window.scrollY;
    if (sticky) {
      bar.classList.toggle('is-stuck', wasStuck);
      if (window.scrollY !== y) window.scrollTo(0, y); // undo any scroll anchoring
    }

    this.lockedUntil = performance.now() + 1500;
    this.setActive(index);
    this.extendLock();
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: Math.max(0, top - gap), behavior: smooth ? 'smooth' : 'auto' });
  }

  locked() {
    return performance.now() < this.lockedUntil;
  }

  /** The lock lasts until the glide settles (no scroll for 150 ms), 1.5 s at most. */
  extendLock() {
    clearTimeout(this.unlockTimer);
    this.unlockTimer = setTimeout(() => { this.lockedUntil = 0; }, 150);
  }

  destroy() {
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.onResize);
    this.resizeObserver?.disconnect();
    cancelAnimationFrame(this.frame);
    clearTimeout(this.unlockTimer);
  }
}
