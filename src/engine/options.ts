/** 発動タイミング・対象・条件の定義。倍率は balance.ts から読む。 */
import { BALANCE } from './balance.ts';
import type { AbilityInstance, CardBase, ConditionId, TargetId, TimingId } from './types.ts';

/** カードの能力の一覧（エディター・ポイント計算が渡す。省略は「能力を見ない」） */
type Abilities = readonly Pick<AbilityInstance, 'id' | 'value' | 'option'>[] | undefined;

/** 能力 ids のどれかを持っているか */
export function hasAnyAbility(abilities: Abilities, ids: readonly string[]): boolean {
  return (abilities ?? []).some((a) => ids.includes(a.id));
}

/** 能力 id の数値（無ければ undefined） */
export function abilityValue(abilities: Abilities, id: string): number | undefined {
  return (abilities ?? []).find((a) => a.id === id)?.value;
}

// ---------------------------------------------------------------- タイミング

/**
 * 「選んだ1体」が何を指すか。
 * manual: 使うときにプレイヤーが選ぶ / attackTarget: その攻撃の相手 /
 * damageSource: ダメージを与えてきた相手 / triggerAlly: いま場に出た自分のモンスター（「自分のモンスターが出るたび」） /
 * none: 選ぶ場面がない（「選んだ1体」は出さない）
 */
export type ChosenMode = 'manual' | 'attackTarget' | 'damageSource' | 'triggerAlly' | 'none';

/** エディターの選択パネルの見出し（並び順） */
export const TIMING_GROUPS = ['基本', 'このモンスター', 'ターン', '自分が使ったカード', '味方の出入り', '手札・捨て札', '起動', '英雄譚', '蓄積'] as const;
export type TimingGroup = (typeof TIMING_GROUPS)[number];

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
  /** エディターの選択パネルの見出し */
  group: TimingGroup;
  /** エディターに出す1行の説明 */
  description: string;
  /**
   * このカードの能力のどれかがあるときだけ選べる（MTG 要素 ○ バッチC1：起動・魂力・捨て札から使ったとき）。
   * 無ければ違反（ACTIVATE_MISMATCH など）
   */
  requiresAbility?: readonly string[];
  /** デメリットには使えない（使うかどうかを自分で決めるタイミング。払えば得をするだけになる） */
  noDrawbacks?: boolean;
}

/** 捨て札から使える能力（MTG 要素 ○ バッチC1。defs/abilities の fromDiscard を持つもの） */
export const FROM_DISCARD_ABILITIES = ['flashback', 'jumpStart', 'escape'] as const;

const maxRepeat = BALANCE.battle.maxRepeatTriggersPerTurn;

/** モード（MTG 要素 ○ バッチC2）を付けられるタイミング：使用時・召喚時・捨て札から使ったとき */
export const MODE_TIMINGS: readonly TimingId[] = ['play', 'summon', 'fromDiscard'];

/** 英雄譚の章のタイミング（MTG 要素 ○ バッチC2。第1章から順に） */
export const CHAPTER_TIMINGS = ['chapter1', 'chapter2', 'chapter3'] as const satisfies readonly TimingId[];

/** 英雄譚の章の番号（章のタイミングでなければ 0） */
export function chapterOf(timing: TimingId): number {
  return (CHAPTER_TIMINGS as readonly TimingId[]).indexOf(timing) + 1;
}

const chapter = (n: 1 | 2 | 3): TimingDef => ({
  id: CHAPTER_TIMINGS[n - 1],
  label: `第${n}章`,
  textPrefix: `第${n}章：`,
  bases: ['spell'],
  powerTiming: true,
  chosen: 'none',
  group: '英雄譚',
  description:
    n === 1
      ? '英雄譚：使うとパワーとして残り、使ったときに第1章の効果が出る（第2章・第3章は次の自分のターン開始時から1章ずつ。最後の章のあと消える）'
      : `英雄譚の第${n}章：第${n - 1}章の次の自分のターン開始時に出る（第1章から順に付ける）`,
});

