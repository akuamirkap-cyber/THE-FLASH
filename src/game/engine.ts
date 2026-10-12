import {
  ARCH_H,
  BOOST_DUR,
  COYOTE,
  GRAVITY,
  GS,
  H,
  HIT_W,
  JUMP_CUT,
  JUMP_V,
  ORB_GAIN,
  PSX,
  PX_PER_M,
  STEP,
  TUNNEL,
  TUNNEL_V,
  W,
  baseSpeed,
} from './config';
import { DOWNHILL_SLOPE, groundY, slopeAt } from './terrain';
import { Palette, paletteAt } from './palette';
import { drawBackground } from './background';
import { drawRunner, RunnerView } from './character';
import { Sfx } from './audio';
import { TAU, clamp, css, hash, lerp, mix, mod, rand } from './util';

export type GameState = 'menu' | 'playing' | 'paused' | 'dying' | 'over';

export interface Hud {
  dist: number;
  speed: number;
  orbs: number;
  meter: number;
  boosting: boolean;
  ready: boolean;
  boostMult?: number;
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
interface Slab {
  kind: 'slab';
  x: number;
  w: number;
  seed: number;
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
type Obstacle = Rock | Slab | Boulder;

interface Orb {
  x: number;
  y: number;
  taken: boolean;
  ph: number;
}
interface Gap {
  x0: number;
  x1: number;
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

interface Player {
  x: number;
  y: number;
  vy: number;
  onGround: boolean;
  jumps: number;
  coyote: number;
  sliding: boolean;
  slideT: number;
  cut: boolean;
  phase: number;
  rot: number;
  flip: number;
  flipT: number;
  spin: number;
  wAir: number;
  wSlide: number;
  wDead: number;
  land: number;
  dustT: number;
  airTime: number;
  stretch: number;
  ragdollFlail: number;
}

interface Ghost {
  x: number;
  y: number;
  rot: number;
  flip: number;
  view: RunnerView;
  life: number;
}

const RIB_N = 15;
const RIB_L = 11.5;
const GHOST_LIFE = 0.3;

function newPlayer(): Player {
  return {
    x: 0,
    y: 0,
    vy: 0,
    onGround: true,
    jumps: 1,
    coyote: COYOTE,
    sliding: false,
    slideT: 0,
    cut: true,
    phase: 0,
    rot: 0,
    flip: 0,
    flipT: -1,
    spin: 0,
    wAir: 0,
    wSlide: 0,
    wDead: 0,
    land: 0,
    dustT: 0,
    airTime: 0,
    stretch: 1,
    ragdollFlail: 0,
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
  private speed = 330;
  private camX = 0;
  private camY = 0;
  private tod = 0;
  private todDrift = 0;
  private dist = 0;

  private obstacles: Obstacle[] = [];
  private orbList: Orb[] = [];
  private gaps: Gap[] = [];
  private events: number[] = [];
  private particles: Particle[] = [];
  private ghosts: Ghost[] = [];
  private ribbon: { x: number; y: number }[] = [];

  private nextX = 1500;
  private lastEnd = 0;
  private lastKind = '';
  private spawning = false;
  private cleanT = 0;

  private jumpHeld = false;
  private slideHeld = false;
  private jumpBuf = 0;

  private orbs = 0;
  private meter = 0;
  private boostT = 0;
  private boostK = 0;
  private boostHeld = false;
  private boostHoldT = 0;
  private boostMult = 1.0;
  private camZoom = 1.0;
  private invuln = 0;
  private smashed = 0;
  private shake = 0;
  private flash = 0;
  private fade = 0;
  private dyingT = 0;
  private deathKind: 'hit' | 'fall' = 'hit';
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
    this.jumpHeld = false;
    this.slideHeld = false;
    this.cb.onState('paused');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.jumpBuf = 0;
    this.cb.onState('playing');
  }

  jumpDown() {
    this.sfx.init();
    this.jumpHeld = true;
    if (this.state === 'playing') this.jumpBuf = 0.12;
  }
  jumpUp() {
    this.jumpHeld = false;
  }
  slideDown() {
    this.slideHeld = true;
  }
  slideUp() {
    this.slideHeld = false;
  }

  boostDown() {
    this.boostHeld = true;
    if (this.state === 'playing') {
      if (this.boostT <= 0 && this.meter >= 1) {
        this.triggerBoost();
      }
    }
  }

  boostUp() {
    this.boostHeld = false;
  }

  boost() {
    this.boostDown();
  }

  private triggerBoost() {
    if (this.state !== 'playing' || this.meter < 1) return;
    const p = this.p;
    this.boostT = BOOST_DUR;
    this.boostHoldT = 0;
    this.boostMult = 2.0;
    this.flash = 0.85;
    this.shake = 14;
    this.sfx.boost();
    for (let i = 0; i < 4; i++) {
      this.emit(p.x, p.y - 34, this.speed, 0, 0.6 + i * 0.12, 10 + i * 10, '#ffd84a', 3);
    }
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * TAU;
      this.emit(p.x, p.y - 34, this.speed + Math.cos(a) * 350, Math.sin(a) * 350, 0.5, 2.5, '#fff3a0', 1);
    }
  }

  // ---------------------------------------------------------------- Dunia

  private onVis = () => {
    if (document.hidden) this.pause();
  };

