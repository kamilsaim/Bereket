/* Bereket — Service Worker (v1.19.0)
   Amaç: uygulamanın internetsizken de açılması.

   Strateji:
   - Uygulama kabuğu (index.html, gizlilik politikası, ikon, manifest) için AĞ ÖNCELİKLİ:
     internet varsa her zaman GitHub Pages'teki en güncel sürüm gösterilir ve önbelleğe
     yazılır; internet yoksa önbellekteki son sürüm sunulur. Böylece "eski sürüme takılma"
     sorunu yaşanmaz, çevrimdışı açılış da garanti olur.
   - Google Fonts: önce önbellek, arka planda tazele (yazı tipleri değişmiyor).
   - Supabase (bulut yedek) ve kur API'si: SW hiç karışmaz, doğrudan ağa gider.
     Bunların önbelleğe alınması yanlış/eski veri riski doğurur.
*/
const CACHE = 'bereket-v1.19.0';
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
