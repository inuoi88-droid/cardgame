// playInfo の注意（warnings）：条件未達・対象なし・全体効果で場が空（UI の「条件未達」「対象なし」バッジと確認に使う）
import { describe, expect, it } from 'vitest';
import { BALANCE, battle } from '../../src/engine/index.ts';
import { WARN_NO_ENEMY_MONSTER, WARN_NO_MONSTER, WARN_NO_TARGET } from '../../src/engine/battle/legal.ts';
import { card } from '../helpers.ts';
import { fx, giveCard, putMonster, startGame } from './helpers.ts';

const C = BALANCE.conditionParams;

const BEAST = card({ id: 'beast', name: '獣', stats: { attack: 2, hp: 3, defense: 0 } });

function infoOf(g: battle.GameState, uid: string, p: battle.PlayerId = 0) {
  return battle.playInfo(g, p, g.players[p].hand.find((c) => c.uid === uid)!);
}

describe('playInfo の注意', () => {
  it('注意がなければ空', () => {
    const g = startGame();
    const uid = giveCard(g, 0, card({ id: 'fire', name: '火の粉', effects: [fx({ id: 'damage', value: 2 })] }));
    const i = infoOf(g, uid);
    expect(i.blocked).toBeNull();
    expect(i.warnings).toEqual([]);
  });

  it('条件を満たしていないと、条件の名前つきで注意する', () => {
    const g = startGame();
    const uid = giveCard(g, 0, card({ id: 'todome', name: 'とどめ', effects: [fx({ id: 'damage', value: 20, condition: 'enemyPoisoned' })] }));
    expect(infoOf(g, uid).warnings).toEqual(['条件を満たしていません：相手が毒状態']);
    // 条件を満たせば注意は消える
    g.players[1].status.poison = 3;
    expect(infoOf(g, uid).warnings).toEqual([]);
  });

  it('「手札が3枚以下」の条件は手札の枚数で決まる', () => {
    const g = startGame();
    const uid = giveCard(g, 0, card({ id: 'sh', name: '手札少', effects: [fx({ id: 'draw', value: 1, target: 'self', condition: 'smallHand' })] }));
    expect(g.players[0].hand.length).toBeGreaterThan(C.smallHandMax);
    expect(infoOf(g, uid).warnings).toEqual([`条件を満たしていません：手札が${C.smallHandMax}枚以下`]);
  });

  it('相手モンスター限定の「選んだ1体」で相手の場が空なら「対象がいません」', () => {
    const g = startGame();
    const uid = giveCard(g, 0, card({ id: 'exe', name: '処刑', effects: [fx({ id: 'execute', value: 5 })] }));
    const i = infoOf(g, uid);
    expect(i.enemyTargets).toEqual([]);
    expect(i.warnings).toEqual([WARN_NO_TARGET]);
    putMonster(g, 1, BEAST);
    expect(infoOf(g, uid).warnings).toEqual([]);
  });

  it('隠密しかいない場でも「対象がいません」', () => {
    const g = startGame();
    const uid = giveCard(g, 0, card({ id: 'exe2', name: '処刑', effects: [fx({ id: 'execute', value: 5 })] }));
    putMonster(g, 1, BEAST, { stealth: true });
    expect(infoOf(g, uid).warnings).toEqual([WARN_NO_TARGET]);
  });

  it('相手プレイヤーも選べる効果は、場が空でも注意しない', () => {
    const g = startGame();
    const uid = giveCard(g, 0, card({ id: 'dmg', name: 'ダメージ', effects: [fx({ id: 'damage', value: 2 })] }));
    expect(infoOf(g, uid).warnings).toEqual([]);
  });

  it('相手モンスター全体の効果で相手の場が空なら注意する', () => {
    const g = startGame();
    const uid = giveCard(g, 0, card({ id: 'wipe', name: '全体', effects: [fx({ id: 'damage', value: 2, target: 'enemyMonsters' })] }));
    expect(infoOf(g, uid).warnings).toEqual([WARN_NO_ENEMY_MONSTER]);
    putMonster(g, 1, BEAST);
    expect(infoOf(g, uid).warnings).toEqual([]);
  });

  it('場全体（board）の効果で両方の場が空なら注意する。モンスターカード自身は数に入る', () => {
    const g = startGame();
    const spell = giveCard(g, 0, card({ id: 'bd', name: '場全体', effects: [fx({ id: 'wipe', value: 1, target: 'board' })] }));
    expect(infoOf(g, spell).warnings).toEqual([WARN_NO_MONSTER]);
    const mon = giveCard(
      g,
      0,
      card({ id: 'bdm', name: '場全体の獣', stats: { attack: 1, hp: 1, defense: 0 }, effects: [fx({ id: 'wipe', value: 1, timing: 'summon', target: 'board' })] }),
    );
    expect(infoOf(g, mon).warnings).toEqual([]);
  });

  it('自分のモンスター1体を選ぶ効果：自分の場が空なら注意、モンスターカードなら自分自身が候補', () => {
    const g = startGame();
    const spell = giveCard(g, 0, card({ id: 'buff', name: '強化', effects: [fx({ id: 'attackUp', value: 1 })] }));
    expect(infoOf(g, spell).allyTargets).toEqual([]);
    expect(infoOf(g, spell).warnings).toEqual([WARN_NO_TARGET]);
    const mon = giveCard(
      g,
      0,
      card({ id: 'buffm', name: '号令の獣', stats: { attack: 1, hp: 1, defense: 0 }, effects: [fx({ id: 'attackUp', value: 1, timing: 'summon' })] }),
    );
    expect(infoOf(g, mon).warnings).toEqual([]);
  });

  it('使用時以外のタイミング（攻撃するたび など）は見ない', () => {
    const g = startGame();
    const uid = giveCard(
      g,
      0,
      card({ id: 'rat', name: 'ネズミ', stats: { attack: 1, hp: 2, defense: 0 }, effects: [fx({ id: 'poison', value: 1, timing: 'attack', condition: 'enemyPoisoned' })] }),
    );
    expect(infoOf(g, uid).warnings).toEqual([]);
  });

  it('同じ注意は1つにまとめる', () => {
    const g = startGame();
    const uid = giveCard(
      g,
      0,
      card({
        id: 'two',
        name: '二重',
        effects: [fx({ id: 'execute', value: 5 }), fx({ id: 'seal', value: 0 }), fx({ id: 'damage', value: 1, condition: 'lowHp' })],
      }),
    );
    expect(infoOf(g, uid).warnings).toEqual([WARN_NO_TARGET, '条件を満たしていません：自分のHPが半分以下']);
  });

  it('使えないカード（エナジー不足）でも注意は計算される', () => {
    const g = startGame();
    g.players[0].energy = 0;
    const uid = giveCard(g, 0, card({ id: 'todome2', name: 'とどめ', cost: 2, effects: [fx({ id: 'damage', value: 20, condition: 'enemyPoisoned' })] }));
    const i = infoOf(g, uid);
    expect(i.blocked).toBe('エナジーが足りません');
    expect(i.warnings).toHaveLength(1);
  });

  it('ノイズには注意がない', () => {
    const g = startGame();
    g.players[0].hand.push({ uid: 'noise1', cardId: battle.NOISE_CARD_ID, owner: 0 });
    expect(infoOf(g, 'noise1').warnings).toEqual([]);
  });
});
