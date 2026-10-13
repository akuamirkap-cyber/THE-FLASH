import {
  ALT_SOFT,
  BELLY,
  BODY_R,
  BOOST_DRAIN,
  BOOST_FLOOR,
  BOOST_MIN,
  BOOST_MULT_MAX,
  BOOST_MULT_MIN,
  BOOST_RAMP,
  BOOST_REGEN,
  CLIMB_ACC,
  CLIMB_V,
  DIVE_ACC,
  DIVE_V,
  FLY_Y,
  GLIDE_ACC,
  GS,
  H,
  LIFT,
  MAX_ALT,
  NOSE,
  ORB_GAIN,
  PSX,
  PX_PER_M,
  SINK_V,
  SLAM_V,
  STEP,
  W,
  baseSpeed,
} from './config';
import { DOWNHILL_SLOPE, groundY, slopeAt } from './terrain';
import { Palette, paletteAt } from './palette';
import { drawBackground } from './background';
import { drawDragon, DragonView } from './dragon';
import { Sfx } from './audio';
import { TAU, clamp, css, hash, lerp, mix, mod, rand, smooth } from './util';

export type GameState = 'menu' | 'playing' | 'paused' | 'dying' | 'over';

export interface Hud {
  dist: number;
  speed: number;
  orbs: number;
  meter: number;
  boosting: boolean;
  ready: boolean;
  boostMult?: number;
  alt: number; // ketinggian terbang di atas lereng (meter)
}

export interface Summary {
  dist: number;
  orbs: number;
  best: number;
  isBest: boolean;
  smashed: number;
}

export interface Callbacks {
  onHud: (h: Hud) => void;
  onState: (s: GameState, summary?: Summary) => void;
}

interface Rock {
  kind: 'rock';
  x: number;
  w: number;
  h: number;
  pts: number[][];
  dead: boolean;
}

interface Boulder {
  kind: 'boulder';
  x: number;
  r: number;
  vx: number;
  rot: number;
  dustT: number;
  dead: boolean;
}

type Obstacle = Rock | Boulder;

interface Orb {
  x: number;
  y: number;
  taken: boolean;
  ph: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: 0 | 1 | 2 | 3; // debu, percikan, serpihan, cincin
  g: number;
  rot: number;
  vr: number;
}

/** Naga yang dikendalikan pemain (terbang, tidak lagi berlari di tanah). */
interface Player {
  x: number;
  y: number;
  vy: number;
  vx: number; // dipakai saat ragdoll/terhempas
  pitch: number;
  roll: number;
  flap: number;
  flapAmp: number;
  bobT: number;
  dustT: number;
  spin: number;
  dead: number;
  landT: number; // sisa waktu efek "nyaris menabrak tanah"
}

interface Ghost {
  x: number;
  y: number;
  pitch: number;
  view: DragonView;
  life: number;
}

const GHOST_LIFE = 0.28;

function newPlayer(): Player {
  return {
    x: 0,
    y: 0,
    vy: 0,
    vx: 0,
    pitch: 0,
    roll: 0,
    flap: 0,
    flapAmp: 0.6,
    bobT: 0,
    dustT: 0,
    spin: 0,
    dead: 0,
    landT: 0,
  };
}