export const TIMINGS: Record<TimingId, TimingDef> = {
  play: {
    id: 'play',
    label: '使用時',
    textPrefix: '',
    bases: ['spell'],
    powerTiming: false,
    chosen: 'manual',
    group: '基本',
    description: 'カードを使ったとき（モンスター以外）',
  },
  summon: {
    id: 'summon',
    label: '召喚時',
    textPrefix: '召喚時、',
    bases: ['monster'],
    powerTiming: false,
    chosen: 'manual',
    group: '基本',
    description: 'このモンスターが場に出たとき',
  },
  destroyed: {
    id: 'destroyed',
    label: '破壊されたとき',
    textPrefix: '破壊されたとき、',
    bases: ['monster'],
    powerTiming: false,
    chosen: 'none',
    group: 'このモンスター',
    description: 'このモンスターが破壊されたとき（選んだ1体は使えない）',
  },
  damaged: {
    id: 'damaged',
    label: 'ダメージを受けたとき',
    textPrefix: 'ダメージを受けたとき、',
    bases: ['monster'],
    powerTiming: false,
    chosen: 'damageSource',
    group: 'このモンスター',
    description: 'ダメージを受けて生き残ったとき（毒・やけどでは発動しない）',
  },
  attack: {
    id: 'attack',
    label: '攻撃するたび',
    textPrefix: '攻撃するたび、',
    bases: ['monster'],
    powerTiming: false,
    chosen: 'attackTarget',
    group: 'このモンスター',
    description: 'このモンスターが攻撃するたび（攻撃した相手を対象にできる）',
  },
  hitEnemyPlayer: {
    id: 'hitEnemyPlayer',
    label: '相手プレイヤーにダメージを与えたとき',
    textPrefix: '相手プレイヤーにダメージを与えるたび、',
    bases: ['monster'],
    powerTiming: false,
    chosen: 'none',
    group: 'このモンスター',
    description: 'このモンスターの攻撃（または貫通の余り）で相手プレイヤーのHPが1以上減るたび',
  },
  turnStart: {
    id: 'turnStart',
    label: '自分のターン開始時',
    textPrefix: '自分のターン開始時、',
    bases: ['monster', 'spell'],
    powerTiming: true,
    chosen: 'none',
    group: 'ターン',
    description: '自分のターンの始め（引いた後）。モンスター以外ならパワーとして場に残る',
  },
  turnEnd: {
    id: 'turnEnd',
    label: '自分のターン終了時',
    textPrefix: '自分のターン終了時、',
    bases: ['monster', 'spell'],
    powerTiming: true,
    chosen: 'none',
    group: 'ターン',
    description: '自分のターンの終わり（手札を捨てる前）。モンスター以外ならパワーとして場に残る',
  },
  cardPlayed: {
    id: 'cardPlayed',
    label: 'カードを使うたび',
    textPrefix: 'カードを使うたび、',
    bases: ['spell'],
    powerTiming: true,
    chosen: 'none',
    group: '自分が使ったカード',
    description: `自分がカードを使い終えるたび（パワー専用。1つにつき1ターン${BALANCE.battle.maxCardPlayedTriggersPerTurn}回まで）`,
  },
  powerPlayed: {
    id: 'powerPlayed',
    label: '自分がパワーを使うたび',
    textPrefix: '自分がパワーを使うたび、',
    bases: ['monster', 'spell'],
    powerTiming: true,
    chosen: 'none',
    group: '自分が使ったカード',
    description: `自分が種類「パワー」「パワーアタック」のカードを使い終えるたび（そのパワー自身は除く）。1つにつき1ターン${maxRepeat}回まで`,
  },
  skillPlayed: {
    id: 'skillPlayed',
    label: '自分がスキルを使うたび',
    textPrefix: '自分がスキルを使うたび、',
    bases: ['monster', 'spell'],
    powerTiming: true,
    chosen: 'none',
    group: '自分が使ったカード',
    description: `自分が種類「スキル」のカードを使い終えるたび。1つにつき1ターン${maxRepeat}回まで`,
  },
  allySummoned: {
    id: 'allySummoned',
    label: '自分のモンスターが出るたび',
    textPrefix: '自分のモンスターが出るたび、',
    bases: ['monster', 'spell'],
    powerTiming: true,
    chosen: 'triggerAlly',
    group: '味方の出入り',
    description: `このカード以外の自分のモンスターが場に出るたび（召喚・蘇生・トークン）。1つにつき1ターン${maxRepeat}回まで`,
  },
  allyDestroyed: {
    id: 'allyDestroyed',
    label: '自分の他のモンスターが破壊されるたび',
    textPrefix: '自分の他のモンスターが破壊されるたび、',
    bases: ['monster', 'spell'],
    powerTiming: true,
    chosen: 'none',
    group: '味方の出入り',
    description: `このカード以外の自分のモンスターが破壊されるたび（どちらのターンでも。トークンも含む）。1つにつき1ターン${maxRepeat}回まで`,
  },
  // ---- MTG 要素 ○ バッチA
  targeted: {
    id: 'targeted',
    label: '自分のカードの対象になるたび',
    textPrefix: '自分のカードの対象になるたび、',
    bases: ['monster'],
    powerTiming: false,
    chosen: 'none',
    group: 'このモンスター',
    description: `自分が使うカードの「選んだ自分のモンスター1体」にこのモンスターが選ばれるたび（英雄的。カードの効果より先に発動）。1ターン${maxRepeat}回まで`,
  },
  bigCardPlayed: {
    id: 'bigCardPlayed',
    label: `コスト${BALANCE.timingParams.bigCardCost}以上のカードを使うたび`,
    textPrefix: `コスト${BALANCE.timingParams.bigCardCost}以上のカードを使うたび、`,
    bases: ['monster', 'spell'],
    powerTiming: true,
    chosen: 'none',
    group: '自分が使ったカード',
    description: `自分が印刷コスト${BALANCE.timingParams.bigCardCost}以上のカードを使い終えるたび（演目。軽減する前のコストで判定）。パワーにも付けられる。1つにつき1ターン${maxRepeat}回まで`,
  },
  drawn: {
    id: 'drawn',
    label: '引いたとき',
    textPrefix: '引いたとき、',
    bases: ['monster', 'spell'],
    powerTiming: false,
    chosen: 'none',
    group: '手札・捨て札',
    description: 'このカードを山札から引いたとき（ターン開始のドローも。対戦開始の手札・マリガンでは出ない）。カード自身は手札に残る。引いたことは相手にも分かる',
  },
  // ---- MTG 要素 ○ バッチC1
  fromDiscard: {
    id: 'fromDiscard',
    label: '捨て札から使ったとき',
    textPrefix: '捨て札から使ったとき、',
    bases: ['monster', 'spell'],
    powerTiming: false,
    chosen: 'manual',
    group: '手札・捨て札',
    description:
      'このカードを捨て札から使ったとき（使用時・召喚時の効果の代わりに出る。余波）。フラッシュバック・再活・脱出のどれかがあるカードだけ',
    requiresAbility: FROM_DISCARD_ABILITIES,
    noDrawbacks: true,
  },
  channel: {
    id: 'channel',
    label: '魂力',
    textPrefix: '魂力：',
    bases: ['monster', 'spell'],
    powerTiming: false,
    chosen: 'manual',
    group: '手札・捨て札',
    description: '手札からエナジーを払ってこのカードを捨て、代わりにこの効果を使う（本体と二者択一）。カードの能力「魂力」があるカードだけ',
    requiresAbility: ['channel'],
    noDrawbacks: true,
  },
  activated: {
    id: 'activated',
    label: '起動',
    textPrefix: '起動：',
    bases: ['monster', 'spell'],
    powerTiming: true,
    chosen: 'manual',
    group: '起動',
    description:
      '場のモンスター・パワーの「起動」の効果を、自分のターンにエナジーを払って使う（1つにつき1ターン1回）。カードの能力「起動」があるカードだけ。モンスター以外ならパワーになる',
    requiresAbility: ['activate'],
    noDrawbacks: true,
  },
  // ---- MTG 要素 ○ バッチC2
  chapter1: chapter(1),
  chapter2: chapter(2),
  chapter3: chapter(3),
  charged: {
    id: 'charged',
    label: '蓄積がたまったとき',
    textPrefix: '蓄積がたまったとき、',
    bases: ['spell'],
    powerTiming: true,
    chosen: 'none',
    group: '蓄積',
    description:
      'パワーの蓄積カウンターが必要数たまったとき（たまったら0に戻る）。カードの能力「蓄積」があるカードだけ。パワーになる',
    requiresAbility: ['charge'],
    noDrawbacks: true,
  },
};

