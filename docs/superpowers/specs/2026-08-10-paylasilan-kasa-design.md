# Paylaşılan Kasa (Çok Kullanıcılı Veri Paylaşımı) — Tasarım

Tarih: 2026-08-10
Hedef sürüm: **v1.19.0**
Durum: onaylanmış tasarım (uygulama planı ayrı yazılacak)

## 1. Amaç ve kapsam

Kamil'in varlık/borç/zekât verisini eşi veya ortak bir arkadaşıyla **aynı anda, iki yönlü** paylaşabilmesi. Her kullanıcı **kendi Google hesabıyla** girer; veriler karışmaz, paylaşım açıkça davet edilerek kurulur. Uygulama Play Store'a yükleneceği için hesap silme ve gizlilik gereklilikleri baştan karşılanır.

Kapsam dışı (bilinçli): davet kodu ile katılma, uygulama içi bildirim/e-posta gönderimi, kayıtları ayrı Postgres tablolarına taşıyan tam şema değişimi (bkz. §4 gerekçe), emanetlerin paylaşım semantiği değişikliği (emanetler bugünkü gibi kasa verisinin parçasıdır).

## 2. Mevcut durumun kısıtları

- Tüm `S` nesnesi tek `jsonb` blob olarak `brkt_data(user_id PK, data, updated_at)` satırına yazılır (`doCloudPush`, index.html).
- Tek RLS politikası: `kendi_kayitlari` ALL, `user_id = auth.uid()` — paylaşım imkânsız.
- Senkron 20 sn polling + `save()` sonrası 2.5 sn debounce push. **Son yazan kazanır**: iki kişi aynı blob'a yazarsa biri sessizce kaybolur. Paylaşımın asıl zorluğu budur, RLS değil.
- Kabuk/kaydırma kuralları (v1.13.0 flexbox kabuğu, v1.14.4 `position:fixed` body, v1.14.6 status bar meta'sı) ve veri kaybı korumaları (v1.14.0 `_syncReady`, `isEmptyData`, günlük yedekler) **korunacaktır**.

## 3. Kararlar özeti

| Konu | Karar |
|---|---|
| Kasa modeli | Çok kasa + kasa seçici (kullanıcı birden çok kasaya üye olabilir) |
| Çakışma çözümü | Kayıt bazlı birleştirme (`mod` damgası + `del` mezar taşı), blob taşıma korunur |
| Roller | `owner` / `editor` / `viewer` — davet başına seçilir, sahip sonradan değiştirebilir |
| Davet | E-posta ile; davetli o e-postayla giriş yapınca kasa otomatik görünür |
| Anlık güncelleme | Supabase Realtime (ham WebSocket, kütüphanesiz) + yedek polling |
| Yerel-only kullanım | Giriş yoksa uygulama bugünkü gibi tamamen yerel çalışır, kasa kavramı görünmez |

## 4. Neden kayıt bazlı birleştirme (ayrı tablolar değil)

Kayıtları `brkt_assets`, `brkt_debts` gibi gerçek satırlara taşımak en doğru çözümdür (Postgres çakışmayı kendi çözer), ancak `S` mimarisi, `localStorage` şeması, çevrimdışı çalışma (v1.17.0) ve günlük yedekleri baştan yazmak gerekir — uygulamanın en riskli ameliyatı olur ve projede gerçek veri kaybı geçmişi var. Kayıt bazlı birleştirme, doğruluğun büyük kısmını bu riski almadan verir ve çevrimdışı senaryoyla (iki cihaz çevrimdışı kayıt girip sonra bağlanır) doğal olarak uyumludur.

## 5. Veri modeli

Yeni tablolar `brkt_` önekiyle (paylaşılan `beebook` projesinde diğer uygulamalara dokunmadan):

### `brkt_vaults`
| kolon | tip | not |
|---|---|---|
| `id` | `uuid` PK, default `gen_random_uuid()` | |
| `name` | `text not null` | "Kamil'in Kasası", "Ortak Kasa" |
| `owner_id` | `uuid not null → auth.users(id)` | sahiplik devredilebilir |
| `data` | `jsonb not null default '{}'` | bugünkü `S` nesnesi olduğu gibi |
| `updated_at` | `timestamptz not null default now()` | iyimser kilit anahtarı |
| `created_at` | `timestamptz not null default now()` | |

Veri **kasa satırında** durur, kullanıcı satırında değil. Kasa = veri kutusu.

### `brkt_members`
| kolon | tip | not |
|---|---|---|
| `vault_id` | `uuid not null → brkt_vaults(id) on delete cascade` | |
| `user_id` | `uuid null → auth.users(id)` | davet kabul edilene kadar boş |
| `email` | `text not null` | davet edilen adres, küçük harfe normalize |
| `role` | `text not null check (role in ('owner','editor','viewer'))` | |
| `status` | `text not null check (status in ('pending','active'))` | |
| `invited_at` | `timestamptz default now()` | |
| `joined_at` | `timestamptz null` | |

Kısıt: `unique(vault_id, lower(email))` — aynı kişi iki kez davet edilemez.

### Eski `brkt_data`
**Silinmez.** Migrasyondan sonra okunmaz halde durur; geri dönüş sigortasıdır (bkz. §11).

## 6. RLS ve yetkiler

**Özyineleme tuzağı:** `brkt_vaults` politikası `brkt_members`'a, `brkt_members` politikası kendine bakarsa Postgres sonsuz özyineleme hatası verir. Çözüm, RLS'i atlayan `security definer` yardımcı:

```
brkt_role(v uuid) returns text
-- çağıran kullanıcının (auth.uid()) o kasadaki aktif rolünü döndürür, üye değilse null
```

Politikalar **yalnızca** bu fonksiyonu kullanır, tablolara doğrudan bakmaz.

| Tablo | İşlem | Koşul |
|---|---|---|
| `brkt_vaults` | SELECT | `brkt_role(id) is not null` |
| `brkt_vaults` | UPDATE (`data`) | `brkt_role(id) in ('owner','editor')` |
| `brkt_vaults` | INSERT | `owner_id = auth.uid()` |
| `brkt_vaults` | DELETE | `brkt_role(id) = 'owner'` |
| `brkt_members` | SELECT | `brkt_role(vault_id) is not null` (üyeler birbirini görür) |
| `brkt_members` | INSERT/UPDATE/DELETE | `brkt_role(vault_id) = 'owner'` |

İstisna: üyenin **kendi** üyelik satırını silmesi ("kasadan ayrıl") ayrı bir politika ile serbesttir (`user_id = auth.uid()`), sahip kendi satırını silemez (önce devretmeli).

`viewer` sunucu tarafında da yazamaz — arayüzdeki `canEdit()` yalnızca kullanıcı deneyimidir, gerçek güvenlik burada.

### Davetin bağlanması
```
brkt_claim_invites() returns int   -- security definer
-- auth.jwt()->>'email' ile eşleşen, user_id'si boş satırlara
-- user_id = auth.uid(), status='active', joined_at=now() yazar
```
Uygulama açılışta bir kez çağırır. Davetli Google ile girdiği anda kasa listesinde belirir; ekstra ekran, kod veya e-posta gönderimi yok.

## 7. Senkron ve birleştirme

### Kayıt damgaları
`assets[]`, `debts[]`, `trusts[]`, `zakat[]` ve iç içe `payments[]` kayıtlarının her birine `mod` (ISO zaman) eklenir. Silme artık diziden çıkarmak değil, **`del:true` + yeni `mod`** yazmaktır (mezar taşı); yoksa bir cihazın silmesini diğeri geri diriltir. Listeleme/toplam alan tüm kod yolları `del` işaretlileri filtreler. 90 günden eski mezar taşları temizlenir.

### `mergeData(yerel, bulut)`
Her koleksiyon `id` üzerinden eşlenir, kayıt bazında **`mod`'u yeni olan kazanır**. Skalerler ayrı ayrı:

- `rates` + `ratesAt` — tek blok, `ratesAt`'ı yeni olan kazanır.
- `havl` — kendi `havlMod` damgasını alır.
- `hide` (gizlilik modu) — **senkronlanmaz**, `localStorage`'a taşınır. Cihaz ayarıdır.
- `history[]` — gün anahtarı `d` üzerinden birleşir, çakışan günde daha yeni yazılan kazanır.

### İyimser kilitli yazma
Push sırası: bulut satırını oku → birleştir → yaz. Okuma-yazma arasındaki yarış, koşullu güncelleme ile kapatılır:

```
PATCH /rest/v1/brkt_vaults?id=eq.<kasa>&updated_at=eq.<okunan updated_at>
```

0 satır güncellendiyse araya biri girmiştir → yeniden oku, birleştir, dene (en fazla 3 deneme; sonra `CLOUD_ERR_KEY` damgalanır ve kullanıcıya bildirilir). Kayıp güncelleme böylece yapısal olarak kapanır.

### Realtime
Ham `WebSocket` ile `wss://pdxnpnlwrtswwifevlil.supabase.co/realtime/v1/websocket` (kütüphane yok, tek dosya kuralı korunur):
- `phx_join` → `brkt_vaults` tablosunun aktif kasa satırındaki UPDATE olayları
- 30 sn'de bir `heartbeat`; kopunca artan gecikmeyle yeniden bağlanma (1→2→4→8→30 sn)
- Veritabanında `alter publication supabase_realtime add table brkt_vaults` gerekir
- Gelen olayın payload'ına güvenilmez (boyut sınırı/RLS filtresi): `cloudLoad()` ile satır tazelenir → birleştir → uygula

**Yedek polling korunur**: Realtime bağlıyken 60 sn, kopmuşsa 5 sn. WebSocket'in sessizce ölmesi tipik bir hata; yedeksiz bırakılmaz.

### Ekrandaki kullanıcıyı koruma
Modal/form açıkken gelen değişiklik anında uygulanmaz: `_pendingCloud` içinde bekletilir, kullanıcıya "Ortak kasada yeni değişiklik var, pencereyi kapatınca güncellenecek" bilgisi verilir, `closeSheet()` sonrası uygulanır.

### Kabul edilen zayıf nokta: saat sapması
`mod` damgaları cihaz saatinden gelir; saati epey şaşmış bir telefon birleştirmede yanlış tarafı seçebilir. Sunucu saatini her kayıt için kullanmak jsonb blob'da mümkün değil. Azaltma: bulut yanıtının `Date` başlığı ile cihaz saati farkı ölçülür, `mod` üretilirken düzeltme uygulanır.

### Korunan mevcut güvenceler
`_syncReady` bayrağı, açılış sırası (`handleAuthRedirect()` → `initialSync()` → `fetchRates()`), `isEmptyData()` koruması ve günlük yedekler aynen geçerlidir; hepsi kasa kapsamına uyarlanır.

## 8. Arayüz

### Aktif kasa ve yerel önbellek
- `localStorage.bereket_vault` = aktif kasa id'si
- Veri kasa başına: `bereket_v1_<kasaId>`; giriş yoksa `bereket_v1_local`
- Günlük yedekler (`bereket_bak_*`) kasa öneki alır — yoksa ortak kasanın yedeği kendi kasanın üstüne biner
- Çevrimdışıyken kasa değiştirmek çalışır (v1.17.0 desteği bozulmaz)

### Kasa geçişi
Üst başlıkta uygulama adının altında küçük kasa satırı ("🔁 Ortak Kasa"); tıklanınca kasa listesi penceresi açılır. Başlık yüksekliği değiştiği için `setHeaderPad()` yeniden ölçer. **`position:fixed`/`sticky` header/nav veya viewport yüksekliği (`--vh`/`innerHeight`/`dvh`) ölçümü eklenmez** — v1.13/v1.14 kuralları aynen korunur. Tek kasa varsa satır gösterilmez, arayüz bugünküyle aynı kalır.

### Ayarlar → "Kasalar" kartı
- Kasa listesi + rol rozeti ("Sahip" / "Düzenleyen" / "İzleyici")
- ➕ Yeni kasa oluştur, ✏️ yeniden adlandır (sahip)
- 👥 Üyeler: e-posta + rol ile davet et, bekleyen davetleri gör/iptal et, rol değiştir, üyeyi çıkar (sahip)
- 🚪 Kasadan ayrıl (üye), 🗑️ Kasayı sil (sahip, `openConfirm` ile; kasa silinince verisi ve üyelikleri gider)
- 👑 Sahipliği devret (sahip) — olmazsa sahip hesabını silince kasa erişilemez kalır

### İzleyici modu (üç katman)
1. `save()` başında `canEdit()` kapısı: izleyiciyse toast verip çıkar, hiçbir şey yazılmaz/push edilmez
2. `<body class="ro">` + CSS ile ekleme/düzenleme/silme düğmeleri gizlenir, üstte "İzleyici" rozeti
3. RLS sunucuda zorlar (§6)

### Zekât semantiği
Kasa başınadır: her kasanın kendi nisabı, havli, ödeme geçmişi. `totals()` yalnızca aktif kasanın verisiyle çalışır, hesap mantığı değişmez. Havl bildirimi karışıklığı önlemek için **yalnızca aktif kasa** için kurulur; kasa değişince yeniden kurulur.

## 9. Hesap silme (Play Store)

Silme **asla engellenmez** (Play şartı), ama başkasının verisi yok edilmez:

- Kullanıcının **sadece üye** olduğu kasalar: üyelik satırı silinir, kasa ve verisi kalır
- **Sahibi olduğu** ve başka aktif üyesi olan kasalar: sahiplik **en eski aktif üyeye otomatik devredilir**, kasa yaşar. Silme onay ekranında açıkça yazılır ("Ortak Kasa, Ayşe'ye devredilecek")
- Sahibi olduğu ve başka üyesi olmayan kasalar: kasa ve verisi silinir
- Sonra bugünkü mantık: diğer uygulama tablolarında (`borc_*`, `hediye_*`, `bd_*`, `user_data`) satır kalmadıysa auth hesabı da silinir, kaldıysa korunur — **paylaşılan `beebook` hesabı izolasyonu bozulmaz**

`bereket-delete-account` Edge Function'ı bu mantıkla güncellenir; **adı değişmez** (Borç Defteri'nin `delete-account` fonksiyonuna dokunulmaz).

