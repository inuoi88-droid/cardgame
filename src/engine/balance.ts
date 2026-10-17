/**
 * バランスに関わる数値はすべてこのファイルに置く。
 * 数値はすべて仮。テストプレイで調整する。
 * ここ以外のコードに、ポイント・倍率・上限・HP などの数値を直接書かないこと。
 */
export const BALANCE = {
  /** カード作成の基本ルール */
  card: {
    costMin: 0,
    costMax: 5,
    /** コスト1あたりに引くポイント */
    pointsPerCost: 10,
    nameMaxLength: 16,
  },

  /** レアリティごとの上限。deckLimit / perNameLimit が null なら制限なし */
  rarity: {
    common: { cap: 5, maxEffects: 2, deckLimit: null, perNameLimit: null },
    rare: { cap: 8, maxEffects: 3, deckLimit: 16, perNameLimit: 5 },
    epic: { cap: 12, maxEffects: 3, deckLimit: 8, perNameLimit: 3 },
    legend: { cap: 18, maxEffects: 3, deckLimit: 4, perNameLimit: 1 },
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
    attackMax: 30,
    hpMin: 1,
    hpMax: 50,
    defenseMin: 0,
    defenseMax: 3,
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

  /** 効果の数値 N の入力範囲（効果ごとの上書きは effects 側の maxValue） */
  params: {
    valueMin: 1,
    valueMax: 30,
    hitsMin: 2,
    hitsMax: 5,
    /** 1枚のカードのダメージ・連撃の合計（値×回数）の上限（決定事項 #64） */
    damagePerCardMax: 30,
  },

  /** 効果の基礎ポイント */
  effects: {
    damage: { perValue: 2 },
    multiHit: { perValueHit: 2 },
    execute: { perValue: 3 },
    counter: { perValue: 1.5 },

    shield: { perValue: 1.5 },
    heal: { perValue: 3 },
    nullify: { flat: 15 },
    cleanse: { flat: 6 },
    repair: { perValue: 1 },

    /** 毒は残り続けて合計ダメージが大きくなるので、1つの効果で与えられる値に上限を置く */
    poison: { perValue: 3, maxValue: 10 },
    burn: { flat: 10, perExtraTurn: 3, maxExtraTurns: 10 },
    freeze: { flat: 12 },
    weak: { perValue: 4 },
    vulnerable: { perValue: 5 },
    bleed: { perValue: 3 },
    seal: { flat: 15 },
    confuse: { flat: 8 },

    strength: { perValue: 8 },
    focus: { perValue: 2 },
    attackUp: { perValue: 3 },
    defenseUp: { perValue: 4, maxValue: 3 },
    regen: { perValue: 4 },

    draw: { perValue: 5 },
    energy: { perValue: 9 },
    savings: { perValue: 7 },
    discount: { flat: 7 },
    search: { flat: 8 },
    recall: { flat: 8 },
    retain: { flat: 4 },

    drawJam: { flat: 10 },
    energyJam: { flat: 15 },
    noise: { perValue: 4 },
    bounce: { flat: 12 },
    weaken: { perValue: 3 },
    dispel: { flat: 12 },

    revive: { flat: 10, perValue: 5 },
    /** keepRate：コピーがデッキに残る版の上乗せ率 */
    duplicate: { flat: 12, keepRate: 0.5 },
    wipe: { flat: 25 },
    steal: { flat: 35 },
  },

  /** モンスター専用キーワードのポイント */
  keywords: {
    haste: { perAttack: 2 },
    taunt: { flat: 8 },
    flying: { flat: 6 },
    trample: { flat: 5 },
    doubleAttack: { perAttack: 3, attacks: 2 },
    stealth: { flat: 5 },
    undying: { flat: 8 },
    selfRepair: { perValue: 3 },
  },

  /**
   * デメリットのポイント（正の数で持ち、合計から引く）。
   * fixed は倍率込みの固定値。
   */
  drawbacks: {
    selfDamage: { perValue: 1.5 },
    selfPoison: { perValue: 2 },
    selfBurn: { flat: 7 },
    discardRandom: { flat: 5, count: 1 },
    recoil: { flat: 10, energyLoss: 1 },
    pollute: { perValue: 3 },
    gift: { flat: 4, extraDraw: 1 },
    upkeep: { fixed: 4, damage: 1 },
    parasite: { fixed: 5, damage: 2 },
    betrayal: { fixed: 12, turns: 3 },
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
    playerHp: 60,
    energyPerTurn: 3,
    drawPerTurn: 5,
    /** マリガンで全部引き直すときの最低枚数 */
    mulliganMinHand: 1,
    firstPlayerFirstTurnEnergy: 2,
    maxTurns: 30,
    minMonsterDamage: 1,
    burnTurns: 3,
    burnDamage: 2,
    burnHealRate: 0.5,
    weakRate: 0.25,
    vulnerableRate: 0.5,
    noiseRemoveCost: 1,
    freezeCostIncrease: 1,
    discountAmount: 1,
    drawJamAmount: 1,
    energyJamAmount: 1,
    drainRate: 0.5,
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
