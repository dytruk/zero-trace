











const txt = (u8, o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);


function boites(u8, dv, debut, fin, f) {
  let o = debut;
  while (o + 8 <= fin) {
    let taille = dv.getUint32(o);
    let tete = 8;
    if (taille === 1) { taille = Number(dv.getBigUint64(o + 8)); tete = 16; }
    if (taille === 0) taille = fin - o;
    if (taille < 8 || o + taille > fin) return;
    f(txt(u8, o + 4), o, o + tete, o + taille);
    o += taille;
  }
}

function chercher(u8, dv, debut, fin, nom) {
  let trouve = null;
  boites(u8, dv, debut, fin, (type, deb, payload, finB) => {
    if (!trouve && type === nom) trouve = { deb, payload, fin: finB };
  });
  return trouve;
}


function remplacer(parent, debutEnfantRel, finEnfantRel, nouveau) {
  const sortie = new Uint8Array(parent.length - (finEnfantRel - debutEnfantRel) + nouveau.length);
  sortie.set(parent.subarray(0, debutEnfantRel), 0);
  sortie.set(nouveau, debutEnfantRel);
  sortie.set(parent.subarray(finEnfantRel), debutEnfantRel + nouveau.length);
  new DataView(sortie.buffer).setUint32(0, sortie.length);
  return sortie;
}

function boite(nom, ...morceaux) {
  let n = 8;
  for (const m of morceaux) n += m.length;
  const out = new Uint8Array(n);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, n);
  for (let i = 0; i < 4; i++) out[4 + i] = nom.charCodeAt(i);
  let o = 8;
  for (const m of morceaux) { out.set(m, o); o += m.length; }
  return out;
}

function u32(...valeurs) {
  const out = new Uint8Array(valeurs.length * 4);
  const dv = new DataView(out.buffer);
  valeurs.forEach((v, i) => dv.setUint32(i * 4, v >>> 0));
  return out;
}


function stts(echantillons) {
  const e = [];
  for (const s of echantillons) {
    const d = s.duree;
    if (e.length && e[e.length - 1][1] === d) e[e.length - 1][0]++;
    else e.push([1, d]);
  }
  const corps = new Uint8Array(8 + e.length * 8);
  const dv = new DataView(corps.buffer);
  dv.setUint32(0, 0);
  dv.setUint32(4, e.length);
  e.forEach(([n, d], i) => { dv.setUint32(8 + i * 8, n); dv.setUint32(12 + i * 8, d); });
  return boite('stts', corps);
}


function ctts(echantillons) {
  if (!echantillons.some((s) => s.decalage)) return null;
  const e = [];
  for (const s of echantillons) {
    const d = s.decalage | 0;
    if (e.length && e[e.length - 1][1] === d) e[e.length - 1][0]++;
    else e.push([1, d]);
  }
  const corps = new Uint8Array(8 + e.length * 8);
  const dv = new DataView(corps.buffer);
  dv.setUint32(0, 0x01000000);
  dv.setUint32(4, e.length);
  e.forEach(([n, d], i) => { dv.setUint32(8 + i * 8, n); dv.setInt32(12 + i * 8, d); });
  return boite('ctts', corps);
}

function stsz(echantillons) {
  const corps = new Uint8Array(12 + echantillons.length * 4);
  const dv = new DataView(corps.buffer);
  dv.setUint32(0, 0);
  dv.setUint32(4, 0);
  dv.setUint32(8, echantillons.length);
  echantillons.forEach((s, i) => dv.setUint32(12 + i * 4, s.taille));
  return boite('stsz', corps);
}

function stss(echantillons) {
  const cles = [];
  echantillons.forEach((s, i) => { if (s.cle) cles.push(i + 1); });
  if (!cles.length || cles.length === echantillons.length) return null;
  const corps = new Uint8Array(8 + cles.length * 4);
  const dv = new DataView(corps.buffer);
  dv.setUint32(0, 0);
  dv.setUint32(4, cles.length);
  cles.forEach((n, i) => dv.setUint32(8 + i * 4, n));
  return boite('stss', corps);
}


function stsc() {
  const corps = new Uint8Array(8 + 12);
  const dv = new DataView(corps.buffer);
  dv.setUint32(0, 0);
  dv.setUint32(4, 1);
  dv.setUint32(8, 1);
  dv.setUint32(12, 1);
  dv.setUint32(16, 1);
  return boite('stsc', corps);
}