function rockProfile(pts: number[][], u: number): number {
  for (let i = 1; i < pts.length; i++) {
    if (u <= pts[i][0]) {
      const a = pts[i - 1];
      const b = pts[i];
      const t = (u - a[0]) / Math.max(1e-6, b[0] - a[0]);
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return 0;
}

function makeRockPts(): number[][] {
  const n = 6 + Math.floor(Math.random() * 3);
  const pu = rand(0.35, 0.65);
  const inner: number[][] = [];
  let maxV = 0;
  for (let i = 1; i < n - 1; i++) {
    const u = clamp(i / (n - 1) + rand(-0.04, 0.04), 0.04, 0.96);
    const v = clamp(1 - Math.abs(u - pu) * 1.35 + rand(-0.12, 0.1), 0.28, 1);
    inner.push([u, v]);
    maxV = Math.max(maxV, v);
  }
  const pts: number[][] = [[0, 0]];
  for (const [u, v] of inner) pts.push([u, v / maxV]);
  pts.push([1, 0]);
  return pts;
}

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cb: Callbacks;
  private sfx = new Sfx();
  private raf = 0;
  private last = 0;
  private acc = 0;
  private scale = 1;
  private disposed = false;

  state: GameState = 'menu';
  private time = 0;
  private p: Player = newPlayer();
  private speed = 400;
  private camX = 0;
  private camY = 0;
  private tod = 0;
  private todDrift = 0;
  private dist = 0;

  private obstacles: Obstacle[] = [];
  private orbList: Orb[] = [];
  private events: number[] = [];
  private particles: Particle[] = [];
  private ghosts: Ghost[] = [];

  private nextX = 1500;
  private lastEnd = 0;
  private lastKind = '';
  private spawning = false;
  private cleanT = 0;

  // Input: atas (naik) & bawah (turun) + panjer kilat
  private upHeld = false;
  private downHeld = false;
  private boostHeld = false;

  private flapSlow = 0;
  private everInput = false;
  private orbs = 0;
  private meter = 0.42;
  private boostT = 0;
  private boostK = 0;
  private boostHoldT = 0;
  private boostMult = 1.0;
  private camZoom = 1.0;
  private invuln = 0;
  private smashed = 0;
  private shake = 0;
  private flash = 0;
  private fade = 0;
  private dyingT = 0;
  private deathKind: 'ground' | 'hit' = 'hit';
  private ghostT = 0;
  private hudT = 0;
  private best = 0;

  private dustCss = 'rgb(255,220,200)';
  private obsCss = 'rgb(40,30,60)';

  constructor(canvas: HTMLCanvasElement, cb: Callbacks) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D tidak tersedia');
    this.canvas = canvas;
    this.ctx = ctx;
    this.cb = cb;
    try {
      this.best = Number(localStorage.getItem('kilat-best') || 0) || 0;
    } catch {
      this.best = 0;
    }
    this.resetWorld(false);
    document.addEventListener('visibilitychange', this.onVis);
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---------------------------------------------------------------- API publik

  resize(cssWidth: number, dpr: number) {
    const w = Math.max(2, Math.round(cssWidth * dpr));
    this.canvas.width = w;
    this.canvas.height = Math.round((w * 16) / 9);
    this.scale = this.canvas.width / W;
  }

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onVis);
  }

  getBest(): number {
    return this.best;
  }

  setMuted(m: boolean) {
    this.sfx.setMuted(m);
  }

  unlockAudio() {
    this.sfx.init();
  }

  start() {
    this.sfx.init();
    this.resetWorld(true);
    this.state = 'playing';
    this.fade = 1;
    this.cb.onState('playing');
    this.emitHud();
  }

  toMenu() {
    this.resetWorld(false);
    this.state = 'menu';
    this.fade = 1;
    this.cb.onState('menu');
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.upHeld = false;
    this.downHeld = false;
    this.boostHeld = false;
    this.cb.onState('paused');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.cb.onState('playing');
  }

  /** Tombol Naik (W / panah atas / tahan layar). */
  upDown() {
    this.sfx.init();
    this.upHeld = true;
    this.downHeld = false;
    this.everInput = true;
  }
  upUp() {
    this.upHeld = false;
  }
  /** Tombol Turun (S / panah bawah). */
  downDown() {
    this.downHeld = true;
    this.upHeld = false;
    this.everInput = true;
  }
  downUp() {
    this.downHeld = false;
  }

  // Alias kompatibilitas (kontrol lama)
  jumpDown() {
    this.upDown();
  }
  jumpUp() {
    this.upUp();
  }
  slideDown() {
    this.downDown();
  }
  slideUp() {
    this.downUp();
  }

  /** Kilat: dipakai di langit untuk melesat ngebut. */
  boostDown() {
    this.sfx.init();
    this.boostHeld = true;
    if (this.state === 'playing') {
      this.tryBoost();
    }
  }

  boostUp() {
    this.boostHeld = false;
  }

  boost() {
    this.boostDown();
  }

  private tryBoost() {
    if (this.state !== 'playing' || this.boostT > 0) return;
    if (this.meter < BOOST_MIN) {
      this.sfx.deny();
      return;
    }
    const p = this.p;
    this.boostT = this.meter / BOOST_DRAIN;
    this.boostHoldT = 0;
    this.boostMult = BOOST_MULT_MIN;
    this.flash = 0.8;
    this.shake = 14;
    this.sfx.boost();
    for (let i = 0; i < 4; i++) {
      this.emit(p.x - 10, p.y - 20, -this.speed * 0.4 - i * 90, rand(-60, 60), 0.55 + i * 0.1, 9 + i * 9, '#ffd84a', 3);
    }
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * TAU;
      this.emit(p.x, p.y - 10, Math.cos(a) * 360 - this.speed * 0.3, Math.sin(a) * 300, 0.5, 2.4, '#fff3a0', 1);
    }
    this.wingGust(14);
  }

  // ---------------------------------------------------------------- Dunia

  private onVis = () => {
    if (document.hidden) this.pause();
  };

  private resetWorld(play: boolean) {
    this.p = newPlayer();
    this.p.y = groundY(0) - 210;
    this.p.vy = 0;
    this.speed = play ? baseSpeed(0) : 400;
    this.camX = this.p.x - PSX;
    this.camY = this.p.y;
    this.obstacles = [];
    this.orbList = [];
    this.events = [];
    this.particles = [];
    this.ghosts = [];
    this.nextX = 2200;
    this.lastEnd = 0;
    this.lastKind = '';
    this.spawning = play;
    this.cleanT = 0;
    this.orbs = 0;
    this.meter = 0.42;
    this.boostT = 0;
    this.boostK = 0;
    this.boostHeld = false;
    this.boostHoldT = 0;
    this.boostMult = 1.0;
    this.camZoom = 1.0;
    this.invuln = 0;
    this.smashed = 0;
    this.shake = 0;
    this.flash = 0;
    this.dyingT = 0;
    this.dist = 0;
    this.todDrift = 0;
    this.upHeld = false;
    this.downHeld = false;
    this.flapSlow = 0;
    this.everInput = false;
    if (play) {
      this.addOrbLine(700, 7, 42);
      this.addOrbLine(1400, 7, 42);
      const initHorizon = this.p.x + 4500;
      let guard = 0;
      while (this.nextX < initHorizon && guard++ < 30) this.spawnPattern();
    }
  }

  private emit(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    color: string,
    kind: 0 | 1 | 2 | 3,
    g = 0,
    vr = 0,
  ) {
    if (this.particles.length > 340) return;
    this.particles.push({ x, y, vx, vy, life, max: life, size, color, kind, g, rot: Math.random() * TAU, vr });
  }

  private dustBurst(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      this.emit(x + rand(-8, 8), y - 2, rand(-70, 30), -rand(20, 100), rand(0.3, 0.6), rand(3, 6.5), this.dustCss, 0);
    }
  }

  /** Hembusan angin dari kepakan sayap naga. */
  private wingGust(n: number) {
    const p = this.p;
    for (let i = 0; i < n; i++) {
      const a = Math.PI + rand(-0.7, 0.9);
      const sp = rand(120, 340);
      this.emit(
        p.x + rand(-16, 10),
        p.y - 22 + rand(-14, 14),
        Math.cos(a) * sp - this.speed * 0.25,
        Math.sin(a) * sp * 0.5 + rand(-40, 40),
        rand(0.25, 0.5),
        rand(1.4, 2.6),
        'rgba(255,250,225,0.75)',
        1,
      );
    }
  }

  // ---------------------------------------------------------------- Pembangkit rintangan

  private addOrbLine(x: number, n: number, sp: number) {
    for (let i = 0; i < n; i++) {
      const wx = x + i * sp;
      // melayang di langit (bergelombang lembut) supaya pemain bermanuver naik-turun
      const h = 150 + 70 * Math.sin(i * 0.55 + x * 0.0016) + rand(-12, 12);
      this.orbList.push({ x: wx, y: groundY(wx) - h, taken: false, ph: Math.random() * TAU });
    }
  }

  /** Busur orb di atas rintangan (harus dilewati dengan terbang tinggi). */
  private addArc(cx: number, s: number, peak: number, count: number) {
    const half = s * 0.34;
    const pk = Math.min(peak, 190);
    for (let i = 0; i < count; i++) {
      const u = i / (count - 1);
      const wx = cx - half + 2 * half * u;
      const hh = 96 + pk * Math.sin(Math.PI * u);
      this.orbList.push({ x: wx, y: groundY(wx) - hh, taken: false, ph: Math.random() * TAU });
    }
  }

  private placeRock(x: number, s: number, tall = false, spire = false): number {
    const w = spire ? rand(44, 66) : rand(46, 74);
    const h = spire ? rand(190, 320) : tall ? rand(96, 168) : rand(28, 62);
    this.obstacles.push({ kind: 'rock', x, w, h, pts: makeRockPts(), dead: false });
    this.addArc(x + w / 2, s, 40 + h * 0.85, tall ? 7 : 5);
    return x + w;
  }

  private placeCluster(x: number, s: number): number {
    let cx = x;
    const n = 3;
    let maxH = 0;
    for (let i = 0; i < n; i++) {
      const w = rand(40, 58);
      const h = rand(26, 52);
      maxH = Math.max(maxH, h);
      this.obstacles.push({ kind: 'rock', x: cx, w, h, pts: makeRockPts(), dead: false });
      cx += w - 8;
    }
    this.addArc((x + cx) / 2, s, 45 + maxH * 0.9, 6);
    return cx;
  }

  private placeCombo(x: number, s: number): number {
    const t = Math.floor(Math.random() * 3);
    const gx = s * rand(0.9, 1.1);
    let e: number;
    if (t === 0) {
      e = this.placeRock(x, s);
      e = this.placeRock(e + gx, s, true);
    } else if (t === 1) {
      e = this.placeRock(x, s, true);
      e = this.placeRock(e + gx, s);
    } else {
      e = this.placeCluster(x, s);
      e = this.placeRock(e + gx, s, true);
    }
    return e;
  }

  /** Menara batu menjulang: memaksa pemain bermanuver di langit. */
  private placeSpire(x: number, s: number): number {
    const e = this.placeRock(x, s, false, true);
    // orb melingkar di puncak menara (hadiah bagi yang berani terbang tinggi)
    const cx = x + (e - x) / 2;
    for (let i = 0; i < 4; i++) {
      const t = i / 3;
      this.orbList.push({ x: cx - 18 + t * 36, y: groundY(cx) - 340 - 20 * Math.sin(Math.PI * t), taken: false, ph: Math.random() * TAU });
    }
    return e;
  }

  private spawnPattern() {
    const x = this.nextX;
    const m = x / PX_PER_M;
    const d = clamp(m / 2600, 0, 1);
    const s = baseSpeed(m);
    const opts: [string, number][] = [
      ['rock', 5],
      ['cluster', m > 110 ? 3 : 0],
      ['tower', m > 60 ? 3.0 : 0],
      ['spire', m > 220 ? 2.6 : 0],
      ['boulder', m > 420 ? 2.2 : 0],
      ['combo', m > 800 ? 3 : 0],
      ['orbs', 1.2],
    ];
    let total = 0;
    for (const o of opts) {
      if (o[0] === this.lastKind) o[1] *= 0.35;
      total += o[1];
    }
    let r = Math.random() * total;
    let kind = 'rock';
    for (const [k, w] of opts) {
      r -= w;
      if (r <= 0) {
        kind = k;
        break;
      }
    }
    if (!this.lastKind) kind = 'rock'; // rintangan pertama selalu batu (pengenalan)
    this.lastKind = kind;

    let end = x;
    switch (kind) {
      case 'rock':
        end = this.placeRock(x, s);
        break;
      case 'cluster':
        end = this.placeCluster(x, s);
        break;
      case 'tower':
        end = this.placeRock(x, s, true);
        break;
      case 'spire':
        end = this.placeSpire(x, s);
        break;
      case 'boulder': {
        const trig = this.lastEnd + 300;
        this.events.push(trig);
        end = trig + 2200;
        break;
      }
      case 'combo':
        end = this.placeCombo(x, s);
        break;
      default: {
        const n = 8 + Math.floor(Math.random() * 5);
        this.addOrbLine(x, n, 40);
        end = x + n * 40;
        break;
      }
    }
    this.lastEnd = end;
    const ease = clamp(1 - m / 600, 0, 1);
    const rest = s * (1.05 - 0.3 * d) * rand(0.9, 1.4) * (1 + 0.4 * ease);
    this.nextX = end + rest;
    if (kind !== 'orbs' && kind !== 'boulder' && Math.random() < 0.55) {
      const n = Math.floor((rest * 0.5) / 40);
      if (n > 1) this.addOrbLine(end + rest * 0.25, n, 40);
    }
  }

  private spawnBoulder() {
    const p = this.p;
    const farAhead = Math.max(2400, W / Math.min(0.42, this.camZoom) + 1500);
    this.obstacles.push({
      kind: 'boulder',
      x: p.x + farAhead + rand(100, 300),
      r: rand(24, 34),
      vx: -rand(140, 210),
      rot: 0,
      dustT: 0,
      dead: false,
    });
  }

  // ---------------------------------------------------------------- Loop

  private loop = (t: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (!this.last) this.last = t;
    const dt = Math.min(0.05, Math.max(0, (t - this.last) / 1000));
    this.last = t;

    if (this.state !== 'paused') {
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < 8) {
        this.step(STEP);
        this.acc -= STEP;
        n++;
      }
      if (n >= 8) this.acc = 0;
    }
    this.sfx.update(dt, clamp(this.speed / 1100, 0, 1), this.state === 'playing' || this.state === 'menu', clamp(this.speed / 1100, 0, 1));
    this.render();

    this.hudT += dt;
    if (this.hudT > 0.08) {
      this.hudT = 0;
      this.emitHud();
    }
  };

  private emitHud() {
    this.cb.onHud({
      dist: Math.floor(this.dist),
      speed: Math.round(this.speed * 0.3),
      orbs: this.orbs,
      meter: this.meter,
      boosting: this.boostT > 0,
      ready: this.meter >= BOOST_MIN && this.boostT <= 0,
      boostMult: this.boostT > 0 ? Math.round(this.boostMult * 10) / 10 : 1,
      alt: Math.max(0, Math.round((groundY(this.p.x) - this.p.y) / PX_PER_M)),
    });
  }

  private step(dt: number) {
    this.time += dt;
    switch (this.state) {
      case 'menu':
        this.stepMenu(dt);
        break;
      case 'playing':
        this.stepPlay(dt);
        break;
      case 'dying':
        this.stepDying(dt);
        break;
      case 'over':
        this.todDrift += dt * 0.01;
        this.speed = 0;
        break;
      default:
        break;
    }
    this.stepCommon(dt);
  }

  private stepMenu(dt: number) {
    const p = this.p;
    this.speed = 400;
    p.x += this.speed * dt;
    const target = groundY(p.x + 240) - 155;
    p.y += (target - p.y) * Math.min(1, dt * 2.2);
    // naga terbang santai di layar menu: moncong naik-turun lembut mengikuti lereng
    const want = clamp((target - p.y) * -0.004, -0.22, 0.22) + 0.05 * Math.sin(this.time * 0.9);
    p.pitch += (want - p.pitch) * Math.min(1, dt * 3);
    p.roll = 0.07 * Math.sin(this.time * 0.8);
    p.flapAmp = 0.72 + 0.22 * Math.sin(this.time * 0.6);
    p.flap += dt * 7.6;
    this.dist = p.x / PX_PER_M;
  }

  // ---------------------------------------------------------------- Terbang

  private stepBoost(dt: number): boolean {
    const p = this.p;
    if (this.boostT > 0) {
      this.boostT -= dt;
      if (this.boostHeld) {
        this.boostHoldT += dt;
        const ramp = clamp(this.boostHoldT / BOOST_RAMP, 0, 1);
        this.boostMult = BOOST_MULT_MIN + (BOOST_MULT_MAX - BOOST_MULT_MIN) * ramp;
        if (this.boostMult > 3.0) this.shake = Math.max(this.shake, (this.boostMult - 3.0) * 1.6);
      } else {
        this.boostHoldT = Math.max(0, this.boostHoldT - dt * 1.2);
        this.boostMult = Math.max(BOOST_MULT_MIN, this.boostMult - dt * 2.2);
      }
      this.meter = clamp(this.boostT * BOOST_DRAIN, 0, 1);
      if (this.boostT <= 0) {
        this.boostT = 0;
        this.meter = 0;
        this.boostHoldT = 0;
        this.boostMult = 1.0;
        this.invuln = 1.1;
        // naga mendongak lembut setelah kilat padam
        p.vy = Math.min(p.vy, -430);
        this.sfx.boostEnd();
        this.wingGust(10);
      }
      void p;
      return this.boostT > 0;
    }
    this.boostHoldT = 0;
    this.boostMult = 1.0;
    this.meter = Math.min(1, this.meter + BOOST_REGEN * dt);
    return false;
  }

  private stepPlay(dt: number) {
    const p = this.p;
    this.dist = Math.max(0, p.x) / PX_PER_M;
    if (this.invuln > 0) this.invuln -= dt;
    // Sisa kebal setelah kilat padam: naga dituntun naik lembut agar adil
    const boostTail = this.boostT <= 0 && this.invuln > 0 && this.state === 'playing';
    if (p.landT > 0) p.landT -= dt;

    // ---- Kilat (di langit, bukan di tanah)
    const boosting = this.stepBoost(dt);

    // ---- Kecepatan maju
    const target = baseSpeed(this.dist) * (boosting ? this.boostMult : 1);
    const acc = boosting ? (this.boostHeld ? 3800 : 2600) : this.speed > target ? 1250 : 560;
    this.speed += clamp(target - this.speed, -acc * dt, acc * dt);

    // ---- Rahmat pembuka: sebelum pemain menyentuh tombol, naga menjaga ketinggian
    // supaya pemula tidak langsung jatuh menyerempet lereng.
    const graceTarget = groundY(p.x + 210) - 255;
    if (!this.everInput) {
      if (p.y > graceTarget + 12) p.vy -= CLIMB_ACC * 0.85 * dt;
      else if (p.y < graceTarget - 30) p.vy += DIVE_ACC * 0.55 * dt;
      else p.vy *= Math.max(0, 1 - 4.5 * dt);
    }

    // ---- Manuver naik / turun (model kecepatan-target: halus & tidak menyentak)
    const climb = this.upHeld;
    const dive = this.downHeld;
    const prevVy = p.vy;
    const slope = slopeAt(p.x);
    let targetVy: number;
    let vAcc: number;
    if (climb) {
      targetVy = -CLIMB_V * (boosting ? 1.15 : 1);
      vAcc = CLIMB_ACC;
    } else if (dive) {
      targetVy = DIVE_V * (boosting ? 1.1 : 1);
      vAcc = DIVE_ACC;
    } else {
      // Meluncur: mengikuti turunan lereng + sisa turun yang sangat lembut
      targetVy = slope * this.speed + SINK_V;
      vAcc = GLIDE_ACC;
    }
    p.vy += clamp(targetVy - p.vy, -vAcc * dt, vAcc * dt);

    // ---- Saat kilat menyala: naga otomatis terangkat dari lereng
    const alt = groundY(p.x) - p.y;
    if (boostTail) {
      const k = smooth(clamp((BOOST_FLOOR * 1.15 - alt) / (BOOST_FLOOR * 1.15), 0, 1));
      if (k > 0.001) {
        p.vy -= CLIMB_ACC * 1.25 * k * dt;
        if (p.vy > 0) p.vy *= Math.max(0, 1 - 3.6 * k * dt);
      }
    }
    if (boosting) {
      const k = smooth(clamp((BOOST_FLOOR - alt) / BOOST_FLOOR, 0, 1));
      if (k > 0.001) {
        p.vy -= CLIMB_ACC * 1.15 * k * dt;
        if (p.vy > 0) p.vy *= Math.max(0, 1 - 3.2 * k * dt);
      }
    }

    // ---- Batas ketinggian langit (halus, memantul lembut ke bawah)
    const soft = MAX_ALT - ALT_SOFT;
    if (alt > soft) {
      const k = smooth(clamp((alt - soft) / ALT_SOFT, 0, 1));
      p.vy += LIFT * 1.4 * k * dt;
      if (k > 0.5) p.vy = Math.max(p.vy, SINK_V * 0.15);
    }

    // ---- Gerak
    p.x += this.speed * dt;
    p.y += p.vy * dt;
    const g = groundY(p.x);
    if (alt > MAX_ALT) p.y = g - MAX_ALT;

    // ---- Orientasi badan mengikuti arah terbang
    const vRef = climb ? p.vy - 190 : dive ? p.vy + 150 : p.vy;
    const targetPitch = clamp(Math.atan2(vRef, this.speed * 0.72), -0.62, 0.86);
    p.pitch += (targetPitch - p.pitch) * (1 - Math.exp(-dt * 8.5));
    const targetRoll = clamp(p.pitch * 0.42 + (boosting ? -0.05 : 0), -0.42, 0.42);
    p.roll += (targetRoll - p.roll) * (1 - Math.exp(-dt * 6));

    // ---- Kepakan sayap: makin kuat saat menanjak / ngebut
    const effort = clamp((prevVy - p.vy) * 0.0016, 0, 0.5) + (climb ? 0.55 : 0) + Math.abs(p.vy) / 2600 + (boosting ? 0.3 : 0);
    const targetAmp = clamp(0.5 + effort, 0.35, 1.5);
    p.flapAmp += (targetAmp - p.flapAmp) * (1 - Math.exp(-dt * 6));
    const flapRate = climb ? 11.5 : dive ? 7.5 : 8.4;
    p.flap += dt * flapRate * (boosting ? 1.2 : 1);
    p.bobT += dt;

    this.flapSlow += dt;
    if (this.flapSlow > (climb ? 0.2 : 0.4)) {
      this.flapSlow = 0;
      this.wingGust(climb ? 4 : 2);
      if (climb && this.state === 'playing') this.sfx.flap();
    }

    // ---- Angin & debu dekat tanah
    const height = g - p.y;
    if (height < 130) {
      p.dustT -= dt;
      if (p.dustT <= 0) {
        p.dustT = 0.05;
        const gy = g;
        this.emit(p.x - rand(0, 90), gy - 2, -rand(30, 160), -rand(20, 130), rand(0.3, 0.6), rand(3, 7), this.dustCss, 0);
      }
    }
    if (boosting) {
      for (let i = 0; i < 2; i++) {
        this.emit(
          p.x - rand(10, 60),
          p.y - rand(0, 44),
          -rand(120, 420),
          rand(-90, 90),
          rand(0.16, 0.32),
          rand(1.4, 2.6),
          Math.random() < 0.5 ? '#ffd84a' : '#fffbe0',
          1,
        );
      }
      this.ghostT -= dt;
      if (this.ghostT <= 0) {
        this.ghostT = 0.07;
        this.ghosts.push({ x: p.x, y: p.y, pitch: p.pitch, view: this.dragonView(), life: GHOST_LIFE });
      }
    }

    // ---- Kontak dengan lereng
    // Menukik keras = menabrak. Menyerempet pelan = meluncur (skid) lalu memantul halus.
    if (height <= BELLY) {
      p.y = g - BELLY;
      if (boosting || boostTail || this.invuln > 0) {
        p.vy = Math.min(p.vy, -520);
      } else if (p.vy > SLAM_V) {
        this.die('ground');
        return;
      } else {
        // skid: kehilangan sedikit kecepatan, debu beterbangan, lalu terangkat lagi
        const hard = clamp(p.vy / SLAM_V, 0, 1);
        this.speed = Math.max(baseSpeed(this.dist) * 0.72, this.speed - (30 + 120 * hard));
        p.vy = -(110 + 130 * hard);
        this.shake = Math.max(this.shake, 3 + 6 * hard);
        this.dustBurst(p.x, g, 5 + Math.round(6 * hard));
        this.sfx.land();
        if (!boosting) this.meter = Math.max(0, this.meter - 0.05);
      }
    }

    // ---- Spawn & peristiwa
    if (this.spawning) {
      const viewMargin = W / Math.min(0.42, this.camZoom) + 600;
      const horizon = this.camX + viewMargin + 3500;
      let guard = 0;
      while (this.nextX < horizon && guard++ < 20) this.spawnPattern();
      while (this.events.length && p.x >= this.events[0]) {
        this.events.shift();
        this.spawnBoulder();
      }
      this.cleanT -= dt;
      if (this.cleanT <= 0) {
        this.cleanT = 0.5;
        const cut = p.x - PSX - 1200;
        this.obstacles = this.obstacles.filter((o) => !o.dead && o.x > cut - 600);
        this.orbList = this.orbList.filter((o) => !o.taken && o.x > cut);
      }
    }

    // ---- Update batu menggelinding
    for (const o of this.obstacles) {
      if (o.kind === 'boulder' && !o.dead) {
        o.x += o.vx * dt;
        o.rot += (o.vx / o.r) * dt;
        o.dustT -= dt;
        if (o.dustT <= 0 && o.x - this.camX < W + 20) {
          o.dustT = 0.07;
          this.emit(o.x + o.r * 0.6, groundY(o.x) - 2, rand(0, 50), -rand(10, 60), 0.5, rand(3, 6), this.dustCss, 0);
        }
        if (o.x < p.x - 500) o.dead = true;
      }
    }

    // ---- Tabrakan rintangan
    const invincible = boosting || this.invuln > 0;
    for (const o of this.obstacles) {
      if (o.dead) continue;
      const cx = o.kind === 'boulder' ? o.x : o.x + o.w / 2;
      if (Math.abs(cx - p.x) > 240) continue;
      if (!this.hits(o)) continue;
      if (invincible) {
        this.smash(o);
      } else {
        this.die('hit');
        return;
      }
    }

    // ---- Orb
    const bodyX = p.x + 2;
    const bodyY = p.y - 3;
    const rad = boosting ? 150 : 34;
    for (const o of this.orbList) {
      if (o.taken) continue;
      if (o.x < p.x - 170 || o.x > p.x + 190) continue;
      if (Math.hypot(o.x - bodyX, o.y - bodyY) < rad) {
        o.taken = true;
        this.orbs++;
        if (boosting) {
          // saat kilat menyala, orb MENAHAN durasi kilat (tidak bisa melebihi durasi penuh)
          this.boostT = Math.min(this.boostT + 0.09, 1 / BOOST_DRAIN);
          this.meter = clamp(this.boostT * BOOST_DRAIN, 0, 1);
        } else {
          this.meter = Math.min(1, this.meter + ORB_GAIN);
        }
        this.sfx.orb();
        for (let i = 0; i < 7; i++) {
          const a = Math.random() * TAU;
          this.emit(o.x, o.y, this.speed + Math.cos(a) * 170, Math.sin(a) * 170, 0.4, 2, '#ffe27a', 1);
        }
      }
    }
  }

  /**
   * Tabrakan naga terhadap rintangan.
   * - Batu: uji lingkaran tubuh naga terhadap profil permukaan batu (akurat).
   * - Batu menggelinding: uji lingkaran lawan lingkaran.
   */
  /** Apakah lingkaran (cx,cy,r) menembus permukaan batu? */
  private circleHitsRock(cx: number, cy: number, r: number, o: Rock): boolean {
    const n = 5;
    for (let i = 0; i < n; i++) {
      const dx = -r + (2 * r * i) / (n - 1);
      const sx = cx + dx;
      const u = (sx - o.x) / o.w;
      if (u < 0 || u > 1) continue;
      const top = groundY(sx) - o.h * rockProfile(o.pts, u);
      const yAt = cy + Math.sqrt(Math.max(0, r * r - dx * dx));
      if (yAt > top) return true;
    }
    return false;
  }

  private hits(o: Obstacle): boolean {
    const p = this.p;
    const big = p.dead > 0.5 ? 4 : 0;
    // dua lingkaran: badan & moncong naga (moncong sedikit lebih kecil)
    const circles: [number, number, number][] = [
      [p.x + 1, p.y - 4, BODY_R + big],
      [p.x + NOSE * 0.5, p.y - 1, BODY_R * 0.74 + big],
    ];
    if (o.kind === 'rock') {
      for (const [cx, cy, r] of circles) if (this.circleHitsRock(cx, cy, r, o)) return true;
      return false;
    }
    const by = groundY(o.x) - o.r;
    for (const [cx, cy, r] of circles) {
      if (Math.hypot(o.x - cx, by - cy) < o.r + r) return true;
    }
    return false;
  }

  private smash(o: Obstacle) {
    o.dead = true;
    this.smashed++;
    this.sfx.smash();
    this.shake = Math.max(this.shake, 6);
    const cx = o.kind === 'boulder' ? o.x : o.x + o.w / 2;
    const cy = groundY(cx) - (o.kind === 'rock' ? o.h * 0.5 : o.r);
    for (let i = 0; i < 14; i++) {
      this.emit(
        cx + rand(-10, 10),
        cy + rand(-8, 8),
        this.speed * 0.7 + rand(-80, 240),
        -rand(120, 520),
        0.8,
        rand(5, 11),
        this.obsCss,
        2,
        1600,
        rand(-12, 12),
      );
    }
    for (let i = 0; i < 8; i++) {
      this.emit(cx, cy, this.speed + rand(-200, 300), rand(-250, 150), 0.35, 2, '#ffe27a', 1);
    }
  }

  private die(kind: 'ground' | 'hit') {
    if (this.state !== 'playing') return;
    const p = this.p;
    this.state = 'dying';
    this.dyingT = 0;
    this.boostT = 0;
    this.meter = 0;
    p.dead = 0;
    this.deathKind = kind;
    if (kind === 'ground') {
      this.sfx.crash();
      this.shake = 16;
      this.flash = 0.35;
      p.spin = 2.6;
      p.vy = -260;
      p.vx = this.speed * 0.55;
      this.dustBurst(p.x, p.y + BELLY, 16);
    } else {
      this.sfx.smash();
      this.sfx.crash();
      this.shake = 20;
      this.flash = 0.45;
      p.spin = 5.5;
      p.vy = -430;
      p.vx = this.speed * 0.3;
      for (let i = 0; i < 12; i++) {
        this.emit(
          p.x + 10,
          p.y - rand(5, 40),
          this.speed * 0.3 + rand(-120, 200),
          -rand(100, 450),
          0.8,
          rand(4, 9),
          this.obsCss,
          2,
          1600,
          rand(-12, 12),
        );
      }
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * TAU;
        this.emit(p.x + 10, p.y - 20, Math.cos(a) * 300, Math.sin(a) * 300, 0.4, 2, '#ffd84a', 1);
      }
    }
    this.cb.onState('dying');
  }

  private stepDying(dt: number) {
    const p = this.p;
    this.dyingT += dt;
    p.dead = Math.min(1, p.dead + dt * 3.4);
    this.speed = Math.max(0, this.speed - (this.deathKind === 'ground' ? 900 : 1400) * dt);
    p.x += p.vx * dt;
    p.vx = Math.max(0, p.vx - 420 * dt);
    p.vy = Math.min(p.vy + LIFT * dt, 1500);
    p.y += p.vy * dt;
    p.pitch += (clamp(Math.atan2(p.vy, Math.max(60, p.vx)), -1, 1.25) - p.pitch) * Math.min(1, dt * 6);
    p.roll += (p.roll + p.spin * dt * 0.35) * 0 + dt * p.spin * 0.3;
    p.flapAmp = Math.max(0, p.flapAmp - dt * 2.4);

    const g = groundY(p.x);
    if (p.y + BELLY >= g) {
      p.y = g - BELLY;
      if (p.vy > 150) {
        p.vy = -p.vy * 0.32;
        this.dustBurst(p.x, g, 5);
        this.sfx.land();
      } else {
        p.vy = 0;
      }
      p.spin *= Math.exp(-dt * 2.4);
    }
    if (this.dyingT > 1.5) this.finish();
  }

  private finish() {
    const dist = Math.floor(this.dist);
    const isBest = dist > this.best;
    if (isBest) {
      this.best = dist;
      try {
        localStorage.setItem('kilat-best', String(dist));
      } catch {
        /* abaikan */
      }
    }
    this.state = 'over';
    this.speed = 0;
    this.cb.onState('over', { dist, orbs: this.orbs, best: this.best, isBest, smashed: this.smashed });
  }

  private stepCommon(dt: number) {
    const p = this.p;

    this.tod = this.dist / 650 + this.todDrift;

    // kamera: titik fokus di antara naga dan tanah di depannya
    this.camX = p.x - PSX;
    // Kamera condong ke tanah di depan, jadi naik-turun naga terasa jelas di layar
    const ahead = groundY(p.x + 185);
    const fy = this.state === 'menu' ? lerp(ahead, p.y, 0.34) : lerp(ahead, p.y, 0.3);
    this.camY += (fy - this.camY) * (1 - Math.exp(-dt * 3.4));

    const targetZoom = this.boostT > 0
      ? 0.74 - 0.12 * clamp((this.boostMult - BOOST_MULT_MIN) / (BOOST_MULT_MAX - BOOST_MULT_MIN), 0, 1)
      : 1.0;
    this.camZoom += (targetZoom - this.camZoom) * (1 - Math.exp(-dt * (this.boostT > 0 ? 2.8 : 3.4)));

    const bt = this.boostT > 0 ? 1 : 0;
    this.boostK += (bt - this.boostK) * Math.min(1, dt * 6);

    this.shake = Math.max(0, this.shake - dt * 40);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.fade = Math.max(0, this.fade - dt * 1.6);


    // partikel
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      this.ghosts[i].life -= dt;
      if (this.ghosts[i].life <= 0) this.ghosts.splice(i, 1);
    }
    while (this.ghosts.length > 4) this.ghosts.shift();
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const q = this.particles[i];
      q.life -= dt;
      if (q.life <= 0) {
        this.particles[i] = this.particles[this.particles.length - 1];
        this.particles.pop();
        continue;
      }
      q.vy += q.g * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.rot += q.vr * dt;
    }
  }

  private dragonView(): DragonView {
    const p = this.p;
    const dead = this.state === 'dying' || this.state === 'over';
    return {
      time: this.time,
      pitch: p.pitch,
      roll: p.roll,
      flap: p.flap,
      flapAmp: p.flapAmp,
      glow: this.boostK,
      dead: p.dead,
      dir: 1,
      bob: dead ? 0 : Math.sin(p.bobT * 2.1) * 2.4,
    };
  }

  // ---------------------------------------------------------------- Render

  private render() {
    const ctx = this.ctx;
    const k = this.scale;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    const pal = paletteAt(this.tod);
    this.dustCss = css(mix(pal.c.rim, pal.c.gTop, 0.45), 1);
    this.obsCss = css(pal.c.obs);

    let ox = 0;
    let oy = 0;
    if (this.shake > 0.2) {
      ox = (Math.random() - 0.5) * this.shake;
      oy = (Math.random() - 0.5) * this.shake;
    }
    ctx.save();

    const z = this.camZoom;
    const focusX = W * 0.42;
    const focusY = FLY_Y;
    ctx.translate(focusX, focusY);
    ctx.scale(z, z);
    ctx.translate(-focusX, -focusY);
    ctx.translate(ox, oy);

    const camYRel = this.camY - (this.camX + PSX) * DOWNHILL_SLOPE;
    drawBackground(ctx, pal, this.camX, camYRel, this.time, this.boostK, this.speed, z);
    this.drawGround(pal);
    this.drawDecor(pal);

    for (const o of this.obstacles) {
      if (o.dead) continue;
      if (o.kind === 'rock') this.drawRock(o, pal);
      else this.drawBoulder(o, pal);
    }
    this.drawOrbs();
    this.drawPlayer(pal);
    this.drawParticles();
    this.drawForeground(pal);

    ctx.restore();
    this.drawOverlays(pal);
    ctx.globalAlpha = 1;
  }

  private sy(wx: number): number {
    return groundY(wx) - this.camY + GS;
  }

  private drawGround(pal: Palette) {
    const ctx = this.ctx;
    const c = pal.c;
    const camX = this.camX;
    const margin = W / Math.min(0.4, this.camZoom) + 300;
    const x0 = camX - margin;
    const x1 = camX + W + margin;
    const groundBottom = H + 900;

    const ground = new Path2D();
    const rim = new Path2D();
    const n = Math.max(1, Math.ceil((x1 - x0) / 8));
    ground.moveTo(x0 - camX, groundBottom);
    for (let i = 0; i <= n; i++) {
      const wx = x0 + ((x1 - x0) * i) / n;
      const x = wx - camX;
      const y = this.sy(wx);
      ground.lineTo(x, y);
      if (i === 0) rim.moveTo(x, y);
      else rim.lineTo(x, y);
    }
    ground.lineTo(x1 - camX, groundBottom);
    ground.closePath();

    const grd = ctx.createLinearGradient(0, GS - 60, 0, groundBottom);
    grd.addColorStop(0, css(c.gTop));
    grd.addColorStop(1, css(c.gBot));
    ctx.fillStyle = grd;
    ctx.fill(ground);

    ctx.save();
    ctx.clip(ground);
    // riak punggung bukit pasir
    for (let kk = 0; kk < 4; kk++) {
      const off = 36 + kk * 52;
      ctx.beginPath();
      for (let sx = -10; sx <= W + 10; sx += 10) {
        const wx = camX + sx;
        const y = groundY(wx) + off + 8 * Math.sin(wx * 0.011 + kk * 2.1) - this.camY + GS;
        if (sx === -10) ctx.moveTo(sx, y);
        else ctx.lineTo(sx, y);
      }
      ctx.strokeStyle = kk % 2 === 0 ? css(c.rim, 0.09) : 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 2 + kk * 0.4;
      ctx.stroke();
    }
    ctx.lineJoin = 'round';
    ctx.strokeStyle = css(c.rim, 0.22);
    ctx.lineWidth = 16;
    ctx.stroke(rim);
    ctx.restore();

    ctx.lineJoin = 'round';
    ctx.strokeStyle = css(c.rim, 0.95);
    ctx.lineWidth = 3;
    ctx.stroke(rim);
  }

  private drawDecor(pal: Palette) {
    const ctx = this.ctx;
    const c = pal.c;
    const cell = 75;
    const margin = W / Math.min(0.4, this.camZoom) + 300;
    const first = Math.floor((this.camX - margin) / cell) - 1;
    const last = Math.floor((this.camX + W + margin) / cell) + 1;
    const col = mix(c.gBot, c.obs, 0.25);
    const stoneCol = mix(c.obs, c.gTop, 0.35);
    ctx.lineCap = 'round';
    for (let ci = first; ci <= last; ci++) {
      const hval = hash(ci * 2.17);
      if (hval > 0.58) continue;
      const wx = ci * cell + hash(ci * 5.1) * cell;
      const x = wx - this.camX;
      const y = groundY(wx) - this.camY + GS;
      const rot = Math.atan(slopeAt(wx));

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);

      const dType = hash(ci * 7.7);
      if (dType < 0.25) {
        // Bendera doa gurun berkibar (khas Alto's Odyssey)
        const poleH = 20 + hash(ci * 3.1) * 18;
        ctx.strokeStyle = css(mix(col, c.rim, 0.35), 0.85);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(0, 2);
        ctx.lineTo(1, -poleH);
        ctx.stroke();

        const flagW = 11 + hash(ci * 4.9) * 8;
        const flagH = 7 + hash(ci * 1.7) * 4;
        const flutter = Math.sin(this.time * 6 + ci) * 2;
        ctx.fillStyle = css(c.rim, 0.8);
        ctx.beginPath();
        ctx.moveTo(1, -poleH);
        ctx.lineTo(1 + flagW, -poleH + flagH * 0.5 + flutter);
        ctx.lineTo(1, -poleH + flagH);
        ctx.closePath();
        ctx.fill();
      } else if (dType < 0.52) {
        // Tumpukan batu gurun kuno
        ctx.fillStyle = css(stoneCol, 0.85);
        const stones = 3 + Math.floor(hash(ci * 9.1) * 2);
        let currY = 0;
        for (let s = 0; s < stones; s++) {
          const sw = 7 - s * 1.4 + hash(ci + s) * 2;
          const sh = 3.5 + hash(ci * 2 + s) * 2;
          ctx.beginPath();
          ctx.ellipse(hash(ci * 3 + s) * 2 - 1, currY - sh / 2, sw, sh / 2, 0, 0, TAU);
          ctx.fill();
          currY -= sh;
        }
      } else if (dType < 0.78) {
        // Rerumputan kering gurun
        ctx.strokeStyle = css(col, 0.7);
        ctx.lineWidth = 1.7;
        for (let k = -1; k <= 1; k++) {
          ctx.beginPath();
          ctx.moveTo(k * 3, 2);
          ctx.quadraticCurveTo(k * 4, -8, k * 8, -11 - hash(ci + k) * 4);
          ctx.stroke();
        }
      } else {
        // Kerikil pasir halus
        ctx.fillStyle = css(col, 0.35);
        ctx.beginPath();
        ctx.ellipse(0, 1, 6 + hash(ci) * 4, 3, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawRock(r: Rock, pal: Palette) {
    const ctx = this.ctx;
    const c = pal.c;
    const camX = this.camX;
    const camY = this.camY;
    const xs = r.x - camX;
    const margin = W / Math.min(0.4, this.camZoom) + 300;
    if (xs > W + margin || xs + r.w < -margin) return;
    const pt = (u: number, v: number): [number, number] => {
      const wx = r.x + u * r.w;
      return [wx - camX, groundY(wx) - v * r.h - camY + GS];
    };
    ctx.beginPath();
    const first = pt(0, 0);
    ctx.moveTo(first[0], first[1] + 3);
    for (const [u, v] of r.pts) {
      const q = pt(u, v);
      ctx.lineTo(q[0], q[1]);
    }
    for (let i = 5; i >= 0; i--) {
      const q = pt(i / 5, -0.04);
      ctx.lineTo(q[0], q[1] + 2);
    }
    ctx.closePath();
    const topY = groundY(r.x + r.w * 0.5) - r.h - camY + GS;
    const g = ctx.createLinearGradient(0, topY, 0, topY + r.h + 10);
    g.addColorStop(0, css(mix(c.obs, c.obsLight, 0.2)));
    g.addColorStop(1, css(c.obs));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = css(c.obs);
    ctx.lineWidth = 5;
    ctx.stroke();

    // sisi gelap
    let kMax = 0;
    for (let i = 0; i < r.pts.length; i++) if (r.pts[i][1] > r.pts[kMax][1]) kMax = i;
    const pk = pt(r.pts[kMax][0], r.pts[kMax][1]);
    ctx.beginPath();
    ctx.moveTo(pk[0], pk[1]);
    for (let i = kMax + 1; i < r.pts.length; i++) {
      const q = pt(r.pts[i][0], r.pts[i][1]);
      ctx.lineTo(q[0], q[1]);
    }
    ctx.lineTo(pk[0], groundY(r.x + r.pts[kMax][0] * r.w) - camY + GS + 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fill();

    // cahaya tepi
    ctx.strokeStyle = css(c.obsLight, 0.7);
    ctx.lineWidth = 2;
    let prev = pt(r.pts[0][0], r.pts[0][1]);
    for (let i = 1; i < r.pts.length; i++) {
      const cur = pt(r.pts[i][0], r.pts[i][1]);
      if (cur[1] < prev[1] - 0.5) {
        ctx.beginPath();
        ctx.moveTo(prev[0], prev[1]);
        ctx.lineTo(cur[0], cur[1]);
        ctx.stroke();
      }
      prev = cur;
    }
  }

  private drawBoulder(b: Boulder, pal: Palette) {
    const ctx = this.ctx;
    const c = pal.c;
    const sx = b.x - this.camX;
    const margin = W / Math.min(0.4, this.camZoom) + 300;
    if (sx > W + margin || sx < -margin) return;
    const by = groundY(b.x) - b.r - this.camY + GS;
    ctx.save();
    ctx.translate(sx, by);
    ctx.rotate(b.rot);
    const g = ctx.createLinearGradient(0, -b.r, 0, b.r);
    g.addColorStop(0, css(mix(c.obs, c.obsLight, 0.22)));
    g.addColorStop(1, css(c.obs));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, b.r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-b.r * 0.6, -b.r * 0.1);
    ctx.lineTo(-b.r * 0.1, b.r * 0.1);
    ctx.lineTo(b.r * 0.2, -b.r * 0.35);
    ctx.moveTo(-b.r * 0.1, b.r * 0.1);
    ctx.lineTo(b.r * 0.1, b.r * 0.6);
    ctx.moveTo(b.r * 0.2, -b.r * 0.35);
    ctx.lineTo(b.r * 0.55, -b.r * 0.25);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = css(c.obsLight, 0.65);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, by, b.r - 1.5, Math.PI * 1.05, Math.PI * 1.6);
    ctx.stroke();
  }

  private drawOrbs() {
    const ctx = this.ctx;
    const margin = W / Math.min(0.4, this.camZoom) + 300;
    for (const o of this.orbList) {
      if (o.taken) continue;
      const x = o.x - this.camX;
      if (x < -margin || x > W + margin) continue;
      const y = o.y - this.camY + GS + Math.sin(this.time * 3 + o.ph) * 3;
      const pulse = 0.85 + 0.15 * Math.sin(this.time * 5 + o.ph);
      ctx.fillStyle = 'rgba(255,214,64,0.14)';
      ctx.beginPath();
      ctx.arc(x, y, 17 * pulse, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,214,64,0.28)';
      ctx.beginPath();
      ctx.arc(x, y, 11.5 * pulse, 0, TAU);
      ctx.fill();
      // bintang 4 sudut
      const r = 9;
      ctx.fillStyle = '#ffd84a';
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.quadraticCurveTo(x, y, x, y + r);
      ctx.quadraticCurveTo(x, y, x - r, y);
      ctx.quadraticCurveTo(x, y, x, y - r);
      ctx.fill();
      ctx.fillStyle = '#fffbe6';
      ctx.beginPath();
      ctx.arc(x, y, 2.8, 0, TAU);
      ctx.fill();
    }
  }

  private drawDragonAt(x: number, y: number, pitch: number, view: DragonView, alpha: number, tint: string | null) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x - this.camX, y - this.camY + GS);
    ctx.rotate(pitch);
    if (tint) {
      // siluet putih saat kebal setelah kilat
      ctx.shadowColor = tint;
      ctx.shadowBlur = 14;
    }
    drawDragon(ctx, view);
    ctx.restore();
  }

  private drawPlayer(_pal: Palette) {
    const ctx = this.ctx;
    const p = this.p;
    const sx = p.x - this.camX;
    const sy = p.y - this.camY + GS;
    const bk = this.boostK;

    // bayangan di lereng (jadi penanda ketinggian terbang)
    const gy = this.sy(p.x);
    const hgt = Math.max(0, gy - sy);
    const a = 0.26 * clamp(1 - hgt / 900, 0, 1);
    if (a > 0.01) {
      ctx.fillStyle = `rgba(0,0,0,${a})`;
      ctx.beginPath();
      ctx.ellipse(sx, gy + 3, Math.max(10, 34 - hgt * 0.02), 5.5, 0, 0, TAU);
      ctx.fill();
    }

    // aura kilat
    if (bk > 0.03) {
      const cy = sy - 16;
      const ag = ctx.createRadialGradient(sx, cy, 6, sx, cy, 110);
      ag.addColorStop(0, `rgba(255,226,110,${0.5 * bk})`);
      ag.addColorStop(1, 'rgba(255,226,110,0)');
      ctx.fillStyle = ag;
      ctx.fillRect(sx - 120, cy - 120, 240, 240);
    }

    // sambaran kilat di belakang naga
    if (bk > 0.05) {
      const seed = Math.floor(this.time * 24);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let b = 0; b < 3; b++) {
        const y0 = sy - 6 - b * 18;
        const len = 150 + hash(seed + b * 3) * 140;
        const n = 7;
        ctx.beginPath();
        ctx.moveTo(sx - 16, y0);
        for (let i = 1; i <= n; i++) {
          ctx.lineTo(sx - 16 - (len * i) / n, y0 + (hash(seed * 3.1 + b * 11 + i) - 0.5) * 26);
        }
        ctx.strokeStyle = `rgba(255,214,64,${0.38 * bk})`;
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,232,${0.92 * bk})`;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    }

    // jejak gerak (ghost) saat ngebut
    for (const g of this.ghosts) {
      this.drawDragonAt(g.x, g.y, g.pitch, g.view, (g.life / GHOST_LIFE) * 0.1, '#ffe27a');
    }

    // naga
    this.drawDragonAt(p.x, p.y, p.pitch, this.dragonView(), 1, null);

    // kedip saat kebal setelah kilat
    if (this.invuln > 0 && Math.floor(this.time * 18) % 2 === 0) {
      this.drawDragonAt(p.x, p.y, p.pitch, this.dragonView(), 0.32, '#ffffff');
    }
  }

  private drawParticles() {
    const ctx = this.ctx;
    for (const q of this.particles) {
      const a = clamp(q.life / q.max, 0, 1);
      const x = q.x - this.camX;
      const y = q.y - this.camY + GS;
      const margin = (W / this.camZoom) * 0.85 + 80;
      if (x < -margin || x > W + margin) continue;
      switch (q.kind) {
        case 0:
          ctx.globalAlpha = a * 0.55;
          ctx.fillStyle = q.color;
          ctx.beginPath();
          ctx.arc(x, y, q.size * (1.3 - a * 0.5), 0, TAU);
          ctx.fill();
          break;
        case 1:
          ctx.globalAlpha = a;
          ctx.strokeStyle = q.color;
          ctx.lineWidth = q.size;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - (q.vx - this.speed) * 0.03, y - q.vy * 0.03);
          ctx.stroke();
          break;
        case 2:
          ctx.globalAlpha = Math.min(1, a * 2);
          ctx.fillStyle = q.color;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(q.rot);
          ctx.fillRect(-q.size / 2, -q.size / 2, q.size, q.size * 0.7);
          ctx.restore();
          break;
        default:
          ctx.globalAlpha = a * 0.85;
          ctx.strokeStyle = q.color;
          ctx.lineWidth = 0.8 + 2.6 * a;
          ctx.beginPath();
          ctx.arc(x, y, q.size + (1 - a) * 52, 0, TAU);
          ctx.stroke();
          break;
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawForeground(pal: Palette) {
    const ctx = this.ctx;
    const par = 1.5;
    const off = this.camX * par;
    const cell = 380;
    const first = Math.floor((off - 100) / cell);
    const last = Math.floor((off + W + 100) / cell);
    ctx.fillStyle = css(pal.c.obs, 0.95);
    for (let ci = first; ci <= last; ci++) {
      const h = hash(ci * 3.7 + 99);
      if (h > 0.6) continue;
      const bx = ci * cell + hash(ci * 1.9 + 7) * cell * 0.8 - off;
      const n = 4 + Math.floor(h * 10);
      for (let k = 0; k < n; k++) {
        const x = bx + (k - n / 2) * 9;
        const hh = 34 + hash(ci * 7 + k) * 58;
        const lean = (hash(ci * 13 + k) - 0.5) * 40;
        ctx.beginPath();
        ctx.moveTo(x - 4, H + 6);
        ctx.quadraticCurveTo(x + lean * 0.3, H - hh * 0.55, x + lean, H - hh);
        ctx.quadraticCurveTo(x + lean * 0.3 + 4, H - hh * 0.5, x + 4, H + 6);
        ctx.fill();
      }
    }
  }

  private drawOverlays(pal: Palette) {
    const ctx = this.ctx;
    const bk = this.boostK;

    // vinyet halus
    const vg = ctx.createRadialGradient(W / 2, H * 0.52, H * 0.34, W / 2, H * 0.52, H * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    if (bk > 0.03) {
      const g = ctx.createRadialGradient(W / 2, H * 0.55, 160, W / 2, H * 0.55, 640);
      g.addColorStop(0, 'rgba(255,220,80,0)');
      g.addColorStop(1, `rgba(255,214,64,${0.3 * bk})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      ctx.lineCap = 'round';
      for (let i = 0; i < 16; i++) {
        const h1 = hash(i * 7.7);
        const h2 = hash(i * 3.3 + 1);
        const y = 40 + h1 * (H * 0.85);
        const len = 120 + h2 * 260;
        const x = W + 100 - mod(this.time * (2600 + h2 * 1800) + h1 * 2000, W + 400 + len);
        ctx.strokeStyle = `rgba(255,250,220,${0.32 * bk * (0.4 + 0.6 * h1)})`;
        ctx.lineWidth = 1.5 + h2 * 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + len, y);
        ctx.stroke();
      }
    }

    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(255,250,222,${Math.min(1, this.flash * 0.9)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.fade > 0.01) {
      ctx.fillStyle = css(pal.c.skyTop, Math.min(1, this.fade));
      ctx.fillRect(0, 0, W, H);
    }
  }
}
