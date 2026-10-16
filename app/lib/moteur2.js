
























































const TETE_DE_VISAGE = { largeur: 1.8, hauteur: 2.0, remonte: 0.2 };

const VISAGE_SEUL = { largeur: 1.25, hauteur: 1.2, remonte: 0.05 };
export const POUR_BLAZEFACE = {
  teteDeVisage: { largeur: 1.8, hauteur: 2.2, remonte: 0.22 },
  visageSeul: { largeur: 1.25, hauteur: 1.45, remonte: 0.08 },
};










const MARGE_TETE = 0.12;



const MARGE_TENUE = 0.1;






export const REGLAGES = {
  teteDeVisage: TETE_DE_VISAGE, visageSeul: VISAGE_SEUL,
  margeTete: MARGE_TETE, margeTenue: MARGE_TENUE,
  tenueVisage: 0.5, tenueTete: 1.0,
  hauteurTete: 0.25, largeurTete: 0.55,












  margeTeteVue: 0.2,
  ecarterImpossibles: true,
  masquerTetes: true,
};

export function zoneDeVisage(b, visageSeul = false, r = REGLAGES) {
  const f = visageSeul ? r.visageSeul : r.teteDeVisage;
  const w = b.w * f.largeur, h = b.h * f.hauteur;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2 - b.h * f.remonte;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}


export function zoneDeTeteVue(b, r = REGLAGES) {
  const m = r.margeTeteVue;
  return { x: b.x - b.w * m, y: b.y - b.h * m, w: b.w * (1 + 2 * m), h: b.h * (1 + 2 * m) };
}

export function zoneDeTete(b, r = REGLAGES) {
  const h0 = Math.max(10, Math.max(b.h * r.hauteurTete, b.w * r.largeurTete));
  const w0 = Math.min(Math.max(10, h0 * 1.1), b.w * 1.3);
  const y0 = b.y <= 2 ? 0 : b.y;
  const w = w0 * (1 + 2 * r.margeTete), h = h0 * (1 + 2 * r.margeTete);
  return { x: b.x + b.w / 2 - w / 2, y: y0 - h0 * r.margeTete, w, h };
}

function iou(a, b) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const i = ix * iy, u = a.w * a.h + b.w * b.h - i;
  return u > 0 ? i / u : 0;
}

export class Moteur {








  constructor({ largeur, hauteur, fps = 30, visageSeul = false, periodeTetes = 3, periodeVisages = 1, reglages = null }) {
    this.W = largeur; this.H = hauteur; this.fps = fps;
    this.r = reglages ? { ...REGLAGES, ...reglages } : REGLAGES;
    this.visageSeul = visageSeul;
    this.periodeTetes = Math.max(1, periodeTetes);
    this.periodeVisages = Math.max(1, periodeVisages);









    this.tenue = {
      visage: [this.periodeVisages + 2, Math.round(fps * this.r.tenueVisage)],
      tete: [this.periodeTetes + 1, Math.round(fps * this.r.tenueTete)],
    };
    this.pistes = [];
    this.prochainId = 1;
    this.derniereCoupe = -1e9;
    this.pertes = [];
    this.stats = { pistesVisages: 0, pistesTetes: 0, zonesTenues: 0, tetesMasquees: 0, visagesEcartes: 0, coupes: 0, tetesDeduites: 0 };
    this.personnesVues = null;
  }


  coupe(n) {
    this.pistes = [];
    this.personnesVues = null;
    this.derniereCoupe = n;
    this.stats.coupes++;
  }


  visages(boites, n) {






















    const recents = this.personnesVues && n - this.personnesVues.n <= this.periodeTetes ? this.personnesVues.boites : [];
    const plausibles = boites.filter((b) => {
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      const dans = (p) => cx >= p.x && cx <= p.x + p.w;
      const auBas = recents.some((p) => dans(p) && p.h > 2.5 * b.h && cy > p.y + p.h / 3 && cy <= p.y + p.h);
      const enHaut = recents.some((p) => dans(p) && cy >= p.y - 0.1 * p.h && cy <= p.y + 0.4 * p.h);












      const impossible = this.r.ecarterImpossibles && !this.tetesVues && auBas && !enHaut;
      if (impossible) this.stats.visagesEcartes++;
      return !impossible;
    });
    this._associer('visage', plausibles.map((b) => zoneDeVisage(b, this.visageSeul, this.r)), n);
  }


  personnes(boites, n) {
    this.personnesVues = { n, boites };
    this._associer('tete', boites.map((b) => ({ ...zoneDeTete(b, this.r), deduite: true })), n);
  }






























  tetesEtCorps(tetes, corps, n) {
    this.tetesVues = true;
    this.personnesVues = { n, boites: corps };
    const sansTete = corps.filter((c) => !tetes.some((t) => {
      const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
      return cx >= c.x && cx <= c.x + c.w && cy >= c.y - 0.1 * c.h && cy <= c.y + 0.4 * c.h;
    }));
    this.stats.tetesDeduites += sansTete.length;
    this._associer('tete', tetes.map((b) => zoneDeTeteVue(b, this.r))
      .concat(sansTete.map((b) => ({ ...zoneDeTete(b, this.r), deduite: true }))), n);
  }

  _position(p, n) {


    const dt = Math.min(n - p.vu, 5);
    return { x: p.cx + p.vx * dt - p.w / 2, y: p.cy + p.vy * dt - p.h / 2, w: p.w, h: p.h };
  }

