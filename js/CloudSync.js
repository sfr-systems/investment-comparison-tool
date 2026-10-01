/** A failed sync request. `kind`: offline | unauthorized | throttled | not-configured | unavailable | server. */
export class SyncError extends Error {
  constructor(kind, message = '') {
    super(message || kind);
    this.kind = kind;
  }
}

/**
 * Talks to the cloud sync endpoint (api/sync.mjs). Stateless apart from where the endpoint
 * lives; the caller passes the device's sync key with each request.
 */
export class CloudSync {
  /** Keepalive requests (sent while the page closes) are capped at 64 KB by browsers. */
  static KEEPALIVE_LIMIT = 60_000;

  /** The key sent instead of the passphrase itself: SHA-256 hex of "ict-sync:" + passphrase. */
  static async keyFor(passphrase) {
    const bytes = new TextEncoder().encode(`ict-sync:${passphrase}`);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  constructor(endpoint = 'api/sync') {
    this.endpoint = endpoint;
  }

  /** Is sync deployed here? 'available' | 'not-configured' | 'unavailable' | 'offline'. */
  async probe() {
    try {
      const res = await fetch(`${this.endpoint}?status`, { cache: 'no-store', headers: { Accept: 'application/json' } });
      const data = res.ok ? await res.json().catch(() => null) : null;
      if (typeof data?.configured !== 'boolean') return 'unavailable'; // e.g. a plain static server
      return data.configured ? 'available' : 'not-configured';
    } catch {
      return 'offline';
    }
  }

  /** Every cloud record: [{ id, rev, updatedAt, project } | { id, rev, updatedAt, deleted: true }]. */
  async pull(key) {
    return (await this.request('GET', key)).records || [];
  }

  /** Upload records; returns { accepted: [id], conflicts: [newer cloud record] }. */
  async push(key, records, { keepalive = false } = {}) {
    return this.request('POST', key, { records }, { keepalive });
  }

  async request(method, key, body, { keepalive = false } = {}) {
    const payload = body ? JSON.stringify(body) : undefined;
    let res;
    try {
      res = await fetch(this.endpoint, {
        method,
        cache: 'no-store',
        keepalive: keepalive && (payload?.length ?? 0) < CloudSync.KEEPALIVE_LIMIT,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${key}`,
          ...(payload ? { 'Content-Type': 'application/json' } : {}),
        },
        body: payload,
      });
    } catch {
      throw new SyncError('offline');
    }
    const data = await res.json().catch(() => null);
    if (res.ok && data) return data;
    const kind = res.status === 401 ? 'unauthorized'
      : res.status === 429 ? 'throttled'
        : data?.error === 'not_configured' ? 'not-configured'
          : res.status === 404 ? 'unavailable' : 'server';
    throw new SyncError(kind, data?.message);
  }
}
