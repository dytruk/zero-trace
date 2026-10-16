


import { createFile, DataStream, MP4BoxBuffer } from '../vendor/mp4box/mp4box.all.mjs';
import { loadVideoDetector, loadHeadDetector, delegueDesTetes, prochainInstant } from './faces.js';
import { Moteur, zoneDeVisage, dessinerDiagnostic, POUR_BLAZEFACE } from './moteur2.js';
import { chargerYunet } from './yunet.js';
import { chargerTetes, PIXELS_TETES } from './tetes.js';
import { Piste, creerLecteur } from './suivi.js';
import { remuxPlat, lireMatrice, redressement, poserMatrice, lireConfigAudio, configAudioNue } from './mp4plat.js';
import { deformerPiste } from './voix.js';


const MARGE_SUIVI = 0.18;





function regrouper(images, fps) {
  const out = [];
  for (const n of images) {
    const d = out[out.length - 1];
    if (d && n - d.derniere <= Math.max(3, Math.round(fps / 4))) { d.derniere = n; d.images++; }
    else out.push({ premiere: n, derniere: n, images: 1 });
  }


  return out
    .filter((p) => p.images >= Math.max(2, Math.round(fps / 10)))
    .map((p) => ({ ...p, debut: Number((p.premiere / fps).toFixed(2)), duree: Number((p.images / fps).toFixed(2)) }))
    .sort((a, b) => b.images - a.images)
    .slice(0, 12);
}









function regrouperInstants(images, fps) {
  const out = [];
  const fenetre = Math.max(5, Math.round(fps * 0.75));
  for (const n of images) {
    const d = out[out.length - 1];
    if (d && n - d.derniere <= fenetre) { d.derniere = n; d.images++; }
    else out.push({ premiere: n, derniere: n, images: 1 });
  }
  return out
    .map((p) => ({
      ...p,
      debut: Number((p.premiere / fps).toFixed(2)),
      duree: Number((Math.max(1, p.derniere - p.premiere) / fps).toFixed(2)),
    }))
    .sort((a, b) => b.images - a.images)
    .slice(0, 12);
}


function plusProche(z, boites) {
  let best = null, bestR = 0.25;
  for (const b of boites) {
    const ix = Math.max(0, Math.min(z.x + z.w, b.x + b.w) - Math.max(z.x, b.x));
    const iy = Math.max(0, Math.min(z.y + z.h, b.y + b.h) - Math.max(z.y, b.y));
    const inter = ix * iy;
    if (!inter) continue;
    const r = inter / Math.min(z.w * z.h, b.w * b.h);
    if (r > bestR) { bestR = r; best = b; }
  }
  return best;
}
import { flouterLot, methodeFlou, zoneTete, rayonZone, ELARGI_TETE, ELARGI_VISAGE } from './flou.js';
export { zoneTete, rayonZone, ELARGI_TETE, ELARGI_VISAGE } from './flou.js';

function asMp4Buffer(buf) {
  try { if (MP4BoxBuffer && MP4BoxBuffer.fromArrayBuffer) return MP4BoxBuffer.fromArrayBuffer(buf, 0); } catch (e) {  }
  const b = buf.slice(0);
  b.fileStart = 0;
  return b;
}









function raisonMoteur(e) {
  const brut = String((e && e.message) || e || '');
  const horsLigne = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (horsLigne) return 'un fichier du moteur manque et cet appareil est hors ligne. Reconnecte-toi une fois : l\u2019outil le garde ensuite pour de bon.';
  if (!brut || brut === '[object Event]') return 'un fichier du moteur n\u2019a pas pu être chargé.';
  return brut;
}

export function descriptionFor(file, trackId) {
  const trak = file.getTrackById(trackId);
  for (const entry of trak.mdia.minf.stbl.stsd.entries) {
    const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
    if (box) {
      const s = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
      box.write(s);
      return new Uint8Array(s.buffer, 8);
    }
  }
  return null;
}

export function demux(buf, maxSamples = 100000) {
  return new Promise((resolve, reject) => {
    const file = createFile();
    const samples = [];
    const audioSamples = [];
    let info = null;
    let track = null;
    let audioTrack = null;
    file.onError = (e) => reject(new Error('démultiplexage : ' + e));
    file.onReady = (i) => {
      info = i;
      track = (i.videoTracks || [])[0];
      if (!track) { reject(new Error('aucune piste vidéo lisible')); return; }
      file.setExtractionOptions(track.id, 'video', { nbSamples: maxSamples });
      audioTrack = (i.audioTracks || [])[0] || null;
      if (audioTrack) file.setExtractionOptions(audioTrack.id, 'audio', { nbSamples: 1000000 });
      file.start();
    };
    file.onSamples = (id, user, list) => {
      const cible = user === 'audio' ? audioSamples : samples;
      for (const s of list) {
        cible.push({
          data: s.data, cts: s.cts, dts: s.dts, duration: s.duration,
          is_sync: s.is_sync, timescale: s.timescale,
        });
      }
    };
    try {
      file.appendBuffer(asMp4Buffer(buf));
      file.flush();
    } catch (e) { reject(e); return; }
    if (!track) { reject(new Error('fichier non reconnu comme MP4/MOV lisible')); return; }
    resolve({
      info, track, samples, audioTrack, audioSamples, file,
      description: descriptionFor(file, track.id),
    });
  });
}

function asArrayBuffer(d) {
  if (!d) return undefined;
  if (d instanceof ArrayBuffer) return d;
  return d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength);
}










