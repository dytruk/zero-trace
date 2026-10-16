








const N = 24;
const RAYON = 0.5;
const ECHELLES = [0.9, 1, 1.1];
const SEUIL = 0.6;
const SEUIL_SAUT = 0.78;
const MIN_TAILLE = 0.75;
const MAX_TAILLE = 1.5;
const PERDU_MAX = 45;
const PERDU_BREF = 15;
const RESSEMBLANCE_MIN = 0.3;
const APPRENTISSAGE = 0.12;

const borne = (v, min, max) => (v < min ? min : v > max ? max : v);
















export const LISSAGE = { pos: 0.65, taille: 0.25 };






export function creerLecteur(W, H, maxLong = 384) {
  const e = Math.min(1, maxLong / Math.max(W, H));
  const lw = Math.max(1, Math.round(W * e));
  const lh = Math.max(1, Math.round(H * e));
  const c = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(lw, lh)
    : Object.assign(document.createElement('canvas'), { width: lw, height: lh });
  const g = c.getContext('2d', { alpha: false, willReadFrequently: true });
  let px = null, ecartPrecedent = 0;






  const PAS = 64;
  const taille = Math.ceil((lw * lh * 4) / PAS);
  let ech = new Uint8Array(taille), echAvant = new Uint8Array(taille);
  let premiere = true;
  const api = {
    echelle: e, lw, lh, rupture: false,
    rafraichir(src) {
      g.drawImage(src, 0, 0, lw, lh);
      px = g.getImageData(0, 0, lw, lh).data;



      let d = 0, n = 0;
      for (let i = 0, k = 0; i < px.length; i += PAS, k++) {
        const v = px[i];
        if (!premiere) { d += Math.abs(v - echAvant[k]); n++; }
        ech[k] = v;
      }
      const t = echAvant; echAvant = ech; ech = t;
      if (!premiere) {
        const ecart = n > 0 ? d / n : 0;




        api.rupture = ecart > 34 && ecart > ecartPrecedent * 2.2;
        ecartPrecedent = ecart;
      } else { api.rupture = false; ecartPrecedent = 0; premiere = false; }
    },
    pixels() { return px; },
  };
  return api;
}


function vignette(px, lw, lh, x, y, w, h) {
  const out = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    const sy = borne(Math.round(y + (j + 0.5) * h / N), 0, lh - 1);
    for (let i = 0; i < N; i++) {
      const sx = borne(Math.round(x + (i + 0.5) * w / N), 0, lw - 1);
      const k = (sy * lw + sx) << 2;
      out[j * N + i] = px[k] * 0.299 + px[k + 1] * 0.587 + px[k + 2] * 0.114;
    }
  }
  return out;
}

function statistiques(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i];
  const moy = s / v.length;
  let q = 0;
  for (let i = 0; i < v.length; i++) { const d = v[i] - moy; q += d * d; }
  return { moy, ecart: Math.sqrt(q) };
}


function correlation(gab, gabMoy, gabEcart, cand) {
  const { moy, ecart } = statistiques(cand);
  if (ecart < 1e-3 || gabEcart < 1e-3) return 0;
  let s = 0;
  for (let i = 0; i < gab.length; i++) s += (gab[i] - gabMoy) * (cand[i] - moy);
  return s / (gabEcart * ecart);
}

export class Piste {




  constructor(zone, opts = {}) {






















    const MIN_SUIVI = opts.minSuivi || 0;
    const mx = Math.max(0, (MIN_SUIVI - zone.w) / 2);
    const my = Math.max(0, (MIN_SUIVI - zone.h) / 2);
    this.rendu = { w: zone.w, h: zone.h };
    this.z = { x: zone.x - mx, y: zone.y - my, w: zone.w + mx * 2, h: zone.h + my * 2 };
    this.suiviT0 = { w: this.z.w, h: this.z.h };
    this.depart = opts.depart || 0;
    this.gabarit = null;
    this.gabMoy = 0;
    this.gabEcart = 0;
    this.vx = 0; this.vy = 0;
    this.perdu = 0;
    this.abandon = false;
    this.score = 0;
    this.deplacement = 0;
    this.t0 = { w: this.z.w, h: this.z.h };
    this.n = 0;
  }












  recaler(b, lec) {
    const mx = Math.max(0, (this.z.w - this.rendu.w) / 2);
    const my = Math.max(0, (this.z.h - this.rendu.h) / 2);
    this.rendu = { w: b.w, h: b.h };
    this.z = { x: b.x - mx, y: b.y - my, w: b.w + mx * 2, h: b.h + my * 2 };
    this.suiviT0 = { w: this.z.w, h: this.z.h };
    this.perdu = 0; this.abandon = false;
    this.vx *= 0.5; this.vy *= 0.5;


    if (lec) this.amorcer(lec);
  }


  amorcer(lec) {
    const e = lec.echelle;
    this.gabarit = vignette(lec.pixels(), lec.lw, lec.lh,
      this.z.x * e, this.z.y * e, this.z.w * e, this.z.h * e);
    const st = statistiques(this.gabarit);
    this.gabMoy = st.moy; this.gabEcart = st.ecart;
    return this.gabEcart > 1e-3;
  }












