# Paylaşılan Kasa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bereket verisinin, her kullanıcı kendi Google hesabıyla girerek, davet edilen kişilerle çift yönlü ve anlık paylaşılabilmesi (çok kasa + roller + kayıt bazlı birleştirme + Realtime).

**Architecture:** Veri artık kullanıcı satırında değil **kasa satırında** (`brkt_vaults.data` jsonb) durur; üyelik ve roller `brkt_members`'ta, yetki `security definer` `brkt_role()` fonksiyonuna dayanan RLS ile zorlanır. Çakışma, her kayda basılan `mod` damgası + `del` mezar taşı ile **kayıt bazında birleştirilerek** çözülür; yazma iyimser kilitli (`updated_at=eq.<okunan>`) olduğu için kayıp güncelleme yapısal olarak kapanır. Anlık güncelleme ham `WebSocket` ile Supabase Realtime'dan gelir, yedeği polling'dir.

**Tech Stack:** Tek dosya `index.html` (vanilla JS, kütüphane yok), Supabase (Postgres + RLS + Realtime + Edge Functions/Deno), `sw.js` service worker, testler için Node 24 `node --test`.

**Spec:** `docs/superpowers/specs/2026-08-10-paylasilan-kasa-design.md`

---

## Proje kısıtları (her task'ta geçerli — ihlal etmeyin)

1. **Tek dosya kuralı**: uygulama mantığı yalnızca `index.html`. Harici JS/CSS eklenmez. İstisnalar zaten mevcut: Google Fonts, `sw.js`, `manifest.json`. `tests/` klasörü uygulamaya dahil değildir (tarayıcıya hiç gitmez), bu yüzden kuralı ihlal etmez.
2. **Kabuk/kaydırma dokunulmaz**: `position:fixed`/`sticky` header veya nav **eklenmez**; `--vh` / `window.innerHeight` / `dvh` ile **viewport yüksekliği ölçülmez** (v1.14.4 yasağı). `apple-mobile-web-app-status-bar-style` **`default` kalır** (v1.14.6). Sadece `setHeaderPad()`'in `offsetHeight` ölçümü kullanılır.
3. **Veri kaybı korumaları korunur**: `_syncReady`, açılış sırası (`handleAuthRedirect()` → `initialSync()` → `fetchRates()`), `isEmptyData()`, `dailyBackup()`.
4. **Arayüz Türkçe**, para `Intl.NumberFormat('tr-TR')`, onaylar `openConfirm()` (native `confirm()` yok).
5. Her task sonunda **commit**. Push başarısız olursa (bilinen TLS sorunu) commit'i bırakıp devam edin, sonunda tekrar denenir.

---

## Dosya yapısı

| Dosya | Sorumluluk | Durum |
|---|---|---|
| `index.html` | Tüm uygulama. Yeni bölümler: sync-core (saf birleştirme fonksiyonları, işaretli blok), kasa katmanı, Realtime istemcisi, Kasalar arayüzü | Değiştirilir |
| `tests/sync-core.test.mjs` | `index.html`'deki sync-core bloğunu çıkarıp `node --test` ile sınar | Oluşturulur |
| `tests/extract.mjs` | İşaretli bloğu `index.html`'den çıkarıp değerlendiren yardımcı | Oluşturulur |
| `supabase/functions/bereket-delete-account/index.ts` | Hesap silme; kasa sahipliği devri eklenir | Değiştirilir |
| `gizlilik-politikasi.html` | Paylaşım maddeleri | Değiştirilir |
| `sw.js` | `CACHE` sürüm dizesi | Değiştirilir |
| `README.md`, `CLAUDE.md` | Dokümantasyon | Değiştirilir |
| Supabase (uzak) | `brkt_vaults`, `brkt_members`, `brkt_role()`, `brkt_claim_invites()`, politikalar, Realtime yayını | Migrasyon |

**`index.html` içinde sync-core bloğu**, `let S=load();` satırından **önce** şu işaretlerle yerleştirilir (test çıkarıcısı bu işaretleri arar — metinlerini değiştirmeyin):

```
/* ==== BEREKET-SYNC-CORE-START ==== */
... saf fonksiyonlar (DOM'a, S'e, localStorage'a dokunmaz) ...
/* ==== BEREKET-SYNC-CORE-END ==== */
```

---

# FAZ 0 — Birleştirme çekirdeği (TDD)

## Task 1: Test koşum altyapısı ve damga yardımcıları

**Files:**
- Create: `tests/extract.mjs`
- Create: `tests/sync-core.test.mjs`
- Modify: `index.html` (yeni blok, `let S=load();` satırının hemen öncesi — şu an satır 459)

- [ ] **Step 1: Çıkarıcı yardımcıyı yaz**

`tests/extract.mjs`:

```js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const START = '/* ==== BEREKET-SYNC-CORE-START ==== */';
const END = '/* ==== BEREKET-SYNC-CORE-END ==== */';

// index.html içindeki saf fonksiyon bloğunu çıkarır ve değerlendirir.
// Uygulamaya harici dosya eklemeden gerçek birim testi yapabilmemizi sağlar.
export function loadSyncCore() {
  const src = readFileSync(join(here, '..', 'index.html'), 'utf8');
  const a = src.indexOf(START);
  const b = src.indexOf(END);
  if (a === -1 || b === -1) throw new Error('sync-core işaretleri index.html icinde bulunamadi');
  const code = src.slice(a + START.length, b);
  const names = ['nowISO', 'setSkew', 'stamp', 'alive', 'isNewer', 'mergeList', 'mergeData', 'gcTombstones', 'stampAll'];
  const fn = new Function(`${code}\nreturn {${names.join(',')}};`);
  return fn();
}
```

- [ ] **Step 2: Başarısız testi yaz**

`tests/sync-core.test.mjs`:

```js
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
```

- [ ] **Step 3: Testi çalıştır, başarısız olduğunu gör**

Run: `node --test "tests/*.test.mjs"`
Expected: FAIL — `sync-core işaretleri index.html icinde bulunamadi`

- [ ] **Step 4: sync-core bloğunu ekle**

`index.html`, `let S=load();` satırının **hemen öncesine**:

```js
/* ==== BEREKET-SYNC-CORE-START ==== */
/* Paylaşılan kasa birleştirme çekirdeği (v1.19.0).
   Bu blok SAF fonksiyonlardan oluşur: DOM'a, S'e, localStorage'a DOKUNMAZ.
   tests/sync-core.test.mjs bu bloğu çıkarıp Node ile test eder — işaret
   yorumlarının metnini değiştirmeyin. */
const SYNC_COLLECTIONS=['assets','debts','trusts','zakat'];
const TOMB_DAYS=90;            // mezar taşı ömrü
let _skewMs=0;                 // sunucu-cihaz saat farkı düzeltmesi
function setSkew(ms){_skewMs=Number(ms)||0}
function nowISO(){return new Date(Date.now()+_skewMs).toISOString()}
function stamp(o){o.mod=nowISO();return o}
function alive(r){return !!r&&!r.del}
function isNewer(a,b){return String((a&&a.mod)||'')>String((b&&b.mod)||'')}
function stampAll(d,iso){
  if(!d)return d;
  SYNC_COLLECTIONS.forEach(k=>{
    (d[k]||[]).forEach(r=>{
      if(!r.mod)r.mod=iso;
      (r.payments||[]).forEach(p=>{if(!p.mod)p.mod=iso});
    });
  });
  return d;
}
/* ==== BEREKET-SYNC-CORE-END ==== */
```

- [ ] **Step 5: Testi çalıştır, geçtiğini gör**

Run: `node --test "tests/*.test.mjs"`
Expected: PASS — 4 test geçer. (`mergeList`/`mergeData`/`gcTombstones` henüz tanımsız; `extract.mjs` bunları `return` listesinde arıyor, bu yüzden **bu adımda hata alırsanız** `extract.mjs`'deki `names` listesinden o üçünü geçici olarak çıkarın — Task 2'de geri eklenecek. Not: hepsi Task 2'de tanımlanacağı için tercih edilen yol, Task 1 ve 2'yi tek oturumda yapıp listeyi hiç değiştirmemektir.)

- [ ] **Step 6: Commit**

```bash
git add tests/extract.mjs tests/sync-core.test.mjs index.html
git commit -m "test: sync-core cikarma altyapisi ve damga yardimcilari"
```

---

## Task 2: `mergeList`, `mergeData`, `gcTombstones` (TDD)

**Files:**
- Modify: `tests/sync-core.test.mjs`
- Modify: `index.html` (sync-core bloğu)

- [ ] **Step 1: Başarısız testleri yaz**

`tests/sync-core.test.mjs` sonuna ekle:

```js
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
```

- [ ] **Step 2: Testleri çalıştır, başarısız olduklarını gör**

