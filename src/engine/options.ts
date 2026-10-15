/** 発動タイミング・対象・条件の定義。倍率は balance.ts から読む。 */
import { BALANCE } from './balance.ts';
import type { CardBase, ConditionId, TargetId, TimingId } from './types.ts';

// ---------------------------------------------------------------- タイミング

/**
 * 「選んだ1体」が何を指すか。
 * manual: 使うときにプレイヤーが選ぶ / attackTarget: その攻撃の相手 /
 * damageSource: ダメージを与えてきた相手 / none: 選ぶ場面がない（「選んだ1体」は出さない）
 */
export type ChosenMode = 'manual' | 'attackTarget' | 'damageSource' | 'none';

export interface TimingDef {
  id: TimingId;
  label: string;
  /** 効果テキストの前に付ける言葉（使用時は空） */
  textPrefix: string;
  /** 使えるカードの土台 */
  bases: readonly CardBase[];
  /** モンスター以外で使うとパワーになるタイミング */
  powerTiming: boolean;
  chosen: ChosenMode;
}

export const TIMINGS: Record<TimingId, TimingDef> = {
  play: { id: 'play', label: '使用時', textPrefix: '', bases: ['spell'], powerTiming: false, chosen: 'manual' },
  summon: { id: 'summon', label: '召喚時', textPrefix: '召喚時、', bases: ['monster'], powerTiming: false, chosen: 'manual' },
  destroyed: {
    id: 'destroyed',
    label: '破壊されたとき',
    textPrefix: '破壊されたとき、',
    bases: ['monster'],
    powerTiming: false,
    chosen: 'none',
  },
  damaged: {
    id: 'damaged',
    label: 'ダメージを受けたとき',
    textPrefix: 'ダメージを受けたとき、',
    bases: ['monster'],
    powerTiming: false,
    chosen: 'damageSource',
  },
  attack: {
    id: 'attack',
    label: '攻撃するたび',
    textPrefix: '攻撃するたび、',
    bases: ['monster'],
    powerTiming: false,
    chosen: 'attackTarget',
  },
  turnStart: {
    id: 'turnStart',
    label: '自分のターン開始時',
    textPrefix: '自分のターン開始時、',
    bases: ['monster', 'spell'],
    powerTiming: true,
    chosen: 'none',
  },
  turnEnd: {
    id: 'turnEnd',
    label: '自分のターン終了時',
    textPrefix: '自分のターン終了時、',
    bases: ['monster', 'spell'],
    powerTiming: true,
    chosen: 'none',
  },
  cardPlayed: {
    id: 'cardPlayed',
    label: 'カードを使うたび',
    textPrefix: 'カードを使うたび、',
    bases: ['spell'],
    powerTiming: true,
    chosen: 'none',
  },
};

export function timingMultiplier(timing: TimingId, base: CardBase): number {
  const t = BALANCE.timing;
  switch (timing) {
    case 'play':
      return t.play;
    case 'summon':
      return t.summon;
    case 'destroyed':
      return t.destroyed;
    case 'damaged':
      return t.damaged;
    case 'attack':
      return t.attack;
    case 'turnStart':
      return base === 'monster' ? t.turnStartMonster : t.turnStartPower;
    case 'turnEnd':
      return base === 'monster' ? t.turnEndMonster : t.turnEndPower;
    case 'cardPlayed':
      return t.cardPlayed;
  }
}

export function timingsFor(base: CardBase): TimingId[] {
  return (Object.keys(TIMINGS) as TimingId[]).filter((id) => TIMINGS[id].bases.includes(base));
}

export function defaultTiming(base: CardBase): TimingId {
  return base === 'monster' ? 'summon' : 'play';
}

/** モンスター以外のカードで、このタイミングを使うとパワー（永続）になるか */
export function isPowerTiming(timing: TimingId | null, base: CardBase): boolean {
  return base === 'spell' && timing !== null && TIMINGS[timing].powerTiming;
}

// ---------------------------------------------------------------- 対象

/**
 * 効果がどんな相手に作用するか（効果定義ごとに1つ選ぶ）。
 * enemyAny: 相手のプレイヤーかモンスター / enemyMonster: 相手モンスター /
 * enemyMonsterOne: 相手モンスター1体限定 / enemyPlayer: 相手プレイヤー限定 /
 * allyMonsterOne: 自分のモンスター1体 / self: 自分 / board: 場全体
 */
export type TargetRule =
  | 'enemyAny'
  | 'enemyMonster'
  | 'enemyMonsterOne'
  | 'enemyPlayer'
  | 'allyMonsterOne'
  | 'self'
  | 'board';

export function targetMultiplier(target: TargetId): number {
  return BALANCE.target[target];
}

/** 効果の作用先とタイミングから、選べる対象の一覧を返す */
export function allowedTargets(rule: TargetRule, timing: TimingId): TargetId[] {
  const chosen = TIMINGS[timing].chosen;
  const hasChosen = chosen !== 'none';
  switch (rule) {
    case 'enemyAny':
      return [
        ...(hasChosen ? (['chosen'] as const) : (['enemyPlayer'] as const)),
        'random',
        'enemyMonsters',
        'enemyAll',
        'everyone',
      ];
    case 'enemyMonster':
      return [...(hasChosen ? (['chosen'] as const) : []), 'random', 'enemyMonsters', 'everyone'];
    case 'enemyMonsterOne':
      return [...(hasChosen ? (['chosen'] as const) : []), 'random'];
    case 'enemyPlayer':
      return ['enemyPlayer'];
    case 'allyMonsterOne':
      // 自分のモンスターを選べるのは、使うときに選ぶ場面があるタイミングだけ
      return [...(chosen === 'manual' ? (['chosen'] as const) : []), 'random'];
    case 'self':
      return ['self'];
    case 'board':
      return ['board'];
  }
}

