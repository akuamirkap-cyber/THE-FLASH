import { smooth } from './util';

/**
 * Alto's Odyssey-style Downhill Desert Mountain Terrain.
 *
 * Sifat:
 * - DOWNHILL HALUS: Bukan jalan datar, melainkan lereng gunung menurun secara
 *   kontinu (semakin lama semakin ke bawah).
 * - Kemiringan rata-rata menurun ~ +0.145 (~8-9 derajat kemiringan gunung).
 * - Diperkaya dengan bukit pelontar (launch swoops), cekungan ngarai pasir,
 *   bukit sabit (barchan dunes), dan lembah carving khas Alto's Odyssey.
 */

export const DOWNHILL_SLOPE = 0.145;

// Lengkungan asimetris bukit pasir sabit (barchan dune: lereng landai naik, turunan tajam)
function barchan(u: number): number {
  return (
    Math.sin(u) * 0.72 +
    Math.sin(2 * u - 0.7) * 0.36 +
    Math.sin(3 * u - 1.3) * 0.12
  );
}

// Lengkungan pelontar (launch swoop: lembah akselerasi meluncur ke punggung bukit)
function launchRamp(u: number): number {
  const s = Math.sin(u);
  return s > 0 ? Math.pow(s, 1.4) : -Math.pow(-s, 0.85);
}

// Plato teras bertingkat
function plateau(u: number): number {
  return Math.tanh(Math.sin(u) * 2.0) * 0.9;
}

export function groundY(x: number): number {
  // Transisi awal halus agar bagian menu/start lembut
  const intro = smooth((x - 200) / 1000);

  // 1. Lereng gunung DOWNHILL KONTINU (y bertambah positif ke bawah di kanvas)
  // Ini kunci agar pelari selalu meluncur menuruni lereng gunung!
  const mountainDownhill = x * DOWNHILL_SLOPE;

  // 2. Undulasi makro punggung gunung pasir
  const macro =
    55 * Math.sin(x * 0.00028 + 0.9) +
    28 * Math.sin(x * 0.00014 + 2.4);

  // 3. Multi-formasi bukit pasir Alto's Odyssey yang berbaur dinamis
  const cycle = (x * 0.00036) % 5;
  const c0 = Math.max(0, 1 - Math.abs(cycle - 0)); // Grand Launch Swoops
  const c1 = Math.max(0, 1 - Math.abs(cycle - 1)); // Canyon Basin & Dips
  const c2 = Math.max(0, 1 - Math.abs(cycle - 2)); // Crescent Barchan Dunes
  const c3 = Math.max(0, 1 - Math.abs(cycle - 3)); // Mesa Plateaus & Step Drops
  const c4 = Math.max(0, 1 - Math.abs(cycle - 4)); // Flow Rhythms
  const sum = c0 + c1 + c2 + c3 + c4 || 1;
  const w0 = c0 / sum;
  const w1 = c1 / sum;
  const w2 = c2 / sum;
  const w3 = c3 / sum;
  const w4 = c4 / sum;

  // Zone 0: Launch Swoops (lembah dalam untuk akselerasi luncur cepat)
  const duneLaunch =
    88 * launchRamp(x * 0.0012 + 1.2) +
    30 * Math.sin(x * 0.0029 + 0.4);

  // Zone 1: Canyon Basin & Steep Dips
  const duneCanyon =
    -35 +
    70 * Math.sin(x * 0.0017 + 2.1) +
    40 * barchan(x * 0.0034 + 0.8);

  // Zone 2: Crescent Dunes (punggung tajam & turunan terjal)
  const duneCrescent =
    95 * barchan(x * 0.0015 + 0.3) +
    24 * Math.sin(x * 0.0042 + 1.7);

  // Zone 3: Mesa Plateaus & Step Drops
  const duneMesa =
    75 * plateau(x * 0.00125 + 0.5) +
    32 * Math.sin(x * 0.003 + 1.9);

  // Zone 4: Flow Dunes (ombak pasir bergulir ritmik)
  const duneRolling =
    65 * Math.sin(x * 0.0019 + 0.7) +
    36 * Math.sin(x * 0.0038 + 2.2) +
    16 * Math.sin(x * 0.0078 + 1.1);

  const meso =
    duneLaunch * w0 +
    duneCanyon * w1 +
    duneCrescent * w2 +
    duneMesa * w3 +
    duneRolling * w4;

  // 4. Riak pasir halus (tekstur papan seluncur)
  const micro =
    6 * Math.sin(x * 0.0094 + 0.3) +
    3 * Math.sin(x * 0.02 + 2.1);

  // Total koordinat tanah:
  // mountainDownhill selalu mendorong arah ke bawah (+y) menuruni lereng gunung,
  // dihiasi bukit pasir, lembah akselerasi, dan puncak melengkung.
  return mountainDownhill * intro - (macro + meso + micro) * intro;
}

export function slopeAt(x: number): number {
  return (groundY(x + 5) - groundY(x - 5)) / 10;
}
