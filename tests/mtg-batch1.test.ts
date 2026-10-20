// MTG 要素の採用：バッチ1（条件12・タイミング5・対象3・修飾3）。倍率1で確かめる
import { describe, expect, it } from 'vitest';
import {
  ai,
  analyzeCard,
  allowedTargets,
  BALANCE,
  battle,
  CONDITION_GROUPS,
  CONDITIONS,
  conditionsFor,
  describeEffect,
  fitEffect,
  modifiersFor,
  getEffect,
  TIMING_GROUPS,
  TIMINGS,
  type CardDef,
  type ConditionId,
  type EffectInstance,
} from '../src/engine/index.ts';
import { checkCondition } from '../src/engine/battle/conditions.ts';
import { card, codes } from './helpers.ts';
import { PRESET_DECKS } from '../src/presets.ts';
import { attack, endTurn, fx, giveCard, logText, M, monster, P, play, putMonster, rich, startGame } from './battle/helpers.ts';

type G = battle.GameState;

const MON = (name: string, a = 1, h = 5, extra: Partial<CardDef> = {}) =>
  card({ id: `mon-${name}`, name, stats: { attack: a, hp: h, defense: 0 }, ...extra });
const BOLT = card({ id: 'bolt', name: '火球', effects: [fx({ id: 'damage', value: 5 })] });
const SKILL = card({ id: 'skill', name: '薬', effects: [fx({ id: 'heal', value: 1, target: 'self' })] });
const POWER = card({ id: 'power', name: '小さな力', rarity: 'rare', effects: [fx({ id: 'shield', value: 1, timing: 'turnStart', target: 'self' })] });

const effectLine = (e: EffectInstance, extra: Partial<CardDef> = {}) =>
  analyzeCard(card({ rarity: 'legend', cost: 5, effects: [e], ...extra })).points.lines.find((l) => l.kind === 'effect')!;
const value = (e: EffectInstance, extra: Partial<CardDef> = {}) => effectLine(e, extra).value;
const STATS = { stats: { attack: 1, hp: 1, defense: 0 } };