  vue() {
    const d = this.affiche || this.z;



    const k = this.suiviT0.w > 0 ? d.w / this.suiviT0.w : 1;
    const w = Math.max(2, Math.round(this.rendu.w * k));
    const h = Math.max(2, Math.round(this.rendu.h * k));
    return {
      x: Math.round(d.x + d.w / 2 - w / 2),
      y: Math.round(d.y + d.h / 2 - h / 2),
      w, h,
    };
  }






  avancer(lec, W, H) {
    if (!this.gabarit || this.abandon) return this.vue();
    const e = lec.echelle, px = lec.pixels();
    const z = this.z;

    const zw = z.w * e, zh = z.h * e;
    const px0 = (z.x + this.vx) * e, py0 = (z.y + this.vy) * e;
    const mx = zw * RAYON, my = zh * RAYON;
    const pasGros = Math.max(1, Math.round(Math.min(zw, zh) / 8));
    let best = { score: -2, x: px0, y: py0, w: zw, h: zh };
    const essai = (x, y, w, h) => {
      const s = correlation(this.gabarit, this.gabMoy, this.gabEcart,
        vignette(px, lec.lw, lec.lh, x, y, w, h));
      if (s > best.score) best = { score: s, x, y, w, h };
    };



    this.n++;
    for (const ech of (this.n % 4 === 0 ? ECHELLES : [1])) {
      const w = zw * ech, h = zh * ech;
      const cx = px0 + zw / 2, cy = py0 + zh / 2;
      for (let dy = -my; dy <= my; dy += pasGros) {
        for (let dx = -mx; dx <= mx; dx += pasGros) essai(cx + dx - w / 2, cy + dy - h / 2, w, h);
      }
    }
    const pasFin = Math.max(1, Math.round(pasGros / 3));
    const b = { ...best };
    for (let dy = -pasGros; dy <= pasGros; dy += pasFin) {
      for (let dx = -pasGros; dx <= pasGros; dx += pasFin) {
        if (dx === 0 && dy === 0) continue;
        essai(b.x + dx, b.y + dy, b.w, b.h);
      }
    }
    this.score = best.score;

    const saut = Math.hypot(best.x - px0, best.y - py0) > Math.min(zw, zh) * 0.35;
    if (lec.rupture || best.score < SEUIL || (saut && best.score < SEUIL_SAUT)) {


      this.perdu++;
      this.vx *= 0.5; this.vy *= 0.5;






      if (this.perdu > PERDU_BREF && best.score < RESSEMBLANCE_MIN) this.abandon = true;
      if (this.perdu > PERDU_MAX) this.abandon = true;





      const g = 1 + 0.015 * Math.min(this.perdu, 28);


      const v = this.vue();
      return {
        x: Math.round(v.x - v.w * (g - 1) / 2), y: Math.round(v.y - v.h * (g - 1) / 2),
        w: Math.round(v.w * g), h: Math.round(v.h * g),
      };
    }
    const nx = borne(Math.round(best.x / e), 0, W - 1);
    const ny = borne(Math.round(best.y / e), 0, H - 1);
    best.w = borne(best.w / e, this.t0.w * MIN_TAILLE, this.t0.w * MAX_TAILLE) * e;
    best.h = borne(best.h / e, this.t0.h * MIN_TAILLE, this.t0.h * MAX_TAILLE) * e;
    this.deplacement = Math.hypot(nx - z.x, ny - z.y);


    const vmax = this.t0.w * 0.4, hmax = this.t0.h * 0.4;
    this.vx = borne((nx - z.x) * 0.7 + this.vx * 0.3, -vmax, vmax);
    this.vy = borne((ny - z.y) * 0.7 + this.vy * 0.3, -hmax, hmax);


















    const PART_POS = LISSAGE.pos;
    const PART_TAILLE = LISSAGE.taille;












    const vw = Math.round(best.w / e);
    const vh = Math.round(best.h / e);













    this.z = { x: nx, y: ny, w: vw, h: vh };
    const d = this.affiche || this.z;
    const ax = Math.round(d.x + (nx - d.x) * PART_POS);
    const ay = Math.round(d.y + (ny - d.y) * PART_POS);
    const aw = Math.round(d.w + (vw - d.w) * PART_TAILLE);
    const ah = Math.round(d.h + (vh - d.h) * PART_TAILLE);














    this.affiche = { x: ax, y: ay, w: aw, h: ah };
    this.perdu = 0;


    const c = vignette(px, lec.lw, lec.lh, best.x, best.y, best.w, best.h);
    for (let i = 0; i < this.gabarit.length; i++) {
      this.gabarit[i] = this.gabarit[i] * (1 - APPRENTISSAGE) + c[i] * APPRENTISSAGE;
    }
    const st = statistiques(this.gabarit);
    this.gabMoy = st.moy; this.gabEcart = st.ecart;
    return this.vue();
  }
}
