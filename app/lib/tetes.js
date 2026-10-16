






























const MODELE = new URL('../vendor/models/yolox_n_body_head_hand.onnx', import.meta.url).href;
const ORT = new URL('../vendor/onnxruntime/ort.wasm.min.mjs', import.meta.url).href;
const DOSSIER_ORT = new URL('../vendor/onnxruntime/', import.meta.url).href;

export const SEUIL_TETES = 0.3;
const IOU_DOUBLON = 0.45;
const CLASSES = ['corps', 'tete', 'main'];


export function preparerTetes(rgba, largeur, hauteur, t = null) {
  const n = largeur * hauteur;
  if (!t || t.length !== 3 * n) t = new Float32Array(3 * n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    t[i] = rgba[p + 2]; t[n + i] = rgba[p + 1]; t[2 * n + i] = rgba[p];
  }
  return t;
}

function iou(a, b) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const i = ix * iy, u = a.w * a.h + b.w * b.h - i;
  return u > 0 ? i / u : 0;
}


export function decoderTetes(sortie, largeurPad, hauteurPad, seuil = SEUIL_TETES) {
  const par = { corps: [], tete: [], main: [] };
  let k = 0;
  for (const pas of [8, 16, 32]) {
    const cols = largeurPad / pas, rows = hauteurPad / pas;
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++, k++) {
        const o = k * 8;
        const obj = sortie[o + 4];
        if (obj < seuil) continue;
        for (let c = 0; c < 3; c++) {
          const s = obj * sortie[o + 5 + c];
          if (s < seuil) continue;
          const cx = (sortie[o] + gx) * pas, cy = (sortie[o + 1] + gy) * pas;
          const w = Math.exp(sortie[o + 2]) * pas, h = Math.exp(sortie[o + 3]) * pas;
          par[CLASSES[c]].push({ x: cx - w / 2, y: cy - h / 2, w, h, s });
        }
      }
    }
  }
  for (const c of CLASSES) {
    par[c].sort((a, b) => b.s - a.s);
    const g = [];
    for (const b of par[c]) if (!g.some((q) => iou(q, b) > IOU_DOUBLON)) g.push(b);
    par[c] = g;
  }
  return par;
}




















export const PIXELS_TETES = 0.75e6;

export async function chargerTetes({ pixelsMax = PIXELS_TETES, onProgress } = {}) {
  if (onProgress) onProgress('chargement du détecteur de têtes');
  const ort = await import(ORT);
  ort.env.logLevel = 'error';
  ort.env.wasm.wasmPaths = DOSSIER_ORT;
  const fils = (typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated)
    ? Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1)) : 1;
  ort.env.wasm.numThreads = fils;
  const reponse = await fetch(MODELE);
  if (!reponse.ok) throw new Error('modèle des têtes introuvable (' + reponse.status + ')');
  const session = await ort.InferenceSession.create(new Uint8Array(await reponse.arrayBuffer()),
    { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });

  let toile = null, ctx = null, pw = 0, ph = 0, tampon = null;
  async function detecter(source, max = pixelsMax) {
    const W = source.width, H = source.height;
    const k = Math.min(1, Math.sqrt(max / (W * H)));
    const dw = Math.round(W * k), dh = Math.round(H * k);
    const nw = Math.ceil(dw / 32) * 32, nh = Math.ceil(dh / 32) * 32;
    if (!toile || nw !== pw || nh !== ph) {
      pw = nw; ph = nh;
      toile = new OffscreenCanvas(pw, ph);
      ctx = toile.getContext('2d', { alpha: false, willReadFrequently: true });
    }

    ctx.fillStyle = 'rgb(114,114,114)';
    ctx.fillRect(0, 0, pw, ph);
    ctx.drawImage(source, 0, 0, W, H, 0, 0, dw, dh);
    tampon = preparerTetes(ctx.getImageData(0, 0, pw, ph).data, pw, ph, tampon);
    const r = await session.run({ input: new ort.Tensor('float32', tampon, [1, 3, ph, pw]) });
    const par = decoderTetes(r[Object.keys(r)[0]].data, pw, ph);
    const remettre = (b) => ({ x: b.x / k, y: b.y / k, w: b.w / k, h: b.h / k, s: b.s });
    return { tete: par.tete.map(remettre), corps: par.corps.map(remettre) };
  }
  return { detecter, moteur: `YOLOX têtes (WebAssembly, ${fils} fil${fils > 1 ? 's' : ''})` };
}
