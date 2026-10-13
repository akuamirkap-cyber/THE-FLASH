// Efek suara & musik ambient generatif (WebAudio, tanpa file eksternal)

const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private fxBus: GainNode | null = null;
  private wetBus: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private muted = false;
  private musicT = 1;
  private noteIdx = 3;
  private orbStep = 0;
  private orbTime = 0;

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
    }
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(ctx.destination);

    this.fxBus = ctx.createGain();
    this.fxBus.gain.value = 1;
    this.fxBus.connect(this.master);

    // delay lembut untuk suasana
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.36;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    this.wetBus = ctx.createGain();
    this.wetBus.gain.value = 1;
    this.wetBus.connect(delay);
    delay.connect(lp);
    lp.connect(fb);
    fb.connect(delay);
    const wetOut = ctx.createGain();
    wetOut.gain.value = 0.55;
    lp.connect(wetOut);
    wetOut.connect(this.master);

    // noise
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // angin
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    src.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    src.start();
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    toFreq?: number,
    wet = 0,
    attack = 0.008,
  ) {
    const ctx = this.ctx;
    if (!ctx || !this.fxBus || this.muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (toFreq) o.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.fxBus);
    if (wet > 0 && this.wetBus) {
      const w = ctx.createGain();
      w.gain.value = wet;
      g.connect(w);
      w.connect(this.wetBus);
    }
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, freq: number, vol: number, q = 0.8, type: BiquadFilterType = 'bandpass', toFreq?: number) {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuf || !this.fxBus || this.muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (toFreq) f.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.fxBus);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  jump() {
    this.tone(320, 0.2, 'sine', 0.14, 640);
    this.noise(0.16, 900, 0.05, 0.8, 'bandpass', 2400);
  }
  airJump() {
    this.tone(520, 0.22, 'triangle', 0.13, 1040, 0.25);
    this.noise(0.2, 1500, 0.06, 0.8, 'bandpass', 4000);
  }
  land() {
    this.tone(150, 0.14, 'sine', 0.14, 70);
    this.noise(0.1, 500, 0.05, 0.9, 'lowpass');
  }
  slide() {
    this.noise(0.32, 1800, 0.06, 0.7, 'bandpass', 700);
  }
  orb() {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - this.orbTime > 1.1) this.orbStep = 0;
    this.orbTime = now;
    const n = SCALE[this.orbStep % SCALE.length];
    this.orbStep++;
    // Nada lonceng kristal lirih & halus (zen & damai khas Alto's Odyssey)
    const f = 587.33 * Math.pow(2, n / 12);
    this.tone(f, 0.45, 'sine', 0.024, undefined, 0.75, 0.012);
    this.tone(f * 2.01, 0.32, 'sine', 0.008, undefined, 0.6, 0.012);
  }
  boost() {
    this.tone(180, 0.7, 'sawtooth', 0.08, 1400, 0.3);
    this.tone(90, 0.7, 'sine', 0.2, 300);
    this.noise(0.8, 600, 0.12, 0.6, 'bandpass', 5000);
  }
  smash() {
    this.noise(0.28, 1800, 0.14, 0.7, 'bandpass', 500);
    this.tone(220, 0.2, 'square', 0.05, 80);
  }
  crash() {
    this.noise(0.6, 900, 0.22, 0.6, 'lowpass', 120);
    this.tone(110, 0.5, 'sine', 0.25, 38);
  }
  fall() {
    this.tone(500, 0.8, 'sine', 0.1, 90, 0.2);
  }
  /** Sayap mengepak (dipakai sesekali saat menanjak). */
  flap() {
    this.noise(0.22, 420, 0.045, 0.5, 'lowpass', 180);
    this.tone(120, 0.18, 'sine', 0.05, 70);
  }
  /** Kilat ditolak karena energinya belum cukup. */
  deny() {
    this.tone(240, 0.12, 'triangle', 0.07, 150);
  }
  /** Kilat habis. */
  boostEnd() {
    this.tone(600, 0.4, 'sine', 0.07, 180, 0.3);
    this.noise(0.5, 900, 0.06, 0.6, 'bandpass', 260);
  }

  update(dt: number, speedNorm: number, active: boolean, energy: number) {
    const ctx = this.ctx;
    if (!ctx || !this.windGain || !this.windFilter) return;
    const target = this.muted ? 0 : active ? 0.03 + 0.1 * speedNorm : 0.02;
    this.windGain.gain.setTargetAtTime(target, ctx.currentTime, 0.2);
    this.windFilter.frequency.setTargetAtTime(350 + 900 * speedNorm, ctx.currentTime, 0.2);

    // musik ambient pentatonik acak
    this.musicT -= dt;
    if (this.musicT <= 0 && !this.muted) {
      const step = Math.random() < 0.55 ? 1 : -1;
      this.noteIdx = Math.min(SCALE.length - 1, Math.max(0, this.noteIdx + step * (Math.random() < 0.3 ? 2 : 1)));
      const n = SCALE[this.noteIdx];
      const f = 220 * Math.pow(2, n / 12);
      this.tone(f, 2.4, 'triangle', 0.05, undefined, 0.9, 0.04);
      if (Math.random() < 0.25) this.tone(f / 2, 3.2, 'sine', 0.06, undefined, 0.5, 0.2);
      this.musicT = (0.5 + Math.random() * 0.7) * (1.25 - energy * 0.6);
    }
  }
}
