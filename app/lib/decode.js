


const MAX_EDGE_DEFAULT = 2560;

let heifModule = null;

async function loadHeif() {
  if (heifModule) return heifModule;
  const mod = await import('../vendor/libheif/libheif-bundle.mjs');
  heifModule = await mod.default();
  return heifModule;
}

export function isHeic(name, mime, format) {
  if (format === 'HEIC' || format === 'AVIF') return true;
  const n = (name || '').toLowerCase();
  return /\.(heic|heif)$/.test(n) || /image\/heic|image\/heif/.test(mime || '');
}

async function decodeWithBrowser(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'sync';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, via: 'navigateur' };
  } finally {

    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}

async function decodeWithLibheif(buf) {
  const libheif = await loadHeif();
  const decoder = new libheif.HeifDecoder();
  const images = decoder.decode(new Uint8Array(buf));
  if (!images || !images.length) throw new Error('HEIC illisible');
  const image = images[0];
  const width = image.get_width();
  const height = image.get_height();
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  const imageData = ctx.createImageData(width, height);
  await new Promise((resolve, reject) => {
    image.display(imageData, (ok) => (ok ? resolve() : reject(new Error('rendu HEIC échoué'))));
  });
  ctx.putImageData(imageData, 0, 0);
  images.forEach((im) => im.free && im.free());
  return { source: canvas, width, height, via: 'libheif (WASM local)' };
}



function orientedSize(w, h, o) {
  return o >= 5 && o <= 8 ? { w: h, h: w } : { w, h };
}

function applyOrientation(ctx, o, w, h) {
  switch (o) {
    case 2: ctx.transform(-1, 0, 0, 1, w, 0); break;
    case 3: ctx.transform(-1, 0, 0, -1, w, h); break;
    case 4: ctx.transform(1, 0, 0, -1, 0, h); break;
    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
    case 6: ctx.transform(0, 1, -1, 0, h, 0); break;
    case 7: ctx.transform(0, -1, -1, 0, h, w); break;
    case 8: ctx.transform(0, -1, 1, 0, 0, w); break;
    default: break;
  }
}





export async function toWorkCanvas(file, buf, meta, opts = {}) {
  const maxEdge = opts.maxEdge || MAX_EDGE_DEFAULT;
  let decoded;
  let needsManualOrientation = false;
  if (isHeic(file.name, file.type, meta.format)) {
    try {
      decoded = await decodeWithLibheif(buf);
    } catch (err) {
      decoded = await decodeWithBrowser(file);
      needsManualOrientation = meta.orientation > 1;
    }
  } else {
    decoded = await decodeWithBrowser(file);


    const expected = orientedSize(decoded.width, decoded.height, meta.orientation);
    needsManualOrientation = false;
    void expected;
  }

  const srcW = decoded.width;
  const srcH = decoded.height;
  const o = needsManualOrientation ? meta.orientation : 1;
  const base = orientedSize(srcW, srcH, o);
  const ratio = Math.min(1, maxEdge / Math.max(base.w, base.h));
  const outW = Math.max(1, Math.round(base.w * ratio));
  const outH = Math.max(1, Math.round(base.h * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = outW; canvas.height = outH;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.save();
  ctx.scale(ratio, ratio);
  applyOrientation(ctx, o, base.w, base.h);
  ctx.drawImage(decoded.source, 0, 0);
  ctx.restore();

  return {
    canvas, width: outW, height: outH, via: decoded.via,
    scaled: ratio < 1, sourceWidth: srcW, sourceHeight: srcH,
  };
}

export { MAX_EDGE_DEFAULT };
