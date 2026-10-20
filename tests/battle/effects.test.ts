// 効果ごとの処理と、発動タイミング・条件・パワー・選択
import { describe, expect, it } from 'vitest';
import { BALANCE, battle, listEffects } from '../../src/engine/index.ts';
import { EXAMPLES, card } from '../helpers.ts';
import { M, P, act, actError, attack, endTurn, fx, giveCard, monster, play, putMonster, rich, startGame } from './helpers.ts';

let n = 0;
const legend = (effects: ReturnType<typeof fx>[], extra: Partial<Parameters<typeof card>[0]> = {}) =>
  card({ id: `E${++n}`, name: `効果${n}`, rarity: 'legend', cost: 1, effects, ...extra });
const unit = (attack: number, hp: number, extra: Partial<Parameters<typeof card>[0]> = {}) =>
  card({ id: `U${++n}`, name: `モンスター${n}`, rarity: 'legend', cost: 1, stats: { attack, hp, defense: 0 }, ...extra });

describe('作成例のカードを対戦で使う', () => {
  it('とどめの一撃：相手が毒状態のときだけ20ダメージ', () => {
    let g = rich(startGame());
    g = play(g, giveCard(g, 0, EXAMPLES.todome), { enemy: P(1) });
    expect(g.players[1].hp).toBe(120);
    expect(g.log.some((e) => e.text.includes('満たさないため発動しない'))).toBe(true);
    g.players[1].status.poison = 1;
    g = play(g, giveCard(g, 0, EXAMPLES.todome), { enemy: P(1) });
    expect(g.players[1].hp).toBe(100);
  });

  it('毒牙ネズミ：攻撃するたび、攻撃した相手に毒1', () => {
    let g = startGame();
    const rat = putMonster(g, 0, EXAMPLES.dokugaNezumi);
    const d = putMonster(g, 1, unit(1, 9));
    g = attack(g, rat, M(d));
    expect(monster(g, d)!.status.poison).toBe(1);
  });

  it('狂戦士の契約：筋力5を得て、パワーとして残り、毎ターン開始時に自傷4', () => {
    let g = rich(startGame());
    const uid = giveCard(g, 0, EXAMPLES.kyosenshi);
    g = play(g, uid);
    expect(g.players[0].status.strength).toBe(5);
    expect(g.players[0].powers).toHaveLength(1);
    expect(g.players[0].exile.some((c) => c.uid === uid)).toBe(true);
    g = endTurn(endTurn(g));
    expect(g.players[0].hp).toBe(116);
  });
});

describe('カードの行き先', () => {
  it('アタック・スキルは捨て札、パワー・アタックはダメージを与えて永続効果を残し除外', () => {
    let g = rich(startGame());
    const atk = giveCard(g, 0, legend([fx({ id: 'damage', value: 1 })]));
    g = play(g, atk, { enemy: P(1) });
    expect(g.players[0].discard.some((c) => c.uid === atk)).toBe(true);
    const pa = giveCard(g, 0, legend([fx({ id: 'damage', value: 3 }), fx({ id: 'strength', value: 1, target: 'self' })]));
    g = play(g, pa, { enemy: P(1) });
    expect(g.players[1].hp).toBe(116);
    expect(g.players[0].status.strength).toBe(1);
    expect(g.players[0].exile.some((c) => c.uid === pa)).toBe(true);
  });
});

