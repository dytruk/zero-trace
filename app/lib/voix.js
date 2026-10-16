













const GRAIN = 2048;
const SAUT = GRAIN >> 1;


const fenetre = (() => {
  const w = new Float32Array(GRAIN);
  for (let i = 0; i < GRAIN; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (GRAIN - 1));
  return w;
})();





export function decalerHauteur(entree, facteur) {
  const n = entree.length;
  const sortie = new Float32Array(n);
  const poids = new Float32Array(n);
  for (let depart = 0; depart + SAUT < n; depart += SAUT) {
    for (let i = 0; i < GRAIN; i++) {

      const lu = depart + i * facteur;
      const k = lu | 0;
      if (k + 1 >= n) break;
      const f = lu - k;
      const v = entree[k] * (1 - f) + entree[k + 1] * f;
      const j = depart + i;
      if (j >= n) break;
      sortie[j] += v * fenetre[i];
      poids[j] += fenetre[i];
    }
  }

  for (let i = 0; i < n; i++) if (poids[i] > 0.001) sortie[i] /= poids[i];
  return sortie;
}







export async function deformerPiste(at, samples, description, facteur, onProgress) {
  if (typeof AudioDecoder === 'undefined' || typeof AudioEncoder === 'undefined') return null;
  const canaux = at.audio.channel_count || 1;
  const sr = at.audio.sample_rate || 48000;


  const morceaux = [];
  let total = 0;
  let echec = null;
  const dec = new AudioDecoder({
    output: (a) => {
      const plan = [];
      for (let c = 0; c < a.numberOfChannels; c++) {
        const buf = new Float32Array(a.numberOfFrames);
        a.copyTo(buf, { planeIndex: c, format: 'f32-planar' });
        plan.push(buf);
      }
      morceaux.push(plan);
      total += a.numberOfFrames;
      a.close();
    },
    error: (e) => { echec = String(e.message || e); },
  });
  try {
    dec.configure({ codec: at.codec, sampleRate: sr, numberOfChannels: canaux, description });
    for (const s of samples) {
      dec.decode(new EncodedAudioChunk({
        type: 'key',
        timestamp: Math.round((s.cts * 1000000) / s.timescale),
        duration: Math.round((s.duration * 1000000) / s.timescale),
        data: s.data,
      }));
    }
    await dec.flush();
  } catch (e) { return null; }
  if (echec || !total) return null;
  onProgress && onProgress('voix décodée');


  const pistes = [];
  for (let c = 0; c < canaux; c++) {
    const plein = new Float32Array(total);
    let o = 0;
    for (const m of morceaux) { const src = m[Math.min(c, m.length - 1)]; plein.set(src, o); o += src.length; }
    pistes.push(decalerHauteur(plein, facteur));
  }
  onProgress && onProgress('voix décalée');


  const paquets = [];
  let config = null;
  let echecEnc = null;
  const enc = new AudioEncoder({
    output: (chunk, meta) => { if (meta && meta.decoderConfig) config = meta.decoderConfig; paquets.push(chunk); },
    error: (e) => { echecEnc = String(e.message || e); },
  });
  try {
    enc.configure({ codec: 'mp4a.40.2', sampleRate: sr, numberOfChannels: canaux, bitrate: 128000 });
    const BLOC = 1024;
    for (let o = 0; o < total; o += BLOC) {
      const n = Math.min(BLOC, total - o);
      const plat = new Float32Array(n * canaux);
      for (let c = 0; c < canaux; c++) plat.set(pistes[c].subarray(o, o + n), c * n);
      enc.encode(new AudioData({
        format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: canaux,
        timestamp: Math.round((o / sr) * 1000000), data: plat,
      }));
    }
    await enc.flush();
  } catch (e) { return null; }
  if (echecEnc || !paquets.length) return null;
  onProgress && onProgress('voix réencodée');

  return { paquets, config, sr, canaux, echantillons: total, facteur };
}
