import { clamp } from './util';

// Panjang segmen tubuh
const L1 = 18; // paha
const L2 = 18; // betis
const LT = 22; // badan
const LH = 10.5; // leher ke pusat kepala
const UA = 12; // lengan atas
const FA = 12; // lengan bawah

interface Pose {
  hx: number;
  hy: number;
  t: number; // sudut badan dari vertikal (+ = condong ke depan)
  ht: number; // kemiringan kepala relatif badan
  l1a: number; // paha dekat (sudut dari 'bawah', + = ke depan)
  l1b: number; // betis dekat
  l2a: number;
  l2b: number;
  a1a: number;
  a1b: number;
  a2a: number;
  a2b: number;
}

export interface RunnerView {
  phase: number;
  lean: number; // 0..1
  vy: number;
  wAir: number;
  wSlide: number;
  wDead: number;
  airTime?: number;
  ragdollFlail?: number;
}

function legIK(hx: number, hy: number, fx: number, fy: number): [number, number] {
  const dx = fx - hx;
  const dy = fy - hy;
  const maxD = L1 + L2 - 0.4;
  const d = Math.max(6, Math.min(maxD, Math.hypot(dx, dy)));
  const line = Math.atan2(dx, dy);
  const A = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const B = Math.acos(clamp((L2 * L2 + d * d - L1 * L1) / (2 * L2 * d), -1, 1));
  return [line + A, line - B];
}

function runPose(phase: number, lean: number): Pose {
  const A = 16 + 8 * lean;
  const lift = 11 + 9 * lean;
  const hipH = 27.5 - 3.5 * lean;
  const hx = 0;
  const hy = -(hipH + 1.4 * Math.cos(2 * phase + 0.6));
  const legs: number[] = [];
  for (const off of [0, Math.PI]) {
    const p = phase + off;
    const fx = -3 + A * Math.cos(p);
    const fy = -lift * Math.max(0, -Math.sin(p));
    const [a, b] = legIK(hx, hy, fx, fy);
    legs.push(a, b);
  }
  const swing = 0.55 * (1 - 0.55 * lean);
  const base = -0.15 - 0.95 * lean;
  const c1 = Math.cos(phase);
  const a1a = base - swing * c1;
  const a2a = base + swing * c1;
  const flex = 1.3 - 0.7 * lean;
  return {
    hx,
    hy,
    t: 0.2 + 0.32 * lean,
    ht: 0.12,
    l1a: legs[0],
    l1b: legs[1],
    l2a: legs[2],
    l2b: legs[3],
    a1a,
    a1b: a1a + flex,
    a2a,
    a2b: a2a + flex,
  };
}

function airPose(vyn: number): Pose {
  const f = Math.max(0, vyn); // intensitas jatuh (0..1.4)
  const r = Math.max(0, -vyn); // intensitas meluncur naik (0..1.4)

  // Postur atletis dan heroik pelari cepat (tegak, aerodinamis, bertenaga)
  const t = 0.36 + 0.14 * r - 0.08 * f; // badan condong ke depan mantap
  const ht = 0.06 - 0.04 * r + 0.08 * f; // kepala fokus menatap lurus ke depan

  const hx = 0;
  const hy = -(29.2 + 2.2 * f - 1.5 * r);

  // Kaki atletis: lutut depan terangkat bertenaga, kaki belakang menjulur lurus
  const l1a = 0.98 - 0.42 * f + 0.28 * r;
  const l1b = l1a - (1.45 - 0.8 * f);

  const l2a = -0.72 - 0.25 * r + 0.35 * f;
  const l2b = -1.15 + 0.55 * f;

  // Lengan bertenaga: lengan depan tertekuk siap menerjang, lengan belakang mengimbangi
  const a1a = -0.65 - 0.32 * r + 0.4 * f;
  const a1b = a1a + 1.25;

  const a2a = 0.88 + 0.28 * r - 0.25 * f;
  const a2b = a2a + 0.85;

  return {
    hx,
    hy,
    t,
    ht,
    l1a,
    l1b,
    l2a,
    l2b,
    a1a,
    a1b,
    a2a,
    a2b,
  };
}

const SLIDE: Pose = {
  hx: -4,
  hy: -11,
  t: -1.1,
  ht: 0.55,
  l1a: 1.45,
  l1b: 1.5,
  l2a: 1.3,
  l2b: -1.4,
  a1a: -0.3,
  a1b: -0.5,
  a2a: -0.15,
  a2b: -0.3,
};

const DEAD: Pose = {
  hx: 0,
  hy: -24,
  t: -0.15,
  ht: -0.2,
  l1a: 0.9,
  l1b: 0.2,
  l2a: -0.6,
  l2b: -1.3,
  a1a: 2.3,
  a1b: 2.7,
  a2a: -2.0,
  a2b: -2.4,
};

function mixPose(a: Pose, b: Pose, t: number): Pose {
  if (t <= 0.001) return a;
  const o = {} as Pose;
  for (const k of Object.keys(a) as (keyof Pose)[]) o[k] = a[k] + (b[k] - a[k]) * t;
  return o;
}

const fx = (x: number, len: number, a: number) => x + len * Math.sin(a);
const fy = (y: number, len: number, a: number) => y + len * Math.cos(a);