  private resetWorld(play: boolean) {
    this.p = newPlayer();
    this.p.y = groundY(0);
    this.speed = play ? baseSpeed(0) : 330;
    this.camX = this.p.x - PSX;
    this.camY = groundY(140);
    this.obstacles = [];
    this.orbList = [];
    this.gaps = [];
    this.events = [];
    this.particles = [];
    this.ghosts = [];
    this.ribbon = Array.from({ length: RIB_N }, (_, i) => ({ x: this.p.x - i * RIB_L, y: this.p.y - 57 }));
    this.nextX = 2200;
    this.lastEnd = 0;
    this.lastKind = '';
    this.spawning = play;
    this.cleanT = 0;
    this.orbs = 0;
    this.meter = 0;
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
    this.jumpBuf = 0;
    this.jumpHeld = false;
    this.slideHeld = false;
    if (play) {
      this.addOrbLine(700, 7, 42);
      this.addOrbLine(1400, 7, 42);
      // Pre-spawn rintangan jauh di depan (hingga 4500px) sebelum pemain melangkah
      const initHorizon = this.p.x + 4500;
      let guard = 0;
      while (this.nextX < initHorizon && guard++ < 30) this.spawnPattern();
    }
  }

  private isGap(x: number): boolean {
    for (let i = 0; i < this.gaps.length; i++) {
      const g = this.gaps[i];
      if (x > g.x0 && x < g.x1) return true;
    }
    return false;
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

  // ---------------------------------------------------------------- Pembangkit rintangan

  private addOrbLine(x: number, n: number, sp: number, h = 28) {
    for (let i = 0; i < n; i++) {
      const wx = x + i * sp;
      this.orbList.push({ x: wx, y: groundY(wx) - h - 5 * Math.sin(i * 0.7), taken: false, ph: Math.random() * TAU });
    }
  }

  private addArc(cx: number, s: number, peak: number, count: number) {
    const half = s * 0.3;
    const pk = Math.min(peak, 105);
    for (let i = 0; i < count; i++) {
      const u = i / (count - 1);
      const wx = cx - half + 2 * half * u;
      const hh = 30 + pk * Math.sin(Math.PI * u);
      this.orbList.push({ x: wx, y: groundY(wx) - hh, taken: false, ph: Math.random() * TAU });
    }
  }

  private placeRock(x: number, s: number): number {
    const w = rand(46, 70);
    const h = rand(30, 62);
    this.obstacles.push({ kind: 'rock', x, w, h, pts: makeRockPts(), dead: false });
    this.addArc(x + w / 2, s, 40 + h * 0.9, 5);
    return x + w;
  }

  private placeCluster(x: number, s: number): number {
    let cx = x;
    const n = 3;
    let maxH = 0;
    for (let i = 0; i < n; i++) {
      const w = rand(40, 58);
      const h = rand(26, 42);
      maxH = Math.max(maxH, h);
      this.obstacles.push({ kind: 'rock', x: cx, w, h, pts: makeRockPts(), dead: false });
      cx += w - 8;
    }
    this.addArc((x + cx) / 2, s, 45 + maxH * 0.9, 6);
    return cx;
  }

  private placeChasm(x: number, s: number): number {
    const gw = clamp(s * rand(0.3, 0.43), 110, 340);
    this.gaps.push({ x0: x, x1: x + gw });
    this.addArc(x + gw / 2, s, 70, 7);
    return x + gw;
  }

  private placeSlab(x: number, _s: number): number {
    const w = rand(125, 150);
    this.obstacles.push({ kind: 'slab', x, w, seed: Math.random() * 1000, dead: false });
    const n = 4;
    for (let i = 0; i < n; i++) {
      const wx = x + 24 + (i * (w - 48)) / (n - 1);
      this.orbList.push({ x: wx, y: groundY(wx) - 20, taken: false, ph: Math.random() * TAU });
    }
    return x + w;
  }

  private placeCombo(x: number, s: number): number {
    const t = Math.floor(Math.random() * 4);
    const gx = s * rand(0.84, 0.98);
    let e: number;
    if (t === 0) {
      e = this.placeRock(x, s);
      e = this.placeRock(e + gx, s);
    } else if (t === 1) {
      e = this.placeChasm(x, s);
      e = this.placeRock(e + gx, s);
    } else if (t === 2) {
      e = this.placeRock(x, s);
      e = this.placeSlab(e + gx, s);
    } else {
      e = this.placeSlab(x, s);
      e = this.placeRock(e + gx, s);
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
      ['chasm', m > 45 ? 4 : 0],
      ['slab', m > 160 ? 3.5 : 0],
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
      case 'chasm':
        end = this.placeChasm(x, s);
        break;
      case 'slab':
        end = this.placeSlab(x, s);
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
    const rest = s * (1.02 - 0.32 * d) * rand(0.9, 1.4) * (1 + 0.4 * ease);
    this.nextX = end + rest;
    if (kind !== 'orbs' && kind !== 'boulder' && Math.random() < 0.55) {
      const n = Math.floor((rest * 0.5) / 40);
      if (n > 1) this.addOrbLine(end + rest * 0.25, n, 40);
    }
  }

  private spawnBoulder() {
    const p = this.p;
    // Spawn batu menggelinding SANGAT JAUH di luar pandangan kamera (minimal 2400px di depan pemain)
    const farAhead = Math.max(2400, (W / Math.min(0.42, this.camZoom)) + 1500);
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
    this.sfx.update(
      dt,
      clamp(this.speed / 1100, 0, 1),
      this.state === 'playing' || this.state === 'menu',
      clamp(this.speed / 1100, 0, 1),
    );
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
      ready: this.meter >= 1 && this.boostT <= 0,
      boostMult: this.boostT > 0 ? Math.round(this.boostMult * 10) / 10 : 1,
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
    this.speed = 330;
    p.x += this.speed * dt;
    p.y = groundY(p.x);
    p.onGround = true;
    this.dist = p.x / PX_PER_M;
  }

  private groundDist(): number {
    const p = this.p;
    return this.isGap(p.x) ? 999 : groundY(p.x) - p.y;
  }

  private doJump() {
    const p = this.p;
    p.vy = -JUMP_V;
    p.onGround = false;
    p.jumps = 1;
    p.coyote = 0;
    p.sliding = false;
    p.cut = false;
    p.airTime = 0;
    p.stretch = 1.28;
    p.ragdollFlail = Math.random() * Math.PI * 2;
    this.jumpBuf = 0;
    this.sfx.jump();
    this.dustBurst(p.x, p.y, 6);
  }

  private doAirJump() {
    const p = this.p;
    p.vy = -JUMP_V * 0.9;
    p.jumps = 0;
    p.cut = true;
    p.flipT = 0;
    p.airTime = 0;
    p.stretch = 1.34;
    p.ragdollFlail = Math.random() * Math.PI * 2;
    this.jumpBuf = 0;
    this.sfx.airJump();
    this.emit(p.x, p.y - 30, this.speed, 0, 0.45, 8, '#ffe27a', 3);
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * TAU;
      this.emit(p.x, p.y - 30, this.speed + Math.cos(a) * 220, Math.sin(a) * 220, 0.4, 2.2, '#fff3b0', 1);
    }
  }

  private land(g: number) {
    const p = this.p;
    const impact = p.vy;
    p.onGround = true;
    p.airTime = 0;
    p.stretch = 1.0;
    p.y = g;
    p.vy = 0;
    p.jumps = 1;
    p.land = Math.min(1.4, 0.6 + impact / 500);
    p.flipT = -1;
    p.flip = 0;
    p.cut = false;
    const slope = slopeAt(p.x);
    if (slope > 0.08 && impact > 80) {
      // Sandboard downslope carving: pertahankan momentum & dorongan kecepatan
      const boostGain = Math.min(85, impact * 0.09 * slope);
      this.speed = Math.min(1100, this.speed + boostGain);
      if (this.boostT <= 0 && this.meter < 1) {
        this.meter = Math.min(1, this.meter + 0.025);
      }
    }
    if (impact > 260) {
      this.sfx.land();
      this.dustBurst(p.x, g, 8);
      this.shake = Math.max(this.shake, Math.min(7, impact * 0.007));
    }
  }

  private stepPlay(dt: number) {
    const p = this.p;
    this.dist = Math.max(0, p.x) / PX_PER_M;
    if (this.invuln > 0) this.invuln -= dt;

    // ---- Kilat
    if (this.boostT > 0) {
      this.boostT -= dt;
      this.meter = clamp(this.boostT / BOOST_DUR, 0, 1);

      if (this.boostHeld) {
        // Pemain men-panjer tombol boost: semakin lama semakin cepat hingga 5x!
        this.boostHoldT += dt;
        // Mencapai 5x lipat kecepatan dalam ~3 detik menahan panjer
        const ramp = clamp(this.boostHoldT / 3.0, 0, 1);
        this.boostMult = 2.0 + 3.0 * ramp;
        if (this.boostMult > 3.0) {
          this.shake = Math.max(this.shake, (this.boostMult - 3.0) * 1.5);
        }
      } else {
        // Jika dilepas dari panjer, kecepatan perlahan meluncur kembali ke 2.0x
        this.boostHoldT = Math.max(0, this.boostHoldT - dt * 1.2);
        this.boostMult = Math.max(2.0, this.boostMult - dt * 1.8);
      }

      if (this.boostT <= 0) {
        if (this.isGap(p.x - 70) || this.isGap(p.x) || this.isGap(p.x + 90)) {
          this.boostT = 0.02;
        } else {
          this.boostT = 0;
          this.meter = 0;
          this.boostHoldT = 0;
          this.boostMult = 1.0;
          this.invuln = 0.9;
        }
      }
    } else {
      this.boostHoldT = 0;
      this.boostMult = 1.0;
    }
    const boosting = this.boostT > 0;

    // ---- Kecepatan
    const slope = slopeAt(p.x);
    const slideBonus = (p.sliding && slope > 0.02) ? slope * 0.45 : 0;
    const mod2 = 1 + clamp(slope * 0.55 + slideBonus, -0.16, 0.35);
    // Saat boost, kecepatan meningkat bertahap hingga 5x bila dipanjer!
    const target = baseSpeed(this.dist) * mod2 * (boosting ? this.boostMult : 1);
    const acc = boosting ? (this.boostHeld ? 3600 : 2600) : 550;
    this.speed += clamp(target - this.speed, -acc * dt, acc * dt);

    // ---- Input lompat
    if (this.jumpBuf > 0) {
      this.jumpBuf -= dt;
      if (p.onGround || p.coyote > 0) this.doJump();
      else if (p.jumps > 0 && this.groundDist() > 50) this.doAirJump();
    }

    // ---- Gerak
    if (p.onGround) {
      p.x += this.speed * dt;
      p.y = groundY(p.x);
      p.coyote = COYOTE;
      p.airTime = 0;
      if (!boosting && this.isGap(p.x)) {
        p.onGround = false;
        p.vy = 0;
        p.sliding = false;
      } else {
        if (this.slideHeld && !p.sliding) {
          p.sliding = true;
          p.slideT = 0;
          this.sfx.slide();
        }
        if (p.sliding) {
          p.slideT += dt;
          if (!this.slideHeld && p.slideT > 0.3) p.sliding = false;
        }
      }
    } else {
      p.coyote = Math.max(0, p.coyote - dt);
      p.sliding = false;
      p.airTime += dt;
      // Kemiringan ragdoll fluid dinamis saat meluncur di udara
      const targetRot = clamp(p.vy * 0.00045, -0.32, 0.42);
      p.rot += (targetRot - p.rot) * Math.min(1, dt * 10);
      const targetStretch = p.vy < -200 ? 1.16 : p.vy > 400 ? 0.92 : 1.0;
      p.stretch += (targetStretch - p.stretch) * Math.min(1, dt * 8);

      if (this.slideHeld) p.vy += 3600 * dt;
      p.vy = Math.min(p.vy + GRAVITY * dt, 1400);
      if (!this.jumpHeld && !p.cut && p.vy < -JUMP_CUT) {
        p.vy = -JUMP_CUT;
        p.cut = true;
      }
      p.x += this.speed * dt;
      p.y += p.vy * dt;
      const g = groundY(p.x);
      const solid = boosting || !this.isGap(p.x);
      if (solid && p.y >= g && p.vy >= 0) {
        const nearChasmWall = this.gaps.some((gp) => Math.abs(p.x - gp.x1) < 42 && p.y > g + 22);
        if (!boosting && nearChasmWall) this.die('wall');
        else this.land(g);
      }
      if (this.state === 'playing' && p.y > g + 380) this.die('fall');
    }
    if (this.state !== 'playing') return;

    // ---- Spawn & peristiwa
    if (this.spawning) {
      // Jarak horizon spawn minimal 3500px - 4500px jauh di luar batas kamera
      const viewMargin = (W / Math.min(0.42, this.camZoom)) + 600;
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
        this.gaps = this.gaps.filter((g) => g.x1 > cut);
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

    // ---- Tabrakan
    const hitH = p.sliding ? 36 : 66;
    const invincible = boosting || this.invuln > 0;
    for (const o of this.obstacles) {
      if (o.dead) continue;
      const cx = o.kind === 'boulder' ? o.x : o.x + o.w / 2;
      if (Math.abs(cx - p.x) > 220) continue;
      if (!this.hits(o, hitH)) continue;
      if (invincible) {
        if (o.kind !== 'slab') this.smash(o);
      } else {
        this.die('hit');
        return;
      }
    }

    // ---- Orb
    const bodyY = p.y - (p.sliding ? 16 : 34);
    const rad = boosting ? 130 : 32;
    for (const o of this.orbList) {
      if (o.taken) continue;
      if (o.x < p.x - 160 || o.x > p.x + 180) continue;
      if (Math.hypot(o.x - (p.x + 4), o.y - bodyY) < rad) {
        o.taken = true;
        this.orbs++;
        if (!boosting && this.meter < 1) {
          this.meter = Math.min(1, this.meter + ORB_GAIN);
        } else if (boosting) {
          // Mengambil orb saat boost memperpanjang durasi boost
          this.boostT = Math.min(BOOST_DUR, this.boostT + 0.8);
          this.meter = clamp(this.boostT / BOOST_DUR, 0, 1);
        }
        this.sfx.orb();
        for (let i = 0; i < 7; i++) {
          const a = Math.random() * TAU;
          this.emit(o.x, o.y, this.speed + Math.cos(a) * 170, Math.sin(a) * 170, 0.4, 2, '#ffe27a', 1);
        }
      }
    }
  }

  private hits(o: Obstacle, hitH: number): boolean {
    const p = this.p;
    if (o.kind === 'rock') {
      for (const dx of [-HIT_W, 0, HIT_W]) {
        const sx = p.x + dx;
        const u = (sx - o.x) / o.w;
        if (u < 0 || u > 1) continue;
        const top = groundY(sx) - o.h * rockProfile(o.pts, u) * 0.92;
        if (p.y > top + 7) return true;
      }
      return false;
    }
    if (o.kind === 'slab') {
      if (p.x + HIT_W > o.x + 4 && p.x - HIT_W < o.x + o.w - 4) {
        const g = groundY(p.x);
        const head = p.y - hitH;
        const topY = groundY(o.x + o.w / 2) - ARCH_H;
        if (head < g - TUNNEL && p.y > topY) return true;
      }
      return false;
    }
    const by = groundY(o.x) - o.r;
    const y0 = p.y - hitH + 8;
    const y1 = p.y - 3;
    const cy = clamp(by, y0, y1);
    return Math.hypot(o.x - p.x, by - cy) < o.r + 6;
  }

  private smash(o: Obstacle) {
    o.dead = true;
    this.smashed++;
    this.sfx.smash();
    this.shake = Math.max(this.shake, 6);
    const cx = o.kind === 'boulder' ? o.x : o.x + o.w / 2;
    const cy = groundY(cx) - (o.kind === 'rock' ? o.h * 0.5 : o.kind === 'boulder' ? o.r : 20);
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

  private die(kind: 'hit' | 'wall' | 'fall') {
    if (this.state !== 'playing') return;
    const p = this.p;
    this.state = 'dying';
    this.dyingT = 0;
    this.boostT = 0;
    this.meter = 0;
    p.sliding = false;
    this.jumpBuf = 0;
    if (kind === 'wall') {
      const g = this.gaps.find((gp) => p.x >= gp.x1 - 1 && p.x <= gp.x1 + 60);
      if (g) p.x = g.x1 - 8;
      this.speed = Math.min(this.speed, 260);
      this.deathKind = 'fall';
      this.sfx.crash();
      this.shake = 12;
      p.spin = 4;
      p.vy = Math.max(p.vy, 0);
    } else if (kind === 'fall') {
      this.deathKind = 'fall';
      this.sfx.fall();
      this.shake = 3;
      p.spin = 2.5;
    } else {
      this.deathKind = 'hit';
      this.sfx.crash();
      this.shake = 18;
      this.flash = 0.4;
      p.vy = -420;
      p.onGround = false;
      p.spin = 8;
      for (let i = 0; i < 12; i++) {
        this.emit(
          p.x + 10,
          p.y - rand(5, 50),
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
        this.emit(p.x + 10, p.y - 34, Math.cos(a) * 300, Math.sin(a) * 300, 0.4, 2, '#ffd84a', 1);
      }
    }
    this.cb.onState('dying');
  }

  private stepDying(dt: number) {
    const p = this.p;
    this.dyingT += dt;
    const decel = this.deathKind === 'fall' ? 450 : 1500;
    this.speed = Math.max(0, this.speed - decel * dt);
    p.x += this.speed * dt;
    p.vy = Math.min(p.vy + GRAVITY * dt, 1600);
    p.y += p.vy * dt;
    p.flip += p.spin * dt;
    if (this.deathKind === 'hit' && !this.isGap(p.x)) {
      const g = groundY(p.x);
      if (p.y >= g) {
        p.y = g;
        if (p.vy > 160) {
          p.vy = -p.vy * 0.3;
          this.dustBurst(p.x, g, 4);
        } else {
          p.vy = 0;
          p.onGround = true;
        }
        p.spin *= Math.exp(-dt * 3);
      }
    }
    if (this.dyingT > (this.deathKind === 'fall' ? 1.0 : 1.3)) this.finish();
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
    const dead = this.state === 'dying' || this.state === 'over';

    this.tod = this.dist / 650 + this.todDrift;

    // bobot pose
    const k = 1 - Math.exp(-dt * 16);
    p.wAir += (!p.onGround && !dead ? 1 - p.wAir : -p.wAir) * k;
    p.wSlide += (p.sliding && !dead ? 1 - p.wSlide : -p.wSlide) * k;
    p.wDead += (dead ? 1 - p.wDead : -p.wDead) * k;
    p.land = Math.max(0, p.land - dt * 5);

    // fase lari
    if (!dead) {
      p.phase += dt * (p.onGround ? 13 + this.speed * 0.013 * (1 + this.boostK * 0.35) : 6);
    }

    // salto di udara
    if (!dead && p.flipT >= 0) {
      p.flipT += dt / 0.5;
      const t = Math.min(1, p.flipT);
      p.flip = TAU * (1 - Math.pow(1 - t, 3));
      if (p.flipT >= 1) {
        p.flipT = -1;
        p.flip = 0;
      }
    }

    // rotasi mengikuti lereng
    if (!dead && p.onGround) {
      const tr = Math.atan(slopeAt(p.x)) * 0.85;
      p.rot += (tr - p.rot) * Math.min(1, dt * 14);
    }

    // kamera
    this.camX = p.x - PSX;
    const aheadGround = groundY(p.x + 150);
    const airOffset = Math.min(0, (p.y - aheadGround) * 0.42);
    const ty = aheadGround + airOffset;
    this.camY += (ty - this.camY) * Math.min(1, dt * 3.5);

    // Zoom out kamera 2x secara halus (target 0.5) saat ngeboost, melebar dinamis hingga 0.42 saat 5x
    const targetZoom = this.boostT > 0
      ? 0.52 - 0.1 * clamp((this.boostMult - 2.0) / 3.0, 0, 1)
      : 1.0;
    const zoomSpeed = this.boostT > 0 ? 2.8 : 3.5;
    this.camZoom += (targetZoom - this.camZoom) * (1 - Math.exp(-dt * zoomSpeed));

    // kilat visual
    const bt = this.boostT > 0 ? 1 : 0;
    this.boostK += (bt - this.boostK) * Math.min(1, dt * 6);

    this.shake = Math.max(0, this.shake - dt * 40);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.fade = Math.max(0, this.fade - dt * 1.6);

    // pita
    const nx = p.x + lerp(1, -22, p.wSlide);
    const ny = p.y - lerp(57, 23, p.wSlide);
    const rb = this.ribbon;
    rb[0].x = nx;
    rb[0].y = ny;
    for (let i = 1; i < rb.length; i++) {
      const a = rb[i - 1];
      const b = rb[i];
      b.y += 22 * dt * (i / rb.length);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      b.x = a.x + (dx / d) * RIB_L;
      b.y = a.y + (dy / d) * RIB_L;
    }

    // debu lari
    if (!dead && p.onGround && (this.state === 'playing' || this.state === 'menu')) {
      p.dustT -= dt;
      if (p.dustT <= 0) {
        p.dustT = p.sliding ? 0.03 : 0.07;
        this.emit(p.x - 6, p.y - 1, -rand(10, 60), -rand(5, 45), rand(0.35, 0.6), rand(2.5, 4.8), this.dustCss, 0);
        if (p.sliding) {
          this.emit(p.x - 12, p.y - 2, -rand(0, 60), -rand(20, 80), 0.3, 1.8, '#ffe27a', 1);
        }
      }
    }

    // percikan kilat
    if (this.boostK > 0.3 && this.state === 'playing') {
      for (let i = 0; i < 2; i++) {
        this.emit(
          p.x - rand(0, 24),
          p.y - rand(2, 64),
          -rand(0, 200),
          rand(-80, 80),
          rand(0.15, 0.3),
          rand(1.4, 2.4),
          Math.random() < 0.5 ? '#ffd84a' : '#fffbe0',
          1,
        );
      }
      this.ghostT -= dt;
      if (this.ghostT <= 0) {
        this.ghostT = 0.035;
        this.ghosts.push({
          x: p.x,
          y: p.y,
          rot: p.rot,
          flip: p.flip,
          view: this.runnerView(),
          life: GHOST_LIFE,
        });
      }
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      this.ghosts[i].life -= dt;
      if (this.ghosts[i].life <= 0) this.ghosts.splice(i, 1);
    }

    // partikel
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

  private runnerView(): RunnerView {
    const p = this.p;
    return {
      phase: p.phase,
      lean: clamp((this.speed - 300) / 700, 0, 1),
      vy: p.vy,
      wAir: p.wAir,
      wSlide: p.wSlide,
      wDead: p.wDead,
      airTime: p.airTime,
      ragdollFlail: p.ragdollFlail,
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

    // Kamera zoom out 2x secara smooth saat boost
    const z = this.camZoom;
    const focusX = W * 0.42;
    const focusY = GS - 60;
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
      else if (o.kind === 'slab') this.drawSlab(o, pal);
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
    const margin = (W / Math.min(0.4, this.camZoom)) + 300;
    const x0 = camX - margin;
    const x1 = camX + W + margin;
    const groundBottom = H + 600;

    // jurang
    for (const g of this.gaps) {
      if (g.x1 < x0 || g.x0 > x1) continue;
      const xs0 = g.x0 - camX;
      const xs1 = g.x1 - camX;
      const n = Math.max(2, Math.ceil((g.x1 - g.x0) / 10));
      ctx.beginPath();
      ctx.moveTo(xs0, this.sy(g.x0));
      for (let i = 1; i <= n; i++) {
        const wx = g.x0 + ((g.x1 - g.x0) * i) / n;
        ctx.lineTo(wx - camX, this.sy(wx));
      }
      ctx.lineTo(xs1, groundBottom);
      ctx.lineTo(xs0, groundBottom);
      ctx.closePath();
      const ag = ctx.createLinearGradient(0, GS - 90, 0, groundBottom);
      ag.addColorStop(0, css(mix(c.gBot, c.obs, 0.5)));
      ag.addColorStop(1, css(c.obs));
      ctx.fillStyle = ag;
      ctx.fill();
      const sg = ctx.createLinearGradient(xs0, 0, xs1, 0);
      sg.addColorStop(0, 'rgba(0,0,0,0.38)');
      sg.addColorStop(0.2, 'rgba(0,0,0,0)');
      sg.addColorStop(0.8, 'rgba(0,0,0,0)');
      sg.addColorStop(1, 'rgba(0,0,0,0.38)');
      ctx.fillStyle = sg;
      ctx.fill();

      // jembatan kilat
      if (this.boostK > 0.05) {
        const seed = Math.floor(this.time * 20);
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
          const wx = g.x0 + ((g.x1 - g.x0) * i) / n;
          const y = this.sy(wx) + (hash(i * 3.1 + seed) - 0.5) * 8;
          if (i === 0) ctx.moveTo(wx - camX, y);
          else ctx.lineTo(wx - camX, y);
        }
        ctx.lineJoin = 'round';
        ctx.strokeStyle = `rgba(255,215,64,${0.5 * this.boostK})`;
        ctx.lineWidth = 8;
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,235,${0.95 * this.boostK})`;
        ctx.lineWidth = 2.2;
        ctx.stroke();
      }
    }

    // segmen tanah
    const segs: [number, number][] = [];
    let cur = x0;
    for (const g of this.gaps) {
      if (g.x1 <= cur) continue;
      if (g.x0 >= x1) break;
      if (g.x0 > cur) segs.push([cur, g.x0]);
      cur = Math.max(cur, g.x1);
    }
    if (cur < x1) segs.push([cur, x1]);

    const ground = new Path2D();
    const rim = new Path2D();
    for (const [a, b] of segs) {
      const n = Math.max(1, Math.ceil((b - a) / 8));
      ground.moveTo(a - camX, groundBottom);
      for (let i = 0; i <= n; i++) {
        const wx = a + ((b - a) * i) / n;
        const x = wx - camX;
        const y = this.sy(wx);
        ground.lineTo(x, y);
        if (i === 0) rim.moveTo(x, y);
        else rim.lineTo(x, y);
      }
      ground.lineTo(b - camX, groundBottom);
      ground.closePath();
    }

    const grd = ctx.createLinearGradient(0, GS - 120, 0, groundBottom);
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
    const margin = (W / Math.min(0.4, this.camZoom)) + 300;
    const first = Math.floor((this.camX - margin) / cell) - 1;
    const last = Math.floor((this.camX + W + margin) / cell) + 1;
    const col = mix(c.gBot, c.obs, 0.25);
    const stoneCol = mix(c.obs, c.gTop, 0.35);
    ctx.lineCap = 'round';
    for (let ci = first; ci <= last; ci++) {
      const hval = hash(ci * 2.17);
      if (hval > 0.58) continue;
      const wx = ci * cell + hash(ci * 5.1) * cell;
      if (this.isGap(wx) || this.isGap(wx - 16) || this.isGap(wx + 16)) continue;
      const x = wx - this.camX;
      const y = groundY(wx) - this.camY + GS;
      const slope = slopeAt(wx);
      const rot = Math.atan(slope);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);

      const dType = hash(ci * 7.7);
      if (dType < 0.25) {
        // Bendera doa gurun berkibar (prayer flag poles khas Alto's Odyssey)
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
        // Tumpukan batu gurun kuno (stone cairn)
        ctx.fillStyle = css(stoneCol, 0.85);
        const stones = 3 + Math.floor(hash(ci * 9.1) * 2);
        let currY = 0;
        for (let s = 0; s < stones; s++) {
          const sw = (7 - s * 1.4) + hash(ci + s) * 2;
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
    const margin = (W / Math.min(0.4, this.camZoom)) + 300;
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

  private drawSlab(a: Slab, pal: Palette) {
    const ctx = this.ctx;
    const c = pal.c;
    const camX = this.camX;
    const camY = this.camY;
    const xs = a.x - camX;
    const margin = (W / Math.min(0.4, this.camZoom)) + 300;
    if (xs > W + margin || xs + a.w < -margin) return;
    const X0 = a.x;
    const X1 = a.x + a.w;
    const gc = groundY(a.x + a.w / 2);
    const topY = gc - ARCH_H;
    const j = (n: number) => hash(a.seed + n * 3.17);
    const S = (wx: number, wy: number): [number, number] => [wx - camX, wy - camY + GS];
    const bob = Math.sin(this.time * 1.6 + a.seed) * 2.5;
    const bot = (wx: number) => groundY(wx) - TUNNEL_V + bob;

    ctx.beginPath();
    let q = S(X0, bot(X0));
    ctx.moveTo(q[0], q[1]);
    q = S(X0 - 5 + j(1) * 6, topY + 80 + j(2) * 20);
    ctx.lineTo(q[0], q[1]);
    let c1 = S(X0 + 2, topY + 6);
    let e1 = S(X0 + 36, topY + j(3) * 10);
    ctx.quadraticCurveTo(c1[0], c1[1], e1[0], e1[1]);
    q = S(X0 + a.w * 0.58, topY - 8 + j(4) * 12);
    ctx.lineTo(q[0], q[1]);
    c1 = S(X1 - 4, topY + 4);
    e1 = S(X1 + 2 - j(5) * 6, topY + 78 + j(6) * 20);
    ctx.quadraticCurveTo(c1[0], c1[1], e1[0], e1[1]);
    q = S(X1, bot(X1));
    ctx.lineTo(q[0], q[1]);
    for (let i = 7; i >= 0; i--) {
      const wx = X0 + (a.w * i) / 8;
      q = S(wx, bot(wx));
      ctx.lineTo(q[0], q[1]);
    }
    ctx.closePath();

    const top = topY - camY + GS;
    const g = ctx.createLinearGradient(0, top, 0, top + ARCH_H - TUNNEL_V);
    g.addColorStop(0, css(mix(c.obs, c.obsLight, 0.22)));
    g.addColorStop(1, css(c.obs));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = css(c.obs);
    ctx.lineWidth = 6;
    ctx.stroke();

    // strata & hiasan
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = css(c.obsLight, 0.13);
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const yy = topY + 55 + i * 42 + j(10 + i) * 8;
      ctx.beginPath();
      const s0 = S(X0 - 10, yy);
      const s1 = S(X1 + 10, yy + 6);
      ctx.moveTo(s0[0], s0[1]);
      ctx.lineTo(s1[0], s1[1]);
      ctx.stroke();
    }
    // sisi gelap kanan
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    const r0 = S(X0 + a.w * 0.62, topY - 20);
    const r1 = S(X1 + 20, topY - 20);
    const r2 = S(X1 + 20, gc);
    const r3 = S(X0 + a.w * 0.5, gc);
    ctx.beginPath();
    ctx.moveTo(r0[0], r0[1]);
    ctx.lineTo(r1[0], r1[1]);
    ctx.lineTo(r2[0], r2[1]);
    ctx.lineTo(r3[0], r3[1]);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // garis cahaya di bawah batu melayang
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const wx = X0 + 4 + ((a.w - 8) * i) / 8;
      const p2 = S(wx, bot(wx) - 1);
      if (i === 0) ctx.moveTo(p2[0], p2[1]);
      else ctx.lineTo(p2[0], p2[1]);
    }
    ctx.strokeStyle = css(c.obsLight, 0.85);
    ctx.lineWidth = 2.2;
    ctx.stroke();
    // pancaran halus
    const wx0 = X0 + a.w / 2;
    const gp = S(wx0, bot(wx0));
    const gl = ctx.createRadialGradient(gp[0], gp[1] + 6, 4, gp[0], gp[1] + 6, a.w * 0.6);
    gl.addColorStop(0, css(c.obsLight, 0.28));
    gl.addColorStop(1, css(c.obsLight, 0));
    ctx.fillStyle = gl;
    ctx.fillRect(gp[0] - a.w * 0.6, gp[1] - 10, a.w * 1.2, 40);

    // kerikil melayang
    ctx.fillStyle = css(c.obs, 0.9);
    for (let i = 0; i < 4; i++) {
      const wx = X0 + 14 + ((a.w - 28) * (i + 0.5)) / 4;
      const pp = S(wx, bot(wx) + 8 + Math.sin(this.time * 2 + i * 1.7 + a.seed) * 3);
      ctx.beginPath();
      ctx.arc(pp[0], pp[1], 2.4 + (i % 2), 0, TAU);
      ctx.fill();
    }
  }

  private drawBoulder(b: Boulder, pal: Palette) {
    const ctx = this.ctx;
    const c = pal.c;
    const sx = b.x - this.camX;
    const margin = (W / Math.min(0.4, this.camZoom)) + 300;
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
    const margin = (W / Math.min(0.4, this.camZoom)) + 300;
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

  private drawRunnerAt(x: number, y: number, rot: number, flip: number, land: number, view: RunnerView, tint: string | null, alpha: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x - this.camX, y - this.camY + GS);
    ctx.rotate(rot);

    // Dynamic ragdoll elastic bounce & stretch
    if (land > 0) {
      const bounce = Math.sin(land * Math.PI) * 0.28 * land;
      ctx.scale(1 + bounce, 1 - bounce);
    } else if (this.p.stretch && this.p.stretch !== 1) {
      const s = this.p.stretch;
      ctx.scale(1 / Math.sqrt(s), s);
    }

    if (flip !== 0) {
      ctx.translate(0, -32);
      ctx.rotate(flip);
      ctx.translate(0, 32);
    }
    drawRunner(ctx, view, tint);
    ctx.restore();
  }

  private drawPlayer(pal: Palette) {
    const ctx = this.ctx;
    const p = this.p;
    const sx = p.x - this.camX;
    const sy = p.y - this.camY + GS;
    const bk = this.boostK;

    // bayangan
    const gy = this.sy(p.x);
    if (!this.isGap(p.x) || bk > 0.5) {
      const hgt = Math.max(0, gy - sy);
      const a = 0.22 * clamp(1 - hgt / 260, 0, 1);
      if (a > 0.01) {
        ctx.fillStyle = `rgba(0,0,0,${a})`;
        ctx.beginPath();
        ctx.ellipse(sx, gy + 3, Math.max(8, 22 - hgt * 0.05), 4, 0, 0, TAU);
        ctx.fill();
      }
    }

    // aura
    if (bk > 0.03) {
      const cy = sy - 34;
      const ag = ctx.createRadialGradient(sx, cy, 6, sx, cy, 90);
      ag.addColorStop(0, `rgba(255,226,110,${0.5 * bk})`);
      ag.addColorStop(1, 'rgba(255,226,110,0)');
      ctx.fillStyle = ag;
      ctx.fillRect(sx - 100, cy - 100, 200, 200);
    }

    // sambaran kilat di belakang
    if (bk > 0.05) {
      const seed = Math.floor(this.time * 24);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let b = 0; b < 3; b++) {
        const y0 = sy - 14 - b * 20;
        const len = 140 + hash(seed + b * 3) * 130;
        const n = 7;
        ctx.beginPath();
        ctx.moveTo(sx - 6, y0);
        for (let i = 1; i <= n; i++) {
          ctx.lineTo(sx - 6 - (len * i) / n, y0 + (hash(seed * 3.1 + b * 11 + i) - 0.5) * 26);
        }
        ctx.strokeStyle = `rgba(255,214,64,${0.38 * bk})`;
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,232,${0.92 * bk})`;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    }

    // bayangan gerak
    for (const g of this.ghosts) {
      this.drawRunnerAt(g.x, g.y, g.rot, g.flip, 0, g.view, '#ffe27a', (g.life / GHOST_LIFE) * 0.38);
    }

    // pita / syal
    this.drawRibbon(pal);

    // pelari
    this.drawRunnerAt(p.x, p.y, p.rot, p.flip, p.land, this.runnerView(), null, 1);

    // kedip saat kebal setelah kilat
    if (this.invuln > 0 && Math.floor(this.time * 18) % 2 === 0) {
      this.drawRunnerAt(p.x, p.y, p.rot, p.flip, p.land, this.runnerView(), '#ffffff', 0.35);
    }
  }

  private drawRibbon(pal: Palette) {
    const ctx = this.ctx;
    const rb = this.ribbon;
    const n = rb.length;
    const boosting = this.boostK > 0.5;
    const col = boosting ? '#fff3a0' : '#ffd23f';
    const hi = boosting ? '#ffffff' : '#fff0a8';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < n; i++) {
      xs.push(rb[i].x - this.camX);
      ys.push(rb[i].y - this.camY + GS + Math.sin(this.time * 16 - i * 0.75) * i * 0.22);
    }
    for (let i = 0; i < n - 1; i++) {
      const w = 7 * Math.pow(1 - i / n, 0.9) + 0.8;
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(xs[i], ys[i]);
      ctx.lineTo(xs[i + 1], ys[i + 1]);
      ctx.stroke();
    }
    for (let i = 0; i < n - 1; i++) {
      const w = 2.4 * Math.pow(1 - i / n, 0.9);
      if (w < 0.4) break;
      ctx.strokeStyle = hi;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(xs[i], ys[i] - 0.4);
      ctx.lineTo(xs[i + 1], ys[i + 1] - 0.4);
      ctx.stroke();
    }
    void pal;
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
