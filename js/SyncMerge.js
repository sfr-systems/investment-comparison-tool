/**
 * Decides how to reconcile this device's projects with the cloud copy. Pure: no I/O.
 *
 * Each saved version of a project has a unique `rev`. Per project id the device remembers `base`,
 * the rev of the cloud version its local copy came from (and `deleted`, the rev of a local
 * deletion that hasn't been uploaded yet). The local copy is "dirty" when it changed since `base`;
 * the cloud copy has "moved" when its version isn't `base`.
 *
 *   dirty here, cloud unchanged  → push
 *   clean here, cloud changed    → pull
 *   changed in both places       → keep both: the local edits become a conflicted copy and the
 *                                  cloud version is pulled; an edit beats a deletion either way
 *
 * Untouched sample projects (`sample: true`) stay on their device and are never pushed.
 */
export class SyncMerge {
  /**
   * @param {object} p
   * @param {Object<string, {rev: string, sample?: boolean}>} p.local projects on this device
   * @param {Object<string, {base?: string, deleted?: string}>} p.state sync bookkeeping
   * @param {Object<string, {rev: string, deleted?: boolean}>} p.remote cloud records known
   * @param {boolean} p.full `remote` is the whole cloud listing, so a missing id means the cloud
   *   doesn't have that project (otherwise only some records, e.g. conflicts, are known)
   * @returns {{push: {id: string, base: ?string, deleted: boolean}[], pull: string[],
   *   copy: string[], settle: {id: string, base: string}[], forget: string[]}}
   */
  static plan({ local = {}, state = {}, remote = {}, full = false }) {
    const out = { push: [], pull: [], copy: [], settle: [], forget: [] };
    const ids = new Set([...Object.keys(local), ...Object.keys(state), ...Object.keys(remote)]);

    for (const id of ids) {
      const L = local[id];
      const R = remote[id];
      const S = state[id] || {};
      const base = S.base ?? null;
      const pendingDelete = !L && S.deleted != null;
      const dirty = pendingDelete || (!!L && !L.sample && L.rev !== base);
      const push = (deleted = pendingDelete, from = base) => out.push.push({ id, base: from, deleted });

      if (!R) {
        if (!full) {
          if (dirty) push();
        } else if (L) {
          if (!L.sample) push(false); // never uploaded, or the cloud lost it
        } else {
          out.forget.push(id); // nothing here or in the cloud
        }
        continue;
      }

      // Already the same version (e.g. an upload whose reply never arrived).
      if (L && !R.deleted && L.rev === R.rev) {
        if (base !== R.rev) out.settle.push({ id, base: R.rev });
        continue;
      }

      const moved = R.rev !== base;
      if (!dirty) {
        if (moved || (!L && !R.deleted)) out.pull.push(id);
      } else if (!moved) {
        push();
      } else if (pendingDelete) {
        out.pull.push(id); // edited (or also deleted) elsewhere: that wins over this deletion
      } else if (R.deleted) {
        push(false, R.rev); // edited here after it was deleted elsewhere: keep the edits
      } else {
        out.copy.push(id);
        out.pull.push(id);
      }
    }
    return out;
  }
}
