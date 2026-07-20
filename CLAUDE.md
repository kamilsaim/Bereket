# CLAUDE.md — Bereket

Bu dosya, projede çalışacak Claude oturumları için bağlam sağlar.

## Proje Özeti
**Bereket**, zekât ve varlık takibi için geliştirilmiş, **tek dosyalık HTML** mobil web uygulamasıdır (PWA tarzı). Kamil'in kişisel kullanımı içindir. Tüm veri cihazda `localStorage`'da tutulur; sunucu/backend yoktur.

- Dosya: `index.html` (HTML + CSS + JS tek dosyada, logo base64 gömülü) — GitHub Pages bu dosyayı otomatik olarak canlıya açar, **her zaman bu dosya düzenlenir**
- Dil: Tamamen **Türkçe** arayüz
- Dağıtım: GitHub Pages (statik)
- Güncel sürüm: **v1.9.0** — sürüm sabiti kodda `APP_VERSION`, geçmiş `CHANGELOG` dizisinde

## Kurallar (her düzenlemede uyulacak)
1. **Her değişiklikte sürüm artır**: `APP_VERSION` güncellenir, `CHANGELOG` dizisine yeni satır eklenir (küçük düzeltme = patch, yeni özellik = minor). `CHANGELOG` dizisi Ayarlar arayüzünde artık gösterilmiyor (kaldırıldı) ama iç kayıt olarak tutulmaya devam eder.
2. **Tek dosya kalacak** — harici JS/CSS dosyası eklenmez. Tek istisna: Google Fonts linki.
3. Arayüz metinleri Türkçe; para biçimi `Intl.NumberFormat('tr-TR')`.
4. Mevcut veri şemasını bozacak değişikliklerde `load()` içindeki `Object.assign(defaults(), d)` migrasyonu korunmalı.
5. README.md de yeni özelliklerle birlikte güncellenir.

## Mimari
- **Durum**: global `S` nesnesi → `localStorage` anahtarı `bereket_v1`
  - `assets[]` — {id, type, qty, note}
  - `debts[]` — {id, dir: 'borc'|'alacak', who, amount, cur: tl|usd|eur|gram|ceyrek|yarim|tam|cumhuriyet|ata|gumus, due, done, payments: [{id, amount, date}]}
  - `trusts[]` — {id, dir: 'bende'|'onda', who, amount, cur, note, done, payments: [{id, amount, date}]} — zekâta dahil olmayan emanet kayıtları (bkz. aşağıda)
  - `zakat[]` — {id, amount, date, note}
  - `rates{}` — gram, ceyrek, yarim, tam, cumhuriyet, ata, gumus, usd, eur (TL cinsinden)
  - `havl` — kamerî yıl başlangıç tarihi (ISO) veya null
  - `history[]` — {d: gün, v: net servet} günlük anlık görüntüler (maks. 180)
  - `hide` — gizlilik modu açık/kapalı
