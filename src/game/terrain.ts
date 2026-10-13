import { smooth } from './util';

/**
 * Medan gurun bergunung ala Alto's Odyssey.
 *
 * Prinsip desain:
 * - TIDAK ADA GARIS LURUS. Kemiringan dasar gunung pun ikut berombak: kadang
 *   landai, kadang menukik — jadi terasa "menurun miring" terus berubah,
 *   bukan satu garis diagonal statis.
 * - Semua bentuk dibangun dari jumlah gelombang sinus (mulus, turunan kontinu
 *   tak terputus) dengan frekuensi tak harmonik agar bentuknya tidak berulang
 *   dan tidak pernah kelihatan kaku.
 * - Bukit pasir besar (dune) berpadu dengan riak pasir kecil, sehingga
 *   punggung bukit membulat halus lalu melandai turun seperti di Alto's Odyssey.
 */

export const DOWNHILL_SLOPE = 0.135;

interface Wave {
  f: number;
  a: number;
  p: number;
}

// Kemiringan dasar gunung yang berombak sangat panjang (integralnya mulus).
// Amplitudo a/f menentukan tinggi gelombang penurunan.
const DESCENT: Wave[] = [
  { f: 0.00042, a: 0.055, p: 0.6 },
  { f: 0.00107, a: 0.03, p: 2.3 },
  { f: 0.00253, a: 0.014, p: 4.1 },
];

// Bukit pasir: gelombang panjang + sedang + riak halus (semua membulat).
const DUNES: Wave[] = [
  { f: 0.00168, a: 132, p: 1.1 },
  { f: 0.00261, a: 70, p: 3.4 },
  { f: 0.00506, a: 30, p: 0.3 },
  { f: 0.00913, a: 12, p: 2.0 },
  { f: 0.01573, a: 5, p: 5.2 },
  { f: 0.0305, a: 2, p: 1.7 },
];

// Punggung bukit karang/mesa besar yang muncul berkala (tetap membulat).
function megaDune(x: number): number {
  const u = x * 0.00071 + 0.8;
  // Kombinasi dua sinus berdekatan → bentuk bonggol panjang lalu turun landai
  const b = Math.sin(u) * 0.68 + Math.sin(u * 1.87 + 1.3) * 0.32;
  return Math.pow(Math.max(0, b), 1.35) * 190 - 42;
}

// Kemiringan dasar gunung pada titik x (selalu berombak halus).
export function baseSlope(x: number): number {
  let s = DOWNHILL_SLOPE;
  for (let i = 0; i < DESCENT.length; i++) {
    const d = DESCENT[i];
    s += d.a * Math.cos(x * d.f + d.p);
  }
  return s;
}

// Penurunan gunung: integral mulus dari baseSlope (sehingga tebing terasa miring).
function descent(x: number): number {
  let y = DOWNHILL_SLOPE * x;
  for (let i = 0; i < DESCENT.length; i++) {
    const d = DESCENT[i];
    y += -(d.a / d.f) * Math.cos(x * d.f + d.p);
  }
  return y;
}

function dunes(x: number): number {
  let h = megaDune(x);
  for (let i = 0; i < DUNES.length; i++) {
    const d = DUNES[i];
    // Modulasi amplitudo: bukit kadang tinggi kadang rendah (tanpa sudut tajam)
    const mod = 0.62 + 0.38 * Math.sin(x * 0.00061 + i * 2.1);
    h += d.a * mod * Math.sin(x * d.f + d.p);
  }
  return h;
}

export function groundY(x: number): number {
  // Bagian awal (menu) diblend halus agar tidak ada patahan bentuk
  const intro = smooth((x - 260) / 1100);
  const flat = 6 * Math.sin(x * 0.0009);
  return (descent(x) - dunes(x)) * intro + flat * (1 - intro);
}

export function slopeAt(x: number): number {
  return (groundY(x + 6) - groundY(x - 6)) / 12;
}
