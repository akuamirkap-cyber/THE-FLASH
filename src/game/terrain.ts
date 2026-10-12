import { smooth } from './util';

// Tinggi tanah (koordinat dunia, y ke bawah). 0 = garis acuan.
// Bukit-bukit lembut seperti bukit pasir; awal permainan dibuat datar.
export function groundY(x: number): number {
  const flat = smooth((x - 500) / 2200);
  const m = 0.7 + 0.3 * Math.sin(x * 0.00029 + 0.7);
  const h =
    52 * Math.sin(x * 0.0016 + 1.3) +
    26 * Math.sin(x * 0.0039 + 0.4) +
    8 * Math.sin(x * 0.0089 + 2.1);
  return -h * m * flat;
}

export function slopeAt(x: number): number {
  return (groundY(x + 6) - groundY(x - 6)) / 12;
}
