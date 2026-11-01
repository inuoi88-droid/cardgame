// プレイヤーの報告（2026-11-01 の確認。決定事項 #149）から直したこと・確かめたことを実際の倍率で固定する
import { describe, expect, it } from 'vitest';
import { BALANCE, ai, analyzeCard, battle, type CardDef } from '../src/engine/index.ts';
import { act, giveCard, putMonster, rich, startGame, M } from './battle/helpers.ts';

const base = { v: 1, icon: 'gi:small-fire', scale: 20, drawbacks: [], keywords: [] };
const def = (d: Record<string, unknown>) => ({ ...base, ...d }) as unknown as CardDef;

describe('報告 #25：蘇生は1人1ターン maxRevivesPerTurn 体まで', () => {
  /** 味方が破壊されたとき、捨て札からコスト1以下のモンスターを1体戻す */
  const reviver = def({
    id: 'rv', name: 'よみがえらせ', rarity: 'epic', cost: 2, stats: { attack: 20, hp: 40, defense: 0 },
    effects: [{ id: 'revive', value: 1, target: 'self', timing: 'allyDestroyed', condition: null }],
  });
  const fodder = def({ id: 'fd', name: 'ざこ', rarity: 'common', cost: 1, stats: { attack: 20, hp: 20, defense: 0 }, effects: [] });
  const bolt = def({ id: 'bolt', name: 'いかずち', rarity: 'common', cost: 1, stats: null, effects: [{ id: 'damage', value: 20, target: 'chosen', timing: 'play', condition: null }] });

  it('蘇生を持つモンスターを4体並べ、味方が倒されるたびに蘇生が出ても、1ターンに戻るのは3体まで', () => {
    expect(BALANCE.battle.maxRevivesPerTurn).toBe(3);
    let g = startGame();
    g = act(g, { type: 'endTurn', player: 0 });
    rich(g, 1);
    for (let i = 0; i < 4; i++) putMonster(g, 0, reviver);
    // 捨て札にコスト1のモンスターを8枚
    g.cards['p0:fd'] = fodder;
    for (let i = 0; i < 8; i++) g.players[0].discard.push({ uid: `dz${i}`, cardId: 'p0:fd', owner: 0 });
    const first = putMonster(g, 0, fodder);
    let revived = 0;
    let target: string | undefined = first;
    for (let k = 0; k < 6 && target; k++) {
      g = act(g, { type: 'playCard', player: 1, cardUid: giveCard(g, 1, bolt), chosen: { enemy: M(target) } });
      // 蘇生の選択は持ち主（席0）が答える
      while (g.pending && g.pending.player === 0) {
        const opt = (g.pending as { options?: { id: string }[] }).options?.[0];
        if (!opt) break;
        g = act(g, { type: 'choose', player: 0, picks: [opt.id] });
        revived++;
      }
      target = g.players[0].board.find((m) => g.cards[m.card.cardId]?.name === 'ざこ')?.uid;
    }
    expect(revived).toBe(3);
    expect(g.log.some((e) => e.text.includes('蘇生は1ターンに3体まで'))).toBe(true);
    // 次の自分のターンには、また蘇生できる
    g = act(g, { type: 'endTurn', player: 1 });
    expect(g.active).toBe(0);
    expect(battle.revivesLeft(g, 0)).toBe(3);
  });
});

describe('報告 #27：CPU は突進・接死のモンスターで相手のモンスターを倒しにいく', () => {
  it('手札から出して、そのターンに相手の大きいモンスターを攻撃する（よわい・ふつう・つよい）', () => {
    for (const level of ['easy', 'normal', 'hard'] as const) {
      let g = startGame({ seed: 3 });
      rich(g, 0);
      g.players[0].hand = [];
      giveCard(g, 0, def({ id: 'dt', name: 'どくのきば', rarity: 'rare', cost: 2, stats: { attack: 20, hp: 20, defense: 0 }, keywords: [{ id: 'rush' }, { id: 'deathtouch' }], effects: [] }));
      const big = putMonster(g, 1, def({ id: 'big', name: 'きょじん', rarity: 'rare', cost: 4, stats: { attack: 100, hp: 200, defense: 0 }, effects: [] }));
      const acts: string[] = [];
      for (let i = 0; i < 6 && g.active === 0; i++) {
        const a = ai.cpuAction(g, 0, 10 + i, level);
        acts.push(a.type);
        g = act(g, a);
        if (a.type === 'endTurn') break;
      }
      expect(acts, level).toContain('attack');
      expect(g.players[1].board.some((m) => m.uid === big), level).toBe(false);
    }
  });
});

describe('報告 #24：探査は下げられるコスト1つにつき親和と同じ値段', () => {
  const mon = (cost: number, abilities: { id: string }[]) =>
    def({ id: `d${cost}`, name: 'たんさ', rarity: 'common', cost, stats: { attack: 200, hp: 240, defense: 20 }, keywords: [{ id: 'selfRepair', value: 80 }], effects: [], abilities });
  const delvePts = (cost: number) => analyzeCard(mon(cost, [{ id: 'delve' }])).points.lines.find((l) => l.kind === 'ability')!.value;
  it('印刷コスト2は2つ分・3以上は3つ分（以前は固定 60）', () => {
    expect(BALANCE.abilities.delve.perStep).toBe(BALANCE.abilities.affinity.perStep);
    expect(delvePts(2)).toBe(2 * BALANCE.abilities.delve.perStep);
    expect(delvePts(5)).toBe(3 * BALANCE.abilities.delve.perStep);
  });
  it('報告の形（コスト5のコモン・攻撃力200・体力240・守備力20・自己修理80・探査）は予算を超える', () => {
    expect(analyzeCard(mon(5, [])).valid).toBe(true);
    expect(analyzeCard(mon(5, [{ id: 'delve' }])).violations.map((v) => v.code)).toContain('POINTS_OVER_CAP');
  });
});