function co64(positions) {
  const corps = new Uint8Array(8 + positions.length * 8);
  const dv = new DataView(corps.buffer);
  dv.setUint32(0, 0);
  dv.setUint32(4, positions.length);
  positions.forEach((p, i) => dv.setBigUint64(8 + i * 8, BigInt(p)));
  return boite('co64', corps);
}





export function remuxPlat(buffer) {
  const u8 = new Uint8Array(buffer);
  const dv = new DataView(buffer);

  let ftyp = null, moov = null;
  const fragments = [];
  boites(u8, dv, 0, u8.length, (type, deb, payload, fin) => {
    if (type === 'ftyp') ftyp = u8.slice(deb, fin);
    else if (type === 'moov') moov = { deb, payload, fin };
    else if (type === 'moof') fragments.push({ deb, payload, fin });
  });
  if (!moov || !fragments.length) return null;


  const pistes = new Map();
  for (const f of fragments) {
    const traf = chercher(u8, dv, f.payload, f.fin, 'traf');
    if (!traf) continue;
    const tfhd = chercher(u8, dv, traf.payload, traf.fin, 'tfhd');
    const trun = chercher(u8, dv, traf.payload, traf.fin, 'trun');
    if (!tfhd || !trun) continue;
    const id = dv.getUint32(tfhd.payload + 4);
    if (!pistes.has(id)) pistes.set(id, { echantillons: [] });
    const liste = pistes.get(id).echantillons;

    const drapeaux = dv.getUint32(trun.payload) & 0xffffff;
    const nb = dv.getUint32(trun.payload + 4);
    let o = trun.payload + 8;
    let position = f.deb;
    if (drapeaux & 0x1) { position += dv.getInt32(o); o += 4; }
    if (drapeaux & 0x4) o += 4;
    for (let i = 0; i < nb; i++) {
      let duree = 0, taille = 0, dr = 0, decalage = 0;
      if (drapeaux & 0x100) { duree = dv.getUint32(o); o += 4; }
      if (drapeaux & 0x200) { taille = dv.getUint32(o); o += 4; }
      if (drapeaux & 0x400) { dr = dv.getUint32(o); o += 4; }
      if (drapeaux & 0x800) { decalage = dv.getInt32(o); o += 4; }
      liste.push({ position, taille, duree, decalage, cle: !(dr & 0x10000) });
      position += taille;
    }
  }
  if (!pistes.size) return null;


  const traks = [];
  boites(u8, dv, moov.payload, moov.fin, (type, deb, payload, fin) => {
    if (type === 'trak') traks.push({ deb, payload, fin });
  });
  const mvhd = chercher(u8, dv, moov.payload, moov.fin, 'mvhd');
  if (!mvhd || !traks.length) return null;
  const echelleFilm = dv.getUint32(mvhd.payload + 12);


  const curseurs = [];
  for (const t of traks) {
    const tkhd = chercher(u8, dv, t.payload, t.fin, 'tkhd');
    if (!tkhd) return null;
    const id = dv.getUint32(tkhd.payload + 12);
    const piste = pistes.get(id);
    if (!piste || !piste.echantillons.length) return null;
    const mdia = chercher(u8, dv, t.payload, t.fin, 'mdia');
    const mdhd = mdia && chercher(u8, dv, mdia.payload, mdia.fin, 'mdhd');
    if (!mdia || !mdhd) return null;
    const echelle = dv.getUint32(mdhd.payload + 12);
    let dts = 0;
    for (const s of piste.echantillons) { s.dts = dts; dts += s.duree; }
    curseurs.push({ trak: t, id, echelle, duree: dts, ech: piste.echantillons, i: 0, positions: [] });
  }

  const corps = [];
  let position = 0;
  for (;;) {
    let choisi = null;
    for (const c of curseurs) {
      if (c.i >= c.ech.length) continue;
      const t = c.ech[c.i].dts / c.echelle;
      if (!choisi || t < choisi.t) choisi = { c, t };
    }
    if (!choisi) break;
    const c = choisi.c;
    const s = c.ech[c.i++];
    c.positions.push(position);
    corps.push(u8.subarray(s.position, s.position + s.taille));
    position += s.taille;
  }
  const tailleMdat = position;


  const dureeFilm = Math.max(...curseurs.map((c) => Math.round((c.duree / c.echelle) * echelleFilm)));
  const nouveauxTraks = curseurs.map((c) => {
    const t = c.trak;
    const mdia = chercher(u8, dv, t.payload, t.fin, 'mdia');
    const minf = chercher(u8, dv, mdia.payload, mdia.fin, 'minf');
    const stbl = chercher(u8, dv, minf.payload, minf.fin, 'stbl');
    const stsd = chercher(u8, dv, stbl.payload, stbl.fin, 'stsd');
    if (!stsd) return null;
    const morceaux = [u8.slice(stsd.deb, stsd.fin), stts(c.ech)];
    const ct = ctts(c.ech); if (ct) morceaux.push(ct);
    morceaux.push(stsc(), stsz(c.ech), co64(c.positions));
    const ss = stss(c.ech); if (ss) morceaux.push(ss);
    const nouveauStbl = boite('stbl', ...morceaux);

    let octetsMinf = u8.slice(minf.deb, minf.fin);
    octetsMinf = remplacer(octetsMinf, stbl.deb - minf.deb, stbl.fin - minf.deb, nouveauStbl);
    let octetsMdia = u8.slice(mdia.deb, mdia.fin);
    octetsMdia = remplacer(octetsMdia, minf.deb - mdia.deb, minf.fin - mdia.deb, octetsMinf);
    let octetsTrak = u8.slice(t.deb, t.fin);
    octetsTrak = remplacer(octetsTrak, mdia.deb - t.deb, mdia.fin - t.deb, octetsMdia);


    const vt = new DataView(octetsTrak.buffer, octetsTrak.byteOffset, octetsTrak.byteLength);
    const tkhd2 = chercher(octetsTrak, vt, 8, octetsTrak.length, 'tkhd');
    if (tkhd2) vt.setUint32(tkhd2.payload + 20, Math.round((c.duree / c.echelle) * echelleFilm));
    const mdia2 = chercher(octetsTrak, vt, 8, octetsTrak.length, 'mdia');
    const mdhd2 = mdia2 && chercher(octetsTrak, vt, mdia2.payload, mdia2.fin, 'mdhd');
    if (mdhd2) vt.setUint32(mdhd2.payload + 16, c.duree);
    return octetsTrak;
  });
  if (nouveauxTraks.some((t) => !t)) return null;

  const octetsMvhd = u8.slice(mvhd.deb, mvhd.fin);
  new DataView(octetsMvhd.buffer).setUint32(mvhd.payload - mvhd.deb + 16, dureeFilm);






  const taillePremiere = boite('moov', octetsMvhd, ...nouveauxTraks).length;
  const debutMdat = (ftyp ? ftyp.length : 0) + taillePremiere + 16;
  nouveauxTraks.forEach((trak, i) => {
    const c = curseurs[i];
    const vt = new DataView(trak.buffer, trak.byteOffset, trak.byteLength);
    const mdia2 = chercher(trak, vt, 8, trak.length, 'mdia');
    const minf2 = chercher(trak, vt, mdia2.payload, mdia2.fin, 'minf');
    const stbl2 = chercher(trak, vt, minf2.payload, minf2.fin, 'stbl');
    const co = chercher(trak, vt, stbl2.payload, stbl2.fin, 'co64');
    const n = vt.getUint32(co.payload + 4);
    for (let k = 0; k < n; k++) {
      vt.setBigUint64(co.payload + 8 + k * 8, BigInt(c.positions[k] + debutMdat));
    }
  });
  const nouveauMoov = boite('moov', octetsMvhd, ...nouveauxTraks);
  if (nouveauMoov.length !== taillePremiere) return null;

  const sortie = new Uint8Array(debutMdat + tailleMdat);
  const dvSortie = new DataView(sortie.buffer);
  let o = 0;
  if (ftyp) { sortie.set(ftyp, 0); o = ftyp.length; }
  sortie.set(nouveauMoov, o); o += nouveauMoov.length;
  dvSortie.setUint32(o, 1);
  sortie.set([0x6d, 0x64, 0x61, 0x74], o + 4);
  dvSortie.setBigUint64(o + 8, BigInt(tailleMdat + 16));
  o += 16;
  for (const m of corps) { sortie.set(m, o); o += m.length; }
  return sortie.buffer;
}













