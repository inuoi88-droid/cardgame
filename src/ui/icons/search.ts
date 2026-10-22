/**
 * アイコン選択パネルの検索とおすすめ（決定事項 #105）。純粋関数（テスト：tests/icons.test.ts）。
 *
 * - 検索は英単語（アイコン名をハイフンで分けたもの）と、日本語の辞書（英単語 → 日本語の語。scripts/icons/ja-*.json）の両方を見る。
 *   ひらがな・カタカナ、全角・半角、大文字・小文字の違いはならす。空白で区切ると「どれも含む」。
 * - おすすめはカードの名前（辞書を逆に引く）・種族・種類・おもな効果から。
 */
import { categoryOf, type IconCategory } from './categories.ts';

/** 検索用：NFKC・小文字・カタカナ → ひらがな */
export function fold(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .trim();
}

/**
 * 辞書が無いとき（や足りないとき）の最低限の日本語。辞書があれば両方を使う。
 * カード名によく出る語だけ（おすすめと「竜」などの検索のため）
 */
export const BUILTIN_JA: Readonly<Record<string, string>> = {
  dragon: '竜 龍 ドラゴン',
  wolf: '狼 オオカミ ウルフ',
  fire: '火 炎 ほのお ファイア',
  flame: '炎 火炎',
  fireball: '火の玉 火球',
  ice: '氷 こおり アイス',
  frost: '霜 凍',
  lightning: '雷 稲妻 いかずち',
  thunder: '雷 いかずち',
  poison: '毒 どく',
  skull: '骸骨 髑髏 どくろ ドクロ',
  skeleton: '骸骨 スケルトン',
  ghost: '幽霊 亡霊 ゴースト',
  zombie: 'ゾンビ 屍',
  sword: '剣 つるぎ ソード',
  dagger: '短剣 ナイフ 刃',
  blade: '刃 やいば',
  axe: '斧 おの',
  bow: '弓 ゆみ',
  arrow: '矢 や',
  spear: '槍 やり',
  shield: '盾 たて シールド',
  helmet: '兜 かぶと',
  armor: '鎧 よろい',
  potion: '薬 ポーション',
  heart: '心臓 ハート 心',
  book: '本 書 魔導書',
  scroll: '巻物 書',
  crown: '王冠 冠 王',
  king: '王 キング',
  queen: '女王 クイーン',
  knight: '騎士 ナイト',
  wizard: '魔術師 魔法使い',
  witch: '魔女',
  demon: '悪魔 デーモン',
  devil: '悪魔',
  angel: '天使',
  snake: '蛇 へび',
  rat: '鼠 ネズミ',
  bat: '蝙蝠 コウモリ',
  spider: '蜘蛛 クモ',
  lion: '獅子 ライオン',
  bear: '熊 クマ',
  boar: '猪 イノシシ',
  eagle: '鷲 ワシ',
  hawk: '鷹 タカ',
  bird: '鳥 とり',
  fish: '魚 さかな',
  tree: '木 樹',
  leaf: '葉 は',
  flower: '花 はな',
  sun: '太陽 日 光',
  moon: '月 つき',
  star: '星 ほし',
  water: '水 みず',
  wave: '波 なみ',
  wind: '風 かぜ',
  rock: '岩 いわ 石',
  stone: '石 いし 岩',
  golem: 'ゴーレム 巨人',
  giant: '巨人',
  robot: 'ロボット 機械',
  gear: '歯車 ギア',
  cog: '歯車',
  clock: '時計 時',
  hourglass: '砂時計 時',
  chain: '鎖 くさり',
  key: '鍵 かぎ',
  coin: '硬貨 コイン 金',
  gem: '宝石',
  castle: '城 しろ',
  tower: '塔 とう',
  wall: '壁 城壁',
  blood: '血 ち',
  bleeding: '血 出血',
  eye: '目 眼',
  hand: '手 て',
  magic: '魔法 まほう',
  spell: '呪文 魔法',
  aura: 'オーラ 気',
  portal: '門 ゲート',
  coffin: '棺 ひつぎ',
  grave: '墓 はか',
  cauldron: '釜 大釜',
  egg: '卵 たまご',
  imp: '小鬼',
  goblin: 'ゴブリン 小鬼',
  troll: 'トロール',
  ogre: '鬼 オーガ',
  horse: '馬 うま',
  cat: '猫 ねこ',
  dog: '犬 いぬ',
  fox: '狐 きつね',
  hammer: '槌 ハンマー',
  cannon: '大砲',
  bomb: '爆弾',
  explosion: '爆発',
  prayer: '祈り',
  holy: '聖 神聖',
  cross: '十字',
  fountain: '泉 噴水',
  swamp: '沼 沼地',
  mountain: '山 やま',
  volcano: '火山',
  cloud: '雲 くも',
  storm: '嵐 あらし',
  tornado: '竜巻',
  mask: '仮面 覆面',
  hood: 'フード 覆面',
  assassin: '暗殺者 刺客',
  ninja: '忍者',
  samurai: '侍',
  pirate: '海賊',
  ship: '船 ふね',
};