function ajouterMehd(buffer, duree) {
  const u8 = new Uint8Array(buffer);
  const vue = new DataView(buffer);
  const type = (o) => String.fromCharCode(u8[o + 4], u8[o + 5], u8[o + 6], u8[o + 7]);
  const trouver = (debut, fin, nom) => {
    let o = debut;
    while (o + 8 <= fin) {
      const taille = vue.getUint32(o);
      if (taille < 8) return -1;
      if (type(o) === nom) return o;
      o += taille;
    }
    return -1;
  };
  const moov = trouver(0, u8.length, 'moov');
  if (moov < 0) return buffer;
  const finMoov = moov + vue.getUint32(moov);
  const mvex = trouver(moov + 8, finMoov, 'mvex');
  if (mvex < 0) return buffer;
  const finMvex = mvex + vue.getUint32(mvex);
  const mehd = trouver(mvex + 8, finMvex, 'mehd');
  if (mehd >= 0) { vue.setUint32(mehd + 12, Math.round(duree)); return buffer; }

  const sortie = new Uint8Array(u8.length + 16);
  const point = mvex + 8;
  sortie.set(u8.subarray(0, point), 0);
  const d = new DataView(sortie.buffer);
  d.setUint32(point, 16);
  sortie.set([0x6d, 0x65, 0x68, 0x64], point + 4);
  d.setUint32(point + 8, 0);
  d.setUint32(point + 12, Math.round(duree));
  sortie.set(u8.subarray(point), point + 16);
  d.setUint32(mvex, vue.getUint32(mvex) + 16);
  d.setUint32(moov, vue.getUint32(moov) + 16);
  return sortie.buffer;
}

export function muxerOut(width, height, kind = 'avc1', matrice = null) {








  const out = createFile();
  out.init({ timescale: 1000000, brands: kind === 'avc1' ? ['isom', 'iso2', 'avc1', 'mp41'] : ['isom', 'iso2', 'mp41'] });
  try { out.ftyp.minor_version = 512; } catch (e) {  }
  let trackId = null;
  let lastEnd = 0;
  let audioId = null;
  let audioEnd = 0;
  let audioFile = null;
  let enAttente = null;
  let infoAudio = { copie: false, raison: 'non demandé' };
  return {
    add(chunk, meta, fps) {
      if (trackId === null || trackId === undefined) {
        const desc = asArrayBuffer(meta && meta.decoderConfig && meta.decoderConfig.description);
        const opts = { type: kind, timescale: 1000000, width, height, language: 'und', name: 'VideoHandler' };
        if (kind === 'avc1') opts.avcDecoderConfigRecord = desc;
        else opts.hevcDecoderConfigRecord = desc;
        trackId = out.addTrack(opts);
        if (trackId === undefined || trackId === null) throw new Error('piste de sortie refusée par le multiplexeur (' + kind + ')');
      }
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      const dur = chunk.duration || Math.round(1000000 / (fps || 30));



      out.addSample(trackId, data, {
        duration: dur, dts: chunk.dts !== undefined ? chunk.dts : chunk.timestamp, cts: chunk.timestamp,
        is_sync: chunk.type === 'key',
      });
      lastEnd = Math.max(lastEnd, chunk.timestamp + dur);
    },









    preparerAudio(at, samples, srcFile) {
      if (!at || !samples || !samples.length) return (infoAudio = { copie: false, raison: 'aucune piste audio' });
      if (!/^mp4a/.test(at.codec || '')) return (infoAudio = { copie: false, raison: `audio en ${at.codec}, non recopiable tel quel` });
      enAttente = { at, samples, srcFile };
      return (infoAudio = { copie: true, echantillons: samples.length, config: null, codec: at.codec });
    },


    _creerAudio() {
      const { at, samples, srcFile } = enAttente;
      enAttente = null;
      audioId = out.addTrack({
        type: 'mp4a', hdlr: 'soun', language: 'und', name: 'SoundHandler',
        timescale: at.timescale,
        channel_count: at.audio.channel_count,
        samplerate: at.audio.sample_rate,
        samplesize: at.audio.sample_size,
      });
      if (audioId === undefined || audioId === null) { infoAudio = { copie: false, raison: 'piste audio refusée par le multiplexeur' }; return; }

      let config = false;
      try {
        const src = srcFile.getTrackById(at.id).mdia.minf.stbl.stsd.entries[0];
        const dst = out.getTrackById(audioId).mdia.minf.stbl.stsd.entries[0];
        if (src && src.esds && dst) { dst.addBox(src.esds); config = true; }
      } catch (e) {  }
      audioFile = { samples, i: 0, timescale: at.timescale };
      infoAudio = { copie: true, echantillons: samples.length, config, codec: at.codec };
    },


    audioJusqua(tsMicro) {


      if (enAttente && trackId !== null && trackId !== undefined) this._creerAudio();
      if (!audioFile || audioId === null || audioId === undefined) return;
      const limite = (tsMicro / 1000000) * audioFile.timescale;
      while (audioFile.i < audioFile.samples.length && audioFile.samples[audioFile.i].cts <= limite) {
        const s = audioFile.samples[audioFile.i++];
        out.addSample(audioId, s.data, {
          duration: s.duration, dts: s.dts, cts: s.cts, is_sync: s.is_sync !== false,
        });
        audioEnd = Math.max(audioEnd, s.cts + s.duration);
      }
    },


    finirAudio() {
      this.audioJusqua(Number.MAX_SAFE_INTEGER / 2);
      return infoAudio;
    },

    finish() {


      try {
        const trak = out.getTrackById(trackId);
        if (trak) {
          trak.mdia.mdhd.duration = lastEnd;
          trak.tkhd.duration = lastEnd;
        }
        if (audioId !== null && audioId !== undefined) {
          const at = out.getTrackById(audioId);
          if (at) { at.mdia.mdhd.duration = audioEnd; at.tkhd.duration = lastEnd; }
        }
        if (out.moov && out.moov.mvhd) out.moov.mvhd.duration = lastEnd;
      } catch (e) {  }
      let raw, via;
      if (typeof out.getBuffer === 'function') { raw = out.getBuffer(); via = 'getBuffer'; }
      else {
        const s = new DataStream();
        s.endianness = DataStream.BIG_ENDIAN;
        out.write(s);
        raw = s; via = 'write';
      }
      let buffer = raw instanceof ArrayBuffer ? raw : (raw.buffer instanceof ArrayBuffer ? raw.buffer : raw.buffer.buffer);


      let plat = false;
      try {
        const b2 = remuxPlat(buffer);
        if (b2 && b2.byteLength > 1024) { buffer = b2; plat = true; }
      } catch (e) {  }
      if (!plat) {
        try { buffer = ajouterMehd(buffer, lastEnd); } catch (e) {  }
      }


      let tournee = false;
      try { tournee = poserMatrice(buffer, matrice); } catch (e) {  }
      return { buffer, via, plat, tournee };
    },
  };
}