describe('発動タイミング', () => {
  it('召喚時：選んだ相手にダメージ（モンスターカードでも対象を選ぶ）', () => {
    let g = rich(startGame());
    const u = giveCard(g, 0, unit(1, 1, { effects: [fx({ id: 'damage', value: 3, timing: 'summon' })] }));
    expect(actError(g, { type: 'playCard', player: 0, cardUid: u })).toBe('対象を選んでください');
    g = play(g, u, { enemy: P(1) });
    expect(g.players[1].hp).toBe(117);
  });

  it('召喚時の「自分のモンスター1体」は、出したモンスター自身も選べる', () => {
    let g = rich(startGame());
    const u = giveCard(g, 0, unit(1, 1, { effects: [fx({ id: 'attackUp', value: 2, timing: 'summon' })] }));
    g = play(g, u, { ally: u });
    expect(monster(g, u)!.attack).toBe(3);
  });

  it('破壊されたとき：相手プレイヤーにダメージ', () => {
    let g = startGame();
    const a = putMonster(g, 0, unit(5, 5));
    const d = putMonster(g, 1, unit(1, 1, { effects: [fx({ id: 'damage', value: 4, timing: 'destroyed', target: 'enemyPlayer' })] }));
    g = attack(g, a, M(d));
    expect(g.players[0].hp).toBe(116);
  });

  it('ダメージを受けたとき：生き残ったら、ダメージを与えてきた相手に返す（モンスターの反撃1とは別）', () => {
    let g = startGame();
    const a = putMonster(g, 0, unit(1, 5));
    const d = putMonster(g, 1, unit(1, 5, { effects: [fx({ id: 'damage', value: 2, timing: 'damaged' })] }));
    g = attack(g, a, M(d));
    expect(monster(g, a)!.hp).toBe(5 - 1 - 2);
  });

  it('カードを使うたび：パワー自身には反応せず、1ターン2回まで（次のターンはまた2回：#70 R10）', () => {
    let g = rich(startGame());
    g = play(g, giveCard(g, 0, legend([fx({ id: 'damage', value: 1, timing: 'cardPlayed', target: 'enemyPlayer' })])));
    expect(g.players[1].hp).toBe(120);
    for (let i = 0; i < 5; i++) g = play(g, giveCard(g, 0, legend([fx({ id: 'shield', value: 1, target: 'self' })])));
    expect(g.players[1].hp).toBe(118);
    expect(g.log.some((e) => e.text.includes('1ターン2回まで'))).toBe(true);
    g = endTurn(endTurn(g));
    g = rich(g);
    for (let i = 0; i < 4; i++) g = play(g, giveCard(g, 0, legend([fx({ id: 'shield', value: 1, target: 'self' })])));
    expect(g.players[1].hp).toBe(116);
  });

  it('自分のターン終了時（パワー）', () => {
    let g = rich(startGame());
    g = play(g, giveCard(g, 0, legend([fx({ id: 'shield', value: 3, timing: 'turnEnd', target: 'self' })])));
    g = endTurn(g);
    expect(g.players[0].shield).toBe(3);
  });

  it('攻撃した相手が倒れたら、攻撃するたびの効果は空振り', () => {
    let g = startGame();
    const rat = putMonster(g, 0, EXAMPLES.dokugaNezumi);
    const d = putMonster(g, 1, unit(1, 1));
    g = attack(g, rat, M(d));
    expect(g.log.some((e) => e.text.includes('対象がいない'))).toBe(true);
  });
});

