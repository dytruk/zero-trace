import { scan, detectFormat } from './lib/meta.js';
import { scanVideo, inventaireMp4 } from './lib/videometa.js';
import { toWorkCanvas, MAX_EDGE_DEFAULT } from './lib/decode.js';
import { BlurEngine } from './lib/blur.js';
import { flouterLot } from './lib/flou.js';
import { detecterImage, zonesDe } from './lib/apercu.js';
import { methodeFlou } from './lib/flou.js';
import { encode, share } from './lib/export.js';
import { blurVideo, recopierSansReencoder, zoneTete, rayonZone, ELARGI_TETE, ELARGI_VISAGE } from './lib/videopipe.js';



const BUILD = '20261016-2347';


const outbound = { count: 0, hotes: new Set() };
(function watchNetwork() {
  const here = location.origin;
  const foreign = (u) => { try { return new URL(u, location.href).origin !== here; } catch { return true; } };
  const bump = (u) => {
    if (!foreign(u)) return;
    outbound.count++;

    try { outbound.hotes.add(new URL(u, location.href).host || String(u).slice(0, 40)); }
    catch (e) { outbound.hotes.add('adresse illisible'); }
    paintNet();
  };
  const f = window.fetch;
  window.fetch = function (input) { bump(typeof input === 'string' ? input : (input && input.url) || ''); return f.apply(this, arguments); };
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u) { bump(u); return open.apply(this, arguments); };
  if (navigator.sendBeacon) {
    const b = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (u, d) { bump(u); return b(u, d); };
  }
})();

const $ = (id) => document.getElementById(id);
const body = document.body;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function paintNet() {
  const el = $('net');
  el.dataset.state = outbound.count ? 'live' : 'idle';




  el.textContent = outbound.count
    ? `${outbound.count} sortie${outbound.count > 1 ? 's' : ''} bloquée${outbound.count > 1 ? 's' : ''}`
    : 'aucune sortie réseau';
  el.title = outbound.count ? [...outbound.hotes].join(', ') : '';
  const ou = $('reseauDetail');
  if (ou) {
    ou.textContent = outbound.count
      ? `Bloquées jusqu\u2019ici : ${[...outbound.hotes].join(', ')}.`
      : 'Rien n\u2019a encore essayé de sortir pendant cette visite.';
  }
}
paintNet();
const status = (t) => { $('status').textContent = t; };
$('build').textContent = 'v' + BUILD;







let verrouEcran = null;
async function garderEveille() {
  if (verrouEcran || !navigator.wakeLock) return false;
  try {
    verrouEcran = await navigator.wakeLock.request('screen');
    verrouEcran.addEventListener('release', () => { verrouEcran = null; });
    noter('écran maintenu allumé');
    return true;
  } catch (e) { noter('verrou d\u2019écran refusé', String(e.message || e).slice(0, 60)); return false; }
}
function laisserDormir() {
  if (!verrouEcran) return;
  try { verrouEcran.release(); } catch (e) {  }
  verrouEcran = null;
}






document.addEventListener('visibilitychange', () => {
  if (!S.enTraitement) return;
  if (document.visibilityState === 'visible') garderEveille();
  else { S.quitteePendant = true; noter('page passée en arrière-plan pendant le traitement'); }
});

function veil(text, pct) {
  const v = $('veil');
  if (!text) { v.hidden = true; $('jauge').hidden = true; $('veilNote').hidden = true; return; }
  $('veilText').textContent = text;
  v.hidden = false;
  if (typeof pct === 'number') {
    $('jauge').hidden = false;
    $('jaugeBar').style.width = Math.round(pct * 100) + '%';
    $('veilText').textContent = `${text} — ${Math.round(pct * 100)} %`;
  }
  else $('jauge').hidden = true;
}










const EMPILABLES = new Set(['edit', 'done', 'aide']);











function appliquerEcran(name) {
  body.dataset.screen = name;


  if (name === 'edit') { const b = $('retourPreuve'); if (b) b.hidden = !S.exported; }
  peindrePeremption();
  window.scrollTo(0, 0);
}
function setScreen(name) {
  const avant = body.dataset.screen;
  appliquerEcran(name);
  if (name === avant) return;


  if (!EMPILABLES.has(name)) return;
  try { history.pushState({ ecran: name }, ''); }
  catch (e) {  }
}
window.addEventListener('popstate', (e) => {
  const n = (e.state && e.state.ecran) || 'start';




  appliquerEcran(n);
});
try { history.replaceState({ ecran: 'start' }, ''); } catch (e) {  }




let ecranAvant = 'start';

function ouvrirAide(ancre) {
  if (body.dataset.screen !== 'aide') ecranAvant = body.dataset.screen;
  setScreen('aide');


  const cible = ancre === 'installer' || ancre === 'reseau' ? $(ancre) : null;
  if (cible) cible.scrollIntoView({ block: 'start', behavior: 'instant' });
  else window.scrollTo({ top: 0, behavior: 'instant' });
}

for (const b of document.querySelectorAll('[data-aide]')) {
  b.addEventListener('click', () => ouvrirAide(b.dataset.aide));
}
$('aideBas').addEventListener('click', () => ouvrirAide());












$('retourPreuve').addEventListener('click', () => setScreen('done'));
$('retourEditeur').addEventListener('click', () => {
  if (history.state && history.state.ecran === 'done') history.back();
  else setScreen('edit');
});
$('net').addEventListener('click', () => ouvrirAide('reseau'));
$('aideRetour').addEventListener('click', () => {


  if (history.state && history.state.ecran === 'aide') history.back();
  else setScreen(ecranAvant);
});








const surIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let demandeInstall = null;
window.addEventListener('beforeinstallprompt', (e) => {


  if (surIOS) return;
  e.preventDefault();
  demandeInstall = e;
  $('installerAppli').hidden = false;


  $('poseInstall').hidden = true;
});
$('installerAppli').addEventListener('click', async () => {
  if (!demandeInstall) return;
  demandeInstall.prompt();
  const { outcome } = await demandeInstall.userChoice;
  noter('installation', outcome);
  if (outcome === 'accepted') {
    $('installerAppli').hidden = true;
    $('poseInstall').innerHTML = '<li><span>C\u2019est fait : retrouve l\u2019outil sur ton écran d\u2019accueil.</span></li>';
    $('poseInstall').hidden = false;
  } else {

    $('poseInstall').hidden = false;
  }
  demandeInstall = null;
});

(function poserInstructions() {
  const iOS = surIOS;
  const android = /Android/.test(navigator.userAgent);
  const deja = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const liste = $('poseInstall');
  if (!liste) return;
  const pourquoi = $('installPourquoi');
  if (deja) {
    liste.innerHTML = '<li><span>C\u2019est déjà fait : tu utilises l\u2019application installée.</span></li>';
    if (pourquoi) pourquoi.hidden = true;
    return;
  }



  if (pourquoi) {
    pourquoi.hidden = !iOS;
    pourquoi.innerHTML = '<b>Il n\u2019y a pas de bouton ici, et c\u2019est normal.</b> Sur iPhone, aucun navigateur n\u2019a le droit de lancer l\u2019installation : Apple réserve ce geste au menu de partage. D\u2019où les trois étapes ci-dessous. Sur ordinateur, le bouton existe.';
  }
  const pas = iOS
    ? ['Ouvre le menu de partage de ton navigateur (l\u2019icône d\u2019un carré avec une flèche).',
       'Fais défiler la liste et choisis « Sur l\u2019écran d\u2019accueil ».',
       'Appuie sur « Ajouter ». L\u2019outil s\u2019ouvrira depuis ton écran d\u2019accueil.']
    : android
      ? ['Ouvre le menu du navigateur, en haut à droite.',
         'Choisis « Installer l\u2019application », ou « Ajouter à l\u2019écran d\u2019accueil ».',
         'Confirme. L\u2019outil s\u2019ouvrira comme une application.']
      : ['Dans la barre d\u2019adresse, clique l\u2019icône d\u2019installation.',
         'Confirme l\u2019installation.',
         'L\u2019outil s\u2019ouvrira dans sa propre fenêtre.'];
  liste.innerHTML = pas.map((x) => `<li><span>${x}</span></li>`).join('');
})();






const JOURNAL = [];





const DIAGNOSTIC = (() => { try { return new URLSearchParams(location.search).has('diag'); } catch (e) { return false; } })();