// ---------------------------------------------------------------- 条件
describe('条件（バッチ1）', () => {
  const check = (g: G, p: battle.PlayerId, c: ConditionId) => checkCondition(g, p, c);

  it('テキストと倍率（ダメージ5＝15 × 倍率）', () => {
    const table: [ConditionId, string, number][] = [
      ['enemyDamagedThisTurn', 'このターン相手にダメージを与えていれば、', 0.6],
      ['monsterDestroyedThisTurn', 'このターンにモンスターが破壊されていれば、', 0.6],
      ['allyAttackedThisTurn', 'このターン自分のモンスターが攻撃していれば、', 0.7],
      ['loneMonster', '自分の場のモンスターが1体だけなら、', 0.7],
      ['twoPowers', '自分のパワーが2つ以上あれば、', 0.6],
      ['coinFlip', 'コインを投げて表なら、', 0.5],
      ['secondPlayer', '後攻なら、', 0.5],
      ['emptyHand', '手札がなければ、', 0.5],
      ['bigMonster', '攻撃力4以上の自分のモンスターがいれば、', 0.7],
      ['bigDiscard', '捨て札が10枚以上あれば、', 0.7],
      ['monsterInHand', '手札にモンスターカードがあれば、', 0.8],
      ['twoSummonsThisTurn', 'このターンにモンスターを2体以上出していれば、', 0.5],
    ];
    for (const [id, prefix, rate] of table) {
      expect(BALANCE.condition[id]).toBe(rate);
      const e = fx({ id: 'damage', value: 5, condition: id });
      expect(describeEffect(e)).toBe(`${prefix}相手1体に5ダメージを与える。`);
      expect(value(e)).toBe(Math.ceil(15 * rate - 1e-9));
    }
  });

  it('すべての条件に見出し（group）と説明（description）があり、見出しの順に並ぶ', () => {
    for (const c of Object.values(CONDITIONS)) {
      expect(CONDITION_GROUPS).toContain(c.group);
      expect(c.description.length).toBeGreaterThan(0);
    }
    const list = conditionsFor('play', 'spell');
    const groups = list.map((id) => CONDITION_GROUPS.indexOf(CONDITIONS[id].group));
    expect(groups).toEqual([...groups].sort((a, b) => a - b));
  });

  it('選べないタイミング（満たせない・常に満たす）', () => {
    expect(conditionsFor('turnStart', 'monster')).not.toContain('enemyDamagedThisTurn');
    expect(conditionsFor('hitEnemyPlayer', 'monster')).not.toContain('enemyDamagedThisTurn');
    expect(conditionsFor('turnEnd', 'spell')).toContain('enemyDamagedThisTurn');
    expect(conditionsFor('destroyed', 'monster')).not.toContain('monsterDestroyedThisTurn');
    expect(conditionsFor('allyDestroyed', 'spell')).not.toContain('monsterDestroyedThisTurn');
    expect(conditionsFor('attack', 'monster')).not.toContain('allyAttackedThisTurn');
    expect(conditionsFor('turnStart', 'spell')).not.toContain('emptyHand');
    expect(conditionsFor('turnStart', 'spell')).not.toContain('twoSummonsThisTurn');
    expect(conditionsFor('turnStart', 'spell')).toEqual(expect.arrayContaining(['coinFlip', 'secondPlayer', 'bigDiscard', 'loneMonster']));
    const bad = analyzeCard(card({ rarity: 'legend', stats: { attack: 1, hp: 1, defense: 0 }, effects: [fx({ id: 'heal', target: 'self', value: 1, timing: 'attack', condition: 'allyAttackedThisTurn' })] }));
    expect(codes(bad.violations)).toContain('EFFECT_CONDITION');
  });

  it('このターン相手にダメージを与えた：自分のターンで相手のHPが減ったときだけ。相手のターンでは偽', () => {
    let g = rich(startGame());
    expect(check(g, 0, 'enemyDamagedThisTurn')).toBe(false);
    g = play(g, giveCard(g, 0, BOLT), { enemy: P(1) });
    expect(check(g, 0, 'enemyDamagedThisTurn')).toBe(true);
    expect(check(g, 1, 'enemyDamagedThisTurn')).toBe(false);
    g = endTurn(g);
    expect(check(g, 0, 'enemyDamagedThisTurn')).toBe(false);
    expect(check(g, 1, 'enemyDamagedThisTurn')).toBe(false);
  });

  it('シールドで0なら「相手にダメージを与えた」にならない', () => {
    let g = rich(startGame());
    g.players[1].shield = 10;
    g = play(g, giveCard(g, 0, BOLT), { enemy: P(1) });
    expect(check(g, 0, 'enemyDamagedThisTurn')).toBe(false);
  });

  it('このターンにモンスターが破壊された：敵味方どちらでも。相手のターンでは、そのターンの記録を見る', () => {
    let g = rich(startGame());
    const weak = putMonster(g, 1, MON('的', 0, 1));
    expect(check(g, 0, 'monsterDestroyedThisTurn')).toBe(false);
    g = play(g, giveCard(g, 0, BOLT), { enemy: M(weak) });
    expect(check(g, 0, 'monsterDestroyedThisTurn')).toBe(true);
    expect(check(g, 1, 'monsterDestroyedThisTurn')).toBe(true);
    g = endTurn(g);
    expect(check(g, 0, 'monsterDestroyedThisTurn')).toBe(false);
    rich(g, 1);
    const mine = putMonster(g, 0, MON('味方', 0, 1));
    g = play(g, giveCard(g, 1, BOLT), { enemy: M(mine) });
    expect(check(g, 0, 'monsterDestroyedThisTurn')).toBe(true);
  });

  it('このターン自分のモンスターが攻撃した：自分のターンだけ', () => {
    let g = startGame();
    const a = putMonster(g, 0, MON('兵', 1, 5));
    expect(check(g, 0, 'allyAttackedThisTurn')).toBe(false);
    g = attack(g, a, P(1));
    expect(check(g, 0, 'allyAttackedThisTurn')).toBe(true);
    expect(check(g, 1, 'allyAttackedThisTurn')).toBe(false);
    g = endTurn(g);
    expect(check(g, 0, 'allyAttackedThisTurn')).toBe(false);
  });

  it('場・手札・捨て札・パワー・先後の条件', () => {
    const g = startGame();
    expect(check(g, 0, 'loneMonster')).toBe(false);
    putMonster(g, 0, MON('1体目', 3));
    expect(check(g, 0, 'loneMonster')).toBe(true);
    expect(check(g, 0, 'bigMonster')).toBe(false);
    g.players[0].board[0]!.tempAttack = 1; // 実効攻撃力は攻撃力＋一時強化
    expect(check(g, 0, 'bigMonster')).toBe(true);
    putMonster(g, 0, MON('2体目', 4));
    expect(check(g, 0, 'loneMonster')).toBe(false);

    expect(check(g, 0, 'twoPowers')).toBe(false);
    for (let i = 0; i < 2; i++) g.players[0].powers.push({ uid: `pw${i}`, cardId: 'x', name: '力', effects: [], drawbacks: [] });
    expect(check(g, 0, 'twoPowers')).toBe(true);

    expect(check(g, 0, 'secondPlayer')).toBe(false);
    expect(check(g, 1, 'secondPlayer')).toBe(true);

    expect(check(g, 0, 'monsterInHand')).toBe(false);
    giveCard(g, 0, MON('手札の獣'));
    expect(check(g, 0, 'monsterInHand')).toBe(true);
    expect(check(g, 0, 'emptyHand')).toBe(false);
    g.players[0].hand = [];
    expect(check(g, 0, 'emptyHand')).toBe(true);

    expect(check(g, 0, 'bigDiscard')).toBe(false);
    g.players[0].discard = g.players[0].deck.splice(0, 10);
    expect(check(g, 0, 'bigDiscard')).toBe(true);
  });

  it('このターンにモンスターを2体以上出した：出したモンスター自身も数える', () => {
    let g = rich(startGame());
    g = play(g, giveCard(g, 0, MON('a')));
    expect(check(g, 0, 'twoSummonsThisTurn')).toBe(false);
    const healer = MON('b', 1, 5, { effects: [fx({ id: 'heal', value: 3, timing: 'summon', target: 'self', condition: 'twoSummonsThisTurn' })] });
    g.players[0].hp = 100;
    g = play(g, giveCard(g, 0, healer));
    expect(check(g, 0, 'twoSummonsThisTurn')).toBe(true);
    expect(g.players[0].hp).toBe(103);
    g = endTurn(g);
    expect(check(g, 0, 'twoSummonsThisTurn')).toBe(false);
  });

  it('コイン投げ：解決のたびに state の乱数で投げ、ログに残る。同じシードなら同じ結果。注意の表示では投げない', () => {
    const coin = card({ id: 'coin', name: 'コイン', effects: [fx({ id: 'heal', value: 7, target: 'self', condition: 'coinFlip' })] });
    const run = () => {
      let g = rich(startGame({ seed: 5 }));
      g.players[0].hp = 50;
      const uid = giveCard(g, 0, coin);
      const rng = g.rng;
      // 注意の表示（playInfo）は乱数を進めない
      battle.playInfo(g, 0, g.players[0].hand.find((c) => c.uid === uid)!);
      expect(g.rng).toBe(rng);
      g = play(g, uid);
      return g;
    };
    const a = run();
    const b = run();
    expect(a.players[0].hp).toBe(b.players[0].hp);
    const line = a.log.find((e) => e.text.startsWith('コイン投げ：'));
    expect(line?.ev).toMatchObject({ kind: 'status', status: 'coin' });
    expect(a.players[0].hp).toBe(line!.text === 'コイン投げ：表' ? 57 : 50);
    // 何回も投げると表も裏も出る
    const results = new Set<string>();
    let g = rich(startGame({ seed: 9 }), 0, 99);
    for (let i = 0; i < 12; i++) g = play(g, giveCard(g, 0, coin));
    for (const e of g.log) if (e.text.startsWith('コイン投げ：')) results.add(e.text);
    expect(results).toEqual(new Set(['コイン投げ：表', 'コイン投げ：裏']));
  });
});

