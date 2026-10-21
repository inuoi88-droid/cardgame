// 疲労（山札切れ。決定事項 #102）を実際の倍率（20）で確かめる：20・40・60…、1ターン目 300、次のターン 800
import { describe, expect, it } from 'vitest';
import { BALANCE, DISABLED_FIELD_IDS, battle } from '../src/engine/index.ts';
import { endTurn, startGame } from './battle/helpers.ts';

const B = BALANCE.battle;

describe('疲労（実際の倍率）', () => {
  it('fatigueStep は 20。山札も捨て札も無いと、1ターン目は 20+40+…+100＝300、次のターンは 800', () => {
    expect(B.fatigueStep).toBe(20);
    let g = startGame();
    const ps = g.players[0];
    ps.deck = [];
    ps.discard = [];
    ps.hand = [];
    g = endTurn(endTurn(g));
    expect(g.players[0].hp).toBe(B.playerHp - 300);
    g = endTurn(endTurn(g));
    expect(g.players[0].hp).toBe(B.playerHp - 1100);
    expect(battle.nextFatigueDamage(g.players[0])).toBe(220);
  });

  it('闘技場は見送り中（決定事項 #102）', () => {
    expect(DISABLED_FIELD_IDS).toEqual(['arena']);
  });
});
