// 種族の特徴（決定事項 #143）を実際の倍率で：数値の大きさ、公式カードの割引の行、種族のデッキどうしの CPU 戦が最後まで進むこと
import { describe, expect, it } from 'vitest';
import { ai, analyzeCard, BALANCE, battle, TRIBE_SETS, TRIBE_TRAITS } from '../src/engine/index.ts';
import { SCALE } from '../src/engine/scale.ts';
import { OFFICIAL_CARDS, officialCard, officialCommonDeck } from '../src/official/index.ts';

const T = BALANCE.tribes;

function playToEnd(g: battle.GameState): battle.GameState {
  for (let k = 0; k < 6000 && g.phase !== 'ended'; k++) {
    const p: battle.PlayerId = g.phase === 'mulligan' ? (g.players[0].mulligan.done ? 1 : 0) : g.pending ? g.pending.player : g.active;
    const next = battle.applyAction(g, ai.cpuAction(g, p, k, 'normal'));
    if (!next.ok) throw new Error(next.error);
    g = next.state;
  }
  return g;
}

describe('種族の特徴（実際の倍率）', () => {
  it('量には倍率が掛かり、数（枚数）には掛からない', () => {
    expect(SCALE).toBe(20);
    expect(T.beast.set.attack).toBe(SCALE);
    expect(T.dragon.set.breath).toBe(3 * SCALE);
    expect(T.machine.set.defense).toBe(SCALE / 2);
    expect(T.undead.trait.poisonOnHit).toBe(SCALE);
    expect(T.spirit.set.draw).toBe(1);
    expect(TRIBE_SETS.beast.text).toContain(`+${SCALE}`);
    expect(TRIBE_TRAITS.human.text).toContain(`+${SCALE}`);
  });

  it('公式カードの得意の割引は内訳の行に出る（群れ狼：疾走）', () => {
    const c = officialCard('official-mureookami')!;
    const l = analyzeCard(c).points.lines.find((x) => x.label === '種族（獣）の得意');
    expect(l?.value).toBeLessThan(0);
    // 種族のある公式モンスターはどれも作れる
    for (const o of OFFICIAL_CARDS.filter((x) => x.tribe && x.stats)) expect(analyzeCard(o).violations, o.name).toEqual([]);
  });

  it('獣と守り（人）のコモンのデッキどうしの CPU 戦が最後まで進み、揃いの出来事が出る', () => {
    const cards = [...OFFICIAL_CARDS];
    let seen = 0;
    for (const seed of [1, 2, 3]) {
      const r = battle.createGame({
        seed,
        first: (seed % 2) as battle.PlayerId,
        players: [
          { name: '獣', deck: officialCommonDeck('beast'), cards },
          { name: '守り', deck: officialCommonDeck('guard'), cards },
        ],
      });
      if (!r.ok) throw new Error(r.error);
      const g = playToEnd(r.state);
      expect(g.phase).toBe('ended');
      seen += g.log.filter((e) => e.ev?.kind === 'tribe').length;
    }
    expect(seen).toBeGreaterThan(0);
  }, 60_000);
});
