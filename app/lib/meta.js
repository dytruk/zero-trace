



const td = new TextDecoder('latin1');

const RISK = { identite: 'identite', technique: 'technique' };


const IFD_TAGS = {
  0x010f: ['Fabricant', RISK.identite],
  0x0110: ['Modèle', RISK.identite],
  0x0131: ['Logiciel', RISK.identite],
  0x0132: ['Date du fichier', RISK.identite],
  0x013b: ['Auteur', RISK.identite],
  0x8298: ['Copyright', RISK.identite],
  0x010e: ['Description', RISK.identite],
  0x0112: ['Orientation', RISK.technique],
  0x011a: ['Résolution X', RISK.technique],
  0x011b: ['Résolution Y', RISK.technique],
  0x0128: ['Unité de résolution', RISK.technique],
};
const EXIF_TAGS = {
  0x9003: ['Date de prise de vue', RISK.identite],
  0x9004: ['Date de création', RISK.identite],
  0x9291: ['Sous-secondes', RISK.technique],
  0xa431: ['Numéro de série du boîtier', RISK.identite],
  0xa435: ['Numéro de série de l’objectif', RISK.identite],
  0xa433: ['Fabricant de l’objectif', RISK.identite],
  0xa434: ['Objectif', RISK.identite],
  0x927c: ['Note constructeur (bloc brut)', RISK.identite],
  0xa420: ['Identifiant unique d’image', RISK.identite],
  0x829a: ['Temps d’exposition', RISK.technique],
  0x829d: ['Ouverture', RISK.technique],
  0x8827: ['ISO', RISK.technique],
  0x920a: ['Focale', RISK.technique],
};
const GPS_TAGS = {
  1: 'latRef', 2: 'lat', 3: 'lonRef', 4: 'lon', 5: 'altRef', 6: 'alt',
  7: 'heure', 29: 'date', 1 : 'latRef',
};

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