## 10. Gizlilik politikası ve Data Safety

`gizlilik-politikasi.html` şu an "veriler yalnızca kendi hesabınızda" diyor; bu artık doğru değil. Eklenecek:
1. Davet ettiğin kişiler paylaştığın kasadaki tüm finansal veriyi görür
2. Davet için girilen e-posta adresi sunucuda saklanır
3. Kasadan ayrılmak veya hesabı silmek, o kasadaki verinin diğer üyelerde kalmasını engellemez

Play Console **Data Safety** formunda "Veriler diğer kullanıcılarla paylaşılıyor" işaretlenmelidir; işaretlemeden yayınlamak politika ihlalidir.

## 11. Migrasyon

### Aşama 1 — veritabanı (`apply_migration`)
Tablolar, `brkt_role`, `brkt_claim_invites`, politikalar, Realtime yayını. Eski `brkt_data` dokunulmaz.

### Aşama 2 — istemci (`migrateToVault()`)
`bereket_migrated_v2` bayrağıyla **bir kez** çalışır (idempotent):
1. Migrasyondan önce `bereket_bak_premigrate` anahtarına tam yedek alınır
2. Giriş varsa ve kullanıcının hiç kasası yoksa: `brkt_data` satırındaki veriyle "Kamil'in Kasası" oluşturulur, sahip üyeliği yazılır, yerel veri `bereket_v1_<id>`'ye taşınır
3. Giriş yoksa: yerel veri `bereket_v1` → `bereket_v1_local`
4. Tüm mevcut kayıtlara `mod` damgası basılır (`S.mod` varsa o, yoksa şimdi); `load()` içindeki `Object.assign(defaults(), d)` migrasyonu korunur
5. Aksilikte eski `brkt_data` + `bereket_bak_premigrate` ile geri dönülür

