








import { flouterRegion, flouterLot, filtreDisponible, zoneTete, rayonZone, ELARGI_TETE } from './flou.js';

export class BlurEngine {
  constructor(baseCanvas) {
    this.base = baseCanvas;
    this.w = baseCanvas.width;
    this.h = baseCanvas.height;
    this.strokes = [];
    this.elargi = ELARGI_TETE;

    this.block = Math.max(12, Math.round(Math.min(this.w, this.h) / 18));
    this.floute = document.createElement('canvas');
    this.mask = document.createElement('canvas');
    this.floute.width = this.mask.width = this.w;
    this.floute.height = this.mask.height = this.h;
    this.construireCalqueFloute();
  }


  construireCalqueFloute() {
    const ctx = this.floute.getContext('2d');
    ctx.clearRect(0, 0, this.w, this.h);
    if (filtreDisponible()) {
      ctx.save();
      ctx.filter = `blur(${this.block}px)`;
      ctx.drawImage(this.base, 0, 0);
      ctx.restore();
      return;
    }

    ctx.drawImage(this.base, 0, 0);
    flouterRegion(ctx, this.floute, { x: 0, y: 0, w: this.w, h: this.h }, this.block);
  }

  setBlock(px) {
    this.block = Math.max(4, Math.round(px));
    this.construireCalqueFloute();
  }

  addBrush(points, radius) {
    this.strokes.push({ type: 'brush', points: points.slice(), radius });
  }

  addRect(x, y, w, h) {
    if (Math.abs(w) < 2 || Math.abs(h) < 2) return;
    this.strokes.push({
      type: 'rect',
      x: Math.min(x, x + w), y: Math.min(y, y + h),
      w: Math.abs(w), h: Math.abs(h),
    });
  }

  undo() { return this.strokes.pop(); }
  clear() { this.strokes = []; }
  get count() { return this.strokes.length; }

  paintMask(ctx) {
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const s of this.strokes) {



      if (s.final) continue;
      if (s.type === 'rect') {
        ctx.fillRect(s.x, s.y, s.w, s.h);
      } else {
        ctx.lineWidth = s.radius * 2;
        ctx.beginPath();
        if (s.points.length === 1) {
          ctx.arc(s.points[0].x, s.points[0].y, s.radius, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.moveTo(s.points[0].x, s.points[0].y);
          for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
          ctx.stroke();
        }
      }
    }
  }


  composeInto(target, scale = 1, live = null) {
    const tw = target.width;
    const th = target.height;
    const ctx = target.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, tw, th);
    ctx.drawImage(this.base, 0, 0, tw, th);

    const hasLive = live && ((live.type === 'brush' && live.points.length) || (live.type === 'rect' && Math.abs(live.w) > 1));
    if (!this.strokes.length && !hasLive) { ctx.restore(); return; }
    const k = tw / this.w;
    const plancher = Math.max(2, Math.round(this.block * k));

    const mctx = this.mask.getContext('2d');
    this.paintMask(mctx);
    if (hasLive) {
      mctx.fillStyle = '#fff';
      mctx.strokeStyle = '#fff';
      if (live.type === 'rect') {
        mctx.fillRect(Math.min(live.x, live.x + live.w), Math.min(live.y, live.y + live.h), Math.abs(live.w), Math.abs(live.h));
      } else {
        mctx.lineWidth = live.radius * 2;
        mctx.lineJoin = 'round'; mctx.lineCap = 'round';
        mctx.beginPath();
        mctx.moveTo(live.points[0].x, live.points[0].y);
        for (let i = 1; i < live.points.length; i++) mctx.lineTo(live.points[i].x, live.points[i].y);
        if (live.points.length === 1) { mctx.arc(live.points[0].x, live.points[0].y, live.radius, 0, Math.PI * 2); mctx.fill(); }
        else mctx.stroke();
      }
    }


    const layer = document.createElement('canvas');
    layer.width = tw; layer.height = th;
    const lctx = layer.getContext('2d');
    lctx.imageSmoothingEnabled = false;
    lctx.drawImage(this.floute, 0, 0, tw, th);
    lctx.globalCompositeOperation = 'destination-in';
    lctx.drawImage(this.mask, 0, 0, tw, th);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(layer, 0, 0);
    ctx.restore();















    const aRenforcer = this.strokes.filter((s) => s.type === 'rect');
    if (hasLive && live.type === 'rect') aRenforcer.push(live);
    const lot = [];
    for (const s of aRenforcer) {
      const z = {
        x: Math.min(s.x, s.x + s.w) * k, y: Math.min(s.y, s.y + s.h) * k,
        w: Math.abs(s.w) * k, h: Math.abs(s.h) * k,
      };
      if (!(z.w >= 2) || !(z.h >= 2)) continue;





      const zt = s.final ? z : zoneTete(z, this.elargi);
      lot.push({ ...zt, r: rayonZone(zt, plancher) });
    }

    flouterLot(ctx, target, lot);
  }


  flatten() {
    const out = document.createElement('canvas');
    out.width = this.w; out.height = this.h;
    this.composeInto(out, 1);
    return out;
  }
}