// ---------------------------------------------------------------- タイミング
describe('タイミング（バッチ1）', () => {
  it('倍率：モンスターとパワーで違う。「相手プレイヤーにダメージを与えたとき」は二回攻撃で2倍', () => {
    const up = (timing: EffectInstance['timing'], stats = false, kw: CardDef['keywords'] = []) =>
      value(fx({ id: 'attackUp', value: 1, timing, target: 'random' }), stats ? { ...STATS, keywords: kw } : {});
    // 攻撃力アップ1＝3、ランダム ×0.6
    expect(up('allySummoned', true)).toBe(3); // 3×1.5×0.6＝2.7 → 3
    expect(up('allySummoned')).toBe(9); // 3×5.0×0.6
    expect(up('allyDestroyed', true)).toBe(3); // 2.16 → 3
    expect(up('allyDestroyed')).toBe(8); // 7.2 → 8
    expect(up('powerPlayed', true)).toBe(2); // 1.8 → 2
    expect(up('powerPlayed')).toBe(6); // 5.4 → 6
    expect(up('skillPlayed', true)).toBe(3); // 2.7 → 3
    expect(up('skillPlayed')).toBe(9); // 8.1 → 9
    expect(up('hitEnemyPlayer', true)).toBe(3); // 2.7 → 3
    expect(up('hitEnemyPlayer', true, [{ id: 'doubleAttack' }])).toBe(6); // 3×1.5×2×0.6＝5.4 → 6
    expect(effectLine(fx({ id: 'attackUp', value: 1, timing: 'hitEnemyPlayer', target: 'random' }), { ...STATS, keywords: [{ id: 'doubleAttack' }] }).formula).toContain('1.5×2');
  });

  it('テキストと見出し', () => {
    const t = (timing: EffectInstance['timing'], target: EffectInstance['target'] = 'random') => describeEffect(fx({ id: 'attackUp', value: 1, timing, target }));
    expect(t('allySummoned', 'chosen')).toBe('自分のモンスターが出るたび、出たモンスターの攻撃力を+1する。');
    expect(t('allyDestroyed')).toBe('自分の他のモンスターが破壊されるたび、ランダムな自分のモンスター1体の攻撃力を+1する。');
    expect(t('powerPlayed')).toBe('自分がパワーを使うたび、ランダムな自分のモンスター1体の攻撃力を+1する。');
    expect(t('skillPlayed', 'thisMonster')).toBe('自分がスキルを使うたび、このモンスターの攻撃力を+1する。');
    expect(t('hitEnemyPlayer', 'allyMonsters')).toBe('相手プレイヤーにダメージを与えるたび、自分のモンスター全体の攻撃力を+1する。');
    for (const def of Object.values(TIMINGS)) {
      expect(TIMING_GROUPS).toContain(def.group);
      expect(def.description.length).toBeGreaterThan(0);
    }
  });

  const powerCard = (timing: EffectInstance['timing'], e: Partial<EffectInstance> & { id: string }) =>
    card({ id: `pw-${timing}-${e.id}`, name: `${TIMINGS[timing].label}の力`, rarity: 'legend', effects: [fx({ timing, ...e })] });

  it('自分のモンスターが出るたび：出たモンスターに効く。1つにつき1ターン2回まで', () => {
    let g = rich(startGame());
    g = play(g, giveCard(g, 0, powerCard('allySummoned', { id: 'attackUp', value: 1, target: 'chosen' })));
    expect(g.players[0].powers).toHaveLength(1);
    for (let i = 0; i < 3; i++) g = play(g, giveCard(g, 0, MON(`兵${i}`, 1, 2)));
    expect(g.players[0].board.map((m) => m.attack)).toEqual([2, 2, 1]);
    expect(logText(g)).toContain(`「自分のモンスターが出るたび」はこのターンもう発動しない（1ターン${BALANCE.battle.maxRepeatTriggersPerTurn}回まで）`);
    // 次のターン（相手のターンも通算ターン）で数え直す
    g = endTurn(g);
    g = endTurn(g);
    rich(g, 0);
    g = play(g, giveCard(g, 0, MON('兵3', 1, 2)));
    expect(g.players[0].board.at(-1)!.attack).toBe(2);
  });

  it('自分のモンスターが出るたび（モンスター）：自分自身では発動しない。奪取は入場ではない。封印されていれば発動しない', () => {
    const watcher = MON('見張り', 1, 5, { effects: [fx({ id: 'attackUp', value: 1, timing: 'allySummoned', target: 'thisMonster' })] });
    let g = rich(startGame());
    g = play(g, giveCard(g, 0, watcher));
    const w = g.players[0].board[0]!.uid;
    expect(monster(g, w)!.attack).toBe(1);
    g = play(g, giveCard(g, 0, MON('仲間')));
    expect(monster(g, w)!.attack).toBe(2);
    // 奪取
    const victim = putMonster(g, 1, MON('敵'));
    const thief = card({ id: 'thief', name: '奪取', rarity: 'legend', effects: [fx({ id: 'steal', target: 'chosen' })] });
    g = play(g, giveCard(g, 0, thief), { enemy: M(victim) });
    expect(monster(g, victim)!.controller).toBe(0);
    expect(monster(g, w)!.attack).toBe(2);
    // 封印
    monster(g, w)!.sealed = true;
    g = endTurn(g);
    g = endTurn(g);
    rich(g, 0);
    g = play(g, giveCard(g, 0, MON('仲間2')));
    expect(monster(g, w)!.attack).toBe(2);
  });

  it('自分の他のモンスターが破壊されるたび：自分自身では発動しない。全体破壊でいっしょに消えたものは発動しない', () => {
    const mourner = MON('喪主', 1, 5, { effects: [fx({ id: 'heal', value: 4, timing: 'allyDestroyed', target: 'self' })] });
    let g = rich(startGame());
    g.players[0].hp = 100;
    const a = putMonster(g, 0, mourner);
    const b = putMonster(g, 0, MON('盾', 0, 1));
    // 相手の効果で破壊されても発動する（相手のターン）
    g = endTurn(g);
    rich(g, 1);
    g = play(g, giveCard(g, 1, BOLT), { enemy: M(b) });
    expect(g.players[0].hp).toBe(104);
    // 自分自身が破壊されても発動しない
    g = play(g, giveCard(g, 1, card({ id: 'big', name: '大火球', effects: [fx({ id: 'damage', value: 9 })] })), { enemy: M(a) });
    expect(monster(g, a)).toBeUndefined();
    expect(g.players[0].hp).toBe(104);
    // 全体破壊
    let h = rich(startGame());
    h.players[0].hp = 100;
    putMonster(h, 0, mourner);
    putMonster(h, 0, MON('盾', 0, 1));
    const wipe = card({ id: 'wipe', name: '全体破壊', rarity: 'legend', effects: [fx({ id: 'wipe', target: 'board' })] });
    h = play(h, giveCard(h, 0, wipe));
    expect(h.players[0].board).toHaveLength(0);
    expect(h.players[0].hp).toBe(100);
  });

  it('自分がパワーを使うたび・スキルを使うたび：種類で分かれる。そのパワー自身では発動しない', () => {
    const fan = MON('ファン', 1, 5, {
      effects: [
        fx({ id: 'shield', value: 2, timing: 'powerPlayed', target: 'self' }),
        fx({ id: 'attackUp', value: 1, timing: 'skillPlayed', target: 'thisMonster' }),
      ],
    });
    let g = rich(startGame());
    const f = putMonster(g, 0, fan);
    g = play(g, giveCard(g, 0, SKILL));
    expect(monster(g, f)!.attack).toBe(2);
    expect(g.players[0].shield).toBe(0);
    g = play(g, giveCard(g, 0, BOLT), { enemy: P(1) }); // アタックはスキルではない
    expect(monster(g, f)!.attack).toBe(2);
    g = play(g, giveCard(g, 0, POWER));
    expect(g.players[0].shield).toBe(2);
    // パワーの「パワーを使うたび」は、そのパワー自身では発動しない
    const echo = powerCard('powerPlayed', { id: 'shield', value: 3, target: 'self' });
    g = play(g, giveCard(g, 0, echo));
    expect(g.players[0].shield).toBe(4); // ファンの+2だけ
    // ファンはこのターン3回目なので発動しない（1ターン2回まで）。パワーの方は1回目
    g = play(g, giveCard(g, 0, POWER));
    expect(g.players[0].shield).toBe(4 + 3);
    expect(logText(g)).toContain('「ファン」の「自分がパワーを使うたび」はこのターンもう発動しない');
  });

  it('相手プレイヤーにダメージを与えたとき：顔へのダメージ・貫通の余り。シールドで0・モンスターへの攻撃では発動しない', () => {
    const viper = MON('毒蛇', 2, 5, { effects: [fx({ id: 'poison', value: 1, timing: 'hitEnemyPlayer', target: 'enemyPlayer' })] });
    let g = startGame();
    const v = putMonster(g, 0, viper);
    g.players[1].shield = 2;
    g = attack(g, v, P(1));
    expect(g.players[1].status.poison).toBe(0);
    g = endTurn(g);
    g = endTurn(g);
    g = attack(g, v, P(1));
    expect(g.players[1].status.poison).toBe(1);
    // モンスターへの攻撃
    g = endTurn(g);
    g = endTurn(g);
    const wall = putMonster(g, 1, MON('壁', 0, 9));
    g = attack(g, v, M(wall));
    expect(g.players[1].status.poison).toBe(0); // ターン開始時に半減して0
    // 貫通の余り
    const rhino = MON('サイ', 5, 9, { keywords: [{ id: 'trample' }], effects: [fx({ id: 'poison', value: 2, timing: 'hitEnemyPlayer', target: 'enemyPlayer' })] });
    let h = startGame();
    const r = putMonster(h, 0, rhino);
    const small = putMonster(h, 1, MON('小物', 0, 1));
    h = attack(h, r, M(small));
    expect(h.players[1].status.poison).toBe(2);
  });
});

