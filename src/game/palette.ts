import { RGB, hex, lerp, mix, smooth } from './util';

const COLOR_KEYS = [
  'skyTop',
  'skyMid',
  'skyBot',
  'sun',
  'glow',
  'l1',
  'l2',
  'l3',
  'l4',
  'gTop',
  'gBot',
  'rim',
  'obs',
  'obsLight',
  'haze',
] as const;

type ColorKey = (typeof COLOR_KEYS)[number];

type Def = Record<ColorKey, string> & {
  stars: number;
  moon: number;
  sunX: number;
  sunY: number;
  sunR: number;
};

// Lima suasana: fajar, siang, senja, petang, malam
const DEFS: Def[] = [
  {
    // Fajar
    skyTop: '#5d5aa6',
    skyMid: '#e68fa8',
    skyBot: '#ffd2a2',
    sun: '#fff1d6',
    glow: '#ffc79c',
    l1: '#d7a2b9',
    l2: '#c185a6',
    l3: '#a06891',
    l4: '#7b507e',
    gTop: '#6a4879',
    gBot: '#2f1f4b',
    rim: '#ffc9a8',
    obs: '#2b1c40',
    obsLight: '#ffb899',
    haze: '#ffd8b8',
    stars: 0.25,
    moon: 0,
    sunX: 0.3,
    sunY: 0.5,
    sunR: 46,
  },
  {
    // Siang
    skyTop: '#47a6e0',
    skyMid: '#9fd8ee',
    skyBot: '#fff0cf',
    sun: '#fffdf0',
    glow: '#fff4c4',
    l1: '#a9dbd6',
    l2: '#82c3c4',
    l3: '#5ea5ae',
    l4: '#41879a',
    gTop: '#f0c47c',
    gBot: '#c98a50',
    rim: '#fff2c2',
    obs: '#3b2a3d',
    obsLight: '#fff0c0',
    haze: '#fff3d8',
    stars: 0,
    moon: 0,
    sunX: 0.62,
    sunY: 0.2,
    sunR: 42,
  },
  {
    // Senja
    skyTop: '#2f2768',
    skyMid: '#d9567c',
    skyBot: '#ffb06c',
    sun: '#ffe4aa',
    glow: '#ff9d6c',
    l1: '#cc5f80',
    l2: '#9d4779',
    l3: '#70357a',
    l4: '#47265f',
    gTop: '#5a2b60',
    gBot: '#25123a',
    rim: '#ff9f76',
    obs: '#1d1030',
    obsLight: '#ff9d76',
    haze: '#ffb78e',
    stars: 0.1,
    moon: 0,
    sunX: 0.7,
    sunY: 0.52,
    sunR: 54,
  },
  {
    // Petang
    skyTop: '#16164b',
    skyMid: '#6b3d9a',
    skyBot: '#f08ca2',
    sun: '#ffd8e2',
    glow: '#f090b8',
    l1: '#9c5eaa',
    l2: '#70479a',
    l3: '#4c3584',
    l4: '#2f2768',
    gTop: '#2e1f5c',
    gBot: '#150e34',
    rim: '#c98cd4',
    obs: '#120c2d',
    obsLight: '#c98cd4',
    haze: '#d68cba',
    stars: 0.55,
    moon: 0.5,
    sunX: 0.78,
    sunY: 0.58,
    sunR: 40,
  },
  {
    // Malam
    skyTop: '#070b25',
    skyMid: '#16205b',
    skyBot: '#36489b',
    sun: '#ecf1ff',
    glow: '#7f94e2',
    l1: '#303d88',
    l2: '#253174',
    l3: '#1b2562',
    l4: '#131b4f',
    gTop: '#1a2160',
    gBot: '#0a0e2d',
    rim: '#6f84e6',
    obs: '#070a22',
    obsLight: '#6f84e6',
    haze: '#4b5db2',
    stars: 1,
    moon: 1,
    sunX: 0.3,
    sunY: 0.22,
    sunR: 34,
  },
];

interface Parsed {
  c: Record<ColorKey, RGB>;
  stars: number;
  moon: number;
  sunX: number;
  sunY: number;
  sunR: number;
}

const PARSED: Parsed[] = DEFS.map((d) => {
  const c = {} as Record<ColorKey, RGB>;
  for (const k of COLOR_KEYS) c[k] = hex(d[k]);
  return { c, stars: d.stars, moon: d.moon, sunX: d.sunX, sunY: d.sunY, sunR: d.sunR };
});

export type Palette = Parsed;

export function paletteAt(tod: number): Palette {
  const n = PARSED.length;
  const f = Math.floor(tod);
  const t = tod - f;
  const a = PARSED[((f % n) + n) % n];
  const b = PARSED[(((f + 1) % n) + n) % n];
  const k = smooth((t - 0.3) / 0.7);
  const c = {} as Record<ColorKey, RGB>;
  for (const key of COLOR_KEYS) c[key] = mix(a.c[key], b.c[key], k);
  return {
    c,
    stars: lerp(a.stars, b.stars, k),
    moon: lerp(a.moon, b.moon, k),
    sunX: lerp(a.sunX, b.sunX, k),
    sunY: lerp(a.sunY, b.sunY, k),
    sunR: lerp(a.sunR, b.sunR, k),
  };
}