/** エディターの選択肢に出す名前 */
export function targetLabel(target: TargetId, rule: TargetRule, timing: TimingId): string {
  const chosen = TIMINGS[timing].chosen;
  switch (target) {
    case 'chosen':
      if (rule === 'allyMonsterOne') return '選んだ自分のモンスター1体';
      if (chosen === 'attackTarget') return '攻撃した相手';
      if (chosen === 'damageSource') return 'ダメージを与えてきた相手';
      return '選んだ1体';
    case 'random':
      return rule === 'allyMonsterOne' ? 'ランダムな自分のモンスター1体' : 'ランダムな1体';
    case 'enemyMonsters':
      return '相手モンスター全体';
    case 'enemyAll':
      return '相手全体';
    case 'everyone':
      return '敵味方すべて';
    case 'self':
      return '自分';
    case 'enemyPlayer':
      return '相手プレイヤー';
    case 'board':
      return '場のすべて';
  }
}

/** 効果テキストで使う対象の呼び方（「相手1体」「相手モンスター全体」など） */
export function targetNoun(target: TargetId, rule: TargetRule, timing: TimingId): string {
  const chosen = TIMINGS[timing].chosen;
  const monsterOnly = rule === 'enemyMonster' || rule === 'enemyMonsterOne';
  switch (target) {
    case 'chosen':
      if (rule === 'allyMonsterOne') return '自分のモンスター1体';
      if (chosen === 'attackTarget') return monsterOnly ? '攻撃したモンスター' : '相手';
      if (chosen === 'damageSource') return monsterOnly ? 'ダメージを与えてきたモンスター' : 'ダメージを与えてきた相手';
      return monsterOnly ? '相手モンスター1体' : '相手1体';
    case 'random':
      if (rule === 'allyMonsterOne') return 'ランダムな自分のモンスター1体';
      return monsterOnly ? 'ランダムな相手モンスター1体' : 'ランダムな相手1体';
    case 'enemyMonsters':
      return '相手モンスター全体';
    case 'enemyAll':
      return '相手全体';
    case 'everyone':
      return monsterOnly ? '敵味方のモンスターすべて' : '敵味方すべて';
    case 'self':
      return '自分';
    case 'enemyPlayer':
      return '相手プレイヤー';
    case 'board':
      return '場のモンスターすべて';
  }
}

// ---------------------------------------------------------------- 条件

export type ConditionTier = 'loose' | 'normal' | 'strict';

export const CONDITION_TIER_LABEL: Record<ConditionTier, string> = {
  loose: 'ゆるい',
  normal: 'ふつう',
  strict: 'きびしい',
};

export interface ConditionDef {
  id: ConditionId;
  tier: ConditionTier;
  label: string;
  /** 効果テキストの前に付ける言葉 */
  textPrefix: string;
  /** 選べるタイミング（null ならすべて） */
  timings: readonly TimingId[] | null;
}

const cp = BALANCE.conditionParams;

export const CONDITIONS: Record<ConditionId, ConditionDef> = {
  hasMonster: {
    id: 'hasMonster',
    tier: 'loose',
    label: '自分の場にモンスターがいる',
    textPrefix: '自分の場にモンスターがいれば、',
    timings: null,
  },
  enemyHpHigher: {
    id: 'enemyHpHigher',
    tier: 'loose',
    label: '相手のHPが自分より多い',
    textPrefix: '相手のHPが自分より多ければ、',
    timings: null,
  },
  enemyPoisoned: {
    id: 'enemyPoisoned',
    tier: 'normal',
    label: '相手が毒状態',
    textPrefix: '相手が毒状態なら、',
    timings: null,
  },
  lowHp: {
    id: 'lowHp',
    tier: 'normal',
    label: '自分のHPが半分以下',
    textPrefix: '自分のHPが半分以下なら、',
    timings: null,
  },
  smallHand: {
    id: 'smallHand',
    tier: 'normal',
    label: `手札が${cp.smallHandMax}枚以下`,
    textPrefix: `手札が${cp.smallHandMax}枚以下なら、`,
    timings: null,
  },
  enemyPoisonBurn: {
    id: 'enemyPoisonBurn',
    tier: 'strict',
    label: '相手が毒とやけどの両方',
    textPrefix: '相手が毒とやけどの両方の状態なら、',
    timings: null,
  },
  nthCard: {
    id: 'nthCard',
    tier: 'strict',
    label: `このターン${cp.nthCardOrLater}枚目以降に使う`,
    textPrefix: `このターン${cp.nthCardOrLater}枚目以降なら、`,
    timings: ['play', 'summon', 'cardPlayed'],
  },
  manyMonsters: {
    id: 'manyMonsters',
    tier: 'strict',
    label: `自分の場にモンスターが${cp.manyMonstersMin}体以上`,
    textPrefix: `自分の場にモンスターが${cp.manyMonstersMin}体以上いれば、`,
    timings: null,
  },
};

export function conditionMultiplier(condition: ConditionId | null): number {
  if (condition === null) return 1;
  return BALANCE.condition[CONDITIONS[condition].tier];
}

export function conditionsFor(timing: TimingId): ConditionId[] {
  return (Object.keys(CONDITIONS) as ConditionId[]).filter((id) => {
    const t = CONDITIONS[id].timings;
    return t === null || t.includes(timing);
  });
}
