







const R = [];
const dire = (quoi, etat, detail) => { R.push({ quoi, etat, detail: detail || '' }); peindre(); };
function peindre() {
  document.getElementById('log').textContent = R.map((r) =>
    `${r.etat === true ? 'OUI ' : r.etat === false ? 'NON ' : '~   '} ${r.quoi.padEnd(34, '.')} ${r.detail}`).join('\n');
}

const nav = navigator.userAgent;
dire('navigateur', null, nav);


const aCodecs = typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined'
  && typeof VideoFrame !== 'undefined' && typeof EncodedVideoChunk !== 'undefined';
dire('WebCodecs présent', aCodecs);

let codecsOk = [];
if (aCodecs) {
  for (const c of ['avc1.640028', 'avc1.42E01E', 'hvc1.1.6.L93.B0']) {
    try {
      const s = await VideoEncoder.isConfigSupported({ codec: c, width: 640, height: 360, bitrate: 1e6, framerate: 30 });
      if (s && s.supported) codecsOk.push(c);
    } catch (e) {  }
  }
  dire('encodeurs acceptés', codecsOk.length > 0, codecsOk.join(' · ') || 'aucun');
}


if (aCodecs && codecsOk.length) {
  try {
    const c = new OffscreenCanvas(320, 180);
    const g = c.getContext('2d');
    const paquets = [];
    let desc = null;
    const enc = new VideoEncoder({
      output: (chunk, meta) => { if (meta && meta.decoderConfig) desc = meta.decoderConfig; paquets.push(chunk); },
      error: () => {},
    });
    enc.configure({ codec: codecsOk[0], width: 320, height: 180, bitrate: 5e5, framerate: 30 });
    for (let i = 0; i < 10; i++) {
      g.fillStyle = i % 2 ? '#fff' : '#333'; g.fillRect(0, 0, 320, 180);
      const f = new VideoFrame(c, { timestamp: i * 33333, duration: 33333 });
      enc.encode(f, { keyFrame: i === 0 }); f.close();
    }
    await enc.flush();
    dire('encodage réel (10 images)', paquets.length >= 10, `${paquets.length} paquets`);

    let decodees = 0;
    const dec = new VideoDecoder({ output: (f) => { decodees++; f.close(); }, error: () => {} });
    dec.configure(desc || { codec: codecsOk[0], codedWidth: 320, codedHeight: 180 });
    for (const p of paquets) dec.decode(p);
    await dec.flush();
    dire('redécodage réel', decodees >= 10, `${decodees} images`);
  } catch (e) { dire('aller-retour encodage', false, String(e.message || e).slice(0, 80)); }
}


try {
  const m = await import('./lib/flou.js');
  dire('flou gaussien natif', m.filtreDisponible(), m.methodeFlou());
  const c = document.createElement('canvas'); c.width = 80; c.height = 80;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000'; g.fillRect(0, 0, 80, 80);
  g.fillStyle = '#fff'; g.fillRect(30, 30, 20, 20);
  const avant = g.getImageData(40, 40, 1, 1).data[0];
  m.flouterRegion(g, c, { x: 25, y: 25, w: 30, h: 30 }, 0);
  const apres = g.getImageData(40, 40, 1, 1).data[0];
  dire('le flou change les pixels', avant !== apres, `${avant} → ${apres}`);
} catch (e) { dire('module de flou', false, String(e.message || e).slice(0, 80)); }




for (const [nom, charger] of [
  ['détecteur de visages', async () => (await import('./lib/yunet.js')).chargerYunet()],
  ['détecteur de têtes', async () => (await import('./lib/tetes.js')).chargerTetes()],
]) {
  try {
    const t0 = performance.now();
    const d = await charger();
    await d.detecter(new OffscreenCanvas(320, 240));
    dire(nom, true, `${d.moteur}, prêt en ${Math.round(performance.now() - t0)} ms`);
  } catch (e) { dire(nom, false, String(e.message || e).slice(0, 90)); }
}



dire('décodeur de son', typeof AudioDecoder !== 'undefined');
dire('encodeur de son', typeof AudioEncoder !== 'undefined');
if (typeof AudioEncoder !== 'undefined') {
  try {
    const s = await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: 44100, numberOfChannels: 2, bitrate: 128000 });
    dire('réencodage AAC accepté', !!(s && s.supported));
  } catch (e) { dire('réencodage AAC accepté', false, String(e.message || e).slice(0, 60)); }
  try {
    const sr = 44100, n = 4096;
    const pcm = new Float32Array(n);
    for (let i = 0; i < n; i++) pcm[i] = Math.sin((2 * Math.PI * 220 * i) / sr) * 0.3;
    let paquets = 0;
    const enc = new AudioEncoder({ output: () => { paquets++; }, error: () => {} });
    enc.configure({ codec: 'mp4a.40.2', sampleRate: sr, numberOfChannels: 1, bitrate: 128000 });
    enc.encode(new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: 1, timestamp: 0, data: pcm }));
    await enc.flush();
    dire('déformation de la voix', paquets > 0, paquets ? `${paquets} paquets produits` : 'aucun paquet');
  } catch (e) { dire('déformation de la voix', false, String(e.message || e).slice(0, 80)); }
} else {
  dire('déformation de la voix', false, 'le son ne peut être que retiré, pas déformé');
}


try {
  await import('./vendor/mp4box/mp4box.all.mjs');
  dire('lecture du conteneur MP4', true);
} catch (e) {


  dire('lecture du conteneur MP4', false, String(e.message || e).slice(0, 60));
  for (const f of ['mp4box.all.mjs', 'rolldown-runtime-w6R9maHv.mjs', 'styp-9TIZZDLN.mjs']) {
    try {
      const r = await fetch('./vendor/mp4box/' + f, { cache: 'no-store' });
      dire('   ' + f, r.ok, `${r.status} · ${(r.headers.get('content-type') || '?').split(';')[0]}`);
    } catch (e2) { dire('   ' + f, false, String(e2.message || e2).slice(0, 50)); }
  }
}


try {
  await import('./vendor/libheif/libheif-bundle.mjs');
  dire('décodage HEIC (photos iPhone)', true);
} catch (e) { dire('décodage HEIC (photos iPhone)', false, String(e.message || e).slice(0, 80)); }


dire('OffscreenCanvas', typeof OffscreenCanvas !== 'undefined');
dire('WebAssembly', typeof WebAssembly !== 'undefined');
dire('partage natif de fichier', !!(navigator.canShare && navigator.canShare({ files: [new File([new Uint8Array(1)], 'x.mp4', { type: 'video/mp4' })] })));
dire('cadence image par image', 'requestVideoFrameCallback' in HTMLVideoElement.prototype, 'sinon 30 i/s supposées');
dire('installable (service worker)', 'serviceWorker' in navigator);

window.__capacites = R;
document.title = 'pret';
