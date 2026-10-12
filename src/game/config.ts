// Ukuran dunia logis (rasio 9:16)
export const W = 540;
export const H = 960;
// Posisi layar (y) tempat permukaan tanah acuan berada
export const GS = 650;
// Posisi layar (x) pelari
export const PSX = 150;
// Langkah simulasi tetap
export const STEP = 1 / 120;

// Fisika
export const GRAVITY = 2300;
export const JUMP_V = 820;
export const JUMP_CUT = 330;
export const COYOTE = 0.12;

// Rintangan
export const TUNNEL = 50; // tinggi bebas terowongan gerbang batu (tabrakan)
export const TUNNEL_V = 60; // tinggi visual terowongan
export const ARCH_H = 215;

// Kilat (boost)
export const BOOST_DUR = 10; // durasi lebih lama
export const ORB_GAIN = 0.08;

export const HIT_W = 9;
export const PX_PER_M = 22;

export function baseSpeed(meters: number): number {
  return 400 + 300 * (1 - Math.exp(-meters / 1600));
}
