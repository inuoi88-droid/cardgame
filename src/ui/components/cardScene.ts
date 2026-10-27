/**
 * カードの絵の窓の背景（決定事項 #142）。外の素材は使わず、SVG をその場で組み立てる（ライセンスの心配なし・ファイルが増えない）。
 * - 場面は 種族（獣＝森・竜＝火山・不死＝墓場・機械＝工房・精霊＝オーロラ・人＝城）→ 呪い → カードの絵と名前から推した属性
 *   （氷・炎・毒・血・聖・闇・魔力・物理。演出と同じ guessElement）→ 種類（アタック＝夕焼け・スキル＝草原・パワー＝星空・モンスター＝野）の順に決める
 * - 同じ場面でもカードの ID から3通りに変える（木の高さ・星の位置など）
 * - 絵の円盤の後ろに敷くので、暗めで中央を空ける。CSS は `--art-scene`（cardFrame.css の .tcg__art、battle.css の .hc__icon・.mt__icon）
 * 純粋関数（tests/cardScene.test.ts）。できた data URI は場面と変化ごとに使い回す。
 */
import type { CSSProperties } from 'react';
import type { CardDef, CardType, TribeId } from '../../engine/index.ts';
import { guessElement } from '../battle/fx/element.ts';

export type SceneId =
  | 'forest'
  | 'volcano'
  | 'graveyard'
  | 'foundry'
  | 'aurora'
  | 'castle'
  | 'glacier'
  | 'flame'
  | 'swamp'
  | 'bloodmoon'
  | 'temple'
  | 'abyss'
  | 'starfield'
  | 'plains'
  | 'dusk'
  | 'meadow'
  | 'cursed';

export const SCENE_IDS: readonly SceneId[] = [
  'forest',
  'volcano',
  'graveyard',
  'foundry',
  'aurora',
  'castle',
  'glacier',
  'flame',
  'swamp',
  'bloodmoon',
  'temple',
  'abyss',
  'starfield',
  'plains',
  'dusk',
  'meadow',
  'cursed',
];

/** 場面の名前（説明・テスト用） */
export const SCENE_LABEL: Record<SceneId, string> = {
  forest: '夜の森',
  volcano: '火山',
  graveyard: '月夜の墓場',
  foundry: '歯車の工房',
  aurora: 'オーロラ',
  castle: '夜明けの城',
  glacier: '氷河',
  flame: '炎',
  swamp: '毒の沼',
  bloodmoon: '赤い月',
  temple: '光の神殿',
  abyss: '深淵',
  starfield: '星空',
  plains: '野',
  dusk: '夕焼け',
  meadow: '草原',
  cursed: '呪いの紋',
};

export const TRIBE_SCENE: Record<TribeId, SceneId> = {
  beast: 'forest',
  dragon: 'volcano',
  undead: 'graveyard',
  machine: 'foundry',
  spirit: 'aurora',
  human: 'castle',
};

const ELEMENT_SCENE: Record<string, SceneId> = {
  ice: 'glacier',
  fire: 'flame',
  poison: 'swamp',
  blood: 'bloodmoon',
  holy: 'temple',
  shadow: 'abyss',
  arcane: 'starfield',
  physical: 'plains',
};

const TYPE_SCENE: Record<CardType, SceneId> = {
  attack: 'dusk',
  skill: 'meadow',
  power: 'starfield',
  powerAttack: 'starfield',
  monster: 'plains',
};

/** カードの場面（種族 → 呪い → 属性 → 種類） */
export function sceneOf(card: Pick<CardDef, 'tribe' | 'icon' | 'name'> | undefined, cardType: CardType | undefined, curse = false): SceneId {
  if (card?.tribe && TRIBE_SCENE[card.tribe]) return TRIBE_SCENE[card.tribe];
  if (curse) return 'cursed';
  const el = guessElement(card);
  if (el && ELEMENT_SCENE[el]) return ELEMENT_SCENE[el]!;
  return TYPE_SCENE[cardType ?? 'skill'];
}