function* _boites(u8, dv, debut, fin) {
  let o = debut;
  while (o + 8 <= fin) {
    let taille = dv.getUint32(o);
    const nom = String.fromCharCode(u8[o + 4], u8[o + 5], u8[o + 6], u8[o + 7]);
    if (taille === 1) taille = Number(dv.getBigUint64(o + 8));
    if (taille === 0) taille = fin - o;
    if (taille < 8) return;
    yield { nom, corps: o + 8, fin: o + taille };
    o += taille;
  }
}
const _CONTENEURS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts']);
function* _toutes(u8, dv, debut, fin, prof = 0) {
  for (const b of _boites(u8, dv, debut, fin)) {
    yield b;
    if (_CONTENEURS.has(b.nom) && prof < 6) yield* _toutes(u8, dv, b.corps, b.fin, prof + 1);
  }
}

function _matriceDe(u8, dv, b) {
  const version = u8[b.corps];
  const base = b.corps + 4 + (version === 1 ? 32 : 20) + 16;
  return { base, largeur: dv.getUint32(base + 36) / 65536, hauteur: dv.getUint32(base + 40) / 65536 };
}


export function lireMatrice(buffer) {
  const u8 = new Uint8Array(buffer);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.length);
  for (const b of _toutes(u8, dv, 0, u8.length)) {
    if (b.nom !== 'tkhd') continue;
    const { base, largeur } = _matriceDe(u8, dv, b);
    if (!largeur) continue;
    const m = [];
    for (let i = 0; i < 9; i++) m.push(dv.getInt32(base + i * 4));
    const neutre = m[0] === 65536 && m[1] === 0 && m[3] === 0 && m[4] === 65536;
    return neutre ? null : m;
  }
  return null;
}

















