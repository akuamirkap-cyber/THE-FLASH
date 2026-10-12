import { H, W } from './config';
import { Palette } from './palette';
import { TAU, css, hash, mix, mod } from './util';

type LayerKey = 'l1' | 'l2' | 'l3' | 'l4';

interface Layer {
  par: number;
  base: number;
  amp: number;
  f1: number;
  f2: number;
  f3: number;
  p1: number;
  p2: number;
  p3: number;
  ridge: boolean;
  key: LayerKey;
  featScale: number;
  featProb: number;
}

const LAYERS: Layer[] = [
  { par: 0.04, base: 505, amp: 72, f1: 0.0052, f2: 0.011, f3: 0.023, p1: 0.4, p2: 1.7, p3: 2.9, ridge: true, key: 'l1', featScale: 0.62, featProb: 0.42 },
  { par: 0.09, base: 548, amp: 56, f1: 0.0041, f2: 0.0093, f3: 0.019, p1: 2.2, p2: 0.3, p3: 1.1, ridge: false, key: 'l2', featScale: 0.8, featProb: 0.42 },
  { par: 0.17, base: 592, amp: 44, f1: 0.0036, f2: 0.0081, f3: 0.017, p1: 4.1, p2: 2.6, p3: 0.2, ridge: false, key: 'l3', featScale: 1.0, featProb: 0.34 },
  { par: 0.3, base: 630, amp: 34, f1: 0.0031, f2: 0.0072, f3: 0.015, p1: 1.3, p2: 3.7, p3: 2.2, ridge: false, key: 'l4', featScale: 1.2, featProb: 0.26 },
];

function layerY(L: Layer, wx: number, camY: number, screenX = 0): number {
  const a = L.ridge ? (0.5 - Math.abs(Math.sin(wx * L.f1 + L.p1))) * 2 : Math.sin(wx * L.f1 + L.p1);
  const h = 0.55 * a + 0.3 * Math.sin(wx * L.f2 + L.p2) + 0.15 * Math.sin(wx * L.f3 + L.p3);
  // Kemiringan lereng gunung di cakrawala (menurun ke kanan bawah, konsisten dengan lereng pemain)
  const mountainTilt = (screenX - W * 0.45) * 0.08 * (0.3 + L.par);
  return L.base + mountainTilt - L.amp * h - camY * L.par * 0.6;
}

const STARS = Array.from({ length: 90 }, (_, i) => ({
  x: hash(i * 3.1 + 1) * W,
  y: hash(i * 7.7 + 2) * H * 0.56,
  s: hash(i * 9.1 + 3) > 0.88 ? 2 : 1.2,
  b: 0.3 + 0.7 * hash(i * 5.3 + 4),
  r: 1 + hash(i * 1.3 + 5) * 2,
}));

function drawFeature(ctx: CanvasRenderingContext2D, type: number, x: number, y: number, sc: number) {
  ctx.beginPath();
  if (type === 0) {
    // piramida
    const w = 150 * sc;
    const h = 72 * sc;
    ctx.moveTo(x - w / 2, y + 22);
    ctx.lineTo(x - w * 0.02, y - h);
    ctx.lineTo(x + w * 0.04, y - h);
    ctx.lineTo(x + w / 2, y + 22);
  } else if (type === 1) {
    // obelisk
    const w = 15 * sc;
    const h = 120 * sc;
    ctx.moveTo(x - w / 2, y + 22);
    ctx.lineTo(x - w * 0.36, y - h);
    ctx.lineTo(x, y - h - 12 * sc);
    ctx.lineTo(x + w * 0.36, y - h);
    ctx.lineTo(x + w / 2, y + 22);
  } else if (type === 2) {
    // gerbang reruntuhan
    const pw = 12 * sc;
    const ph = 84 * sc;
    const gap = 46 * sc;
    ctx.rect(x - gap / 2 - pw, y - ph, pw, ph + 22);
    ctx.rect(x + gap / 2, y - ph, pw, ph + 22);
    ctx.rect(x - gap / 2 - pw - 8 * sc, y - ph - 13 * sc, gap + pw * 2 + 16 * sc, 13 * sc);
  } else {
    // menara bertingkat
    ctx.rect(x - 30 * sc, y - 28 * sc, 60 * sc, 50 * sc);
    ctx.rect(x - 22 * sc, y - 54 * sc, 44 * sc, 26 * sc);
    ctx.rect(x - 14 * sc, y - 78 * sc, 28 * sc, 24 * sc);
    ctx.moveTo(x - 14 * sc, y - 78 * sc);
    ctx.lineTo(x, y - 104 * sc);
    ctx.lineTo(x + 14 * sc, y - 78 * sc);
  }
  ctx.fill();
}

