// プレイヤーの報告（2026-10-26 受付 #11・#14）から直した不具合を実際の倍率で固定する
import { describe, expect, it } from 'vitest';
import { BALANCE, battle, keywordStats, type CardDef } from '../src/engine/index.ts';
import { bodyPoints } from '../src/engine/points.ts';
import { act, giveCard, rich, startGame, P } from './battle/helpers.ts';

const draculaLike = {
  v: 1, id: 'dr', cost: 1, icon: 'gi:vampire-dracula', name: 'ドラキュラ', scale: 20, rarity: 'common',
  stats: { hp: 40, attack: 0, defense: 0 },
  effects: [{ id: 'train', value: 40, target: 'chosen', timing: 'summon', condition: null }],
  keywords: [{ id: 'stealth' }, { id: 'haste' }, { id: 'doubleAttack' }],
  drawbacks: [],
} as unknown as CardDef;

describe('報告 #11：鍛錬で攻撃力比例のキーワードの値段を逃れられない', () => {
  it('召喚時に条件なしで足す鍛錬の分は、攻撃力として数える', () => {
    expect(keywordStats(draculaLike).attack).toBe(40);
    expect(bodyPoints(draculaLike)).toBeGreaterThan(bodyPoints({ ...draculaLike, effects: [] }));
  });
  it('条件付きの鍛錬や、ほかのモンスターだけに効く鍛錬は数えない', () => {
    const cond = { ...draculaLike, effects: [{ ...draculaLike.effects[0]!, condition: 'lowHp' }] } as CardDef;
    const others = { ...draculaLike, effects: [{ ...draculaLike.effects[0]!, target: 'otherAllies' }] } as CardDef;
    expect(keywordStats(cond).attack).toBe(0);
    expect(keywordStats(others).attack).toBe(0);
  });
});

const experiment = {
  v: 1, id: 'exp', cost: 5, icon: 'gi:small-fire', name: 'じっけん', scale: 20, rarity: 'legend',
  stats: { hp: 1, attack: 0, defense: 0 },
  effects: [
    { id: 'offspring', target: 'self', timing: 'summon', condition: 'hasMonster' },
    { id: 'populate', target: 'self', timing: 'attack', condition: 'hasMonster' },
    { id: 'execute', value: 80, target: 'chosen', timing: 'summon', condition: 'hasMonster' },
    { id: 'damage', value: 80, target: 'everyone', timing: 'summon', condition: null },
  ],
  keywords: [{ id: 'haste' }, { id: 'doubleAttack' }, { id: 'doubleTeam' }, { id: 'undying' }],
  abilities: [{ id: 'embalm', value: 1, option: 'eternal' }],
  drawbacks: [],
} as unknown as CardDef;

describe('報告 #14：居住で攻撃のたびにトークンを複写し続けて1ターンで倒せない', () => {
  it('居住で出せるトークンは1ターンに maxPopulatesPerTurn 体まで', () => {
    let g = startGame();
    const uid = giveCard(g, 0, experiment);
    g.players[0].discard.push(...g.players[0].hand.splice(g.players[0].hand.findIndex((c) => c.uid === uid), 1));
    rich(g, 0);
    g = act(g, { type: 'discardAbility', player: 0, cardUid: uid, ability: 'embalm' });
    let populated = 0;
    for (let i = 0; i < 60; i++) {
      const m = g.players[0].board.find((x) => x.card.token && x.attacksUsed < 2 && !x.sealed);
      if (!m) break;
      const before = g.log.length;
      const r = battle.applyAction(g, { type: 'attack', player: 0, attackerUid: m.uid, target: P(1) });
      if (!r.ok) break;
      g = r.state;
      populated += g.log.slice(before).filter((e) => e.text.includes('攻撃するたび')).length > 0 ? 1 : 0;
      if (g.result) break;
    }
    expect(g.result).toBeNull();
    expect(g.players[1].hp).toBeGreaterThan(g.players[1].maxHp / 2);
    expect(BALANCE.battle.maxPopulatesPerTurn).toBe(2);
    expect(populated).toBeGreaterThan(0);
  });
});