describe('選択が要る効果', () => {
  it('サーチ：山札から指定した種類を選んで手札へ（候補が2つ以上なら選択待ち）', () => {
    let g = rich(startGame());
    const target = card({ id: 'mon', rarity: 'common', cost: 1, stats: { attack: 1, hp: 1, defense: 0 } });
    g.cards['p0:mon'] = target;
    g.players[0].deck.push({ uid: 'd1', cardId: 'p0:mon', owner: 0 }, { uid: 'd2', cardId: 'p0:mon', owner: 0 });
    g = play(g, giveCard(g, 0, legend([fx({ id: 'search', target: 'self', option: 'monster' })])));
    expect(g.pending?.options.map((o) => o.id).sort()).toEqual(['d1', 'd2']);
    expect(battle.legalActions(g, 0)).toHaveLength(2);
    g = act(g, { type: 'choose', player: 0, picks: ['d2'] });
    expect(g.pending).toBeNull();
    expect(g.players[0].hand.some((c) => c.uid === 'd2')).toBe(true);
  });

  it('候補が1つなら自動で選び、0なら何も起きない', () => {
    let g = rich(startGame());
    g.players[0].discard = [{ uid: 'x1', cardId: g.players[0].hand[0]!.cardId, owner: 0 }];
    g = play(g, giveCard(g, 0, legend([fx({ id: 'recall', target: 'self' })])));
    expect(g.pending).toBeNull();
    expect(g.players[0].hand.some((c) => c.uid === 'x1')).toBe(true);
    g.players[0].discard = [];
    g = play(g, giveCard(g, 0, legend([fx({ id: 'recall', target: 'self' })])));
    expect(g.log.some((e) => e.text.includes('選べるものがない'))).toBe(true);
  });

  it('選択中は他の行動ができない', () => {
    let g = rich(startGame());
    g = play(g, giveCard(g, 0, legend([fx({ id: 'duplicate', target: 'self' })])));
    expect(g.pending).not.toBeNull();
    expect(actError(g, { type: 'endTurn', player: 0 })).toBe('選択の途中です');
  });

  it('複製（残らない）：コピーは使うと除外、ターン終了でも除外', () => {
    let g = rich(startGame());
    const orig = giveCard(g, 0, legend([fx({ id: 'shield', value: 1, target: 'self' })]));
    g = play(g, giveCard(g, 0, legend([fx({ id: 'duplicate', target: 'self' })])));
    g = act(g, { type: 'choose', player: 0, picks: [orig] });
    const copy = g.players[0].hand.find((c) => c.copy === 'temp')!;
    expect(copy.cardId).toBe(g.players[0].hand.find((c) => c.uid === orig)!.cardId);
    g = play(g, copy.uid);
    expect(g.players[0].exile.some((c) => c.uid === copy.uid)).toBe(true);
  });

  it('複製（残る）：コピーは捨て札に行き、この試合のデッキに残る', () => {
    let g = rich(startGame());
    const orig = giveCard(g, 0, legend([fx({ id: 'shield', value: 1, target: 'self' })]));
    g = play(g, giveCard(g, 0, legend([fx({ id: 'duplicate', target: 'self', option: 'keep' })])));
    g = act(g, { type: 'choose', player: 0, picks: [orig] });
    const copy = g.players[0].hand.find((c) => c.copy === 'keep')!;
    g = play(g, copy.uid);
    expect(g.players[0].discard.some((c) => c.uid === copy.uid)).toBe(true);
  });

  it('蘇生：捨て札のコストN以下のモンスターを召喚扱いで出す（召喚時の効果も発動）', () => {
    let g = rich(startGame());
    const mon = card({ id: 'rv', rarity: 'legend', cost: 2, stats: { attack: 2, hp: 2, defense: 0 }, effects: [fx({ id: 'shield', value: 5, timing: 'summon', target: 'self' })] });
    g.cards['p0:rv'] = mon;
    g.players[0].discard = [{ uid: 'r1', cardId: 'p0:rv', owner: 0 }];
    g = play(g, giveCard(g, 0, legend([fx({ id: 'revive', value: 1, target: 'self' })])));
    expect(g.players[0].board).toHaveLength(0);
    g = play(g, giveCard(g, 0, legend([fx({ id: 'revive', value: 2, target: 'self' })])));
    expect(g.players[0].board).toHaveLength(1);
    expect(g.players[0].shield).toBe(5);
  });

  it('解除：筋力は合計をすべて消す（#41）', () => {
    let g = rich(startGame());
    g.players[1].status.strength = 6;
    g = play(g, giveCard(g, 0, legend([fx({ id: 'dispel', target: 'enemyPlayer' })])));
    expect(g.players[1].status.strength).toBe(0);
  });

  it('解除：パワーの効果は「種類＋タイミング」が同じものをまとめて消す', () => {
    let g = rich(startGame());
    g = endTurn(g);
    rich(g, 1);
    const pw = () => legend([fx({ id: 'damage', value: 1, timing: 'turnStart', target: 'enemyPlayer' })]);
    g = play(g, giveCard(g, 1, pw()));
    g = play(g, giveCard(g, 1, pw()));
    g = play(g, giveCard(g, 1, legend([fx({ id: 'shield', value: 1, timing: 'turnStart', target: 'self' })])));
    g = endTurn(g);
    rich(g, 0);
    g = play(g, giveCard(g, 0, legend([fx({ id: 'dispel', target: 'enemyPlayer' })])));
    expect(g.pending?.options.map((o) => o.label)).toEqual(['自分のターン開始時のダメージ（2つ）', '自分のターン開始時のシールド（1つ）']);
    g = act(g, { type: 'choose', player: 0, picks: [g.pending!.options[0]!.id] });
    expect(g.players[1].powers).toHaveLength(1);
  });

  it('保持：ターン終了時に手札を残せる（0枚でもよい）', () => {
    let g = rich(startGame());
    g = play(g, giveCard(g, 0, legend([fx({ id: 'retain', target: 'self' })])));
    const keep = g.players[0].hand[0]!.uid;
    g = endTurn(g);
    expect(g.pending?.max).toBe(1);
    g = act(g, { type: 'choose', player: 0, picks: [keep] });
    expect(g.players[0].hand.map((c) => c.uid)).toEqual([keep]);
    expect(g.active).toBe(1);
  });
});

