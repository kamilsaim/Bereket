# PLAY_STORE_YAYINLAMA_REHBERI.md

Bu dosya, Capacitor ile Android APK/AAB'ye çevrilmiş bir HTML+Supabase uygulamasını **Google Play Store'a yayınlama** sürecini baştan sona anlatır. Türbedar projesinde uygulanan gerçek akıştır; başka projelerde de aynen tekrarlanır. Bu, `CAPACITOR_APK_REHBERI.md`'nin devamıdır — o dosya "HTML'i APK'ya çevirme" mekaniğini anlatır, bu dosya ise "APK'yı mağazaya koyma" sürecini anlatır. Claude Code ikisini birlikte okumalı.

**Genel ilke:** Google'ın gereksinimleri zamanla değişiyor. Bu dosya Temmuz 2026 itibariyle geçerli olan kuralları anlatır — Play Console'da bir adım burada yazandan farklıysa, güncel ekrana güven, bu dosyayı ona göre güncelle.

---

## 1. Geliştirici Hesabı

- **Tek seferlik 25 dolar** kayıt ücreti (play.google.com/console).
- Google artık yeni hesaplarda **kimlik doğrulama** istiyor:
  - Ödeme sonrası hesap incelemesi (birkaç saat – 2 gün sürebilir)
  - **Android cihaz doğrulaması** — bir Android cihazda (telefon/tablet) hesaba giriş yapıp onay vermek
  - **Telefon numarası doğrulaması** — SMS kod
- Bu adımlar sırayla gelir, biri bitmeden diğeri açılmayabilir. Kullanıcıya "onaylandı" maili gelene kadar sabırla beklenir.

---

## 2. Hesap Silme Zorunluluğu (KRİTİK — atlanamaz)

