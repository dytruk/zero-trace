





let filtreOk = null;

function toileHorsEcran(w, h) {
  return typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement('canvas'), { width: w, height: h });
}










export function filtreDisponible() {


  if (typeof globalThis !== 'undefined' && globalThis.__ztSansFiltre) return false;
  if (filtreOk !== null) return filtreOk;
  try {
    const src = toileHorsEcran(32, 8);
    const sctx = src.getContext('2d', { willReadFrequently: true });
    sctx.fillStyle = '#000'; sctx.fillRect(0, 0, 16, 8);
    sctx.fillStyle = '#fff'; sctx.fillRect(16, 0, 16, 8);
    const cible = toileHorsEcran(32, 8);
    const cctx = cible.getContext('2d', { willReadFrequently: true });
    cctx.filter = 'blur(4px)';
    cctx.drawImage(src, 0, 0);
    cctx.filter = 'none';

    const p = cctx.getImageData(13, 4, 1, 1).data;
    filtreOk = p[0] > 20;
  } catch (e) { filtreOk = false; }
  return filtreOk;
}


export const methodeFlou = () => (filtreDisponible() ? 'gaussien natif' : 'moyenne glissante (calcul)');









export function flouMoyenne(d, w, h, r, passes) {
  const tmp = new Uint8ClampedArray(d.length);
  for (let p = 0; p < passes; p++) {
    ligne(d, tmp, w, h, r);
    colonne(tmp, d, w, h, r);
  }
}








function tableBornes(n, r) {
  const t = new Int32Array(n + 2 * r + 2);
  for (let k = 0; k < t.length; k++) { const v = k - r - 1; t[k] = v < 0 ? 0 : v >= n ? n - 1 : v; }
  return t;
}

function ligne(src, dst, w, h, r) {
  const d = r * 2 + 1;
  const tb = tableBornes(w, r);
  for (let y = 0; y < h; y++) {
    const base = y * w * 4;
    let s0 = 0, s1 = 0, s2 = 0;
    for (let i = -r; i <= r; i++) { const q = base + tb[i + r + 1] * 4; s0 += src[q]; s1 += src[q + 1]; s2 += src[q + 2]; }
    for (let x = 0; x < w; x++) {
      const o = base + x * 4;
      dst[o] = s0 / d; dst[o + 1] = s1 / d; dst[o + 2] = s2 / d; dst[o + 3] = src[o + 3];
      const qa = base + tb[x - r + r + 1] * 4, qb = base + tb[x + r + 1 + r + 1] * 4;
      s0 += src[qb] - src[qa]; s1 += src[qb + 1] - src[qa + 1]; s2 += src[qb + 2] - src[qa + 2];
    }
  }
}

function colonne(src, dst, w, h, r) {
  const d = r * 2 + 1;
  const tb = tableBornes(h, r);
  const pas = w * 4;
  for (let x = 0; x < w; x++) {
    const bx = x * 4;
    let s0 = 0, s1 = 0, s2 = 0;
    for (let i = -r; i <= r; i++) { const q = tb[i + r + 1] * pas + bx; s0 += src[q]; s1 += src[q + 1]; s2 += src[q + 2]; }
    for (let y = 0; y < h; y++) {
      const o = y * pas + bx;
      dst[o] = s0 / d; dst[o + 1] = s1 / d; dst[o + 2] = s2 / d; dst[o + 3] = src[o + 3];
      const qa = tb[y - r + r + 1] * pas + bx, qb = tb[y + r + 1 + r + 1] * pas + bx;
      s0 += src[qb] - src[qa]; s1 += src[qb + 1] - src[qa + 1]; s2 += src[qb + 2] - src[qa + 2];
    }
  }
}




















export function flouterLot(ctx, canvas, zones) {
  if (!zones.length) return;
  if (filtreDisponible()) {
    for (const z of zones) flouterRegion(ctx, canvas, z, z.r);
    return;
  }
  const W = canvas.width, H = canvas.height;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (const z of zones) {
    if (!(z.w >= 2) || !(z.h >= 2)) continue;
    const m = Math.ceil(Math.max(2, Math.round(z.r)) * 1.6);
    x0 = Math.min(x0, Math.floor(z.x - m)); y0 = Math.min(y0, Math.floor(z.y - m));
    x1 = Math.max(x1, Math.ceil(z.x + z.w + m)); y1 = Math.max(y1, Math.ceil(z.y + z.h + m));
  }
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1);
  if (!(x1 - x0 >= 2) || !(y1 - y0 >= 2)) return;
  const img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
  flouterTampon(img.data, x1 - x0, y1 - y0, x0, y0, zones);
  ctx.putImageData(img, x0, y0);
}