function heureLocale(d) {
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}
function noter(quoi, detail) {
  JOURNAL.push({ t: heureLocale(new Date()), quoi, detail: detail === undefined ? null : detail });
  if (JOURNAL.length > 300) JOURNAL.shift();
}
window.addEventListener('error', (e) => noter('erreur js', `${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => noter('promesse rejetée', String((e.reason && e.reason.message) || e.reason)));

function rapport() {
  const nav = navigator;
  const lignes = [
    `Zero-Trace ${BUILD}`,
    `appareil : ${nav.userAgent}`,
    `écran : ${screen.width}×${screen.height} @${devicePixelRatio}× · fenêtre ${innerWidth}×${innerHeight}`,
    `mémoire annoncée : ${nav.deviceMemory || '?'} Go · cœurs : ${nav.hardwareConcurrency || '?'}`,
    `fichier : ${S.kind || '?'}${S.meta && S.meta.format ? ' · ' + S.meta.format : ''}${S.video ? ` · ${S.video.width}×${S.video.height} · ${S.video.fps || '?'} i/s · ${Math.round(S.video.duration || 0)} s` : ''}`,


    `réglages : visages ${S.on.visages ? 'oui' : 'non'} · gens de dos ${S.on.tetes ? 'oui' : 'non'} · zones au doigt ${S.manual.length}${DIAGNOSTIC ? ' · DIAGNOSTIC' : ''}`,
    `sorties réseau bloquées : ${outbound.count}${outbound.count ? ' (' + [...outbound.hotes].join(', ') + ')' : ''}`,
    `flou : ${methodeFlou()}`,
    '',
    '--- journal ---',
  ];
  for (const e of JOURNAL) {
    lignes.push(`${e.t}  ${e.quoi}${e.detail !== null ? ' : ' + (typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail)) : ''}`);
  }
  return lignes.join('\n');
}

function montrerDiag() {
  $('diagTexte').value = rapport();
  $('diag').hidden = false;
}
$('voirDiag').addEventListener('click', montrerDiag);
$('diagFermer').addEventListener('click', () => { $('diag').hidden = true; });
$('diagCopier').addEventListener('click', async () => {
  const t = $('diagTexte');
  try { await navigator.clipboard.writeText(t.value); }
  catch (e) { t.select(); document.execCommand && document.execCommand('copy'); }
  $('diagCopier').querySelector('span').textContent = 'copié';
  setTimeout(() => { $('diagCopier').querySelector('span').textContent = 'Copier le journal'; }, 1800);
});


const S = {
  kind: null, file: null, buf: null, meta: null,
  work: null, engine: null,
  video: null,
  manual: [], autoFaces: [],


















  on: { visages: true, tetes: false, large: true },
  tool: 'brush', exported: null,
};


$('pick').addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (f) charger(f);
});
const drop = $('drop');
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('is-over')));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) charger(f);
});


const ETAPES = [];
function etape(cle, libelle) { ETAPES.push({ cle, libelle, etat: 'attente', valeur: '', part: 0 }); peindreEtapes(); }


function renommerEtape(cle, libelle) {
  const e = ETAPES.find((x) => x.cle === cle);
  if (e) { e.libelle = libelle; peindreEtapes(); }
}














function zonesPourMoteur(z) {
  const commun = { suivi: !!z.suivi, t: z.t || 0 };
  if (z.type === 'rect') return [{ x: z.x, y: z.y, w: z.w, h: z.h, ...commun }];
  const pts = z.points || [];
  if (!pts.length) return [];
  const r = Math.max(2, z.radius || 0);
  const MAX = r * 4;
  const boites = [];
  let x0 = pts[0].x, y0 = pts[0].y, x1 = pts[0].x, y1 = pts[0].y;
  const fermer = () => boites.push({
    x: Math.round(x0 - r), y: Math.round(y0 - r),
    w: Math.round(x1 - x0 + r * 2), h: Math.round(y1 - y0 + r * 2),
    ...commun,
  });
  for (const p of pts) {
    const nx0 = Math.min(x0, p.x), ny0 = Math.min(y0, p.y);
    const nx1 = Math.max(x1, p.x), ny1 = Math.max(y1, p.y);
    if (nx1 - nx0 > MAX || ny1 - ny0 > MAX) {
      fermer();
      x0 = x1 = p.x; y0 = y1 = p.y;
    } else { x0 = nx0; y0 = ny0; x1 = nx1; y1 = ny1; }
  }
  fermer();
  return boites;
}









function signatureEdition() {
  const z = S.manual.map((m) => (m.type === 'rect'
    ? `r:${Math.round(m.x)},${Math.round(m.y)},${Math.round(m.w)},${Math.round(m.h)},${m.t || 0}`
    : `b:${(m.points || []).length},${Math.round(m.radius || 0)},${m.t || 0}`));
  const o = S.on || {};
  return `${z.join('|')}#v${o.visages ? 1 : 0}t${o.tetes ? 1 : 0}x${o.voix ? 1 : 0}l${o.large === false ? 0 : 1}`;
}

function exportPerime() {
  return !!(S.exported && S.exported.signature !== undefined
    && S.exported.signature !== signatureEdition());
}

function peindrePeremption() {
  const vieux = exportPerime();
  const b = $('retourPreuve');
  if (b) {
    b.classList.toggle('action--alerte', vieux);
    const t = b.querySelector('span');
    if (t) t.textContent = vieux ? 'Revenir au résultat (sans tes corrections)' : 'Revenir au résultat';
  }
  const p = $('perime');
  if (p) {
    p.hidden = !vieux;
    p.textContent = vieux
      ? 'Tes dernières corrections NE SONT PAS ENREGISTRÉES dans ce fichier. Elles n’y seront qu’après un nouveau « Nettoyer et exporter » : l’image doit être refabriquée pour les contenir.'
      : '';
  }
}

function majEtape(cle, etat, valeur, part) {
  if (etat === 'fait') noter('étape ' + cle, valeur);
  const e = ETAPES.find((x) => x.cle === cle);
  if (!e) return;
  e.etat = etat;
  if (valeur !== undefined) e.valeur = valeur;
  if (part !== undefined) e.part = Math.max(0, Math.min(1, part));
  if (etat === 'fait') e.part = 1;
  peindreEtapes();
}

function peindreJauge() {
  if (!ETAPES.length) return;
  const faites = ETAPES.reduce((n, e) => n + (e.etat === 'fait' ? 1 : e.part || 0), 0);
  const pourcent = Math.round((faites / ETAPES.length) * 100);
  const barre = $('progBarre');
  if (barre) barre.style.width = pourcent + '%';
  const courante = ETAPES.find((e) => e.etat === 'cours');
  const txt = $('progTxt');
  if (txt) txt.textContent = courante ? `${courante.libelle.toLowerCase()} — ${pourcent} %` : `${pourcent} %`;
}
function peindreEtapes() {
  peindreJauge();
  $('steps').innerHTML = ETAPES.map((e) => `<tr data-etat="${e.etat}"><th>${esc(e.libelle)}</th><td>${esc(e.valeur || (e.etat === 'cours' ? '…' : ''))}</td></tr>`).join('');
}

const FORMATS_PHOTO = ['JPEG', 'PNG', 'HEIC', 'AVIF', 'WEBP', 'GIF'];





function natureDuFichier(buf, file) {
  const fmt = detectFormat(buf);
  if (fmt === 'MP4/MOV') return { kind: 'video', fmt };
  if (FORMATS_PHOTO.includes(fmt)) return { kind: 'photo', fmt };
  const parNom = /^video\//.test(file.type || '') || /\.(mp4|mov|m4v|qt|webm|avi|mkv)$/i.test(file.name || '');
  return { kind: parNom ? 'video' : 'photo', fmt };
}