// ---------------------------------------------------------------- 対象
describe('対象（バッチ1）', () => {
  it('allowedTargets の表（自分のモンスター1体に作用する効果）', () => {
    // ○ バッチAで「自分の他のモンスター全体」（モンスターのカードだけ）と「いちばん体力の低い自分のモンスター」が増えた
    expect(allowedTargets('allyMonsterOne', 'summon', 'monster')).toEqual(['chosen', 'random', 'thisMonster', 'allyMonsters', 'otherAllies', 'weakestAlly']);
    expect(allowedTargets('allyMonsterOne', 'destroyed', 'monster')).toEqual(['random', 'allyMonsters', 'otherAllies', 'weakestAlly']);
    expect(allowedTargets('allyMonsterOne', 'play', 'spell')).toEqual(['chosen', 'random', 'allyMonsters', 'weakestAlly']);
    expect(allowedTargets('allyMonsterOne', 'turnEnd', 'spell')).toEqual(['random', 'allyMonsters', 'weakestAlly']);
    expect(allowedTargets('allyMonsterOne', 'turnEnd', 'monster')).toEqual(['random', 'thisMonster', 'allyMonsters', 'otherAllies', 'weakestAlly']);
    expect(allowedTargets('allyMonsterOne', 'allySummoned', 'spell')).toEqual(['chosen', 'random', 'allyMonsters', 'weakestAlly']);
    // 土台を渡さないとき：モンスター専用のタイミングならモンスター
    expect(allowedTargets('allyMonsterOne', 'attack')).toContain('thisMonster');
    expect(allowedTargets('allyMonsterOne', 'turnEnd')).not.toContain('thisMonster');
    // 相手側の効果は「出たモンスター」を選べない
    expect(allowedTargets('enemyAny', 'allySummoned')).toEqual(['enemyPlayer', 'random', 'enemyMonsters', 'enemyAll', 'everyone']);
    expect(allowedTargets('enemyMonsterOne', 'allySummoned')).toEqual(['random']);
  });

  it('このモンスター：破壊されたときは選べない（違反）。モンスター以外のカードでも選べない', () => {
    const bad = analyzeCard(card({ rarity: 'legend', ...STATS, effects: [fx({ id: 'attackUp', value: 1, timing: 'destroyed', target: 'thisMonster' })] }));
    expect(codes(bad.violations)).toContain('EFFECT_TARGET');
    const spell = analyzeCard(card({ rarity: 'legend', effects: [fx({ id: 'attackUp', value: 1, target: 'thisMonster' })] }));
    expect(codes(spell.violations)).toContain('EFFECT_TARGET');
    expect(fitEffect(fx({ id: 'attackUp', value: 1, timing: 'destroyed', target: 'thisMonster' }), 'monster').target).toBe('random');
  });

  it('倍率とテキスト：このモンスター ×1.0、自分のモンスター全体 ×2.0', () => {
    expect(value(fx({ id: 'attackUp', value: 2, timing: 'summon', target: 'thisMonster' }), STATS)).toBe(6);
    expect(value(fx({ id: 'attackUp', value: 2, timing: 'summon', target: 'allyMonsters' }), STATS)).toBe(12);
    expect(describeEffect(fx({ id: 'attackUp', value: 2, timing: 'summon', target: 'thisMonster' }))).toBe('召喚時、このモンスターの攻撃力を+2する。');
    expect(describeEffect(fx({ id: 'repair', value: 2, target: 'allyMonsters' }))).toBe('自分のモンスター全体の体力を2回復する。');
  });

  it('対戦：このモンスターは自分自身、自分のモンスター全体は自分自身を含む', () => {
    let g = rich(startGame());
    const other = putMonster(g, 0, MON('先輩', 1, 5));
    g = play(g, giveCard(g, 0, MON('鍛える', 1, 5, { effects: [fx({ id: 'attackUp', value: 2, timing: 'summon', target: 'thisMonster' })] })));
    expect(g.players[0].board.map((m) => m.attack)).toEqual([1, 3]);
    g = play(g, giveCard(g, 0, MON('号令', 1, 5, { effects: [fx({ id: 'attackUp', value: 1, timing: 'summon', target: 'allyMonsters' })] })));
    expect(g.players[0].board.map((m) => m.attack)).toEqual([2, 4, 2]);
    expect(monster(g, other)!.attack).toBe(2);
  });
});

