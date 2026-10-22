/**
 * アイコン選択パネルの検索とおすすめ（決定事項 #105）。純粋関数（テスト：tests/icons.test.ts）。
 *
 * - 検索は英単語（アイコン名をハイフンで分けたもの）と、日本語の辞書（英単語 → 日本語の語。scripts/icons/ja.json）の両方を見る。
 *   ひらがな・カタカナ、全角・半角、大文字・小文字の違いはならす。空白で区切ると「どれも含む」。
 *   1つも当たらなければ、辞書の語に切り分けて（「炎の剣」→ 炎・剣）当たった語の多い順に「近いもの」を出す（smartSearch）。
 * - おすすめはカードの名前（辞書の語に切り分け、後ろの語から順に1つずつ）・種族・種類・おもな効果から。
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

export interface IconSearchIndex {
  names: readonly string[];
  /** 各アイコンの英単語 */
  tokens: readonly (readonly string[])[];
  /** 各アイコンの「主役」の単語の位置（ふつうは最後。"dragon-head" のような -head・-face などは1つ前） */
  heads: readonly number[];
  categories: readonly IconCategory[];
  /** 英単語 → 日本語の語（fold 済み。最初が主な訳語） */
  jaFold: ReadonlyMap<string, readonly string[]>;
  /** 日本語の語（fold 済み） → 英単語（その語が訳語の前にある単語・よく使われる単語の順） */
  jaToTokens: ReadonlyMap<string, readonly string[]>;
  /** 英単語 → 日本語の語（表示用。最初の語を見出しに使う） */
  ja: ReadonlyMap<string, readonly string[]>;
  /** 英単語 → それを含むアイコンの数 */
  tokenCount: ReadonlyMap<string, number>;
  nameSet: ReadonlySet<string>;
}

/** 名前の最後にあっても主役にならない単語（"wolf-head" の主役は wolf） */
const MINOR_TAIL = new Set(['head', 'heads', 'face', 'profile', 'silhouette', 'emblem', 'symbol', 'icon', 'outline', 'print', 'mask']);

export function buildSearchIndex(names: readonly string[], dictionary: Readonly<Record<string, string>>): IconSearchIndex {
  const ja = new Map<string, string[]>();
  for (const [t, text] of Object.entries(dictionary)) {
    const list = [...new Set(text.split(/\s+/).filter(Boolean))];
    if (list.length > 0) ja.set(t, list);
  }
  const jaFold = new Map<string, string[]>();
  for (const [t, list] of ja) jaFold.set(t, [...new Set(list.map(fold).filter(Boolean))]);
  const tokens = names.map((n) => n.split('-'));
  const tokenCount = new Map<string, number>();
  for (const ts of tokens) for (const t of new Set(ts)) tokenCount.set(t, (tokenCount.get(t) ?? 0) + 1);
  const heads = tokens.map((ts) => (ts.length > 1 && MINOR_TAIL.has(ts[ts.length - 1]!) ? ts.length - 2 : ts.length - 1));
  const ranked = new Map<string, { t: string; rank: number }[]>();
  for (const [t, list] of jaFold) {
    list.forEach((w, rank) => {
      const xs = ranked.get(w) ?? [];
      xs.push({ t, rank });
      ranked.set(w, xs);
    });
  }
  const jaToTokens = new Map<string, string[]>();
  for (const [w, xs] of ranked) {
    xs.sort((a, b) => a.rank - b.rank || (tokenCount.get(b.t) ?? 0) - (tokenCount.get(a.t) ?? 0) || (a.t < b.t ? -1 : 1));
    jaToTokens.set(w, xs.map((x) => x.t));
  }
  return { names, tokens, heads, categories: names.map(categoryOf), jaFold, jaToTokens, ja, tokenCount, nameSet: new Set(names) };
}

/** 表示用の日本語の名前（辞書にある単語の最初の語をつなぐ。無ければ英語） */
export function displayName(si: IconSearchIndex, name: string): string {
  const parts = name.split('-').map((t) => si.ja.get(t)?.[0]);
  return parts.some(Boolean) ? parts.filter(Boolean).join('・') : name.replace(/-/g, ' ');
}