export function flouterTampon(d, uw, uh, ox, oy, zones) {
  const borne = (v, a, b) => (v < a ? a : v > b ? b : v);
  for (const z of zones) {
    if (!(z.w >= 2) || !(z.h >= 2)) continue;
    const r = Math.max(2, Math.round(z.r));
    const m = Math.ceil(r * 1.6);
    const fx = Math.round(z.x - m), fy = Math.round(z.y - m);
    const fw = Math.round(z.w + 2 * m), fh = Math.round(z.h + 2 * m);
    if (!(fw >= 2) || !(fh >= 2)) continue;


    const b = new Uint8ClampedArray(fw * fh * 4);
    for (let j = 0; j < fh; j++) {
      const sy = borne(fy + j, oy, oy + uh - 1) - oy;
      for (let i = 0; i < fw; i++) {
        const sx = borne(fx + i, ox, ox + uw - 1) - ox;
        const s = (sy * uw + sx) * 4, t = (j * fw + i) * 4;
        b[t] = d[s]; b[t + 1] = d[s + 1]; b[t + 2] = d[s + 2]; b[t + 3] = 255;
      }
    }









    const f = Math.max(1, Math.round(r / 10));
    const sw = Math.ceil(fw / f), sh = Math.ceil(fh / f);
    const p = f === 1 ? b : new Uint8ClampedArray(sw * sh * 4);
    if (f > 1) {
      for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) {
        let s0 = 0, s1 = 0, s2 = 0, n = 0;
        for (let v = j * f; v < Math.min(fh, (j + 1) * f); v++) for (let u = i * f; u < Math.min(fw, (i + 1) * f); u++) {
          const t = (v * fw + u) * 4; s0 += b[t]; s1 += b[t + 1]; s2 += b[t + 2]; n++;
        }
        const o = (j * sw + i) * 4; p[o] = s0 / n; p[o + 1] = s1 / n; p[o + 2] = s2 / n; p[o + 3] = 255;
      }
    }
    flouMoyenne(p, sw, sh, Math.max(1, Math.round(r / 2 / f)), 3);

    const cx = z.x + z.w / 2, cy = z.y + z.h / 2, ax = Math.max(1, z.w / 2), ay = Math.max(1, z.h / 2);
    const ya = Math.max(fy, oy), yb = Math.min(fy + fh, oy + uh);
    const xa = Math.max(fx, ox), xb = Math.min(fx + fw, ox + uw);
    for (let yy = ya; yy < yb; yy++) {
      const dy = (yy + 0.5 - cy) / ay;
      const gy = Math.min(sh - 1, Math.max(0, (yy - fy + 0.5) / f - 0.5));
      const j0 = Math.floor(gy), j1 = Math.min(sh - 1, j0 + 1), wy = gy - j0;
      for (let xx = xa; xx < xb; xx++) {
        const dx = (xx + 0.5 - cx) / ax;
        const e = Math.sqrt(dx * dx + dy * dy);
        if (e >= 1.25) continue;
        const a = e <= 0.9 ? 1 : (1.25 - e) / 0.35;
        const gx = Math.min(sw - 1, Math.max(0, (xx - fx + 0.5) / f - 0.5));
        const i0 = Math.floor(gx), i1 = Math.min(sw - 1, i0 + 1), wx = gx - i0;
        const q00 = (j0 * sw + i0) * 4, q01 = (j0 * sw + i1) * 4, q10 = (j1 * sw + i0) * 4, q11 = (j1 * sw + i1) * 4;
        const s = ((yy - oy) * uw + (xx - ox)) * 4;
        for (let c = 0; c < 3; c++) {
          const haut = p[q00 + c] + (p[q01 + c] - p[q00 + c]) * wx;
          const bas = p[q10 + c] + (p[q11 + c] - p[q10 + c]) * wx;
          const v = haut + (bas - haut) * wy;
          d[s + c] = d[s + c] + (v - d[s + c]) * a;
        }
      }
    }
  }
}


export function rayonPour(w, h) {





  return Math.max(10, Math.round(Math.min(w, h) / 1.6));
}









let _toile = null, _ctx = null;
function ardoise(w, h) {
  const pas = 64;
  const bw = Math.ceil(w / pas) * pas;
  const bh = Math.ceil(h / pas) * pas;
  if (!_toile || _toile.width < bw || _toile.height < bh) {
    const nw = Math.max(bw, _toile ? _toile.width : 0);
    const nh = Math.max(bh, _toile ? _toile.height : 0);
    _toile = toileHorsEcran(nw, nh);
    _ctx = _toile.getContext('2d', filtreDisponible() ? {} : { willReadFrequently: true });
  }
  return { toile: _toile, ctx: _ctx };
}