// ---------------------------------------------------------------- 修飾
describe('修飾（数値の倍数。バッチ1）', () => {
  const X = card({ id: 'x-bolt', name: '全力の火球', effects: [fx({ id: 'damage', value: 5, mods: ['xEnergy'] })] });

  it('テキスト・ポイント（基礎 × (1＋上乗せ率)）', () => {
    expect(describeEffect(X.effects[0]!)).toBe('残りのエナジーをすべて使い、相手1体に5ダメージを与える（数値は使ったエナジー1につき）。');
    expect(describeEffect(fx({ id: 'heal', value: 2, target: 'self', mods: ['perEnemyMonster'] }))).toBe('HPを2回復する（数値は相手モンスター1体につき、最大3体）。');
    expect(describeEffect(fx({ id: 'draw', value: 1, target: 'self', mods: ['perCardPlayed'] }))).toBe('カードを1枚引く（数値はこのターン使ったカード1枚につき、最大3枚）。');
    expect(describeEffect(fx({ id: 'damage', value: 5, mods: ['pierce', 'xEnergy'] }))).toBe('残りのエナジーをすべて使い、相手1体に防御無視の5ダメージを与える（数値は使ったエナジー1につき）。');
    expect(value(fx({ id: 'damage', value: 5, mods: ['xEnergy'] }))).toBe(18);
    expect(value(fx({ id: 'damage', value: 5, mods: ['perEnemyMonster'] }))).toBe(30); // 15×2（#89 で 0.5→1.0）
    expect(value(fx({ id: 'damage', value: 5, mods: ['perCardPlayed'] }))).toBe(27);
    expect(value(fx({ id: 'damage', value: 5, mods: ['pierce', 'xEnergy'] }))).toBe(24); // 15×1.6
  });

  it('付けられる効果・タイミング・数（validate のコード）', () => {
    const v = (e: EffectInstance, extra: Partial<CardDef> = {}) => codes(analyzeCard(card({ rarity: 'legend', cost: 5, effects: [e], ...extra })).violations);
    expect(v(fx({ id: 'damage', value: 5, mods: ['xEnergy'] }))).toEqual([]);
    expect(v(fx({ id: 'damage', value: 1, mods: ['xEnergy', 'perEnemyMonster'] }))).toContain('EFFECT_MODS_SCALE_MULTI');
    expect(v(fx({ id: 'execute', value: 1, mods: ['xEnergy'] }))).toContain('EFFECT_MODS_SCALE');
    expect(v(fx({ id: 'heal', value: 1, target: 'self', mods: ['pierce'] }))).toContain('EFFECT_MODS');
    expect(v(fx({ id: 'damage', value: 1, timing: 'attack', mods: ['xEnergy'] }), STATS)).toContain('EFFECT_MODS_TIMING');
    expect(v(fx({ id: 'heal', value: 1, target: 'self', timing: 'turnStart', mods: ['perCardPlayed'] }))).toContain('EFFECT_MODS_TIMING');
    expect(v(fx({ id: 'heal', value: 1, target: 'self', timing: 'turnStart', mods: ['perEnemyMonster'] }))).toEqual([]);
    // エディター用：付けられるものだけ
    // ○ バッチAで「捨て札のモンスター1枚につき」と遅延「次のターンに」（使用時・召喚時、ほとんどの効果）が増えた
    expect(modifiersFor(getEffect('damage')!, 'play').map((m) => m.id)).toEqual(['pierce', 'drain', 'xEnergy', 'perEnemyMonster', 'perCardPlayed', 'perDiscardMonster', 'nextTurn']);
    expect(modifiersFor(getEffect('heal')!, 'turnStart').map((m) => m.id)).toEqual(['perEnemyMonster', 'perDiscardMonster']);
    expect(modifiersFor(getEffect('execute')!, 'play').map((m) => m.id)).toEqual(['nextTurn']);
    // fitEffect は付けられないものを外し、数値の倍数を1つにする
    expect(fitEffect(fx({ id: 'damage', value: 1, mods: ['xEnergy', 'perEnemyMonster'] }), 'spell').mods).toEqual(['perEnemyMonster']);
    expect(fitEffect(fx({ id: 'damage', value: 1, timing: 'attack', mods: ['pierce', 'xEnergy'] }), 'monster').mods).toEqual(['pierce']);
  });

  it('X：残りのエナジーをすべて使い、数値に掛ける', () => {
    let g = startGame();
    g.players[0].energy = 4;
    g = play(g, giveCard(g, 0, X), { enemy: P(1) });
    expect(g.players[0].energy).toBe(0);
    expect(g.players[1].hp).toBe(BALANCE.battle.playerHp - 15);
    expect(logText(g)).toContain('X＝3（エナジーをすべて使った）');
    expect(logText(g)).toContain('X＝3：数値 5×3 → 15');
  });

  it('X＝0 なら不発。値は入力欄の上限で頭打ち', () => {
    let g = startGame();
    g.players[0].energy = 1;
    g = play(g, giveCard(g, 0, X), { enemy: P(1) });
    expect(g.players[1].hp).toBe(BALANCE.battle.playerHp);
    expect(logText(g)).toContain('X＝0：数値が0のため不発');

    let h = startGame();
    h.players[0].energy = 6;
    const big = card({ id: 'x-big', name: '大全力', effects: [fx({ id: 'damage', value: 10, mods: ['xEnergy'] })] });
    h = play(h, giveCard(h, 0, big), { enemy: P(1) });
    expect(h.players[1].hp).toBe(BALANCE.battle.playerHp - BALANCE.params.damagePerCardMax);
  });

  it('相手モンスター1体につき：最大3体。いなければ不発', () => {
    const heal = card({ id: 'pem', name: '数の癒し', effects: [fx({ id: 'heal', value: 2, target: 'self', mods: ['perEnemyMonster'] })] });
    let g = rich(startGame());
    g.players[0].hp = 50;
    g = play(g, giveCard(g, 0, heal));
    expect(g.players[0].hp).toBe(50);
    for (let i = 0; i < 4; i++) putMonster(g, 1, MON(`敵${i}`));
    g = play(g, giveCard(g, 0, heal));
    expect(g.players[0].hp).toBe(56);
  });

  it('このターン使ったカード1枚につき：使用時はこのカードも数える。最大3枚', () => {
    const heal = card({ id: 'pcp', name: '連鎖の癒し', effects: [fx({ id: 'heal', value: 2, target: 'self', mods: ['perCardPlayed'] })] });
    let g = rich(startGame());
    g.players[0].hp = 50;
    g = play(g, giveCard(g, 0, heal));
    expect(g.players[0].hp).toBe(52);
    g = play(g, giveCard(g, 0, heal));
    expect(g.players[0].hp).toBe(56);
    g = play(g, giveCard(g, 0, heal));
    g = play(g, giveCard(g, 0, heal));
    expect(g.players[0].hp).toBe(56 + 6 + 6);
  });

  it('CPU は X のカードを、ほかに得になるカードがあれば後に回す', () => {
    let g = startGame();
    g.players[0].hand = [];
    g.players[0].energy = 3;
    const xUid = giveCard(g, 0, X);
    const otherUid = giveCard(g, 0, BOLT);
    expect(battle.legalActions(g, 0).some((a) => a.type === 'playCard' && a.cardUid === xUid)).toBe(true);
    const choice = ai.cpuAction(g, 0, 1, 'normal');
    expect(choice.type === 'playCard' ? choice.cardUid : null).toBe(otherUid);
  });
});

