import { TAU, clamp } from './util';

/**
 * Naga "Kilat" — digambar penuh dengan kurva membulat (tanpa satu pun garis lurus
 * yang kaku), lengkap dengan sayap bergelombang, ekor yang mengalir, dan tanduk.
 */

export interface DragonView {
  time: number;
  pitch: number; // rad, + = moncong menukik ke bawah
  roll: number; // rad, kemiringan badan saat bermanuver
  flap: number; // fase kepakan sayap (rad)
  flapAmp: number; // 0..1 amplitudo kepakan
  glow: number; // 0..1 intensitas kilat
  dead: number; // 0..1 pose jatuh
  dir: number; // 1 = menghadap ke kanan, -1 = ke kiri
  bob: number; // naik-turun halus badan
}

export const DRAGON = {
  back: '#ff9e3d',
  body: '#ffd15a',
  bodyDark: '#e0a52c',
  belly: '#ffefb4',
  mark: '#ff6a4d',
  wing: '#ffc347',
  wingFar: '#cf9124',
  wingEdge: '#fff6d0',
  horn: '#fffaea',
  eye: '#4a2a06',
  eyeGlow: '#fff9e2',
};

type Pt = [number, number];

const rot = (p: Pt, a: number): Pt => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];

/**
 * Membangun bentuk pita (ekor / leher) yang mengecil dari sebuah kurva tengah:
 * sisi atas & sisi bawah dihitung dari normal kurva, lalu dihaluskan kuadratik.
 */
function ribbonPath(pts: Pt[], width: (u: number) => number): Path2D {
  const up: Pt[] = [];
  const lo: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0];
    let ty = b[1] - a[1];
    const d = Math.hypot(tx, ty) || 1;
    tx /= d;
    ty /= d;
    const w = width(i / (pts.length - 1));
    up.push([pts[i][0] - ty * w, pts[i][1] + tx * w]);
    lo.push([pts[i][0] + ty * w, pts[i][1] - tx * w]);
  }
  const smoothRun = (p: Path2D, list: Pt[]) => {
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i];
      const b = list[i + 1];
      p.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    }
    const last = list[list.length - 1];
    p.quadraticCurveTo(last[0], last[1], last[0], last[1]);
  };
  const p = new Path2D();
  p.moveTo(up[0][0], up[0][1]);
  smoothRun(p, up);
  const rev = lo.slice().reverse();
  p.lineTo(rev[0][0], rev[0][1]);
  smoothRun(p, rev);
  p.closePath();
  return p;
}

interface WingShape {
  root: Pt;
  elbow: Pt;
  wrist: Pt;
  tip: Pt;
  m1: Pt;
  m2: Pt;
  back: Pt;
}

function wingShape(ax: number, ay: number, f: number, scale: number): WingShape {
  const root: Pt = [ax, ay];
  const sway = f * 0.5 + 0.16;
  const squash = 0.78 + 0.22 * Math.abs(f); // sayap sedikit memendek saat mengepak
  const L = (x: number, y: number): Pt => add(root, rot([x * scale, y * scale * squash], sway));
  // kerangka sayap: bahu → siku → pergelangan → ujung melengkung ke belakang
  const p: WingShape = {
    root,
    elbow: L(15, -21),
    wrist: L(-4, -44),
    tip: L(-29, -60),
    // titik selaput di tepi belakang (lekukan dalam seperti sayap kelelawar)
    m1: L(-29, -30),
    m2: L(-17, -14),
    back: L(-4, -4),
  };
  return p;
}

