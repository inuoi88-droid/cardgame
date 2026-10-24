/**
 * 公式カードの公開窓口（ドラフト戦の山。決定事項 #116）。
 * 純粋なデータと関数だけ（DOM・乱数・時刻を使わない）。UI・CPU・サーバー（Edge Function）から同じものを読む。
 */
import { BALANCE } from '../engine/balance.ts';
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
  version: 1,
} as const;

/** 公式カードの ID の前置き */
export const OFFICIAL_ID_PREFIX = 'official-';

/** すべての公式カード（約120種類。レジェンドなし） */
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
