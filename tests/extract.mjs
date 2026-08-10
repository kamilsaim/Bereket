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
  const names = ['nowISO', 'setSkew', 'stamp', 'alive', 'isNewer', 'mergeList', 'mergeData', 'gcTombstones', 'stampAll', 'setMe', 'whoAmI', 'logEntry', 'LOG_MAX'];
  const fn = new Function(`${code}\nreturn {${names.join(',')}};`);
  return fn();
}
