

import { scan } from './meta.js';
import { bare } from './strip.js';

const HEX = '0123456789abcdef';
function randomName(ext) {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += HEX[b >> 4] + HEX[b & 15];
  return `image-${s}.${ext}`;
}

export async function encode(canvas, kind = 'jpeg', quality = 0.92) {
  const mime = kind === 'png' ? 'image/png' : 'image/jpeg';
  const raw = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encodage impossible'))), mime, quality);
  });
  const stripped = bare(await raw.arrayBuffer(), mime);
  const blob = new Blob([stripped], { type: mime });
  const buf = stripped;
  const check = scan(buf);
  return {
    blob,
    name: randomName(kind === 'png' ? 'png' : 'jpg'),
    bytes: blob.size,
    check,
    clean: check.identityCount === 0 && !check.blocks.some((b) => b.risk === 'identite'),
  };
}

export async function share(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file] });
    return 'partage';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20000);
  return 'telechargement';
}
