




















import { chargerYunet, PIXELS_VIDEO } from './yunet.js';
import { visagesBruts, loadHeadDetector } from './faces.js';
import { Moteur, POUR_BLAZEFACE } from './moteur2.js';
import { chargerTetes } from './tetes.js';




const detecteurs = new Map();
let secours = false;

async function visages(toile, pixelsMax) {
  if (!detecteurs.has(pixelsMax)) {
    detecteurs.set(pixelsMax, chargerYunet({ pixelsMax }).catch(() => { secours = true; return null; }));
  }
  const yunet = await detecteurs.get(pixelsMax);
  return yunet ? yunet.detecter(toile) : visagesBruts(toile);
}



let detTetes = null;
async function tetesEtCorps(toile) {
  if (!detTetes) detTetes = chargerTetes().catch(() => null);
  const t = await detTetes;
  return t ? t.detecter(toile) : null;
}



let petite = null;
async function personnes(toile) {
  const det = await loadHeadDetector('IMAGE');
  const k = Math.min(1, 512 / Math.max(toile.width, toile.height));
  let cible = toile;
  if (k < 1) {
    const w = Math.round(toile.width * k), h = Math.round(toile.height * k);
    if (!petite || petite.width !== w || petite.height !== h) petite = new OffscreenCanvas(w, h);
    petite.getContext('2d').drawImage(toile, 0, 0, w, h);
    cible = petite;
  }
  const inv = 1 / k;
  return (det.detect(cible).detections || []).map((d) => d.boundingBox).filter(Boolean)
    .map((b) => ({ x: b.originX * inv, y: b.originY * inv, w: b.width * inv, h: b.height * inv }));
}



let file = Promise.resolve();


export function detecterImage(toile, { tetes = false, pixelsMax = PIXELS_VIDEO } = {}) {
  const tache = file.then(async () => {
    const v = await visages(toile, pixelsMax);
    const t = tetes ? await tetesEtCorps(toile) : null;
    const p = tetes && !t ? await personnes(toile) : null;
    return { visages: v, tetes: t, personnes: p, secours, largeur: toile.width, hauteur: toile.height };
  });
  file = tache.catch(() => {});
  return tache;
}





export function zonesDe(d, { visageSeul = false } = {}) {
  const m = new Moteur({ largeur: d.largeur, hauteur: d.hauteur, fps: 30, visageSeul,
                         reglages: d.secours ? POUR_BLAZEFACE : null });

  if (d.tetes) m.tetesEtCorps(d.tetes.tete, d.tetes.corps, 0);
  else if (d.personnes) m.personnes(d.personnes, 0);
  m.visages(d.visages, 0);
  return m.zones(0).map((z) => ({ type: 'rect', x: z.x, y: z.y, w: z.w, h: z.h, source: z.source, final: true }));
}
