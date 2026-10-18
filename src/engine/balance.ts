/**
 * バランスに関わる数値はすべてこのファイルに置く。
 * 数値はすべて仮。テストプレイで調整する。
 * ここ以外のコードに、ポイント・倍率・上限・HP などの数値を直接書かないこと。
 *
 * 倍率（scale.ts）の付け方（決定事項 #67）：
 * - x(…)：量（HP・ダメージ・攻撃力・毒など）と、ポイント（レアリティ上限・コストの差し引き・固定ポイント・
 *   枚数やターン数1あたりのポイント・デメリット）。すべて同じ倍率
 * - 量1あたりのポイント（ダメージ1につき2pt など）は、量と予算が同じ倍率で増えるので掛けない
 * - 枚数・エナジー・ターン数・回数には掛けない
 */
import { SCALE } from './scale.ts';

const x = (n: number): number => n * SCALE;

export const BALANCE = {
  /** 倍率（決定事項 #67）。エディターの−／＋の幅にも使う */
  scale: SCALE,
  /** 量の倍率。scale と同じ（名前は移行のために残す）。カードに記録する scale もこれ */
  amountScale: SCALE,

  /** カード作成の基本ルール */
  card: {
    costMin: 0,
    costMax: 5,
    /** コストごとに引くポイント（添字がコスト。決定事項 #67） */
    costPoints: [x(0), x(10), x(20), x(32), x(45), x(58)],
    /** コスト0のカードはレアリティ上限をこれだけ下げる（決定事項 #67） */
    cost0CapPenalty: x(2),
    nameMaxLength: 16,
  },

  /** レアリティごとの上限。deckLimit / perNameLimit が null なら制限なし */
  rarity: {
    common: { cap: x(5), maxEffects: 3, deckLimit: null, perNameLimit: null },
    rare: { cap: x(8), maxEffects: 4, deckLimit: 8, perNameLimit: 3 },
    epic: { cap: x(12), maxEffects: 4, deckLimit: 4, perNameLimit: 2 },
    legend: { cap: x(18), maxEffects: 4, deckLimit: 2, perNameLimit: 1 },
  },

  deck: {
    size: 30,
  },

  /**
   * 呪いカード（決定事項 #64）。デメリットで差し引けるポイントには上限がある。
   * 上限を超えたデメリットはカードを弱くするだけで、効果を強くする役には立たない。
   */
  curse: {
    /** デメリットで差し引けるポイントの上限（レアリティ上限に対する倍率） */
    maxOffsetRate: 1,
    /** このコスト未満のカードは、デメリットで差し引けない（エナジーなしで使えるカードを強くしすぎない） */
    minCostForOffset: 1,
  },

  /** モンスターのステータス */
  stats: {
    attackPoints: 3,
    hpPoints: 2,
    defensePoints: 4,
    attackMin: 0,
    attackMax: x(30),
    hpMin: 1,
    hpMax: x(50),
    defenseMin: 0,
    defenseMax: x(3),
  },

  /** 発動タイミングの倍率 */
  timing: {
    play: 1.0,
    summon: 1.0,
    destroyed: 0.7,
    damaged: 1.5,
    /** 「攻撃するたび」は攻撃回数（二回攻撃なら2）を掛け、速攻があれば attackHasteBonus を足す（決定事項 #68） */
    attack: 2.0,
    attackHasteBonus: 1.0,
    turnStartMonster: 2.0,
    turnEndMonster: 2.5,
    turnStartPower: 4.0,
    turnEndPower: 4.5,
    cardPlayed: 8.0,
  },

  /** 対象の倍率。self / enemyPlayer / board は選択肢のない固定対象 */
  target: {
    chosen: 1.0,
    random: 0.6,
    enemyMonsters: 2.0,
    enemyAll: 2.5,
    everyone: 1.0,
    self: 1.0,
    enemyPlayer: 1.0,
    board: 1.0,
  },
  /** モンスターにしか作用しない効果（処刑・封印など）の「敵味方すべて」はプレイヤーに当たらないぶん高い（決定事項 #68） */
  targetMonsterOnly: {
    everyone: 1.4,
  },

  /** 条件の倍率（条件ごと。決定事項 #68。「ゆるい／ふつう／きびしい」はエディターの見出しだけ） */
  condition: {
    hasMonster: 0.9,
    smallHand: 0.8,
    enemyPoisoned: 0.7,
    nthCard: 0.7,
    manyMonsters: 0.6,
    enemyHpHigher: 0.6,
    lowHp: 0.5,
    enemyPoisonBurn: 0.5,
  },

  /** 条件に出てくる数 */
  conditionParams: {
    /** 「手札が3枚以下」 */
    smallHandMax: 3,
    /** 「このターン3枚目以降に使う」 */
    nthCardOrLater: 3,
    /** 「自分の場にモンスターが3体以上」 */
    manyMonstersMin: 3,
  },

  /** ダメージ効果に付けるオプション（基礎ポイントへの上乗せ率） */
  modifiers: {
    pierce: 0.4,
    drain: 0.4,
  },

  /** 効果の数値 N の入力範囲（効果ごとの上書きは effects 側の maxValue）。value は量、count は枚数・ターン数・エナジー */
  params: {
    valueMin: 1,
    valueMax: x(30),
    countMin: 1,
    countMax: 30,
    hitsMin: 2,
    hitsMax: 5,
    /** 1枚のカードのダメージ・連撃の合計（値×回数）の上限（決定事項 #64） */
    damagePerCardMax: x(30),
  },

  /** 効果の基礎ポイント（価格表は決定事項 #68） */
  effects: {
    damage: { perValue: 2 },
    multiHit: { perValueHit: 2 },
    execute: { perValue: 2 },
    counter: { perValue: 2 },

    shield: { perValue: 1.5 },
    heal: { perValue: 2 },
    nullify: { flat: x(10) },
    cleanse: { flat: x(8) },
    repair: { perValue: 1 },

    /** 毒は残り続けて合計ダメージが大きくなるので、1つの効果で与えられる値に上限を置く */
    poison: { perValue: 3, maxValue: x(10) },
    burn: { flat: x(10), perExtraTurn: x(3), maxExtraTurns: 5 },
    freeze: { flat: x(10) },
    /** 弱体・脆弱の N はターン数（上限あり） */
    weak: { perValue: x(5), maxValue: 3 },
    vulnerable: { perValue: x(7), maxValue: 3 },
    bleed: { perValue: 6 },
    seal: { flat: x(8) },
    confuse: { flat: x(4) },

    strength: { perValue: 9 },
    focus: { perValue: 3 },
    attackUp: { perValue: 3 },
    defenseUp: { perValue: 4, maxValue: x(3) },
    regen: { perValue: 3 },

    draw: { perValue: x(4) },
    energy: { perValue: x(8) },
    savings: { perValue: x(7) },
    discount: { flat: x(7) },
    search: { flat: x(8) },
    recall: { flat: x(8) },
    retain: { flat: x(4) },

    drawJam: { flat: x(5) },
    energyJam: { flat: x(12) },
    noise: { perValue: x(3) },
    /** バウンスの N は「コストN以下」。N が大きいほど戻せる相手が増える（決定事項 #68） */
    bounce: { flat: x(8), perCost: x(4) },
    weaken: { perValue: 3, maxValue: x(5) },
    dispel: { flat: x(10) },

    /** 蘇生の N はコスト */
    revive: { flat: x(10), perValue: x(7) },
    /** flatKeep：コピーがデッキに残る版の固定ポイント */
    duplicate: { flat: x(12), flatKeep: x(15) },
    wipe: { flat: x(25) },
    steal: { flat: x(45) },
  },

  /** モンスター専用キーワードのポイント（A は攻撃力） */
  keywords: {
    haste: { perAttack: 2 },
    taunt: { flat: x(6) },
    flying: { flat: x(3) },
    /** 貫通：max(min, 攻撃力×perAttack) */
    trample: { min: x(2), perAttack: 0.5 },
    doubleAttack: { perAttack: 4, attacks: 2 },
    stealth: { flat: x(2), perAttack: 1 },
    undying: { flat: x(3), perAttack: 1 },
    selfRepair: { perValue: 2 },
  },

  /**
   * デメリットのポイント（正の数で持ち、合計から引く）。
   * fixed は倍率込みの固定値（タイミングを選ばない）。
   */
  drawbacks: {
    selfDamage: { perValue: 1.5 },
    selfPoison: { perValue: 2 },
    selfBurn: { flat: x(8) },
    discardRandom: { flat: x(4), count: 1 },
    recoil: { flat: x(8), energyLoss: 1 },
    /** 汚染の N はノイズの枚数 */
    pollute: { perValue: x(2) },
    gift: { flat: x(3), extraDraw: 1 },
    upkeep: { fixed: x(6), damage: x(1) },
    parasite: { fixed: x(5), damage: x(2) },
    /** 裏切り：fixed + 攻撃力×perAttack（強いモンスターほど裏切りが痛い） */
    betrayal: { fixed: x(6), perAttack: 3, turns: 3 },
  },

  /** オンライン対戦（決定事項 #57） */
  online: {
    /** 1ターンの制限時間（秒） */
    turnSeconds: 90,
    /** マリガンの制限時間（秒） */
    mulliganSeconds: 90,
    /** 続けて時間切れになったら負けになる回数 */
    timeoutLoseCount: 3,
  },

  /** 対戦ルール（Phase 2 で使う。効果テキストにも出てくる） */
  battle: {
    playerHp: x(120),
    /**
     * ターン開始時のエナジー（決定事項 #69）。自分のターンを迎えた回数（turnsTaken）が fromTurn 以上なら energy。
     * 後ろの段ほど優先（1〜3ターン目 3、4〜6ターン目 4、7ターン目以降 5）
     */
    energySchedule: [
      { fromTurn: 1, energy: 3 },
      { fromTurn: 4, energy: 4 },
      { fromTurn: 7, energy: 5 },
    ],
    drawPerTurn: 5,
    /** マリガンで全部引き直すときの最低枚数 */
    mulliganMinHand: 1,
    /** 先攻の1ターン目はエナジーがこれだけ少ない（3−1＝2） */
    firstPlayerFirstTurnPenalty: 1,
    maxTurns: 30,
    minMonsterDamage: x(1),
    burnTurns: 3,
    burnDamage: x(2),
    burnHealRate: 0.5,
    weakRate: 0.25,
    vulnerableRate: 0.5,
    noiseRemoveCost: 1,
    freezeCostIncrease: 1,
    discountAmount: 1,
    drawJamAmount: 1,
    energyJamAmount: 1,
    drainRate: 0.5,
    /** 毒・再生はターン開始時の処理のあと、この割合だけ残る（切り捨て。0.5 なら半分：決定事項 #69） */
    poisonKeepRate: 0.5,
    regenKeepRate: 0.5,
    /** 筋力の合計の上限（決定事項 #70 R9） */
    strengthCap: x(10),
    /**
     * モンスターの反撃（決定事項 #69）：モンスターを攻撃すると、守られた側が攻撃力ぶんを攻撃したモンスターに返す。
     * テストで切り替えられるように enabled を持つ
     */
    retaliation: { enabled: true },
    /** 不屈で踏みとどまるときの体力 */
    undyingHp: x(1),
    /** 安全装置（決定事項 #64。#44 の「上限なし」を取り消し、元の仕様に戻す） */
    /** 1ターンに引けるのは合計この枚数まで（ターン開始時の5枚を含む） */
    maxDrawPerTurn: 10,
    /** 1ターンに増やせるエナジーの合計（エナジー効果と貯金） */
    maxEnergyGainPerTurn: 3,
    /** 「カードを使うたび」が発動するのは、パワー1つにつき1ターンにこの回数まで（決定事項 #70 R10） */
    maxCardPlayedTriggersPerTurn: 2,
    /** 相手の効果で減らされる、次のターンのエナジーの上限 */
    maxEnergyJamPerTurn: 1,
    /** 相手の効果で減らされる、次のターンに引く枚数の上限 */
    maxDrawJamPerTurn: 2,
    /** 相手の効果で自分の山札に入れられるノイズは、1ターンにこの枚数まで */
    maxNoiseReceivedPerTurn: 3,
  },
} as const;

export type Balance = typeof BALANCE;
