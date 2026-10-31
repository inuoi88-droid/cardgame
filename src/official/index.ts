/**
 * 公式カードの公開窓口（ドラフト戦の山。決定事項 #116）。
 * 純粋なデータと関数だけ（DOM・乱数・時刻を使わない）。UI・CPU・サーバー（Edge Function）から同じものを読む。
 */
import { BALANCE } from '../engine/balance.ts';
import { draftPool, poolProblem } from '../engine/draft/pool.ts';
import type { CardDef, Deck, Rarity } from '../engine/types.ts';
import { OFFICIAL_ARCHETYPES, OFFICIAL_ENTRIES, type OfficialArchetype, type OfficialEntry } from './cards.ts';

export {
  OFFICIAL_ARCHETYPE_IDS,
  OFFICIAL_ARCHETYPES,
  OFFICIAL_ENTRIES,
  type OfficialArchetype,
  type OfficialArchetypeInfo,
  type OfficialEntry,
} from './cards.ts';

/** 公式カードのセット。カードの中身を変えたら version を上げる（ドラフトの記録・部屋がどの版の山かを見分ける） */
export const OFFICIAL_SET = {
  id: 'dawn',
  name: '黎明の大陸',
  version: 3,
} as const;

/** 公式カードの ID の前置き */
export const OFFICIAL_ID_PREFIX = 'official-';

/** すべての公式カード（126種類。レジェンドは各色と汎用に1枚） */
export const OFFICIAL_CARDS: readonly CardDef[] = OFFICIAL_ENTRIES.map((e) => e.card);

const ENTRY_BY_ID: ReadonlyMap<string, OfficialEntry> = new Map(OFFICIAL_ENTRIES.map((e) => [e.card.id, e]));

/** ID → 公式カード（公式でなければ undefined） */
export function officialCard(id: string): CardDef | undefined {
  return ENTRY_BY_ID.get(id)?.card;
}

export function isOfficialCardId(id: string): boolean {
  return ENTRY_BY_ID.has(id);
}

export function officialEntry(id: string): OfficialEntry | undefined {
  return ENTRY_BY_ID.get(id);
}

/** カードのアーキタイプ（ドラフトの CPU が「色」をそろえるのに使える） */
export function officialArchetypeOf(id: string): OfficialArchetype | undefined {
  return ENTRY_BY_ID.get(id)?.archetype;
}

/** アーキタイプ（とレアリティ）で絞った公式カード */
export function officialCardsOf(archetype: OfficialArchetype, rarity?: Rarity): CardDef[] {
  return OFFICIAL_ENTRIES.filter((e) => e.archetype === archetype && (rarity === undefined || e.card.rarity === rarity)).map((e) => e.card);
}

export function officialArchetypeName(archetype: OfficialArchetype): string {
  return OFFICIAL_ARCHETYPES.find((a) => a.id === archetype)?.name ?? archetype;
}

/**
 * アーキタイプのコモンだけで作る30枚のデッキ（デッキのサイズ BALANCE.deck.size ちょうど）。
 * コモンを並び順に1枚ずつ配り、30枚になるまで繰り返す（12種類なら前の6種類が3枚・残りが2枚）。
 * テストとシミュレーションの基準デッキ。ドラフトで1色に寄せたときの下限の目安
 */
export function officialCommonDeck(archetype: OfficialArchetype): Deck {
  const commons = officialCardsOf(archetype, 'common');
  const counts = new Map<string, number>();
  for (let i = 0; i < BALANCE.deck.size && commons.length > 0; i++) {
    const id = commons[i % commons.length]!.id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return {
    v: 1,
    id: `official-deck-${archetype}`,
    name: `${officialArchetypeName(archetype)}（コモン）`,
    entries: [...counts].map(([cardId, count]) => ({ cardId, count })),
  };
}

/**
 * 運営が書き換えた公式カード（決定事項 #141）を重ねた一覧。並びは元のまま、同じ ID の上書きがあればそれに替える
 * （知らない ID の上書きは使わない。レアリティも変えられる：#148）。サーバーのドラフトの山・CPU 戦のドラフト・公式カードの一覧が同じものを使う
 */
export function withOfficialOverrides(base: readonly CardDef[], overrides: readonly { id: string }[]): CardDef[] {
  if (overrides.length === 0) return [...base];
  const byId = new Map(overrides.filter((o): o is CardDef => isOfficialCardId(o.id)).map((c) => [c.id, c]));
  return base.map((c) => byId.get(c.id) ?? c);
}

/**
 * 公式カードの書き換えとして受け付けられないときの理由（受け付けられれば null）。カードのルール違反は別に analyzeCard で見る。
 * ID は元の公式カードのもの。レアリティは変えてよい（#148。ドラフトの山の枚数はレアリティで決まるので、山が組めるかは
 * `officialPoolProblem` で見る）
 */
export function officialEditProblem(card: Pick<CardDef, 'id'>): string | null {
  return officialCard(card.id) ? null : '公式カードではありません';
}

/** 書き換えを重ねた公式カードでドラフトの山が組めないときの理由（組めれば null。レアリティを変えたとき：決定事項 #148） */
export function officialPoolProblem(cards: readonly CardDef[]): string | null {
  return poolProblem(draftPool(cards, { legends: true }));
}