async function charger(file) {
  ETAPES.length = 0;
  S.kind = null;
  S.file = file;
  S.manual = []; S.autoFaces = []; S.detApercu = null; S.detectionEchec = null;
  if (S.video && S.video.el && S.video.el.parentNode) {
    try { URL.revokeObjectURL(S.video.el.src); } catch (e) {  }
    S.video.el.remove();
  }
  S.on = { visages: true, tetes: false, large: true, voix: false };
  S.exported = null;
  setScreen('scan');
  $('scanTitle').innerHTML = 'Je regarde<br>ce que<br>ce fichier<br>raconte.';








  etape('lecture', 'Lecture du fichier');
  etape('meta', 'Métadonnées');
  etape('image', 'Première image');
  etape('visages', 'Recherche de visages');

  try {
    majEtape('lecture', 'cours');
    S.buf = await file.arrayBuffer();
    const nature = natureDuFichier(S.buf, file);
    S.kind = nature.kind;





    if (S.kind === 'video' && !saitTraiterLaVideo()) {
      const e = new Error('Ce navigateur ne sait pas réencoder une vidéo.\n\nLes photos fonctionnent normalement. Pour les vidéos, essaie Chrome, Edge, Arc, ou Safari 16.4 et plus récent.\n\nLa page « Ce que ce navigateur sait faire », dans l\u2019aide, détaille précisément ce qui manque ici.');
      e.navigateur = true;
      throw e;
    }
    majEtape('lecture', 'fait', `${nature.fmt} · ${(file.size / 1048576).toFixed(1)} Mo`);
    $('scanTitle').innerHTML = S.kind === 'video'
      ? 'Je regarde<br>ce que<br>cette vidéo<br>raconte.'
      : 'Je regarde<br>ce que<br>cette photo<br>raconte.';
    if (S.kind !== 'video') renommerEtape('image', 'Décodage');

    majEtape('meta', 'cours');
    S.meta = S.kind === 'video' ? scanVideo(S.buf) : scan(S.buf);
    const n = S.meta.identityCount || 0;
    majEtape('meta', 'fait', n === 0 ? 'rien trouvé' : `${n} donnée${n > 1 ? 's' : ''}`);

    majEtape('image', 'cours');
    let cible;
    if (S.kind === 'video') {
      S.video = await ouvrirVideo(file);
      S.aDuSon = aUnePisteSon(S.buf);
      cible = S.video.frame;
      majEtape('image', 'fait', `${S.video.width}×${S.video.height}`);
    } else {
      S.work = await toWorkCanvas(file, S.buf, S.meta, { maxEdge: MAX_EDGE_DEFAULT });
      S.engine = new BlurEngine(S.work.canvas);
      cible = S.work.canvas;
      majEtape('image', 'fait', `${S.work.width}×${S.work.height}`);
    }

    majEtape('visages', 'cours');
    try {

      await majApercu();
      if (S.kind === 'video') {



        S.sondage = await sonderVideo((i, n) => majEtape('visages', 'cours', `moment ${i} sur ${n}`, i / n));



        majEtape('visages', 'fait', S.sondage.rates >= S.sondage.instantsDemandes
          ? 'vidéo non parcourable sur cet appareil : ils seront cherchés image par image à l\u2019export'
          : S.sondage.instantsAvecVisage
            ? `${S.sondage.visagesMax} au plus, sur ${S.sondage.instantsAvecVisage} des ${S.sondage.instants} instants sondés`
            : `aucun sur ${S.sondage.instants} instants sondés`);
      } else {

      const nv = S.autoFaces.filter((z) => z.source !== 'tete').length;
      majEtape('visages', 'fait', nv ? `${nv} trouvé${nv > 1 ? 's' : ''}` : 'aucun');
      }
    } catch (e) { majEtape('visages', 'fait', 'moteur indisponible'); }

    ouvrirEditeur();
  } catch (err) {



    majEtape('lecture', 'fait', err && err.navigateur ? 'navigateur incompatible' : 'échec');
    noter('analyse interrompue', (err && err.message) ? err.message.slice(0, 120) : String(err));
    alert(err && err.navigateur
      ? err.message
      : 'Ce fichier n’a pas pu être lu : ' + (err && err.message ? err.message : err));
    setScreen('start');
  }
}






















function aUnePisteSon(buf) {
  const u8 = new Uint8Array(buf, 0, Math.min(buf.byteLength, 4 * 1024 * 1024));
  for (let i = 0; i + 4 <= u8.length; i++) {
    if (u8[i] === 115 && u8[i + 1] === 111 && u8[i + 2] === 117 && u8[i + 3] === 110) return true;
  }
  return false;
}






const peutDeformerLaVoix = typeof AudioDecoder !== 'undefined' && typeof AudioEncoder !== 'undefined';

function saitTraiterLaVideo() {
  return typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined'
    && typeof VideoFrame !== 'undefined' && typeof EncodedVideoChunk !== 'undefined';
}














function empreinteImage(g, w, h) {
  try {
    const d = g.getImageData(0, 0, Math.min(w, 160), Math.min(h, 90)).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 401) s += d[i];
    return s;
  } catch (e) { return -1; }
}

function imagePeinte(v, ms = 700) {
  return new Promise((res) => {
    if (!v.requestVideoFrameCallback) { setTimeout(res, 80); return; }
    let fini = false;
    const fin = () => { if (fini) return; fini = true; clearTimeout(minuteur); res(); };
    const minuteur = setTimeout(fin, ms);
    try { v.requestVideoFrameCallback(fin); } catch (e) { fin(); }
  });
}








function etatLecteur(v) {
  const prets = ['rien', 'métadonnées', 'image courante', 'un peu d’avance', 'assez d’avance'];
  let tampon = 'vide';
  try {
    const b = v.buffered;
    if (b && b.length) {
      const bouts = [];
      for (let i = 0; i < b.length && i < 3; i++) bouts.push(`${b.start(i).toFixed(1)}–${b.end(i).toFixed(1)}`);
      tampon = bouts.join(' ');
    }
  } catch (e) { tampon = 'illisible'; }
  return `prêt=${prets[v.readyState] || v.readyState} · réseau=${v.networkState} · cherche=${v.seeking ? 'oui' : 'non'}`
    + ` · à ${(v.currentTime || 0).toFixed(2)} s · tampon ${tampon} · ${v.videoWidth}×${v.videoHeight}`;
}














async function allerA(v, t, ms = 5000) {
  const court = Math.max(1200, Math.min(ms, 2500));
  let raison = await nouvellePosition(v, t, court);
  if (raison !== 'positionné' && raison !== 'déjà en place' && typeof v.fastSeek === 'function') {
    raison = await nouvellePosition(v, t, court, (el, x) => el.fastSeek(x));
    if (raison === 'positionné') noter('positionnement vidéo', 'obtenu par fastSeek');
  }
  if (raison !== 'positionné' && raison !== 'déjà en place') {
    try {
      v.muted = true;
      const p = v.play();
      if (p && p.then) await p;
      v.pause();
      noter('positionnement vidéo', 'réveil par lecture tenté');
    } catch (e) { noter('positionnement vidéo', 'réveil par lecture refusé'); }
    raison = await nouvellePosition(v, t, Math.max(court, ms - court * 2));
  }

  if (raison === 'positionné') await imagePeinte(v);
  return raison;
}

















function nouvellePosition(v, t, ms, poser) {
  return new Promise((res) => {
    if (Math.abs((v.currentTime || 0) - t) < 0.02) return res('déjà en place');
    let fini = false;
    const sortir = (raison) => {
      if (fini) return;
      fini = true;
      v.removeEventListener('seeked', ok);
      clearInterval(veille);
      clearTimeout(minuteur);
      if (raison !== 'positionné') noter('positionnement vidéo', `${raison} à ${t.toFixed(2)} s · ${etatLecteur(v)}`);
      res(raison);
    };
    const ok = () => sortir('positionné');


    const arrive = () => Math.abs((v.currentTime || 0) - t) < 0.05 && v.readyState >= 2;
    if (!(typeof globalThis !== 'undefined' && globalThis.__ztSansSeeked)) v.addEventListener('seeked', ok);
    const veille = setInterval(() => { if (arrive()) sortir('positionné'); }, 60);
    const minuteur = setTimeout(() => sortir(arrive() ? 'positionné' : 'délai dépassé'), ms);
    try { (poser || ((el, x) => { el.currentTime = x; }))(v, t); } catch (e) { sortir('refusé par le lecteur'); }
  });
}


function premiereImagePrete(v, ms = 15000) {
  return new Promise((res) => {
    if (v.readyState >= 2) return res(true);
    let fini = false;
    const sortir = (ok) => {
      if (fini) return;
      fini = true;
      v.removeEventListener('loadeddata', bon);
      v.removeEventListener('error', mauvais);
      clearTimeout(minuteur);
      res(ok);
    };
    const bon = () => sortir(true);
    const mauvais = () => sortir(false);
    v.addEventListener('loadeddata', bon);
    v.addEventListener('error', mauvais);
    const minuteur = setTimeout(() => sortir(v.readyState >= 2), ms);
  });
}


