function drawHotAirBalloon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sc: number,
  pal: Palette,
  seed: number,
  time: number,
) {
  const c = pal.c;
  ctx.save();
  ctx.translate(x, y);

  const bob = Math.sin(time * 0.8 + seed) * 4 * sc;
  ctx.translate(0, bob);

  const bw = 24 * sc;
  const bh = 32 * sc;

  // Tubuh balon udara
  ctx.beginPath();
  ctx.moveTo(0, -bh);
  ctx.bezierCurveTo(bw * 1.25, -bh, bw * 1.15, 0, bw * 0.38, bh * 0.38);
  ctx.lineTo(bw * 0.28, bh * 0.52);
  ctx.lineTo(-bw * 0.28, bh * 0.52);
  ctx.lineTo(-bw * 0.38, bh * 0.38);
  ctx.bezierCurveTo(-bw * 1.15, 0, -bw * 1.25, -bh, 0, -bh);
  ctx.closePath();

  const bg = ctx.createLinearGradient(0, -bh, 0, bh * 0.52);
  bg.addColorStop(0, css(c.sun, 0.95));
  bg.addColorStop(0.5, css(mix(c.rim, c.l1, 0.4), 0.9));
  bg.addColorStop(1, css(c.obs, 0.85));
  ctx.fillStyle = bg;
  ctx.fill();

  // Garis pola lengkung vertikal
  ctx.strokeStyle = css(c.skyTop, 0.25);
  ctx.lineWidth = 1.2 * sc;
  ctx.beginPath();
  ctx.moveTo(0, -bh);
  ctx.quadraticCurveTo(bw * 0.5, -bh * 0.3, 0, bh * 0.52);
  ctx.moveTo(0, -bh);
  ctx.quadraticCurveTo(-bw * 0.5, -bh * 0.3, 0, bh * 0.52);
  ctx.stroke();

  // Nyala api kompor (burner flame glow)
  const flameGlow = ctx.createRadialGradient(0, bh * 0.56, 1, 0, bh * 0.56, 10 * sc);
  flameGlow.addColorStop(0, 'rgba(255,220,100,0.85)');
  flameGlow.addColorStop(1, 'rgba(255,160,40,0)');
  ctx.fillStyle = flameGlow;
  ctx.fillRect(-12 * sc, bh * 0.4, 24 * sc, 20 * sc);

  // Tali gantungan keranjang
  ctx.strokeStyle = css(c.obs, 0.55);
  ctx.lineWidth = 1 * sc;
  ctx.beginPath();
  ctx.moveTo(-bw * 0.22, bh * 0.52);
  ctx.lineTo(-bw * 0.16, bh * 0.76);
  ctx.moveTo(bw * 0.22, bh * 0.52);
  ctx.lineTo(bw * 0.16, bh * 0.76);
  ctx.stroke();

  // Keranjang penumpang
  const basketW = bw * 0.36;
  const basketH = bh * 0.22;
  const basketY = bh * 0.76;
  ctx.fillStyle = css(c.obs, 0.85);
  ctx.fillRect(-basketW / 2, basketY, basketW, basketH);

  // Tali bendera pita trailing di angin gurun (Alto's Odyssey ribbon)
  const trailLen = 42 * sc;
  ctx.strokeStyle = css(c.rim, 0.65);
  ctx.lineWidth = 1.2 * sc;
  ctx.beginPath();
  ctx.moveTo(0, basketY + basketH);
  for (let t = 1; t <= 4; t++) {
    const tx = -t * (trailLen / 4) + Math.sin(time * 3 + seed + t) * 3 * sc;
    const ty = basketY + basketH + t * 6 * sc;
    ctx.lineTo(tx, ty);
  }
  ctx.stroke();

  ctx.restore();
}

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  camX: number,
  camY: number,
  time: number,
  boost: number,
  speed: number,
  _zoom = 1,
) {
  const c = pal.c;
  const boundX0 = -W * 1.4;
  const boundX1 = W * 2.4;
  const boundY0 = -H * 0.8;
  const boundY1 = H * 1.8;

  // ---- Langit ----
  const sky = ctx.createLinearGradient(0, boundY0, 0, H * 0.88);
  sky.addColorStop(0, css(c.skyTop));
  sky.addColorStop(0.5, css(c.skyMid));
  sky.addColorStop(1, css(c.skyBot));
  ctx.fillStyle = sky;
  ctx.fillRect(boundX0, boundY0, boundX1 - boundX0, boundY1 - boundY0);

  // ---- Bintang ----
  if (pal.stars > 0.02) {
    const starSpan = W * 2;
    for (let i = 0; i < STARS.length; i++) {
      const s = STARS[i];
      const x = mod(s.x - camX * 0.01 + boundX0, starSpan) + boundX0;
      const tw = 0.55 + 0.45 * Math.sin(time * s.r + i);
      const fadeY = 1 - s.y / (H * 0.7);
      ctx.fillStyle = `rgba(255,255,255,${(pal.stars * tw * s.b * fadeY).toFixed(3)})`;
      ctx.fillRect(x, s.y, s.s, s.s);
      ctx.fillRect(x + starSpan, s.y, s.s, s.s);
    }
  }

  // ---- Matahari / bulan ----
  const sx = pal.sunX * W;
  const sy = pal.sunY * H - camY * 0.03;
  const r = pal.sunR;
  const glow = ctx.createRadialGradient(sx, sy, r * 0.6, sx, sy, r * 8.5);
  glow.addColorStop(0, css(c.glow, 0.85));
  glow.addColorStop(0.3, css(c.glow, 0.3));
  glow.addColorStop(1, css(c.glow, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(boundX0, boundY0, boundX1 - boundX0, boundY1 - boundY0);
  ctx.strokeStyle = css(c.sun, 0.18);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sx, sy, r * 1.38, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = css(c.sun);
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, TAU);
  ctx.fill();
  if (pal.moon > 0.05) {
    ctx.fillStyle = css(c.glow, 0.22 * pal.moon);
    ctx.beginPath();
    ctx.arc(sx - r * 0.3, sy - r * 0.2, r * 0.22, 0, TAU);
    ctx.arc(sx + r * 0.32, sy + r * 0.28, r * 0.15, 0, TAU);
    ctx.arc(sx + r * 0.1, sy - r * 0.5, r * 0.1, 0, TAU);
    ctx.fill();
  }

  // ---- Awan panjang tipis ----
  const cloudCol = mix(c.skyBot, c.sun, 0.35);
  const cloudShade = mix(c.skyMid, c.l1, 0.5);
  for (let i = 0; i < 9; i++) {
    const w = 190 + hash(i * 2.9) * 320;
    const h = 8 + hash(i * 8.3) * 14;
    const par = 0.03 + hash(i * 1.7) * 0.05;
    const drift = 5 + hash(i * 4.1) * 9;
    const x = mod(hash(i * 13.3) * (W + 1200) - camX * par - time * drift, W + 1200) - 500;
    const y = 80 + hash(i * 5.1) * 360 - camY * 0.02;
    ctx.fillStyle = css(cloudShade, 0.16);
    ctx.beginPath();
    ctx.ellipse(x + 6, y + h * 0.7, w / 2, h * 0.8, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = css(cloudCol, 0.3);
    ctx.beginPath();
    ctx.ellipse(x, y, w / 2, h, 0, 0, TAU);
    ctx.ellipse(x + w * 0.12, y - h * 0.55, w * 0.3, h * 0.8, 0, 0, TAU);
    ctx.fill();
  }

  // ---- Burung ----
  ctx.strokeStyle = css(c.obs, 0.5);
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  for (let f = 0; f < 3; f++) {
    const fx = mod(f * 330 - camX * 0.12 + time * (30 + f * 6) + f * 90, W + 1000) - 300;
    const fy = 150 + f * 85 + 18 * Math.sin(time * 0.3 + f) - camY * 0.05;
    for (let k = 0; k < 5; k++) {
      const bx = fx + k * 24 - (k % 2) * 6;
      const by = fy + Math.abs(k - 2) * 13 + Math.sin(time * 1.7 + k + f) * 3;
      const wing = Math.sin(time * 7 + k * 1.3 + f * 2) * 5;
      ctx.beginPath();
      ctx.moveTo(bx - 9, by - 3 + wing);
      ctx.quadraticCurveTo(bx - 4, by - 5 - wing, bx, by);
      ctx.quadraticCurveTo(bx + 4, by - 5 - wing, bx + 9, by - 3 + wing);
      ctx.stroke();
    }
  }

  // ---- Balon Udara Gurun (Hot Air Balloons khas Alto's Odyssey) ----
  const balloonCount = 4;
  for (let bi = 0; bi < balloonCount; bi++) {
    const bpar = 0.05 + bi * 0.04;
    const bdrift = 5 + bi * 3;
    const span = W + 1400;
    const bx = mod(hash(bi * 9.7 + 12) * span - camX * bpar - time * bdrift, span) - 350;
    const by = 135 + hash(bi * 4.3 + 7) * 220 - camY * 0.04;
    const bscale = 0.52 + hash(bi * 3.1) * 0.42;
    drawHotAirBalloon(ctx, bx, by, bscale, pal, bi * 13, time);
  }

  // ---- Lapisan pegunungan / bukit pasir ----
  for (let li = 0; li < LAYERS.length; li++) {
    const L = LAYERS[li];
    const col = c[L.key];
    const offset = camX * L.par;

    // Fitur siluet
    const cellW = 640;
    const first = Math.floor((offset + boundX0 - 100) / cellW);
    const last = Math.floor((offset + boundX1 + 100) / cellW);
    ctx.fillStyle = css(col);
    for (let ci = first; ci <= last; ci++) {
      if (hash(ci * 1.37 + li * 19.1) > L.featProb) continue;
      const wx = ci * cellW + hash(ci * 3.3 + li * 7.7) * cellW * 0.8;
      const fxs = wx - offset;
      const fy = layerY(L, wx, camY, fxs);
      const type = Math.floor(hash(ci * 5.5 + li * 3.3) * 4);
      drawFeature(ctx, type, fxs, fy, L.featScale);
    }

    // Isian lapisan
    const top = L.base - L.amp - 30;
    const g = ctx.createLinearGradient(0, top, 0, L.base + 380);
    g.addColorStop(0, css(col));
    g.addColorStop(1, css(mix(col, c.haze, 0.7)));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(boundX0, boundY1);
    for (let x = boundX0; x <= boundX1; x += 14) {
      ctx.lineTo(x, layerY(L, x + offset, camY, x));
    }
    ctx.lineTo(boundX1, boundY1);
    ctx.closePath();
    ctx.fill();

    // Pita angin tipis di antara lapisan
    if (li === 1 || li === 2) {
      ctx.strokeStyle = css(c.sun, 0.07);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = boundX0; x <= boundX1; x += 14) {
        const y = layerY(L, x + offset, camY, x) + 26 + 5 * Math.sin((x + offset) * 0.02);
        if (x === boundX0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  // ---- Pita angin (kecepatan & boost) ----
  const sf = Math.min(1, speed / 700);
  const windCount = boost > 0.1 ? 24 : 12;
  for (let i = 0; i < windCount; i++) {
    const y = 80 + hash(i * 6.1) * 620;
    const len = (120 + hash(i * 2.3) * 220) * (1 + boost * 0.8);
    const par = 1.0 + hash(i * 8.9) * 0.9;
    const x = mod(hash(i * 3.7) * (boundX1 - boundX0 + 400) - camX * par, boundX1 - boundX0 + 400) + boundX0 - 200;
    const a = (0.06 + 0.1 * hash(i * 4.3)) * (0.5 + sf) + boost * 0.18;
    ctx.strokeStyle = boost > 0.4 ? 'rgba(255,230,120,' + a + ')' : css(c.sun, a);
    ctx.lineWidth = boost > 0.4 ? 2.4 : 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + len * 0.5, y - 10 - 8 * Math.sin(time + i), x + len, y);
    ctx.stroke();
  }
}
