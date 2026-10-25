// 戦った相手のデッキのコピー：実際の倍率で、古い倍率のカードが今の倍率に移ること（parseCard）
import { describe, expect, it } from 'vitest';
import { SCALE } from '../src/engine/scale.ts';
import { fromBaseScale } from '../src/engine/index.ts';
import { importCards } from '../src/ui/copy/copyLogic.ts';
import { parseOpponent } from '../src/ui/copy/history.ts';
import { card } from './helpers.ts';

describe('コピーするカードの倍率', () => {
  const old = card({ id: 'old', name: '古い兵士', cost: 1, stats: { attack: 2, hp: 3, defense: 0 } }); // scale なし＝倍率1

  it('倍率の無い古いカードは今の倍率にしてから足す', () => {
    expect(SCALE).toBeGreaterThan(1);
    const r = importCards([], [old], { sourceName: '相手', newId: () => 'n1' });
    expect(r.cards[0]!.stats).toEqual({ attack: 2 * SCALE, hp: 3 * SCALE, defense: 0 });
    expect(r.cards[0]!.scale).toBe(SCALE);
  });

  it('今の倍率の同じカードを持っていれば、それを使う', () => {
    const mine = { ...fromBaseScale(old), id: 'mine' };
    const r = importCards([mine], [old], { sourceName: '相手', newId: () => 'n1' });
    expect(r.cards).toEqual([]);
    expect(r.idMap.old).toBe('mine');
  });

  it('記録を読むときもカードを今の倍率にする', () => {
    const e = parseOpponent({
      id: 'g',
      at: 1,
      source: 'online',
      opponentName: 'たろう',
      deck: { v: 1, id: 'd', name: 'd', entries: [{ cardId: 'old', count: 1 }] },
      cards: [old],
      result: 'draw',
    });
    expect(e!.cards[0]!.stats!.attack).toBe(2 * SCALE);
  });
});
