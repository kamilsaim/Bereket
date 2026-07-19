<div align="center">

<img src="bereket-logo.png" alt="Bereket Logo" width="160">

# Bereket

**Zekât · Varlık · Borç Takibi**

Altın, döviz ve nakit varlıklarınızı takip edin, zekâtınızı hesaplayın,
borç ve alacaklarınızı unutmayın — hepsi tek bir dosyada, tamamen cihazınızda.

![Sürüm](https://img.shields.io/badge/s%C3%BCr%C3%BCm-v1.1.0-C9A227)
![Platform](https://img.shields.io/badge/platform-Web%20%C2%B7%20PWA-1E5631)
![Lisans](https://img.shields.io/badge/veri-%25100%20cihazda-1E5631)

</div>

---

## ✨ Özellikler

### 🪙 Varlık Takibi
- Gram, çeyrek, yarım, tam, Cumhuriyet ve Ata altını
- **Ayarlı ziynet altınları** (22/18/14 ayar) — has karşılığı otomatik hesaplanır
- Gümüş, Dolar, Euro, TL nakit ve serbest "diğer" varlıklar
- Tüm varlıklar güncel kurla TL'ye çevrilir, dağılım grafiğiyle gösterilir

### 🌱 Zekât Hesabı
- Nisab: **85 gram altın** karşılığı, güncel kurla otomatik
- Matrah = varlıklar + alacaklar − borçlar; nisabı aşınca **%2,5 (1/40)** hesaplanır
- **Kamerî yıl (havl) takibi**: nisaba ulaştığınız tarihi kaydedin, 354 gün dolunca uygulama uyarır
- Ödediğiniz zekâtları tarihçesiyle kaydedin; ödeme sonrası havl otomatik yenilenebilir

### 🤝 Borç / Alacak
- TL, Dolar, Euro veya **gram altın** cinsinden borç ve alacak kaydı
- Vade takibi — geciken kayıtlar kırmızı uyarı alır
- "Ödendi" işaretleme ve filtreleme

### 📈 Diğer
- **Servet geçmişi grafiği** — net servetiniz günlük kaydedilir
- **Gizlilik modu** 🙈 — tek dokunuşla tüm tutarları gizleyin
- Kurları tek tuşla internetten çekme veya elle girme
- JSON yedek alma / geri yükleme
- Sürüm geçmişi (Ayarlar sekmesinde)

## 📱 Kurulum

Uygulama tek bir HTML dosyasıdır, kurulum gerektirmez:

1. `bereket.html` dosyasını telefonunuzun tarayıcısında açın
2. Tarayıcı menüsünden **"Ana ekrana ekle"** deyin
3. Artık uygulama gibi tam ekran açılır ✅

> 💡 GitHub Pages üzerinden de yayınlayabilirsiniz; internet yalnızca kur çekmek için gerekir, uygulama çevrimdışı da çalışır.

## 🔒 Gizlilik

Tüm verileriniz **yalnızca kendi cihazınızda** (`localStorage`) saklanır.
Hiçbir sunucuya hiçbir veri gönderilmez. Kur güncelleme isteğe bağlıdır.

## 🛠️ Teknik

| | |
|---|---|
| Yapı | Tek dosya HTML + CSS + JS, framework yok |
| Depolama | `localStorage` (JSON yedekleme ile taşınabilir) |
| Kur kaynağı | [finans.truncgil.com](https://finans.truncgil.com) (isteğe bağlı) |
| Tipografi | Marcellus + Manrope |

## 📋 Sürüm Geçmişi

| Sürüm | Tarih | Yenilikler |
|---|---|---|
| **v1.1.0** | 19.07.2026 | Kamerî yıl (havl) takibi, ayarlı ziynet altınları (22/18/14), Ata altın, gizlilik modu, servet geçmişi grafiği, sürüm geçmişi |
| **v1.0.0** | 19.07.2026 | İlk sürüm: varlık takibi, zekât hesabı, borç/alacak takibi, kur çekme, JSON yedekleme |

---

<div align="center">

⚠️ *Zekât hesaplamaları bilgilendirme amaçlıdır. Kesin hüküm için Diyanet'e veya bir din görevlisine danışınız.*

🤲 **Allah kabul etsin.**

</div>
