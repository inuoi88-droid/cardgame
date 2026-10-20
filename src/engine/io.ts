/**
 * エクスポート/インポート形式。
 * 外から来たJSONは型を信用せず、知っている項目だけを取り出して CardDef / Deck に組み立て直す。
 */
import { normalizeName, uniqueName } from './deck.ts';
import { toCurrentScale } from './scaling.ts';
import {
  CONDITION_IDS,
  MODIFIER_IDS,
  RARITIES,
  TARGET_IDS,
  TIMING_IDS,
  type CardDef,
  type ConditionId,
  type Deck,
  type DrawbackInstance,
  type EffectInstance,
  type KeywordInstance,
  type ModifierId,
  type Rarity,
  type TargetId,
  type TimingId,
} from './types.ts';

export const EXPORT_FORMAT = 'cardgame-export';
export const EXPORT_VERSION = 1;

export interface ExportBundle {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  cards: CardDef[];
  decks: Deck[];
}

export function buildExport(cards: readonly CardDef[], decks: readonly Deck[]): ExportBundle {
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, cards: cards.map(canonicalCard), decks: decks.map(canonicalDeck) };
}

/** デッキ1つを、使っているカードの定義と一緒に書き出す */
export function exportDeck(deck: Deck, cardsById: ReadonlyMap<string, CardDef>): ExportBundle {
  const cards = deck.entries.flatMap((e) => {
    const c = cardsById.get(e.cardId);
    return c ? [c] : [];
  });
  return buildExport(cards, [deck]);
}

// ---------------------------------------------------------------- 読み取り

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const optNum = (x: unknown): number | undefined | false => (x === undefined ? undefined : isNum(x) ? x : false);
const oneOf = <T extends string>(list: readonly T[], x: unknown): x is T => isStr(x) && (list as readonly string[]).includes(x);

function parseKeyword(x: unknown): KeywordInstance | null {
  if (!isObj(x) || !isStr(x.id)) return null;
  const value = optNum(x.value);
  if (value === false) return null;
  return value === undefined ? { id: x.id } : { id: x.id, value };
}

function parseEffect(x: unknown): EffectInstance | null {
  if (!isObj(x) || !isStr(x.id)) return null;
  if (!oneOf<TimingId>(TIMING_IDS, x.timing) || !oneOf<TargetId>(TARGET_IDS, x.target)) return null;
  const condition = x.condition ?? null;
  if (condition !== null && !oneOf<ConditionId>(CONDITION_IDS, condition)) return null;
  const value = optNum(x.value);
  const hits = optNum(x.hits);
  if (value === false || hits === false) return null;
  const e: EffectInstance = { id: x.id, timing: x.timing, target: x.target, condition };
  if (value !== undefined) e.value = value;
  if (hits !== undefined) e.hits = hits;
  if (x.mods !== undefined) {
    if (!Array.isArray(x.mods) || !x.mods.every((m) => oneOf<ModifierId>(MODIFIER_IDS, m))) return null;
    if (x.mods.length > 0) e.mods = [...(x.mods as ModifierId[])];
  }
  if (x.option !== undefined) {
    if (!isStr(x.option)) return null;
    e.option = x.option;
  }
  return e;
}

function parseDrawback(x: unknown): DrawbackInstance | null {
  if (!isObj(x) || !isStr(x.id)) return null;
  const timing = x.timing ?? null;
  if (timing !== null && !oneOf<TimingId>(TIMING_IDS, timing)) return null;
  const value = optNum(x.value);
  if (value === false) return null;
  return value === undefined ? { id: x.id, timing } : { id: x.id, value, timing };
}

function parseList<T>(x: unknown, parse: (y: unknown) => T | null): T[] | null {
  if (!Array.isArray(x)) return null;
  const out: T[] = [];
  for (const y of x) {
    const p = parse(y);
    if (p === null) return null;
    out.push(p);
  }
  return out;
}