Run: `node --test "tests/*.test.mjs"`
Expected: FAIL — `mergeList is not defined` (veya `extract.mjs`'de isim bulunamadı hatası)

- [ ] **Step 3: Fonksiyonları sync-core bloğuna ekle**

`index.html`, sync-core bloğunda `stampAll`'dan sonra, `END` işaretinden önce:

```js
/* Kayıt bazlı birleştirme: aynı id'de mod damgası yeni olan kazanır.
   Silme, diziden çıkarmak değil {del:true} mezar taşıdır — yoksa bir cihazın
   sildiği kaydı diğeri geri diriltir. */
function mergeList(local,remote){
  const out=new Map();
  (remote||[]).forEach(r=>{if(r&&r.id)out.set(r.id,Object.assign({},r))});
  (local||[]).forEach(l=>{
    if(!l||!l.id)return;
    const r=out.get(l.id);
    if(!r){out.set(l.id,Object.assign({},l));return}
    const win=Object.assign({},isNewer(l,r)?l:r);
    if((l.payments&&l.payments.length)||(r.payments&&r.payments.length)){
      win.payments=mergeList(l.payments,r.payments);
    }
    // Kazanan taraf düzenleme ise mezar taşı izini taşımasın
    if(!(isNewer(l,r)?l:r).del)delete win.del;
    out.set(l.id,win);
  });
  return Array.from(out.values());
}
function mergeData(local,remote){
  if(!remote)return local;
  if(!local)return remote;
  const out={};
  SYNC_COLLECTIONS.forEach(k=>{out[k]=mergeList(local[k],remote[k])});
  const localNewer=String(local.mod||'')>String(remote.mod||'');
  const older=localNewer?remote:local, fresh=localNewer?local:remote;
  // history: gün anahtarı üzerinden birleş, çakışan günde yeni blob kazanır
  const hm=new Map();
  (older.history||[]).forEach(e=>{if(e&&e.d)hm.set(e.d,e)});
  (fresh.history||[]).forEach(e=>{if(e&&e.d)hm.set(e.d,e)});
  out.history=Array.from(hm.values()).sort((a,b)=>a.d<b.d?-1:1).slice(-180);
  // kurlar tek blok: ratesAt'ı yeni olan taraf
  const rsrc=String(local.ratesAt||'')>=String(remote.ratesAt||'')?local:remote;
  out.rates=Object.assign({},rsrc.rates||{});
  out.ratesAt=rsrc.ratesAt||null;
  out.ratesDate=rsrc.ratesDate||null;
  // havl kendi damgasıyla
  const hsrc=String(local.havlMod||'')>=String(remote.havlMod||'')?local:remote;
  out.havl=hsrc.havl||null;
  out.havlMod=hsrc.havlMod||null;
  out.mod=fresh.mod||null;
  // hide BİLİNÇLİ olarak taşınmaz: cihaz ayarıdır, localStorage'da tutulur
  return out;
}
function gcTombstones(d,refISO){
  const lim=new Date(new Date(refISO||nowISO()).getTime()-TOMB_DAYS*864e5).toISOString();
  SYNC_COLLECTIONS.forEach(k=>{
    if(Array.isArray(d[k]))d[k]=d[k].filter(r=>!(r.del&&String(r.mod||'')<lim));
  });
  return d;
}
```

- [ ] **Step 4: Testleri çalıştır, geçtiklerini gör**

Run: `node --test "tests/*.test.mjs"`
Expected: PASS — 16 test geçer, 0 başarısız

- [ ] **Step 5: Commit**

```bash
git add tests/sync-core.test.mjs index.html
git commit -m "feat: kayit bazli birlestirme cekirdegi (mergeList/mergeData/gcTombstones)"
```

---

## Task 3: Mutasyonlara damga, silmelere mezar taşı, okumalara `alive` filtresi

Bu task, çekirdeği uygulamanın gerçek veri yollarına bağlar. **Hiçbir yerde `filter(x=>x.id!==id)` ile silme kalmayacak.**

**Files:**
- Modify: `index.html` — `saveAsset` (837), `delAsset` (848), `saveDebt` (939), `toggleDebt` (959), `delDebt` (981), `savePayment` (1011), `delPayment` (1029), `saveTrust` (1060), `toggleTrust` (1073), `delTrust` (1074), `saveTrustPayment` (1102), `delTrustPayment` (1112), `saveZekat` (1131), `delZekat` (1147), `saveHavl` (712), `xferApplyMinus` (900), `toggleHide` (485), `totals` (510), `renderVarlik` (605), `renderBorc` (787), `renderTrusts` (807), `renderZekat` (628), `assetBreakdown` (597), `curBreakdown` (782), `totalHasGold` (502), `zakatPaid` (622), `debtPaid` (503), `openDebtCard` (983), `openTrustCard` (1076), `defaults` (460)

- [ ] **Step 1: Okuma tarafına tek geçiş noktası ekle**

`index.html`, `let S=load();` satırından sonra:

```js
/* Mezar taşları (del:true) hiçbir hesapta/listede görünmemeli.
   Tüm okuma yolları S.assets yerine LIVE.assets() üzerinden gider. */
const LIVE={
  assets:()=>(S.assets||[]).filter(alive),
  debts:()=>(S.debts||[]).filter(alive),
  trusts:()=>(S.trusts||[]).filter(alive),
  zakat:()=>(S.zakat||[]).filter(alive),
  payments:d=>((d&&d.payments)||[]).filter(alive)
};
```

- [ ] **Step 2: Okuma yollarını `LIVE`'a çevir**

Aşağıdaki fonksiyonlarda `S.assets`/`S.debts`/`S.trusts`/`S.zakat` **okuma** kullanımlarını `LIVE.assets()` vb. ile değiştirin (yazma/atama satırlarına dokunmayın):

- `totals()` (510), `totalHasGold()` (502), `assetBreakdown()` (597), `curBreakdown()` (782), `zakatPaid()` (622)
- `renderVarlik()` (605), `renderBorc()` (787), `renderTrusts()` (807), `renderZekat()` (628), `renderOzet()` (543)
- `debtPaid(d)` (503): `(d.payments||[])` → `LIVE.payments(d)`
- `openDebtCard()` (983), `openTrustCard()` (1076): ödeme geçmişi listesi `LIVE.payments(...)`
- `assetTransfer()` (857) / `xferPick()` (875): seçim listesi `LIVE.assets()`
- `isEmptyData(d)` (467): mezar taşı "veri" sayılmamalı →
  ```js
  function isEmptyData(d){
    const n=k=>((d&&d[k])||[]).filter(alive).length;
    return !(n('assets')||n('debts')||n('zakat')||n('trusts'));
  }
  ```

- [ ] **Step 3: Silmeleri mezar taşına çevir**

```js
// delAsset (satır 848)
function delAsset(id){openConfirm('Bu varlık silinsin mi?',()=>{
  const a=S.assets.find(x=>x.id===id);if(a){a.del=true;stamp(a)}
  save();renderAll();
})}

// delDebt (satır 981)
function delDebt(id){openConfirm('Bu kayıt silinsin mi?',()=>{
  const d=S.debts.find(x=>x.id===id);if(d){d.del=true;stamp(d)}
  save();renderAll();
})}

// delTrust (satır 1074)
function delTrust(id){openConfirm('Bu emanet kaydı silinsin mi?',()=>{
  const t=S.trusts.find(x=>x.id===id);if(t){t.del=true;stamp(t)}
  save();renderAll();
})}

// delZekat (satır 1147)
function delZekat(id){openConfirm('Bu kayıt silinsin mi?',()=>{
  const z=S.zakat.find(x=>x.id===id);if(z){z.del=true;stamp(z)}
  save();renderAll();
})}
```

`delPayment(debtId,paymentId)` (1029) ve `delTrustPayment(trustId,paymentId)` (1112): ödeme satırını diziden çıkarmak yerine

```js
const p=(rec.payments||[]).find(x=>x.id===paymentId);
if(p){p.del=true;stamp(p)}
stamp(rec);   // kaydın kendisi de değişti sayılır
```

ve ardından mevcut "kalan 0'a inince done" mantığı `debtRemaining()` üzerinden zaten doğru çalışır (çünkü `debtPaid` artık `LIVE.payments` kullanıyor).

`xferApplyMinus(aid,qty)` (900) içindeki "miktar 0'a inince kaydı listeden sil" davranışı da mezar taşına çevrilir:
```js
if(a.qty<=0){a.del=true}
stamp(a);
```

- [ ] **Step 4: Tüm yazmalara damga bas**

Aşağıdaki fonksiyonlarda **oluşturulan veya güncellenen** kayda `stamp(...)` uygulayın (`save()` çağrısından önce):

- `saveAsset(id)` (837): yeni kayıt `stamp(obj)`; düzenleme `stamp(a)`
- `saveDebt(id)` (939), `toggleDebt(id)` (959): `stamp(d)`
- `savePayment(id)` (1011): `stamp(yeniOdeme)` **ve** `stamp(d)`
- `saveTrust(id)` (1060), `toggleTrust(id)` (1073): `stamp(t)`
- `saveTrustPayment(id)` (1102): `stamp(yeniOdeme)` **ve** `stamp(t)`
- `saveZekat()` (1131): `stamp(z)`
- `saveHavl()` (712): `S.havlMod=nowISO();` ekle (havl skaleri kendi damgasıyla birleşir)

`defaults()` (460) güncellenir — `havlMod` eklenir, `hide` çıkarılır:

```js
function defaults(){return {assets:[],debts:[],trusts:[],zakat:[],rates:{gram:0,ceyrek:0,yarim:0,tam:0,cumhuriyet:0,ata:0,gumus:0,usd:0,eur:0},ratesDate:null,ratesAt:null,havl:null,havlMod:null,history:[]}}
```

- [ ] **Step 5: `hide`'ı cihaz ayarına taşı**

`index.html`, `KEY` tanımının yanına: `const HIDE_KEY='bereket_hide';`

```js
let _hide=localStorage.getItem(HIDE_KEY)==='1';
function isHidden(){return _hide}
function toggleHide(){
  _hide=!_hide;localStorage.setItem(HIDE_KEY,_hide?'1':'0');
  renderAll();document.getElementById('eyebtn').textContent=_hide?'🙈':'👁️';
}
```

`fmt`/`fmt2` (483-484) içindeki `S.hide` → `isHidden()`. `S.hide` okuyan/yazan **başka hiçbir yer kalmamalı**:

Run: `git grep -n "S\.hide"`
Expected: hiç sonuç yok

Not: `toggleHide` artık `save()` çağırmaz — gizlilik cihaz ayarı olduğu için buluta gitmez.

- [ ] **Step 6: Regresyon kontrolü — tarayıcıda elle doğrula**

Run: `python -m http.server 8000` (veya `npx serve`), tarayıcıda `http://localhost:8000`
Kontrol listesi:
1. Mevcut veriler eksiksiz görünüyor (varlık/borç/emanet/zekât/kur/havl)
2. Varlık ekle → listede çıkıyor; sil → **listeden kayboluyor**, Özet toplamı doğru düşüyor
3. `localStorage.bereket_v1`'i konsoldan incele: silinen kayıt `del:true` ile **duruyor**, `mod` damgalı
4. Borca ödeme ekle → kalan doğru; ödemeyi sil → kalan geri artıyor
5. Göz düğmesi gizliliği açıp kapatıyor, sayfa yenilenince tercih korunuyor

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat: kayitlara mod damgasi, silmelerde mezar tasi, okumalarda LIVE filtresi"
```

---

# FAZ 1 — Veritabanı

## Task 4: Şema, yardımcı fonksiyonlar, RLS, Realtime yayını

**Files:**
- Supabase projesi `pdxnpnlwrtswwifevlil` (`beebook`) — `apply_migration` ile

> **DİKKAT:** Bu proje **paylaşılan**dır (Borç Defteri, Hediye, Arıcılık aynı `auth.users`'ı kullanır). Yalnızca `brkt_` önekli nesnelere dokunun. Mevcut `brkt_data` tablosu **silinmeyecek**.

- [ ] **Step 1: Mevcut durumu doğrula**

`list_tables` (schemas: `["public"]`) çağır. `brkt_vaults`/`brkt_members` **olmamalı**, `brkt_data` olmalı.

- [ ] **Step 2: Migrasyonu uygula**

`apply_migration`, name: `brkt_shared_vaults`:

```sql
-- Kasalar: veri artık kullanıcı satırında değil, kasa satırında durur
create table if not exists public.brkt_vaults(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Üyelikler ve roller
create table if not exists public.brkt_members(
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references public.brkt_vaults(id) on delete cascade,
  user_id uuid references auth.users(id),
  email text not null,
  role text not null check (role in ('owner','editor','viewer')),
  status text not null check (status in ('pending','active')),
  invited_at timestamptz not null default now(),
  joined_at timestamptz
);
create unique index if not exists brkt_members_vault_email_uq
  on public.brkt_members(vault_id, lower(email));
create index if not exists brkt_members_user_idx on public.brkt_members(user_id);

-- RLS özyineleme tuzağını kıran yardımcı: politikalar SADECE bunu kullanır
create or replace function public.brkt_role(v uuid) returns text
language sql security definer stable set search_path = public as $$
  select m.role from public.brkt_members m
   where m.vault_id = v and m.user_id = auth.uid() and m.status = 'active'
   limit 1
$$;

-- Davetin bağlanması: JWT e-postasıyla eşleşen bekleyen davetleri sahiplen
create or replace function public.brkt_claim_invites() returns int
language plpgsql security definer set search_path = public as $$
declare n int; em text;
begin
  em := lower(coalesce(auth.jwt() ->> 'email',''));
  if em = '' then return 0; end if;
  update public.brkt_members
     set user_id = auth.uid(), status = 'active', joined_at = now()
   where user_id is null and lower(email) = em;
  get diagnostics n = row_count;
  return n;
end $$;

alter table public.brkt_vaults enable row level security;
alter table public.brkt_members enable row level security;

drop policy if exists brkt_vaults_sel on public.brkt_vaults;
create policy brkt_vaults_sel on public.brkt_vaults for select to authenticated
  using (public.brkt_role(id) is not null);

drop policy if exists brkt_vaults_ins on public.brkt_vaults;
create policy brkt_vaults_ins on public.brkt_vaults for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists brkt_vaults_upd on public.brkt_vaults;
create policy brkt_vaults_upd on public.brkt_vaults for update to authenticated
  using (public.brkt_role(id) in ('owner','editor'))
  with check (public.brkt_role(id) in ('owner','editor'));

drop policy if exists brkt_vaults_del on public.brkt_vaults;
create policy brkt_vaults_del on public.brkt_vaults for delete to authenticated
  using (public.brkt_role(id) = 'owner');

drop policy if exists brkt_members_sel on public.brkt_members;
create policy brkt_members_sel on public.brkt_members for select to authenticated
  using (public.brkt_role(vault_id) is not null or user_id = auth.uid());

drop policy if exists brkt_members_ins on public.brkt_members;
create policy brkt_members_ins on public.brkt_members for insert to authenticated
  with check (public.brkt_role(vault_id) = 'owner'
              or exists (select 1 from public.brkt_vaults v
                          where v.id = vault_id and v.owner_id = auth.uid()));

drop policy if exists brkt_members_upd on public.brkt_members;
create policy brkt_members_upd on public.brkt_members for update to authenticated
  using (public.brkt_role(vault_id) = 'owner')
  with check (public.brkt_role(vault_id) = 'owner');

-- Sahip herkesi çıkarabilir; üye kendi satırını silebilir ("kasadan ayrıl"),
-- ama sahip kendi satırını silemez (önce devretmeli) — kasa sahipsiz kalmasın
drop policy if exists brkt_members_del on public.brkt_members;
create policy brkt_members_del on public.brkt_members for delete to authenticated
  using ( (public.brkt_role(vault_id) = 'owner' and role <> 'owner')
          or (user_id = auth.uid() and role <> 'owner') );

grant select, insert, update, delete on public.brkt_vaults to authenticated;
grant select, insert, update, delete on public.brkt_members to authenticated;
grant execute on function public.brkt_role(uuid) to authenticated;
grant execute on function public.brkt_claim_invites() to authenticated;

-- Realtime: RLS filtreli postgres_changes için tam replica identity gerekir
alter table public.brkt_vaults replica identity full;
```

> **`brkt_members_ins` politikasındaki `exists` kolu neden var:** yeni kasa oluşturulduğunda henüz hiç üyelik satırı yoktur, dolayısıyla `brkt_role()` `null` döner ve sahip kendi ilk `owner` üyeliğini yazamaz. `brkt_vaults.owner_id` kontrolü bu yumurta-tavuk durumunu çözer.

- [ ] **Step 3: Realtime yayınını ekle**

`apply_migration`, name: `brkt_vaults_realtime`:

```sql
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public' and tablename = 'brkt_vaults'
  ) then
    alter publication supabase_realtime add table public.brkt_vaults;
  end if;
end $$;
```

- [ ] **Step 4: Şemayı doğrula**

`execute_sql`:
```sql
select tablename, policyname, cmd from pg_policies
 where schemaname='public' and tablename in ('brkt_vaults','brkt_members')
 order by tablename, policyname;
```
Expected: `brkt_members` için 4 (sel/ins/upd/del), `brkt_vaults` için 4 politika — toplam 8 satır.

```sql
select tablename from pg_publication_tables
 where pubname='supabase_realtime' and tablename='brkt_vaults';
```
Expected: 1 satır.

- [ ] **Step 5: Güvenlik danışmanını çalıştır**

`get_advisors` (type: `security`). `brkt_vaults`/`brkt_members` ile ilgili yeni bir uyarı **olmamalı**. `security definer` fonksiyonlarda `set search_path` verildiği için "function search path mutable" uyarısı çıkmamalı; çıkarsa düzeltin.

- [ ] **Step 6: Commit (migrasyon SQL'ini depoya da yaz)**

```bash
mkdir -p supabase/migrations
# SQL'i supabase/migrations/20260810_brkt_shared_vaults.sql olarak kaydedin (Step 2+3 içeriği)
git add supabase/migrations/20260810_brkt_shared_vaults.sql
git commit -m "feat(db): paylasilan kasa semasi, brkt_role/brkt_claim_invites, RLS, realtime"
```

---

## Task 5: RLS'i iki sahte kullanıcıyla doğrula

Bu task kod yazmaz; **yetkilerin gerçekten kilitlendiğini kanıtlar.** RLS hatası sessizce veri sızdırır, o yüzden atlanmaz.

**Files:** yok (yalnızca SQL doğrulama)

- [ ] **Step 1: İki test kullanıcısı ve bir kasa kur**

`execute_sql`:
```sql
-- Test kullanıcıları (auth.users'a doğrudan, yalnızca test amaçlı)
insert into auth.users (id, email, instance_id, aud, role)
values ('11111111-1111-1111-1111-111111111111','rls-owner@test.local','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
       ('22222222-2222-2222-2222-222222222222','rls-viewer@test.local','00000000-0000-0000-0000-000000000000','authenticated','authenticated')
on conflict (id) do nothing;

insert into public.brkt_vaults (id, name, owner_id, data)
values ('33333333-3333-3333-3333-333333333333','RLS Test Kasasi','11111111-1111-1111-1111-111111111111','{"assets":[]}'::jsonb)
on conflict (id) do nothing;

insert into public.brkt_members (vault_id, user_id, email, role, status)
values ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','rls-owner@test.local','owner','active'),
       ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','rls-viewer@test.local','viewer','active')
on conflict do nothing;
```

- [ ] **Step 2: İzleyicinin okuyabildiğini doğrula**

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","email":"rls-viewer@test.local","role":"authenticated"}';
select count(*) from public.brkt_vaults where id='33333333-3333-3333-3333-333333333333';
```
Expected: `1` — izleyici görebilir.

- [ ] **Step 3: İzleyicinin YAZAMADIĞINI doğrula**

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","email":"rls-viewer@test.local","role":"authenticated"}';
update public.brkt_vaults set data='{"assets":[{"id":"hack"}]}'::jsonb
 where id='33333333-3333-3333-3333-333333333333';
```
Expected: **0 satır güncellendi** (RLS `USING` koşulu satırı görünmez kılar). Ardından rolü sıfırlayıp `select data from public.brkt_vaults where id='3333...'` ile verinin **değişmediğini** doğrulayın.

- [ ] **Step 4: Üye olmayanın hiç göremediğini doğrula**

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","email":"yabanci@test.local","role":"authenticated"}';
select count(*) from public.brkt_vaults;
```
Expected: `0`

- [ ] **Step 5: Davet bağlanmasını doğrula**

```sql
insert into public.brkt_members (vault_id, user_id, email, role, status)
values ('33333333-3333-3333-3333-333333333333', null, 'rls-invited@test.local','editor','pending')
on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","email":"RLS-Invited@Test.Local","role":"authenticated"}';
select public.brkt_claim_invites();
```
Expected: `1` — büyük/küçük harf farkına rağmen davet bağlandı. (Bu, `auth.users`'ta `55555555…` olmadığı için FK hatası verirse önce o kullanıcıyı Step 1'deki gibi ekleyin.)

- [ ] **Step 6: Test verisini temizle**

```sql
delete from public.brkt_members where vault_id='33333333-3333-3333-3333-333333333333';
delete from public.brkt_vaults where id='33333333-3333-3333-3333-333333333333';
delete from auth.users where email like '%@test.local';
```
Expected: temiz. `select count(*) from auth.users where email like '%@test.local'` → `0`

- [ ] **Step 7: Sonucu not düş**

Doğrulama sonuçlarını `docs/superpowers/plans/2026-08-10-paylasilan-kasa.md` yanına değil, commit mesajına yazın:

```bash
git commit --allow-empty -m "test(db): RLS dogrulandi (izleyici yazamiyor, yabanci goremiyor, davet baglaniyor)"
```

---

# FAZ 2 — İstemci kasa katmanı

## Task 6: Kasa kapsamlı localStorage anahtarları ve migrasyon

**Files:**
- Modify: `index.html` — `KEY` (386), `load()` (461), `save()` (465), `dailyBackup()` (468), `openLocalBackups()` (1417), `doRestoreLocalBackup()` (1432), `wipeData()` (1457), `exportData()` (1440), `importData()` (1447)

- [ ] **Step 1: Anahtar katmanını ekle**

`const KEY='bereket_v1';` satırının yerine:

```js
const KEY_LEGACY='bereket_v1';          // v1.18.0 ve öncesi (migrasyon kaynağı)
const VAULT_KEY='bereket_vault';         // aktif kasa id'si
const MIGRATED_KEY='bereket_migrated_v2';
/* Veri kasa başına ayrı anahtarda tutulur: çevrimdışıyken kasa değiştirmek
   çalışsın ve ortak kasanın yedeği kendi kasanın üstüne binmesin. */
function activeVault(){return localStorage.getItem(VAULT_KEY)||'local'}
function dataKey(v){return 'bereket_v1_'+(v||activeVault())}
function bakPrefix(v){return 'bereket_bak_'+(v||activeVault())+'_'}
```

- [ ] **Step 2: `load`/`save`/`dailyBackup`'ı kasa kapsamına al**

```js
function load(){
  try{
    const d=JSON.parse(localStorage.getItem(dataKey()));
    if(d){const base=defaults();return Object.assign(base,d,{rates:Object.assign(base.rates,d.rates||{})})}
  }catch(e){}
  return defaults();
}
function save(){
  if(!canEdit()){toast('İzleyici modundasınız, değişiklik yapamazsınız');return}
  snapshot();dailyBackup();
  S.mod=nowISO();
  localStorage.setItem(dataKey(),JSON.stringify(S));
  queueCloudSync();
}
function dailyBackup(){try{
  const day=new Date().toISOString().slice(0,10),k=bakPrefix()+day;
  if(!localStorage.getItem(k)){
    const prev=localStorage.getItem(dataKey());
    if(prev){const pd=JSON.parse(prev);if(!isEmptyData(pd))localStorage.setItem(k,prev)}
  }
  const ks=Object.keys(localStorage).filter(x=>x.startsWith(bakPrefix())).sort();
  while(ks.length>7)localStorage.removeItem(ks.shift());
}catch(e){}}
```

`canEdit()` geçici olarak şimdilik şöyle tanımlanır (Task 12'de gerçek rol bağlanır) — `save()`'den **önce** tanımlı olmalı:

```js
let _role='owner';                       // aktif kasadaki rolüm
function canEdit(){return _role!=='viewer'}
```

- [ ] **Step 3: Yedek/dışa aktarma/silme yollarını güncelle**

- `openLocalBackups()` (1417) ve `doRestoreLocalBackup()` (1432): `'bereket_bak_'` öneki → `bakPrefix()`; geri yükleme `localStorage.setItem(dataKey(), ...)`
- `exportData()` (1440): değişiklik gerekmez (`S`'i yazıyor), ama dosya adına kasa adı eklenir
- `importData()` (1447): `localStorage.setItem(dataKey(), ...)`
- `wipeData()` (1457): yalnızca **aktif kasanın** `dataKey()`'ini siler; `bakPrefix()` yedeklerini bilinçli olarak SİLMEZ (mevcut davranışın aynısı); onay metnine "yalnızca bu kasa" ibaresi eklenir

- [ ] **Step 4: Migrasyon fonksiyonunu yaz**

`initialSync()` tanımının yanına:

```js
/* Tek seferlik migrasyon (v1.18.0 → v1.19.0).
   Geri dönüş sigortası: eski brkt_data satırı silinmez, öncesinde
   bereket_bak_premigrate anahtarına tam yedek alınır. */
async function migrateToVault(){
  if(localStorage.getItem(MIGRATED_KEY))return;
  const legacy=localStorage.getItem(KEY_LEGACY);
  if(legacy&&!localStorage.getItem('bereket_bak_premigrate'))
    localStorage.setItem('bereket_bak_premigrate',legacy);

  const iso=nowISO();
  let d=null;
  try{d=legacy?JSON.parse(legacy):null}catch(e){d=null}
  if(d){stampAll(d,d.mod||iso);if(!d.havlMod&&d.havl)d.havlMod=d.mod||iso;delete d.hide}

  const s=getSession();
  if(!s){
    // Giriş yok: yerel veri 'local' kasasına taşınır
    localStorage.setItem(VAULT_KEY,'local');
    if(d)localStorage.setItem(dataKey('local'),JSON.stringify(d));
    localStorage.setItem(MIGRATED_KEY,iso);
    return;
  }
  // Giriş var: kullanıcının kasası yoksa eski brkt_data'dan kasa kur
  const mine=await listVaults();
  if(mine&&mine.length){
    localStorage.setItem(VAULT_KEY,mine[0].id);
    localStorage.setItem(MIGRATED_KEY,iso);
    return;
  }
  const row=await legacyLoad();
  let base=(row&&row.data&&Object.keys(row.data).length)?row.data:d;
  if(base){stampAll(base,base.mod||iso);if(!base.havlMod&&base.havl)base.havlMod=base.mod||iso;delete base.hide}
  const v=await createVault('Kasam',base||defaults());
  if(!v)return;                      // ağ hatası: bayrak yazılmaz, sonra tekrar denenir
  localStorage.setItem(VAULT_KEY,v.id);
  localStorage.setItem(dataKey(v.id),JSON.stringify(base||defaults()));
  localStorage.setItem(MIGRATED_KEY,iso);
}
async function legacyLoad(){
  const s=await sbToken();if(!s)return null;
  try{
    const r=await fetch(SB_URL+'/rest/v1/brkt_data?select=data,updated_at',{headers:{apikey:SB_KEY,Authorization:'Bearer '+s.access_token,Accept:'application/vnd.pgrst.object+json'}});
    if(!r.ok)return null;
    return await r.json();
  }catch(e){return null}
}
```

> `listVaults()` ve `createVault()` Task 7'de yazılır. Bu task'ı Task 7 ile aynı oturumda bitirin; ara durumda migrasyon çalışmaz (bayrak yazılmadığı için zarar vermez, bir sonraki açılışta tekrar dener).

- [ ] **Step 5: Açılış sırasına ekle**

`index.html` sonundaki açılış bloğunda (şu an satır ~1565 `await initialSync();`) sıra **kesinlikle** şöyle olur:

```js
await handleAuthRedirect();
if(getSession())await claimInvites();   // Task 11'de tanımlanır
await migrateToVault();
S=load();                                // kasa anahtarı değiştiği için yeniden yükle
await initialSync();
fetchRates();                            // save() tetikler — ASLA öne alınmaz
```

- [ ] **Step 6: Tarayıcıda doğrula (girişsiz yol)**

Run: `python -m http.server 8000`
1. Yeni sekme (giriş yapmadan): tüm veriler yerinde
2. Konsol: `localStorage.bereket_vault` → `"local"`, `localStorage['bereket_v1_local']` dolu, `localStorage.bereket_bak_premigrate` dolu, `localStorage.bereket_migrated_v2` dolu
3. Sayfayı yenile → migrasyon **tekrar çalışmıyor** (bayrak duruyor, veri bozulmuyor)

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat: kasa kapsamli localStorage anahtarlari ve tek seferlik migrasyon"
```

---

## Task 7: Kasa REST katmanı — listeleme, oluşturma, iyimser kilitli push

**Files:**
- Modify: `index.html` — `cloudLoad` (1282), `applyCloud` (1291), `cloudPush` (1298), `doCloudPush` (1315), `cloudPull` (1331)

- [ ] **Step 1: Kasa REST yardımcılarını yaz**

```js
async function sbFetch(path,opt){
  const s=await sbToken();if(!s)return null;
  const o=opt||{};
  o.headers=Object.assign({apikey:SB_KEY,Authorization:'Bearer '+s.access_token,'Content-Type':'application/json'},o.headers||{});
  const r=await fetch(SB_URL+'/rest/v1/'+path,o);
  syncSkew(r);                       // sunucu saatiyle cihaz saatini hizala
  return r;
}
/* Sunucu-cihaz saat farkını ölç: mod damgaları cihaz saatinden üretildiği için
   şaşmış bir telefon birleştirmede yanlış tarafı seçebilir. */
function syncSkew(r){
  try{
    const d=r&&r.headers&&r.headers.get('Date');
    if(d)setSkew(new Date(d).getTime()-Date.now());
  }catch(e){}
}
async function listVaults(){
  try{
    const r=await sbFetch('brkt_vaults?select=id,name,owner_id,updated_at&order=created_at.asc');
    if(!r||!r.ok)return null;
    return await r.json();
  }catch(e){return null}
}
async function createVault(name,data){
  try{
    const s=await sbToken();if(!s)return null;
    const r=await sbFetch('brkt_vaults',{method:'POST',headers:{Prefer:'return=representation'},
      body:JSON.stringify({name:name,owner_id:s.user.id,data:data||{},updated_at:nowISO()})});
    if(!r||!r.ok)return null;
    const v=(await r.json())[0];
    // Sahip üyeliğini yaz (brkt_members_ins politikasının owner_id kolu buna izin verir)
    await sbFetch('brkt_members',{method:'POST',body:JSON.stringify({
      vault_id:v.id,user_id:s.user.id,email:(s.user.email||'').toLowerCase(),
      role:'owner',status:'active',joined_at:nowISO()})});
    return v;
  }catch(e){return null}
}
async function cloudLoad(){
  const v=activeVault();if(v==='local')return null;
  try{
    const r=await sbFetch('brkt_vaults?id=eq.'+v+'&select=id,name,data,updated_at',{headers:{Accept:'application/vnd.pgrst.object+json'}});
    if(!r||!r.ok)return null;
    return await r.json();
  }catch(e){return null}
}
```

- [ ] **Step 2: `applyCloud`'u birleştirmeli hale getir**

```js
function applyCloud(row){
  const base=defaults();
  const remote=Object.assign(base,row.data||{},{rates:Object.assign(base.rates,(row.data||{}).rates||{})});
  S=mergeData(S,remote);
  gcTombstones(S);
  localStorage.setItem(dataKey(),JSON.stringify(S));
  localStorage.setItem(CLOUD_SYNC_KEY,row.updated_at||nowISO());
  renderAll();
}
```

- [ ] **Step 3: `doCloudPush`'u iyimser kilitli, birleştirmeli döngüye çevir**

```js
/* Oku → birleştir → koşullu yaz. updated_at eşleşmezse araya biri girmiştir:
   yeniden okuyup tekrar dener. Kayıp güncelleme böylece yapısal olarak kapanır. */
async function doCloudPush(silent){
  const v=activeVault();if(v==='local')return;
  if(!canEdit()){if(!silent)toast('İzleyici modunda buluta yazılamaz');return}
  for(let i=0;i<3;i++){
    try{
      const row=await cloudLoad();
      if(!row){throw 0}
      const merged=gcTombstones(mergeData(S,Object.assign(defaults(),row.data||{})));
      const stampIso=nowISO();
      merged.mod=stampIso;
      const r=await sbFetch('brkt_vaults?id=eq.'+v+'&updated_at=eq.'+encodeURIComponent(row.updated_at),
        {method:'PATCH',headers:{Prefer:'return=minimal'},
         body:JSON.stringify({data:merged,updated_at:stampIso})});
      if(!r)throw 0;
      if(r.status===409||r.headers.get('Content-Range')==='*/0'){continue}   // yarış: tekrar dene
      if(!r.ok)throw 0;
      S=merged;
      localStorage.setItem(dataKey(),JSON.stringify(S));
      localStorage.setItem(CLOUD_SYNC_KEY,stampIso);
      localStorage.removeItem(CLOUD_ERR_KEY);
      if(!silent)toast('Buluta yedeklendi ✓');
      renderCloud();renderWarnings();renderAll();
      return;
    }catch(e){/* sonraki denemeye */}
  }
  // Sessiz push'ta bile hatayı kaydet: aksi halde senkron aylarca bozuk kalıp fark edilmiyor
  localStorage.setItem(CLOUD_ERR_KEY,nowISO());
  if(!silent)toast('Buluta yedeklenemedi');
  renderCloud();renderWarnings();
}
```

> **Önemli:** PostgREST'te güncellenen satır sayısını öğrenmek için `Prefer: return=minimal` ile birlikte `Content-Range` başlığı okunur. Uygulamada bunu doğrulayın: 0 satırda `Content-Range: */0` gelir. Gelmiyorsa `Prefer:'return=representation,count=exact'` kullanıp dönen dizinin boş olup olmadığına bakın ve kodu ona göre uyarlayın — mantık aynı kalır (0 satır = yeniden dene).

- [ ] **Step 4: `cloudPush` ve `cloudPull`'u kasaya uyarla**

`cloudPush(silent)` (1298) içindeki `isEmptyData` koruması **korunur**, sadece `cloudLoad()` artık kasa satırını okur — kod değişikliği gerekmez. `cloudPull()` (1331) `applyCloud` artık birleştirdiği için toast metni güncellenir: `'Buluttan birleştirildi ✓'`.

- [ ] **Step 5: Tarayıcıda doğrula**

1. Google ile giriş yap → konsol: `localStorage.bereket_vault` bir uuid, `bereket_migrated_v2` dolu
2. Supabase'de `execute_sql`: `select id,name,jsonb_array_length(data->'assets') from public.brkt_vaults;` → kasa var, varlık sayısı doğru
3. `select role,status,email from public.brkt_members;` → tek satır, `owner`/`active`
4. Uygulamada varlık ekle, 3 sn bekle → SQL'de varlık sayısı arttı
5. `select count(*) from public.brkt_data;` → **eski satır hâlâ duruyor** (geri dönüş sigortası)

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: kasa REST katmani ve iyimser kilitli birlestirmeli push"
```

---

## Task 8: Polling, `_pendingCloud` modal koruması, `initialSync`

**Files:**
- Modify: `index.html` — `initialSync` (1345), `autoCloudSync` (1382), `setInterval` (1395), `closeSheet` (1492)

- [ ] **Step 1: Modal koruma katmanını ekle**

```js
/* Form/modal açıkken gelen değişikliği ANINDA uygulamayız: kullanıcının
   doldurduğu form altından yenilenir. Pencere kapanınca uygulanır. */
let _pendingCloud=null;
function sheetOpen(){return document.getElementById('overlay').classList.contains('open')}
function applyOrQueue(row){
  if(sheetOpen()){
    _pendingCloud=row;
    toast('Ortak kasada yeni değişiklik var, pencereyi kapatınca güncellenecek');
    return;
  }
  applyCloud(row);
}
```

`closeSheet()` (1492) sonuna:

```js
function closeSheet(){
  document.getElementById('overlay').classList.remove('open');
  document.getElementById('app').style.overflow='';
  if(_pendingCloud){const r=_pendingCloud;_pendingCloud=null;applyCloud(r);toast('Ortak kasa güncellendi ✓')}
}
```

- [ ] **Step 2: `autoCloudSync`'i `applyOrQueue`'ya çevir**

`autoCloudSync()` (1382) içindeki `applyCloud(row)` → `applyOrQueue(row)`; toast metni `'Ortak kasadan güncellendi ✓'`.

- [ ] **Step 3: Polling aralığını Realtime durumuna bağla**

`setInterval(autoCloudSync,20000);` (1395) satırının yerine:

```js
/* Realtime bağlıyken polling seyrek bir emniyet ağıdır; WebSocket sessizce
   ölebildiği için tamamen kapatılmaz. Kopmuşsa hızlanır. */
let _rtOpen=false;
let _pollTimer=null;
function setPoll(){
  clearInterval(_pollTimer);
  _pollTimer=setInterval(autoCloudSync,_rtOpen?60000:5000);
}
setPoll();
```

- [ ] **Step 4: `initialSync`'i kasaya uyarla**

`initialSync()` (1345) içinde `applyCloud(row)` çağrıları korunur (açılışta modal açık olamaz), ancak koşul birleştirme yaptığımız için sadeleşir:

```js
async function initialSync(){
  try{
    if(!getSession()||activeVault()==='local')return;
    const row=await cloudLoad();
    if(row&&row.data&&Object.keys(row.data).length){
      applyCloud(row);          // artık birleştiriyor: "hangisi kazanır" kararı gereksiz
      toast('Bulut verileriniz yüklendi ✓');
    }
  }catch(e){}
  finally{_syncReady=true}
}
```

> `_syncReady` bayrağı ve `isEmptyData` koruması **kaldırılmaz** — v1.14.0 veri kaybı düzeltmesinin çekirdeğidir. Birleştirme onları gereksiz kılmaz (ağ hatasında `cloudLoad` `null` döner, o durumda yerel veriyi buluta itmeden önce hâlâ korumaya ihtiyaç var).

- [ ] **Step 5: Tarayıcıda doğrula**

1. İki farklı tarayıcı profili/gizli pencere gerekmiyor — aynı hesapla iki sekme aç
2. Sekme A'da varlık ekle → Sekme B'de en fazla 5 sn içinde göründü
3. Sekme B'de bir form (örn. "Borç Ekle") aç, açık tut → Sekme A'da varlık ekle → B'de **form kaybolmadı**, "pencereyi kapatınca güncellenecek" toast'ı çıktı
4. B'de formu kapat → veri güncellendi, "Ortak kasa güncellendi ✓" toast'ı çıktı

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: modal korumali senkron uygulama ve uyarlanabilir polling"
```

---

## Task 9: Realtime WebSocket istemcisi

**Files:**
- Modify: `index.html` (yeni bölüm, `autoCloudSync`'ten sonra)

- [ ] **Step 1: İstemciyi yaz**

```js
/* Supabase Realtime — ham WebSocket ile (kütüphane yok, tek dosya kuralı korunur).
   Phoenix kanal protokolü: phx_join ile postgres_changes'e abone olunur.
   Gelen payload'a GÜVENİLMEZ (boyut sınırı/RLS filtresi): satır cloudLoad ile
   tazelenir, sonra birleştirilir. Polling emniyet ağı olarak açık kalır. */
let _rt=null,_rtRef=0,_rtBackoff=1000,_rtHb=null,_rtRetry=null;
function rtUrl(tok){
  return SB_URL.replace(/^http/,'ws')+'/realtime/v1/websocket?apikey='+encodeURIComponent(SB_KEY)+'&vsn=1.0.0';
}
async function rtConnect(){
  rtClose();
  const v=activeVault();if(v==='local')return;
  const s=await sbToken();if(!s)return;
  try{_rt=new WebSocket(rtUrl());}catch(e){return}
  _rt.onopen=()=>{
    _rtOpen=true;setPoll();_rtBackoff=1000;
    _rt.send(JSON.stringify({topic:'realtime:brkt_vault_'+v,event:'phx_join',ref:String(++_rtRef),payload:{
      config:{
        broadcast:{self:false},presence:{key:''},
        postgres_changes:[{event:'UPDATE',schema:'public',table:'brkt_vaults',filter:'id=eq.'+v}]
      },
      access_token:s.access_token
    }}));
    clearInterval(_rtHb);
    _rtHb=setInterval(()=>{
      if(_rt&&_rt.readyState===1)_rt.send(JSON.stringify({topic:'phoenix',event:'heartbeat',ref:String(++_rtRef),payload:{}}));
    },30000);
  };
  _rt.onmessage=async ev=>{
    let m=null;try{m=JSON.parse(ev.data)}catch(e){return}
    if(m.event!=='postgres_changes')return;
    const row=await cloudLoad();
    if(row&&row.data)applyOrQueue(row);
  };
  _rt.onclose=()=>{_rtOpen=false;setPoll();clearInterval(_rtHb);rtRetry()};
  _rt.onerror=()=>{try{_rt.close()}catch(e){}};
}
function rtRetry(){
  clearTimeout(_rtRetry);
  _rtRetry=setTimeout(()=>{rtConnect()},_rtBackoff);
  _rtBackoff=Math.min(_rtBackoff*2,30000);   // 1→2→4→8→16→30 sn
}
function rtClose(){
  clearInterval(_rtHb);clearTimeout(_rtRetry);
  if(_rt){const w=_rt;_rt=null;w.onclose=null;try{w.close()}catch(e){}}
  _rtOpen=false;
}
```

- [ ] **Step 2: Yaşam döngüsüne bağla**

- Açılışta `initialSync()`'ten sonra: `if(getSession())rtConnect();`
- `visibilitychange` dinleyicisine (1394) ekle: `if(!document.hidden&&getSession()&&(!_rt||_rt.readyState>1))rtConnect();`
- `cloudLogout()` (1257) içine: `rtClose();`
- Kasa değiştirme fonksiyonuna (Task 10 `switchVault`) : `rtConnect();`
- Token yenilendiğinde bağlantı yetkisiz kalır → `refreshSession()` (1264) başarılı dönüşünde `rtConnect();`

- [ ] **Step 3: Tarayıcıda doğrula**

1. İki sekme aç, DevTools → Network → WS: bağlantı **101 Switching Protocols** ile açık, `phx_reply` içinde `"status":"ok"` görünüyor
2. Sekme A'da varlık ekle → Sekme B'de **~1 sn içinde** göründü (5 sn'lik polling'i beklemiyor)
3. DevTools'tan WS bağlantısını kapat (veya ağı kısa süre kes) → konsol'da yeniden bağlanma denemeleri; bu süre boyunca değişiklikler **5 sn polling** ile geliyor
4. `_rtOpen` konsolda `true` iken polling 60 sn'ye düşmüş: `_pollTimer` yeniden kurulmuş

> Realtime `phx_reply` `"status":"error"` dönerse: (a) Task 4 Step 3 yayın migrasyonunun uygulandığını, (b) `replica identity full` ayarını, (c) `access_token`'ın geçerli olduğunu kontrol edin. Bağlantı kurulmasa bile uygulama polling ile **çalışmaya devam etmelidir** — bunu ağı keserek doğrulayın.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: Supabase Realtime istemcisi (ham WebSocket) ve yeniden baglanma"
```

---

# FAZ 3 — Arayüz

## Task 10: Kasa seçici ve Kasalar kartı

**Files:**
- Modify: `index.html` — `<header>` bloğu, `renderAyar()` (820), yeni `renderVaults`/`openVaults`/`switchVault`/`openNewVault`/`saveNewVault`/`renameVault`

- [ ] **Step 1: Başlığa kasa satırı ekle**

`<header>` içine, uygulama adının altına:

```html
<div id="vaultbar" class="vaultbar" onclick="openVaults()" style="display:none"></div>
```

CSS (mevcut stil bloğuna):

```css
.vaultbar{font:600 12px/1.2 Manrope,sans-serif;color:var(--ivory);opacity:.85;
  margin-top:2px;cursor:pointer;display:flex;align-items:center;gap:4px}
.vaultbar .rolebadge{font-size:10px;padding:1px 6px;border-radius:8px;
  background:rgba(250,247,240,.18)}
```

> **UYARI:** Başlık yüksekliği değişiyor. `position:fixed`/`sticky` **eklemeyin**, `--vh`/`innerHeight` **ölçmeyin**. Sadece `setHeaderPad()` (1517) yeniden çağrılır.

```js
function renderVaultBar(){
  const el=document.getElementById('vaultbar');
  if(!el)return;
  if(!getSession()||_vaults.length<2){el.style.display='none';setHeaderPad();return}
  const v=_vaults.find(x=>x.id===activeVault());
  const rn={owner:'Sahip',editor:'Düzenleyen',viewer:'İzleyici'}[_role]||'';
  el.innerHTML='🔁 '+esc(v?v.name:'Kasa')+' <span class="rolebadge">'+rn+'</span>';
  el.style.display='flex';
  setHeaderPad();
}
```

- [ ] **Step 2: Kasa listesi durumunu tut**

```js
let _vaults=[];        // {id,name,owner_id,updated_at}
let _members=[];       // aktif kasanın üyeleri
async function refreshVaults(){
  const list=await listVaults();
  if(list)_vaults=list;
  if(_vaults.length&&!_vaults.find(x=>x.id===activeVault())&&activeVault()!=='local'){
    // Kasadan çıkarıldıysak ilk kasaya düş
    await switchVault(_vaults[0].id);
    return;
  }
  await refreshRole();
  renderVaultBar();renderAyar();
}
async function refreshRole(){
  const v=activeVault();
  if(v==='local'){_role='owner';document.body.classList.remove('ro');return}
  try{
    const s=await sbToken();
    const r=await sbFetch('brkt_members?vault_id=eq.'+v+'&user_id=eq.'+s.user.id+'&select=role',{headers:{Accept:'application/vnd.pgrst.object+json'}});
    _role=(r&&r.ok)?(await r.json()).role:'viewer';
  }catch(e){_role='viewer'}
  document.body.classList.toggle('ro',_role==='viewer');
}
```

- [ ] **Step 3: Kasa geçişi**

```js
async function switchVault(id){
  closeSheet();
  localStorage.setItem(VAULT_KEY,id);
  S=load();
  await refreshRole();
  _syncReady=false;
  await initialSync();
  rtConnect();
  scheduleHavlNotification();     // havl bildirimi yalnızca aktif kasa için
  renderAll();renderVaultBar();
  toast('Kasa değiştirildi');
}
```

- [ ] **Step 4: Kasalar penceresi**

```js
function openVaults(){
  const rows=_vaults.map(v=>{
    const act=v.id===activeVault();
    return `<button class="btn ${act?'primary':'ghost'}" onclick="switchVault('${v.id}')">
      ${act?'✓ ':''}${esc(v.name)}</button>`;
  }).join('');
  sheet(`<h3>Kasalar</h3>
  <p class="mini" style="margin-top:0">Verileriniz kasa başına ayrı tutulur. Bir kasayı paylaşmak için Ayarlar → Kasalar → Üyeler.</p>
  ${rows||'<p class="mini">Kasa yok.</p>'}
  <button class="btn gold" onclick="openNewVault()">➕ Yeni Kasa</button>
  <button class="btn ghost" onclick="closeSheet()">Kapat</button>`);
}
function openNewVault(){
  sheet(`<h3>Yeni Kasa</h3>
  <label class="lbl">Kasa adı</label>
  <input id="f-vname" class="inp" placeholder="Ortak Kasa" maxlength="40">
  <button class="btn primary" onclick="saveNewVault()">Oluştur</button>
  <button class="btn ghost" onclick="closeSheet()">Vazgeç</button>`);
}
async function saveNewVault(){
  const n=(document.getElementById('f-vname').value||'').trim();
  if(!n){toast('Kasa adı gerekli');return}
  closeSheet();toast('Oluşturuluyor…');
  const v=await createVault(n,defaults());
  if(!v){toast('Kasa oluşturulamadı');return}
  await refreshVaults();
  await switchVault(v.id);
}
async function renameVault(id){
  const v=_vaults.find(x=>x.id===id);if(!v)return;
  sheet(`<h3>Kasayı Yeniden Adlandır</h3>
  <label class="lbl">Kasa adı</label>
  <input id="f-vrename" class="inp" value="${esc(v.name)}" maxlength="40">
  <button class="btn primary" onclick="saveRenameVault('${id}')">Kaydet</button>
  <button class="btn ghost" onclick="closeSheet()">Vazgeç</button>`);
}
async function saveRenameVault(id){
  const n=(document.getElementById('f-vrename').value||'').trim();
  if(!n){toast('Kasa adı gerekli');return}
  closeSheet();
  const r=await sbFetch('brkt_vaults?id=eq.'+id,{method:'PATCH',body:JSON.stringify({name:n})});
  if(r&&r.ok){await refreshVaults();toast('Yeniden adlandırıldı ✓')}else toast('Değiştirilemedi');
}
```

- [ ] **Step 5: Ayarlar'a Kasalar kartını ekle**

`renderAyar()` (820) içine, Bulut Yedekleme kartından sonra render edilen bir bölüm:

```js
function renderVaultCard(){
  if(!getSession())return '';
  const rows=_vaults.map(v=>{
    const act=v.id===activeVault();
    const own=_role==='owner'&&act;
    return `<div class="row">
      <div><b>${esc(v.name)}</b>${act?' <span class="mini">(aktif)</span>':''}</div>
      <div>
        ${act?'':`<button class="btn ghost mini" onclick="switchVault('${v.id}')">Geç</button>`}
        ${own?`<button class="btn ghost mini" onclick="renameVault('${v.id}')">✏️</button>
               <button class="btn ghost mini" onclick="openMembers('${v.id}')">👥</button>`:''}
      </div></div>`;
  }).join('');
  return `<div class="card"><h3>Kasalar</h3>
    <p class="mini">Bir kasayı eşinizle veya ortağınızla paylaşabilirsiniz. Herkes kendi Google hesabıyla girer.</p>
    ${rows}
    <button class="btn gold" onclick="openNewVault()">➕ Yeni Kasa</button>
    ${_role==='owner'?`<button class="btn ghost" onclick="openMembers('${activeVault()}')">👥 Üyeler ve Davetler</button>`:''}
    ${_role!=='owner'?`<button class="btn danger" onclick="leaveVault('${activeVault()}')">🚪 Kasadan Ayrıl</button>`:''}
  </div>`;
}
```

Bu kartın HTML'ini `renderAyar()`'ın ürettiği çıktıya ekleyin. Açılışta `refreshVaults()` çağrısını `initialSync()`'ten sonraya koyun.

- [ ] **Step 6: Tarayıcıda doğrula**

1. Tek kasa varken başlıkta kasa satırı **görünmüyor** (arayüz eskisi gibi)
2. "Yeni Kasa" ile ikinci kasa oluştur → başlıkta kasa satırı belirdi, içerik yeşil başlığın altında kalmadı, alt menü ekranın dibinde (kabuk bozulmadı)
3. Kasalar arasında geçiş yap → veriler değişiyor, her kasa kendi verisini koruyor
4. Yeniden adlandırma çalışıyor
5. Telefonda (veya DevTools cihaz modu, iPhone) kaydırma tek parmakla akıcı, alt menü dipte

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat: kasa secici ve Ayarlar Kasalar karti"
```

---

## Task 11: Üyeler — davet, rol değiştirme, çıkarma, ayrılma, devir, kasa silme

**Files:**
- Modify: `index.html` — yeni `claimInvites`/`openMembers`/`openInvite`/`saveInvite`/`setMemberRole`/`removeMember`/`leaveVault`/`transferOwner`/`deleteVault`

- [ ] **Step 1: Davet sahiplenme çağrısını ekle**

```js
/* Davet edilen kişi kendi Google hesabıyla girdiği anda kasa listesinde belirir:
   sunucudaki brkt_claim_invites() JWT e-postasıyla eşleşen davetleri bağlar. */
async function claimInvites(){
  try{
    const r=await sbFetch('rpc/brkt_claim_invites',{method:'POST',body:'{}'});
    if(r&&r.ok){const n=await r.json();if(n>0)toast(n+' kasa davetiniz kabul edildi ✓')}
  }catch(e){}
}
```

- [ ] **Step 2: Üyeler penceresi**

```js
async function openMembers(vid){
  const r=await sbFetch('brkt_members?vault_id=eq.'+vid+'&select=id,email,role,status,user_id&order=invited_at.asc');
  _members=(r&&r.ok)?await r.json():[];
  const rn={owner:'Sahip',editor:'Düzenleyen',viewer:'İzleyici'};
  const rows=_members.map(m=>`<div class="row">
    <div><b>${esc(m.email)}</b><br><span class="mini">${rn[m.role]}${m.status==='pending'?' · davet bekliyor':''}</span></div>
    <div>
      ${m.role!=='owner'?`
        <select class="inp mini" onchange="setMemberRole('${vid}','${m.id}',this.value)">
          <option value="editor"${m.role==='editor'?' selected':''}>Düzenleyen</option>
          <option value="viewer"${m.role==='viewer'?' selected':''}>İzleyici</option>
        </select>
        <button class="btn ghost mini" onclick="removeMember('${vid}','${m.id}')">✕</button>
        ${m.status==='active'?`<button class="btn ghost mini" onclick="transferOwner('${vid}','${m.id}')">👑</button>`:''}
      `:''}
    </div></div>`).join('');
  sheet(`<h3>Üyeler</h3>
  <p class="mini" style="margin-top:0">⚠️ Davet ettiğiniz kişi bu kasadaki <b>tüm finansal verinizi</b> görür.</p>
  ${rows}
  <button class="btn gold" onclick="openInvite('${vid}')">➕ Kişi Davet Et</button>
  <button class="btn danger" onclick="deleteVault('${vid}')">🗑️ Kasayı Sil</button>
  <button class="btn ghost" onclick="closeSheet()">Kapat</button>`);
}
function openInvite(vid){
  sheet(`<h3>Kişi Davet Et</h3>
  <p class="mini" style="margin-top:0">Davet edilen kişi <b>aynı e-posta ile Google girişi</b> yaptığında kasa otomatik olarak listesinde görünür.</p>
  <label class="lbl">Google e-posta adresi</label>
  <input id="f-iemail" class="inp" type="email" placeholder="ornek@gmail.com">
  <label class="lbl">Yetki</label>
  <select id="f-irole" class="inp">
    <option value="editor">Düzenleyen — kayıt ekleyip değiştirebilir</option>
    <option value="viewer">İzleyici — yalnızca görür</option>
  </select>
  <button class="btn primary" onclick="saveInvite('${vid}')">Davet Et</button>
  <button class="btn ghost" onclick="closeSheet()">Vazgeç</button>`);
}
async function saveInvite(vid){
  const em=(document.getElementById('f-iemail').value||'').trim().toLowerCase();
  const role=document.getElementById('f-irole').value;
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){toast('Geçerli bir e-posta girin');return}
  const r=await sbFetch('brkt_members',{method:'POST',body:JSON.stringify({
    vault_id:vid,email:em,role:role,status:'pending'})});
  if(r&&r.ok){closeSheet();toast('Davet oluşturuldu ✓');openMembers(vid)}
  else if(r&&r.status===409)toast('Bu kişi zaten davet edilmiş');
  else toast('Davet oluşturulamadı');
}
async function setMemberRole(vid,mid,role){
  const r=await sbFetch('brkt_members?id=eq.'+mid,{method:'PATCH',body:JSON.stringify({role:role})});
  toast(r&&r.ok?'Yetki güncellendi ✓':'Yetki değiştirilemedi');
  openMembers(vid);
}
function removeMember(vid,mid){
  openConfirm('Bu kişi kasadan çıkarılsın mı? Verileri görmeye devam edemez.',async()=>{
    const r=await sbFetch('brkt_members?id=eq.'+mid,{method:'DELETE'});
    toast(r&&r.ok?'Çıkarıldı ✓':'Çıkarılamadı');
    openMembers(vid);
  },'Çıkar');
}
function leaveVault(vid){
  openConfirm('Bu kasadan ayrılmak istiyor musunuz? Kasadaki veriler diğer üyelerde kalır, siz erişemezsiniz.',async()=>{
    const s=await sbToken();if(!s)return;
    const r=await sbFetch('brkt_members?vault_id=eq.'+vid+'&user_id=eq.'+s.user.id,{method:'DELETE'});
    if(r&&r.ok){
      localStorage.removeItem(dataKey(vid));
      localStorage.setItem(VAULT_KEY,'local');
      await refreshVaults();
      if(_vaults.length)await switchVault(_vaults[0].id);else{S=load();renderAll()}
      toast('Kasadan ayrıldınız');
    }else toast('Ayrılınamadı');
  },'Ayrıl');
}
function transferOwner(vid,mid){
  const m=_members.find(x=>x.id===mid);if(!m)return;
  openConfirm(esc(m.email)+' bu kasanın sahibi yapılsın mı? Siz "Düzenleyen" olacaksınız ve üyelik yönetimini kaybedeceksiniz.',async()=>{
    const s=await sbToken();if(!s)return;
    // 1) kasa sahipliği  2) yeni sahibin rolü  3) benim rolüm
    const a=await sbFetch('brkt_vaults?id=eq.'+vid,{method:'PATCH',body:JSON.stringify({owner_id:m.user_id})});
    const b=await sbFetch('brkt_members?id=eq.'+mid,{method:'PATCH',body:JSON.stringify({role:'owner'})});
    const c=await sbFetch('brkt_members?vault_id=eq.'+vid+'&user_id=eq.'+s.user.id,{method:'PATCH',body:JSON.stringify({role:'editor'})});
    if(a&&a.ok&&b&&b.ok&&c&&c.ok){closeSheet();await refreshVaults();toast('Sahiplik devredildi ✓')}
    else toast('Devredilemedi');
  },'Devret');
}
function deleteVault(vid){
  openConfirm('Bu kasa ve içindeki TÜM veriler kalıcı olarak silinsin mi? Diğer üyeler de erişimini kaybeder. Bu işlem geri alınamaz.',async()=>{
    const r=await sbFetch('brkt_vaults?id=eq.'+vid,{method:'DELETE'});
    if(r&&r.ok){
      localStorage.removeItem(dataKey(vid));
      localStorage.setItem(VAULT_KEY,'local');
      await refreshVaults();
      if(_vaults.length)await switchVault(_vaults[0].id);else{S=load();renderAll()}
      toast('Kasa silindi');
    }else toast('Kasa silinemedi');
  },'Sil');
}
```

> **Devir sırası önemli:** `brkt_vaults.owner_id`'yi **önce** güncellemek, kendi rolünüzü `editor`'a düşürdükten sonra `brkt_members` politikasının sizi engellemesini önler. Yukarıdaki sıra (kasa → yeni sahip → ben) bunu sağlar.

- [ ] **Step 2b: Açılışta çağrıyı bağla**

Task 6 Step 5'teki açılış sırasında `claimInvites()` zaten `migrateToVault()`'tan önce çağrılıyor. Doğrulayın.

- [ ] **Step 3: İki gerçek hesapla uçtan uca doğrula**

Bu adım **iki ayrı Google hesabı** gerektirir (ikinci bir tarayıcı profili veya telefon).
1. Hesap A: yeni kasa "Ortak Kasa" oluştur, Hesap B'nin gmail'ini **Düzenleyen** olarak davet et
2. Supabase: `select email,role,status from public.brkt_members where status='pending';` → satır var
3. Hesap B: uygulamayı aç, Google ile gir → "1 kasa davetiniz kabul edildi ✓" toast'ı, kasa listesinde "Ortak Kasa" var
4. B kasaya geç, varlık ekle → A'da ~1 sn içinde göründü
5. A varlık ekler, B borç ekler (yakın zamanda) → **ikisi de** her iki cihazda var
6. B bir kaydı siler → A'da kayıt kayboldu ve **geri dirilmiyor** (30 sn bekle, yenile)
7. A, B'yi **İzleyici** yapar → B'de sayfa yenilenince düzenleme düğmeleri kayboldu (Task 12 sonrası)
8. A, B'yi çıkarır → B'de kasa listeden düştü, verisine erişemiyor
9. B kendini davet ettirip "Kasadan Ayrıl" → temiz ayrılıyor

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: kasa uyelik yonetimi (davet, rol, cikarma, ayrilma, devir, silme)"
```

---

## Task 12: İzleyici modu

**Files:**
- Modify: `index.html` — CSS bloğu, `save()` (Task 6'da kapı eklendi), `renderAll()` (541)

- [ ] **Step 1: Salt-okunur CSS'i ekle**

```css
/* İzleyici modu: yazma yolları save() kapısıyla ve RLS ile kapalı;
   burada yalnızca düğmeleri gizliyoruz. */
body.ro .wr-hide{display:none!important}
body.ro .robadge{display:inline-block}
.robadge{display:none;font:600 10px/1.2 Manrope,sans-serif;padding:2px 7px;
  border-radius:9px;background:var(--gold);color:var(--green-dk);margin-left:6px}
```

- [ ] **Step 2: Tüm yazma düğmelerine `wr-hide` sınıfı ver**

Şu düğmeleri `class="... wr-hide"` yapın (arama ile bulun — `onclick` içeriğine göre):
- `openAsset(` , `delAsset(` , `openDebt(` , `delDebt(` , `toggleDebt(` , `openPayment(` , `delPayment(`
- `openTrust(` , `delTrust(` , `toggleTrust(` , `openTrustPayment(` , `delTrustPayment(`
- `openZekat(` , `delZekat(` , `openHavl(`
- Kur elle giriş formunun kaydet düğmesi (`saveRatesForm(`), `fetchRates(` **hariç** (okuma sayılır, ama `save()` çağırdığı için izleyicide sessizce başarısız olur — bu yüzden onu da gizleyin)
- `importData(` , `wipeData(` (Ayarlar), `restoreLocalBackup(`

Doğrulama: `git grep -c "wr-hide" index.html` → 20'den fazla eşleşme olmalı.

- [ ] **Step 3: Rozeti ve gövde sınıfını bağla**

`renderAll()` (541) başına:

```js
function renderAll(){
  document.body.classList.toggle('ro',_role==='viewer');
  renderOzet();renderWarnings();renderVarlik();renderZekat();renderBorc();renderTrusts();renderAyar();
  renderVaultBar();
}
```

Ana bakiye kartı başlığının yanına: `<span class="robadge">İzleyici</span>`

- [ ] **Step 4: `save()` kapısını doğrula**

Task 6 Step 2'de eklenen kapı yerinde olmalı:

Run: `git grep -n "İzleyici modundasınız" index.html`
Expected: `save()` içinde 1 eşleşme

- [ ] **Step 5: İzleyici olarak doğrula**

1. Hesap A, Hesap B'yi **İzleyici** yapsın
2. B'de: hiçbir ➕ / ✏️ / 🗑️ düğmesi görünmüyor, "İzleyici" rozeti var
3. B'nin konsolunda elle `S.assets.push({id:'x',qty:1,type:'gram'});save()` → toast "İzleyici modundasınız", `localStorage` **değişmedi**
4. B'nin konsolunda elle REST çağrısı (`doCloudPush(false)`) → "İzleyici modunda buluta yazılamaz"; kapı kaldırılsa bile RLS reddedecektir (Task 5 Step 3 ile kanıtlandı)
5. A tarafında hâlâ her şey düzenlenebiliyor

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: izleyici modu (canEdit kapisi, salt-okunur arayuz, rozet)"
```

---

# FAZ 4 — Uyumluluk ve yayın

## Task 13: Hesap silme — kasa sahipliği devri

**Files:**
- Modify: `supabase/functions/bereket-delete-account/index.ts`
- Modify: `index.html` — `deleteAccount()` (1223), `deleteAccountRun()` (1237)

> **KRİTİK:** Fonksiyon adı `bereket-delete-account` **değişmez**. Paylaşılan `beebook` projesinde Borç Defteri'nin `delete-account` fonksiyonu ayrıdır; adı karıştırırsanız onun üzerine yazarsınız.

- [ ] **Step 1: Mevcut fonksiyonu oku**

Run: `cat supabase/functions/bereket-delete-account/index.ts`
Mevcut akışı not edin: JWT → `brkt_data` sil → diğer uygulama tablolarını kontrol et → boşsa `deleteUser`.

- [ ] **Step 2: Kasa mantığını ekle**

`brkt_data` silme adımından **sonra**, diğer uygulama tablolarını kontrol etmeden **önce** şu bloğu ekleyin (`admin` = service role client, `uid` = JWT'den çözülen kullanıcı id'si):

```ts
// --- Paylaşılan kasalar ---
// Silme ASLA engellenmez (Play şartı), ama başkasının verisi yok edilmez.
const { data: myVaults } = await admin
  .from('brkt_vaults').select('id').eq('owner_id', uid);

for (const v of myVaults ?? []) {
  // Bu kasadaki diğer aktif üyeler, en eskisi önce
  const { data: others } = await admin
    .from('brkt_members')
    .select('id,user_id,email,joined_at')
    .eq('vault_id', v.id)
    .eq('status', 'active')
    .neq('user_id', uid)
    .order('joined_at', { ascending: true });

  if (others && others.length > 0) {
    // Sahipliği en eski aktif üyeye devret: kasa yaşamaya devam eder
    const heir = others[0];
    await admin.from('brkt_vaults').update({ owner_id: heir.user_id }).eq('id', v.id);
    await admin.from('brkt_members').update({ role: 'owner' }).eq('id', heir.id);
    await admin.from('brkt_members').delete().eq('vault_id', v.id).eq('user_id', uid);
  } else {
    // Başka üye yok: kasa ve verisi silinir (members'a CASCADE ile gider)
    await admin.from('brkt_vaults').delete().eq('id', v.id);
  }
}
// Sadece üye olduğum kasalardan üyeliğimi kaldır (kasalar ve verileri kalır)
await admin.from('brkt_members').delete().eq('user_id', uid);
```

Yanıt gövdesine devredilen kasa sayısını ekleyin: `{ success: true, accountDeleted, vaultsTransferred }`.

- [ ] **Step 3: Deploy et**

`deploy_edge_function` (project_id: `pdxnpnlwrtswwifevlil`, name: **`bereket-delete-account`**, dosya içeriği). `verify_jwt` **true** kalmalı.

Doğrulama: `list_edge_functions` → `bereket-delete-account` **ve** Borç Defteri'nin `delete-account` fonksiyonu **ikisi de** listede duruyor.

- [ ] **Step 4: Silme onay ekranını kasalar hakkında bilgilendirici yap**

```js
async function deleteAccount(){
  let extra='';
  if(getSession()){
    const s=await sbToken();
    if(s){
      const owned=_vaults.filter(v=>v.owner_id===s.user.id);
      if(owned.length)extra=`<p class="mini">Sahibi olduğunuz kasalar: <b>${owned.map(v=>esc(v.name)).join(', ')}</b>. Başka üyesi olan kasalar en eski üyeye <b>devredilir</b>, üyesi olmayanlar <b>silinir</b>.</p>`;
    }
  }
  sheet(`<h3>⚠️ Hesabı Sil</h3>
  <p class="mini" style="margin-top:0">Bu işlem <b>geri alınamaz</b>. Buluttaki <b>Bereket verileriniz</b> kalıcı olarak silinir.</p>
  ${extra}
  <p class="mini" style="opacity:.85">ℹ️ Google hesabınız yalnızca başka hiçbir uygulamada veriniz kalmadıysa tamamen silinir; aksi halde hesabınız korunur ve sadece Bereket verisi silinir.</p>
  <p class="mini">Bu cihazdaki yerel verileriniz cihazda kalır; onları ayrıca "Tüm Verileri Sil" ile temizleyebilirsiniz.</p>
  <button class="btn danger" onclick="deleteAccountConfirm()">Devam et →</button>
  <button class="btn ghost" onclick="closeSheet()">Vazgeç</button>`);
}
```

`deleteAccountRun()` (1237) sonuna, oturum temizliğine ek olarak: `rtClose(); localStorage.removeItem(VAULT_KEY); _vaults=[];`

- [ ] **Step 5: İki hesapla doğrula**

1. Hesap A + B ortak kasada, A sahip. A hesabını silsin.
2. Supabase: `select owner_id from public.brkt_vaults where id='<kasa>';` → **B'nin id'si**
3. `select role from public.brkt_members where vault_id='<kasa>' and user_id='<B>';` → `owner`
4. `select count(*) from public.brkt_members where user_id='<A>';` → `0`
5. B'de uygulama açılınca kasa duruyor, veri tam, artık **Sahip** rozeti var
6. Diğer uygulamaların tabloları etkilenmemiş: `select count(*) from public.borc_...` (varsa) değişmemiş

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/bereket-delete-account/index.ts index.html
git commit -m "feat: hesap silmede kasa sahipligi devri (Play Store uyumu)"
```

---

## Task 14: Gizlilik politikası ve Data Safety notu

**Files:**
- Modify: `gizlilik-politikasi.html`
- Modify: `PLAY_STORE_YAYINLAMA_REHBERI.md`

- [ ] **Step 1: Mevcut metni oku ve yanlış olan iddiayı bul**

Run: `git grep -n "yalnızca\|kendi hesab\|paylaş" gizlilik-politikasi.html`
"Veriler yalnızca kendi hesabınızda" türü ifadeler artık **yanlıştır**, düzeltilecek.

- [ ] **Step 2: Paylaşım bölümünü ekle**

`gizlilik-politikasi.html` içine, veri saklama bölümünden sonra:

```html
<h2>Paylaşılan Kasalar</h2>
<p>Bereket, verilerinizi seçtiğiniz kişilerle paylaşmanıza olanak tanır ("kasa" paylaşımı).
Bu tamamen isteğe bağlıdır ve yalnızca siz açıkça davet ettiğinizde gerçekleşir.</p>
<ul>
  <li><b>Davet ettiğiniz kişi, o kasadaki tüm finansal verilerinizi</b> (varlıklar, borçlar,
  alacaklar, emanetler, zekât kayıtları) görür. "Düzenleyen" yetkisi verdiyseniz
  bu verileri değiştirebilir ve silebilir; "İzleyici" yetkisi verdiyseniz yalnızca görür.</li>
  <li>Davet edebilmek için girdiğiniz <b>e-posta adresi sunucumuzda saklanır</b> ve davet
  edilen kişi bu adresle giriş yaptığında eşleştirilir.</li>
  <li>Bir kasadan ayrılmanız veya hesabınızı silmeniz, o kasadaki verilerin
  <b>diğer üyelerde kalmasını engellemez</b>. Paylaşılmış veriyi geri almanın bir yolu yoktur.</li>
  <li>Hesabınızı silerseniz, sahibi olduğunuz ve başka üyesi bulunan kasalar
  <b>en eski üyeye devredilir</b>; başka üyesi olmayan kasalar verileriyle birlikte silinir.</li>
</ul>
<p>Kasa paylaşımını hiç kullanmazsanız verileriniz yalnızca sizin hesabınızda kalır.</p>
```

Ayrıca "veriler yalnızca sizin hesabınızda" gibi mutlak ifadeleri "kasa paylaşımını kullanmadığınız sürece yalnızca sizin hesabınızda" olacak şekilde düzeltin. Sürüm/tarih satırını **10.08.2026** yapın.

- [ ] **Step 3: Play Store rehberine Data Safety notunu ekle**

`PLAY_STORE_YAYINLAMA_REHBERI.md` içine belirgin bir uyarı:

```markdown
## ⚠️ Data Safety formu (v1.19.0 sonrası ZORUNLU değişiklik)

v1.19.0 ile paylaşılan kasa özelliği geldi. Play Console → App content → Data safety:

- **"Is any of the collected data shared with third parties?"** → Bu özellik için
  "diğer kullanıcılarla paylaşım" beyanı gerekir: **Financial info → Other financial info**
  kategorisinde **"Data is shared"** işaretlenmelidir. Paylaşım, kullanıcının kendi
  davetiyle ve isteğe bağlı olarak gerçekleşir; formda "optional" olarak belirtin.
- Toplanan veriler: **E-mail address** (davet eşleştirmesi için), **Financial info**
  (varlık/borç/zekât kayıtları), her ikisi de **App functionality** amacıyla.
- Bunu işaretlemeden yayınlamak politika ihlalidir ve uygulamanın kaldırılmasına yol açabilir.
```

- [ ] **Step 4: Doğrula**

Run: `python -m http.server 8000` → `http://localhost:8000/gizlilik-politikasi.html`
Sayfa açılıyor, yeni bölüm görünüyor, "yalnızca kendi hesabınızda" türü **çelişkili ifade kalmadı**:

Run: `git grep -n "yalnızca sizin hesabınızda" gizlilik-politikasi.html`
Expected: yalnızca koşullu ("kasa paylaşımını kullanmadığınız sürece…") bağlamda geçiyor.

- [ ] **Step 5: Commit**

```bash
git add gizlilik-politikasi.html PLAY_STORE_YAYINLAMA_REHBERI.md
git commit -m "docs: gizlilik politikasina kasa paylasimi ve Data Safety notu"
```

---

## Task 15: Sürüm yükseltme, service worker, dokümantasyon

**Files:**
- Modify: `index.html` — `APP_VERSION` (414), `CHANGELOG` (415)
- Modify: `sw.js` — `CACHE` (13)
- Modify: `README.md`, `CLAUDE.md`

- [ ] **Step 1: Sürümü yükselt**

`index.html`:
```js
const APP_VERSION='1.19.0';
```
`CHANGELOG` dizisinin başına:
```js
{v:'1.19.0',d:'Paylaşılan kasalar: verilerinizi eşinizle veya ortağınızla paylaşın (Düzenleyen/İzleyici yetkileri), anlık senkron, kayıt bazlı birleştirme'},
```
(Mevcut dizinin biçimine uyun — `CHANGELOG`'un ilk elemanına bakıp aynı alan adlarını kullanın.)

- [ ] **Step 2: Service worker önbelleğini tazele**

`sw.js` satır 13:
```js
const CACHE = 'bereket-v1.19.0';
```
Başlık yorumundaki `(v1.17.0)` ibaresini de `(v1.19.0)` yapın.

- [ ] **Step 3: README'yi güncelle**

Özellik listesine ekleyin:
```markdown
- **Paylaşılan kasalar**: verilerinizi eşinizle veya ortağınızla paylaşın. Herkes kendi
  Google hesabıyla girer; davet ettiğiniz kişiye **Düzenleyen** veya **İzleyici** yetkisi
  verirsiniz. Değişiklikler karşı tarafta anında görünür. Birden çok kasa tutup
  aralarında geçiş yapabilirsiniz (örn. "Kasam" ve "Ortak Kasa").
```
Sürüm rozetini/satırını v1.19.0 yapın.

- [ ] **Step 4: CLAUDE.md'ye mimari bölümünü ekle**

"Mimari" başlığı altına:

```markdown
- **Paylaşılan kasalar (v1.19.0)**: Veri artık kullanıcı satırında değil **kasa satırında** durur:
  `brkt_vaults(id, name, owner_id, data jsonb, updated_at)` + `brkt_members(vault_id, user_id,
  email, role, status)`. Roller `owner`/`editor`/`viewer`. RLS özyinelemesini kırmak için tüm
  politikalar `security definer` `brkt_role(v uuid)` fonksiyonunu kullanır — politikalarda
  tablolara **doğrudan bakılmaz**. Davet e-posta ile yapılır, davetli girince
  `brkt_claim_invites()` (JWT e-postasıyla eşleştirir) üyeliği bağlar. Eski `brkt_data`
  **silinmedi**, geri dönüş sigortası olarak duruyor.
- **Kayıt bazlı birleştirme (v1.19.0, KRİTİK)**: Tek jsonb blob taşınmaya devam eder ama artık
  üzerine yazılmaz. Her kayıtta `mod` damgası var; silme `{del:true}` **mezar taşıdır**
  (diziden çıkarmak bir cihazın silmesini diğerinin diriltmesine yol açar). `index.html`'de
  `/* ==== BEREKET-SYNC-CORE-START/END ==== */` işaretleri arasındaki **saf** fonksiyonlar
  (`mergeList`, `mergeData`, `gcTombstones`, `stampAll`, `alive`) bunu yapar ve
  `tests/sync-core.test.mjs` bu bloğu çıkarıp `node --test` ile sınar — **işaret yorumlarının
  metnini değiştirmeyin**. Okuma yolları `S.assets` yerine **`LIVE.assets()`** kullanır
  (mezar taşlarını filtreler). `hide` artık senkronlanmaz, cihaz ayarıdır (`bereket_hide`).
  Yazma iyimser kilitlidir: `PATCH ...&updated_at=eq.<okunan>`, 0 satırda yeniden okuyup
  dener (en fazla 3). `mod` damgaları cihaz saatinden gelir; sunucunun `Date` başlığıyla
  ölçülen sapma `setSkew()` ile düzeltilir.
- **localStorage kasa kapsamı (v1.19.0)**: veri `bereket_v1_<kasaId>` (girişsizken
  `bereket_v1_local`), aktif kasa `bereket_vault`, günlük yedekler
  `bereket_bak_<kasaId>_<gün>`, migrasyon bayrağı `bereket_migrated_v2`, migrasyon öncesi
  tam yedek `bereket_bak_premigrate`. Eski `bereket_v1` anahtarı migrasyon kaynağı olarak
  okunur, silinmez.
- **Realtime (v1.19.0)**: ham `WebSocket` ile Phoenix kanal protokolü (kütüphane yok);
  `brkt_vaults` tablosunun aktif kasa satırındaki UPDATE olaylarına abone olunur
  (`replica identity full` + `supabase_realtime` yayını gerekir). Gelen payload'a güvenilmez,
  satır `cloudLoad()` ile tazelenir. **Polling emniyet ağı kaldırılmaz**: Realtime bağlıyken
  60 sn, kopmuşsa 5 sn. Modal/form açıkken gelen değişiklik `_pendingCloud`'a alınır,
  `closeSheet()` sonrası uygulanır.
- **İzleyici modu (v1.19.0)**: `canEdit()` kapısı `save()`'in ilk satırındadır — hiçbir
  düzenleme düğmesi gözden kaçsa bile veri yazılmaz. Görsel kapı `<body class="ro">` +
  `.wr-hide` sınıfı. Gerçek güvenlik RLS'tedir.
```

"Kurallar" bölümüne 6. madde:
```markdown
6. Birleştirme çekirdeğini (`BEREKET-SYNC-CORE` bloğu) değiştirirken `node --test "tests/*.test.mjs"`
   koşulmalıdır; bu blok DOM/S/localStorage'a dokunmayan **saf** fonksiyonlardan oluşur.
```

"Yol Haritası" → "Tamamlananlar" satırına: `paylaşılan kasalar (v1.19.0)`.

- [ ] **Step 5: Tam regresyon geçişi**

Run: `node --test "tests/*.test.mjs"`
Expected: tüm testler PASS

Run: `python -m http.server 8000`, tarayıcıda spec §13 doğrulama listesinin 9 maddesini sırayla geçin:
1. Girişsiz kullanım eskisiyle birebir aynı
2. Migrasyon sonrası tüm veri yerinde
3. İki hesap: A varlık + B borç → ikisi de her iki tarafta
4. B'nin sildiği kayıt dirilmiyor
5. Değişiklik ~1 sn'de görünüyor; WS kapatılınca 5 sn polling devralıyor
6. Form açıkken gelen değişiklik formu kaybettirmiyor
7. İzleyici hiçbir şey yazamıyor (arayüz + RLS)
8. Sahip hesabını silince kasa devroluyor, diğer uygulamalar bozulmuyor
9. Çevrimdışı: iki cihaz ayrı kayıt girip bağlanınca ikisi de korunuyor

Ayrıca kabuk regresyonu (telefonda veya cihaz modunda): alt menü ekranın dibinde, tek parmakla kaydırma akıcı, içerik yeşil başlığın altında kaybolmuyor.

- [ ] **Step 6: Commit ve push**

```bash
git add index.html sw.js README.md CLAUDE.md
git commit -m "v1.19.0: paylasilan kasalar (coklu kasa, roller, kayit bazli birlestirme, realtime)"
git push
```

> Push `SSL routines::unexpected eof` ile başarısız olursa ağ sorunudur; commit'ler yereldedir, bağlantı düzelince `git push` yeterlidir.

---

## Bilinen kalan riskler (kabul edilmiş)

1. **Cihaz saati sapması** — `mod` damgaları cihaz saatindendir; `setSkew()` düzeltmesi sunucu `Date` başlığına dayanır, mükemmel değildir. Aynı kaydı iki kişi *aynı dakikada* düzenlerse yanlış taraf kazanabilir. Farklı kayıtlarda sorun yok.
2. **Aynı kaydın aynı anda düzenlenmesi** — birleştirme kayıt seviyesindedir, alan seviyesinde değil: iki kişi aynı borcun tutarını aynı anda değiştirirse biri kaybolur (kayıt bütün olarak kazanır). Farklı kayıtlar ve ödeme ekleme güvenlidir.
3. **Realtime bağlanmazsa** — polling devralır, gecikme 5 sn'ye çıkar; işlevsellik kaybı yok.
4. **Geri düzeltme yok (v1.18.0 devamı)** — borç/alacak → varlık aktarımı hâlâ kayıt düzenleme/silmede geri alınmaz.
