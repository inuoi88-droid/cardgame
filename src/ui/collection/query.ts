/**
 * カード置き場の検索・絞り込み・並べ替え・節分け（決定事項 #109）。純粋関数（tests/collection.test.ts）。
 * カード一覧（CardListPage）とデッキ構築の候補（DeckBuilderPage）で共通に使う。
 */
import {
  BALANCE,
  CARD_TYPES,
  CARD_TYPE_LABEL,
  CURSE_LABEL,
  RARITIES,
  RARITY_LABEL,
  TRIBE_IDS,
  TRIBE_LABEL,
  rarityRank,
  type CardAnalysis,
  type CardDef,
  type CardGroup,
  type CardType,
  type Deck,
  type Rarity,
  type TribeId,
} from '../../engine/index.ts';
import { budgetOf } from '../editor/budget.ts';
import { fold } from '../icons/search.ts';
import { ALL_TAGS, cardTags, isTagId, tagLabel, tagReading, type TagId } from './tags.ts';

// ---------------------------------------------------------------- 1枚ぶんの下ごしらえ

export interface Entry {
  card: CardDef;
  a: CardAnalysis;
  /** 保存の並び（追加順） */
  index: number;
  tags: TagId[];
  /** 検索用の文字列（fold 済み） */
  text: string;
  /** 1行の効果の要約 */
  summary: string;
  used: number;
  budget: number;
  /** 予算超過・要修正 */
  over: boolean;
}

/** 1行の要約：キーワード・効果・能力・デメリット（一覧の行・読み上げに使う） */
export function summaryOf(a: CardAnalysis): string {
  const parts: string[] = [];
  if (a.text.keywords.length > 0) parts.push(a.text.keywords.map((k) => k.name).join('・'));
  parts.push(...a.text.effects);
  if (a.text.abilities.length > 0) parts.push(a.text.abilities.map((x) => x.name).join('・'));
  parts.push(...a.text.drawbacks.map((d) => `［デメリット］${d}`));
  return parts.join(' / ');
}

export function buildEntry(card: CardDef, a: CardAnalysis, index: number): Entry {
  const tags = cardTags(card, a);
  const b = budgetOf(a, card);
  const tribe = card.tribe && TRIBE_LABEL[card.tribe] ? TRIBE_LABEL[card.tribe] : '';
  const raw = [
    card.name,
    card.description ?? '',
    CARD_TYPE_LABEL[a.cardType],
    a.isCurse ? CURSE_LABEL : '',
    RARITY_LABEL[card.rarity],
    tribe,
    ...a.text.keywords.flatMap((k) => [k.name, k.text]),
    ...a.text.effects,
    ...a.text.abilities.flatMap((x) => [x.name, x.text]),
    ...a.text.drawbacks,
    ...tags.map(tagLabel),
    ...tags.map(tagReading),
  ].join('\n');
  return { card, a, index, tags, text: fold(raw), summary: summaryOf(a), used: b.used, budget: b.budget, over: b.used > b.budget || !a.valid };
}

// ---------------------------------------------------------------- 検索

export interface ParsedQuery {
  include: string[];
  exclude: string[];
}

/** 検索語を分ける：空白区切りで「どれも含む」、先頭が「-」の語は「含まない」。ひらがな・カタカナ・全角半角・大文字小文字はならす */
export function parseQuery(q: string): ParsedQuery {
  const include: string[] = [];
  const exclude: string[] = [];
  for (const raw of q.normalize('NFKC').split(/\s+/)) {
    if (raw === '' || raw === '-') continue;
    if (raw.startsWith('-')) exclude.push(fold(raw.slice(1)));
    else include.push(fold(raw));
  }
  return { include, exclude };
}

export function matchQuery(text: string, q: ParsedQuery): boolean {
  return q.include.every((w) => text.includes(w)) && !q.exclude.some((w) => w !== '' && text.includes(w));
}

// ---------------------------------------------------------------- 絞り込み

export type CurseFilter = 'any' | 'only' | 'exclude';
/** デッキ：any＝問わない、unused＝どのデッキにも入っていない、それ以外はデッキの ID（そのデッキに入っている） */
export type DeckFilter = 'any' | 'unused' | string;

export interface Filters {
  types: CardType[];
  rarities: Rarity[];
  costs: number[];
  tribes: (TribeId | 'none')[];
  curse: CurseFilter;
  invalidOnly: boolean;
  deck: DeckFilter;
  /** 仕組みのタグ（すべて含む） */
  tags: TagId[];
}

