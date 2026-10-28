// ユーザー指示（2026-10-28。決定事項 #146）：量の最低値20・分身の値上げ・手札の条件・封印・トークンを条件で数えない・疾走と突進・不壊の削除・氷結とドロー妨害の上限
import { describe, expect, it } from 'vitest';
import { BALANCE, analyzeCard, battle, conditionsFor, getKeyword, type CardDef } from '../src/engine/index.ts';
import { checkCondition } from '../src/engine/battle/conditions.ts';
import { act, giveCard, putMonster, rich, startGame, P, M } from './battle/helpers.ts';

const base = { v: 1, icon: 'gi:small-fire', scale: 20, drawbacks: [], keywords: [] };
const def = (d: Record<string, unknown>) => ({ ...base, ...d }) as unknown as CardDef;
const codes = (c: CardDef) => analyzeCard(c).violations.map((v) => v.code);

describe('量の最低値は20（倍率1では1）', () => {
  it('トークン（小鬼・軍団・卵）は強さ20から。1では作れない', () => {
    expect(BALANCE.stats.minAmount).toBe(20);
    for (const id of ['token', 'amass', 'incubate']) {
      const c = (value: number) => def({ id: `t-${id}`, name: 'ためし', rarity: 'legend', cost: 3, stats: null, effects: [{ id, value, hits: 1, target: 'self', timing: 'play', condition: null }] });
      expect(codes(c(1)).length, id).toBeGreaterThan(0);
      expect(codes(c(20)), id).toEqual([]);
    }
  });
  it('体力は20以上、攻撃力・守備力は0か20以上', () => {
    const mon = (attack: number, hp: number, defense: number) => def({ id: 'm', name: 'ためし', rarity: 'legend', cost: 2, stats: { attack, hp, defense }, effects: [] });
    expect(codes(mon(0, 1, 0))).toContain('STAT_HP');
    expect(codes(mon(10, 20, 0))).toContain('STAT_ATTACK');
    expect(codes(mon(20, 20, 10))).toContain('STAT_DEFENSE');
    expect(codes(mon(0, 20, 0))).toEqual([]);
    expect(codes(mon(20, 20, 20))).toEqual([]);
  });
  it('0を選べる量の欄（Lv の強さなど）も、0でなければ20以上', () => {
    const lv = (value: number) => def({ id: 'lv', name: 'ためし', rarity: 'legend', cost: 2, stats: { attack: 20, hp: 20, defense: 0 }, effects: [], abilities: [{ id: 'levelUp', value }] });
    expect(codes(lv(10))).toContain('ABILITY_VALUE');
  });
});

describe('分身・封印・守護（不壊の削除）', () => {
  it('分身は固定の20pt＋0.4×ステータス', () => {
    const k = getKeyword('doubleTeam')!;
    expect(k.points({ id: 'doubleTeam' }, { attack: 0, hp: 20, defense: 0 })).toBe(20 + Math.ceil(0.4 * 30));
  });
  it('封印はこのターンだけ。値段は 100pt', () => {
    expect(BALANCE.effects.seal.flat).toBe(100);
    let g = startGame();
    rich(g, 0);
    const taunt = def({ id: 'wall', name: 'かべ', rarity: 'common', cost: 1, stats: { attack: 20, hp: 60, defense: 0 }, effects: [], keywords: [{ id: 'taunt' }] });
    const enemy = putMonster(g, 1, taunt);
    const seal = def({ id: 'seal', name: 'ふういん', rarity: 'legend', cost: 1, stats: null, effects: [{ id: 'seal', target: 'chosen', timing: 'play', condition: null }] });
    g = act(g, { type: 'playCard', player: 0, cardUid: giveCard(g, 0, seal), chosen: { enemy: M(enemy) } });
    expect(battle.keywordFlags(g, g.players[1].board[0]!).taunt).toBeUndefined();
    g = act(g, { type: 'endTurn', player: 0 });
    expect(g.players[1].board[0]!.sealed).toBe(false);
    expect(battle.keywordFlags(g, g.players[1].board[0]!).taunt).toBe(true);
  });
  it('守護の不壊は選べない（保存済みのカードは違反 OPTION_RETIRED）。加護は使える', () => {
    const guard = (option: string) => def({ id: 'g', name: 'まもり', rarity: 'legend', cost: 1, stats: null, effects: [{ id: 'guard', option, target: 'chosen', timing: 'play', condition: null }] });
    expect(codes(guard('indestructible'))).toContain('OPTION_RETIRED');
    expect(codes(guard('protection'))).toEqual([]);
  });
});