- **Varlık türleri**: `ASSET_TYPES` sözlüğü. `gram` 24 ayar/has kabul edilir; `gram22` (22 ayar gram altın) ve ayarlı ziynet altınları (`bilezik22`, `altin18`, `altin14`) `factor` (has karşılığı 0.916 / 0.750 / 0.585) × gram kuru ile değerlenir. Darphane altınlarının `hasGr` alanı has içeriklerini tutar (çeyrek 1.607 / yarım 3.215 / tam 6.43 / Cumhuriyet-Ata 6.615 g); `hasGrams(a)` ve `totalHasGold()` bu değerlerden toplam has altını hesaplar, varlık listesinde ve zekât detayında gösterilir.
- **Zekât hesabı**: nisab = `NISAB_GR` (80) × gram altın kuru; matrah = varlıklar + alacaklar − borçlar; matrah ≥ nisab ise zekât = matrah × 0.025.
- **Havl**: başlangıç + 354 gün = vade; vade geçince Özet ve Zekât sayfasında uyarı.
- **Ödenen/kalan zekât**: `zakatPaid()` havl başlangıcından (yoksa son 354 günden) itibaren ödemeleri toplar; kalan = hesaplanan − ödenen. Kalan 0 olunca havl yenileme önerilir.
- **Borç/alacak kısmi ödeme**: her kaydın `payments[]` dizisi vardır; `debtPaid(d)` toplam ödenen, `debtRemaining(d)` kalan bakiyeyi hesaplar (`d.amount - debtPaid(d)`). `debtValueTL(d)` artık tam tutar değil **kalan** bakiye üzerinden TL değeri döndürür — özet/borç toplamları buna göre hesaplanır. Kalan 0'a inince `done=true` otomatik ayarlanır. Borç/alacak listesindeki bir kayda tıklamak `openDebtCard(id)` ile kişi kartını açar: toplam/ödenen/kalan özeti ve tarih sıralı ödeme geçmişi burada gösterilir; oradan `openPayment(id)` (ödeme ekle) veya `openDebt(id)` (kaydı düzenle) açılır.
- **Borç/alacak düzenleme**: `openDebt(id)` hem ekleme hem düzenleme için kullanılır (id verilirse form doldurulur, `saveDebt(id)` günceller).
- **Borç/alacak liste satırı**: sadece "Borcum/Alacağım · **kalan tutar**" gösterilir; vade ve ödeme sayısı bilgisi kaldırıldı, bunlar `openDebtCard(id)` kişi kartında ayrıntılı gösterilmeye devam eder.
- **Borç/alacak toplam kartları döküm**: `curBreakdown(dir)` açık (done=false) kayıtların kalan bakiyesini `cur`'a göre gruplayıp toplar, "Alacak/Borç Toplamı" kartlarının altında `b-alacak-detay`/`b-borc-detay` içinde "500 $ · 3 çeyrek" biçiminde gösterir.
- **Varlık türü dökümü**: `assetBreakdown()` tüm varlıkları `type`'a göre gruplayıp `qty` toplar, Varlıklar sekmesinde liste üstünde "10 gr Gram Altın · 3 adet Çeyrek Altın" biçiminde gösterir (`renderVarlik()` içinde `breakLine`).
- **Emanetler**: `trusts[]` yapısal olarak `debts[]` ile aynıdır (`debtPaid`/`debtRemaining`/`debtValueTL` fonksiyonları ortak kullanılır), tek fark `dir`in `'bende'` (emanet bende duruyor) / `'onda'` (benim emanetim onda duruyor) olması. Borç sekmesinde ayrı "Emanetler" kartında listelenir (`renderTrusts()`), kendi CRUD seti vardır (`openTrust`, `saveTrust`, `toggleTrust`, `delTrust`, `openTrustCard`, `openTrustPayment`, `saveTrustPayment`, `delTrustPayment`). **`totals()` hiçbir emanet tutarını hesaba katmaz** — zekât matrahına ve net servete tamamen dahil değildir, sadece takip amaçlıdır.
- **Kur çekme**: `fetchRates()` → `https://finans.truncgil.com/v4/today.json` (ücretsiz, anahtarsız). Hata durumunda elle giriş her zaman mümkün. Uygulama her açılışta `fetchRates()`'i otomatik çağırır ve sonucu toast ile bildirir.
- **Render**: sekme başına `renderX()` fonksiyonları, `renderAll()` hepsini çağırır. Modal `sheet(html)` ile **ortalanmış** bir pencere olarak açılır (dip yapışık değil). Silme gibi geri alınamaz işlemler native `confirm()` yerine `openConfirm(msg,onYesCb)` ile uygulama içi onay penceresi kullanır.
- **Bulut yedekleme (isteğe bağlı)**: Supabase projesi `beebook` (`pdxnpnlwrtswwifevlil`), tablo `public.brkt_data` (`user_id` PK → `auth.users`, `data jsonb` = tüm `S` nesnesi, `updated_at`), RLS ile sadece kendi `user_id`'sine sahip satırı okur/yazar. Harici JS kütüphanesi eklenmediği için Supabase Auth/PostgREST doğrudan `fetch()` ile REST API üzerinden çağrılır (supabase-js CDN kullanılmaz — "tek dosya" kuralına uyar). Google OAuth `${SB_URL}/auth/v1/authorize?provider=google&redirect_to=...` ile başlar, dönüşte URL fragment'ındaki `access_token`/`refresh_token` `handleAuthRedirect()` içinde işlenir ve `bereket_sb_session` anahtarıyla `localStorage`'a kaydedilir. `cloudPush()`/`cloudPull()` sırasıyla `brkt_data`'ya upsert/select yapar; `save()` her çağrıldığında, oturum açıksa `queueCloudSync()` 2.5 sn debounce ile arka planda `cloudPush(true)` tetikler. Giriş yapılmadıkça bulut hiç devreye girmez — tamamen isteğe bağlıdır.

## Tasarım Sistemi
Logodan türetilmiştir (yeşil-altın cami kemeri, filiz, altın paralar):
- Renkler: `--green #1E5631`, `--green-dk #14402a`, `--gold #C9A227`, `--ivory #FAF7F0`, `--red #B4432F`
- Tipografi: başlıklar **Marcellus**, gövde **Manrope**; sayılar `tabular-nums`
- İmza öğe: ana bakiye kartı sivri **kemer formunda** (`border-radius:110px 110px 22px 22px`), header altı eliptik kemer geçişi
- Alt gezinme: 5 sekme (Özet 🕌 / Varlık 🪙 / Zekât 🌱 / Borç 🤝 / Ayarlar ⚙️)

## Yol Haritası / Fikirler
- Capacitor ile Android APK (Türbedar'daki iş akışı yeniden kullanılabilir)
- Bildirimli havl hatırlatıcısı
- Kur geçmişi ve altın alış-satış farkı takibi