/**
 * Menggambar pelari dalam koordinat lokal: titik (0,0) = telapak kaki, +x = arah lari, y negatif = ke atas.
 */
export function drawRunner(ctx: CanvasRenderingContext2D, v: RunnerView, tint: string | null) {
  let pose = runPose(v.phase, v.lean);
  pose = mixPose(pose, airPose(clamp(v.vy / 650, -1.4, 1.4)), v.wAir);
  pose = mixPose(pose, SLIDE, v.wSlide);
  pose = mixPose(pose, DEAD, v.wDead);

  const main = tint ?? '#e8333f';
  const dark = tint ?? '#a31d2b';
  const gold = tint ?? '#ffd23f';
  const visor = tint ?? '#fff6c8';

  const hx = pose.hx;
  const hy = pose.hy;
  const shx = hx + LT * Math.sin(pose.t);
  const shy = hy - LT * Math.cos(pose.t);
  const hdx = shx + LH * Math.sin(pose.t + pose.ht);
  const hdy = shy - LH * Math.cos(pose.t + pose.ht);

  const k1x = fx(hx, L1, pose.l1a);
  const k1y = fy(hy, L1, pose.l1a);
  const f1x = fx(k1x, L2, pose.l1b);
  const f1y = fy(k1y, L2, pose.l1b);
  const k2x = fx(hx, L1, pose.l2a);
  const k2y = fy(hy, L1, pose.l2a);
  const f2x = fx(k2x, L2, pose.l2b);
  const f2y = fy(k2y, L2, pose.l2b);

  const e1x = fx(shx, UA, pose.a1a);
  const e1y = fy(shy, UA, pose.a1a);
  const h1x = fx(e1x, FA, pose.a1b);
  const h1y = fy(e1y, FA, pose.a1b);
  const e2x = fx(shx, UA, pose.a2a);
  const e2y = fy(shy, UA, pose.a2a);
  const h2x = fx(e2x, FA, pose.a2b);
  const h2y = fy(e2y, FA, pose.a2b);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const limb = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    w: number,
    col: string,
  ) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  const boot = (kx: number, ky: number, ex: number, ey: number, w: number) => {
    ctx.strokeStyle = gold;
    ctx.lineWidth = w + 0.6;
    ctx.beginPath();
    ctx.moveTo(kx + (ex - kx) * 0.5, ky + (ey - ky) * 0.5);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.arc(ex + 2, ey - 0.4, 3.6, 0, Math.PI * 2);
    ctx.fill();
  };

  // lengan & kaki jauh (lebih gelap)
  limb(shx, shy, e2x, e2y, h2x, h2y, 5.6, dark);
  ctx.fillStyle = tint ?? '#c99a2a';
  ctx.beginPath();
  ctx.arc(h2x, h2y, 3, 0, Math.PI * 2);
  ctx.fill();
  limb(hx, hy, k2x, k2y, f2x, f2y, 7, dark);
  boot(k2x, k2y, f2x, f2y, 7);

  // badan
  const dx = Math.sin(pose.t);
  const dy = -Math.cos(pose.t);
  ctx.strokeStyle = main;
  ctx.lineWidth = 12.5;
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(shx, shy);
  ctx.stroke();
  ctx.fillStyle = main;
  ctx.beginPath();
  ctx.arc(hx, hy, 7, 0, Math.PI * 2);
  ctx.fill();
  // sabuk emas
  ctx.lineCap = 'butt';
  ctx.strokeStyle = gold;
  ctx.lineWidth = 12.8;
  ctx.beginPath();
  ctx.moveTo(hx + dx * 3, hy + dy * 3);
  ctx.lineTo(hx + dx * 6, hy + dy * 6);
  ctx.stroke();
  ctx.lineCap = 'round';
  // lambang petir di dada
  ctx.save();
  ctx.translate(hx + dx * 14, hy + dy * 14);
  ctx.rotate(pose.t);
  ctx.fillStyle = gold;
  ctx.beginPath();
  ctx.moveTo(1.8, -6.5);
  ctx.lineTo(-3.2, 0.6);
  ctx.lineTo(-0.2, 0.6);
  ctx.lineTo(-1.8, 6.5);
  ctx.lineTo(3.4, -1.2);
  ctx.lineTo(0.4, -1.2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // kepala
  ctx.save();
  ctx.translate(hdx, hdy);
  ctx.rotate(pose.t + pose.ht);
  ctx.fillStyle = gold;
  ctx.beginPath();
  ctx.moveTo(-5, -3.5);
  ctx.lineTo(-18, -10);
  ctx.lineTo(-6.5, 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-4.5, -0.5);
  ctx.lineTo(-17, -4);
  ctx.lineTo(-6.5, 3.2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = main;
  ctx.beginPath();
  ctx.arc(0, 0, 8.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = visor;
  ctx.beginPath();
  ctx.ellipse(3.8, -1.2, 3.6, 1.9, -0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // kaki & lengan dekat
  limb(hx, hy, k1x, k1y, f1x, f1y, 7.6, main);
  boot(k1x, k1y, f1x, f1y, 7.6);
  limb(shx, shy, e1x, e1y, h1x, h1y, 6, main);
  ctx.fillStyle = gold;
  ctx.beginPath();
  ctx.arc(h1x, h1y, 3.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