export function redressement(m, largeur, hauteur) {
  if (!m || !largeur || !hauteur) return null;
  const a = m[0] / 65536, b = m[1] / 65536, c = m[3] / 65536, d = m[4] / 65536;
  const net = (v) => Math.abs(v) < 1e-3 || Math.abs(Math.abs(v) - 1) < 1e-3;
  if (![a, b, c, d].every(net) || Math.abs(Math.abs(a * d - b * c) - 1) > 1e-3) return null;
  const r = (v) => Math.round(v);
  const A = r(a), B = r(b), C = r(c), D = r(d);
  const coins = [[0, 0], [largeur, 0], [0, hauteur], [largeur, hauteur]].map(([x, y]) => [A * x + C * y, B * x + D * y]);
  const xs = coins.map((p) => p[0]), ys = coins.map((p) => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  return {
    largeur: Math.max(...xs) - minX, hauteur: Math.max(...ys) - minY,
    transformation: [A, B, C, D, -minX, -minY],
    degres: ((Math.round(Math.atan2(B, A) * 180 / Math.PI) % 360) + 360) % 360,
    miroir: A * D - B * C < 0,
  };
}


export function poserMatrice(buffer, m) {
  if (!m) return false;
  const u8 = new Uint8Array(buffer);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.length);
  for (const b of _toutes(u8, dv, 0, u8.length)) {
    if (b.nom !== 'tkhd') continue;
    const { base, largeur } = _matriceDe(u8, dv, b);
    if (!largeur) continue;
    for (let i = 0; i < 9; i++) dv.setInt32(base + i * 4, m[i]);
    return true;
  }
  return false;
}











export function lireConfigAudio(buffer) {
  const u8 = new Uint8Array(buffer);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.length);
  for (const b of _toutes(u8, dv, 0, u8.length)) {
    if (b.nom !== 'stsd') continue;

    for (const e of _boites(u8, dv, b.corps + 8, b.fin)) {
      if (!/^mp4a/.test(e.nom)) continue;

      for (const f of _boites(u8, dv, e.corps + 28, e.fin)) {
        if (f.nom !== 'esds') continue;
        return _specifique(u8, f.corps + 4, f.fin);
      }
    }
  }
  return null;
}


function _specifique(u8, debut, fin) {
  let o = debut;
  while (o < fin) {
    const tag = u8[o++];
    let taille = 0;
    for (let i = 0; i < 4 && o < fin; i++) { const c = u8[o++]; taille = (taille << 7) | (c & 0x7f); if (!(c & 0x80)) break; }
    if (tag === 0x05) return u8.slice(o, Math.min(o + taille, fin));
    if (tag === 0x03) o += 3;
    else if (tag === 0x04) o += 13;
    else o += taille;
  }
  return null;
}















export function configAudioNue(u8) {
  if (!u8 || !u8.length) return null;
  if (u8[0] !== 0x03) return u8;
  return _specifique(u8, 0, u8.length) || u8;
}