export const EMPTY_FILTERS: Filters = { types: [], rarities: [], costs: [], tribes: [], curse: 'any', invalidOnly: false, deck: 'any', tags: [] };

/** 見ているグループ：all＝すべて、ungrouped＝どのグループにも入っていない、それ以外はグループの ID */
export type Scope = 'all' | 'ungrouped' | string;

export interface FilterContext {
  /** カード ID → 入っているグループの ID */
  membership: ReadonlyMap<string, readonly string[]>;
  /** カード ID → 入っているデッキの ID */
  deckUse: ReadonlyMap<string, ReadonlySet<string>>;
}

export const COST_VALUES: readonly number[] = Array.from({ length: BALANCE.card.costMax - BALANCE.card.costMin + 1 }, (_, i) => BALANCE.card.costMin + i);

export function filterEntries(entries: readonly Entry[], query: string, filters: Filters, scope: Scope, ctx: FilterContext): Entry[] {
  const q = parseQuery(query);
  const hasQuery = q.include.length > 0 || q.exclude.length > 0;
  const f = filters;
  return entries.filter((e) => {
    const { card, a } = e;
    if (scope === 'ungrouped' && (ctx.membership.get(card.id)?.length ?? 0) > 0) return false;
    if (scope !== 'all' && scope !== 'ungrouped' && !ctx.membership.get(card.id)?.includes(scope)) return false;
    if (f.types.length > 0 && !f.types.includes(a.cardType)) return false;
    if (f.rarities.length > 0 && !f.rarities.includes(card.rarity)) return false;
    if (f.costs.length > 0 && !f.costs.includes(card.cost)) return false;
    if (f.tribes.length > 0 && !f.tribes.includes(card.tribe ?? 'none')) return false;
    if (f.curse === 'only' && !a.isCurse) return false;
    if (f.curse === 'exclude' && a.isCurse) return false;
    if (f.invalidOnly && a.valid) return false;
    if (f.deck === 'unused' && (ctx.deckUse.get(card.id)?.size ?? 0) > 0) return false;
    if (f.deck !== 'any' && f.deck !== 'unused' && !ctx.deckUse.get(card.id)?.has(f.deck)) return false;
    if (f.tags.length > 0 && !f.tags.every((t) => e.tags.includes(t))) return false;
    if (hasQuery && !matchQuery(e.text, q)) return false;
    return true;
  });
}

/** カード ID → 入っているデッキの ID */
export function deckUseIndex(decks: readonly Deck[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const d of decks) {
    for (const en of d.entries) {
      if (en.count <= 0) continue;
      const s = m.get(en.cardId);
      if (s) s.add(d.id);
      else m.set(en.cardId, new Set([d.id]));
    }
  }
  return m;
}

/** 絞り込みの数（グループ・検索は含まない） */
export function filterCount(f: Filters): number {
  return f.types.length + f.rarities.length + f.costs.length + f.tribes.length + f.tags.length + (f.curse !== 'any' ? 1 : 0) + (f.invalidOnly ? 1 : 0) + (f.deck !== 'any' ? 1 : 0);
}

export interface FilterChip {
  key: string;
  label: string;
  /** これを外した絞り込み */
  without: Filters;
}

/** 掛かっている絞り込みを、外せる札にする */
export function filterChips(f: Filters, decks: readonly Deck[]): FilterChip[] {
  const out: FilterChip[] = [];
  const drop = <K extends 'types' | 'rarities' | 'costs' | 'tribes' | 'tags'>(k: K, v: Filters[K][number]): Filters => ({ ...f, [k]: (f[k] as unknown[]).filter((x) => x !== v) });
  for (const t of f.types) out.push({ key: `t:${t}`, label: CARD_TYPE_LABEL[t], without: drop('types', t) });
  for (const r of f.rarities) out.push({ key: `r:${r}`, label: RARITY_LABEL[r], without: drop('rarities', r) });
  for (const c of f.costs) out.push({ key: `c:${c}`, label: `コスト${c}`, without: drop('costs', c) });
  for (const t of f.tribes) out.push({ key: `tr:${t}`, label: t === 'none' ? '種族なし' : `種族：${TRIBE_LABEL[t]}`, without: drop('tribes', t) });
  if (f.curse !== 'any') out.push({ key: 'curse', label: f.curse === 'only' ? '呪いだけ' : '呪いを除く', without: { ...f, curse: 'any' } });
  if (f.invalidOnly) out.push({ key: 'invalid', label: '要修正だけ', without: { ...f, invalidOnly: false } });
  if (f.deck !== 'any') {
    const d = decks.find((x) => x.id === f.deck);
    out.push({ key: 'deck', label: f.deck === 'unused' ? 'デッキで未使用' : `デッキ「${d?.name || '（名前なし）'}」`, without: { ...f, deck: 'any' } });
  }
  for (const t of f.tags) out.push({ key: `tag:${t}`, label: `#${tagLabel(t)}`, without: drop('tags', t) });
  return out;
}

