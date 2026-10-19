// 挑発がカードの効果の「選んだ1体」にも効く（決定事項 #83）
import { describe, expect, it } from 'vitest';
import { ai, battle } from '../../src/engine/index.ts';
import { card } from '../helpers.ts';
import { M, P, act, actError, fx, giveCard, play, putMonster, rich, startGame } from './helpers.ts';

let n = 0;
const unit = (attack: number, hp: number, extra: Partial<Parameters<typeof card>[0]> = {}) =>
  card({ id: `T${++n}`, name: `モンスター${n}`, rarity: 'legend', cost: 1, stats: { attack, hp, defense: 0 }, ...extra });
const kw = (...ids: string[]) => ({ keywords: ids.map((id) => ({ id })) });
const spell = (id: string, effects: Parameters<typeof fx>[0][]) => card({ id, name: id, rarity: 'legend', cost: 1, effects: effects.map(fx) });

/** P0 の手番。P1 の場に挑発1体（hp 20）と普通のモンスター1体 */
function tauntBoard(patch: Partial<battle.Monster> = {}) {
  const g = rich(startGame());
  const taunt = putMonster(g, 1, unit(1, 20, kw('taunt')), patch);
  const plain = putMonster(g, 1, unit(1, 20));
  return { g, taunt, plain };
}

describe('挑発：カードの「選んだ1体」も挑発しか選べない', () => {
  it('ダメージの呪文は相手プレイヤーも挑発でないモンスターも選べない', () => {
    const { g, taunt, plain } = tauntBoard();
    const uid = giveCard(g, 0, spell('dmg', [{ id: 'damage', value: 5 }]));
    const info = battle.playInfo(g, 0, g.players[0].hand.find((c) => c.uid === uid)!);
    expect(info.enemyTargets).toEqual([M(taunt)]);
    expect(info.tauntLimited).toBe(true);
    expect(actError(g, { type: 'playCard', player: 0, cardUid: uid, chosen: { enemy: P(1) } })).toBe('その対象は選べません');
    expect(actError(g, { type: 'playCard', player: 0, cardUid: uid, chosen: { enemy: M(plain) } })).toBe('その対象は選べません');
    const next = play(g, uid, { enemy: M(taunt) });
    expect(battle.findMonster(next, taunt)!.hp).toBe(15);
    expect(next.players[1].hp).toBe(120);
  });

  it('ダメージ以外の効果（封印・毒）も同じ', () => {
    const { g, taunt, plain } = tauntBoard();
    const seal = giveCard(g, 0, spell('seal', [{ id: 'seal' }]));
    expect(actError(g, { type: 'playCard', player: 0, cardUid: seal, chosen: { enemy: M(plain) } })).toBe('その対象は選べません');
    const poison = giveCard(g, 0, spell('poison', [{ id: 'poison', value: 2 }]));
    expect(actError(g, { type: 'playCard', player: 0, cardUid: poison, chosen: { enemy: P(1) } })).toBe('その対象は選べません');
    const legal = battle.legalActions(g, 0).filter((a) => a.type === 'playCard');
    expect(legal.length).toBeGreaterThan(0);
    for (const a of legal) if (a.type === 'playCard' && a.chosen?.enemy) expect(a.chosen.enemy).toEqual(M(taunt));
  });

  it('隠密中の挑発は数えない（ほかの対象も選べる）', () => {
    const { g, taunt, plain } = tauntBoard({ stealth: true });
    const uid = giveCard(g, 0, spell('dmg', [{ id: 'damage', value: 5 }]));
    const info = battle.playInfo(g, 0, g.players[0].hand.find((c) => c.uid === uid)!);
    expect(info.enemyTargets).toEqual([P(1), M(plain)]);
    expect(info.tauntLimited).toBe(false);
    expect(info.enemyTargets).not.toContainEqual(M(taunt));
    const next = play(g, uid, { enemy: P(1) });
    expect(next.players[1].hp).toBe(115);
  });

  it('ランダム・相手全体の効果には効かない', () => {
    const { g, taunt, plain } = tauntBoard();
    const all = giveCard(g, 0, spell('all', [{ id: 'damage', value: 3, target: 'enemyAll' }]));
    const info = battle.playInfo(g, 0, g.players[0].hand.find((c) => c.uid === all)!);
    expect(info.enemyTargets).toEqual([]);
    expect(info.tauntLimited).toBe(false);
    const next = play(g, all);
    expect(next.players[1].hp).toBe(117);
    expect(battle.findMonster(next, taunt)!.hp).toBe(17);
    expect(battle.findMonster(next, plain)!.hp).toBe(17);
    // ランダムは挑発以外（相手プレイヤー）にも当たりうる
    let hitFace = false;
    for (let seed = 1; seed <= 20 && !hitFace; seed++) {
      const s = rich(startGame({ seed }));
      putMonster(s, 1, unit(1, 20, kw('taunt')));
      const r = giveCard(s, 0, spell('rnd', [{ id: 'damage', value: 3, target: 'random' }]));
      if (play(s, r).players[1].hp === 117) hitFace = true;
    }
    expect(hitFace).toBe(true);
  });

  it('モンスターの召喚時の効果も挑発しか選べない（飛行のモンスターでも）', () => {
    const { g, taunt, plain } = tauntBoard();
    const uid = giveCard(g, 0, unit(2, 2, { ...kw('flying'), effects: [fx({ id: 'damage', value: 4, timing: 'summon' })] }));
    expect(actError(g, { type: 'playCard', player: 0, cardUid: uid, chosen: { enemy: P(1) } })).toBe('その対象は選べません');
    expect(actError(g, { type: 'playCard', player: 0, cardUid: uid, chosen: { enemy: M(plain) } })).toBe('その対象は選べません');
    const next = play(g, uid, { enemy: M(taunt) });
    expect(battle.findMonster(next, taunt)!.hp).toBe(16);
  });
});