/** カード1枚を読み取る。形が正しくなければ理由を返す（ルール違反かどうかは analyzeCard で別に見る） */
export function parseCard(x: unknown): Result<CardDef> {
  if (!isObj(x)) return { ok: false, error: 'カードの形式ではありません' };
  const label = isStr(x.name) ? `「${x.name}」` : 'カード';
  if (x.v !== undefined && x.v !== 1) return { ok: false, error: `${label}のデータ形式のバージョンに対応していません` };
  if (!isStr(x.id) || x.id.length === 0) return { ok: false, error: `${label}にIDがありません` };
  if (!isStr(x.name) || !isStr(x.icon)) return { ok: false, error: `${label}の名前かアイコンがありません` };
  if (!oneOf<Rarity>(RARITIES, x.rarity)) return { ok: false, error: `${label}のレアリティが正しくありません` };
  if (!isNum(x.cost)) return { ok: false, error: `${label}のコストが正しくありません` };
  let stats: CardDef['stats'] = null;
  if (x.stats !== null && x.stats !== undefined) {
    const s = x.stats;
    if (!isObj(s) || !isNum(s.attack) || !isNum(s.hp) || !isNum(s.defense)) {
      return { ok: false, error: `${label}のステータスが正しくありません` };
    }
    stats = { attack: s.attack, hp: s.hp, defense: s.defense };
  }
  const keywords = parseList(x.keywords ?? [], parseKeyword);
  const effects = parseList(x.effects ?? [], parseEffect);
  const drawbacks = parseList(x.drawbacks ?? [], parseDrawback);
  if (!keywords) return { ok: false, error: `${label}のキーワードが正しくありません` };
  if (!effects) return { ok: false, error: `${label}の効果が正しくありません` };
  if (!drawbacks) return { ok: false, error: `${label}のデメリットが正しくありません` };
  if (x.scale !== undefined && (!isNum(x.scale) || x.scale <= 0)) return { ok: false, error: `${label}の倍率が正しくありません` };
  const card: CardDef = { v: 1, id: x.id, name: x.name, icon: x.icon, rarity: x.rarity, cost: x.cost, stats, keywords, effects, drawbacks };
  if (isNum(x.scale)) card.scale = x.scale;
  // 古い倍率で書かれたカードは、今の倍率にそろえる（決定事項 #65）
  return { ok: true, value: toCurrentScale(card) };
}

export function parseDeck(x: unknown): Result<Deck> {
  if (!isObj(x)) return { ok: false, error: 'デッキの形式ではありません' };
  const label = isStr(x.name) ? `デッキ「${x.name}」` : 'デッキ';
  if (x.v !== undefined && x.v !== 1) return { ok: false, error: `${label}のデータ形式のバージョンに対応していません` };
  if (!isStr(x.id) || x.id.length === 0 || !isStr(x.name)) return { ok: false, error: `${label}のIDか名前がありません` };
  const entries = parseList(x.entries, (y) =>
    isObj(y) && isStr(y.cardId) && isNum(y.count) ? { cardId: y.cardId, count: y.count } : null,
  );
  if (!entries) return { ok: false, error: `${label}のカード一覧が正しくありません` };
  return { ok: true, value: { v: 1, id: x.id, name: x.name, entries } };
}

export interface ParsedImport {
  cards: CardDef[];
  decks: Deck[];
  /** 読み飛ばしたデータの理由 */
  warnings: string[];
}

/**
 * 取り込むテキストを読む。書き出し形式のほか、カード1枚、カードの配列も受け付ける。
 * 形の壊れたカード・デッキは読み飛ばして warnings に理由を入れる。
 */