async function reveillerLecteur(v) {
  const etat = () => `prêt=${v.readyState} · tampon=${v.buffered && v.buffered.length ? 'oui' : 'vide'}`;
  const avant = etat();
  const capacites = `rVFC=${typeof v.requestVideoFrameCallback === 'function' ? 'oui' : 'NON'} · fastSeek=${typeof v.fastSeek === 'function' ? 'oui' : 'non'}`;
  try {
    v.muted = true; v.playsInline = true;
    const p = v.play();
    if (p && p.then) await p;
    const fin = performance.now() + 2500;
    while (performance.now() < fin && !(v.readyState >= 3 && v.buffered && v.buffered.length)) {
      await new Promise((r) => setTimeout(r, 80));
    }
    try { v.pause(); } catch (e) {  }
    noter('réveil du lecteur', `${capacites} · avant ${avant} · après ${etat()}`);
    return true;
  } catch (e) {
    noter('réveil du lecteur', `REFUSÉ (${(e && e.message) || e}) · ${capacites} · ${avant}`);
    return false;
  }
}








async function secouerParLecture(v, t) {
  try {
    v.muted = true;
    const p = v.play();
    if (p && p.then) await p;
    await new Promise((r) => setTimeout(r, 220));
    try { v.pause(); } catch (e) {  }
    await nouvellePosition(v, t, 1500);
    noter('secousse par lecture', `à ${t.toFixed(2)} s · ${etatLecteur(v)}`);
    return true;
  } catch (e) {
    noter('secousse par lecture', `refusée : ${(e && e.message) || e}`);
    return false;
  }
}

async function ouvrirVideo(file) {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto';
  v.setAttribute('playsinline', '');
  v.src = URL.createObjectURL(file);














  v.className = 'lecteur-cache';
  document.body.appendChild(v);



  await reveillerLecteur(v);

  await premiereImagePrete(v);
  if (!v.videoWidth || !v.videoHeight) throw new Error('ce navigateur ne sait pas lire cette vidéo');

  const instant = Math.min(0.3, (v.duration || 2) / 4);
  await allerA(v, instant);

  const c = document.createElement('canvas');
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);

  const fps = await cadence(v);

  await allerA(v, instant);

  noter('vidéo ouverte', { taille: `${v.videoWidth}×${v.videoHeight}`, duree: Math.round(v.duration || 0), fps });
  return { el: v, frame: c, width: v.videoWidth, height: v.videoHeight, duration: v.duration || 0, fps };
}






function cadence(v) {
  return new Promise((res) => {
    if (!v.requestVideoFrameCallback) return res(30);
    const temps = [];
    let fini = false;
    const rendre = () => {
      if (fini) return; fini = true;
      try { v.pause(); } catch (e) {  }
      const d = [];
      for (let i = 1; i < temps.length; i++) d.push(temps[i] - temps[i - 1]);
      d.sort((a, b) => a - b);
      const med = d.length ? d[Math.floor(d.length / 2)] : 0;
      res(med > 0.005 && med < 0.2 ? Math.round(1 / med) : 30);
    };
    const secours = setTimeout(rendre, 1500);
    const tick = (now, meta) => {
      temps.push(meta.mediaTime);
      if (temps.length >= 9) { clearTimeout(secours); return rendre(); }
      v.requestVideoFrameCallback(tick);
    };
    v.muted = true;
    const p = v.play();
    if (p && p.catch) p.catch(() => { clearTimeout(secours); rendre(); });
    v.requestVideoFrameCallback(tick);
  });
}






async function sonderVideo(onProgress) {
  const v = S.video.el;
  const duree = S.video.duration || 0;
  const instants = duree > 4 ? 9 : 3;
  const c = document.createElement('canvas');
  c.width = S.video.width; c.height = S.video.height;
  const g = c.getContext('2d', { alpha: false });
  const tDepart = v.currentTime;
  let visagesMax = S.autoFaces.length;
  let instantsAvecVisage = S.autoFaces.length ? 1 : 0;
  let vus = 1;
  let rates = 0;
  for (let i = 1; i <= instants; i++) {
    const t = Math.min(duree * (i / (instants + 1)), Math.max(0, duree - 0.1));
    onProgress && onProgress(i, instants);
    try {
      const r = await allerA(v, t, 4000);
      if (r !== 'positionné' && r !== 'déjà en place') { rates++; continue; }
      g.drawImage(v, 0, 0, c.width, c.height);
      const f = (await detecterImage(c)).visages;
      vus++;
      if (f.length) { instantsAvecVisage++; visagesMax = Math.max(visagesMax, f.length); }
    } catch (e) {  }
  }

  await allerA(v, tDepart, 3000);
  S.video.frame.getContext('2d').drawImage(v, 0, 0, S.video.width, S.video.height);
  return { instants: vus, instantsAvecVisage, visagesMax, rates, instantsDemandes: instants };
}


const view = $('view');
const vctx = view.getContext('2d');
let live = null;
let pending = false;

function zonesActives() {
  return [
    ...S.manual,
    ...(S.on.visages ? S.autoFaces : []),
  ];
}

function ouvrirEditeur() {
  $('retourPreuve').hidden = !S.exported;
  peindrePeremption();
  const estV = S.kind === 'video';
  $('scrubWrap').hidden = !estV;
  document.querySelector('.tool[data-tool="brush"]').hidden = estV;
  document.querySelector('.tools').classList.toggle('tools--trois', estV);
  if (estV) {
    S.tool = 'rect';
    document.querySelectorAll('.tool[data-tool]').forEach((b) => b.classList.toggle('is-on', b.dataset.tool === 'rect'));
    const fps = S.video.fps || 30;
    S.images = Math.max(1, Math.round((S.video.duration || 1) * fps));
    S.image = Math.min(S.images - 1, Math.round(0.3 * fps));
    $('scrub').max = String(POSITIONS() - 1);
    $('scrub').value = String(posDeImage(S.image));
    majTemps();
  } else {
    S.tool = 'brush';
    document.querySelectorAll('.tool[data-tool]').forEach((b) => b.classList.toggle('is-on', b.dataset.tool === 'brush'));
  }
  peindreVerdict();
  peindreAutos();
  peindreDetails();
  noteEdition();
  setScreen('edit');
  ajusterVue();
  status(estV ? `${S.video.width}×${S.video.height}` : `${S.meta.format} ${S.work.width}×${S.work.height}`);
}

function peindreVerdict() {
  const n = S.meta.identityCount || 0;
  const z = zonesActives().length;
  const quoi = S.kind === 'video' ? 'cette vidéo' : 'cette photo';


  const ailleurs = S.kind === 'video' && S.on.visages && S.sondage
    && S.sondage.instantsAvecVisage && !z ? S.sondage.instantsAvecVisage : 0;
  let titre;
  if (n && z) titre = `<b>${n}</b> donnée${n > 1 ? 's' : ''} à effacer,<br><b>${z}</b> zone${z > 1 ? 's' : ''} à flouter.`;
  else if (n && ailleurs) titre = `<b>${n}</b> donnée${n > 1 ? 's' : ''} à effacer,<br>des <b>visages</b> plus loin dans la vidéo.`;
  else if (n) titre = `<b>${n}</b> donnée${n > 1 ? 's' : ''} à effacer dans ${quoi}.`;
  else if (z) titre = `<b>${z}</b> zone${z > 1 ? 's' : ''} à flouter.`;
  else if (ailleurs) titre = `Des <b>visages</b> plus loin dans la vidéo, aucun sur cette image.`;
  else titre = `Rien trouvé dans ${quoi}.`;



  const sous = S.kind === 'video'
    ? 'Les visages sont cherchés sur chaque image à l\u2019export. Ce que tu traces au doigt suit son sujet.'
    : 'Le flou est écrit dans les pixels : il ne se défait pas.';
  const el = $('verdict');
  el.innerHTML = `${titre}<small>${sous}</small>`;












  el.style.display = 'none';
  void el.offsetHeight;
  el.style.display = '';
}