/**
 * 1語の当たり方（0 は当たらない）。英単語か主な訳語に完全一致 4・ほかの訳語に完全一致 3・前方一致 2・部分一致 1。
 * 完全一致が名前の主役の単語なら +1（「剣」なら "sword-tie" より "rune-sword"）
 */
function termScore(si: IconSearchIndex, i: number, term: string): number {
  const ts = si.tokens[i]!;
  let best = 0;
  for (let k = 0; k < ts.length; k++) {
    const t = ts[k]!;
    const ws = si.jaFold.get(t) ?? [];
    let s = 0;
    if (t === term || ws[0] === term) s = 4;
    else if (ws.includes(term)) s = 3;
    else if (t.startsWith(term) || ws.some((w) => w.startsWith(term))) s = 2;
    else if (t.includes(term) || ws.some((w) => w.includes(term))) s = 1;
    if (s >= 3 && k === si.heads[i]) s += 1;
    if (s > best) best = s;
  }
  return best;
}

/** 同じ当たりなら、単語の少ない名前（"dragon-head" より "dragon"）、短い名前、名前順 */
function tieBreak(a: string, b: string): number {
  return a.split('-').length - b.split('-').length || a.length - b.length || (a < b ? -1 : 1);
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
      const s = termScore(si, i, t);
      if (s === 0) {
        ok = false;
        break;
      }
      score += s;
    }
    if (ok) out.push({ name: si.names[i]!, score });
  }
  if (terms.length === 0) return out.map((x) => x.name);
  out.sort((a, b) => b.score - a.score || tieBreak(a.name, b.name));
  return out.map((x) => x.name);
}

/** 文の中に出てくる辞書の語。もっと長い語の中にある語（「とかげ」の中の「かげ」）は外す。並びは文の中の順 */
export interface Segment {
  word: string;
  at: number;
  end: number;
  /** 当たる英単語（主な訳語の単語・よく使われる単語の順） */
  tokens: readonly string[];
}

export function segmentWords(si: IconSearchIndex, text: string): Segment[] {
  const t = fold(text);
  if (!t) return [];
  const found: Segment[] = [];
  for (const [word, tokens] of si.jaToTokens) {
    if (!usableWord(word)) continue;
    for (let at = t.indexOf(word); at >= 0; at = t.indexOf(word, at + 1)) found.push({ word, at, end: at + word.length, tokens });
  }
  // 英字の語（"Dragon" など）はそのまま英単語として
  for (const m of t.matchAll(/[a-z0-9]+/g)) {
    const w = m[0];
    if (w.length >= 3 && !found.some((f) => f.word === w && f.at === m.index)) found.push({ word: w, at: m.index, end: m.index + w.length, tokens: si.tokenCount.has(w) ? [w] : [] });
  }
  const kept = found.filter((f) => f.tokens.length > 0 && !found.some((g) => g !== f && g.tokens.length > 0 && g.at <= f.at && g.end >= f.end && g.end - g.at > f.end - f.at));
  kept.sort((a, b) => a.at - b.at || b.end - a.end);
  // 同じ語が2回出ても1つに
  return kept.filter((f, i) => kept.findIndex((g) => g.word === f.word) === i);
}

export interface SmartResult {
  names: string[];
  /** 「近いもの」を出したときの、当たった語（そのまま全部に当たるものが無かったとき）。ふつうの検索なら null */
  near: string[] | null;
}

/**
 * ふつうの検索（searchIcons）で1つも無ければ、語に切り分けて「どれかに当たる」ものを、当たった語の多い順に出す。
 * 「炎の剣」「氷の竜」「剣 炎」のような言い方でも空にしない
 */
