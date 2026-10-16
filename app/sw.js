







const VERSION = 'zt-20261016-2321';
















const LOURDS = 'zt-lourds-1';










const LOURDS_LISTE = [

  './vendor/onnxruntime/ort-wasm-simd-threaded.wasm',



  './vendor/models/yolox_n_body_head_hand.onnx',
  './vendor/libheif/libheif.wasm',
];
const CORE = [
  './', './index.html', './styles.css', './app.js',
  './lib/meta.js', './lib/decode.js', './lib/blur.js', './lib/faces.js',
  './lib/export.js', './lib/strip.js', './lib/videometa.js', './lib/videopipe.js',



  './lib/flou.js', './lib/suivi.js', './lib/mp4plat.js', './lib/voix.js', './lib/moteur2.js',
  './lib/yunet.js', './lib/tetes.js', './lib/apercu.js', './vendor/onnxruntime/ort.wasm.min.mjs', './vendor/onnxruntime/ort-wasm-simd-threaded.mjs',
  './vendor/models/yunet_2023mar.onnx',



  './vendor/mp4box/mp4box.all.mjs',
  './vendor/mp4box/rolldown-runtime-w6R9maHv.mjs',
  './vendor/mp4box/styp-9TIZZDLN.mjs',
  './manifest.webmanifest',
  './fonts/ibm-plex-mono-latin-400-normal.woff2',
  './fonts/ibm-plex-mono-latin-600-normal.woff2',
  './fonts/ibm-plex-mono-latin-700-normal.woff2',
  './fonts/ibm-plex-sans-condensed-latin-600-normal.woff2',
  './fonts/ibm-plex-sans-condensed-latin-700-normal.woff2',
  './vendor/libheif/libheif-bundle.mjs',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png', './favicon.svg',
];

const EST_DU_CODE = (url) => /\.(html|js|mjs|css|webmanifest|json|txt)$/.test(url.pathname) || url.pathname.endsWith('/');

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const code = await caches.open(VERSION);
    await Promise.allSettled(CORE.map((u) => code.add(u)));


    const lourds = await caches.open(LOURDS);
    await Promise.allSettled(LOURDS_LISTE.map(async (u) => {
      if (await lourds.match(u)) return;
      await lourds.add(u);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== LOURDS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function reseauDAbord(req) {
  try {
    const res = await fetch(req, { cache: 'no-store' });
    if (res && res.ok && res.type === 'basic') {
      const copie = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copie));
    }
    return res;
  } catch (e) {
    const hit = await caches.match(req);
    if (hit) return hit;
    if (req.mode === 'navigate') return caches.match('./index.html');
    throw e;
  }
}

const EST_LOURD = (url) => /\.(wasm|tflite|onnx)$/.test(url.pathname);

async function cacheDAbord(req, url) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok && res.type === 'basic') {
    const copie = res.clone();


    caches.open(EST_LOURD(url) ? LOURDS : VERSION).then((c) => c.put(req, copie));
  }
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith(req.mode === 'navigate' || EST_DU_CODE(url) ? reseauDAbord(req) : cacheDAbord(req, url));
});
