<div align="center">

<img src="bereket-logo.png" alt="Bereket Logo" width="160">

# Bereket

**Zekât · Varlık · Borç Takibi**

Altın, döviz ve nakit varlıklarınızı takip edin, zekâtınızı hesaplayın,
borç ve alacaklarınızı unutmayın — hepsi tek bir dosyada, tamamen cihazınızda.

![Sürüm](https://img.shields.io/badge/s%C3%BCr%C3%BCm-v1.11.1-C9A227)
![Platform](https://img.shields.io/badge/platform-Web%20%C2%B7%20PWA-1E5631)
![Lisans](https://img.shields.io/badge/veri-%25100%20cihazda-1E5631)

</div>

---

## ✨ Özellikler

### 🪙 Varlık Takibi
- Gram (24 ayar/has), **22 ayar gram altın**, çeyrek, yarım, tam, Cumhuriyet ve Ata altını
- **Ayarlı ziynet altınları** (22/18/14 ayar) — has karşılığı otomatik hesaplanır
- Her altın varlığın **has gram karşılığı** listede gösterilir; toplam has altın 80 g nisabla karşılaştırılır
- Gümüş, Dolar, Euro, TL nakit (₺ simgesiyle) ve serbest "diğer" varlıklar
- Tüm varlıklar güncel kurla TL'ye çevrilir, dağılım grafiğiyle gösterilir
- Varlıklar sekmesinde, hangi türden toplam ne kadar varlığınız olduğunun rozet (chip) görünümünde dökümü

### 🌱 Zekât Hesabı
- Nisab: **80 gram has (24 ayar) altın** karşılığı, güncel kurla otomatik
- Matrah = varlıklar + alacaklar − borçlar; nisabı aşınca **%2,5 (1/40)** hesaplanır
- **Kamerî yıl (havl) takibi**: nisaba ulaştığınız tarihi kaydedin, 354 gün dolunca uygulama uyarır
- Ödediğiniz zekâtları tarihçesiyle kaydedin; **ödenen / kalan** tutar otomatik izlenir, dönem tamamlanınca havl yenilenebilir

### 🤝 Borç / Alacak
- TL, Dolar, Euro, **gram/çeyrek/yarım/tam/Cumhuriyet/Ata altını** veya gümüş cinsinden borç ve alacak kaydı
- **Kısmi (aralıklı) ödeme takibi**: her kayda birden çok ödeme eklenebilir, kalan bakiye otomatik hesaplanır
- Bir kayda dokununca açılan **kişi kartında** toplam/ödenen/kalan özeti ve tarih sıralı ödeme geçmişi düzenli liste halinde görünür
- Kayıtları **düzenleme** — kişi, tutar, birim ve vade sonradan değiştirilebilir
- Toplam kartlarında hangi para biriminden/üründen ne kadar borç veya alacak olduğunun dökümü
- Vade takibi — geciken kayıtlar kırmızı uyarı alır
- "Ödendi" işaretleme ve filtreleme

### 🔒 Emanetler
- Zekâta dahil olmayan, sadece takip amaçlı **bende duran** veya **bendeki (onda duran)** emanet para/altın kayıtları
- Borç/alacak toplamlarına, zekât matrahına ve net servete **hiç dahil edilmez**
- Kısmi iade takibi: her kayda birden çok iade eklenebilir, kalan bakiye otomatik hesaplanır

### ☁️ Bulut Yedekleme (isteğe bağlı)
- Google ile giriş yaparak verilerinizi Supabase üzerinde yedekleyebilirsiniz
- Giriş yapmadan uygulama tamamen çevrimdışı ve cihaz-içi çalışmaya devam eder
- "Şimdi Buluta Yedekle" / "Buluttan Geri Yükle" ile manuel senkron; her kayıttan sonra otomatik arka plan senkronu
- **Otomatik çekme**: uygulama açıldığında, sekme/uygulama tekrar öne geldiğinde ve her 20 saniyede bir başka cihazdan gelen daha yeni veri varsa sessizce çekilir — elle "geri yükle" demeye gerek kalmadan diğer cihazdaki değişiklikler kısa sürede görünür
- Cihaz değiştirdiğinizde Google ile giriş yapıp buluttaki verilerinizi geri yükleyebilirsiniz

### 📈 Diğer
- **Servet geçmişi grafiği** — net servetiniz günlük kaydedilir
- **Gizlilik modu** 🙈 — tek dokunuşla tüm tutarları gizleyin
- **Uygulama her açıldığında kurlar otomatik internetten güncellenir**, sonucu bir bildirimle gösterilir; elle güncelleme de her zaman mümkündür
- JSON yedek alma / geri yükleme
- Silme gibi geri alınamaz işlemler **uygulama içi onay penceresiyle** yapılır (tarayıcı popup'u değil)

## 📱 Kurulum

Uygulama tek bir HTML dosyasıdır, kurulum gerektirmez:

1. `bereket.html` dosyasını telefonunuzun tarayıcısında açın
2. Tarayıcı menüsünden **"Ana ekrana ekle"** deyin
3. Artık uygulama gibi tam ekran açılır ✅

> 💡 GitHub Pages üzerinden de yayınlayabilirsiniz; internet yalnızca kur çekmek için gerekir, uygulama çevrimdışı da çalışır.

## 🔒 Gizlilik

Tüm verileriniz varsayılan olarak **yalnızca kendi cihazınızda** (`localStorage`) saklanır.
Hiçbir sunucuya hiçbir veri gönderilmez. Kur güncelleme isteğe bağlıdır.
Google ile giriş yapmayı seçerseniz veriler ayrıca Supabase'de, yalnızca sizin erişebileceğiniz
şekilde (Row Level Security ile korunan, size özel bir kayıt) saklanır. Giriş yapmazsanız bu
adım hiç devreye girmez.

## 🛠️ Teknik

| | |
|---|---|
| Yapı | Tek dosya HTML + CSS + JS, framework yok |
| Depolama | `localStorage` (JSON yedekleme ile taşınabilir) |
| Kur kaynağı | [finans.truncgil.com](https://finans.truncgil.com) (isteğe bağlı) |
| Bulut yedekleme | Supabase (isteğe bağlı, Google girişiyle) |
| Tipografi | Marcellus + Manrope |

## 📋 Sürüm Geçmişi

| Sürüm | Tarih | Yenilikler |
|---|---|---|
| **v1.11.1** | 21.07.2026 | Bulut Yedekleme bölümü Ayarlar'da program bilgisinin altına taşındı, tarih alanı büyüklük sorunu tekrar düzeltildi |
| **v1.11.0** | 21.07.2026 | Popup pencerelere kapatma (✕) düğmesi, tarih giriş alanı taşma düzeltmesi, varlıklara alış tarihi ve emanetlere tarih alanı eklendi |
| **v1.10.1** | 21.07.2026 | Oturum yenilemede geçici ağ hatalarında artık gereksiz çıkış yapılmıyor |
| **v1.10.0** | 20.07.2026 | Bulut senkronu otomatik hale geldi: açılış, sekme odağı ve 20 sn'lik periyotlarla sessiz kontrol/çekme |
| **v1.9.1** | 20.07.2026 | Varlık türü dökümü rozet (chip) tasarımıyla güncellendi |
| **v1.9.0** | 20.07.2026 | Varlıklar sekmesine tür bazlı döküm eklendi |
| **v1.8.0** | 20.07.2026 | Borç/Alacak toplam kartlarına para birimi/ürün bazlı döküm eklendi |
| **v1.7.1** | 20.07.2026 | Borç/alacak liste satırı sadeleşti: sadece kalan tutar kalın gösteriliyor |
| **v1.7.0** | 20.07.2026 | Borç/Alacak sekmesinde "Emanetler" bölümü: zekâta dahil olmayan emanet para/altın kayıtları, kısmi iade takibiyle |
| **v1.6.0** | 20.07.2026 | İsteğe bağlı bulut yedekleme: Google ile giriş, Supabase üzerinde senkron |
| **v1.5.0** | 20.07.2026 | Popup pencereler ortalanmış modal olarak açılıyor, silme onayları uygulama içi popup ile yapılıyor, Ayarlar'dan sürüm geçmişi kaldırıldı, açılışta kurlar otomatik güncelleniyor |
| **v1.4.0** | 20.07.2026 | Borç/alacaklarda kısmi ödeme takibi ve düzenleme, nisab 80 grama güncellendi, 22 ayar gram altın seçeneği, TL simgesi ikonu, ayarlar sayfası düzeni, mouse ile kaydırma düzeltmesi |
| **v1.3.0** | 19.07.2026 | Altın varlıklarda has karşılığı gösterimi, toplam has altın ve 85 g nisabla karşılaştırma |
| **v1.2.0** | 19.07.2026 | Borç/alacakta tüm altın çeşitleri ve gümüş, zekâtta ödenen/kalan takibi, Chrome sayfa uzaması düzeltmesi |
| **v1.1.0** | 19.07.2026 | Kamerî yıl (havl) takibi, ayarlı ziynet altınları (22/18/14), Ata altın, gizlilik modu, servet geçmişi grafiği, sürüm geçmişi |
| **v1.0.0** | 19.07.2026 | İlk sürüm: varlık takibi, zekât hesabı, borç/alacak takibi, kur çekme, JSON yedekleme |

---

<div align="center">

⚠️ *Zekât hesaplamaları bilgilendirme amaçlıdır. Kesin hüküm için Diyanet'e veya bir din görevlisine danışınız.*

🤲 **Allah kabul etsin.**

</div>
