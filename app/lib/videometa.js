




const td = new TextDecoder('latin1');
const META_TYPES = new Set(['udta', 'meta', 'uuid']);

function boxes(dv, start, end) {
  const out = [];
  let p = start;
  while (p + 8 <= end) {
    let size = dv.getUint32(p, false);
    const type = td.decode(new Uint8Array(dv.buffer, dv.byteOffset + p + 4, 4));
    let hdr = 8;
    if (size === 1) { size = Number(dv.getBigUint64(p + 8, false)); hdr = 16; }
    else if (size === 0) size = end - p;
    if (size < hdr || p + size > end) break;
    out.push({ start: p, size, type, hdr });
    p += size;
  }
  return out;
}

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'moof', 'traf', 'mvex']);

function walk(dv, start, end, path, visit) {
  for (const b of boxes(dv, start, end)) {
    const here = path ? `${path}/${b.type}` : b.type;
    visit(b, here);
    if (CONTAINERS.has(b.type)) walk(dv, b.start + b.hdr, b.start + b.size, here, visit);
  }
}









function readString(dv, start, len) {
  const reste = dv.byteLength - start;
  const pris = Math.max(0, Math.min(len, 4000, reste));
  const u8 = new Uint8Array(dv.buffer, dv.byteOffset + start, pris);
  return td.decode(u8).replace(/[^\x20-\x7eÀ-ÿ+\-.,:/]/g, ' ').replace(/\s+/g, ' ').trim();
}

const MAC_EPOCH = Date.UTC(1904, 0, 1) / 1000;
function macDate(sec) {
  if (!sec) return null;
  return new Date((sec + MAC_EPOCH) * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

export function scanVideo(buf) {
  const dv = new DataView(buf);
  const res = {
    bytes: buf.byteLength, brand: null, tracks: [], metaBoxes: [], fields: [],
    created: null, modified: null, duration: null,
  };
  const top = boxes(dv, 0, dv.byteLength);
  const ftyp = top.find((b) => b.type === 'ftyp');
  if (ftyp) res.brand = readString(dv, ftyp.start + 8, 4);

  walk(dv, 0, dv.byteLength, '', (b, path) => {
    if (META_TYPES.has(b.type) && path !== 'moov/trak/mdia/minf/meta') {













      const txt = readString(dv, b.start + b.hdr, Math.min(b.size - b.hdr, 4000));
      res.metaBoxes.push({ path, type: b.type, bytes: b.size, apercu: txt.slice(0, 120) });
      const xyz = /([+-]\d{2,3}\.\d+)([+-]\d{2,3}\.\d+)/.exec(txt);
      if (xyz) res.fields.push({ label: 'Coordonnées GPS', value: `${xyz[1]}, ${xyz[2]}`, risk: 'identite' });
      const words = /(iPhone|Apple|samsung|SM-[A-Z0-9]+|Pixel|GoPro|Android|Xiaomi)/i.exec(txt);
      if (words) res.fields.push({ label: 'Appareil nommé dans les métadonnées', value: words[0], risk: 'identite' });
    }
    if (b.type === 'mvhd') {
      const v = dv.getUint8(b.start + 8);
      const c = v === 1 ? Number(dv.getBigUint64(b.start + 12, false)) : dv.getUint32(b.start + 12, false);
      const m = v === 1 ? Number(dv.getBigUint64(b.start + 20, false)) : dv.getUint32(b.start + 16, false);
      res.created = macDate(c);
      res.modified = macDate(m);
      if (res.created) res.fields.push({ label: 'Date de tournage (mvhd)', value: res.created, risk: 'identite' });
      const ts = v === 1 ? dv.getUint32(b.start + 28, false) : dv.getUint32(b.start + 20, false);
      const du = v === 1 ? Number(dv.getBigUint64(b.start + 32, false)) : dv.getUint32(b.start + 24, false);
      if (ts) res.duration = Number((du / ts).toFixed(2));
    }
    if (b.type === 'stsd') {
      const entries = boxes(dv, b.start + b.hdr + 8, b.start + b.size);
      for (const e of entries) {
        if (['avc1', 'avc3', 'hvc1', 'hev1', 'vp09', 'av01', 'mp4v'].includes(e.type)) {
          const w = dv.getUint16(e.start + 8 + 24, false);
          const h = dv.getUint16(e.start + 8 + 26, false);
          res.tracks.push({ codec: e.type, width: w, height: h });
        }
      }
    }
  });
  res.identityCount = res.fields.length;
  return res;
}












const BLOCS_META = new Set(['udta', 'meta', 'uuid', 'XMP_', 'ID32', 'ilst', 'keys', 'mebx', 'gpmd', 'camm', 'tmcd']);
const TOUS_CONTENEURS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'moof', 'traf', 'mvex', 'dinf', 'udta', 'meta', 'stsd']);

export function inventaireMp4(buf) {
  const dv = new DataView(buf);
  const top = boxes(dv, 0, dv.byteLength);
  const res = { iso: top.some((b) => b.type === 'ftyp') && top.some((b) => b.type === 'moov'), pistes: [], blocs: [] };
  if (!res.iso) return { ...res, propre: false, raison: 'ce n\u2019est pas un fichier MP4 ou MOV' };
  (function parcourir(debut, fin, chemin) {
    for (const b of boxes(dv, debut, fin)) {
      const ici = chemin ? `${chemin}/${b.type}` : b.type;
      if (BLOCS_META.has(b.type)) res.blocs.push(ici);
      if (b.type === 'hdlr') {
        const h = td.decode(new Uint8Array(dv.buffer, dv.byteOffset + b.start + b.hdr + 8, 4));
        if (/\/trak\/mdia\/hdlr$/.test(ici)) res.pistes.push(h);
      }

      if (TOUS_CONTENEURS.has(b.type)) {
        const saut = b.type === 'stsd' ? 8 : b.type === 'meta' ? 4 : 0;
        parcourir(b.start + b.hdr + saut, b.start + b.size, ici);
      }
    }
  })(0, dv.byteLength, '');
  const images = res.pistes.filter((h) => h === 'vide').length;
  const sons = res.pistes.filter((h) => h === 'soun').length;
  const autres = res.pistes.filter((h) => h !== 'vide' && h !== 'soun');
  const propre = images === 1 && sons <= 1 && !autres.length && !res.blocs.length;
  return { ...res, propre,
           raison: propre ? null : [
             images !== 1 ? `${images} pistes d'image` : null,
             sons > 1 ? `${sons} pistes de son` : null,
             autres.length ? `pistes en plus : ${autres.join(', ')}` : null,
             res.blocs.length ? `blocs de métadonnées : ${res.blocs.join(', ')}` : null,
           ].filter(Boolean).join(' ; ') };
}
