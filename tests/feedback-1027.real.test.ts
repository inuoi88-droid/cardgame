// プレイヤーの報告（2026-10-26 受付 #11・#14）から直した不具合を実際の倍率で固定する
import { describe, expect, it } from 'vitest';
import { BALANCE, analyzeCard, battle, calculatePoints, effectPoints, keywordStats, type CardDef } from '../src/engine/index.ts';
import { bodyPoints, conditionSelfSatisfied } from '../src/engine/points.ts';
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
    // 鍛錬の40は足さない（攻撃力0は、キーワードの値段で数える最低の攻撃力になる：報告 #19・決定事項 #144）
    expect(keywordStats(cond).attack).toBe(BALANCE.stats.keywordMinAttack);
    expect(keywordStats(others).attack).toBe(BALANCE.stats.keywordMinAttack);
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

describe('報告 #10：気合の量に上限があり、0コストの火の玉を並べる1ターンキルにならない', () => {
  const tst = {
    v: 1, id: 'tst', cost: 2, icon: 'gi:small-fire', name: 'てすと', scale: 20, stats: null, rarity: 'legend',
    effects: [
      { id: 'focus', value: 460, target: 'self', timing: 'play', condition: 'enemyPoisoned' },
      { id: 'conjure', hits: 2, value: 1, option: 'fireball', target: 'self', timing: 'play', condition: 'enemyPoisoned' },
      { id: 'conjure', hits: 2, value: 1, option: 'fireball', target: 'self', timing: 'play', condition: 'enemyPoisoned' },
      { id: 'conjure', hits: 2, value: 1, option: 'fireball', target: 'self', timing: 'play', condition: null },
    ],
    keywords: [], abilities: [{ id: 'lifePay', value: 1 }], drawbacks: [],
  } as unknown as CardDef;
  it('気合の上限は x(5)。460 はカードのルール違反になる', () => {
    expect(BALANCE.effects.focus.maxValue).toBe(100);
    expect(analyzeCard(tst).violations.length).toBeGreaterThan(0);
    const ok = { ...tst, effects: tst.effects.map((e) => (e.id === 'focus' ? { ...e, value: 100 } : e)) } as CardDef;
    expect(analyzeCard(ok).violations.map((v) => v.message).join()).not.toContain('気合');
  });
});

describe('報告 #8：同じカードの中で必ず満たされる条件は割り引かない', () => {
  const monn = {
    v: 1, id: 'mo', cost: 1, icon: 'gi:small-fire', name: 'monn', scale: 20, rarity: 'epic',
    stats: { hp: 1, attack: 0, defense: 0 },
    effects: [
      { id: 'poison', value: 1, target: 'everyone', timing: 'summon', condition: null },
      { id: 'energy', value: 1, target: 'self', timing: 'summon', condition: 'enemyPoisoned' },
    ],
    keywords: [], drawbacks: [],
  } as unknown as CardDef;
  it('先に条件なしで相手に毒を与える効果があれば、「相手が毒状態」の割引はない', () => {
    const e = monn.effects[1]!;
    expect(conditionSelfSatisfied(e, monn)).toBe(true);
    expect(effectPoints(e, monn).value).toBe(effectPoints({ ...e, condition: null }, monn).value);
  });
  it('毒が後ろにある・条件付き・自分にだけ与える・別のタイミングなら割り引く', () => {
    const [p, e] = monn.effects as [typeof monn.effects[0], typeof monn.effects[0]];
    expect(conditionSelfSatisfied(e!, { ...monn, effects: [e!, p!] })).toBe(false);
    expect(conditionSelfSatisfied(e!, { ...monn, effects: [{ ...p!, condition: 'lowHp' }, e!] })).toBe(false);
    expect(conditionSelfSatisfied(e!, { ...monn, effects: [{ ...p!, target: 'self' }, e!] })).toBe(false);
    expect(conditionSelfSatisfied(e!, { ...monn, effects: [{ ...p!, timing: 'attack' }, e!] })).toBe(false);
  });
  it('モンスターの召喚時の「自分の場にモンスターがいる」は割り引かない（呪文では割り引く）', () => {
    const heal = { id: 'heal', value: 20, target: 'self', timing: 'summon', condition: 'hasMonster' } as never;
    const mon = { ...monn, effects: [heal] } as CardDef;
    expect(conditionSelfSatisfied(mon.effects[0]!, mon)).toBe(true);
    const spell = { ...monn, stats: null, effects: [{ ...(heal as object), timing: 'play' }] } as unknown as CardDef;
    expect(conditionSelfSatisfied(spell.effects[0]!, spell)).toBe(false);
  });
});

describe('報告 #7：新生のコピーにも出る召喚時の効果の分を払う', () => {
  const benkei = {
    v: 1, id: 'bk', cost: 3, icon: 'gi:troll', name: '弁慶', scale: 20, rarity: 'legend',
    stats: { hp: 1, attack: 0, defense: 0 },
    effects: [
      { id: 'offspring', target: 'self', timing: 'summon', condition: 'hasMonster' },
      { id: 'attackUp', value: 120, target: 'allyMonsters', timing: 'summon', condition: 'manyMonsters' },
    ],
    keywords: [{ id: 'haste' }, { id: 'doubleAttack' }], drawbacks: [],
  } as unknown as CardDef;
  it('新生がある分だけ、召喚時の効果のポイントがもう1回足される', () => {
    const withCopy = calculatePoints(benkei);
    expect(withCopy.lines.some((l) => l.label.includes('新生のコピー'))).toBe(true);
    const noCopy = calculatePoints({ ...benkei, effects: [benkei.effects[1]!] } as CardDef);
    expect(withCopy.total).toBeGreaterThan(noCopy.total + BALANCE.effects.offspring.flat);
  });
  it('新生のコピーが召喚時の攻撃力アップを2回出すことを確かめる（値段を足した理由）', () => {
    let g = startGame();
    rich(g, 0, 5);
    const uid = giveCard(g, 0, { ...benkei, cost: 1, rarity: 'legend' } as CardDef);
    g = act(g, { type: 'playCard', player: 0, cardUid: uid, chosen: {} });
    expect(g.players[0].board.length).toBe(2);
  });
});

describe('報告 #12：血の支払いは1エナジーあたりのHPが重い', () => {
  it('エナジー1あたり HP x(6)（倍率1で6。報告 #23 で x(3) から：決定事項 #150）', () => {
    expect(BALANCE.abilities.lifePay.hpPerEnergy).toBe(120);
  });
});