describe('挑発と CPU', () => {
  it('CPU は挑発があると不正な対象を選ばず、どの強さでも合法な手を指す', () => {
    for (const level of ai.CPU_LEVELS) {
      let { g } = tauntBoard();
      for (let i = 0; i < 3; i++) giveCard(g, 0, spell(`d${i}`, [{ id: 'damage', value: 5 }]));
      for (let i = 0; i < 20 && g.phase === 'main' && g.active === 0; i++) {
        const a = ai.cpuAction(g, 0, i, level);
        expect(battle.validateAction(g, a)).toBeNull();
        if (a.type === 'playCard' && a.chosen?.enemy) expect(a.chosen.enemy.kind).toBe('monster');
        g = act(g, a);
      }
    }
  });

  it('リーサル探索は、挑発に止められるカードの顔ダメージを数えない', () => {
    // 相手 HP 10。手札はダメージ10（選んだ1体）。挑発（体力20）がいると届かない
    const { g } = tauntBoard();
    g.players[1].hp = 10;
    giveCard(g, 0, spell('d10', [{ id: 'damage', value: 10 }]));
    expect(ai.damageUpperBound(g, 0)).toBeLessThan(10);
    expect(ai.findLethal(g, 0, 1)).toBeNull();

    // 挑発がいなければ届く
    const free = rich(startGame());
    putMonster(free, 1, unit(1, 20));
    free.players[1].hp = 10;
    giveCard(free, 0, spell('d10', [{ id: 'damage', value: 10 }]));
    expect(ai.damageUpperBound(free, 0)).toBeGreaterThanOrEqual(10);
    expect(ai.findLethal(free, 0, 1)).not.toBeNull();

    // 相手全体のダメージは挑発がいても届く
    const wide = tauntBoard().g;
    wide.players[1].hp = 10;
    giveCard(wide, 0, spell('all10', [{ id: 'damage', value: 10, target: 'enemyAll' }]));
    expect(ai.damageUpperBound(wide, 0)).toBeGreaterThanOrEqual(10);
    expect(ai.findLethal(wide, 0, 1)).not.toBeNull();
  });
});
