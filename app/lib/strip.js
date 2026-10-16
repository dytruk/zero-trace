


export function bareJpeg(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] !== 0xff || u8[1] !== 0xd8) return buf;
  const keep = [];
  keep.push(u8.subarray(0, 2));
  let p = 2;
  while (p + 4 <= u8.length) {
    if (u8[p] !== 0xff) { p++; continue; }
    const marker = u8[p + 1];
    if (marker === 0xd9) { keep.push(u8.subarray(p)); break; }
    if (marker === 0xda) { keep.push(u8.subarray(p)); break; }
    const len = (u8[p + 2] << 8) | u8[p + 3];
    const drop = (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;
    if (!drop) keep.push(u8.subarray(p, p + 2 + len));
    p += 2 + len;
  }
  let total = 0;
  for (const k of keep) total += k.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const k of keep) { out.set(k, o); o += k.length; }
  return out.buffer;
}

const PNG_KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS']);

export function barePng(buf) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  const dec = new TextDecoder('latin1');
  const keep = [u8.subarray(0, 8)];
  let p = 8;
  while (p + 8 <= u8.length) {
    const len = dv.getUint32(p, false);
    const type = dec.decode(u8.subarray(p + 4, p + 8));
    const end = p + 12 + len;
    if (PNG_KEEP.has(type)) keep.push(u8.subarray(p, end));
    if (type === 'IEND') break;
    p = end;
  }
  let total = 0;
  for (const k of keep) total += k.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const k of keep) { out.set(k, o); o += k.length; }
  return out.buffer;
}

export function bare(buf, mime) {
  try {
    if (mime === 'image/png') return barePng(buf);
    return bareJpeg(buf);
  } catch (e) {
    return buf;
  }
}