function wingPath(w: WingShape): Path2D {
  const p = new Path2D();
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  p.moveTo(w.root[0], w.root[1]);
  // tulang depan yang membulat & tebal
  const e1 = mid(w.root, w.elbow);
  p.quadraticCurveTo(e1[0] + 6, e1[1] - 1, w.elbow[0], w.elbow[1]);
  const e2 = mid(w.elbow, w.wrist);
  p.quadraticCurveTo(e2[0] + 4, e2[1] - 4, w.wrist[0], w.wrist[1]);
  const e3 = mid(w.wrist, w.tip);
  p.quadraticCurveTo(e3[0] + 2, e3[1] - 3, w.tip[0], w.tip[1]);
  // ujung sayap membulat
  p.quadraticCurveTo(w.tip[0] - 7, w.tip[1] + 6, w.m1[0], w.m1[1]);
  // lekukan selaput pertama (menghadap tulang depan)
  p.quadraticCurveTo(mid(w.m1, w.wrist)[0] + 8, mid(w.m1, w.wrist)[1] + 10, mid(w.m1, w.m2)[0], mid(w.m1, w.m2)[1]);
  // lekukan selaput kedua
  p.quadraticCurveTo(mid(w.m2, w.elbow)[0] + 7, mid(w.m2, w.elbow)[1] + 9, w.m2[0], w.m2[1]);
  // pangkal sayap kembali ke bahu
  p.quadraticCurveTo(mid(w.m2, w.back)[0] + 4, mid(w.m2, w.back)[1] + 3, w.back[0], w.back[1]);
  p.quadraticCurveTo(w.root[0] - 6, w.root[1] + 4, w.root[0], w.root[1]);
  p.closePath();
  return p;
}

/**
 * Sang pemberani kecil ("Kilat") yang menunggang di punggung naga —
 * setelan merah dengan sabuk emas dan syal yang berkibar mengikuti angin.
 */
function modelRider(ctx: CanvasRenderingContext2D, t: number, pitch: number, dead: number, glow: number) {
  ctx.save();
  // duduk di punggung, sedikit di belakang bahu sayap
  ctx.translate(-11.5, -13.6 + Math.sin(t * 4.4) * 0.8);
  ctx.scale(1.16, 1.16);
  drawRider(ctx, t, pitch, dead, glow);
  ctx.restore();
}