/** 1つのカード（パワー・モンスター）につき1ターン maxRepeatTriggersPerTurn 回までのタイミング（安全装置） */
export const REPEAT_CAPPED_TIMINGS: readonly TimingId[] = ['allySummoned', 'allyDestroyed', 'powerPlayed', 'skillPlayed', 'targeted', 'bigCardPlayed'];

/** 「攻撃するたび」の倍率に要る、モンスターの攻撃のしかた（キーワードから決まる。points.ts の attackProfile） */
export interface AttackProfile {
  /** 1ターンの攻撃回数（二回攻撃なら2） */
  attacks: number;
  /** 速攻があるか */
  haste: boolean;
}

export const DEFAULT_ATTACK_PROFILE: AttackProfile = { attacks: 1, haste: false };

/**
 * タイミングの倍率。「攻撃するたび」は攻撃回数を掛け、速攻なら足す（決定事項 #68）。
 * attack を省略すると攻撃1回・速攻なしとして計算する
 */
export function timingMultiplier(
  timing: TimingId,
  base: CardBase,
  attack: AttackProfile = DEFAULT_ATTACK_PROFILE,
  card: { abilities?: Abilities } = {},
): number {
  const t = BALANCE.timing;
  const monster = base === 'monster';
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
      return t.attack * attack.attacks + (attack.haste ? t.attackHasteBonus : 0);
    case 'turnStart':
      return base === 'monster' ? t.turnStartMonster : t.turnStartPower;
    case 'turnEnd':
      return base === 'monster' ? t.turnEndMonster : t.turnEndPower;
    case 'cardPlayed':
      return t.cardPlayed;
    case 'allySummoned':
      return monster ? t.allySummonedMonster : t.allySummonedPower;
    case 'allyDestroyed':
      return monster ? t.allyDestroyedMonster : t.allyDestroyedPower;
    case 'powerPlayed':
      return monster ? t.powerPlayedMonster : t.powerPlayedPower;
    case 'skillPlayed':
      return monster ? t.skillPlayedMonster : t.skillPlayedPower;
    case 'hitEnemyPlayer':
      // 二回攻撃なら発動の機会も2倍
      return t.hitEnemyPlayer * attack.attacks;
    case 'drawn':
      return t.drawn;
    case 'targeted':
      return t.targeted;
    case 'bigCardPlayed':
      return monster ? t.bigCardPlayedMonster : t.bigCardPlayedPower;
    case 'fromDiscard':
      return t.fromDiscard;
    case 'channel':
      return t.channel;
    case 'activated': {
      // 起動のエナジーが多いほど安い（能力が無ければエナジー1として計算）
      const table = monster ? t.activatedMonster : t.activatedPower;
      const n = abilityValue(card.abilities, 'activate') ?? BALANCE.abilities.activate.minCost;
      const i = Math.min(Math.max(n - BALANCE.abilities.activate.minCost, 0), table.length - 1);
      return table[i]!;
    }
    case 'chapter1':
      return t.chapter1;
    case 'chapter2':
      return t.chapter2;
    case 'chapter3':
      return t.chapter3;
    case 'charged':
      return chargedMultiplier(card.abilities);
  }
}

/** 蓄積（MTG 要素 ○ バッチC2）の能力の必要数とイベント（能力が無ければ既定値） */
export function chargeSpec(abilities: Abilities): { need: number; event: ChargeEvent } {
  const a = (abilities ?? []).find((x) => x.id === 'charge');
  const C = BALANCE.abilities.charge;
  const need = a?.value ?? CHARGE_DEFAULT_NEED;
  const event = (CHARGE_EVENTS as readonly string[]).includes(a?.option ?? '') ? (a!.option as ChargeEvent) : CHARGE_EVENTS[0];
  return { need: Math.min(Math.max(need, C.min), C.max), event };
}

/** 蓄積カウンターがたまるイベント（MTG 要素 ○ バッチC2） */
export const CHARGE_EVENTS = ['turnStart', 'cardPlayed', 'allySummoned', 'enemyDamaged', 'allyDestroyed'] as const;
export type ChargeEvent = (typeof CHARGE_EVENTS)[number];
export const CHARGE_EVENT_LABEL: Record<ChargeEvent, string> = {
  turnStart: '自分のターン開始時',
  cardPlayed: 'カードを使うたび',
  allySummoned: '自分のモンスターが出るたび',
  enemyDamaged: '自分のターンに相手のHPを減らすたび',
  allyDestroyed: '自分のモンスターが破壊されるたび',
};
/** 蓄積の必要数の初期値（エディターの初期値。バランスの範囲は balance.ts） */
export const CHARGE_DEFAULT_NEED = 3;

/** 「蓄積がたまったとき」の倍率：chargedPower × min(1, イベントの頻度 ÷ 必要数) */
export function chargedMultiplier(abilities: Abilities): number {
  const { need, event } = chargeSpec(abilities);
  const rate = BALANCE.abilities.charge.rates[event];
  return BALANCE.timing.chargedPower * Math.min(1, rate / need);
}