let _toile2 = null, _ctx2 = null;
function ardoiseBis(w, h) {
  const pas = 64;
  const bw = Math.ceil(w / pas) * pas;
  const bh = Math.ceil(h / pas) * pas;
  if (!_toile2 || _toile2.width < bw || _toile2.height < bh) {
    _toile2 = toileHorsEcran(Math.max(bw, _toile2 ? _toile2.width : 0), Math.max(bh, _toile2 ? _toile2.height : 0));
    _ctx2 = _toile2.getContext('2d');
  }
  return { toile: _toile2, ctx: _ctx2 };
}









const MI = 32;
const DEBORD = 1.1;
let _masque = null;
function masqueOvale() {
  if (_masque) return _masque;
  _masque = toileHorsEcran(MI * 2, MI * 2);
  const m = _masque.getContext('2d');
  const g = m.createRadialGradient(MI, MI, 0, MI, MI, MI / DEBORD);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.72, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  m.fillStyle = g;
  m.fillRect(0, 0, MI * 2, MI * 2);
  return _masque;
}















export function rayonZone(zone, plancher) {
  return Math.max(plancher, Math.round(Math.min(zone.w, zone.h) * 0.5));
}










export const ELARGI_TETE = 1.35;










export const ELARGI_VISAGE = 1.2;









export const ELARGI_SILHOUETTE = 1.04;
export function zoneTete(zone, facteur = ELARGI_TETE) {
  const f = facteur > 0 ? facteur : ELARGI_TETE;
  const w = zone.w * f;
  const h = zone.h * f;
  return { x: zone.x - (w - zone.w) / 2, y: zone.y - (h - zone.h) / 2, w, h };
}





export function flouterRegion(ctx, canvas, zone, rayon) {
  const r = Math.max(2, Math.round(rayon || rayonPour(zone.w, zone.h)));
  const marge = Math.ceil(r * 1.6);


















  const mw = Math.round(zone.w + marge * 2);
  const mh = Math.round(zone.h + marge * 2);
  const ox = Math.round(zone.x - marge);
  const oy = Math.round(zone.y - marge);
  const sx = Math.max(0, ox);
  const sy = Math.max(0, oy);
  const sw = Math.min(canvas.width, ox + mw) - sx;
  const sh = Math.min(canvas.height, oy + mh) - sy;



  if (!(sw >= 2) || !(sh >= 2) || !(mw >= 2) || !(mh >= 2)) return;
  const dx = sx - ox;
  const dy = sy - oy;

  const { toile: tmp, ctx: tctx } = ardoise(mw, mh);
  tctx.setTransform(1, 0, 0, 1, 0, 0);
  tctx.globalCompositeOperation = 'source-over';
  tctx.clearRect(0, 0, mw, mh);
  tctx.filter = 'none';

  tctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, mw, mh);

  tctx.drawImage(canvas, sx, sy, sw, sh, dx, dy, sw, sh);

  if (filtreDisponible()) {
    const net = ardoiseBis(mw, mh);
    net.ctx.setTransform(1, 0, 0, 1, 0, 0);
    net.ctx.filter = 'none';
    net.ctx.clearRect(0, 0, mw, mh);
    net.ctx.drawImage(tmp, 0, 0, mw, mh, 0, 0, mw, mh);
    tctx.filter = `blur(${r}px)`;
    tctx.clearRect(0, 0, mw, mh);
    tctx.drawImage(net.toile, 0, 0, mw, mh, 0, 0, mw, mh);
    tctx.filter = 'none';
  } else {




    const img = tctx.getImageData(0, 0, mw, mh);
    flouMoyenne(img.data, mw, mh, Math.max(1, Math.round(r / 2)), 3);
    tctx.putImageData(img, 0, 0);
  }





  const cx = zone.x - ox + zone.w / 2;
  const cy = zone.y - oy + zone.h / 2;
  const rx = (zone.w / 2) * 1.25;
  const ry = (zone.h / 2) * 1.25;
  const ex = Math.max(1, rx) * DEBORD;
  const ey = Math.max(1, ry) * DEBORD;
  tctx.globalCompositeOperation = 'destination-in';
  tctx.drawImage(masqueOvale(), cx - ex, cy - ey, ex * 2, ey * 2);
  tctx.globalCompositeOperation = 'source-over';

  ctx.save();
  ctx.imageSmoothingEnabled = true;

  ctx.drawImage(tmp, dx, dy, sw, sh, sx, sy, sw, sh);
  ctx.restore();
}