// ---------------------------------------------------------------- 価格の確かめ（仕様の例）
describe('価格の確かめ（倍率1）', () => {
  it('仕様の例が作れる', () => {
    const ok = (c: CardDef) => {
      const a = analyzeCard(c);
      expect(a.violations, c.name).toEqual([]);
      return a.points.total;
    };
    expect(ok(card({ name: '追い打ち', rarity: 'common', cost: 2, effects: [fx({ id: 'damage', value: 13, condition: 'enemyDamagedThisTurn' })] }))).toBe(4); // 23.4 → 24 − 20
    expect(ok(card({ name: '全力の一撃', rarity: 'common', cost: 1, effects: [fx({ id: 'damage', value: 4, mods: ['xEnergy'] })] }))).toBe(5); // 14.4 → 15 − 10
    expect(ok(card({ name: '鼓舞の旗', rarity: 'rare', cost: 1, effects: [fx({ id: 'attackUp', value: 1, timing: 'allySummoned', target: 'chosen' })] }))).toBe(5);
    expect(analyzeCard(card({ name: '鼓舞の旗', rarity: 'rare', cost: 1, effects: [fx({ id: 'attackUp', value: 1, timing: 'allySummoned', target: 'chosen' })] })).cardType).toBe('power');
  });
});

// ---------------------------------------------------------------- CPU
describe('CPU（バッチ1の要素を詰めたデッキ）', () => {
  const m = (id: string, name: string, a: number, h: number, effects: EffectInstance[], extra: Partial<CardDef> = {}) =>
    card({ id, name, stats: { attack: a, hp: h, defense: 0 }, effects, ...extra });
  const cards: CardDef[] = [
    card({ id: 'x', name: '全力の一撃', effects: [fx({ id: 'damage', value: 4, mods: ['xEnergy'] })] }),
    card({ id: 'flag', name: '鼓舞の旗', rarity: 'rare', effects: [fx({ id: 'attackUp', value: 1, timing: 'allySummoned', target: 'chosen' })] }),
    m('viper', '毒蛇', 1, 2, [fx({ id: 'poison', value: 1, timing: 'hitEnemyPlayer', target: 'enemyPlayer' })]),
    card({ id: 'coin', name: '賭けの火球', effects: [fx({ id: 'damage', value: 6, condition: 'coinFlip' })] }),
    m('troop', '号令の兵', 2, 4, [fx({ id: 'attackUp', value: 1, timing: 'summon', target: 'allyMonsters' })], { cost: 2 }),
    m('fan', '果敢な剣士', 1, 3, [fx({ id: 'attackUp', value: 1, timing: 'skillPlayed', target: 'thisMonster' })]),
    m('mourner', '喪主', 1, 3, [fx({ id: 'draw', value: 1, timing: 'allyDestroyed', target: 'self' })]),
  ];
  const counts = { x: 4, flag: 3, viper: 5, coin: 4, troop: 5, fan: 5, mourner: 4 };

  it('カードはすべて作れる', () => {
    for (const c of cards) expect(analyzeCard(c).violations, c.name).toEqual([]);
  });

  for (const level of ['easy', 'normal'] as const) {
    it(`${ai.CPU_LEVEL_LABEL[level]}：プリセットと最後まで不正な行動なしで戦える`, () => {
      const deck = { v: 1 as const, id: 'mtg1', name: 'MTG1', entries: Object.entries(counts).map(([cardId, count]) => ({ cardId, count })) };
      const r = battle.createGame({ seed: 3, players: [{ name: 'MTG1', deck, cards }, { name: PRESET_DECKS[1]!.name, deck: PRESET_DECKS[1]!.deck, cards: PRESET_DECKS[1]!.cards }] });
      if (!r.ok) throw new Error(r.error);
      let g = r.state;
      let steps = 0;
      while (g.phase !== 'ended') {
        const p = g.phase === 'mulligan' ? (g.players[0].mulligan.done ? 1 : 0) : g.pending ? g.pending.player : g.active;
        const next = battle.applyAction(g, ai.cpuAction(g, p, steps, level));
        expect(next.ok, next.ok ? '' : next.error).toBe(true);
        if (!next.ok) return;
        g = next.state;
        expect(++steps).toBeLessThan(4000);
      }
      expect(g.result).not.toBeNull();
    });
  }
});