describe('毒の条件・氷結・ドロー妨害', () => {
  it('相手が毒状態 ×0.8・毒とやけど ×0.6', () => {
    expect(BALANCE.condition.enemyPoisoned).toBe(0.8);
    expect(BALANCE.condition.enemyPoisonBurn).toBe(0.6);
  });
  it('氷結は1ターンに1枚まで・ドロー妨害は1ターンに1枚まで', () => {
    expect(BALANCE.battle.iceCap).toBe(1);
    expect(BALANCE.effects.iceLock.maxCount).toBe(1);
    expect(BALANCE.battle.maxDrawJamPerTurn).toBe(1);
    let g = startGame();
    rich(g, 0);
    const jam = def({ id: 'jam', name: 'じゃま', rarity: 'legend', cost: 1, stats: null, effects: [{ id: 'drawJam', target: 'enemyPlayer', timing: 'play', condition: null }, { id: 'iceLock', value: 1, target: 'enemyPlayer', timing: 'play', condition: null }] });
    g = act(g, { type: 'playCard', player: 0, cardUid: giveCard(g, 0, jam), chosen: {} });
    g = act(g, { type: 'playCard', player: 0, cardUid: giveCard(g, 0, jam), chosen: {} });
    expect(g.players[1].ice).toBe(1);
    expect(g.players[1].next.jamDraw).toBe(1);
  });
});

describe('手札の条件と、条件で数えるモンスター', () => {
  it('手札の枚数の条件は、相手のターンに出ることのあるタイミングには付けられない', () => {
    for (const timing of ['damaged', 'destroyed', 'allyDestroyed', 'enemyAttacked', 'discarded'] as const) {
      const list = conditionsFor(timing, 'monster');
      expect(list, timing).not.toContain('emptyHand');
      expect(list, timing).not.toContain('smallHand');
    }
    expect(conditionsFor('play', 'spell')).toContain('emptyHand');
  });
  it('トークン（小鬼）は条件で数えない。軍団は数える', () => {
    let g = startGame();
    rich(g, 0);
    const imp = def({ id: 'imp', name: 'しょうかん', rarity: 'legend', cost: 1, stats: null, effects: [{ id: 'token', value: 20, hits: 3, target: 'self', timing: 'play', condition: null }] });
    g = act(g, { type: 'playCard', player: 0, cardUid: giveCard(g, 0, imp), chosen: {} });
    expect(g.players[0].board.length).toBe(3);
    expect(checkCondition(g, 0, 'hasMonster')).toBe(false);
    expect(checkCondition(g, 0, 'manyMonsters')).toBe(false);
    const army = def({ id: 'army', name: 'ぐんだん', rarity: 'legend', cost: 1, stats: null, effects: [{ id: 'amass', value: 20, target: 'self', timing: 'play', condition: null }] });
    g = act(g, { type: 'playCard', player: 0, cardUid: giveCard(g, 0, army), chosen: {} });
    expect(checkCondition(g, 0, 'hasMonster')).toBe(true);
  });
});

describe('疾走（旧・速攻）と突進', () => {
  it('速攻は疾走に改名（ID は haste のまま）。突進は攻撃力×1', () => {
    expect(getKeyword('haste')!.name).toBe('疾走');
    expect(getKeyword('rush')!.name).toBe('突進');
    expect(getKeyword('rush')!.points({ id: 'rush' }, { attack: 60, hp: 20, defense: 0 })).toBe(60);
    // 攻撃力0でも最低20として数える
    const c = def({ id: 'r', name: 'とっしん', rarity: 'common', cost: 1, stats: { attack: 0, hp: 20, defense: 0 }, effects: [], keywords: [{ id: 'rush' }] });
    expect(analyzeCard(c).points.lines.find((l) => l.label === '突進')!.value).toBe(20);
  });
  it('突進：出たターンは相手のモンスターだけを攻撃できる。相手プレイヤーは攻撃できない。次のターンからはふつう', () => {
    let g = startGame();
    rich(g, 0);
    const rusher = def({ id: 'rusher', name: 'とっしん', rarity: 'common', cost: 1, stats: { attack: 20, hp: 40, defense: 0 }, effects: [], keywords: [{ id: 'rush' }] });
    // 相手のモンスターがいなければ、出たターンは攻撃できない
    g = act(g, { type: 'playCard', player: 0, cardUid: giveCard(g, 0, rusher), chosen: {} });
    const m = g.players[0].board.at(-1)!;
    expect(battle.attackTargets(g, m)).toEqual([]);
    expect(battle.applyAction(g, { type: 'attack', player: 0, attackerUid: m.uid, target: P(1) }).ok).toBe(false);
    // 相手のモンスターがいれば、モンスターだけを攻撃できる
    const enemy = putMonster(g, 1, def({ id: 'e', name: 'てき', rarity: 'common', cost: 1, stats: { attack: 0, hp: 60, defense: 0 }, effects: [] }));
    expect(battle.attackTargets(g, m)).toEqual([M(enemy)]);
    g = act(g, { type: 'attack', player: 0, attackerUid: m.uid, target: M(enemy) });
    // 次の自分のターンは相手プレイヤーも攻撃できる
    g = act(g, { type: 'endTurn', player: 0 });
    g = act(g, { type: 'endTurn', player: 1 });
    expect(battle.attackTargets(g, g.players[0].board.at(-1)!).some((t) => t.kind === 'player')).toBe(true);
  });
});