export interface IconSearchIndex {
  names: readonly string[];
  /** 各アイコンの英単語 */
  tokens: readonly (readonly string[])[];
  /** 各アイコンの検索語（英単語と、その日本語。fold 済み） */
  words: readonly (readonly string[])[];
  /** 各アイコンの主な語（英単語と、各単語の最初の訳語。fold 済み）。ここに完全一致すると順位が上がる */
  primary: readonly (readonly string[])[];
  categories: readonly IconCategory[];
  /** 日本語の語（fold 済み） → 英単語（カード名からのおすすめ用） */
  jaToTokens: ReadonlyMap<string, readonly string[]>;
  /** 英単語 → 日本語の語（表示用。最初の語を見出しに使う） */
  ja: ReadonlyMap<string, readonly string[]>;
  nameSet: ReadonlySet<string>;
}

export function buildSearchIndex(names: readonly string[], dictionary: Readonly<Record<string, string>>): IconSearchIndex {
  const ja = new Map<string, string[]>();
  const add = (token: string, text: string) => {
    const list = ja.get(token) ?? [];
    for (const w of text.split(/\s+/)) if (w && !list.includes(w)) list.push(w);
    ja.set(token, list);
  };
  for (const [t, text] of Object.entries(dictionary)) add(t, text);
  for (const [t, text] of Object.entries(BUILTIN_JA)) add(t, text);
  const jaToTokens = new Map<string, string[]>();
  for (const [t, list] of ja) {
    for (const w of list) {
      const k = fold(w);
      if (!k) continue;
      const ts = jaToTokens.get(k) ?? [];
      if (!ts.includes(t)) ts.push(t);
      jaToTokens.set(k, ts);
    }
  }
  const tokens = names.map((n) => n.split('-'));
  const words = tokens.map((ts) => {
    const out = new Set<string>(ts);
    for (const t of ts) for (const w of ja.get(t) ?? []) out.add(fold(w));
    return [...out];
  });
  const primary = tokens.map((ts) => [...ts, ...ts.map((t) => fold(ja.get(t)?.[0] ?? '')).filter(Boolean)]);
  return { names, tokens, words, primary, categories: names.map(categoryOf), jaToTokens, ja, nameSet: new Set(names) };
}

/** 表示用の日本語の名前（辞書にある単語の最初の語をつなぐ。無ければ英語） */
export function displayName(si: IconSearchIndex, name: string): string {
  const parts = name.split('-').map((t) => si.ja.get(t)?.[0]);
  return parts.some(Boolean) ? parts.filter(Boolean).join('・') : name.replace(/-/g, ' ');
}

/** 1語の当たり方（0 は当たらない）。主な語に完全一致 4・完全一致 3・前方一致 2・部分一致 1 */
function termScore(words: readonly string[], primary: readonly string[], term: string): number {
  if (primary.includes(term)) return 4;
  let best = 0;
  for (const w of words) {
    if (w === term) return 3;
    if (best < 2 && w.startsWith(term)) best = 2;
    else if (best < 1 && w.includes(term)) best = 1;
  }
  return best;
}

/**
 * 検索。query を空白で区切ったすべての語に当たるアイコンを、当たりの強い順（同じなら名前の短い順・名前順）に返す。
 * category を渡すとその分類だけ。query が空なら（分類の中の）全部を名前順で
 */
