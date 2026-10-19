// パワーの上限（決定事項 #80）：1人 maxPowers つまで。超えるといちばん古いパワーが消える
import { describe, expect, it } from 'vitest';
import { BALANCE, battle } from '../../src/engine/index.ts';
import { card } from '../helpers.ts';
import { fx, giveCard, play, rich, startGame } from './helpers.ts';

const MAX = BALANCE.battle.maxPowers;
let n = 0;
const power = (name: string) =>
  card({ id: `PW${++n}`, name, rarity: 'legend', cost: 1, effects: [fx({ id: 'shield', value: 1, timing: 'turnStart', target: 'self' })] });

describe('パワーの上限', () => {
  it(`パワーは${MAX}つまで。${MAX + 1}つ目でいちばん古いものが消え、ログと ev（destroy）が残る`, () => {
    let g = rich(startGame());
    const names = Array.from({ length: MAX + 2 }, (_, i) => `力${i + 1}`);
    for (const name of names.slice(0, MAX)) g = play(g, giveCard(g, 0, power(name)));
    expect(g.players[0].powers.map((p) => p.name)).toEqual(names.slice(0, MAX));
    const exile = g.players[0].exile.length;
    const discard = g.players[0].discard.length;

    g = play(g, giveCard(g, 0, power(names[MAX]!)));
    expect(g.players[0].powers.map((p) => p.name)).toEqual(names.slice(1, MAX + 1));
    const line = g.log.find((e) => e.text === `パワーは${MAX}つまで：『${names[0]}』が消えた`);
    expect(line?.ev).toMatchObject({ kind: 'destroy', player: 0 });
    // カードは使ったときに除外済み。消えたパワーのカードが捨て札に戻ることはない
    expect(g.players[0].exile.length).toBe(exile + 1);
    expect(g.players[0].discard.length).toBe(discard);

    g = play(g, giveCard(g, 0, power(names[MAX + 1]!)));
    expect(g.players[0].powers.map((p) => p.name)).toEqual(names.slice(2, MAX + 2));
  });

  it('上限は1人ずつ数える（相手のパワーは消えない）', () => {
    let g = rich(startGame());
    g.players[1].powers.push({ uid: 'opp', cardId: 'x', name: '相手の力', effects: [], drawbacks: [{ id: 'selfDamage', value: 1, timing: 'turnStart' }] });
    for (let i = 0; i < MAX + 1; i++) g = play(g, giveCard(g, 0, power(`自分${i}`)));
    expect(g.players[0].powers).toHaveLength(MAX);
    expect(g.players[1].powers.map((p) => p.name)).toEqual(['相手の力']);
  });

  it(`上限のときにパワーを使おうとすると注意が出る（パワーでないカードには出ない）`, () => {
    let g = rich(startGame());
    for (let i = 0; i < MAX; i++) g = play(g, giveCard(g, 0, power(`古${i}`)));
    const info = (uid: string) => battle.playInfo(g, 0, g.players[0].hand.find((c) => c.uid === uid)!);
    const w = info(giveCard(g, 0, power('新'))).warnings;
    expect(w).toEqual([`パワーが${MAX}つあるので『古0』が消えます`]);
    expect(battle.isPowerCapWarning(w[0]!)).toBe(true);
    const skill = card({ id: 'sk', name: '盾', effects: [fx({ id: 'shield', value: 1, target: 'self' })] });
    expect(info(giveCard(g, 0, skill)).warnings).toEqual([]);
  });
});