export function parseImport(text: string): Result<ParsedImport> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'JSONとして読めませんでした' };
  }
  let rawCards: unknown[] = [];
  let rawDecks: unknown[] = [];
  if (Array.isArray(data)) {
    rawCards = data;
  } else if (isObj(data) && data.format === EXPORT_FORMAT) {
    if (data.version !== EXPORT_VERSION) return { ok: false, error: 'このバージョンの書き出しファイルには対応していません' };
    rawCards = Array.isArray(data.cards) ? data.cards : [];
    rawDecks = Array.isArray(data.decks) ? data.decks : [];
  } else if (isObj(data) && 'rarity' in data) {
    rawCards = [data];
  } else {
    return { ok: false, error: 'このゲームのカードやデッキのデータではありません' };
  }

  const warnings: string[] = [];
  const cards: CardDef[] = [];
  const decks: Deck[] = [];
  for (const c of rawCards) {
    const r = parseCard(c);
    if (r.ok) cards.push(r.value);
    else warnings.push(r.error);
  }
  for (const d of rawDecks) {
    const r = parseDeck(d);
    if (r.ok) decks.push(r.value);
    else warnings.push(r.error);
  }
  if (cards.length === 0 && decks.length === 0) {
    return { ok: false, error: warnings[0] ?? '取り込めるカードやデッキがありませんでした' };
  }
  return { ok: true, value: { cards, decks, warnings } };
}

// ---------------------------------------------------------------- 取り込み（既存データとの統合）

/** 項目の順番をそろえたコピー（内容の比較と書き出しに使う） */
export function canonicalCard(c: CardDef): CardDef {
  const r = parseCard(c);
  return r.ok ? r.value : c;
}

function canonicalDeck(d: Deck): Deck {
  const r = parseDeck(d);
  return r.ok ? r.value : d;
}

/** ID を除いた中身が同じか */
function sameContent(a: CardDef, b: CardDef): boolean {
  return JSON.stringify({ ...canonicalCard(a), id: '' }) === JSON.stringify({ ...canonicalCard(b), id: '' });
}

export interface MergeResult {
  cards: CardDef[];
  decks: Deck[];
  addedCards: number;
  addedDecks: number;
  /** 名前が重なったため変えたカード（変更前 → 変更後） */
  renamed: { from: string; to: string }[];
  /** すでに同じものがあったため取り込まなかったカードの数 */
  unchangedCards: number;
}

/**
 * 取り込んだデータを手元のデータに足す。
 * - 中身が同じカードは取り込まず、手元のカードを使う
 * - ID が重なって中身が違うカードは新しい ID にする
 * - 名前が重なったら末尾に番号を付ける
 * - デッキの中のカード ID は付け替える
 */
export function mergeImport(
  existingCards: readonly CardDef[],
  existingDecks: readonly Deck[],
  incoming: { cards: readonly CardDef[]; decks: readonly Deck[] },
  newId: () => string,
): MergeResult {
  const cards = [...existingCards];
  const decks = [...existingDecks];
  const idMap = new Map<string, string>();
  const renamed: MergeResult['renamed'] = [];
  let addedCards = 0;
  let unchangedCards = 0;

  for (const inc of incoming.cards) {
    const same = cards.find((c) => sameContent(c, inc));
    if (same) {
      idMap.set(inc.id, same.id);
      unchangedCards++;
      continue;
    }
    const id = cards.some((c) => c.id === inc.id) ? newId() : inc.id;
    const taken = new Set(cards.map((c) => normalizeName(c.name)));
    const name = uniqueName(inc.name, taken);
    if (name !== normalizeName(inc.name)) renamed.push({ from: inc.name, to: name });
    cards.push({ ...canonicalCard(inc), id, name });
    idMap.set(inc.id, id);
    addedCards++;
  }

  let addedDecks = 0;
  for (const inc of incoming.decks) {
    const entries = inc.entries.map((e) => ({ cardId: idMap.get(e.cardId) ?? e.cardId, count: e.count }));
    const deck: Deck = { v: 1, id: inc.id, name: inc.name, entries };
    const existing = decks.find((d) => d.id === inc.id);
    if (existing && JSON.stringify(canonicalDeck(existing)) === JSON.stringify(deck)) continue;
    if (existing) deck.id = newId();
    decks.push(deck);
    addedDecks++;
  }

  return { cards, decks, addedCards, addedDecks, renamed, unchangedCards };
}