Google Play, **hesap oluşturmaya izin veren her uygulamadan** şunu zorunlu kılıyor (Aralık 2023'ten beri):

1. **Uygulama içinden hesap silme** — kullanıcı, destek ekibine yazmadan, uygulamanın kendi arayüzünden hesabını silebilmeli.
2. **Web üzerinden de silme talebi imkânı** — uygulamayı silmiş/erişimi olmayan biri de bir web sayfasından hesap silme talebinde bulunabilmeli. Bu, Data Safety formunda bir URL olarak istenir.

**Tasarım tuzağı (Türbedar'da yaşandı, her projede kontrol et):** Bir kullanıcı silinince, o kullanıcının veritabanındaki **topluluğa ait katkıları** (eklediği kayıtlar, fotoğraflar, yorumlar) sorgusuz sualsiz silinmemeli — eğer ekleyen_id gibi sütunlar `ON DELETE CASCADE` ise, biri hesabını silince başkalarının faydalandığı içerik de yok olur. Çözüm:

- Silme işleminden ÖNCE, o kullanıcıya ait topluluk içeriğinin sahiplik sütununu (`ekleyen_id` vb.) sabit bir **"Silinmiş Kullanıcı"** sistem profiline devret (içerik kalır, kişisel bağ kalkar).
- Kişisel-ONLY veriler (mesaj, bildirim, ziyaret geçmişi gibi) CASCADE ile silinsin, bunda sorun yok.
- Gerçek silme işlemini (`auth.admin.deleteUser`) SADECE service role yetkisiyle çalışan bir **Edge Function** üzerinden yap — istemci tarafından asla doğrudan çağrılmamalı, `verify_jwt=true` ile sadece kendi hesabını silebilsin.
- Kurucu/tek yönetici hesabının silinmesini fonksiyon içinde reddet (uygulama sahipsiz kalmasın).

**Uygulama tarafı:** Profil sayfasında "Hesabımı Sil" düğmesi, iki aşamalı net onay ("bu işlem GERİ ALINAMAZ" uyarısıyla), başarılı olunca `signOut()` + sayfa yenileme.

**Web tarafı (her projede eksiksiz yapılmalı):** Gizlilik politikası sayfasına, uygulamasız da erişilebilen bir "hesap silme talebi" yöntemi eklenmeli — en basit hali bir e-posta adresi veya iletişim formu olabilir, Data Safety formunda bu URL istenir.

### 2.a. Paylaşılan Supabase projesi + izole hesap silme (Bereket'te yaşandı, KRİTİK)

Birden çok küçük uygulama **tek bir Supabase projesini ve tek `auth.users` tablosunu** paylaşabilir (ör. Bereket + Borç Defteri + Hediye + Arıcılık hepsi `beebook` projesinde; her uygulama kendi tablo önekini kullanır: `brkt_data`, `borc_*`, `hediye_*`, `bd_*`). Aynı Google hesabıyla giriş yapıldığında hepsi **aynı kullanıcı kaydını** paylaşır. Bu, hesap silmede iki büyük tuzak doğurur:

1. **Edge Function isim çakışması.** İki uygulama da fonksiyonunu `delete-account` diye deploy ederse biri diğerini **sessizce ezer** (Supabase fonksiyonları proje bazında tek isim alanı). Her uygulama fonksiyonunu **benzersiz adla** deploy etmeli: `bereket-delete-account`, `borc-delete-account` gibi. Belirtisi: fonksiyonun `version` numarası sen bir kez deploy ettiğin halde 2+ görünür.

2. **`auth.admin.deleteUser` paylaşılan hesabı siler → yanlış kurgu tüm uygulamaların verisini götürür.** Naif fonksiyon "kendi tablomu sil + `deleteUser`" yapar; ama `deleteUser` o tek ortak kimliği sildiği için, `ON DELETE CASCADE` olan diğer uygulama tabloları da yok olur (veya NO ACTION ise `deleteUser` FK ihlaliyle **başarısız** olur).

**Doğru desen — "akıllı / izole silme":** Her uygulamanın Edge Function'ı şunu yapar:
- (1) **Her zaman** yalnızca kendi tablolarını siler (`brkt_data` / `borc_*` …).
- (2) Diğer uygulamaların tablolarında o `user_id`'ye ait satır kalmış mı diye **sayım yapar** (`select('user_id',{count:'exact',head:true}).eq('user_id',uid)`).
- (3) **Hiç başka veri yoksa** `deleteUser` ile ortak hesabı da siler (`account_deleted:true`); **varsa** hesabı korur (`kept_for_other_apps:true`) ve sadece kendi verisini silmiş olur.

Böylece bir uygulamadan "hesabımı sil" demek diğer uygulamaların verisini bozmaz; hesap ancak kullanıcının hiçbir uygulamada verisi kalmadığında tamamen silinir. Bu, Play Store'un "hesap + veri silme" şartını karşılar ve paylaşılan mimaride veri kaybını önler. **FK'ları CASCADE'e çevirerek "hepsini birden sil" YAPMA** — izolasyonu bozar; sayım tabanlı akıllı silme tercih edilir.

**İstemci tarafı:** yanıttaki `account_deleted` bayrağına göre farklı toast göster ("hesabınız ve X verileriniz silindi" vs "X verileriniz silindi, hesabınız diğer uygulamalarda kullanıldığı için korundu").

---

## 3. Gizlilik Politikası

Zorunlu, bir URL olarak istenir (GitHub Pages'e statik bir HTML sayfası olarak konması yeterli — `gizlilik-politikasi.html` gibi, ana `index.html` ile aynı depoda).

İçermesi gerekenler:
- Hangi bilgiler toplanıyor (giriş sağlayıcısından gelen ad/e-posta/fotoğraf, konum, cihaz push token'ı vb.)
- Bu bilgiler ne için kullanılıyor
- Üçüncü taraflarla paylaşılıp paylaşılmadığı
- Verilerin nasıl silinebileceği (§2'deki hesap silme yöntemine referans)
- İletişim yolu

**Dikkat:** Politika metninde OLMAYAN bir özelliği (örn. "uygulama içinden hesabımı silebilirim") yazmadan önce, o özelliğin gerçekten kodda var olduğunu kontrol et — var olmayan bir vaadi yazıp sonra unutmak, hem kullanıcıyı yanıltır hem incelemede sorun çıkarabilir.

---

## 4. Veri Güvenliği Formu (Data Safety)

Play Console'da doldurulması istenen form — hangi veri kategorilerinin toplandığı, nasıl kullanıldığı, şifrelenip şifrelenmediği, silinip silinemeyeceği işaretlenir. Uygulamanın gerçekte ne yaptığına göre doldurulmalı; aşağıdaki tabloyu kullanıcıya (Kamil'e) sun, o işaretlesin:

| Veri türü | Toplanıyor mu? | Amaç |
|---|---|---|
| Ad, e-posta, profil fotoğrafı | Evet (OAuth ile) | Hesap işlevselliği |
| Konum (kaba/hassas) | Kullanıcı izin verirse | Uygulama işlevselliği (yer ekleme/ziyaret) |
| Fotoğraflar | Kullanıcı yüklerse | Uygulama içeriği |
| Cihaz kimliği (push token) | Evet | Bildirimler |

Genel kural: "veri satılıyor mu" → hayır; "üçüncü taraf pazarlama" → hayır; "şifreli aktarım" → evet (HTTPS/Supabase).

---

## 5. Mağaza Girişi (Store Listing)

- **Kısa açıklama:** max 80 karakter
- **Uzun açıklama:** max 4000 karakter
- **Uygulama simgesi:** 512×512, 32-bit PNG (alfa kanallı) — bkz. `CAPACITOR_APK_REHBERI.md` §4
- **Ekran görüntüleri:** en az 2, en fazla 8. **Kritik oran kuralı: uzun kenar, kısa kenarın en fazla 2 katı olabilir.** iPhone/bazı Android telefonların ekran görüntüleri (örn. 1179×2556 ≈ 2.17:1) bu sınırı AŞAR — yüklemeden önce oranı kontrol et:
  ```python
  from PIL import Image
  im = Image.open('ekran.png')
  g, y = im.size
  print(y/g)  # 2.0'ı geçiyorsa kırpılmalı
  ```
  Çözüm: üstteki durum çubuğunu (status bar) kırpmak hem oranı düzeltir hem daha profesyonel görünür:
  ```python
  kirpilmis = im.crop((0, 200, g, y))  # üstten ~200px kırp, oranı test et
  ```
- **Feature graphic:** tam 1024×500, JPEG veya 24-bit PNG — mağaza sayfasının üst kapak görseli.
- **Kategori** ve **anahtar kelimeler** seç.

---

## 6. AAB (Android App Bundle) — APK Değil

Play Store artık **AAB** formatını istiyor/tercih ediyor, ham APK'yı değil. Android Studio'da:

**Build → Generate Signed Bundle / APK → Android App Bundle** seçilir (önceki bölümlerde test için kullandığımız "Build APK" farklı bir akış, sadece yerel test için kalır).

### İmzalama anahtarı (keystore) — EN KRİTİK UYARI

Uygulamayı ilk kez imzalarken oluşturulan **keystore dosyası** (`.jks`) ve şifresi **kaybedilirse aynı uygulama bir daha güncellenemez** — Play Store, farklı bir anahtarla imzalanmış güncellemeyi kabul etmez, yeni bir uygulama olarak yayınlamak gerekir (tüm yorumlar, indirmeler, sıralama sıfırlanır).

Yapılması gerekenler:
1. Keystore oluşturulurken (`Create new...`) şifre ve dosya konumu **birden fazla güvenli yere** (bulut yedek, şifre yöneticisi, harici disk) kaydedilir.
2. **Play App Signing** özelliği aktif edilir (Google, yükleme anahtarını kendi tarafında da saklar — keystore'un tamamen kaybolması durumunda bile kurtarma yolu sağlar). Play Console ilk yüklemede bunu otomatik önerir, kabul edilmeli.
3. Keystore dosyası projeyle birlikte git'e ASLA commit edilmez (`.gitignore`'a eklenir).

---

## 7. Kapalı Test Zorunluluğu (Yeni Hesaplar)

2023 sonrası açılan geliştirici hesapları, uygulamayı doğrudan herkese açık (production) yayınlayamaz. Önce:

- **Kapalı test (Closed testing)** aşaması: en az **12 test kullanıcısı** e-posta ile davet edilir, bunların **14 gün boyunca** aktif kullanması gerekir.
- Bu süre dolup Google'ın "üretim aşamasına geçebilirsiniz" onayı gelmeden production yayını açılamaz.
- Pratik çözüm: aile/arkadaş çevresinden 12 kişinin Gmail adresini toplayıp test listesine ekle, uygulamayı yükleyip birkaç gün ara sıra açık tutmalarını iste.

---

## 8. İçerik Derecelendirmesi (Content Rating)

Play Console'da bir anket doldurulur (şiddet, kullanıcı üretimi içerik, konum paylaşımı vb. sorular). Kullanıcı içeriği barındıran uygulamalarda ("uygulama içinde herkese açık kullanıcı katkısı var mı" gibi sorularda) dürüst işaretle — genelde "Herkes" veya "PEGI 3" gibi en düşük derecelendirmeye çıkar ama soru tipi projeye göre değişir.

---

## 9. Hedef API Seviyesi (targetSdkVersion)

Google her yıl minimum hedef Android API seviyesini yükseltiyor (Play Console yükleme sırasında uyarır/reddeder). `android/app/build.gradle` içindeki `targetSdkVersion` güncel Android Studio ile proje açılıp senkronize edildiğinde genelde otomatik güncel gelir — yine de yükleme reddedilirse önce bu sayıyı kontrol et.

---

## 10. Yayın Öncesi Kontrol Listesi

- [ ] Geliştirici hesabı ödendi, cihaz + telefon doğrulaması tamamlandı
- [ ] Hesap silme: hem uygulama içinden hem web'den mümkün mü? Topluluk içeriği CASCADE ile yok olmuyor mu?
- [ ] Gizlilik politikası sayfası yayında ve gerçeği yansıtıyor mu?
- [ ] Data Safety formu dolduruldu mu?
- [ ] Store listing: kısa/uzun açıklama, simge, ekran görüntüleri (oran kontrolü yapıldı mı?), feature graphic hazır mı?
- [ ] AAB, Play App Signing aktifleştirilerek yüklendi mi? Keystore güvenli yedeklendi mi?
- [ ] Kapalı test için 12 test kullanıcısı davet edildi mi, 14 gün doldu mu?
- [ ] İçerik derecelendirme anketi dolduruldu mu?
- [ ] `versionCode`/`versionName` güncel mi?

---

## Terimler / kısayollar

- **AAB:** Android App Bundle — Play Store'un tercih ettiği paket formatı, cihaza özel optimize APK'ları Google üretir.
- **Play App Signing:** Google'ın imzalama anahtarını kendi tarafında da saklaması — keystore kaybı riskine karşı güvenlik ağı.
- **Data Safety:** Play Console'daki, uygulamanın topladığı veri türlerini beyan eden form.
- **Kapalı test (Closed testing):** Production öncesi zorunlu, sınırlı kullanıcıyla test aşaması.