export function smartSearch(si: IconSearchIndex, query: string, category?: IconCategory | null): SmartResult {
  const names = searchIcons(si, query, category);
  if (names.length > 0 || fold(query) === '') return { names, near: null };
  const words: string[] = [];
  for (const term of fold(query).split(/\s+/).filter(Boolean)) {
    const segs = segmentWords(si, term);
    for (const w of segs.length > 0 ? segs.map((x) => x.word) : []) if (!words.includes(w)) words.push(w);
  }
  if (words.length === 0) return { names: [], near: null };
  const out: { name: string; hit: number; score: number }[] = [];
  for (let i = 0; i < si.names.length; i++) {
    if (category && si.categories[i] !== category) continue;
    let hit = 0;
    let score = 0;
    for (const w of words) {
      const s = termScore(si, i, w);
      if (s > 0) {
        hit++;
        score += s;
      }
    }
    if (hit > 0) out.push({ name: si.names[i]!, hit, score });
  }
  out.sort((a, b) => b.hit - a.hit || b.score - a.score || tieBreak(a.name, b.name));
  return { names: out.map((x) => x.name), near: words };
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

/** 数字だけの単語（"rank-1" の 1 など）はおすすめに使わない */
const NUMERIC = /^\d+$/;

/** 名前の語ごとの英単語（後ろの語ほど名前の主役なので先。1語につき主な単語 2つまで） */
function nameWordTokens(si: IconSearchIndex, name: string): string[][] {
  return segmentWords(si, name)
    .sort((a, b) => b.end - a.end || b.end - b.at - (a.end - a.at))
    .map((seg) => seg.tokens.filter((t) => !NUMERIC.test(t)).slice(0, 2))
    .filter((ts) => ts.length > 0);
}

/** 名前の中に出てくる辞書の語に当たる英単語（後ろの語から。1語につき2つまで） */
export function tokensFromName(si: IconSearchIndex, name: string): string[] {
  const out: string[] = [];
  for (const ts of nameWordTokens(si, name)) for (const t of ts) if (!out.includes(t)) out.push(t);
  return out;
}

/** 英単語を含むアイコン（その単語だけの名前・「〜-head」・その単語が主役の名前を先に） */
function iconsForToken(si: IconSearchIndex, token: string, max: number): string[] {
  const hits: { n: string; rank: number }[] = [];
  for (let i = 0; i < si.names.length; i++) {
    const ts = si.tokens[i]!;
    const k = ts.indexOf(token);
    if (k < 0) continue;
    const n = si.names[i]!;
    hits.push({ n, rank: n === token ? 0 : n === `${token}-head` ? 1 : k === si.heads[i] ? 2 : 3 });
  }
  hits.sort((a, b) => a.rank - b.rank || tieBreak(a.n, b.n));
  return hits.slice(0, max).map((h) => h.n);
}

/** カードに合いそうなアイコン（名前 → 種族 → 効果 → 種類の順。重複なし・あるものだけ） */
export function suggestIcons(si: IconSearchIndex, input: SuggestInput, limit = 18): string[] {
  const out: string[] = [];
  const push = (n: string) => {
    if (out.length < limit && si.nameSet.has(n) && !out.includes(n)) out.push(n);
  };
  // 名前：語ごとの候補を、後ろの語から1つずつ順番に（どの語の絵も入るように）
  const lists = nameWordTokens(si, input.name)
    .slice(0, 4)
    .map((ts) => {
      const per = ts.map((t) => iconsForToken(si, t, 6));
      const merged: string[] = [];
      for (let k = 0; k < 6; k++) for (const xs of per) if (xs[k] && !merged.includes(xs[k]!)) merged.push(xs[k]!);
      return merged;
    });
  const nameSlots = Math.min(10, lists.length * 5);
  for (let k = 0; out.length < nameSlots && lists.some((xs) => k < xs.length); k++) {
    for (const xs of lists) if (xs[k] && out.length < nameSlots) push(xs[k]!);
  }
  if (input.tribe) (TRIBE_ICONS[input.tribe] ?? []).slice(0, 4).forEach(push);
  for (const id of (input.effectIds ?? []).slice(0, 3)) (EFFECT_ICONS[id] ?? []).forEach(push);
  (TYPE_ICONS[input.curse ? 'curse' : (input.cardType ?? '')] ?? []).forEach(push);
  return out;
}