export function searchIcons(si: IconSearchIndex, query: string, category?: IconCategory | null): string[] {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  const out: { name: string; score: number }[] = [];
  for (let i = 0; i < si.names.length; i++) {
    if (category && si.categories[i] !== category) continue;
    let score = 0;
    let ok = true;
    for (const t of terms) {
      const s = termScore(si.words[i]!, si.primary[i]!, t);
      if (s === 0) {
        ok = false;
        break;
      }
      score += s;
    }
    if (ok) out.push({ name: si.names[i]!, score });
  }
  if (terms.length === 0) return out.map((x) => x.name);
  // 同じ当たりなら、単語の少ない名前（"dragon-head" より "dragon"）、短い名前、名前順
  const parts = (n: string) => n.split('-').length;
  out.sort((a, b) => b.score - a.score || parts(a.name) - parts(b.name) || a.name.length - b.name.length || (a.name < b.name ? -1 : 1));
  return out.map((x) => x.name);
}

// ---------------------------------------------------------------- おすすめ

/** 種族ごとのおすすめ（アイコン名） */
export const TRIBE_ICONS: Readonly<Record<string, readonly string[]>> = {
  beast: ['wolf-head', 'lion', 'bear-head', 'boar', 'direwolf', 'bestial-fangs'],
  dragon: ['dragon-head', 'spiked-dragon-head', 'dragon-breath', 'sea-dragon', 'double-dragon', 'dragon-spiral'],
  undead: ['skull-crossed-bones', 'raise-skeleton', 'shambling-zombie', 'ghost', 'coffin', 'vampire-dracula'],
  machine: ['robot-golem', 'vintage-robot', 'gears', 'clockwork', 'battle-mech', 'cog'],
  spirit: ['spark-spirit', 'floating-ghost', 'fairy', 'angel-wings', 'aura', 'magic-swirl'],
  human: ['mounted-knight', 'wizard-face', 'swordman', 'bowman', 'hooded-assassin', 'crowned-skull'],
};

/** 種類ごとのおすすめ */
export const TYPE_ICONS: Readonly<Record<string, readonly string[]>> = {
  attack: ['crossed-swords', 'sword-clash', 'fireball', 'lightning-bow', 'axe-swing', 'sword-wound'],
  skill: ['spell-book', 'magic-swirl', 'health-potion', 'round-shield', 'card-draw', 'crystal-ball'],
  power: ['aura', 'magic-portal', 'rune-stone', 'pentagram-rose', 'beams-aura', 'crystal-shrine'],
  powerAttack: ['swords-power', 'lightning-storm', 'fire-ring', 'aura', 'burning-meteor', 'magic-swirl'],
  monster: ['dragon-head', 'wolf-head', 'goblin-head', 'rock-golem', 'troll', 'griffin-symbol'],
  curse: ['cursed-star', 'evil-book', 'death-skull', 'imprisoned', 'poison-cloud', 'devil-mask'],
};

/** 効果ごとのおすすめ（おもな効果＝最初の数個） */
export const EFFECT_ICONS: Readonly<Record<string, readonly string[]>> = {
  damage: ['fireball', 'sword-wound', 'bolt-spell-cast'],
  multiHit: ['thrown-daggers', 'arrow-flights', 'sword-array'],
  poison: ['poison-bottle', 'poison-cloud', 'snake-bite'],
  burn: ['burning-embers', 'flame', 'fire-wave'],
  bleed: ['bleeding-wound', 'blood', 'dripping-sword'],
  heal: ['health-potion', 'healing', 'heart-plus'],
  regen: ['heart-plus', 'sprout', 'healing'],
  shield: ['round-shield', 'magic-shield', 'energy-shield'],
  draw: ['card-draw', 'spell-book', 'card-pickup'],
  strength: ['biceps', 'muscle-up', 'mighty-force'],
  energy: ['lightning-helix', 'battery-pack', 'power-lightning'],
  freeze: ['ice-bolt', 'frozen-orb', 'snowflake-1'],
  token: ['imp', 'goblin-head', 'egg-clutch'],
  summon: ['magic-portal', 'pentagram-rose', 'imp'],
  wipe: ['mushroom-cloud', 'tornado', 'explosion-rays'],
  execute: ['executioner-hood', 'guillotine', 'death-skull'],
  slay: ['sword-wound', 'death-skull', 'targeted'],
  steal: ['robber-mask', 'swap-bag', 'grab'],
  search: ['magnifying-glass', 'spyglass', 'treasure-map'],
  revive: ['raise-skeleton', 'raise-zombie', 'angel-wings'],
  seal: ['padlock', 'cage', 'imprisoned'],
  doom: ['hourglass', 'death-skull', 'cursed-star'],
  equip: ['sword-in-stone', 'swords-emblem', 'chest-armor'],
  crown: ['crown', 'jewel-crown', 'crowned-heart'],
  noise: ['static', 'static-waves', 'card-random'],
  mill: ['card-discard', 'card-burn', 'burning-book'],
  ramp: ['crystal-growth', 'battery-plus', 'growth'],
  weaken: ['broken-shield', 'weight-crush', 'despair'],
  vulnerable: ['cracked-shield', 'target-dummy', 'broken-shield'],
  counter: ['shield-reflect', 'return-arrow', 'shield-bounces'],
  extraTurn: ['hourglass', 'time-trap', 'clockwork'],
  discover: ['crystal-ball', 'treasure-map', 'open-treasure-chest'],
  fight: ['sword-clash', 'crossed-swords', 'fist'],
  bounce: ['return-arrow', 'boomerang', 'card-exchange'],
};