  _associer(type, zones, n) {
    const pistes = this.pistes.filter((p) => p.type === type);
    const paires = [];
    for (const p of pistes) {
      const pp = this._position(p, n);
      for (let j = 0; j < zones.length; j++) {
        const d = zones[j];
        const s = iou(pp, d);
        const dist = Math.hypot(pp.x + pp.w / 2 - (d.x + d.w / 2), pp.y + pp.h / 2 - (d.y + d.h / 2));


        const proche = dist < 0.5 * Math.max(pp.w, pp.h, d.w, d.h);
        if (s >= 0.15 || proche) paires.push({ p, j, score: s + (proche ? 0.1 : 0) });
      }
    }
    paires.sort((a, b) => b.score - a.score);
    const prisP = new Set(), prisJ = new Set();
    for (const { p, j } of paires) {
      if (prisP.has(p) || prisJ.has(j)) continue;
      prisP.add(p); prisJ.add(j);
      const d = zones[j];
      const dcx = d.x + d.w / 2, dcy = d.y + d.h / 2;
      const dt = Math.max(1, n - p.vu);

      p.vx = 0.6 * p.vx + 0.4 * (dcx - p.cx) / dt;
      p.vy = 0.6 * p.vy + 0.4 * (dcy - p.cy) / dt;


      const pp = this._position(p, n);
      p.cx = 0.7 * dcx + 0.3 * (pp.x + pp.w / 2);
      p.cy = 0.7 * dcy + 0.3 * (pp.y + pp.h / 2);
      p.w = 0.35 * d.w + 0.65 * p.w;
      p.h = 0.35 * d.h + 0.65 * p.h;
      p.vu = n; p.vues++; p.deduite = !!d.deduite;
    }
    for (let j = 0; j < zones.length; j++) {
      if (prisJ.has(j)) continue;
      const d = zones[j];
      this.pistes.push({ id: this.prochainId++, type, cx: d.x + d.w / 2, cy: d.y + d.h / 2,
                         w: d.w, h: d.h, vx: 0, vy: 0, vu: n, ne: n, vues: 1, deduite: !!d.deduite });
      if (type === 'visage') this.stats.pistesVisages++; else this.stats.pistesTetes++;
    }
  }


  zones(n) {
    const vivantes = [];
    for (const p of this.pistes) {
      const [courte, longue] = this.tenue[p.type];
      if (n - p.vu <= (p.vues >= 2 ? longue : courte)) { vivantes.push(p); continue; }


      if (p.type === 'visage' && p.vues >= 3 && p.vu - this.derniereCoupe > longue && this.pertes.length < 4000) {
        this.pertes.push(p.vu + 1);
      }
    }
    this.pistes = vivantes;
    const sorties = [];
    const visages = [];
    for (const p of vivantes) {
      const z = this._position(p, n);





      const tenue = n - p.vu >= (p.type === 'visage' ? this.periodeVisages : this.periodeTetes);
      if (tenue) {
        z.x -= z.w * this.r.margeTenue / 2; z.y -= z.h * this.r.margeTenue / 2;
        z.w *= 1 + this.r.margeTenue; z.h *= 1 + this.r.margeTenue;
        this.stats.zonesTenues++;
      }
      const s = { ...z, source: p.type, tenue, id: p.id, deduite: p.deduite };
      if (p.type === 'visage') visages.push(s);
      sorties.push(s);
    }
    const finales = sorties.filter((s) => {
      if (s.source !== 'tete' || !this.r.masquerTetes || !s.deduite) return true;












      const px = s.x + s.w / 2, py = s.y + s.h / 3;
      const masquee = visages.some((v) => {
        const dx = (px - (v.x + v.w / 2)) / (v.w / 2), dy = (py - (v.y + v.h / 2)) / (v.h / 2);
        return dx * dx + dy * dy <= 1;
      });
      if (masquee) this.stats.tetesMasquees++;
      return !masquee;
    });

    return finales.map((s) => {
      const x = Math.max(0, Math.round(s.x)), y = Math.max(0, Math.round(s.y));
      const w = Math.min(this.W, Math.round(s.x + s.w)) - x, h = Math.min(this.H, Math.round(s.y + s.h)) - y;
      return { ...s, x, y, w, h };
    }).filter((s) => s.w >= 4 && s.h >= 4);
  }
}









const COULEURS = {
  visage: '#ff3b30', 'visage tenu': '#ff9f0a',
  tete: '#0a84ff', 'tete tenu': '#64d2ff',
  doigt: '#30d158',
};
export function dessinerDiagnostic(ctx, zones, largeur) {
  const e = Math.max(2, Math.round(largeur / 320));
  ctx.save();
  ctx.lineWidth = e;
  for (const z of zones) {
    ctx.strokeStyle = COULEURS[z.source + (z.tenue ? ' tenu' : '')] || '#ffffff';
    ctx.beginPath();
    ctx.ellipse(z.x + z.w / 2, z.y + z.h / 2, z.w / 2, z.h / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  const t = Math.max(12, Math.round(largeur / 40));
  ctx.font = `bold ${t}px system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, t * 15, t * 1.6);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('DIAGNOSTIC — NE PAS PUBLIER', t * 0.4, t * 1.15);
  ctx.restore();
}