// ---------------------------------------------------------------- 並べ替え

export const SORT_KEYS = ['added', 'newest', 'name', 'cost', 'rarity', 'type', 'points'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export const SORT_LABEL: Record<SortKey, string> = {
  added: '追加順',
  newest: '新しい順',
  name: '名前',
  cost: 'コスト',
  rarity: 'レアリティ',
  type: '種類',
  points: 'ポイント',
};

const collator = new Intl.Collator('ja');
const typeRank = (t: CardType) => CARD_TYPES.indexOf(t);

/** 並べ替え（desc で逆順）。同じ値なら コスト → 名前 → 追加順 */
export function sortEntries(entries: readonly Entry[], key: SortKey, desc = false): Entry[] {
  const byName = (x: Entry, y: Entry) => collator.compare(x.card.name, y.card.name);
  const tie = (x: Entry, y: Entry) => x.card.cost - y.card.cost || byName(x, y) || x.index - y.index;
  const cmp: Record<SortKey, (x: Entry, y: Entry) => number> = {
    added: (x, y) => x.index - y.index,
    newest: (x, y) => y.index - x.index,
    name: (x, y) => byName(x, y) || x.index - y.index,
    cost: tie,
    rarity: (x, y) => rarityRank(x.card.rarity) - rarityRank(y.card.rarity) || tie(x, y),
    type: (x, y) => typeRank(x.a.cardType) - typeRank(y.a.cardType) || tie(x, y),
    points: (x, y) => x.used - y.used || tie(x, y),
  };
  const out = [...entries].sort(cmp[key]);
  return desc ? out.reverse() : out;
}

// ---------------------------------------------------------------- 節分け

export const SECTION_BYS = ['none', 'group', 'tag', 'type', 'cost', 'rarity', 'tribe'] as const;
export type SectionBy = (typeof SECTION_BYS)[number];
export const SECTION_LABEL: Record<SectionBy, string> = {
  none: '分けない',
  group: 'グループごと',
  tag: '仕組みで分ける',
  type: '種類ごと',
  cost: 'コストごと',
  rarity: 'レアリティごと',
  tribe: '種族ごと',
};

export interface Section {
  key: string;
  label: string;
  entries: Entry[];
  /** グループの節（色・メモ） */
  group?: CardGroup;
  /** 仕組みのタグの節（「このタグからグループを作る」） */
  tag?: TagId;
  /** 種類の節（見出しの色） */
  cardType?: CardType;
  rarity?: Rarity;
}

/** 節に分ける（並びは entries の順のまま）。グループ・タグは1枚が複数の節に出る。空の節は出さない */
export function sectionsFor(entries: readonly Entry[], by: SectionBy, groups: readonly CardGroup[], membership: ReadonlyMap<string, readonly string[]>): Section[] {
  if (by === 'none') return [{ key: 'all', label: 'すべて', entries: [...entries] }];
  const out: Section[] = [];
  const push = (s: Section) => {
    if (s.entries.length > 0) out.push(s);
  };
  if (by === 'group') {
    for (const g of groups) {
      const ids = new Set(g.cardIds);
      push({ key: `g:${g.id}`, label: g.name, group: g, entries: entries.filter((e) => ids.has(e.card.id)) });
    }
    push({ key: 'g:none', label: '未分類', entries: entries.filter((e) => (membership.get(e.card.id)?.length ?? 0) === 0) });
  } else if (by === 'tag') {
    for (const t of ALL_TAGS) push({ key: `tag:${t}`, label: tagLabel(t), tag: t, entries: entries.filter((e) => e.tags.includes(t)) });
    push({ key: 'tag:none', label: 'タグなし（バニラなど）', entries: entries.filter((e) => e.tags.length === 0) });
  } else if (by === 'type') {
    for (const t of CARD_TYPES) push({ key: `type:${t}`, label: CARD_TYPE_LABEL[t], cardType: t, entries: entries.filter((e) => e.a.cardType === t) });
  } else if (by === 'cost') {
    for (const c of COST_VALUES) push({ key: `cost:${c}`, label: `コスト ${c}`, entries: entries.filter((e) => e.card.cost === c) });
    push({ key: 'cost:other', label: 'その他のコスト', entries: entries.filter((e) => !COST_VALUES.includes(e.card.cost)) });
  } else if (by === 'rarity') {
    for (const r of RARITIES) push({ key: `rar:${r}`, label: RARITY_LABEL[r], rarity: r, entries: entries.filter((e) => e.card.rarity === r) });
  } else {
    for (const t of TRIBE_IDS) push({ key: `tribe:${t}`, label: `種族：${TRIBE_LABEL[t]}`, entries: entries.filter((e) => e.card.tribe === t) });
    push({ key: 'tribe:none', label: '種族なし', entries: entries.filter((e) => !e.card.tribe) });
  }
  return out;
}

// ---------------------------------------------------------------- 見る人ごとの設定（localStorage。読み書きは prefs.ts）

export const VIEW_MODES = ['card', 'compact', 'list'] as const;
export type ViewMode = (typeof VIEW_MODES)[number];
export const VIEW_LABEL: Record<ViewMode, string> = { card: 'カード', compact: 'コンパクト', list: 'リスト' };

export interface CollectionPrefs {
  /** null は自動（スマホで60枚より多ければリスト、ほかはカード） */
  view: ViewMode | null;
  sort: SortKey;
  desc: boolean;
  filters: Filters;
  scope: Scope;
  sectionBy: SectionBy;
  /** たたんだ節のキー */
  collapsed: string[];
}

export const DEFAULT_PREFS: CollectionPrefs = { view: null, sort: 'added', desc: false, filters: EMPTY_FILTERS, scope: 'all', sectionBy: 'none', collapsed: [] };

const oneOf = <T extends string>(list: readonly T[], x: unknown, fallback: T): T => (isIn(list, x) ? x : fallback);
const isIn = <T extends string>(list: readonly T[], x: unknown): x is T => typeof x === 'string' && (list as readonly string[]).includes(x);
const listOf = <T>(x: unknown, ok: (y: unknown) => y is T): T[] => (Array.isArray(x) ? [...new Set(x.filter(ok))] : []);
const isStr = (x: unknown): x is string => typeof x === 'string';

/** 保存された設定を読む（壊れた値・知らない値は既定に戻す） */
export function parsePrefs(x: unknown): CollectionPrefs {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return DEFAULT_PREFS;
  const o = x as Record<string, unknown>;
  const f = (typeof o.filters === 'object' && o.filters !== null ? o.filters : {}) as Record<string, unknown>;
  const filters: Filters = {
    types: listOf(f.types, (y): y is CardType => isIn(CARD_TYPES, y)),
    rarities: listOf(f.rarities, (y): y is Rarity => isIn(RARITIES, y)),
    costs: listOf(f.costs, (y): y is number => typeof y === 'number' && COST_VALUES.includes(y)),
    tribes: listOf(f.tribes, (y): y is TribeId | 'none' => y === 'none' || isIn(TRIBE_IDS, y)),
    curse: oneOf(['any', 'only', 'exclude'] as const, f.curse, 'any'),
    invalidOnly: f.invalidOnly === true,
    deck: isStr(f.deck) && f.deck !== '' ? f.deck.slice(0, 80) : 'any',
    tags: listOf(f.tags, isTagId),
  };
  return {
    view: isIn(VIEW_MODES, o.view) ? o.view : null,
    sort: oneOf(SORT_KEYS, o.sort, 'added'),
    desc: o.desc === true,
    filters,
    scope: isStr(o.scope) && o.scope !== '' ? o.scope.slice(0, 80) : 'all',
    sectionBy: oneOf(SECTION_BYS, o.sectionBy, 'none'),
    collapsed: listOf(o.collapsed, isStr).slice(0, 200),
  };
}

/** 自動の表示：スマホで LIST_AUTO_MIN 枚より多ければリスト */
export const LIST_AUTO_MIN = 60;
export function autoView(phone: boolean, count: number): ViewMode {
  return phone && count > LIST_AUTO_MIN ? 'list' : 'card';
}