## 12. Sürüm ve dokümantasyon

- `APP_VERSION` → **v1.19.0**, `CHANGELOG` dizisine satır
- `sw.js` içindeki `CACHE` sürüm dizesi artırılır (kabuk değişiyor)
- `README.md` özellik listesi güncellenir
- `CLAUDE.md`'ye yeni mimari bölümü: kasalar, roller/RLS, kayıt bazlı birleştirme, Realtime, kasa başına localStorage anahtarları

## 13. Doğrulama ölçütleri

1. Tek kullanıcı, giriş yapmadan: uygulama bugünküyle birebir aynı çalışır, kasa arayüzü görünmez
2. Migrasyon sonrası mevcut tüm veri (varlık/borç/emanet/zekât/havl/kur/geçmiş) eksiksiz yerinde
3. İki farklı hesap aynı kasada: A varlık ekler, B borç ekler → **her ikisi de** her iki cihazda görünür
4. B'nin sildiği kayıt A'nın cihazında geri dirilmez
5. Değişiklik karşı tarafta ~1 sn içinde görünür; WebSocket elle kapatılırsa 5 sn'lik polling devralır
6. A'da form açıkken B değişiklik yapar → form kaybolmaz, kapanınca güncellenir
7. `viewer` rolüyle: hiçbir düzenleme düğmesi görünmez; REST'e elle istek atılsa RLS reddeder
8. Sahip hesabını siler → kasa en eski üyeye devrolur, diğer uygulamaların (`borc_*` vb.) verisi bozulmaz
9. Çevrimdışı: iki cihaz ayrı ayrı kayıt girer, bağlanınca ikisinin kaydı da korunur
