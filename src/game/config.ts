// Ukuran dunia logis (rasio 9:16)
export const W = 540;
export const H = 960;
// Posisi layar (y) tempat acuan garis tanah berada
export const GS = 650;
// Posisi layar (x) naga
export const PSX = 150;
// Posisi layar (y) tempat naga terbang (titik tumpu kamera)
export const FLY_Y = 512;
// Langkah simulasi tetap
export const STEP = 1 / 120;

// ------------------------------------------------------------------ Terbang
// Naga selalu melaju ke depan; pemain mengatur naik / turun.
export const LIFT = 1150; // tarikan gravitasi (dipakai saat jatuh / penopang batas langit)
export const CLIMB_ACC = 2700; // kelembutan perubahan saat menanjak
export const DIVE_ACC = 2300; // kelembutan perubahan saat menukik
export const GLIDE_ACC = 1400; // kelembutan saat meluncur bebas
export const CLIMB_V = 580; // kecepatan naik maksimum (px/s, ke atas)
export const DIVE_V = 900; // kecepatan menukik maksimum (px/s, ke bawah)
export const SINK_V = 45; // laju turun alami saat meluncur (di atas laju lereng)
export const MAX_ALT = 640; // ketinggian maksimum di atas lereng gunung
export const ALT_SOFT = 90; // zona peredaman sebelum batas ketinggian
export const BODY_R = 15; // radius tabrakan tubuh naga
export const BELLY = 12; // jarak perut naga dari titik tumpu
export const SLAM_V = 620; // kecepatan turun yang membuat naga menabrak (di atas ini = tamat)
export const NOSE = 30; // moncong naga di depan titik tumpu

// ------------------------------------------------------------------ Kilat
// Boost dipakai DI LANGIT (bukan lagi di tanah).
export const BOOST_MULT_MIN = 1.9;
export const BOOST_MULT_MAX = 5.0;
export const BOOST_RAMP = 2.6; // detik menahan panjer untuk mencapai 5x
export const BOOST_DRAIN = 0.185; // meter per detik saat kilat menyala
export const BOOST_MIN = 0.24; // meter minimal untuk menyalakan kilat
export const BOOST_REGEN = 0.032; // isi ulang pasif per detik
export const BOOST_FLOOR = 190; // saat kilat, naga otomatis terangkat dari lereng
export const ORB_GAIN = 0.085;

export const PX_PER_M = 22;

export function baseSpeed(meters: number): number {
  return 385 + 315 * (1 - Math.exp(-meters / 1500));
}
