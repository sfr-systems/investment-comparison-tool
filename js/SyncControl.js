import { el, icon } from './format.js';
import { SyncError } from './CloudSync.js';

/** How each ProjectSync status shows in the app bar. */
const STATES = {
  off: { icon: 'cloudOff', label: 'Sync off', tip: 'Projects are saved in this browser only. Click to sync them across your devices.' },
  'not-configured': { icon: 'cloudOff', label: 'Sync off', tip: 'Cloud sync isn’t set up on this site yet.' },
  syncing: { icon: 'refresh', label: 'Syncing…', tip: 'Syncing your projects…' },
  synced: { icon: 'cloudCheck', label: 'Synced', tip: 'Your projects are synced across your devices.' },
  offline: { icon: 'cloudOff', label: 'Offline', tip: 'Offline. Changes are saved on this device and will sync when you’re back online.' },
  unauthorized: { icon: 'alert', label: 'Sync paused', tip: 'The sync passphrase changed. Click to enter the new one.' },
  throttled: { icon: 'alert', label: 'Sync paused', tip: 'Too many wrong passphrase attempts. Try again in 15 minutes.' },
  error: { icon: 'alert', label: 'Sync error', tip: 'Couldn’t reach the sync service. Changes are saved on this device.' },
};
const SYNCING_DELAY = 600; // quick background uploads don't flash "Syncing…"

/**
 * Cloud sync UI: the status button in the app bar, the dialog behind it (enter the passphrase,
 * sync now, turn off), a status line for the project list, and short toast messages.
 */
export class SyncControl {
  constructor(sync) {
    this.sync = sync;
    this.dialog = null;
    this.dialogMode = null;
    this.shown = null;
    this.timer = null;
    sync.on('status', (status) => this.onStatus(status));
  }

  mount(container) {
    this.button = el('button', { type: 'button', class: 'sync-btn', hidden: true, onclick: () => this.open() });
    container.append(this.button);
    this.onStatus(this.sync.status);
  }

  onStatus(status) {
    clearTimeout(this.timer);
    if (status === 'syncing' && this.shown) {
      this.timer = setTimeout(() => this.show('syncing'), SYNCING_DELAY);
    } else {
      this.show(status);
    }
    if (this.dialog && (this.sync.connected || this.mode() !== this.dialogMode)) this.renderDialog();
  }

  show(status) {
    this.shown = status;
    if (!this.button) return;
    const state = STATES[status];
    this.button.hidden = !state;
    if (!state) return;
    this.button.dataset.state = status;
    this.button.title = state.tip;
    this.button.setAttribute('aria-label', `Sync: ${state.label}`);
    this.button.replaceChildren(icon(state.icon), el('span', { class: 'sync-label' }, state.label));
  }

  mode() {
    if (this.sync.connected) return 'connected';
    return this.sync.status === 'not-configured' ? 'setup' : 'form';
  }