describe('相手モンスターへの効果', () => {
  it('バウンス：コストN以下のモンスターだけ持ち主の手札に戻す', () => {
    let g = rich(startGame());
    const d = putMonster(g, 1, unit(3, 3));
    // コスト0以下 → コスト1のモンスターは戻せない
    g = play(g, giveCard(g, 0, legend([fx({ id: 'bounce', value: 0 })])), { enemy: M(d) });
    expect(g.players[1].hand.some((c) => c.uid === d)).toBe(false);
    expect(g.players[1].board.some((m) => m.uid === d)).toBe(true);
    expect(g.log.some((e) => e.text.includes('戻せない'))).toBe(true);
    g = play(g, giveCard(g, 0, legend([fx({ id: 'bounce', value: 1 })])), { enemy: M(d) });
    expect(g.players[1].hand.some((c) => c.uid === d)).toBe(true);
  });

  it('奪取：自分の場に移し、次の自分のターンから攻撃できる。破壊されたら元の持ち主の捨て札へ', () => {
    let g = rich(startGame());
    const d = putMonster(g, 1, unit(3, 3));
    g = play(g, giveCard(g, 0, legend([fx({ id: 'steal' })])), { enemy: M(d) });
    expect(g.players[0].board.some((m) => m.uid === d)).toBe(true);
    expect(actError(g, { type: 'attack', player: 0, attackerUid: d, target: P(1) })).toBe('場に出たターンは攻撃できません');
    g = play(g, giveCard(g, 0, legend([fx({ id: 'wipe', target: 'board' })])));
    expect(g.players[1].discard.some((c) => c.uid === d)).toBe(true);
  });

  it('処刑：体力N以下だけ破壊', () => {
    let g = rich(startGame());
    const a = putMonster(g, 1, unit(1, 2));
    const b = putMonster(g, 1, unit(1, 5));
    g = play(g, giveCard(g, 0, legend([fx({ id: 'execute', value: 3, target: 'enemyMonsters' })])));
    expect(monster(g, a)).toBeUndefined();
    expect(monster(g, b)).toBeDefined();
  });

  it('弱化・攻撃力は0未満にならない、守備力アップは3まで', () => {
    let g = rich(startGame());
    const d = putMonster(g, 1, unit(2, 5));
    const mine = putMonster(g, 0, unit(1, 5));
    g = play(g, giveCard(g, 0, legend([fx({ id: 'weaken', value: 5 })])), { enemy: M(d) });
    expect(monster(g, d)!.attack).toBe(0);
    g = play(g, giveCard(g, 0, legend([fx({ id: 'defenseUp', value: 3 })])), { ally: mine });
    g = play(g, giveCard(g, 0, legend([fx({ id: 'defenseUp', value: 3 })])), { ally: mine });
    expect(monster(g, mine)!.defense).toBe(3);
  });
});

