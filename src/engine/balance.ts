/**
 * バランスに関わる数値はすべてこのファイルに置く。
 * 数値はすべて仮。テストプレイで調整する。
 * ここ以外のコードに、ポイント・倍率・上限・HP などの数値を直接書かないこと。
 *
 * x(…) はインフレ倍率（scale.ts）を掛けた値。HP・ダメージなどの量と、ポイントの上限・コスト・固定ポイントに付ける。
 * 量1あたりのポイント（ダメージ1につき2pt など）は、量とポイントの両方が同じ倍率で増えるので掛けない。
 * 枚数・エナジー・ターン数1あたりのポイントには掛ける。
 */
import { SCALE } from './scale.ts';

const x = (n: number): number => n * SCALE;

export const BALANCE = {
  /** インフレ倍率（決定事項 #65） */
  scale: SCALE,

  /** カード作成の基本ルール */
  card: {
    costMin: 0,
    costMax: 5,
    /** コスト1あたりに引くポイント */
    pointsPerCost: x(10),
    nameMaxLength: 16,
  },

  /** レアリティごとの上限。deckLimit / perNameLimit が null なら制限なし */
  rarity: {
    common: { cap: x(5), maxEffects: 2, deckLimit: null, perNameLimit: null },
    rare: { cap: x(8), maxEffects: 3, deckLimit: 16, perNameLimit: 5 },
    epic: { cap: x(12), maxEffects: 3, deckLimit: 8, perNameLimit: 3 },
    legend: { cap: x(18), maxEffects: 3, deckLimit: 4, perNameLimit: 1 },
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
    destroyed: 0.8,
    damaged: 1.5,
    attack: 2.0,
    turnStartMonster: 2.5,
    turnEndMonster: 2.5,
    turnStartPower: 3.0,
    turnEndPower: 3.0,
    cardPlayed: 4.0,
  },

  /** 対象の倍率。self / enemyPlayer / board は選択肢のない固定対象 */
  target: {
    chosen: 1.0,
    random: 0.7,
    enemyMonsters: 1.5,
    enemyAll: 2.0,
    everyone: 1.2,
    self: 1.0,
    enemyPlayer: 1.0,
    board: 1.0,
  },

  /** 条件の倍率 */
  condition: {
    loose: 0.8,
    normal: 0.6,
    strict: 0.4,
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
    pierce: 0.5,
    drain: 0.5,
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

  /** 効果の基礎ポイント */
  effects: {
    damage: { perValue: 2 },
    multiHit: { perValueHit: 2 },
    execute: { perValue: 3 },
    counter: { perValue: 1.5 },

    shield: { perValue: 1.5 },
    heal: { perValue: 3 },
    nullify: { flat: x(15) },
    cleanse: { flat: x(6) },
    repair: { perValue: 1 },

    /** 毒は残り続けて合計ダメージが大きくなるので、1つの効果で与えられる値に上限を置く */
    poison: { perValue: 3, maxValue: x(10) },
    burn: { flat: x(10), perExtraTurn: x(3), maxExtraTurns: 10 },
    freeze: { flat: x(12) },
    /** 弱体・脆弱の N はターン数 */
    weak: { perValue: x(4) },
    vulnerable: { perValue: x(5) },
    bleed: { perValue: 3 },
    seal: { flat: x(15) },
    confuse: { flat: x(8) },

    strength: { perValue: 8 },
    focus: { perValue: 2 },
    attackUp: { perValue: 3 },
    defenseUp: { perValue: 4, maxValue: x(3) },
    regen: { perValue: 4 },

    draw: { perValue: x(5) },
    energy: { perValue: x(9) },
    savings: { perValue: x(7) },
    discount: { flat: x(7) },
    search: { flat: x(8) },
    recall: { flat: x(8) },
    retain: { flat: x(4) },

    drawJam: { flat: x(10) },
    energyJam: { flat: x(15) },
    noise: { perValue: x(4) },
    bounce: { flat: x(12) },
    weaken: { perValue: 3 },
    dispel: { flat: x(12) },

    /** 蘇生の N はコスト */
    revive: { flat: x(10), perValue: x(5) },
    /** keepRate：コピーがデッキに残る版の上乗せ率 */
    duplicate: { flat: x(12), keepRate: 0.5 },
    wipe: { flat: x(25) },
    steal: { flat: x(35) },
  },

  /** モンスター専用キーワードのポイント */
  keywords: {
    haste: { perAttack: 2 },
    taunt: { flat: x(8) },
    flying: { flat: x(6) },
    trample: { flat: x(5) },
    doubleAttack: { perAttack: 3, attacks: 2 },
    stealth: { flat: x(5) },
    undying: { flat: x(8) },
    selfRepair: { perValue: 3 },
  },

  /**
   * デメリットのポイント（正の数で持ち、合計から引く）。
   * fixed は倍率込みの固定値。
   */
  drawbacks: {
    selfDamage: { perValue: 1.5 },
    selfPoison: { perValue: 2 },
    selfBurn: { flat: x(7) },
    discardRandom: { flat: x(5), count: 1 },
    recoil: { flat: x(10), energyLoss: 1 },
    /** 汚染の N はノイズの枚数 */
    pollute: { perValue: x(3) },
    gift: { flat: x(4), extraDraw: 1 },
    upkeep: { fixed: x(4), damage: x(1) },
    parasite: { fixed: x(5), damage: x(2) },
    betrayal: { fixed: x(12), turns: 3 },
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
    playerHp: x(60),
    energyPerTurn: 3,
    drawPerTurn: 5,
    /** マリガンで全部引き直すときの最低枚数 */
    mulliganMinHand: 1,
    firstPlayerFirstTurnEnergy: 2,
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
    /** 毒・再生がターン開始時の処理のあとに減る量 */
    poisonDecay: x(1),
    regenDecay: x(1),
    /** 不屈で踏みとどまるときの体力 */
    undyingHp: x(1),
    /** 安全装置（決定事項 #64。#44 の「上限なし」を取り消し、元の仕様に戻す） */
    /** 1ターンに引けるのは合計この枚数まで（ターン開始時の5枚を含む） */
    maxDrawPerTurn: 10,
    /** 1ターンに増やせるエナジーの合計（エナジー効果と貯金） */
    maxEnergyGainPerTurn: 3,
    /** 「カードを使うたび」が発動するのは、パワー1つにつき1ターンにこの回数まで */
    maxCardPlayedTriggersPerTurn: 3,
    /** 相手の効果で減らされる、次のターンのエナジーの上限 */
    maxEnergyJamPerTurn: 1,
    /** 相手の効果で減らされる、次のターンに引く枚数の上限 */
    maxDrawJamPerTurn: 2,
    /** 相手の効果で自分の山札に入れられるノイズは、1ターンにこの枚数まで */
    maxNoiseReceivedPerTurn: 3,
  },
} as const;

export type Balance = typeof BALANCE;