const CANDIDATS = [
  'avc1.640034',
  'avc1.640033',
  'avc1.640032',
  'avc1.64002A',
  'avc1.640028',
  'avc1.42E01E',
  'hvc1.1.6.L150.B0',
  'vp09.00.10.08',
];

export async function choisirEncodeur(width, height, fps, opts = {}) {
  const liste = opts.outCodec ? [opts.outCodec, ...CANDIDATS] : CANDIDATS;
  for (const codec of liste) {
    try {
      const r = await VideoEncoder.isConfigSupported({
        codec, width, height, bitrate: opts.bitrate || 6000000, framerate: fps,
      });
      if (r.supported) return codec;
    } catch (e) {  }
  }
  return null;
}









function floutageEffectif(ctx, zone) {
  const n = 8;
  const cx = Math.round(zone.x + zone.w / 2 - n / 2);
  const cy = Math.round(zone.y + zone.h / 2 - n / 2);
  if (cx < 0 || cy < 0) return null;
  try { return ctx.getImageData(cx, cy, n, n).data.slice(); } catch (e) { return null; }
}
function memesPixels(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let ecart = 0;
  for (let i = 0; i < a.length; i++) ecart += Math.abs(a[i] - b[i]);
  return ecart <= a.length;
}




export async function blurVideo(buf, opts = {}) {
  const t0 = performance.now();
  const { track, samples, description, audioTrack, audioSamples, file: srcFile } = await demux(buf, opts.maxFrames || 150);
  const tDemux = performance.now() - t0;





  const largeurEnregistree = track.track_width || track.video.width;
  const hauteurEnregistree = track.track_height || track.video.height;


















  let matriceSource = null;
  try { matriceSource = lireMatrice(buf); } catch (e) {  }
  const redresse = redressement(matriceSource, largeurEnregistree, hauteurEnregistree);
  const width = redresse ? redresse.largeur : largeurEnregistree;
  const height = redresse ? redresse.hauteur : hauteurEnregistree;
  const fps = Math.round((track.nb_samples / (track.duration / track.timescale)) || 30);


  const plafond = opts.plafondImages || 36000;
  if (samples.length >= plafond) {
    return { ok: false, etape: 'longueur', codec: track.codec, width, height, fps,
             raison: `cette vidéo fait ${samples.length} images : trop long pour être traité d\u2019un bloc en mémoire. Découpe-la en morceaux de moins de ${Math.round(plafond / 60)} minutes.`,
             tDemux };
  }

  if (opts.limiteImages && samples.length > opts.limiteImages) samples.length = opts.limiteImages;

  const decodeSupport = await VideoDecoder.isConfigSupported({
    codec: track.codec, codedWidth: largeurEnregistree, codedHeight: hauteurEnregistree, description,
  }).catch((e) => ({ supported: false, raison: String(e.message || e) }));
  if (!decodeSupport.supported) {
    return { ok: false, etape: 'décodage', codec: track.codec, width, height, fps,
             raison: decodeSupport.raison || 'configuration refusée par le navigateur', tDemux };
  }






  const debitSource = Number(track.bitrate) || 0;
  const debitParPixel = Math.round(width * height * fps * 0.08);
  const bitrate = opts.bitrate
    || Math.max(400000, Math.min(24000000, debitSource ? Math.round(debitSource * 1.3) : debitParPixel));

  const outCodec = await choisirEncodeur(width, height, fps, { ...opts, bitrate });
  if (!outCodec) {
    return { ok: false, etape: 'encodage', codec: track.codec, outCodec: null, width, height, fps,
             raison: `aucun encodeur de cet appareil n\u2019accepte une image de ${width}×${height}`, tDemux };
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false });

  const zones = (opts.zones && opts.zones.length)
    ? opts.zones
    : (opts.noDefaultZone ? [] : [{ x: Math.round(width * 0.3), y: Math.round(height * 0.3), w: Math.round(width * 0.4), h: Math.round(height * 0.4) }]);


  const fixes = zones.filter((z) => !z.suivi);
  const pistes = zones.filter((z) => z.suivi).map((z) => {




    const p = new Piste(z, {
      depart: Math.max(0, Math.round((z.t || 0) * fps)),
      minSuivi: Math.round(Math.max(width, height) * 0.15),
    });
    p.initiale = { x: z.x, y: z.y, w: z.w, h: z.h };
    return p;
  });
  const lec = (pistes.length || opts.faces || opts.tetes) ? creerLecteur(width, height, 320) : null;
  let lecImage = -1;
  let recalages = 0;
  let ancrees = 0;
  let imagesAncrees = 0;
  let decrochages = 0;
  let appelsLocaux = 0, tLocalSum = 0;
  const interBoites = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const placerSurPersonne = (l) => ({
    x: Math.round(l.boite.x + l.rel[0] * l.boite.w), y: Math.round(l.boite.y + l.rel[1] * l.boite.h),
    w: Math.round(l.rel[2] * l.boite.w), h: Math.round(l.rel[3] * l.boite.h),
  });
  let suiviPerdues = 0;
  let suiviDeplace = 0;
  let tSuiviSum = 0;



















  const block = opts.block || Math.max(8, Math.round(Math.min(width, height) / 40));


  const elargi = opts.elargi || ELARGI_TETE;







  let detector = null;
  let detecteurVisages = null;
  let secoursVisages = null;
  if (opts.faces) {
    try {
      const y = await chargerYunet({ onProgress: opts.onProgress });




      await y.detecter(new OffscreenCanvas(width, height));
      detector = y;
      detecteurVisages = y.moteur;
    } catch (e) {
      secoursVisages = raisonMoteur(e);
      try {
        const bf = await loadVideoDetector(opts.onProgress);
        detector = {
          detecter: async (toile) => (bf.detectForVideo(toile, prochainInstant()).detections || [])
            .map((d) => d.boundingBox).filter(Boolean)
            .map((b) => ({ x: b.originX, y: b.originY, w: b.width, h: b.height })),
        };
        detecteurVisages = 'BlazeFace (secours)';
      } catch (e2) {
        return { ok: false, etape: 'détection des visages', codec: track.codec, width, height, fps,
                 raison: 'le détecteur de visages n\u2019a pas pu démarrer — ' + raisonMoteur(e2), tDemux };
      }
    }
  }














  if (opts.onDetecteur && detecteurVisages) opts.onDetecteur(detecteurVisages, secoursVisages);
  let yolox = null;
  let detPersonnes = null;
  let detecteurTetes = null;
  let secoursTetes = null;
  let tetesVues = 0;
  let tTetesSum = 0;
  let appelsTetes = 0;

  const tetesToutesLes = Math.max(1, opts.tetesToutesLes || 3);



  let secoursAncrage = null;
  if (opts.tetes || pistes.length) {
    try {
      const t = await chargerTetes({ onProgress: opts.onProgress });


      await t.detecter(new OffscreenCanvas(width, height));
      yolox = t;
      detecteurTetes = t.moteur;
    } catch (e) {
      secoursTetes = raisonMoteur(e);
      try {
        detPersonnes = await loadHeadDetector('VIDEO', opts.onProgress);
        detecteurTetes = 'EfficientDet (secours)';
      } catch (e2) {
        if (opts.tetes) {
          return { ok: false, etape: 'détection des têtes', codec: track.codec, width, height, fps,
                   raison: 'le détecteur de têtes n\u2019a pas pu démarrer — ' + raisonMoteur(e2), tDemux };
        }
        secoursAncrage = raisonMoteur(e2);
      }
    }
  }
  const tailleTetes = yolox
    ? (() => { const k = Math.min(1, Math.sqrt(PIXELS_TETES / (width * height))); return Math.round(width * k) + 'x' + Math.round(height * k); })()
    : null;







  const tetesLong = opts.tetesLongEdge || 512;
  const tetesScale = Math.min(1, tetesLong / Math.max(width, height));
  const tetesCanvas = detPersonnes && tetesScale < 1
    ? new OffscreenCanvas(Math.round(width * tetesScale), Math.round(height * tetesScale))
    : null;
  const tetesCtx = tetesCanvas ? tetesCanvas.getContext('2d', { alpha: false }) : null;
  const invTetes = tetesScale < 1 ? 1 / tetesScale : 1;


  const COTE_LOCAL = 384;
  const cadreLocal = pistes.length ? new OffscreenCanvas(COTE_LOCAL, COTE_LOCAL) : null;
  const cadreCtx = cadreLocal ? cadreLocal.getContext('2d', { alpha: false }) : null;
  async function personnesAutour(z) {
    const c = Math.max(256, Math.max(z.w, z.h) * 2.2);
    const rw = Math.min(c, width), rh = Math.min(c, height);
    const rx = Math.max(0, Math.min(width - rw, z.x + z.w / 2 - rw / 2));
    const ry = Math.max(0, Math.min(height - rh, z.y + z.h / 2 - rh / 2));
    const k = COTE_LOCAL / Math.max(rw, rh);

    cadreCtx.fillStyle = yolox ? 'rgb(114,114,114)' : '#000';
    cadreCtx.fillRect(0, 0, COTE_LOCAL, COTE_LOCAL);
    cadreCtx.drawImage(canvas, rx, ry, rw, rh, 0, 0, rw * k, rh * k);
    appelsLocaux++;
    const remettre = (b) => ({ x: rx + b.x / k, y: ry + b.y / k, w: b.w / k, h: b.h / k });
    if (yolox) {


      const r = await yolox.detecter(cadreLocal, Infinity);
      return r.tete.concat(r.corps).map(remettre);
    }
    const r = detPersonnes.detectForVideo(cadreLocal, prochainInstant());
    return (r.detections || []).map((d) => d.boundingBox).filter(Boolean)
      .map((b) => remettre({ x: b.originX, y: b.originY, w: b.width, h: b.height }));
  }
  let visagesVus = 0;
  let essaisFlou = 0;
  let flouConstate = false;
  let zonesAppliquees = 0;
  let zonesMoteurAppliquees = 0;
  let imagesSansFlou = 0;
  const imagesNues = [];
  let tDetectSum = 0;



  const detectEvery = Math.max(1, opts.detectEvery || 3);









  const periodeVisages = detectEvery * (detecteurVisages && detecteurVisages.startsWith('YuNet') ? 2 : 1);

  const periodeTetes = tetesToutesLes * detectEvery;
  const moteur = new Moteur({
    largeur: width, hauteur: height, fps,
    visageSeul: opts.visageSeul !== undefined ? !!opts.visageSeul : elargi <= ELARGI_VISAGE,
    periodeTetes,
    periodeVisages,

    reglages: detecteurVisages === 'BlazeFace (secours)' ? POUR_BLAZEFACE : null,
  });
  let coupes = 0;
  let derniereCoupe = -100000;
  const pertes = [];
  let erreursDetection = 0;
  let derniereErreurDetection = null;
  let detections = 0;

  const mux = muxerOut(width, height, outCodec.startsWith('hvc') || outCodec.startsWith('hev') ? 'hvc1' : 'avc1', redresse ? null : matriceSource);











  let infoVoix = { demandee: !!opts.voix, appliquee: false, raison: opts.voix ? null : 'non demandée' };
  let samplesAudio = audioSamples;
  if (opts.audio !== false && opts.voix && audioTrack && audioSamples && audioSamples.length) {
    try {
      const asc = lireConfigAudio(buf);
      if (!asc) infoVoix.raison = 'configuration audio illisible';
      else {
        const r = await deformerPiste(audioTrack, audioSamples, asc, opts.voix, opts.onProgress);
        if (!r) infoVoix.raison = 'ce navigateur ne sait pas réencoder le son';
        else {


          const neuve = configAudioNue(r.config && r.config.description ? new Uint8Array(r.config.description) : null);







          const pareille = neuve && neuve.length >= 2 && neuve[0] === asc[0] && neuve[1] === asc[1];
          if (!pareille) {


            const hex = (u) => (u ? [...u].map((o) => o.toString(16).padStart(2, '0')).join(' ') : 'aucune');
            infoVoix.raison = `configuration audio différente — source ${hex(asc)}, réencodage ${hex(neuve)}`;
          }
          else {
            const ech = audioTrack.timescale;
            samplesAudio = r.paquets.map((c) => {
              const d = new Uint8Array(c.byteLength); c.copyTo(d);
              const cts = Math.round((c.timestamp / 1000000) * ech);
              return { data: d, cts, dts: cts, duration: Math.round(((c.duration || 21333) / 1000000) * ech), is_sync: true, timescale: ech };
            });
            infoVoix = { demandee: true, appliquee: true, facteur: opts.voix, paquets: samplesAudio.length };
          }
        }
      }
    } catch (e) { infoVoix.raison = 'voix non déformée : ' + String(e.message || e).slice(0, 60); }
  }









  const sonRetire = !!opts.voix && !infoVoix.appliquee && !!audioTrack && !!(audioSamples && audioSamples.length);
  if (sonRetire) infoVoix.sonRetire = true;
  if (opts.audio !== false && !sonRetire) {
    try { mux.preparerAudio(audioTrack, samplesAudio, srcFile); }
    catch (e) {  }
  }

  let decoded = 0, encoded = 0, muxErr = null;
  let tDecodeSum = 0, tTrameSum = 0, tFlouSum = 0;


  let tCopieSum = 0, tLectureSum = 0;

  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      encoded++;
      try { mux.add(chunk, meta, fps); } catch (e) { muxErr = String(e.message || e); }
    },
    error: (e) => { muxErr = 'encodeur : ' + String(e.message || e); },
  });
  encoder.configure({
    codec: outCodec, width, height, bitrate,
    framerate: fps, latencyMode: 'quality',
  });



  let chaine = Promise.resolve();

  async function traiterTrame(frame) {
      const tf = performance.now();
      const tcp = performance.now();
      if (redresse) {
        ctx.setTransform(...redresse.transformation);
        ctx.drawImage(frame, 0, 0, largeurEnregistree, hauteurEnregistree);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      } else {
        ctx.drawImage(frame, 0, 0, width, height);
      }
      tCopieSum += performance.now() - tcp;
      const ts = frame.timestamp;
      frame.close();


      let zonesDuMoment = fixes;
      const suivies = [];


      const lire = () => { if (lecImage !== decoded) { lec.rafraichir(canvas); lecImage = decoded; } return lec; };
      if (pistes.length) {
        const tsu = performance.now();
        lire();
        zonesDuMoment = fixes.slice();
        for (const p of pistes) {












          if (decoded < p.depart) continue;

          if (p.local) { suivies.push({ p, z: null }); continue; }
          if (decoded === p.depart || !p.gabarit) {
            p.amorcer(lire());
            suivies.push({ p, z: p.vue() });
            continue;
          }
          const z = p.avancer(lire(), width, height);













          if (p.abandon) {
            if (!p.signale) {
              p.signale = true;
              if (pertes.length < 4000) pertes.push(decoded);
            }
            continue;
          }
          if (p.perdu) suiviPerdues++; else suiviDeplace += p.deplacement;
          suivies.push({ p, z });
        }
        tSuiviSum += performance.now() - tsu;
      }
      if ((detector || yolox || detPersonnes) && lec) { const tlu = performance.now(); lire(); tLectureSum += performance.now() - tlu; }



      if ((detector || yolox || detPersonnes) && lec && lecImage === decoded && lec.rupture) {
        moteur.coupe(decoded);
        coupes++;
        derniereCoupe = decoded;
      }






      let visagesFrais = [];
      if (detector && decoded % periodeVisages === 0) {
        const td0 = performance.now();
        try {
          visagesFrais = await detector.detecter(canvas);
          detections++;
          visagesVus += visagesFrais.length;
          moteur.visages(visagesFrais, decoded);
        } catch (e) {
          erreursDetection++;
          derniereErreurDetection = e && e.message ? e.message : String(e);
        }
        tDetectSum += performance.now() - td0;
      }


      if ((yolox || detPersonnes) && opts.tetes && decoded % periodeTetes === 0) {
        const tt0 = performance.now();
        try {
          appelsTetes++;
          if (yolox) {
            const r = await yolox.detecter(canvas);
            tetesVues += r.tete.length;
            moteur.tetesEtCorps(r.tete, r.corps, decoded);
          } else {
            let cible = canvas, facteur = 1;
            if (tetesCanvas) {
              tetesCtx.drawImage(canvas, 0, 0, tetesCanvas.width, tetesCanvas.height);
              cible = tetesCanvas;
              facteur = invTetes;
            }
            const ro = detPersonnes.detectForVideo(cible, prochainInstant());
            const gens = (ro.detections || []).map((d) => d.boundingBox).filter(Boolean)
              .map((b) => ({ x: b.originX * facteur, y: b.originY * facteur, w: b.width * facteur, h: b.height * facteur }));
            tetesVues += gens.length;
            moteur.personnes(gens, decoded);
          }
        } catch (e) {
          erreursDetection++;
          derniereErreurDetection = 'têtes : ' + (e && e.message ? e.message : String(e));
        }
        tTetesSum += performance.now() - tt0;
      }
      const zonesMoteur = (detector || yolox || detPersonnes) ? moteur.zones(decoded) : [];



























      if (suivies.length && (yolox || detPersonnes)) {
        const passage = decoded % periodeTetes === 0;
        for (const su of suivies) {
          const p = su.p;
          const zc = p.local ? placerSurPersonne(p.local) : su.z;
          if (passage && zc && !p.sansLocal) {
            const tl0 = performance.now();
            let gens = [];
            try { gens = await personnesAutour(zc); } catch (e) { gens = []; }
            tLocalSum += performance.now() - tl0;
            if (!p.local) {
              p.essaisLocal = (p.essaisLocal || 0) + 1;
















              let mieux = null, score = 0;
              for (const b of gens) {
                const i = interBoites(zc, b);
                if (Math.max(i / Math.max(1, zc.w * zc.h), i / Math.max(1, b.w * b.h)) < 0.5) continue;
                const sc = i / Math.max(1, zc.w * zc.h + b.w * b.h - i);
                if (sc > score) { score = sc; mieux = b; }
              }
              if (mieux) {
                p.local = { boite: mieux, rates: 0,
                            rel: [(zc.x - mieux.x) / mieux.w, (zc.y - mieux.y) / mieux.h, zc.w / mieux.w, zc.h / mieux.h] };
                ancrees++;
              } else if (p.essaisLocal >= 3) {
                p.sansLocal = true;
              }
            } else {
              const prev = p.local.boite;
              let mieux = null, s0 = 0;
              for (const b of gens) {
                const proche = Math.hypot(b.x + b.w / 2 - prev.x - prev.w / 2, b.y + b.h / 2 - prev.y - prev.h / 2) < 0.5 * Math.max(prev.w, prev.h);
                const sc = interBoites(prev, b) / Math.max(1, prev.w * prev.h + b.w * b.h - interBoites(prev, b)) + (proche ? 0.2 : 0);
                if (sc > s0) { s0 = sc; mieux = b; }
              }
              if (mieux && s0 >= 0.25) {

                p.local.boite = {
                  x: 0.7 * mieux.x + 0.3 * prev.x, y: 0.7 * mieux.y + 0.3 * prev.y,
                  w: 0.4 * mieux.w + 0.6 * prev.w, h: 0.4 * mieux.h + 0.6 * prev.h,
                };
                p.local.rates = 0;
              } else if (++p.local.rates >= 3) {
                const z = placerSurPersonne(p.local);
                p.local = null; p.sansLocal = true;
                p.recaler(z, lire()); su.z = p.vue();
                decrochages++;
              }
            }
          }
          if (p.local) { su.z = placerSurPersonne(p.local); imagesAncrees++; }
        }
      }
      for (const su of suivies) {
        if (!su.z) continue;
        if (!su.avant && !su.p.local && visagesFrais.length) {
          const b = plusProche(su.z, visagesFrais.map((v) => zoneDeVisage(v, true, moteur.r)));
          if (b) { su.p.recaler(b, lire()); su.z = su.p.vue(); recalages++; }
        }


        const mx = su.z.w * MARGE_SUIVI, my = su.z.h * MARGE_SUIVI;
        zonesDuMoment.push({
          x: Math.max(0, Math.round(su.z.x - mx)), y: Math.max(0, Math.round(su.z.y - my)),
          w: Math.round(su.z.w + mx * 2), h: Math.round(su.z.h + my * 2),
        });
      }
      if (opts.onZones) opts.onZones(decoded, zonesDuMoment, zonesMoteur);






      const zonesDoigt = zonesDuMoment.map((z) => zoneTete(z, elargi));
      const aFlouter = zonesMoteur.map((z) => ({ x: z.x, y: z.y, w: z.w, h: z.h, r: rayonZone(z, block) }))
        .concat(zonesDoigt.map((z) => ({ ...z, r: rayonZone(z, block) })));

      const temoins = [];
      for (const z of aFlouter) {
        if (essaisFlou + temoins.length >= 6) break;
        const a = floutageEffectif(ctx, z);
        if (a) temoins.push([z, a]);
      }
      const tfl = performance.now();
      flouterLot(ctx, canvas, aFlouter);
      tFlouSum += performance.now() - tfl;
      for (const [z, a] of temoins) {
        essaisFlou++;
        if (!memesPixels(a, floutageEffectif(ctx, z))) flouConstate = true;
      }
      zonesMoteurAppliquees += zonesMoteur.length;
      zonesAppliquees += zonesDoigt.length;
      if (opts.diag) {
        dessinerDiagnostic(ctx, zonesMoteur.concat(zonesDoigt.map((z) => ({ ...z, source: 'doigt', tenue: false }))), width);
      }
      const couvertes = zonesDuMoment.length + zonesMoteur.length;
      if (couvertes === 0) {
        imagesSansFlou++;



        if (imagesNues.length < 4000) imagesNues.push(decoded);
      }
      tTrameSum += performance.now() - tf;
      const out = new VideoFrame(canvas, { timestamp: ts, duration: Math.round(1000000 / fps) });
      encoder.encode(out, { keyFrame: decoded % (opts.gop || 60) === 0 });
      out.close();


      try { mux.audioJusqua(ts); } catch (e) {  }
      decoded++;
      if (opts.onFrame && decoded % 5 === 0) opts.onFrame(decoded, samples.length);
  }

  const decoder = new VideoDecoder({
    output: (frame) => {
      chaine = chaine.then(() => traiterTrame(frame)).catch((e) => { muxErr = muxErr || String(e.message || e); });
    },
    error: (e) => { muxErr = 'décodeur : ' + String(e.message || e); },
  });
  decoder.configure({ codec: track.codec, codedWidth: largeurEnregistree, codedHeight: hauteurEnregistree, description });

  const tDec = performance.now();
  let pousse = 0;
  for (const s of samples) {
    decoder.decode(new EncodedVideoChunk({
      type: s.is_sync ? 'key' : 'delta',
      timestamp: Math.round((s.cts * 1000000) / s.timescale),
      duration: Math.round((s.duration * 1000000) / s.timescale),
      data: s.data,
    }));

    if (++pousse % 12 === 0) await chaine;
  }
  await decoder.flush();
  await chaine;
  tDecodeSum = performance.now() - tDec;
  await encoder.flush();
  decoder.close();
  encoder.close();








  const detectionMorte = opts.faces && erreursDetection > 0 && visagesVus === 0;
  const rienAFaire = (opts.faces || opts.tetes) && erreursDetection === 0 && visagesVus === 0 && tetesVues === 0 && !zones.length;





  const rienFloute = zonesMoteurAppliquees === 0 && zonesAppliquees === 0;



  const flouSansEffet = essaisFlou > 0 && !flouConstate;
  if (detectionMorte || rienAFaire || rienFloute || flouSansEffet) {
    try { decoder.close(); } catch (e) {  }
    return {
      ok: false, etape: detectionMorte || rienAFaire ? 'détection des visages' : 'floutage',
      flouSansEffet, essaisFlou, methode: methodeFlou(),
      codec: track.codec, width, height, fps,
      raison: detectionMorte
        ? `le détecteur a échoué sur ${erreursDetection} images (${derniereErreurDetection}). Aucun visage n’a pu être couvert : rien n’est exporté.`
        : flouSansEffet
          ? `le flou n\u2019a modifié aucun pixel sur ${essaisFlou} zones testées (méthode : ${methodeFlou()}). Ce navigateur accepte le réglage sans l\u2019appliquer. Rien n\u2019est exporté.`
        : rienAFaire
          ? `le détecteur n’a trouvé aucun visage sur les ${decoded} images. Si des visages y figurent, trace les zones au doigt.`
          : `aucune zone n’a été floutée sur les ${decoded} images (visages ${opts.faces ? 'cherchés' : 'non cherchés'}, ${zones.length} zone${zones.length > 1 ? 's' : ''} au doigt). Rien n’est exporté : ce fichier n’aurait rien caché.`,
      images: decoded, erreursDetection, derniereErreurDetection,
      visagesVus, zonesAppliquees, tDemux,
    };
  }

  let audioInfo = { copie: false, raison: 'non demandé' };
  if (opts.audio !== false) {
    try { audioInfo = mux.finirAudio() || audioInfo; }
    catch (e) { audioInfo = { copie: false, raison: String(e.message || e) }; }
  }

  let fichier = null, viaMux = null;
  try {
    const r = mux.finish();
    fichier = new Blob([r.buffer], { type: 'video/mp4' });
    viaMux = r.via;
  } catch (e) { muxErr = muxErr || ('multiplexage : ' + String(e.message || e)); }

  const total = performance.now() - t0;
  return {
    ok: !muxErr && decoded > 0 && encoded > 0,
    codec: track.codec, outCodec, width, height, fps,
    images: decoded, encodees: encoded,
    methodeFlou: methodeFlou(), flouConstate, essaisFlou,
    zones: zones.length, zonesAppliquees, visagesSuivis: opts.faces ? (detector ? visagesVus : 'détecteur indisponible') : null,
    detectionsLancees: opts.faces ? detections : null, uneImageSur: opts.faces ? detectEvery : null,
    tetes: opts.tetes ? { detecteur: detecteurTetes, secours: secoursTetes,
                          zonesAjoutees: tetesVues, msTotal: Math.round(tTetesSum), appels: appelsTetes,
                          msParAppel: appelsTetes ? +(tTetesSum / appelsTetes).toFixed(1) : null,
                          taille: tailleTetes || (tetesCanvas ? tetesCanvas.width + 'x' + tetesCanvas.height : 'pleine définition'),
                          uneImageSur: tetesToutesLes * detectEvery, delegue: yolox ? null : delegueDesTetes() } : null,
    imagesSansFlou,






    passages: [
      ...regrouperInstants(pertes.concat(moteur.pertes).sort((a, b) => a - b), fps).map((p) => ({ ...p, motif: 'perdu' })),
      ...regrouper(imagesNues, fps).map((p) => ({ ...p, motif: 'vide' })),
    ].sort((a, b) => b.images - a.images).slice(0, 12),
    visagesPerdus: pertes.length + moteur.pertes.length,
    erreursDetection, derniereErreurDetection,

    moteur: { version: 2, detecteur: detecteurVisages, secours: secoursVisages,
              msParDetection: detections ? +(tDetectSum / detections).toFixed(1) : null, uneImageSur: periodeVisages,
              zonesFloutees: zonesMoteurAppliquees, ...moteur.stats,
              visagesPerdus: moteur.pertes.length, coupes, diagnostic: !!opts.diag },
    suivi: pistes.length ? {
      zones: pistes.length,
      ancrees, imagesAncrees, decrochages, secoursAncrage,
      rechercheLocale: { appels: appelsLocaux, ms: Math.round(tLocalSum) },
      imagesPerdues: suiviPerdues,
      recalages,
      deplacementTotal: Math.round(suiviDeplace),
      abandons: pistes.filter((p) => p.abandon).length,
      ms: Math.round(tSuiviSum),
    } : null,
    msDetection: Math.round(tDetectSum),
    debit: bitrate,
    msTotal: Math.round(total), msDemux: Math.round(tDemux),
    msDecodeEtEncode: Math.round(tDecodeSum),



    msParImage: Math.round(tTrameSum), msFlou: Math.round(tFlouSum),
    msCopieImage: Math.round(tCopieSum), msLecture: Math.round(tLectureSum),
    imagesParSeconde: Number((decoded / (total / 1000)).toFixed(1)),
    tempsReel: Number(((decoded / fps) / (total / 1000)).toFixed(2)),
    audio: audioInfo, voix: infoVoix,
    rotation: redresse ? `redressée (${redresse.degres}°${redresse.miroir ? ', miroir' : ''})` : matriceSource ? 'conservée' : 'aucune dans la source',
    fichier, viaMux, erreur: muxErr,
  };
}

