function peindreAutos() {
  const lignes = [];
  const ligne = (cle, libelle, liste) => {
    if (!liste.length) return;
    const on = S.on[cle];
    lignes.push(`<button class="auto" data-cle="${cle}" aria-pressed="${on}"><i></i><b>${liste.length} ${esc(libelle)}${liste.length > 1 ? 's' : ''}</b><span>${on ? 'à flouter' : 'ignoré'}</span></button>`);
  };


  ligne('visages', 'visage', S.autoFaces.filter((z) => z.source !== 'tete'));



  if (S.kind === 'video' && S.sondage && !S.autoFaces.length) {
    const on = S.on.visages;
    const quoi = S.sondage.instantsAvecVisage
      ? `visages vus sur ${S.sondage.instantsAvecVisage} des ${S.sondage.instants} instants sondés`
      : `aucun visage sur ${S.sondage.instants} instants sondés`;
    lignes.unshift(`<button class="auto" data-cle="visages" aria-pressed="${on}"><i></i><b>${quoi}</b><span>${on ? 'cherchés sur chaque image à l\u2019export' : 'ignorés'}</span></button>`);
  }





  if (S.kind === 'video' && S.video && S.aDuSon) {
    const on = S.on.voix;
    const quoi = peutDeformerLaVoix ? 'la voix' : 'le son';
    const etat = peutDeformerLaVoix
      ? (on ? 'déformée, toujours compréhensible' : 'telle quelle')
      : (on ? 'retiré — cet appareil ne sait pas déformer une voix' : 'tel quel');
    lignes.push(`<button class="auto" data-cle="voix" aria-pressed="${on}"><i></i><b>${quoi}</b><span>${esc(etat)}</span></button>`);
  }



































  if (S.kind && S.on.visages) {
    const on = S.on.tetes;
    lignes.push(`<button class="auto" data-cle="tetes" aria-pressed="${on}"><i></i><b>les gens de dos</b><span>${on ? (S.kind === 'video' ? 'leur t\u00eate est couverte aussi, de dos comme de profil \u2014 l\u2019export est plus long' : 'leur t\u00eate est couverte aussi, de dos comme de profil') : 'non couverts : seuls les visages de face sont vus'}</span></button>`);
  }








  if (S.kind && (S.on.visages || S.on.tetes || S.manual.length)) {
    const on = S.on.large !== false;
    lignes.push(`<button class="auto" data-cle="large" aria-pressed="${on}"><i></i><b>la zone floutée</b><span>${on ? 'toute la tête — cheveux et oreilles compris' : 'le visage seul — plus discret, mais la coupe reste reconnaissable'}</span></button>`);
  }
  $('autos').innerHTML = lignes.join('');
  $('autos').querySelectorAll('.auto').forEach((b) => {
    b.addEventListener('click', () => {
      const cle = b.dataset.cle;
      S.on[cle] = !S.on[cle];
      peindreAutos(); peindreVerdict(); rendre(); peindrePeremption();


      if (S.kind && (cle === 'tetes' || cle === 'large' || cle === 'visages')) {
        majApercu(cle !== 'large').then(() => { peindreAutos(); peindreVerdict(); rendre(); }, () => {});
      }
    });
  });
}

function peindreDetails() {
  const rows = [`<caption>lu dans le fichier, en local</caption>`];
  const champs = S.meta.fields || [];
  if (!champs.length) rows.push(`<tr data-risk="technique"><th>Métadonnées</th><td>aucune trouvée</td></tr>`);
  for (const f of champs) rows.push(`<tr data-risk="${f.risk}"><th>${esc(f.label)}</th><td>${esc(f.value)}</td></tr>`);
  if (S.meta.position) rows.push(`<tr data-risk="identite"><th>Précision du lieu</th><td>environ 1 m. Ce point suffit à retrouver une adresse.</td></tr>`);
  const blocs = S.kind === 'video'
    ? (S.meta.metaBoxes || []).map((b) => b.path).join(', ')
    : (S.meta.blocks || []).map((b) => b.kind).join(', ');
  rows.push(`<tr data-risk="technique"><th>Blocs présents</th><td>${esc(blocs || 'aucun')}</td></tr>`);
  if (S.kind === 'video') {
    const p = (S.meta.tracks || []).map((t) => `${t.codec} ${t.width}×${t.height}`).join(', ');
    rows.push(`<tr data-risk="technique"><th>Piste vidéo</th><td>${esc(p || '?')} · ${S.meta.duration || '?'} s</td></tr>`);
  } else if (S.work && S.work.scaled) {
    rows.push(`<tr data-risk="technique"><th>Résolution de travail</th><td>${S.work.width}×${S.work.height} (source ${S.work.sourceWidth}×${S.work.sourceHeight})</td></tr>`);
  }
  $('readout').innerHTML = rows.join('');
}
$('showDetails').addEventListener('click', () => {
  const sh = $('detailsSheet');
  sh.hidden = !sh.hidden;
  $('showDetails').querySelector('span').textContent = sh.hidden ? 'Ce qui a été trouvé' : 'Masquer le détail';
});

function source() { return S.kind === 'video' ? S.video.frame : S.work.canvas; }
function dims() { return S.kind === 'video' ? { w: S.video.width, h: S.video.height } : { w: S.work.width, h: S.work.height }; }











let sondeHauteur = null;
function hauteurStable() {
  try {
    if (!sondeHauteur) {
      sondeHauteur = document.createElement('div');
      sondeHauteur.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100lvh;visibility:hidden;pointer-events:none';
      document.body.appendChild(sondeHauteur);
    }
    const h = sondeHauteur.offsetHeight;
    if (h > 0) return h;
  } catch (e) {  }
  return window.innerHeight;
}

function ajusterVue() {
  const d = dims();
  const stage = $('stage');
  const maxW = stage.clientWidth - 2;






  const maxH = Math.round(hauteurStable() * (d.h > d.w ? 0.58 : 0.46));
  const r = Math.min(maxW / d.w, maxH / d.h, 1);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = Math.max(40, Math.floor(d.w * r));
  const cssH = Math.max(40, Math.floor(d.h * r));
  view.style.width = cssW + 'px';
  view.style.height = cssH + 'px';
  view.width = Math.round(cssW * dpr);
  view.height = Math.round(cssH * dpr);
  rendre();
}
let largeurVue = window.innerWidth;
window.addEventListener('resize', () => {
  if (body.dataset.screen !== 'edit') return;


  if (window.innerWidth === largeurVue) return;
  largeurVue = window.innerWidth;
  ajusterVue();
});

function rendre() {
  if (S.kind === 'photo') {
    S.engine.strokes = zonesActives();
  S.engine.elargi = S.on.large === false ? ELARGI_VISAGE : ELARGI_TETE;
    S.engine.composeInto(view, 1, live);
  } else {
    dessinerVideo();
  }
  if (live && live.type === 'rect') cadreLive();
}
function dessinerVideo() {
  const src = S.video.frame;
  const ctx = vctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(src, 0, 0, view.width, view.height);
  const k = view.width / S.video.width;
  const toutes = zonesActives().concat(live && live.type === 'rect' ? [live] : []);




  const plancher = Math.max(8, Math.round(Math.min(S.video.width, S.video.height) / 40));

















  const lot = [];




  const maintenant = tempsCourant();
  for (const src of toutes) {
    if (!src.final && src !== live && typeof src.t === 'number' && src.t > maintenant + 0.05) continue;


    for (const b of (src.final ? [src] : zonesPourMoteur(src))) {
      const zt = b.final ? b : zoneTete(b, S.on.large === false ? ELARGI_VISAGE : ELARGI_TETE);
      const r = Math.max(2, Math.round(rayonZone(zt, plancher) * k));
      const x = Math.round(Math.min(zt.x, zt.x + zt.w) * k);
      const y = Math.round(Math.min(zt.y, zt.y + zt.h) * k);
      const w = Math.round(Math.abs(zt.w) * k);
      const h = Math.round(Math.abs(zt.h) * k);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !(w >= 2) || !(h >= 2)) continue;
      lot.push({ x, y, w, h, r });
    }
  }

  flouterLot(ctx, view, lot);
}
function cadreLive() {
  const d = dims();
  const s = view.width / d.w;
  vctx.save(); vctx.setTransform(1, 0, 0, 1, 0, 0);
  vctx.strokeStyle = '#fff'; vctx.lineWidth = 1; vctx.setLineDash([4, 4]);
  vctx.strokeRect(live.x * s, live.y * s, live.w * s, live.h * s);
  vctx.restore();
}
function planifier() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => { pending = false; rendre(); });
}