/**
 * この土台で選べるタイミング（TIMING_GROUPS の順）。abilities を渡すと、能力が要るタイミング（起動・魂力・捨て札から使ったとき）は
 * その能力があるときだけ。省略すると能力が要るタイミングは出さない
 */
export function timingsFor(base: CardBase, abilities?: Abilities): TimingId[] {
  const ids = (Object.keys(TIMINGS) as TimingId[]).filter(
    (id) => TIMINGS[id].bases.includes(base) && (TIMINGS[id].requiresAbility === undefined || hasAnyAbility(abilities, TIMINGS[id].requiresAbility!)),
  );
  return ids.sort((a, b) => TIMING_GROUPS.indexOf(TIMINGS[a].group) - TIMING_GROUPS.indexOf(TIMINGS[b].group));
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
 * allyMonsterOne: 自分のモンスター1体 / self: 自分 / board: 場全体 /
 * fight: 自分のモンスター1体と相手モンスター1体の組（格闘。MTG 要素バッチ2）
 */
export type TargetRule =
  | 'enemyAny'
  | 'enemyMonster'
  | 'enemyMonsterOne'
  | 'enemyPlayer'
  | 'allyMonsterOne'
  | 'self'
  | 'board'
  | 'fight';

/** モンスターにしか作用しない効果か（処刑・封印・混乱・バウンスなど） */
export function isMonsterOnlyRule(rule: TargetRule): boolean {
  return rule === 'enemyMonster' || rule === 'enemyMonsterOne';
}

/** 対象の倍率。「敵味方すべて」はモンスター限定の効果だと高い（決定事項 #68）。rule を省略すると通常の倍率 */
export function targetMultiplier(target: TargetId, rule?: TargetRule): number {
  if (target === 'everyone' && rule !== undefined && isMonsterOnlyRule(rule)) return BALANCE.targetMonsterOnly.everyone;
  return BALANCE.target[target];
}

/**
 * 効果の作用先とタイミング（と土台）から、選べる対象の一覧を返す。
 * base を省略すると、モンスター専用のタイミングならモンスター、それ以外は土台が分からないものとして「このモンスター」を出さない
 */
export function allowedTargets(rule: TargetRule, timing: TimingId, base?: CardBase): TargetId[] {
  const chosen = TIMINGS[timing].chosen;
  // 相手側の「選んだ1体」：攻撃した相手・ダメージを与えてきた相手・使うときに選ぶ1体
  const hasChosen = chosen !== 'none' && chosen !== 'triggerAlly';
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
    case 'allyMonsterOne': {
      // 自分のモンスターを選べるのは、使うときに選ぶ場面があるタイミングと「出たモンスター」だけ
      const monsterCard = base === 'monster' || (base === undefined && TIMINGS[timing].bases.every((b) => b === 'monster'));
      // 引いたとき・魂力は、カード自身がまだ手札にある
      const onBoard = monsterCard && timing !== 'drawn' && timing !== 'channel';
      return [
        ...(chosen === 'manual' || chosen === 'triggerAlly' ? (['chosen'] as const) : []),
        'random',
        // 「このモンスター」はモンスターのカードだけ。破壊されたときはもう場にいない
        ...(onBoard && timing !== 'destroyed' ? (['thisMonster'] as const) : []),
        'allyMonsters',
        // 「自分の他のモンスター全体」もモンスターのカードだけ（破壊されたときは、もう場にいないので全体と同じ）
        ...(onBoard ? (['otherAllies'] as const) : []),
        'weakestAlly',
        // 同じ種族の自分のモンスター全体（MTG 要素 ○ バッチC2。種族のあるカードだけ：validate の TRIBE_REQUIRED）
        'tribeAllies',
      ];
    }
    case 'self':
      return ['self'];
    case 'board':
      return ['board'];
    case 'fight':
      // 両方を選ぶのは使うときに選ぶ場面があるタイミングだけ。ランダムはどこでも
      return [...(chosen === 'manual' ? (['chosen'] as const) : []), 'random'];
  }
}

/**
 * 効果の定義（作用先と、外す対象）とタイミング・土台から、選べる対象の一覧。
 * 「自分」に作用する効果のうち symmetric なもの（ドロー・回復など）は「お互い」も選べる（MTG 要素 ○ バッチA）
 */
export function targetsForEffect(
  def: { targetRule: TargetRule; excludeTargets?: readonly TargetId[]; symmetric?: boolean },
  timing: TimingId,
  base?: CardBase,
): TargetId[] {
  const all = allowedTargets(def.targetRule, timing, base);
  if (def.symmetric && def.targetRule === 'self') all.push('bothPlayers');
  return def.excludeTargets ? all.filter((t) => !def.excludeTargets!.includes(t)) : all;
}

/** エディターの選択肢に出す名前 */
export function targetLabel(target: TargetId, rule: TargetRule, timing: TimingId): string {
  const chosen = TIMINGS[timing].chosen;
  switch (target) {
    case 'chosen':
      if (rule === 'allyMonsterOne') return chosen === 'triggerAlly' ? '出たモンスター' : '選んだ自分のモンスター1体';
      if (rule === 'fight') return '選んだ自分のモンスター1体と相手モンスター1体';
      if (chosen === 'attackTarget') return '攻撃した相手';
      if (chosen === 'damageSource') return 'ダメージを与えてきた相手';
      return '選んだ1体';
    case 'random':
      if (rule === 'fight') return 'ランダムな自分のモンスター1体と相手モンスター1体';
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
    case 'thisMonster':
      return 'このモンスター';
    case 'allyMonsters':
      return '自分のモンスター全体';
    case 'otherAllies':
      return '自分の他のモンスター全体';
    case 'weakestAlly':
      return 'いちばん体力の低い自分のモンスター';
    case 'bothPlayers':
      return 'お互い';
    case 'tribeAllies':
      return '同じ種族の自分のモンスター全体';
  }
}