function drawRider(ctx: CanvasRenderingContext2D, t: number, pitch: number, dead: number, glow: number) {
  const bob = 0;
  ctx.save();
  ctx.translate(0, bob);
  // badan penunggang ikut miring mengikuti naga
  ctx.rotate(-pitch * 0.35 + dead * 0.5);

  const suit = '#e8333f';
  const suitDark = '#a31d2b';
  const gold = '#ffd23f';
  const skin = '#ffd9a8';

  // ---- syal berkibar ke belakang
  ctx.lineCap = 'round';
  ctx.strokeStyle = gold;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-1, -8);
  for (let i = 1; i <= 4; i++) {
    const u = i / 4;
    ctx.lineTo(-2 - u * 17, -8 + u * 3 + Math.sin(t * 9 - i * 1.1) * (1 + u * 2.4));
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-1, -8.4);
  for (let i = 1; i <= 4; i++) {
    const u = i / 4;
    ctx.lineTo(-2 - u * 17, -8.4 + u * 3 + Math.sin(t * 9 - i * 1.1) * (1 + u * 2.4));
  }
  ctx.stroke();

  // ---- kaki mengangkang di punggung naga
  ctx.strokeStyle = suitDark;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -1);
  ctx.quadraticCurveTo(5, 1.5, 8, 4.5);
  ctx.stroke();
  ctx.strokeStyle = '#3a2410';
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(3.4, -0.4);
  ctx.quadraticCurveTo(7, 1.6, 9.4, 3.6);
  ctx.stroke();

  // ---- badan (membungkuk ke depan, aerodinamis)
  ctx.strokeStyle = suit;
  ctx.lineWidth = 5.6;
  ctx.beginPath();
  ctx.moveTo(-0.6, 0);
  ctx.quadraticCurveTo(-3.4, -5.4, -2.2, -9.4);
  ctx.stroke();
  // sabuk emas
  ctx.strokeStyle = gold;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-1.6, -2.6);
  ctx.lineTo(1, -2.1);
  ctx.stroke();

  // ---- lengan memegang leher naga
  ctx.strokeStyle = suit;
  ctx.lineWidth = 3.1;
  ctx.beginPath();
  ctx.moveTo(-1.8, -8.2);
  ctx.quadraticCurveTo(3.4, -8.6, 6.2, -6.2);
  ctx.stroke();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(6.4, -6, 1.5, 0, TAU);
  ctx.fill();

  // ---- kepala + kacamata pelindung
  ctx.fillStyle = suit;
  ctx.beginPath();
  ctx.arc(-2.6, -11.4, 3.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = glow > 0.2 ? '#fff6c8' : '#fffdf3';
  ctx.beginPath();
  ctx.ellipse(0.1, -11.7, 1.9, 1.3, -0.16, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#4a2a06';
  ctx.beginPath();
  ctx.arc(0.5, -11.7, 0.7, 0, TAU);
  ctx.fill();
  // helm kecil
  ctx.fillStyle = gold;
  ctx.beginPath();
  ctx.arc(-3.1, -12.2, 3.6, Math.PI * 1.05, Math.PI * 2.05);
  ctx.fill();

  ctx.restore();
}

// Menggelapkan warna emas untuk ujung sayap (tanpa perlu tabel warna baru)
function shade(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const f = 0.78;
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
}

function drawWing(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  f: number,
  scale: number,
  fill: string,
  alpha: number,
  showBones: boolean,
) {
  const w = wingShape(ax, ay, f, scale);
  const p = wingPath(w);
  ctx.globalAlpha = alpha;
  const g = ctx.createLinearGradient(w.wrist[0], w.wrist[1] - 10, w.m2[0], w.m2[1] + 8);
  g.addColorStop(0, fill);
  g.addColorStop(1, shade(fill));
  ctx.fillStyle = g;
  ctx.fill(p);
  ctx.strokeStyle = 'rgba(0,0,0,0.16)';
  ctx.lineWidth = 1.3;
  ctx.stroke(p);
  if (showBones) {
    // tulang depan sayap yang tegas (satu lengkung saja, halus)
    ctx.strokeStyle = 'rgba(255,255,255,0.42)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(w.root[0], w.root[1]);
    ctx.quadraticCurveTo(w.elbow[0], w.elbow[1], w.wrist[0], w.wrist[1]);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Menggambar naga pada koordinat lokal: (0,0) = titik tumpu tubuh, +x = arah hadap. */
export function drawDragon(ctx: CanvasRenderingContext2D, v: DragonView) {
  const t = v.time;
  const f = Math.sin(v.flap) * v.flapAmp;
  const dead = v.dead;
  const glow = v.glow;
  const bob = v.bob;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.translate(0, bob);
  ctx.rotate(v.roll);

  const tailWave = 1 - 0.7 * dead;

  // ---------------------------------------------------------------- ekor
  const tailPts: Pt[] = [];
  for (let i = 0; i <= 9; i++) {
    const u = i / 9;
    const x = -21 - i * 5.4 - u * u * 3.5;
    const y = -2 + Math.sin(t * 5.2 - i * 0.6) * (2.0 + i * 1.35) * tailWave - i * i * 0.085 + dead * i * 1.6;
    tailPts.push([x, y]);
  }
  const tail = ribbonPath(tailPts, (u) => Math.max(0.6, 5.2 * Math.pow(1 - u, 0.75) + 0.6));
  const tg = ctx.createLinearGradient(-100, 0, -24, 0);
  tg.addColorStop(0, DRAGON.back);
  tg.addColorStop(1, DRAGON.body);
  ctx.fillStyle = tg;
  ctx.fill(tail);

  // duri punggung ekor
  ctx.fillStyle = DRAGON.mark;
  for (let i = 3; i < tailPts.length - 1; i += 2) {
    const u = i / 9;
    const a = tailPts[i - 1];
    const b = tailPts[i + 1];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    ctx.save();
    ctx.translate(tailPts[i][0], tailPts[i][1]);
    ctx.rotate(ang - Math.PI / 2);
    const h = 4.2 * (1 - u) + 1.2;
    ctx.beginPath();
    ctx.moveTo(-2.4, 0);
    ctx.quadraticCurveTo(0, -h * 2, 2.4, 0);
    ctx.fill();
    ctx.restore();
  }

  // sirip ekor (kipas tiga lekuk) di ujung ekor
  const tipP = tailPts[tailPts.length - 1];
  const tipP2 = tailPts[tailPts.length - 2];
  const dirA = Math.atan2(tipP[1] - tipP2[1], tipP[0] - tipP2[0]);
  ctx.save();
  ctx.translate(tipP[0], tipP[1]);
  ctx.rotate(dirA);
  const fin = glow > 0.15 ? '#fff3a0' : DRAGON.mark;
  ctx.fillStyle = fin;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-9, -13, -24, -12);   // lekuk atas
  ctx.quadraticCurveTo(-15, -6, -28, -1);    // lekuk tengah
  ctx.quadraticCurveTo(-15, 4, -24, 12);     // lekuk bawah
  ctx.quadraticCurveTo(-9, 10, 0, 0);
  ctx.fill();
  ctx.strokeStyle = glow > 0.15 ? '#fffbe0' : 'rgba(180,60,40,0.45)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-3, 0);
  ctx.quadraticCurveTo(-13, -3, -24, -12);
  ctx.moveTo(-3, 0);
  ctx.quadraticCurveTo(-15, 0, -28, -1);
  ctx.moveTo(-3, 0);
  ctx.quadraticCurveTo(-13, 3, -24, 12);
  ctx.stroke();
  ctx.restore();

  // ---------------------------------------------------------------- sayap jauh
  drawWing(ctx, -2, -16, -f * 1.0, 0.84, DRAGON.wingFar, 0.95, false);

  // ---------------------------------------------------------------- kaki
  ctx.strokeStyle = DRAGON.bodyDark;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-18, 4);
  ctx.quadraticCurveTo(-26, 8, -28, 15);
  ctx.quadraticCurveTo(-26, 19, -21, 18);
  ctx.stroke();
  ctx.lineWidth = 4.4;
  ctx.beginPath();
  ctx.moveTo(-2, 5);
  ctx.quadraticCurveTo(-8, 10, -9, 16);
  ctx.quadraticCurveTo(-7, 20, -2, 18);
  ctx.stroke();

  // ---------------------------------------------------------------- badan
  ctx.beginPath();
  ctx.moveTo(31, -3);
  ctx.bezierCurveTo(27, -11, 22, -15, 15, -13.5);
  ctx.bezierCurveTo(6, -12.6, -4, -12, -14, -9.6);
  ctx.bezierCurveTo(-22, -7.6, -28, -4.6, -32, -1);
  ctx.bezierCurveTo(-26, 3.4, -19, 6, -11, 6.4);
  ctx.bezierCurveTo(1, 7, 11, 5.4, 18, 3.6);
  ctx.bezierCurveTo(24, 2.4, 28, 1.6, 31, -3);
  ctx.closePath();
  const bg = ctx.createLinearGradient(0, -16, 0, 9);
  bg.addColorStop(0, DRAGON.back);
  bg.addColorStop(0.42, DRAGON.body);
  bg.addColorStop(1, DRAGON.bodyDark);
  ctx.fillStyle = bg;
  ctx.fill();

  // perut krem membulat
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(26, -4.2);
  ctx.bezierCurveTo(20, 2.2, 10, 5.6, -2, 5.4);
  ctx.bezierCurveTo(-14, 5.2, -22, 3.4, -26, 0.4);
  ctx.bezierCurveTo(-18, 3.6, -8, 4.6, 2, 4.4);
  ctx.bezierCurveTo(12, 4.2, 21, 1.6, 26, -4.2);
  ctx.closePath();
  ctx.fillStyle = DRAGON.belly;
  ctx.globalAlpha = 0.92;
  ctx.fill();
  ctx.restore();

  // sisik punggung
  ctx.fillStyle = DRAGON.mark;
  for (let i = 0; i < 6; i++) {
    const u = i / 5;
    const x = 8 - u * 38;
    const y = -11.6 + u * 3.2 + Math.sin(u * 3) * 0.6;
    ctx.beginPath();
    ctx.moveTo(x - 4.4, y + 1.6);
    ctx.quadraticCurveTo(x, y - 5.4 - u * 1.6, x + 4.4, y + 1.6);
    ctx.quadraticCurveTo(x, y + 1.1, x - 4.4, y + 1.6);
    ctx.fill();
  }

  // ---------------------------------------------------------------- sayap dekat
  drawWing(ctx, -9, -12, f, 1.12, DRAGON.wing, 1, true);

  // ---------------------------------------------------------------- kepala
  ctx.save();
  ctx.translate(20, -6);
  ctx.rotate(-0.06 + (1 - clamp(v.pitch * 2.2, -1, 1)) * 0.04);

  // tanduk melengkung
  ctx.strokeStyle = DRAGON.horn;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(2, -8);
  ctx.quadraticCurveTo(-6, -17, -18, -19.5);
  ctx.stroke();
  ctx.strokeStyle = '#f0e2b8';
  ctx.lineWidth = 2.1;
  ctx.beginPath();
  ctx.moveTo(-1, -6.5);
  ctx.quadraticCurveTo(-8, -13.5, -17, -15);
  ctx.stroke();

  // sirip pipi
  ctx.fillStyle = DRAGON.mark;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(-4, -3);
  ctx.quadraticCurveTo(-13, -6, -19, -2.5);
  ctx.quadraticCurveTo(-12, -1.4, -4.5, 1.4);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  // mata bersinar
  ctx.fillStyle = glow > 0.2 ? '#fff6c8' : '#fffdf2';
  ctx.beginPath();
  ctx.ellipse(3.4, -3.2, 3.1, 2.6, -0.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = DRAGON.eye;
  ctx.beginPath();
  ctx.ellipse(4.3, -3.1, 1.5, 2.1, -0.15, 0, TAU);
  ctx.fill();
  if (glow > 0.2) {
    ctx.fillStyle = `rgba(255,244,180,${0.75 * glow})`;
    ctx.beginPath();
    ctx.arc(3.4, -3.2, 5.4, 0, TAU);
    ctx.fill();
  }
  // moncong & lubang hidung
  ctx.fillStyle = 'rgba(120,60,20,0.5)';
  ctx.beginPath();
  ctx.arc(10.4, 0.2, 1.1, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(140,70,20,0.45)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(2.5, 2.4);
  ctx.quadraticCurveTo(7.5, 3.4, 11, 1.4);
  ctx.stroke();
  ctx.restore();

  // ---------------------------------------------------------------- penunggang
  modelRider(ctx, t, v.pitch, dead, glow);

  // ---------------------------------------------------------------- kilat menempel
  if (glow > 0.05) {
    ctx.globalAlpha = glow * 0.75;
    ctx.strokeStyle = '#fff8dc';
    ctx.lineWidth = 1.6;
    const seed = Math.floor(t * 22);
    for (let b = 0; b < 2; b++) {
      ctx.beginPath();
      ctx.moveTo(-6 - b * 4, -6 + b * 4);
      for (let i = 1; i <= 5; i++) {
        ctx.lineTo(-6 - b * 4 - i * 7, -6 + b * 4 + (Math.sin(seed * 2.7 + i * 1.9 + b * 5) * 8));
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}