function pointImage(ev) {
  const d = dims();
  const r = view.getBoundingClientRect();
  return { x: ((ev.clientX - r.left) / r.width) * d.w, y: ((ev.clientY - r.top) / r.height) * d.h };
}
view.addEventListener('pointerdown', (ev) => {
  if (!S.kind) return;
  view.setPointerCapture(ev.pointerId);
  const p = pointImage(ev);
  live = S.tool === 'rect'
    ? { type: 'rect', x: p.x, y: p.y, w: 0, h: 0 }
    : { type: 'brush', points: [p], radius: rayon() };
  planifier();
});
view.addEventListener('pointermove', (ev) => {
  if (!live) return;
  const p = pointImage(ev);
  if (live.type === 'rect') { live.w = p.x - live.x; live.h = p.y - live.y; }
  else live.points.push(p);
  planifier();
});
function finTrait() {
  if (!live) return;
  if (live.type === 'rect') {
    if (Math.abs(live.w) > 4 && Math.abs(live.h) > 4) {
      S.manual.push({
        type: 'rect',
        x: Math.round(Math.min(live.x, live.x + live.w)), y: Math.round(Math.min(live.y, live.y + live.h)),
        w: Math.round(Math.abs(live.w)), h: Math.round(Math.abs(live.h)),


        ...(S.kind === 'video' ? { suivi: S.suiviZones !== false, t: tempsCourant() } : {}),
      });
    }
  } else if (live.points.length) {



    S.manual.push({
      ...live,
      ...(S.kind === 'video' ? { suivi: S.suiviZones !== false, t: tempsCourant() } : {}),
    });
  }
  live = null;
  rendre(); peindreVerdict(); noteEdition();
}
view.addEventListener('pointerup', finTrait);
view.addEventListener('pointercancel', finTrait);
function rayon() { const d = dims(); return Math.max(6, Math.min(d.w, d.h) * 0.045); }


function tempsCourant() { return (S.image || 0) / (S.video && S.video.fps ? S.video.fps : 30); }
function majTemps() {
  const n = Number($('scrub').value || 0);
  $('timeVal').textContent = `${(S.image || 0) + 1} sur ${S.images} · ${tempsCourant().toFixed(2).replace('.', ',')} s`;
}

document.querySelectorAll('.tool[data-tool]').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.tool[data-tool]').forEach((o) => o.classList.toggle('is-on', o === b));
    S.tool = b.dataset.tool;
  });
});
$('undo').addEventListener('click', () => { S.manual.pop(); rendre(); peindreVerdict(); noteEdition(); });
$('clearAll').addEventListener('click', () => {



  S.manual = [];
  peindreAutos(); peindreVerdict(); rendre(); noteEdition();
});

















function flasher(html) {
  const f = $('editFlash');
  f.innerHTML = html || '';
  f.hidden = !html;
}

function dire(html, tenue = false) {
  if (S.noteTenue && !tenue) return;
  S.noteTenue = tenue ? html : null;
  flasher('');
  $('editNote').innerHTML = html;
}

function noteEdition() {



  peindrePeremption();
  const z = zonesActives().length;


  const suit = S.suiviZones !== false;
  const geste = S.kind === 'video'
    ? `<b>Trace un rectangle du doigt sur l\u2019image</b> pour flouter une zone de plus : ${suit ? 'elle suivra ce qu\u2019elle couvre' : 'elle restera au même endroit'} <b>\u00e0 partir d\u2019ici</b> et jusqu\u2019à la fin.`
    : '<b>Passe le doigt sur ce qui doit disparaître.</b> L\u2019outil Rectangle sert aux zones carrées.';
  const etat = z
    ? `${z} zone${z > 1 ? 's' : ''} marquée${z > 1 ? 's' : ''}, floutée${z > 1 ? 's' : ''} dans les pixels.`
    : 'Aucune zone marquée pour l\u2019instant.';
  dire(`${geste} ${etat}`);
}

let minuterieScrub = null;














const POSITIONS = () => Math.max(2, Math.min(S.images || 2, 600));
const imageDePos = (p) => Math.round((p * ((S.images || 1) - 1)) / (POSITIONS() - 1));
const posDeImage = (n) => Math.round((n * (POSITIONS() - 1)) / Math.max(1, (S.images || 1) - 1));









let viseeEnCours = false, visee = null;
async function viser(n) {
  visee = Math.max(0, Math.min((S.images || 1) - 1, n));
  if (viseeEnCours) return;
  viseeEnCours = true;
  try {
    while (visee !== null && visee !== S.image) {
      const but = visee; visee = null;
      S.image = but;
      $('scrub').value = String(posDeImage(but));
      await allerAImage(but);
    }
  } finally { viseeEnCours = false; visee = null; }
}
function pas(d) { viser((visee == null ? (S.image || 0) : visee) + d); }
$('prevImg').addEventListener('click', () => pas(-1));
$('nextImg').addEventListener('click', () => pas(1));

$('scrub').addEventListener('input', (e) => {
  if (S.kind !== 'video') return;
  viser(imageDePos(Number(e.target.value)));
});














let roue = 0;
const CRAN = 30;
function molette(e) {
  if (S.kind !== 'video' || !S.images) return;
  e.preventDefault();
  roue += e.deltaY;
  const crans = Math.trunc(roue / CRAN);
  if (!crans) return;
  roue -= crans * CRAN;
  pas(crans * (e.shiftKey ? 10 : 1));
}
view.addEventListener('wheel', molette, { passive: false });
$('scrubWrap').addEventListener('wheel', molette, { passive: false });

document.addEventListener('keydown', (e) => {
  if (document.body.dataset.screen !== 'edit' || S.kind !== 'video') return;
  const c = e.target;


  if (c && (c.isContentEditable || c.tagName === 'TEXTAREA'
    || (c.tagName === 'INPUT' && c.id !== 'scrub') || c.tagName === 'SELECT')) return;
  const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
  if (!d) return;
  e.preventDefault();
  pas(d * (e.shiftKey ? 10 : 1));
});

async function allerAImage(image) {
  const t = image / (S.video.fps || 30);
  majTemps();
  const v = S.video.el;















  const lent = setTimeout(() => flasher('Je me déplace dans la vidéo…'), 1200);
  const depart = performance.now();
  const place = await allerA(v, Math.min(t, (v.duration || t) - 0.05), 9000);
  const mis = Math.round(performance.now() - depart);
  clearTimeout(lent);
  flasher('');
  if (place !== 'positionné' && place !== 'déjà en place') {
    S.scrubImpossible = true;
    dire('<b>Cet appareil ne sait pas se déplacer dans cette vidéo.</b> L\u2019image reste la première, mais ça ne change rien à l\u2019export : les visages y sont cherchés image par image. Trace une zone au doigt si tu veux couvrir quelque chose partout.'
      + ` <span class="menu">(${place}, ${mis} ms · ${etatLecteur(v)})</span>`, true);
    return;
  }
  S.scrubImpossible = false;
  const g = S.video.frame.getContext('2d', { willReadFrequently: true });
  const avant = empreinteImage(g, S.video.width, S.video.height);













  let apres = avant;
  let essaisImage = 0;
  let secoue = false;
  const finImage = performance.now() + 1600;
  do {
    g.drawImage(v, 0, 0, S.video.width, S.video.height);
    apres = empreinteImage(g, S.video.width, S.video.height);
    if (apres !== avant) break;
    essaisImage++;


    if (essaisImage === 3 && !secoue) { secoue = true; await secouerParLecture(v, Math.min(t, (v.duration || t) - 0.05)); }
    await new Promise((r) => setTimeout(r, 120));
  } while (performance.now() < finImage);
  if (essaisImage) noter('aperçu redessiné', `${essaisImage} tentative${essaisImage > 1 ? 's' : ''} · ${apres !== avant ? 'image obtenue' : 'image inchangée'}`);






  if (avant === apres) {
    S.figees = (S.figees || 0) + 1;
    if (S.figees === 3) {
      noter('aperçu figé', `3 déplacements sans changement, dernière image ${image}`);



      dire('<b>Cet appareil ne redessine pas l\u2019aperçu.</b> Les déplacements réussissent mais l\u2019image ne change pas. Ça ne change rien à l\u2019export : les visages y sont cherchés image par image, et une zone tracée au doigt vaut du début à la fin.', true);
    }
  } else { S.figees = 0; S.noteTenue = null; }
  rendre();


  clearTimeout(minuterieScrub);
  minuterieScrub = setTimeout(redetecter, 180);
}






async function majApercu(chercher = true) {
  const video = S.kind === 'video';
  const toile = video ? S.video && S.video.frame : S.work && S.work.canvas;
  if (!toile) return;
  const tetes = !!(S.on.visages && S.on.tetes);
  if (chercher || !S.detApercu || (tetes && !S.detApercu.tetes && !S.detApercu.personnes)) {


    try {
      S.detApercu = await detecterImage(toile, { tetes, pixelsMax: video ? undefined : 7e6 });
      S.detectionEchec = null;
    } catch (e) {

      S.detectionEchec = String((e && e.message) || e).slice(0, 120);
      throw e;
    }
  }
  S.autoFaces = zonesDe(S.detApercu, { visageSeul: S.on.large === false });
}

async function redetecter() {
  if (S.kind !== 'video' || !S.video) return;








  try {
    await majApercu();
  } catch (e) {  }
  peindreAutos(); peindreVerdict(); rendre(); noteEdition();
}


