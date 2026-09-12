/**
 * Cloud-sync core unit tests — merge/conflict/tombstone/queue/status logic,
 * no browser, no Chrome APIs. These guard the exact code the background
 * SyncEngine (extension/src/sync/sync-engine.js) runs; the engine itself is
 * deliberately a thin shell around these functions.
 *
 * The headline regression here is Phase 10a defect #1: a bookmark deleted on
 * one device must never be resurrected onto it by a pull, and the deletion
 * must reach every other device. See docs/SYNC-ENGINE.md for the contract.
 *
 * Run: npm run test:unit
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  TOMBSTONE_TTL_MS,
  deriveSyncStatus,
  freshnessMs,
  gcTombstones,
  hashArray,
  isTombstone,
  makeTombstone,
  mergeLocalWithRemote,
  mergeWire,
  nextBackoffMs,
  splitWire,
  stableStringify,
  stampChanges,
  toWire,
} from '../../extension/src/sync/sync-core.module.js';

const T0 = Date.parse('2026-08-01T00:00:00.000Z');
const iso = (offsetMs) => new Date(T0 + offsetMs).toISOString();

// A realistic live bookmark: id is Date.now() at creation (the storage schema
// treats it as both identity and sort key).
function bm(idOffsetMs, extra = {}) {
  const id = T0 + idOffsetMs;
  return {
    id,
    videoId: 'vid1',
    timestamp: 42,
    description: 'note',
    tags: [],
    color: '#14B8A6',
    createdAt: new Date(id).toISOString(),
    videoTitle: 'Video',
    ...extra,
  };
}

describe('freshnessMs', () => {
  it('prefers updatedAt, then createdAt, then the id (which is a ms timestamp)', () => {
    assert.equal(freshnessMs(bm(0, { updatedAt: iso(5000) })), T0 + 5000);
    assert.equal(freshnessMs(bm(0)), T0); // createdAt
    assert.equal(freshnessMs({ id: T0 + 7 }), T0 + 7); // legacy entry, no dates
  });

  it('uses deletedAt for tombstones', () => {
    assert.equal(freshnessMs(makeTombstone(1, iso(9000))), T0 + 9000);
  });
});

describe('stableStringify / hashArray', () => {
  it('is insensitive to object key order', () => {
    assert.equal(
      stableStringify({ b: 1, a: [{ y: 2, x: 3 }] }),
      stableStringify({ a: [{ x: 3, y: 2 }], b: 1 }),
    );
  });

  it('hashArray distinguishes different arrays and matches equal ones', () => {
    assert.equal(hashArray([bm(0)]), hashArray([bm(0)]));
    assert.notEqual(hashArray([bm(0)]), hashArray([bm(1)]));
  });
});

describe('mergeWire — per-bookmark last-write-wins', () => {
  it('unions disjoint sets and sorts by id', () => {
    const merged = mergeWire([bm(2000)], [bm(1000)]);
    assert.deepEqual(merged.map((e) => e.id), [T0 + 1000, T0 + 2000]);
  });

  it('newer updatedAt wins a concurrent edit', () => {
    const older = bm(0, { description: 'old', updatedAt: iso(1000) });
    const newer = bm(0, { description: 'new', updatedAt: iso(2000) });
    assert.equal(mergeWire([older], [newer])[0].description, 'new');
    assert.equal(mergeWire([newer], [older])[0].description, 'new');
  });

  it('a newer tombstone deletes a live bookmark (defect #1: no resurrection)', () => {
    const live = bm(0, { updatedAt: iso(1000) });
    const tomb = makeTombstone(live.id, iso(2000));
    const merged = mergeWire([live], [tomb]);
    assert.equal(merged.length, 1);
    assert.ok(isTombstone(merged[0]));
  });

  it('an edit newer than the tombstone resurrects — most recent intent wins', () => {
    const tomb = makeTombstone(T0, iso(1000));
    const edited = bm(0, { updatedAt: iso(2000) });
    const merged = mergeWire([tomb], [edited]);
    assert.equal(merged.length, 1);
    assert.ok(!isTombstone(merged[0]));
  });

  it('breaks an exact-tie toward the tombstone, in both merge orders', () => {
    const live = bm(0, { updatedAt: iso(1000) });
    const tomb = makeTombstone(live.id, iso(1000));
    assert.ok(isTombstone(mergeWire([live], [tomb])[0]));
    assert.ok(isTombstone(mergeWire([tomb], [live])[0]));
  });

  it('is commutative (both devices converge regardless of merge order)', () => {
    const a = [bm(0, { updatedAt: iso(500) }), makeTombstone(T0 + 9, iso(700))];
    const b = [bm(0, { description: 'b', updatedAt: iso(600) }), bm(3000)];
    assert.equal(stableStringify(mergeWire(a, b)), stableStringify(mergeWire(b, a)));
  });

  it('two legacy copies without stamps still converge deterministically', () => {
    const x = bm(0, { description: 'x' });
    const y = bm(0, { description: 'y' });
    assert.equal(
      stableStringify(mergeWire([x], [y])),
      stableStringify(mergeWire([y], [x])),
    );
  });
});

describe('gcTombstones', () => {
  it('drops tombstones past the TTL, keeps fresh ones and all live entries', () => {
    const now = T0 + TOMBSTONE_TTL_MS + 60_000;
    const wire = [
      bm(0), // live, ancient — must survive
      makeTombstone(1, iso(0)), // expired
      makeTombstone(2, new Date(now - 1000).toISOString()), // fresh
    ];
    const kept = gcTombstones(wire, now);
    assert.deepEqual(kept.map((e) => e.id), [T0, 2]);
  });
});

describe('splitWire / toWire', () => {
  it('round-trips live entries and the tombstone ledger', () => {
    const wire = [bm(0), makeTombstone(7, iso(100))];
    const { live, tombstones } = splitWire(wire);
    assert.equal(live.length, 1);
    assert.deepEqual(tombstones, { 7: iso(100) });
    assert.equal(stableStringify(toWire(live, tombstones)), stableStringify(wire));
  });

  it('toWire drops a tombstone whose id is live again', () => {
    const live = [bm(0)];
    const wire = toWire(live, { [live[0].id]: iso(100) });
    assert.equal(wire.length, 1);
    assert.ok(!isTombstone(wire[0]));
  });
});

describe('stampChanges — the engine observing a local storage write', () => {
  it('stamps a brand-new bookmark and flags a write-back + push', () => {
    const added = bm(0);
    const { stamped, deletedIds, needsWriteBack, dirty } = stampChanges([], [added], iso(50));
    assert.equal(stamped[0].updatedAt, iso(50));
    assert.deepEqual(deletedIds, []);
    assert.ok(needsWriteBack);
    assert.ok(dirty);
  });

  it('leaves untouched entries alone — no write-back, no push', () => {
    const same = bm(0, { updatedAt: iso(10) });
    const { needsWriteBack, dirty } = stampChanges([same], [same], iso(50));
    assert.ok(!needsWriteBack);
    assert.ok(!dirty);
  });

  it('stamps an edited entry with the new time', () => {
    const before = bm(0, { updatedAt: iso(10) });
    const after = { ...before, description: 'edited' };
    const { stamped, needsWriteBack } = stampChanges([before], [after], iso(50));
    assert.equal(stamped[0].updatedAt, iso(50));
    assert.ok(needsWriteBack);
  });

  it('trusts a stamp the writer already refreshed (merged-in remote edit)', () => {
    const before = bm(0, { updatedAt: iso(10) });
    const after = { ...before, description: 'remote edit', updatedAt: iso(40) };
    const { stamped, needsWriteBack } = stampChanges([before], [after], iso(50));
    assert.equal(stamped[0].updatedAt, iso(40)); // not re-stamped to iso(50)
    assert.ok(!needsWriteBack);
  });

  it('reports vanished ids as deletions', () => {
    const a = bm(0);
    const b = bm(1000);
    const { deletedIds, dirty } = stampChanges([a, b], [a], iso(50));
    assert.deepEqual(deletedIds, [b.id]);
    assert.ok(dirty);
  });

  it('a cleared key (old array → nothing) deletes everything', () => {
    const a = bm(0);
    const { stamped, deletedIds } = stampChanges([a], [], iso(50));
    assert.deepEqual(stamped, []);
    assert.deepEqual(deletedIds, [a.id]);
  });
});

describe('mergeLocalWithRemote — the full device story', () => {
  it('device B learns of device A\'s deletion instead of keeping the bookmark', () => {
    const shared = bm(0, { updatedAt: iso(10) });
    // Device A deleted it: the server wire now carries a newer tombstone.
    const remoteWire = [makeTombstone(shared.id, iso(20))];
    const merged = mergeLocalWithRemote({
      localLive: [shared],
      localTombstones: {},
      remoteWire,
      nowMs: T0 + 30,
    });
    assert.deepEqual(merged.live, []);
    assert.deepEqual(merged.tombstones, { [shared.id]: iso(20) });
    assert.ok(merged.changedLocally); // B must rewrite its local array
    assert.ok(!merged.dirty); // …and has nothing new to push
  });

  it('device A\'s own deletion is pushed and never re-imported from the cloud', () => {
    const shared = bm(0, { updatedAt: iso(10) });
    // A deleted locally (ledger has the tombstone); the cloud still has it live.
    const merged = mergeLocalWithRemote({
      localLive: [],
      localTombstones: { [shared.id]: iso(20) },
      remoteWire: [shared],
      nowMs: T0 + 30,
    });
    assert.deepEqual(merged.live, []); // NOT resurrected (the old pull-union bug)
    assert.ok(merged.dirty); // the tombstone must go up
    assert.ok(isTombstone(merged.wire[0]));
  });

  it('local-only bookmarks mark the video dirty for push', () => {
    const merged = mergeLocalWithRemote({
      localLive: [bm(0, { updatedAt: iso(5) })],
      localTombstones: {},
      remoteWire: [],
      nowMs: T0 + 30,
    });
    assert.ok(merged.dirty);
    assert.ok(!merged.changedLocally);
  });

  it('remote-only bookmarks land locally without a push', () => {
    const merged = mergeLocalWithRemote({
      localLive: [],
      localTombstones: {},
      remoteWire: [bm(0, { updatedAt: iso(5) })],
      nowMs: T0 + 30,
    });
    assert.equal(merged.live.length, 1);
    assert.ok(merged.changedLocally);
    assert.ok(!merged.dirty);
  });

  it('concurrent edits on two devices keep the newer field values', () => {
    const base = bm(0);
    const localEdit = { ...base, description: 'local', updatedAt: iso(100) };
    const remoteEdit = { ...base, description: 'remote', updatedAt: iso(200) };
    const merged = mergeLocalWithRemote({
      localLive: [localEdit],
      localTombstones: {},
      remoteWire: [remoteEdit],
      nowMs: T0 + 300,
    });
    assert.equal(merged.live[0].description, 'remote');
    assert.ok(merged.changedLocally);
    assert.ok(!merged.dirty);
  });
});

describe('nextBackoffMs', () => {
  it('grows from 30s and caps at 30min', () => {
    assert.equal(nextBackoffMs(1), 30_000);
    assert.equal(nextBackoffMs(2), 60_000);
    assert.equal(nextBackoffMs(6), 1_800_000);
    assert.equal(nextBackoffMs(50), 1_800_000);
    assert.equal(nextBackoffMs(0), 30_000); // defensive lower bound
  });
});

describe('deriveSyncStatus', () => {
  const base = { signedIn: true, isPro: true, queueSize: 0, lastError: null };
  it('maps engine state to the four visible statuses plus disabled', () => {
    assert.equal(deriveSyncStatus(base), 'synced');
    assert.equal(deriveSyncStatus({ ...base, queueSize: 2 }), 'pending');
    assert.equal(deriveSyncStatus({ ...base, lastError: 'network' }), 'offline');
    assert.equal(deriveSyncStatus({ ...base, lastError: 'server' }), 'error');
    assert.equal(deriveSyncStatus({ ...base, lastError: 'auth' }), 'error');
    assert.equal(deriveSyncStatus({ ...base, signedIn: false }), 'disabled');
    assert.equal(deriveSyncStatus({ ...base, isPro: false }), 'disabled');
  });
});