/** 効果テキストで使う対象の呼び方（「相手1体」「相手モンスター全体」など） */
export function targetNoun(target: TargetId, rule: TargetRule, timing: TimingId): string {
  const chosen = TIMINGS[timing].chosen;
  const monsterOnly = isMonsterOnlyRule(rule);
  switch (target) {
    case 'chosen':
      if (rule === 'allyMonsterOne') return chosen === 'triggerAlly' ? '出たモンスター' : '自分のモンスター1体';
      if (rule === 'fight') return '自分のモンスター1体と相手モンスター1体';
      if (chosen === 'attackTarget') return monsterOnly ? '攻撃したモンスター' : '相手';
      if (chosen === 'damageSource') return monsterOnly ? 'ダメージを与えてきたモンスター' : 'ダメージを与えてきた相手';
      return monsterOnly ? '相手モンスター1体' : '相手1体';
    case 'random':
      if (rule === 'allyMonsterOne') return 'ランダムな自分のモンスター1体';
      if (rule === 'fight') return 'ランダムな自分のモンスター1体とランダムな相手モンスター1体';
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
    case 'thisMonster':
      return 'このモンスター';
    case 'allyMonsters':
      return '自分のモンスター全体';
    case 'otherAllies':
      return '自分の他のモンスター全体';
    case 'weakestAlly':
      return 'いちばん体力の低い自分のモンスター';
    case 'bothPlayers':
      return '自分';
    case 'tribeAllies':
      return '同じ種族の自分のモンスター全体';
  }
}

/** 種族のあるカードでしか使えない対象（MTG 要素 ○ バッチC2） */
export const TRIBE_TARGETS: readonly TargetId[] = ['tribeAllies'];

// ---------------------------------------------------------------- 条件

/** エディターの見出し用のまとまり（倍率は条件ごとに balance.ts に持つ。決定事項 #68） */
export type ConditionTier = 'loose' | 'normal' | 'strict';

export const CONDITION_TIER_LABEL: Record<ConditionTier, string> = {
  loose: 'ゆるい',
  normal: 'ふつう',
  strict: 'きびしい',
};

/** エディターの選択パネルの見出し（並び順） */
export const CONDITION_GROUPS = [
  '場',
  'このモンスター',
  '手札',
  'HP',
  '状態',
  'このターン',
  '相手の前のターン',
  '捨て札',
  'コスト・追加の支払い',
  '種族・速度・王冠',
  '運・先後',
] as const;
export type ConditionGroup = (typeof CONDITION_GROUPS)[number];

export interface ConditionDef {
  id: ConditionId;
  tier: ConditionTier;
  label: string;
  /** 効果テキストの前に付ける言葉 */
  textPrefix: string;
  /** 選べるタイミング（null ならすべて） */
  timings: readonly TimingId[] | null;
  /** 選べないタイミング（満たせない・常に満たすもの） */
  excludeTimings?: readonly TimingId[];
  /** パワー（モンスター以外のターン開始時／終了時）では選べない（決定事項 #68 R11） */
  notForPower?: boolean;
  /** 付けられるカードの土台（省略ならどちらも。「このモンスター」の条件はモンスターのカードだけ） */
  bases?: readonly CardBase[];
  /** エディターの選択パネルの見出し */
  group: ConditionGroup;
  /** エディターに出す1行の説明 */
  description: string;
  /** このカードの能力があるときだけ選べる（キッカーを払っていれば。MTG 要素 ○ バッチC1） */
  requiresAbility?: readonly string[];
  /**
   * 条件付き軽減（カードの能力。MTG 要素 ○ バッチC1）には使えない：乱数・選択・出どころ・支払いが要る条件
   * （コストは使う前に決まるので、判定できない）
   */
  notForCost?: boolean;
  /** 種族のあるカードだけ（MTG 要素 ○ バッチC2。無ければ違反 TRIBE_REQUIRED） */
  requiresTribe?: boolean;
}

const cp = BALANCE.conditionParams;

