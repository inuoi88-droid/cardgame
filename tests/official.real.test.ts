// 公式カード（src/official）を実際の倍率で：ルール・予算と、コモンだけのデッキどうしで CPU が最後まで対戦できること
import { describe, expect, it } from 'vitest';
import { ai, analyzeCard, BALANCE, battle } from '../src/engine/index.ts';
import { OFFICIAL_ARCHETYPE_IDS, OFFICIAL_CARDS, officialCommonDeck } from '../src/official/index.ts';

describe('公式カード（実際の倍率）', () => {
  it('倍率が付いていて、すべてルールを守り、予算を使い切っている', () => {
    for (const c of OFFICIAL_CARDS) {
      expect(c.scale, c.name).toBe(BALANCE.scale);
      const a = analyzeCard(c);
      expect(
        a.violations.map((v) => v.message),
        c.name,
      ).toEqual([]);
      expect(a.points.remaining, c.name).toBeGreaterThanOrEqual(0);
      expect(a.points.remaining, c.name).toBeLessThanOrEqual(a.points.cap * 0.3);
    }
  });

  it('コモンだけのデッキどうしで、CPU が決着まで対戦できる', () => {
    const ids = OFFICIAL_ARCHETYPE_IDS;
    for (let i = 0; i < ids.length; i++) {
      const [a, b] = [ids[i]!, ids[(i + 1) % ids.length]!];
      const r = battle.createGame({
        seed: 31 + i,
        players: [
          { name: a, deck: officialCommonDeck(a), cards: [...OFFICIAL_CARDS] },
          { name: b, deck: officialCommonDeck(b), cards: [...OFFICIAL_CARDS] },
        ],
      });
      if (!r.ok) throw new Error(r.error);
      let g = r.state;
      for (let k = 0; k < 6000 && g.phase !== 'ended'; k++) {
        const p: battle.PlayerId = g.phase === 'mulligan' ? (g.players[0].mulligan.done ? 1 : 0) : g.pending ? g.pending.player : g.active;
        const next = battle.applyAction(g, ai.cpuAction(g, p, k));
        if (!next.ok) throw new Error(next.error);
        g = next.state;
      }
      expect(g.phase, `${a} 対 ${b}`).toBe('ended');
    }
  }, 120_000);
});