export async function recopierSansReencoder(buf) {
  const { track, samples, description, audioTrack, audioSamples, file: srcFile } = await demux(buf, 100000);
  const kind = /^(avc1|avc3)/.test(track.codec) ? 'avc1' : /^(hvc1|hev1)/.test(track.codec) ? 'hvc1' : null;
  if (!kind) {
    return { ok: false, raison: `image en ${track.codec} : elle ne peut pas être recopiée telle quelle. Active les visages ou trace une zone : la vidéo sera alors réencodée.` };
  }
  const largeur = track.track_width || track.video.width;
  const hauteur = track.track_height || track.video.height;
  let matrice = null;
  try { matrice = lireMatrice(buf); } catch (e) {  }
  const fps = Math.round((track.nb_samples / (track.duration / track.timescale)) || 30);
  const mux = muxerOut(largeur, hauteur, kind, matrice);
  mux.preparerAudio(audioTrack, audioSamples, srcFile);
  const us = (v, ech) => Math.round((v * 1000000) / ech);
  for (let i = 0; i < samples.length; i++) {
    const e = samples[i];
    const ts = us(e.cts, e.timescale);
    mux.add({
      byteLength: e.data.byteLength, copyTo: (d) => d.set(e.data),
      timestamp: ts, dts: us(e.dts, e.timescale), duration: us(e.duration, e.timescale),
      type: e.is_sync ? 'key' : 'delta',
    }, i === 0 ? { decoderConfig: { description } } : undefined, fps);
    mux.audioJusqua(ts);
  }
  const audio = mux.finirAudio();
  const r = mux.finish();
  return { ok: true, buffer: r.buffer, images: samples.length, codec: track.codec, audio, rotation: matrice ? 'conservée' : 'aucune' };
}

