





















































const MODELE = new URL('../vendor/models/yunet_2023mar.onnx', import.meta.url).href;
const ORT = new URL('../vendor/onnxruntime/ort.wasm.min.mjs', import.meta.url).href;
const DOSSIER_ORT = new URL('../vendor/onnxruntime/', import.meta.url).href;



export const SEUIL_YUNET = 0.6;
const PAS = [8, 16, 32];
const IOU_DOUBLON = 0.3;






export function preparer(rgba, largeur, hauteur, t = null) {
  const n = largeur * hauteur;
  if (!t || t.length !== 3 * n) t = new Float32Array(3 * n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    t[i] = rgba[p + 2];
    t[n + i] = rgba[p + 1];
    t[2 * n + i] = rgba[p];
  }
  return t;
}

function iou(a, b) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const i = ix * iy, u = a.w * a.h + b.w * b.h - i;
  return u > 0 ? i / u : 0;
}





export function decoder(sorties, largeurPad, hauteurPad, seuil = SEUIL_YUNET) {
  const brutes = [];
  for (const s of PAS) {
    const cols = Math.floor(largeurPad / s), rows = Math.floor(hauteurPad / s);
    const cls = sorties['cls_' + s], obj = sorties['obj_' + s], bb = sorties['bbox_' + s];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k = r * cols + c;
        const sc = Math.sqrt(Math.min(1, Math.max(0, cls[k])) * Math.min(1, Math.max(0, obj[k])));
        if (sc < seuil) continue;
        const cx = (c + bb[k * 4]) * s, cy = (r + bb[k * 4 + 1]) * s;
        const w = Math.exp(bb[k * 4 + 2]) * s, h = Math.exp(bb[k * 4 + 3]) * s;
        brutes.push({ x: cx - w / 2, y: cy - h / 2, w, h, s: sc });
      }
    }
  }

  brutes.sort((a, b) => b.s - a.s);
  const gardees = [];
  for (const b of brutes) {
    if (gardees.length >= 5000) break;
    if (!gardees.some((g) => iou(g, b) > IOU_DOUBLON)) gardees.push(b);
  }
  return gardees;
}






















export const PIXELS_VIDEO = 3.2e6;


export async function chargerYunet({ pixelsMax = PIXELS_VIDEO, onProgress } = {}) {
  if (onProgress) onProgress('chargement du détecteur de visages');
  const ort = await import(ORT);
  ort.env.logLevel = 'error';

  ort.env.wasm.wasmPaths = DOSSIER_ORT;


  const fils = (typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated)
    ? Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1)) : 1;
  ort.env.wasm.numThreads = fils;
  const reponse = await fetch(MODELE);
  if (!reponse.ok) throw new Error('modèle YuNet introuvable (' + reponse.status + ')');
  const modele = new Uint8Array(await reponse.arrayBuffer());
  const session = await ort.InferenceSession.create(modele, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });

  let toile = null, ctx = null, pw = 0, ph = 0, dw = 0, dh = 0, echelle = 1, tampon = null;
  async function detecter(source) {
    const W = source.width, H = source.height;
    echelle = Math.min(1, Math.sqrt(pixelsMax / (W * H)));
    dw = Math.round(W * echelle); dh = Math.round(H * echelle);
    const nw = Math.ceil(dw / 32) * 32, nh = Math.ceil(dh / 32) * 32;
    if (!toile || nw !== pw || nh !== ph) {
      pw = nw; ph = nh;
      toile = new OffscreenCanvas(pw, ph);
      ctx = toile.getContext('2d', { alpha: false, willReadFrequently: true });
    }

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, pw, ph);
    ctx.drawImage(source, 0, 0, W, H, 0, 0, dw, dh);
    const px = ctx.getImageData(0, 0, pw, ph).data;
    tampon = preparer(px, pw, ph, tampon);
    const entree = new ort.Tensor('float32', tampon, [1, 3, ph, pw]);
    const r = await session.run({ input: entree });
    const sorties = {};
    for (const nom of Object.keys(r)) sorties[nom] = r[nom].data;
    return decoder(sorties, pw, ph).map((b) => ({
      x: b.x / echelle, y: b.y / echelle, w: b.w / echelle, h: b.h / echelle, s: b.s,
    }));
  }
  return { detecter, moteur: `YuNet (WebAssembly, ${fils} fil${fils > 1 ? 's' : ''})` };
}