$('doExport').addEventListener('click', exporter);

async function exporter() {
  try {
    if (S.kind === 'photo') {






      if (S.on.visages && S.detectionEchec) {
        throw new Error(`le détecteur de visages n\u2019a pas pu démarrer (${S.detectionEchec}). Les visages de cette photo ne seraient pas floutés : rien n\u2019est exporté. Recharge la page, ou décoche « visages » et trace-les au doigt.`);
      }
      veil('ré-encodage complet');
      S.engine.strokes = zonesActives();
  S.engine.elargi = S.on.large === false ? ELARGI_VISAGE : ELARGI_TETE;
      const plat = S.engine.flatten();
      const kind = S.meta.format === 'PNG' ? 'png' : 'jpeg';
      const res = await encode(plat, kind, 0.92);
      S.exported = res;
      S.exported.signature = signatureEdition();
      preuvePhoto(res, plat);
    } else {


      const zones = S.manual.flatMap((z) => zonesPourMoteur(z));
      const rien = !zones.length && !S.on.visages && !S.on.tetes;
      if (rien) {







        if (!inventaireMp4(S.buf).iso) {
          throw new Error('ce format vidéo n\u2019est pas pris en charge : seuls le MP4 et le MOV, ceux des téléphones, peuvent être nettoyés. Rien n\u2019est exporté.');
        }
        veil('nouveau fichier, sans métadonnées');
        const r = await recopierSansReencoder(S.buf);
        if (!r.ok) throw new Error(r.raison);
        const apres = scanVideo(r.buffer);
        const inv = inventaireMp4(r.buffer);
        noter('export sans réencodage', { images: r.images, codec: r.codec, audio: r.audio, rotation: r.rotation, inventaire: inv.propre ? 'propre' : inv.raison });
        if (!inv.propre) throw new Error(`le fichier produit contient encore ${inv.raison}. Rien n\u2019est exporté.`);
        const blob = new Blob([r.buffer], { type: 'video/mp4' });
        S.exported = { blob, name: nomAleatoire('mp4'), bytes: blob.size, check: apres, inventaire: inv,
                       clean: apres.identityCount === 0 && inv.propre, sansReencodage: true, signature: signatureEdition() };
        preuveVideo(S.exported);
      } else {
        veil('traitement image par image', 0);


        S.enTraitement = true;
        S.quitteePendant = false;
        $('diagRaison').hidden = true;
        const tenu = await garderEveille();
        const note = $('veilNote');
        note.hidden = false;
        note.textContent = tenu
          ? 'L\u2019écran restera allumé jusqu\u2019à la fin. Ne quitte pas cette page.'
          : 'Garde l\u2019écran allumé et reste sur cette page : si le téléphone se verrouille, le traitement s\u2019arrête et tout est à refaire.';
        S.detecteurVisages = null;
        noter('export vidéo lancé', { zones: zones.length, visages: S.on.visages, tetes: !!S.on.tetes, ecranTenu: tenu });
        const res = await blurVideo(S.buf, {
          maxFrames: 100000, zones, noDefaultZone: true,






































          detectEvery: 1,


          tetes: !!S.on.tetes,
          elargi: S.on.large === false ? ELARGI_VISAGE : ELARGI_TETE,
          visageSeul: S.on.large === false,
          diag: DIAGNOSTIC,
          faces: S.on.visages, audio: true,






          voix: S.on.voix && peutDeformerLaVoix ? 0.84 : null,
          audio: !(S.on.voix && !peutDeformerLaVoix),
          onProgress: (t) => veil(t),
          onDetecteur: (nom, secours) => {
            S.detecteurVisages = nom;
            noter('détecteur de visages', secours ? `${nom} — ${secours}` : nom);
          },
          onFrame: (n, total) => veil(S.detecteurVisages ? `traitement image par image · ${S.detecteurVisages}` : 'traitement image par image', total ? n / total : 0),
        });
        noter('résultat moteur', {
          ok: res.ok, etape: res.etape, images: res.images, encodees: res.encodees,
          visages: res.visagesSuivis, zonesAppliquees: res.zonesAppliquees,
          imagesSansFlou: res.imagesSansFlou, erreursDetection: res.erreursDetection,
          derniereErreurDetection: res.derniereErreurDetection,
          codec: res.codec, outCodec: res.outCodec, ips: res.imagesParSeconde,
          methodeFlou: res.methodeFlou, flouConstate: res.flouConstate, essaisFlou: res.essaisFlou,
          moteur: res.moteur, suivi: res.suivi, tetes: res.tetes, audio: res.audio, voix: res.voix, rotation: res.rotation,
          erreur: res.erreur, raison: res.raison,
        });
        if (!res.ok) {
          throw new Error(`${res.etape ? res.etape + ' : ' : ''}${res.raison || res.erreur || 'traitement impossible'}`);
        }
        const buf = await res.fichier.arrayBuffer();
        const apres = scanVideo(buf);



        const inv = inventaireMp4(buf);
        S.exported = {
          blob: res.fichier, name: nomAleatoire('mp4'), bytes: res.fichier.size,
          check: apres, inventaire: inv, clean: apres.identityCount === 0 && inv.propre, mesure: res,
        };
        S.exported.signature = signatureEdition();
        preuveVideo(S.exported);
      }
    }
    setScreen('done');
    status(`${(S.exported.bytes / 1048576).toFixed(1)} Mo`);
  } catch (err) {
    const message = String(err && err.message ? err.message : err);
    noter('export interrompu', message);


    const codec = /decoder failure|encoder failure|codec (is )?closed|reclaimed/i.test(message);
    const raison = $('diagRaison');
    raison.textContent = S.quitteePendant
      ? 'L\u2019export s\u2019est arrêté parce que l\u2019app a été quittée ou l\u2019écran s\u2019est verrouillé pendant le traitement. Relance « Nettoyer et exporter » et reste sur cette page jusqu\u2019à la fin.'
      : codec
        ? 'Le décodeur vidéo du téléphone s\u2019est arrêté. Ça arrive surtout quand on quitte l\u2019app ou que l\u2019écran se verrouille : relance l\u2019export en restant sur cette page. Si ça recommence, envoie ce journal.'
        : '';
    raison.hidden = !raison.textContent;
    montrerDiag();
  } finally {
    S.enTraitement = false;
    laisserDormir();
    veil(null);
  }
}

const HEX = '0123456789abcdef';
function nomAleatoire(ext) {
  const b = new Uint8Array(6); crypto.getRandomValues(b);
  let s = ''; for (const x of b) s += HEX[x >> 4] + HEX[x & 15];
  return `fichier-${s}.${ext}`;
}

function lignesAvantApres(avant, apres) {
  const rows = [`<caption>relu dans les octets du fichier produit</caption>`];
  rows.push(`<tr data-risk="technique"><th>Avant</th><td>${avant.identityCount || 0} donnée${(avant.identityCount || 0) > 1 ? 's' : ''} identifiante${(avant.identityCount || 0) > 1 ? 's' : ''}</td></tr>`);
  rows.push(`<tr data-risk="technique"><th>Après</th><td>${apres.identityCount || 0} donnée identifiante</td></tr>`);
  for (const f of (avant.fields || []).filter((x) => x.risk === 'identite').slice(0, 8)) {
    rows.push(`<tr data-risk="identite" data-struck><th>${esc(f.label)}</th><td>${esc(f.value)}</td></tr>`);
  }
  return rows;
}

function preuvePhoto(res, plat) {
  $('doneValue').textContent = String(res.check.identityCount);
  const rows = lignesAvantApres(S.meta, res.check);
  const z = zonesActives().length;
  rows.push(`<tr data-risk="technique"><th>Zones floutées</th><td>${z === 0 ? 'aucune' : `${z}, floutées et aplaties dans l’image`}</td></tr>`);
  rows.push(`<tr data-risk="technique"><th>Fichier</th><td>${esc(res.name)} · ${(res.bytes / 1024).toFixed(0)} ko</td></tr>`);
  $('proof').innerHTML = rows.join('');
  $('proofNote').textContent = res.clean
    ? 'Vérification faite sur le fichier exporté lui-même : la page a relu ses octets et n’y trouve aucun bloc identifiant. Ton fichier d’origine n’a pas été touché — garde-le : c’est lui qui fait preuve.'
    : 'Attention : la relecture trouve encore un bloc identifiant. Ne publie pas ce fichier.';
  $('doneVideo').hidden = true;
  const dv = $('doneView');
  dv.hidden = false;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const maxH = Math.round(window.innerHeight * 0.3);
  const r = Math.min(($('doneStage').clientWidth - 2) / plat.width, maxH / plat.height, 1);
  dv.style.width = Math.floor(plat.width * r) + 'px';
  dv.style.height = Math.floor(plat.height * r) + 'px';
  dv.width = Math.round(plat.width * r * dpr);
  dv.height = Math.round(plat.height * r * dpr);
  dv.getContext('2d').drawImage(plat, 0, 0, dv.width, dv.height);
}
















