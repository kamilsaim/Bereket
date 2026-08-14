/* Bereket — Service Worker (v1.22.0)
   Amaç: uygulamanın internetsizken de açılması + kasa hareketi bildirimleri.

   Strateji:
   - Uygulama kabuğu (index.html, gizlilik politikası, ikon, manifest) için AĞ ÖNCELİKLİ:
     internet varsa her zaman GitHub Pages'teki en güncel sürüm gösterilir ve önbelleğe
     yazılır; internet yoksa önbellekteki son sürüm sunulur. Böylece "eski sürüme takılma"
     sorunu yaşanmaz, çevrimdışı açılış da garanti olur.
   - Google Fonts: önce önbellek, arka planda tazele (yazı tipleri değişmiyor).
   - Supabase (bulut yedek) ve kur API'si: SW hiç karışmaz, doğrudan ağa gider.
     Bunların önbelleğe alınması yanlış/eski veri riski doğurur.
*/
const CACHE = 'bereket-v1.23.0';
const SHELL = ['./', './index.html', './gizlilik-politikasi.html', './manifest.json', './512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()).catch(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Bulut yedek ve kur servisleri: asla önbelleğe alma, dokunma.
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('truncgil.com')) return;

  // Google Fonts: önce önbellek, arka planda tazele
  if (url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('gstatic.com')) {
    e.respondWith(
      caches.match(req).then(hit => {
        const net = fetch(req).then(r => {
          if (r && r.ok) caches.open(CACHE).then(c => c.put(req, r.clone()));
          return r;
        }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  if (url.origin !== location.origin) return;

  // Uygulama dosyaları: ağ öncelikli, çevrimdışında önbellek
  e.respondWith(
    fetch(req)
      .then(r => {
        if (r && r.ok) {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return r;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
  );
});

/* ═══════════ KASA HAREKETİ BİLDİRİMİ (v1.22.0) ═══════════
   Web Push (VAPID) yolu: iOS ana ekran PWA'sı ve Android/masaüstü tarayıcılar.
   APK'de bu çalışmaz (Android WebView'de Push API yok), orada FCM eklentisi devrede.
   Gövde çözülemezse bile bildirim GÖSTERİLMELİ: userVisibleOnly:true ile abone
   olduğumuz için sessiz geçmek tarayıcıda "bu site sizi izliyor" uyarısına yol açar. */
self.addEventListener('push', e => {
  let d = { title: 'Bereket', body: 'Kasanızda bir değişiklik var' };
  try { if (e.data) d = Object.assign(d, e.data.json()); } catch (err) {}
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body,
    icon: './512.png',
    badge: './512.png',
    tag: 'bereket-kasa',
    renotify: true,
    data: { url: d.url || './index.html' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || './index.html';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Uygulama zaten açıksa yeni sekme açma, mevcut olanı öne getir
      for (const c of list) {
        if (c.url.includes(self.registration.scope) && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