export const CONDITIONS: Record<ConditionId, ConditionDef> = {
  hasMonster: {
    id: 'hasMonster',
    tier: 'loose',
    label: '自分の場にモンスターがいる',
    textPrefix: '自分の場にモンスターがいれば、',
    timings: null,
    group: '場',
    description: '自分の場にモンスターが1体でもいれば発動',
  },
  manyMonsters: {
    id: 'manyMonsters',
    tier: 'normal',
    label: `自分の場にモンスターが${cp.manyMonstersMin}体以上`,
    textPrefix: `自分の場にモンスターが${cp.manyMonstersMin}体以上いれば、`,
    timings: null,
    group: '場',
    description: `自分の場にモンスターが${cp.manyMonstersMin}体以上いれば発動`,
  },
  loneMonster: {
    id: 'loneMonster',
    tier: 'normal',
    label: '自分の場のモンスターが1体だけ',
    textPrefix: '自分の場のモンスターが1体だけなら、',
    timings: null,
    group: '場',
    description: '自分の場のモンスターがちょうど1体なら発動（召喚時なら、そのモンスター自身だけ）',
  },
  bigMonster: {
    id: 'bigMonster',
    tier: 'normal',
    label: `攻撃力${cp.bigMonsterAttack}以上の自分のモンスターがいる`,
    textPrefix: `攻撃力${cp.bigMonsterAttack}以上の自分のモンスターがいれば、`,
    timings: null,
    group: '場',
    description: `自分の場に攻撃力${cp.bigMonsterAttack}以上のモンスターがいれば発動`,
  },
  twoPowers: {
    id: 'twoPowers',
    tier: 'normal',
    label: `自分のパワーが${cp.powersMin}つ以上`,
    textPrefix: `自分のパワーが${cp.powersMin}つ以上あれば、`,
    timings: null,
    group: '場',
    description: `自分の場にパワーが${cp.powersMin}つ以上あれば発動（パワーは${BALANCE.battle.maxPowers}つまで。使ったパワー自身は使用時にはまだ数えない）`,
  },
  smallHand: {
    id: 'smallHand',
    tier: 'loose',
    label: `手札が${cp.smallHandMax}枚以下`,
    textPrefix: `手札が${cp.smallHandMax}枚以下なら、`,
    timings: null,
    // ターン開始時は引いた直後なので満たせず、終了時のパワーも実質満たせない
    notForPower: true,
    group: '手札',
    description: `効果が出る時点で手札が${cp.smallHandMax}枚以下なら発動（ターン開始時・終了時のパワーには付けられない）`,
  },
  emptyHand: {
    id: 'emptyHand',
    tier: 'strict',
    label: '手札が0枚',
    textPrefix: '手札がなければ、',
    timings: null,
    // ターン開始時は引いた直後なので満たせない
    excludeTimings: ['turnStart'],
    group: '手札',
    description: '効果が出る時点で手札が1枚もなければ発動（使ったカード自身は数えない）',
  },
  monsterInHand: {
    id: 'monsterInHand',
    tier: 'loose',
    label: '手札にモンスターカードがある',
    textPrefix: '手札にモンスターカードがあれば、',
    timings: null,
    group: '手札',
    description: '手札にモンスターのカードが1枚以上あれば発動（使ったカード自身は数えない）',
  },
  enemyHpHigher: {
    id: 'enemyHpHigher',
    tier: 'normal',
    label: '相手のHPが自分より多い',
    textPrefix: '相手のHPが自分より多ければ、',
    timings: null,
    group: 'HP',
    description: '相手プレイヤーのHPが自分より多ければ発動',
  },
  lowHp: {
    id: 'lowHp',
    tier: 'strict',
    label: '自分のHPが半分以下',
    textPrefix: '自分のHPが半分以下なら、',
    timings: null,
    group: 'HP',
    description: '自分のHPが最大の半分以下なら発動',
  },
  enemyPoisoned: {
    id: 'enemyPoisoned',
    tier: 'normal',
    label: '相手が毒状態',
    textPrefix: '相手が毒状態なら、',
    timings: null,
    group: '状態',
    description: '相手プレイヤーに毒が残っていれば発動',
  },
  enemyPoisonBurn: {
    id: 'enemyPoisonBurn',
    tier: 'strict',
    label: '相手が毒とやけどの両方',
    textPrefix: '相手が毒とやけどの両方の状態なら、',
    timings: null,
    group: '状態',
    description: '相手プレイヤーが毒とやけどの両方の状態なら発動',
  },
  nthCard: {
    id: 'nthCard',
    tier: 'normal',
    label: `このターン${cp.nthCardOrLater}枚目以降に使う`,
    textPrefix: `このターン${cp.nthCardOrLater}枚目以降なら、`,
    timings: ['play', 'summon', 'cardPlayed'],
    group: 'このターン',
    description: `このターン${cp.nthCardOrLater}枚目以降に使ったカード（またはそのときの誘発）なら発動`,
  },
  enemyDamagedThisTurn: {
    id: 'enemyDamagedThisTurn',
    tier: 'normal',
    label: 'このターン相手にダメージを与えた',
    textPrefix: 'このターン相手にダメージを与えていれば、',
    timings: null,
    // ターン開始時はまだ与えていない。「相手プレイヤーにダメージを与えたとき」は常に満たす
    excludeTimings: ['turnStart', 'hitEnemyPlayer'],
    group: 'このターン',
    description: '自分のターン中に、相手プレイヤーのHPを1以上減らしていれば発動（攻撃・効果どちらでも）',
  },
  allyAttackedThisTurn: {
    id: 'allyAttackedThisTurn',
    tier: 'normal',
    label: 'このターン自分のモンスターが攻撃した',
    textPrefix: 'このターン自分のモンスターが攻撃していれば、',
    timings: null,
    excludeTimings: ['turnStart', 'attack', 'hitEnemyPlayer'],
    group: 'このターン',
    description: '自分のターン中に、自分のモンスターが1回でも攻撃していれば発動（混乱などの自動攻撃も数える）',
  },
  monsterDestroyedThisTurn: {
    id: 'monsterDestroyedThisTurn',
    tier: 'normal',
    label: 'このターンにモンスターが破壊された',
    textPrefix: 'このターンにモンスターが破壊されていれば、',
    timings: null,
    excludeTimings: ['turnStart', 'destroyed', 'allyDestroyed'],
    group: 'このターン',
    description: 'このターン中に、敵味方どちらかのモンスターが1体でも破壊されていれば発動',
  },
  twoSummonsThisTurn: {
    id: 'twoSummonsThisTurn',
    tier: 'strict',
    label: `このターンにモンスターを${cp.summonsMin}体以上出した`,
    textPrefix: `このターンにモンスターを${cp.summonsMin}体以上出していれば、`,
    timings: null,
    excludeTimings: ['turnStart'],
    group: 'このターン',
    description: `自分のターン中に、モンスターを${cp.summonsMin}体以上場に出していれば発動（召喚・蘇生・トークン。いま出たものも数える）`,
  },
  bigDiscard: {
    id: 'bigDiscard',
    tier: 'normal',
    label: `捨て札が${cp.discardMin}枚以上`,
    textPrefix: `捨て札が${cp.discardMin}枚以上あれば、`,
    timings: null,
    group: '捨て札',
    description: `自分の捨て札が${cp.discardMin}枚以上あれば発動（山札を切り直すと0に戻る）`,
  },
  coinFlip: {
    id: 'coinFlip',
    tier: 'strict',
    label: 'コイン投げで表（50%）',
    textPrefix: 'コインを投げて表なら、',
    timings: null,
    group: '運・先後',
    description: '効果が出るたびにコインを投げ、表なら発動（50%）',
    notForCost: true,
  },
  secondPlayer: {
    id: 'secondPlayer',
    tier: 'strict',
    label: '後攻',
    textPrefix: '後攻なら、',
    timings: null,
    group: '運・先後',
    description: '自分が後攻の対戦でだけ発動（先攻なら発動しない）',
  },
  // ---- MTG 要素 ○ バッチA
  enemyPlayedMany: {
    id: 'enemyPlayedMany',
    tier: 'normal',
    label: `前の相手のターンに相手がカードを${cp.enemyCardsMin}枚以上使った`,
    textPrefix: `前の相手のターンに相手がカードを${cp.enemyCardsMin}枚以上使っていれば、`,
    timings: null,
    group: '相手の前のターン',
    description: `相手が直前のターン（最後に終えたターン）にカードを${cp.enemyCardsMin}枚以上使っていれば発動（罠）`,
  },
  veteran: {
    id: 'veteran',
    tier: 'normal',
    label: `このモンスターが${cp.veteranAttacks}回以上攻撃した`,
    textPrefix: `このモンスターが${cp.veteranAttacks}回以上攻撃していれば、`,
    timings: null,
    // 出たばかり（召喚時）・もう場にいない（破壊されたとき）・手札（引いたとき）では満たせない
    excludeTimings: ['summon', 'destroyed', 'drawn'],
    bases: ['monster'],
    notForCost: true,
    group: 'このモンスター',
    description: `このモンスターが場に出てから合計${cp.veteranAttacks}回以上攻撃していれば発動（探索カウンター。場を離れると0から。「攻撃するたび」なら今回の攻撃も数える）`,
  },
  strongerAlly: {
    id: 'strongerAlly',
    tier: 'normal',
    label: 'このモンスターより攻撃力の高い自分のモンスターがいる',
    textPrefix: 'このモンスターより攻撃力の高い自分のモンスターがいれば、',
    timings: null,
    excludeTimings: ['destroyed', 'drawn'],
    bases: ['monster'],
    notForCost: true,
    group: 'このモンスター',
    description: 'このモンスターより攻撃力（今の値）の高い自分のモンスターが場にいれば発動（訓練）',
  },
  totalAttack: {
    id: 'totalAttack',
    tier: 'normal',
    label: `自分のモンスターの攻撃力の合計が${cp.totalAttackMin}以上`,
    textPrefix: `自分のモンスターの攻撃力の合計が${cp.totalAttackMin}以上なら、`,
    timings: null,
    group: '場',
    description: `自分の場のモンスターの攻撃力（今の値）の合計が${cp.totalAttackMin}以上なら発動（チームワーク・圧倒。トークン・防衛のモンスターも数える）`,
  },
  coven: {
    id: 'coven',
    tier: 'strict',
    label: `攻撃力の違う自分のモンスターが${cp.covenMin}体以上`,
    textPrefix: `攻撃力の違う自分のモンスターが${cp.covenMin}体以上いれば、`,
    timings: null,
    group: '場',
    description: `自分の場に、攻撃力（今の値）がそれぞれ違うモンスターが${cp.covenMin}体以上いれば発動（集会）`,
  },
  twoAllyAttacks: {
    id: 'twoAllyAttacks',
    tier: 'normal',
    label: `このターン自分のモンスターが${cp.allyAttacksMin}回以上攻撃した`,
    textPrefix: `このターン自分のモンスターが${cp.allyAttacksMin}回以上攻撃していれば、`,
    timings: null,
    excludeTimings: ['turnStart'],
    group: 'このターン',
    description: `自分のターン中に、自分のモンスターが合計${cp.allyAttacksMin}回以上攻撃していれば発動（大隊。「攻撃するたび」なら${cp.allyAttacksMin}回目以降の攻撃）`,
  },
  bigDamageThisTurn: {
    id: 'bigDamageThisTurn',
    tier: 'normal',
    label: `このターン相手に合計${cp.bigDamageMin}以上のダメージを与えた`,
    textPrefix: `このターン相手に合計${cp.bigDamageMin}以上のダメージを与えていれば、`,
    timings: null,
    excludeTimings: ['turnStart'],
    group: 'このターン',
    description: `自分のターン中に、相手プレイヤーのHPを合計${cp.bigDamageMin}以上減らしていれば発動（集団戦術。攻撃・効果どちらでも。シールドで防がれた分は数えない）`,
  },
  healedThisTurn: {
    id: 'healedThisTurn',
    tier: 'normal',
    label: 'このターン自分が回復した',
    textPrefix: 'このターン回復していれば、',
    timings: null,
    group: 'このターン',
    description: '自分のターン中に、自分のHPが1以上回復していれば発動（注入。回復・吸収・絆魂・ターン開始時の再生のどれでも）',
  },
  notFirstCard: {
    id: 'notFirstCard',
    tier: 'loose',
    label: `このターン${cp.notFirstCardFrom}枚目以降に使う`,
    textPrefix: `このターン${cp.notFirstCardFrom}枚目以降なら、`,
    timings: ['play', 'summon', 'cardPlayed'],
    group: 'このターン',
    description: `このターン${cp.notFirstCardFrom}枚目以降に使ったカード（またはそのときの誘発）なら発動（怒濤）`,
  },
  criticalHp: {
    id: 'criticalHp',
    tier: 'strict',
    label: '自分のHPが4分の1以下',
    textPrefix: '自分のHPが4分の1以下なら、',
    timings: null,
    group: 'HP',
    description: `自分のHPが最大の${Math.round(cp.criticalHpRate * 100)}%以下なら発動（窮地。「半分以下」の厳しい版）`,
  },
  enemyPoisonHigh: {
    id: 'enemyPoisonHigh',
    tier: 'strict',
    label: `相手の毒が${cp.enemyPoisonMin}以上`,
    textPrefix: `相手の毒が${cp.enemyPoisonMin}以上なら、`,
    timings: null,
    group: '状態',
    description: `相手プレイヤーの毒が${cp.enemyPoisonMin}以上なら発動（堕落。「相手が毒状態」の厳しい版）`,
  },
  delirium: {
    id: 'delirium',
    tier: 'normal',
    label: `捨て札にカードの種類が${cp.deliriumMin}種類以上`,
    textPrefix: `捨て札にカードの種類が${cp.deliriumMin}種類以上あれば、`,
    timings: null,
    group: '捨て札',
    description: `自分の捨て札に、種類（モンスター・アタック・スキル・パワー・呪い）が${cp.deliriumMin}種類以上あれば発動（昂揚。パワーアタックはパワー、呪いのカードは呪いとしても数える。ノイズは数えない）`,
  },
  skillsInDiscard: {
    id: 'skillsInDiscard',
    tier: 'loose',
    label: `捨て札にスキルが${cp.skillsInDiscardMin}枚以上`,
    textPrefix: `捨て札にスキルが${cp.skillsInDiscardMin}枚以上あれば、`,
    timings: null,
    group: '捨て札',
    description: `自分の捨て札に種類「スキル」のカードが${cp.skillsInDiscardMin}枚以上あれば発動（魔巧）`,
  },
  exploit: {
    id: 'exploit',
    tier: 'normal',
    label: '自分のモンスター1体を生け贄にしたなら',
    textPrefix: '自分のモンスター1体を生け贄にしたなら、',
    timings: ['play', 'summon'],
    notForCost: true,
    group: 'コスト・追加の支払い',
    description: '使ったとき（召喚時）に自分のモンスター1体を生け贄にしてよく、そうしたら発動（濫用。選ばなくてもよい。召喚時は出たモンスター自身も選べる）',
  },
  clash: {
    id: 'clash',
    tier: 'strict',
    label: '激突に勝つ',
    textPrefix: '激突して勝てば、',
    timings: null,
    group: '運・先後',
    description: '効果が出るたびに、お互いの山札の一番上のカードを公開してコストを比べ、自分の方が大きければ発動（同じなら負け。山札の順は変わらない）',
    notForCost: true,
  },
  // ---- MTG 要素 ○ バッチC1
  kicked: {
    id: 'kicked',
    tier: 'normal',
    label: 'キッカーを払っていれば',
    textPrefix: 'キッカーを払っていれば、',
    timings: ['play', 'summon', 'fromDiscard'],
    requiresAbility: ['kicker'],
    notForCost: true,
    group: 'コスト・追加の支払い',
    description: '使うときにキッカー（追加のエナジー）を払っていれば発動。カードの能力「キッカー」があるカードだけ（新生＝新生の効果＋この条件）',
  },
  // ---- MTG 要素 ○ バッチC2
  tribeAlly: {
    id: 'tribeAlly',
    tier: 'normal',
    label: '同じ種族の自分のモンスターがいる',
    textPrefix: '同じ種族の自分のモンスターがいれば、',
    timings: null,
    requiresTribe: true,
    notForCost: true,
    group: '種族・速度・王冠',
    description: 'このカードと同じ種族の自分のモンスター（このモンスター自身を除く）が場にいれば発動（部族シナジー）。種族のあるカードだけ',
  },
  maxSpeed: {
    id: 'maxSpeed',
    tier: 'strict',
    label: '速度が最大',
    textPrefix: '速度が最大なら、',
    timings: null,
    group: '種族・速度・王冠',
    description: `自分の速度が最大（${BALANCE.speed.max}）なら発動（最高速度。速度は「エンジン始動」で始まり、自分のターンに相手のHPを減らすと1ターン1回上がる）`,
  },
  hasCrown: {
    id: 'hasCrown',
    tier: 'normal',
    label: '王冠を持っている',
    textPrefix: '王冠を持っていれば、',
    timings: null,
    group: '種族・速度・王冠',
    description: '自分が王冠を持っていれば発動（統治者。王冠は「王冠を得る」で得て、相手のモンスターの攻撃でHPが減ると奪われる）',
  },
};

