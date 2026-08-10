import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSyncCore } from './extract.mjs';

const C = loadSyncCore();

test('stamp kayda mod damgasi basar', () => {
  const r = C.stamp({ id: 'a1' });
  assert.match(r.mod, /^\d{4}-\d{2}-\d{2}T/);
});

test('alive sadece mezar tasi olmayanlari gecirir', () => {
  assert.equal(C.alive({ id: 'a', mod: '2026-01-01T00:00:00.000Z' }), true);
  assert.equal(C.alive({ id: 'a', del: true, mod: '2026-01-01T00:00:00.000Z' }), false);
});

test('isNewer mod damgalarini karsilastirir, damgasiz kayit en eskidir', () => {
  const a = { mod: '2026-05-02T00:00:00.000Z' };
  const b = { mod: '2026-05-01T00:00:00.000Z' };
  assert.equal(C.isNewer(a, b), true);
  assert.equal(C.isNewer(b, a), false);
  assert.equal(C.isNewer(a, {}), true);
});

test('stampAll damgasi olmayan tum kayitlara verilen damgayi basar, mevcut olani bozmaz', () => {
  const d = {
    assets: [{ id: 'a1' }, { id: 'a2', mod: '2020-01-01T00:00:00.000Z' }],
    debts: [{ id: 'd1', payments: [{ id: 'p1' }] }],
    trusts: [], zakat: []
  };
  C.stampAll(d, '2026-08-10T10:00:00.000Z');
  assert.equal(d.assets[0].mod, '2026-08-10T10:00:00.000Z');
  assert.equal(d.assets[1].mod, '2020-01-01T00:00:00.000Z');
  assert.equal(d.debts[0].payments[0].mod, '2026-08-10T10:00:00.000Z');
});

const iso = s => `2026-05-${String(s).padStart(2, '0')}T00:00:00.000Z`;

test('mergeList iki tarafin farkli kayitlarini birlestirir', () => {
  const local = [{ id: 'a', mod: iso(1) }];
  const remote = [{ id: 'b', mod: iso(1) }];
  const out = C.mergeList(local, remote);
  assert.deepEqual(out.map(r => r.id).sort(), ['a', 'b']);
});

test('mergeList ayni kayitta mod yeni olani secer', () => {
  const out = C.mergeList(
    [{ id: 'a', qty: 5, mod: iso(2) }],
    [{ id: 'a', qty: 3, mod: iso(1) }]
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].qty, 5);
});

test('mergeList mezar tasi daha yeniyse silme kazanir', () => {
  const out = C.mergeList(
    [{ id: 'a', qty: 5, mod: iso(1) }],
    [{ id: 'a', del: true, mod: iso(2) }]
  );
  assert.equal(out[0].del, true);
});

test('mergeList silinmis kayit eski damgaliysa diriltilmez ama yeni duzenleme kazanir', () => {
  const out = C.mergeList(
    [{ id: 'a', qty: 9, mod: iso(3) }],
    [{ id: 'a', del: true, mod: iso(2) }]
  );
  assert.equal(out[0].del, undefined);
  assert.equal(out[0].qty, 9);
});

test('mergeList ic ice payments dizisini de birlestirir', () => {
  const out = C.mergeList(
    [{ id: 'd1', mod: iso(2), payments: [{ id: 'p1', amount: 100, mod: iso(2) }] }],
    [{ id: 'd1', mod: iso(1), payments: [{ id: 'p2', amount: 50, mod: iso(1) }] }]
  );
  assert.deepEqual(out[0].payments.map(p => p.id).sort(), ['p1', 'p2']);
});

test('mergeList yerel nesneyi mutasyona ugratmaz', () => {
  const local = [{ id: 'a', qty: 5, mod: iso(1) }];
  C.mergeList(local, [{ id: 'a', qty: 3, mod: iso(2) }]);
  assert.equal(local[0].qty, 5);
});

test('mergeData tum koleksiyonlari birlestirir', () => {
  const out = C.mergeData(
    { assets: [{ id: 'a', mod: iso(1) }], debts: [], trusts: [], zakat: [], mod: iso(2) },
    { assets: [], debts: [{ id: 'd', mod: iso(1) }], trusts: [], zakat: [], mod: iso(1) }
  );
  assert.equal(out.assets.length, 1);
  assert.equal(out.debts.length, 1);
});

test('mergeData kurlari ratesAt yeni olan taraftan alir', () => {
  const out = C.mergeData(
    { rates: { gram: 100 }, ratesAt: iso(1), ratesDate: '2026-05-01', mod: iso(5) },
    { rates: { gram: 200 }, ratesAt: iso(3), ratesDate: '2026-05-03', mod: iso(1) }
  );
  assert.equal(out.rates.gram, 200);
  assert.equal(out.ratesDate, '2026-05-03');
});

test('mergeData havl icin havlMod damgasini kullanir', () => {
  const out = C.mergeData(
    { havl: '2026-01-01', havlMod: iso(1), mod: iso(9) },
    { havl: '2026-03-03', havlMod: iso(4), mod: iso(1) }
  );
  assert.equal(out.havl, '2026-03-03');
});

test('mergeData hide alanini senkronlamaz (cihaz ayari)', () => {
  const out = C.mergeData({ hide: true, mod: iso(2) }, { hide: false, mod: iso(1) });
  assert.equal('hide' in out, false);
});

test('mergeData history gunlerini birlestirir, cakisan gunde yeni blob kazanir', () => {
  const out = C.mergeData(
    { history: [{ d: '2026-05-01', v: 10 }, { d: '2026-05-02', v: 20 }], mod: iso(9) },
    { history: [{ d: '2026-05-01', v: 99 }, { d: '2026-05-03', v: 30 }], mod: iso(1) }
  );
  assert.deepEqual(out.history.map(h => h.d), ['2026-05-01', '2026-05-02', '2026-05-03']);
  assert.equal(out.history[0].v, 10);
});

test('gcTombstones 90 gunden eski mezar taslarini atar, yenileri kalir', () => {
  const d = {
    assets: [
      { id: 'old', del: true, mod: '2026-01-01T00:00:00.000Z' },
      { id: 'new', del: true, mod: '2026-08-01T00:00:00.000Z' },
      { id: 'live', mod: '2020-01-01T00:00:00.000Z' }
    ], debts: [], trusts: [], zakat: []
  };
  C.gcTombstones(d, '2026-08-10T00:00:00.000Z');
  assert.deepEqual(d.assets.map(r => r.id).sort(), ['live', 'new']);
});