/** 名前から引く語として使える長さか（ひらがなの1文字は除く。漢字は1文字でもよい） */
function usableWord(w: string): boolean {
  return w.length >= 2 || /\p{Script=Han}/u.test(w);
}

export interface SuggestInput {
  name: string;
  tribe?: string;
  cardType?: string;
  curse?: boolean;
  effectIds?: readonly string[];
}

/** 名前の中に出てくる辞書の語（長い語から）に当たる英単語 */
export function tokensFromName(si: IconSearchIndex, name: string): string[] {
  const text = fold(name);
  if (!text) return [];
  const found: { word: string; at: number; tokens: readonly string[] }[] = [];
  for (const [word, tokens] of si.jaToTokens) {
    if (!usableWord(word)) continue;
    const at = text.indexOf(word);
    if (at >= 0) found.push({ word, at, tokens });
  }
  // 英字の名前（"Dragon" など）はそのまま英単語として
  for (const w of text.split(/[^a-z0-9]+/)) if (w.length >= 3) found.push({ word: w, at: text.indexOf(w), tokens: [w] });
  // 後ろにある語ほど名前の主役（「毒の刃」なら刃）。同じ位置なら長い語から
  found.sort((a, b) => b.at + b.word.length - (a.at + a.word.length) || b.word.length - a.word.length);
  const out: string[] = [];
  for (const f of found) for (const t of f.tokens) if (!out.includes(t)) out.push(t);
  return out;
}

/** 英単語を含むアイコン（その単語だけの名前・「〜-head」を先に） */
function iconsForToken(si: IconSearchIndex, token: string, max: number): string[] {
  const hits: string[] = [];
  for (let i = 0; i < si.names.length; i++) if (si.tokens[i]!.includes(token)) hits.push(si.names[i]!);
  const rank = (n: string) => (n === token ? 0 : n === `${token}-head` ? 1 : n.startsWith(`${token}-`) || n.endsWith(`-${token}`) ? 2 : 3);
  hits.sort((a, b) => rank(a) - rank(b) || a.length - b.length || (a < b ? -1 : 1));
  return hits.slice(0, max);
}

/** カードに合いそうなアイコン（名前 → 種族 → 効果 → 種類の順。重複なし・あるものだけ） */
export function suggestIcons(si: IconSearchIndex, input: SuggestInput, limit = 18): string[] {
  const out: string[] = [];
  const push = (n: string) => {
    if (out.length < limit && si.nameSet.has(n) && !out.includes(n)) out.push(n);
  };
  const fromName = tokensFromName(si, input.name);
  fromName.slice(0, 4).forEach((t, i) => iconsForToken(si, t, i === 0 ? 6 : 3).forEach(push));
  if (input.tribe) (TRIBE_ICONS[input.tribe] ?? []).slice(0, 4).forEach(push);
  for (const id of (input.effectIds ?? []).slice(0, 3)) (EFFECT_ICONS[id] ?? []).forEach(push);
  (TYPE_ICONS[input.curse ? 'curse' : (input.cardType ?? '')] ?? []).forEach(push);
  return out;
}