/**
 * 条件の倍率（条件ごとの値。決定事項 #68）。「キッカーを払っていれば」はカードのキッカーの追加エナジーで決まる
 * （card を省略すると condition.kicked）
 */
export function conditionMultiplier(condition: ConditionId | null, card: { abilities?: Abilities } = {}): number {
  if (condition === null) return 1;
  if (condition === 'kicked') {
    const k = abilityValue(card.abilities, 'kicker');
    if (k !== undefined) {
      const table = BALANCE.conditionByKicker;
      return table[Math.min(Math.max(k - 1, 0), table.length - 1)]!;
    }
  }
  return BALANCE.condition[condition];
}

/** 条件付き軽減（カードの能力）に使える条件（CONDITION_GROUPS の順） */
export function costConditions(): ConditionId[] {
  const ids = (Object.keys(CONDITIONS) as ConditionId[]).filter((id) => !CONDITIONS[id].notForCost && !CONDITIONS[id].requiresAbility);
  return ids.sort((a, b) => CONDITION_GROUPS.indexOf(CONDITIONS[a].group) - CONDITION_GROUPS.indexOf(CONDITIONS[b].group));
}

/**
 * このタイミング（と土台）で選べる条件（CONDITION_GROUPS の順）。abilities を渡すと、能力が要る条件（キッカーを払っていれば）は
 * その能力があるときだけ。省略すると能力が要る条件は出さない
 */
export function conditionsFor(timing: TimingId, base: CardBase, abilities?: Abilities): ConditionId[] {
  const power = isPowerTiming(timing, base);
  const ids = (Object.keys(CONDITIONS) as ConditionId[]).filter((id) => {
    const c = CONDITIONS[id];
    if (c.requiresAbility && !hasAnyAbility(abilities, c.requiresAbility)) return false;
    if (power && c.notForPower) return false;
    if (c.bases && !c.bases.includes(base)) return false;
    if (c.excludeTimings?.includes(timing)) return false;
    return c.timings === null || c.timings.includes(timing);
  });
  return ids.sort((a, b) => CONDITION_GROUPS.indexOf(CONDITIONS[a].group) - CONDITION_GROUPS.indexOf(CONDITIONS[b].group));
}