/** 文字列から 0..n-1（カードごとの変化） */
export function variantOf(id: string | undefined, n = VARIANTS): number {
  let h = 2166136261;
  for (const ch of id ?? '') {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % n;
}

export const VARIANTS = 3;

// ---------------------------------------------------------------- 描き方の道具（座標は 240×120）

const W = 240;
const H = 120;

/** 決まった種からの乱数（0..1） */
function rng(seed: number): () => number {
  let s = (seed * 2654435761 + 12345) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const f = (n: number) => (Math.round(n * 10) / 10).toString();

/** 上から下への空のグラデーション */
const sky = (id: string, stops: readonly string[]) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops.map((c, i) => `<stop offset="${f((i / (stops.length - 1)) * 100)}%" stop-color="${c}"/>`).join('')}</linearGradient>`;

/** 横に続く稜線（丘・山・森の地面）。base は下端の高さ、amp は揺れ、n は点の数 */
function ridge(r: () => number, base: number, amp: number, n: number, sharp = false): string {
  const pts: string[] = [`M0 ${H}`, `L0 ${f(base - r() * amp)}`];
  for (let i = 1; i <= n; i++) {
    const x = (W / n) * i;
    const y = base - r() * amp;
    if (sharp) pts.push(`L${f(x - W / n / 2)} ${f(base - amp - r() * amp * 0.6)}`, `L${f(x)} ${f(y)}`);
    else pts.push(`Q${f(x - W / n / 2)} ${f(base - amp * (0.4 + r()))} ${f(x)} ${f(y)}`);
  }
  pts.push(`L${W} ${H}`, 'Z');
  return pts.join(' ');
}

/** 星（小さな点） */
function stars(r: () => number, n: number, maxY: number, color = '#ffffff'): string {
  let s = '';
  for (let i = 0; i < n; i++) s += `<circle cx="${f(r() * W)}" cy="${f(r() * maxY)}" r="${f(0.4 + r() * 0.8)}" fill="${color}" opacity="${f(0.25 + r() * 0.5)}"/>`;
  return s;
}

/** 針葉樹の列 */
function pines(r: () => number, baseY: number, h: number, n: number, color: string): string {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = (W / n) * i + r() * (W / n) * 0.6;
    const th = h * (0.6 + r() * 0.6);
    const w = th * 0.38;
    s += `<path d="M${f(x)} ${f(baseY - th)} L${f(x + w)} ${f(baseY)} L${f(x - w)} ${f(baseY)} Z" fill="${color}"/>`;
  }
  return s;
}

/** 火の粉・泡などの丸 */
function dots(r: () => number, n: number, y0: number, y1: number, rr: number, color: string, op = 0.6): string {
  let s = '';
  for (let i = 0; i < n; i++) s += `<circle cx="${f(r() * W)}" cy="${f(y0 + r() * (y1 - y0))}" r="${f(rr * (0.4 + r()))}" fill="${color}" opacity="${f(op * (0.4 + r() * 0.6))}"/>`;
  return s;
}

/** 歯車（歯は太い破線の円） */
function gear(cx: number, cy: number, rad: number, color: string): string {
  const teeth = Math.max(8, Math.round(rad / 2.2));
  const dash = (2 * Math.PI * rad) / teeth / 2;
  return (
    `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rad)}" fill="none" stroke="${color}" stroke-width="${f(rad * 0.28)}" stroke-dasharray="${f(dash)} ${f(dash)}"/>` +
    `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rad * 0.82)}" fill="none" stroke="${color}" stroke-width="${f(rad * 0.22)}"/>` +
    `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rad * 0.22)}" fill="${color}"/>`
  );
}

/** 光の筋（上の1点から扇形） */
function rays(cx: number, cy: number, n: number, len: number, color: string, op: number): string {
  let s = '';
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI * (0.15 + (0.7 * i) / n);
    const a1 = a0 + (0.7 * Math.PI) / n / 2.2;
    s += `<path d="M${f(cx)} ${f(cy)} L${f(cx + Math.cos(a0) * len)} ${f(cy + Math.sin(a0) * len)} L${f(cx + Math.cos(a1) * len)} ${f(cy + Math.sin(a1) * len)} Z" fill="${color}" opacity="${f(op)}"/>`;
  }
  return s;
}

// ---------------------------------------------------------------- 場面

type Painter = (r: () => number, v: number) => { defs: string; body: string };