function readTiffValue(dv, entryOff, le, tiffStart) {
  const type = dv.getUint16(entryOff + 2, le);
  const count = dv.getUint32(entryOff + 4, le);
  const size = (TYPE_SIZE[type] || 1) * count;
  let off = entryOff + 8;
  if (size > 4) off = tiffStart + dv.getUint32(entryOff + 8, le);
  if (off + size > dv.byteLength || off < 0) return null;
  const rd = (i) => {
    switch (type) {
      case 1: case 6: case 7: return dv.getUint8(off + i);
      case 3: return dv.getUint16(off + i * 2, le);
      case 4: return dv.getUint32(off + i * 4, le);
      case 9: return dv.getInt32(off + i * 4, le);
      case 5: return dv.getUint32(off + i * 8, le) / (dv.getUint32(off + i * 8 + 4, le) || 1);
      case 10: return dv.getInt32(off + i * 8, le) / (dv.getInt32(off + i * 8 + 4, le) || 1);
      default: return dv.getUint8(off + i);
    }
  };
  if (type === 2) {
    let s = '';
    for (let i = 0; i < count; i++) {
      const c = dv.getUint8(off + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s.trim();
  }
  if (type === 7) return `${count} octets`;
  const out = [];
  for (let i = 0; i < count; i++) out.push(rd(i));
  return count === 1 ? out[0] : out;
}

function dmsToDecimal(v, ref) {
  if (!Array.isArray(v) || v.length < 3) return null;
  const dec = Math.abs(v[0]) + v[1] / 60 + v[2] / 3600;
  const neg = ref === 'S' || ref === 'W';
  return Number(((neg ? -dec : dec)).toFixed(6));
}

function parseTiff(dv, tiffStart, out) {
  if (tiffStart + 8 > dv.byteLength) return;
  const bom = dv.getUint16(tiffStart, false);
  const le = bom === 0x4949;
  if (!le && bom !== 0x4d4d) return;
  let ifdOff = dv.getUint32(tiffStart + 4, le);
  const seen = new Set();
  const walk = (off, which) => {
    const base = tiffStart + off;
    if (off <= 0 || base + 2 > dv.byteLength || seen.has(base)) return;
    seen.add(base);
    const n = dv.getUint16(base, le);
    if (n > 512) return;
    for (let i = 0; i < n; i++) {
      const e = base + 2 + i * 12;
      if (e + 12 > dv.byteLength) return;
      const tag = dv.getUint16(e, le);
      out.tagCount++;
      if (which === 'ifd' && tag === 0x8769) { walk(readTiffValue(dv, e, le, tiffStart), 'exif'); continue; }
      if (which === 'ifd' && tag === 0x8825) { walk(readTiffValue(dv, e, le, tiffStart), 'gps'); continue; }
      if (which === 'gps') {
        const name = GPS_TAGS[tag];
        if (name) out.gps[name] = readTiffValue(dv, e, le, tiffStart);
        continue;
      }
      const table = which === 'exif' ? EXIF_TAGS : IFD_TAGS;
      const def = table[tag];
      if (!def) continue;
      const val = readTiffValue(dv, e, le, tiffStart);
      if (val === null || val === '' ) continue;
      if (tag === 0x0112) out.orientation = Number(val) || 1;
      out.fields.push({ label: def[0], value: String(val), risk: def[1], tag });
    }
    const next = dv.getUint32(base + 2 + n * 12, le);
    if (which === 'ifd' && next) walk(next, 'ifd1');
  };
  walk(ifdOff, 'ifd');
}

function emptyResult(format) {
  return {
    format, blocks: [], fields: [], gps: {}, orientation: 1, tagCount: 0,
    bytes: 0, position: null, identityCount: 0, technicalCount: 0,
  };
}

function finish(out) {
  if (out.gps.lat && out.gps.lon) {
    const lat = dmsToDecimal(out.gps.lat, out.gps.latRef);
    const lon = dmsToDecimal(out.gps.lon, out.gps.lonRef);
    if (lat !== null && lon !== null) {
      out.position = { lat, lon };
      out.fields.unshift({ label: 'Coordonnées GPS', value: `${lat}, ${lon}`, risk: RISK.identite, tag: 'gps' });
      if (typeof out.gps.alt === 'number') out.fields.push({ label: 'Altitude', value: `${Math.round(out.gps.alt)} m`, risk: RISK.identite, tag: 'alt' });
      if (out.gps.date) out.fields.push({ label: 'Date GPS', value: String(out.gps.date), risk: RISK.identite, tag: 'gpsdate' });
    }
  }
  out.identityCount = out.fields.filter((f) => f.risk === RISK.identite).length;
  out.technicalCount = out.fields.filter((f) => f.risk === RISK.technique).length;
  return out;
}

function scanJpeg(buf) {
  const dv = new DataView(buf);
  const out = emptyResult('JPEG');
  let p = 2;
  while (p + 4 < dv.byteLength) {
    if (dv.getUint8(p) !== 0xff) { p++; continue; }
    const marker = dv.getUint8(p + 1);
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { p += 2; continue; }
    if (marker === 0xda || marker === 0xd9) break;
    const len = dv.getUint16(p + 2, false);
    const segStart = p + 4;
    const head = td.decode(new Uint8Array(buf, segStart, Math.min(32, len)));
    if (marker === 0xe1 && head.startsWith('Exif')) {
      out.blocks.push({ kind: 'EXIF', bytes: len, risk: RISK.identite });
      parseTiff(dv, segStart + 6, out);
    } else if (marker === 0xe1 && head.includes('ns.adobe.com/xap')) {
      out.blocks.push({ kind: 'XMP', bytes: len, risk: RISK.identite });
    } else if (marker === 0xed) {
      out.blocks.push({ kind: 'IPTC / Photoshop', bytes: len, risk: RISK.identite });
    } else if (marker === 0xe2 && head.includes('ICC_PROFILE')) {
      out.blocks.push({ kind: 'Profil ICC', bytes: len, risk: RISK.technique });
    } else if (marker === 0xe0 && head.startsWith('JFIF')) {
      out.blocks.push({ kind: 'En-tête JFIF', bytes: len, risk: RISK.technique });
    } else if (marker === 0xeb && head.includes('JP')) {
      out.blocks.push({ kind: 'Signature de provenance C2PA', bytes: len, risk: RISK.identite });
      out.fields.push({ label: 'Provenance signée (C2PA)', value: 'appareil et chaîne d\u2019édition enregistrés', risk: RISK.identite, tag: 'c2pa' });
    } else if (marker === 0xfe) {
      out.blocks.push({ kind: 'Commentaire', bytes: len, risk: RISK.identite });
    } else if (marker >= 0xe0 && marker <= 0xef) {
      out.blocks.push({ kind: `APP${marker - 0xe0}`, bytes: len, risk: RISK.identite });
    }
    p = segStart + len - 2;
  }
  return finish(out);
}

function scanPng(buf) {
  const dv = new DataView(buf);
  const out = emptyResult('PNG');
  let p = 8;
  while (p + 8 <= dv.byteLength) {
    const len = dv.getUint32(p, false);
    const type = td.decode(new Uint8Array(buf, p + 4, 4));
    if (type === 'eXIf') {
      out.blocks.push({ kind: 'EXIF', bytes: len, risk: RISK.identite });
      parseTiff(dv, p + 8, out);
    } else if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
      const txt = td.decode(new Uint8Array(buf, p + 8, Math.min(len, 120)));
      out.blocks.push({ kind: `Texte ${type}`, bytes: len, risk: RISK.identite });
      out.fields.push({ label: 'Texte intégré', value: txt.replace(/\u0000/g, ' ').trim().slice(0, 80), risk: RISK.identite, tag: type });
    } else if (type === 'tIME') {
      out.blocks.push({ kind: 'Horodatage', bytes: len, risk: RISK.identite });
    } else if (type === 'iCCP') {
      out.blocks.push({ kind: 'Profil ICC', bytes: len, risk: RISK.technique });
    } else if (type === 'IDAT' || type === 'IEND') {
      if (type === 'IEND') break;
    }
    p += 12 + len;
  }
  return finish(out);
}


function scanIso(buf, format) {
  const dv = new DataView(buf);
  const out = emptyResult(format);
  const walk = (start, end, depth) => {
    let p = start;
    while (p + 8 <= end) {
      let size = dv.getUint32(p, false);
      const type = td.decode(new Uint8Array(buf, p + 4, 4));
      let hdr = 8;
      if (size === 1) { size = Number(dv.getBigUint64(p + 8, false)); hdr = 16; }
      if (size === 0) size = end - p;
      if (size < hdr || p + size > end) break;
      if (type === 'meta' || type === 'moov' || type === 'udta' || type === 'trak' || type === 'mdia') {
        walk(p + hdr + (type === 'meta' ? 4 : 0), p + size, depth + 1);
      }
      if (type === 'iinf') out.blocks.push({ kind: 'Index des items (iinf)', bytes: size, risk: RISK.technique });
      if (type === 'udta') out.blocks.push({ kind: 'Métadonnées QuickTime (udta)', bytes: size, risk: RISK.identite });
      if (type === '©xyz') {
        const s = td.decode(new Uint8Array(buf, p + hdr, Math.min(size - hdr, 64))).replace(/[^\x20-\x7e+\-.]/g, '');
        out.blocks.push({ kind: 'Position GPS QuickTime', bytes: size, risk: RISK.identite });
        out.fields.push({ label: 'Coordonnées GPS (udta)', value: s, risk: RISK.identite, tag: 'xyz' });
      }
      p += size;
    }
  };
  walk(0, dv.byteLength, 0);

  const u8 = new Uint8Array(buf);
  const sig = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
  for (let i = 0; i < u8.length - 16; i++) {
    if (u8[i] === sig[0] && u8[i + 1] === sig[1] && u8[i + 2] === sig[2] && u8[i + 3] === sig[3] && u8[i + 4] === 0 && u8[i + 5] === 0) {
      const bom = dv.getUint16(i + 6, false);
      if (bom === 0x4949 || bom === 0x4d4d) {
        out.blocks.push({ kind: 'EXIF', bytes: 0, risk: RISK.identite });
        parseTiff(dv, i + 6, out);
        break;
      }
    }
  }
  const asText = td.decode(u8.subarray(0, Math.min(u8.length, 400000)));
  if (asText.includes('<x:xmpmeta')) out.blocks.push({ kind: 'XMP', bytes: 0, risk: RISK.identite });
  return finish(out);
}

export function detectFormat(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0xff && u8[1] === 0xd8) return 'JPEG';
  if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) return 'PNG';
  const brand = td.decode(u8.subarray(4, 12));
  if (brand.startsWith('ftyp')) {
    const b = brand.slice(4, 8);
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heis', 'heim'].includes(b)) return 'HEIC';
    if (['avif', 'avis'].includes(b)) return 'AVIF';


    return 'MP4/MOV';
  }
  if (u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46) return 'WEBP';
  if (u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46) return 'GIF';
  return 'inconnu';
}

export function scan(buf) {
  const format = detectFormat(buf);
  let out;
  if (format === 'JPEG') out = scanJpeg(buf);
  else if (format === 'PNG') out = scanPng(buf);
  else if (format === 'HEIC' || format === 'AVIF' || format === 'MP4/MOV' || format === 'ISO-BMFF') out = scanIso(buf, format);
  else out = finish(emptyResult(format));
  out.bytes = buf.byteLength;
  return out;
}

export { RISK };