function peindrePassages() {  }









function peindreVerdictSon(res) {
  const el = $('verdictSon');
  const m = res.mesure;
  const v = m && m.voix;
  const aDuSon = !!(m && m.audio && m.audio.copie);
  let etat = 'protege';
  let texte;


  if (res.sansReencodage) {
    if (!S.aDuSon) { el.hidden = true; return; }
    el.dataset.etat = 'attention';
    el.innerHTML = '<b>Le son d’origine est conservé.</b> Seules les métadonnées ont été effacées. Si quelqu’un est reconnaissable à sa voix, reprends les corrections et active la protection du son.';
    el.hidden = false;
    return;
  }
  if (v && v.appliquee) {
    texte = '<b>Les voix sont déformées.</b> Le son a été réencodé : on comprend ce qui se dit, mais on ne reconnaît plus qui parle.';
  } else if (!aDuSon && S.on && S.on.voix) {
    texte = '<b>Le son a été retiré.</b> Cet appareil ne sait pas déformer une voix ; aucune voix ne sort avec ce fichier.';
  } else if (!aDuSon) {
    texte = '<b>Ce fichier n’a pas de son.</b>';
  } else {
    etat = 'attention';
    texte = '<b>Le son d’origine est conservé.</b> Les voix n’ont pas été touchées. Si quelqu’un est reconnaissable à sa voix, ou si un prénom est prononcé, reprends les corrections et active la protection du son avant de publier.';
  }
  el.dataset.etat = etat;
  el.innerHTML = texte;
  el.hidden = false;
}

function preuveVideo(res) {
  $('doneValue').textContent = String(res.check.identityCount || 0);
  peindreVerdictSon(res);
  const rows = lignesAvantApres(S.meta, res.check);
  if (res.inventaire) {
    const inv = res.inventaire;
    const n = (k, mot) => `${k} ${mot}${k > 1 ? 's' : ''}`;
    rows.push(`<tr data-risk="technique"><th>Contenu du fichier</th><td>${inv.propre
      ? `${n(inv.pistes.filter((h) => h === 'vide').length, 'piste')} d\u2019image, ${inv.pistes.includes('soun') ? '1 piste de son' : 'pas de son'}, aucun bloc de métadonnées`
      : esc(inv.raison)}</td></tr>`);
  }
  if (res.sansReencodage) {
    rows.push(`<tr data-risk="technique"><th>Méthode</th><td>nouveau fichier : image et son recopiés sans réencodage, rien d\u2019autre</td></tr>`);
  } else {
    const m = res.mesure;
    rows.push(`<tr data-risk="technique"><th>Images traitées</th><td>${m.images} décodées, ${m.encodees} réencodées · ${m.imagesParSeconde} i/s</td></tr>`);


    const suiviDit = m.suivi && m.suivi.zones
      ? ` (${m.suivi.zones} suivie${m.suivi.zones > 1 ? 's' : ''})`
      : '';
    const comble = m.suivi && m.suivi.visagesComblesParSuivi
      ? ` · ${m.suivi.visagesComblesParSuivi} visage${m.suivi.visagesComblesParSuivi > 1 ? 's' : ''} tenu${m.suivi.visagesComblesParSuivi > 1 ? 's' : ''} par le suivi`
      : '';
    rows.push(`<tr data-risk="technique"><th>Zones</th><td>${m.zones} au doigt${suiviDit}${m.visagesSuivis !== null ? ` · visages ${m.visagesSuivis}` : ''}${comble}</td></tr>`);








    if (m.tetes) {
      const t = m.tetes;
      const ou = t.delegue === 'CPU' ? ' · calculé sur le processeur, plus lent' : '';

      const secours = !!(t.detecteur && t.detecteur.startsWith('EfficientDet'));
      const par = secours ? `le détecteur de personnes, en secours${t.secours ? ` (${esc(t.secours)})` : ''}` : 'le détecteur de têtes';
      rows.push(`<tr data-risk="technique"><th>Gens de dos</th><td>${t.zonesAjoutees ? `${t.zonesAjoutees} tête${t.zonesAjoutees > 1 ? 's' : ''} trouvée${t.zonesAjoutees > 1 ? 's' : ''} par ${par}` : 'aucune tête trouvée'} · cherché une image sur ${t.uneImageSur}${ou}</td></tr>`);
    }
    if (m.imagesSansFlou) {
      rows.push(`<tr data-risk="identite"><th>Images sans aucun flou</th><td>${m.imagesSansFlou} sur ${m.images} : rien n\u2019a été détecté sur ces images. Trace une zone au doigt si un visage y apparaît.</td></tr>`);
    }
    const v = m.voix;
    let son;



    if (!(m.audio && m.audio.copie)) {
      son = (S.on && S.on.voix)
        ? 'son RETIRÉ, comme demandé : cet appareil ne sait pas déformer une voix'
        : 'perdu : ' + ((m.audio && m.audio.raison) || 'inconnu');
    }
    else if (v && v.appliquee) son = 'voix déformée, piste réencodée';
    else if (v && v.sonRetire) son = 'son RETIRÉ : la voix ne pouvait pas être déformée ici (' + (v.raison || 'raison inconnue') + ')';
    else if (v && v.demandee) son = 'voix NON déformée : ' + (v.raison || 'raison inconnue') + ' — son d’origine';
    else son = 'piste d’origine conservée';
    rows.push(`<tr data-risk="technique"><th>Son</th><td>${esc(son)}</td></tr>`);
  }
  rows.push(`<tr data-risk="technique"><th>Fichier</th><td>${esc(res.name)} · ${(res.bytes / 1048576).toFixed(1)} Mo</td></tr>`);
  $('proof').innerHTML = rows.join('');
  $('proofNote').textContent = res.clean
    ? 'Vérification faite sur le fichier exporté lui-même : la page a relu ses octets et n’y trouve aucune donnée identifiante. Ta vidéo d’origine n’a pas été touchée — garde-la : c’est elle qui fait preuve.'
    : 'Attention : la relecture trouve encore une donnée identifiante. Ne publie pas ce fichier.';
  $('doneView').hidden = true;
  peindrePassages(res);
  const dv = $('doneVideo');
  dv.hidden = false;


  dv.onloadedmetadata = () => {
    const maxH = Math.round(window.innerHeight * 0.34);
    const maxW = Math.max(80, $('doneStage').clientWidth - 2);
    const r = Math.min(maxW / dv.videoWidth, maxH / dv.videoHeight, 1);
    dv.style.width = Math.floor(dv.videoWidth * r) + 'px';
    dv.style.height = Math.floor(dv.videoHeight * r) + 'px';
  };
  dv.src = URL.createObjectURL(res.blob);
}

$('shareOut').addEventListener('click', async () => {
  if (!S.exported) return;

  if (exportPerime() && !confirm('Tes dernières corrections ne sont pas enregistrées dans ce fichier.\n\nPour les y mettre, relance « Nettoyer et exporter » : l\'image doit être refabriquée.\n\nEnregistrer quand même cette version-là ?')) {
    status('export à relancer');
    return;
  }
  try {
    const how = await share(S.exported.blob, S.exported.name);
    status(how === 'partage' ? 'transmis à la feuille de partage' : 'téléchargé');
  } catch { status('partage annulé'); }
});
$('again').addEventListener('click', () => {
  S.exported = null; S.kind = null;
  setScreen('start'); status('prêt');
});


window.__ztZones = () => zonesActives().length;
window.__ztDetections = () => ({
  visages: S.autoFaces.map((z) => [Math.round(z.x), Math.round(z.y)]),
});
window.__ztBlob = () => (S.exported ? S.exported.blob : null);
window.__ztEtat = () => ({
  kind: S.kind, ecran: body.dataset.screen,
  meta: S.meta ? S.meta.identityCount : null,
  visages: S.autoFaces.length,
  manuelles: S.manual.length, zones: zonesActives().length,
});


if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
    navigator.serviceWorker.ready.then(() => { $('offline').hidden = false; });
  });
}