const PAINTERS: Record<SceneId, Painter> = {
  forest: (r, v) => ({
    defs: sky('s', ['#0d2a33', '#0a1d1c', '#050d0b']),
    body:
      `<rect width="${W}" height="${H}" fill="url(#s)"/>` +
      `<circle cx="${f(40 + v * 70)}" cy="22" r="11" fill="#d9f0e6" opacity="0.35"/>` +
      stars(r, 14, 50, '#cfeee2') +
      pines(r, 92, 46, 14, '#123329') +
      pines(r, 104, 40, 11, '#0c241d') +
      `<path d="${ridge(r, 112, 4, 6)}" fill="#06130f"/>`,
  }),
  volcano: (r, v) => ({
    defs: sky('s', ['#3a0e08', '#1f0806', '#0c0303']) + `<radialGradient id="g" cx="50%" cy="0%" r="60%"><stop offset="0%" stop-color="#ff7a2a" stop-opacity="0.75"/><stop offset="100%" stop-color="#ff7a2a" stop-opacity="0"/></radialGradient>`,
    body:
      `<rect width="${W}" height="${H}" fill="url(#s)"/>` +
      `<g transform="translate(${f((v - 1) * 30)} 0)"><ellipse cx="120" cy="40" rx="70" ry="40" fill="url(#g)"/>` +
      `<path d="M10 120 L95 44 L110 50 L120 42 L132 50 L146 44 L230 120 Z" fill="#1c0806"/>` +
      `<path d="M112 46 Q120 70 108 120 L132 120 Q122 72 128 46 Z" fill="#e2551d" opacity="0.55"/></g>` +
      `<path d="${ridge(r, 112, 8, 5, true)}" fill="#0e0403"/>` +
      dots(r, 16, 8, 90, 1.4, '#ffb066', 0.8),
  }),
  graveyard: (r, v) => ({
    defs: sky('s', ['#221a35', '#140f22', '#08060d']),
    body:
      `<rect width="${W}" height="${H}" fill="url(#s)"/>` +
      `<circle cx="${f(180 - v * 60)}" cy="26" r="15" fill="#e8e4ff" opacity="0.4"/>` +
      stars(r, 10, 45, '#e4e0ff') +
      `<path d="${ridge(r, 100, 6, 4)}" fill="#120e1c"/>` +
      Array.from({ length: 6 }, (_, i) => {
        const x = 14 + i * 40 + r() * 16;
        const h = 14 + r() * 10;
        return i % 2 === 0
          ? `<path d="M${f(x)} 108 L${f(x)} ${f(108 - h + 5)} Q${f(x + 6)} ${f(108 - h - 3)} ${f(x + 12)} ${f(108 - h + 5)} L${f(x + 12)} 108 Z" fill="#1d1729"/>`
          : `<path d="M${f(x + 4)} 108 L${f(x + 4)} ${f(108 - h)} M${f(x - 1)} ${f(108 - h + 5)} L${f(x + 9)} ${f(108 - h + 5)}" stroke="#1d1729" stroke-width="3.4"/>`;
      }).join('') +
      `<ellipse cx="80" cy="104" rx="90" ry="6" fill="#bdb3d9" opacity="0.12"/><ellipse cx="180" cy="110" rx="80" ry="5" fill="#bdb3d9" opacity="0.1"/>` +
      `<rect y="108" width="${W}" height="12" fill="#09070e"/>`,
  }),
  foundry: (r, v) => ({
    defs: sky('s', ['#16222f', '#0d151e', '#060a0f']),
    body:
      `<rect width="${W}" height="${H}" fill="url(#s)"/>` +
      Array.from({ length: 7 }, (_, i) => `<path d="M${i * 40} 0 V${H}" stroke="#2a3a4c" stroke-width="0.6" opacity="0.5"/>`).join('') +
      Array.from({ length: 4 }, (_, i) => `<path d="M0 ${i * 32 + 12} H${W}" stroke="#2a3a4c" stroke-width="0.6" opacity="0.5"/>`).join('') +
      gear(30 + v * 8, 30, 22, '#1e2c3b') +
      gear(212 - v * 6, 88, 28, '#1a2634') +
      gear(186, 24, 12, '#223244') +
      `<path d="M0 100 H90 V90 H150" fill="none" stroke="#24364a" stroke-width="5"/>` +
      dots(r, 8, 10, 100, 1.1, '#7fc2ff', 0.5),
  }),
  aurora: (r, v) => ({
    defs:
      sky('s', ['#0c1030', '#0a1428', '#050812']) +
      `<linearGradient id="a" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#3cf0c8" stop-opacity="0"/><stop offset="40%" stop-color="#3cf0c8" stop-opacity="0.45"/><stop offset="75%" stop-color="#b26cff" stop-opacity="0.4"/><stop offset="100%" stop-color="#b26cff" stop-opacity="0"/></linearGradient>`,
    body:
      `<rect width="${W}" height="${H}" fill="url(#s)"/>` +
      stars(r, 28, 110, '#e8f4ff') +
      `<path d="M0 ${f(42 + v * 6)} C60 ${f(10 + r() * 10)} 120 ${f(60 + r() * 10)} 240 ${f(24 + v * 4)} L240 ${f(42 + v * 4)} C140 ${f(76 + r() * 8)} 60 ${f(30 + r() * 8)} 0 ${f(60 + v * 6)} Z" fill="url(#a)"/>` +
      `<path d="M0 ${f(70 - v * 4)} C80 ${f(46 + r() * 8)} 160 ${f(90 - r() * 8)} 240 ${f(58 - v * 2)}" fill="none" stroke="#7af5da" stroke-width="2" opacity="0.25"/>` +
      dots(r, 6, 60, 110, 2.2, '#c9b6ff', 0.55),
  }),
  castle: (r, v) => ({
    defs: sky('s', ['#2b2546', '#5a3a4a', '#2a1c22']),
    body:
      `<rect width="${W}" height="${H}" fill="url(#s)"/>` +
      `<circle cx="${f(60 + v * 50)}" cy="78" r="18" fill="#ffcf8a" opacity="0.28"/>` +
      `<path d="${ridge(r, 100, 10, 4)}" fill="#22182a"/>` +
      `<g fill="#160f1c" transform="translate(${f(120 + (v - 1) * 40)} 0)">` +
      `<rect x="-34" y="62" width="68" height="40"/><rect x="-44" y="48" width="14" height="54"/><rect x="30" y="48" width="14" height="54"/>` +
      `<rect x="-8" y="38" width="16" height="30"/><path d="M-46 48 L-37 36 L-28 48 Z M28 48 L37 36 L46 48 Z M-10 38 L0 24 L10 38 Z"/>` +
      `<path d="M0 24 V14 L9 17 L0 20" stroke="#160f1c" stroke-width="1.2"/></g>` +
      `<rect y="104" width="${W}" height="16" fill="#120c16"/>`,
  }),
  glacier: (r, v) => ({
    defs: sky('s', ['#1b3a5c', '#10243c', '#071423']),
    body:
      `<rect width="${W}" height="${H}" fill="url(#s)"/>` +
      `<path d="${ridge(r, 96, 30, 5 + v, true)}" fill="#2f5476" opacity="0.8"/>` +
      `<path d="${ridge(r, 108, 18, 6, true)}" fill="#1a3651"/>` +
      `<path d="M0 112 H240 V120 H0 Z" fill="#0f2236"/>` +
      dots(r, 26, 4, 116, 1.1, '#e6f4ff', 0.7),
  }),
  flame: (r, v) => ({
    defs: sky('s', ['#1a0705', '#2a0b05', '#3e1306']),
    body:
      `<rect width="${W}" height="${H}" fill="url(#s)"/>` +
      Array.from({ length: 7 }, (_, i) => {
        const x = i * 36 + r() * 20 - 10 + v * 4;
        const h = 50 + r() * 50;
        return `<path d="M${f(x - 16)} 120 Q${f(x - 12)} ${f(120 - h * 0.6)} ${f(x)} ${f(120 - h)} Q${f(x + 8)} ${f(120 - h * 0.5)} ${f(x + 16)} 120 Z" fill="${i % 2 ? '#c2410c' : '#9a1f0b'}" opacity="0.45"/>`;
      }).join('') +
      dots(r, 18, 6, 100, 1.3, '#ffb36b', 0.85),
  }),
  swamp: (r, v) => ({
    defs: sky('s', ['#16251a', '#0f1a12', '#070d08']),
    body:
      `<rect width="${W}" height="${H}" fill="url(#s)"/>` +
      `<ellipse cx="120" cy="34" rx="130" ry="18" fill="#9de06a" opacity="0.06"/>` +
      `<g stroke="#0b140c" stroke-width="3" fill="none" stroke-linecap="round">` +
      `<path d="M${f(30 + v * 10)} 104 V54 L${f(18 + v * 10)} 40 M${f(30 + v * 10)} 70 L${f(44 + v * 10)} 58"/>` +
      `<path d="M${f(200 - v * 12)} 104 V60 L${f(212 - v * 12)} 46 M${f(200 - v * 12)} 80 L${f(188 - v * 12)} 70"/></g>` +
      `<path d="M0 100 Q60 94 120 100 T240 98 V120 H0 Z" fill="#183a1c" opacity="0.9"/>` +
      dots(r, 12, 92, 116, 2, '#7ee05a', 0.5),
  }),
  bloodmoon: (r, v) => ({
    defs: sky('s', ['#2a0610', '#16040a', '#080205']),
    body:
      `<rect width="${W}" height="${H}" fill="url(#s)"/>` +
      `<circle cx="${f(70 + v * 50)}" cy="34" r="20" fill="#c81e3c" opacity="0.5"/><circle cx="${f(70 + v * 50)}" cy="34" r="28" fill="#c81e3c" opacity="0.12"/>` +
      `<path d="${ridge(r, 102, 16, 6, true)}" fill="#1a050a"/>` +
      `<path d="${ridge(r, 112, 6, 5)}" fill="#0d0205"/>`,
  }),
  temple: (r, v) => ({
    defs: sky('s', ['#3a2f12', '#241c0c', '#100c06']),
    body:
      `<rect width="${W}" height="${H}" fill="url(#s)"/>` +
      rays(120 + (v - 1) * 20, -6, 9, 150, '#ffe9a6', 0.09) +
      Array.from({ length: 4 }, (_, i) => {
        const x = 26 + i * 60 + (i > 1 ? 12 : -12);
        return `<rect x="${f(x)}" y="44" width="12" height="62" fill="#1d170b"/><rect x="${f(x - 3)}" y="40" width="18" height="5" fill="#1d170b"/>`;
      }).join('') +
      `<rect y="104" width="${W}" height="16" fill="#140f07"/>` +
      dots(r, 10, 10, 90, 1, '#fff2c4', 0.6),
  }),
  abyss: (r, v) => ({
    defs: `<radialGradient id="s" cx="50%" cy="55%" r="75%"><stop offset="0%" stop-color="#2a0f3d"/><stop offset="60%" stop-color="#12061c"/><stop offset="100%" stop-color="#05020a"/></radialGradient>`,
    body:
      `<rect width="${W}" height="${H}" fill="url(#s)"/>` +
      Array.from({ length: 5 }, (_, i) => `<ellipse cx="120" cy="${f(64 + v * 2)}" rx="${f(30 + i * 22)}" ry="${f(12 + i * 9)}" fill="none" stroke="#8b4dff" stroke-width="0.8" opacity="${f(0.28 - i * 0.04)}"/>`).join('') +
      dots(r, 10, 10, 110, 1.2, '#b18cff', 0.5),
  }),
  starfield: (r, v) => ({
    defs: sky('s', ['#130f33', '#0b0b24', '#05050f']),
    body:
      `<rect width="${W}" height="${H}" fill="url(#s)"/>` +
      `<ellipse cx="${f(60 + v * 60)}" cy="${f(40 + v * 10)}" rx="70" ry="22" fill="#6f5bff" opacity="0.12" transform="rotate(-14 120 60)"/>` +
      stars(r, 42, 120, '#eef0ff') +
      `<circle cx="120" cy="60" r="50" fill="none" stroke="#9aa6ff" stroke-width="0.6" stroke-dasharray="2 5" opacity="0.35"/>`,
  }),
  plains: (r, v) => ({
    defs: sky('s', ['#22314a', '#2d3346', '#1c1f28']),
    body:
      `<rect width="${W}" height="${H}" fill="url(#s)"/>` +
      `<path d="${ridge(r, 84, 18, 4, true)}" fill="#252c3c" opacity="0.9"/>` +
      `<path d="${ridge(r, 98, 10, 4)}" fill="#1c2b25"/>` +
      `<path d="${ridge(r, 110, 6, 5)}" fill="#121c17"/>` +
      `<ellipse cx="${f(60 + v * 50)}" cy="24" rx="34" ry="5" fill="#c8d4ea" opacity="0.08"/>`,
  }),
  dusk: (r, v) => ({
    defs: sky('s', ['#2c1630', '#6a2c22', '#2a1210']),
    body:
      `<rect width="${W}" height="${H}" fill="url(#s)"/>` +
      `<circle cx="${f(60 + v * 60)}" cy="88" r="20" fill="#ff8a3c" opacity="0.35"/>` +
      `<path d="${ridge(r, 96, 14, 5, true)}" fill="#2a1414"/>` +
      `<path d="${ridge(r, 110, 6, 4)}" fill="#140909"/>`,
  }),
  meadow: (r, v) => ({
    defs: sky('s', ['#173040', '#14302c', '#0b1a16']),
    body:
      `<rect width="${W}" height="${H}" fill="url(#s)"/>` +
      `<ellipse cx="${f(50 + v * 60)}" cy="26" rx="30" ry="6" fill="#d6f0ea" opacity="0.1"/><ellipse cx="${f(170 - v * 40)}" cy="18" rx="22" ry="4" fill="#d6f0ea" opacity="0.08"/>` +
      `<path d="${ridge(r, 96, 10, 3)}" fill="#1b3a30"/>` +
      `<path d="${ridge(r, 108, 6, 4)}" fill="#122a22"/>` +
      dots(r, 10, 100, 116, 1, '#bff0c8', 0.45),
  }),
  cursed: (r, v) => ({
    defs: `<radialGradient id="s" cx="50%" cy="50%" r="75%"><stop offset="0%" stop-color="#3a0a1c"/><stop offset="70%" stop-color="#16040b"/><stop offset="100%" stop-color="#070104"/></radialGradient>`,
    body:
      `<rect width="${W}" height="${H}" fill="url(#s)"/>` +
      `<circle cx="120" cy="60" r="52" fill="none" stroke="#ff4d7d" stroke-width="0.8" opacity="0.28"/><circle cx="120" cy="60" r="44" fill="none" stroke="#ff4d7d" stroke-width="0.6" stroke-dasharray="3 4" opacity="0.25"/>` +
      `<path d="M120 8 L165 86 L75 86 Z M120 112 L75 34 L165 34 Z" fill="none" stroke="#ff4d7d" stroke-width="0.6" opacity="0.18" transform="rotate(${v * 12} 120 60)"/>` +
      `<g stroke="#2a0612" stroke-width="2.4" fill="none"><path d="M0 110 Q40 90 70 112 T150 104 T240 112"/><path d="M0 20 Q30 34 60 14"/><path d="M180 6 Q210 26 240 12"/></g>` +
      dots(r, 8, 8, 112, 1.1, '#ff7aa0', 0.5),
  }),
};

/** 場面の SVG（文字列。決まった入力なら毎回同じ） */
export function sceneSvg(scene: SceneId, variant: number): string {
  const v = ((variant % VARIANTS) + VARIANTS) % VARIANTS;
  const { defs, body } = PAINTERS[scene](rng(SCENE_IDS.indexOf(scene) * 31 + v * 7 + 1), v);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${body}</svg>`;
}

const cache = new Map<string, string>();

/** CSS の背景の値（data URI。場面と変化ごとに使い回す） */
export function sceneBackground(scene: SceneId, variant: number): string {
  const key = `${scene}:${variant}`;
  let v = cache.get(key);
  if (!v) {
    v = `url("data:image/svg+xml,${encodeURIComponent(sceneSvg(scene, variant))}") center / cover no-repeat`;
    cache.set(key, v);
  }
  return v;
}

/** 絵の窓に付ける style（--art-scene） */
export function sceneStyle(card: Pick<CardDef, 'id' | 'tribe' | 'icon' | 'name'> | undefined, cardType: CardType | undefined, curse = false): CSSProperties {
  return { '--art-scene': sceneBackground(sceneOf(card, cardType, curse), variantOf(card?.id)) } as CSSProperties;
}
