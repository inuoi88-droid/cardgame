/** 対戦に使えるデッキの候補（自分のデッキ＋プリセット）。CPU 戦とオンライン対戦で共用する */
import { useMemo } from 'react';
import { analyzeDeck, type CardDef, type Deck } from '../../engine/index.ts';
import { PRESET_DECKS } from '../../presets.ts';
import { useStore } from '../store.ts';

export interface DeckChoice {
  key: string;
  label: string;
  note: string;
  valid: boolean;
  name: string;
  deck: Deck;
  /** デッキが使うカードの定義 */
  cards: CardDef[];
}

export function useDeckChoices(): DeckChoice[] {
  const { cards, decks } = useStore();
  return useMemo(() => {
    const cardsById = new Map(cards.map((c) => [c.id, c]));
    return [
      ...decks.map((d): DeckChoice => {
        const a = analyzeDeck(d, cardsById);
        return {
          key: `deck:${d.id}`,
          label: d.name || '（名前なし）',
          note: a.valid ? `${a.total}枚` : `使えません：${a.violations[0]?.message ?? ''}`,
          valid: a.valid,
          name: d.name,
          deck: d,
          cards: d.entries.map((e) => cardsById.get(e.cardId)).filter((c) => c !== undefined),
        };
      }),
      ...PRESET_DECKS.map(
        (p): DeckChoice => ({
          key: `preset:${p.id}`,
          label: `${p.name}（プリセット）`,
          note: p.description,
          valid: true,
          name: p.name,
          deck: p.deck,
          cards: p.cards,
        }),
      ),
    ];
  }, [cards, decks]);
}

/** 選ばれている候補（未選択・使えないものを選んでいたら、最初の使えるもの） */
export function pickChoice(choices: DeckChoice[], key: string): DeckChoice | undefined {
  const c = choices.find((x) => x.key === key);
  return c?.valid ? c : choices.find((x) => x.valid);
}