  open() {
    if (this.dialog) return;
    const dialog = el('dialog', { class: 'sync-dialog', 'aria-labelledby': 'sync-dialog-title' });
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => { dialog.remove(); this.dialog = null; });
    this.dialog = dialog;
    this.renderDialog();
    document.body.append(dialog);
    dialog.showModal();
    dialog.querySelector('input')?.focus();
  }

  renderDialog() {
    this.dialogMode = this.mode();
    const body = this.dialogMode === 'connected' ? this.connectedView()
      : this.dialogMode === 'setup' ? this.setupView() : this.connectForm();
    this.dialog.replaceChildren(el('div', { class: 'sync-dialog-inner' },
      el('header', { class: 'sync-dialog-head' },
        el('h2', { id: 'sync-dialog-title' }, 'Sync across devices'),
        el('button', {
          type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: () => this.dialog.close(),
        }, icon('close'))),
      ...body));
  }

  connectForm() {
    const input = el('input', {
      type: 'password', id: 'sync-passphrase', autocomplete: 'current-password', required: true,
    });
    const error = el('p', { class: 'sync-error', role: 'alert', hidden: true });
    const submit = el('button', { type: 'submit', class: 'btn primary' }, icon('cloud'), 'Turn on sync');
    const form = el('form', {
      class: 'sync-form',
      onsubmit: async (e) => {
        e.preventDefault();
        if (!input.value) return;
        submit.disabled = true;
        error.hidden = true;
        try {
          await this.sync.connect(input.value);
          this.toast('Sync is on. Your projects now save to the cloud.');
        } catch (err) {
          error.textContent = connectError(err);
          error.hidden = false;
          submit.disabled = false;
          input.select();
        }
      },
    },
    el('label', { class: 'field', for: 'sync-passphrase' }, el('span', { class: 'field-label' }, 'Sync passphrase')),
    el('div', { class: 'sync-form-row' }, input, submit),
    error);

    const intro = this.sync.status === 'unauthorized'
      ? 'The sync passphrase was changed. Enter the new one to resume syncing. Your projects are still saved on this device.'
      : 'Right now your projects are saved in this browser only. Turn on sync to keep them in the cloud and open them on any device where you enter the same passphrase.';
    return [
      el('p', {}, intro),
      form,
      el('p', { class: 'sync-fine' }, 'It’s the SYNC_PASSPHRASE set for this site in Vercel. You only need to enter it once on each device.'),
    ];
  }

  connectedView() {
    const { status, lastSyncedAt } = this.sync;
    const detail = {
      syncing: ['Syncing…', ''],
      synced: ['Synced', lastSyncedAt ? `Last synced ${timeAgo(lastSyncedAt)}` : ''],
      offline: ['Offline', 'Changes are saved on this device and will upload when you’re back online.'],
      throttled: ['Paused', 'Too many wrong passphrase attempts from this network. Try again in 15 minutes.'],
      error: ['Couldn’t reach the sync service', 'Changes are saved on this device and will upload on the next successful sync.'],
    }[status] || ['Syncing…', ''];
    const state = STATES[status] || STATES.syncing;
    const syncNow = el('button', {
      type: 'button', class: 'btn', disabled: status === 'syncing',
      onclick: () => this.sync.syncNow(),
    }, icon('refresh'), 'Sync now');
    return [
      el('div', { class: 'sync-status', dataset: { state: status } },
        icon(state.icon),
        el('div', {},
          el('strong', {}, detail[0]),
          detail[1] && el('span', {}, detail[1]))),
      el('p', {}, 'Projects you create or change here are saved to the cloud automatically and show up on your other devices that use the same passphrase.'),
      el('div', { class: 'sync-actions' },
        syncNow,
        el('button', {
          type: 'button', class: 'btn danger-outline',
          onclick: () => this.sync.disconnect(),
        }, 'Turn off sync on this device')),
      el('p', { class: 'sync-fine' }, 'Turning sync off keeps the projects on this device; it only stops syncing them.'),
    ];
  }

  setupView() {
    return [
      el('p', {}, 'Cloud sync isn’t set up on this site yet. To turn it on, in the Vercel project:'),
      el('ol', { class: 'sync-steps' },
        el('li', {}, 'Storage → connect an Upstash Redis database (the free plan is plenty).'),
        el('li', {}, 'Settings → Environment Variables → add SYNC_PASSPHRASE.'),
        el('li', {}, 'Redeploy, then come back here and enter the passphrase.')),
    ];
  }

  /** One-line sync status for the project list. Call `dispose` when the list goes away. */
  homeNote() {
    const node = el('p', { class: 'sync-note' });
    const link = (text) => el('button', { type: 'button', class: 'link-btn', onclick: () => this.open() }, text);
    const render = () => {
      const s = this.sync.status;
      node.hidden = s === 'unavailable';
      node.dataset.state = s;
      if (s === 'off' || s === 'not-configured') {
        node.replaceChildren(icon('cloudOff'), el('span', {}, 'Saved in this browser only. ', link('Sync across devices')));
      } else if (s === 'synced' || s === 'syncing') {
        node.replaceChildren(icon('cloudCheck'), el('span', {}, 'Synced across your devices.'));
      } else if (s === 'offline') {
        node.replaceChildren(icon('cloudOff'), el('span', {}, 'Offline. Changes are saved here and will sync when you reconnect.'));
      } else {
        node.replaceChildren(icon('alert'), el('span', {}, 'Sync is paused. ', link('Details')));
      }
    };
    render();
    return { node, dispose: this.sync.on('status', render) };
  }

  toast(message) {
    if (!this.toasts?.isConnected) {
      this.toasts = el('div', { class: 'toast-region', role: 'status', 'aria-live': 'polite' });
      document.body.append(this.toasts);
    }
    const t = el('div', { class: 'toast' }, message);
    this.toasts.append(t);
    setTimeout(() => {
      t.classList.add('leaving');
      setTimeout(() => t.remove(), 300);
    }, 6000);
  }
}

function connectError(err) {
  if (!(err instanceof SyncError)) {
    return window.isSecureContext ? `Couldn’t turn on sync: ${err.message}` : 'Sync needs a secure (https) connection.';
  }
  return {
    unauthorized: 'That passphrase didn’t match. Check it and try again.',
    throttled: 'Too many wrong attempts from this network. Try again in 15 minutes.',
    offline: 'You’re offline. Connect to the internet and try again.',
    'not-configured': 'Cloud sync isn’t set up on this site yet.',
  }[err.kind] || 'Couldn’t reach the sync service. Try again in a moment.';
}

function timeAgo(time) {
  const mins = Math.round((Date.now() - time) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  return `at ${new Date(time).toLocaleTimeString(undefined, { timeStyle: 'short' })}`;
}