describe('リソース系', () => {
  it('貯金・エナジー妨害・ドロー妨害は次のターンに効く', () => {
    let g = rich(startGame());
    g = play(g, giveCard(g, 0, legend([fx({ id: 'drawJam', target: 'enemyPlayer' }), fx({ id: 'energyJam', target: 'enemyPlayer' }), fx({ id: 'savings', value: 2, target: 'self' })])));
    g = endTurn(g);
    // 後攻の1ターン目の基本（3＋後攻の補正）から、エナジー妨害で1減る
    expect(g.players[1].energy).toBe(3 + BALANCE.battle.secondPlayerFirstTurnBonusEnergy - 1);
    g = endTurn(g);
    expect(g.players[0].energy).toBe(5);
    g = endTurn(g);
    expect(g.players[1].hand).toHaveLength(5); // ドロー妨害は後攻1ターン目の配り札には効かず持ち越さない
  });

  it('軽減：重ねた分だけ次の1枚が安くなり（最低0）、使うまで残る', () => {
    let g = rich(startGame());
    g = play(g, giveCard(g, 0, legend([fx({ id: 'discount', target: 'self' }), fx({ id: 'discount', target: 'self' })])));
    const c = giveCard(g, 0, card({ id: 'c3', rarity: 'common', cost: 3, effects: [fx({ id: 'damage', value: 1 })] }));
    expect(battle.playInfo(g, 0, g.players[0].hand.find((x) => x.uid === c)!).cost).toBe(1);
  });

  it('ノイズ投入：相手の山札に混ざる', () => {
    let g = rich(startGame());
    const before = g.players[1].deck.length;
    g = play(g, giveCard(g, 0, legend([fx({ id: 'noise', value: 3, target: 'enemyPlayer' })])));
    expect(g.players[1].deck.length).toBe(before + 3);
    expect(g.players[1].deck.filter((c) => c.cardId === battle.NOISE_CARD_ID)).toHaveLength(3);
  });
});

describe('すべての効果が対戦で処理できる', () => {
  it.each(listEffects().map((d) => [d.id, d] as const))('%s', (_id, def) => {
    let g = rich(startGame());
    const mine = putMonster(g, 0, unit(2, 6));
    const theirs = putMonster(g, 1, unit(2, 6));
    g.players[0].discard.push({ uid: 'disc', cardId: `p0:${g.players[0].board[0]!.card.cardId.split(':')[1]}`, owner: 0 });
    g.players[1].status.strength = 1;
    // HP交換（MTG 要素 △ バッチC）は自分のHPが相手より少ないときだけ使える
    if (def.id === 'swapHp') g.players[0].hp = 10;
    const effect = fx({ id: def.id, value: def.value?.default, hits: def.hits?.default, target: 'chosen' });
    const targets = battle.legalActions(g, 0);
    void targets;
    const rule = def.targetRule;
    effect.target = rule === 'self' ? 'self' : rule === 'enemyPlayer' ? 'enemyPlayer' : rule === 'board' ? 'board' : 'chosen';
    const c = giveCard(g, 0, legend([effect]));
    const chosen =
      rule === 'allyMonsterOne' ? { ally: mine } : rule === 'fight' ? { ally: mine, enemy: M(theirs) } : effect.target === 'chosen' ? { enemy: M(theirs) } : {};
    g = play(g, c, chosen);
    if (g.pending) g = act(g, { type: 'choose', player: 0, picks: g.pending.options.slice(0, Math.max(1, g.pending.min)).map((o) => o.id) });
    expect(g.pending).toBeNull();
    expect(g.log.some((e) => e.text.includes('undefined'))).toBe(false);
  });
});
