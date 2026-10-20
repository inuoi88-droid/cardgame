/**
 * バランスに関わる数値はすべてこのファイルに置く。
 * 数値はすべて仮。テストプレイで調整する。
 * ここ以外のコードに、ポイント・倍率・上限・HP などの数値を直接書かないこと。
 *
 * 倍率（scale.ts）の付け方（決定事項 #67）：
 * - x(…)：量（HP・ダメージ・攻撃力・毒など）と、ポイント（レアリティ上限・コストの差し引き・固定ポイント・
 *   枚数やターン数1あたりのポイント・デメリット）。すべて同じ倍率
 * - 量1あたりのポイント（ダメージ1につき3pt など）は、量と予算が同じ倍率で増えるので掛けない
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

  /** モンスターのステータス（#84 で体力を 2→1.5pt：モンスターがコスト1の除去（ダメージ5）1枚で倒れにくくする） */
  stats: {
    attackPoints: 3,
    hpPoints: 1.5,
    defensePoints: 4,
    attackMin: 0,
    attackMax: x(30),
    hpMin: 1,
    hpMax: x(50),
    defenseMin: 0,
    defenseMax: x(3),
  },

  /** 発動タイミングの倍率（#73 でパワーの開始時・終了時を 4.0・4.5→6.0・6.5、#74 で 8.0・8.5、#84（パワーの上限3つの後）で 6.0・6.5 に戻す） */
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
    turnStartPower: 6.0,
    turnEndPower: 6.5,
    cardPlayed: 8.0,
    /**
     * MTG 要素の採用：バッチ1（決定事項ログ）。モンスターに付けたときと、モンスター以外（パワーになる）で倍率が違う。
     * 「出るたび」「破壊されるたび」「パワー・スキルを使うたび」は1つにつき1ターン battle.maxRepeatTriggersPerTurn 回まで
     */
    allySummonedMonster: 1.5,
    allySummonedPower: 5.0,
    allyDestroyedMonster: 1.2,
    allyDestroyedPower: 4.0,
    powerPlayedMonster: 1.0,
    powerPlayedPower: 3.0,
    skillPlayedMonster: 1.5,
    skillPlayedPower: 4.5,
    /** 「相手プレイヤーにダメージを与えたとき」（モンスター専用。二回攻撃なら攻撃回数を掛ける） */
    hitEnemyPlayer: 1.5,
  },

  /** 対象の倍率。self / enemyPlayer / board は選択肢のない固定対象（#73 で相手全体 2.5→3.5） */
  target: {
    chosen: 1.0,
    random: 0.6,
    enemyMonsters: 2.0,
    enemyAll: 3.5,
    everyone: 1.0,
    self: 1.0,
    enemyPlayer: 1.0,
    board: 1.0,
    /** このモンスター（効果を持つモンスター自身。MTG 要素バッチ1） */
    thisMonster: 1.0,
    /** 自分のモンスター全体（MTG 要素バッチ1） */
    allyMonsters: 2.0,
  },
  /** モンスターにしか作用しない効果（処刑・封印など）の「敵味方すべて」はプレイヤーに当たらないぶん高い（決定事項 #68） */
  targetMonsterOnly: {
    everyone: 1.4,
  },

  /**
   * 条件の倍率（条件ごと。決定事項 #68。「ゆるい／ふつう／きびしい」はエディターの見出しだけ）。
   * #84 でダメージを 2→3pt にしたとき、作成例「とどめの一撃」（レア・コスト2、毒なら20）が作れるよう相手が毒状態を 0.7→0.45、
   * それより厳しい「毒とやけど」を 0.5→0.35
   */
  condition: {
    hasMonster: 0.9,
    smallHand: 0.8,
    enemyPoisoned: 0.45,
    nthCard: 0.7,
    manyMonsters: 0.6,
    enemyHpHigher: 0.6,
    lowHp: 0.5,
    enemyPoisonBurn: 0.35,
    /** MTG 要素の採用：バッチ1（決定事項ログ） */
    enemyDamagedThisTurn: 0.6,
    monsterDestroyedThisTurn: 0.6,
    allyAttackedThisTurn: 0.7,
    loneMonster: 0.7,
    twoPowers: 0.6,
    coinFlip: 0.5,
    secondPlayer: 0.5,
    emptyHand: 0.5,
    bigMonster: 0.7,
    bigDiscard: 0.7,
    monsterInHand: 0.8,
    twoSummonsThisTurn: 0.5,
  },

  /** 条件に出てくる数 */
  conditionParams: {
    /** 「手札が3枚以下」 */
    smallHandMax: 3,
    /** 「このターン3枚目以降に使う」 */
    nthCardOrLater: 3,
    /** 「自分の場にモンスターが3体以上」 */
    manyMonstersMin: 3,
    /** 「攻撃力4以上の自分のモンスターがいる」（量なので倍率を掛ける） */
    bigMonsterAttack: x(4),
    /** 「捨て札が10枚以上」 */
    discardMin: 10,
    /** 「自分のパワーが2つ以上」 */
    powersMin: 2,
    /** 「このターンにモンスターを2体以上出した」 */
    summonsMin: 2,
  },

  /**
   * 効果に付けるオプション（基礎ポイントへの上乗せ率）。pierce・drain はダメージ系、
   * xEnergy・perEnemyMonster・perCardPlayed は数値に掛ける倍数（MTG 要素バッチ1。1効果に1つまで）
   */
  modifiers: {
    pierce: 0.4,
    drain: 0.4,
    xEnergy: 0.2,
    perEnemyMonster: 0.5,
    perCardPlayed: 0.8,
  },
  modifierParams: {
    /** 「相手モンスター1体につき」「このターン使ったカード1枚につき」の数の上限 */
    scaleCountCap: 3,
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

  /**
   * 効果の基礎ポイント（価格表は決定事項 #68。#73 で処刑・シールド・回復・毒・再生を調整、#75 でシールド・回復・再生を再調整、
   * #84 でダメージ・連撃を 2→3（コスト1のダメージだけの呪文が 7.5→5。除去と顔へのダメージが強すぎ、モンスターが育たなかった）、やけどを 10→9、処刑を 1.5→2.5）
   */
  effects: {
    damage: { perValue: 3 },
    multiHit: { perValueHit: 3 },
    /** 処刑の N は体力の上限。#84 で 1.5→2.5（体力が 1.5pt になり、コスト1の処刑でコスト2のモンスターまで確実に倒せていた） */
    execute: { perValue: 2.5 },
    counter: { perValue: 2 },

    shield: { perValue: 3.5 },
    heal: { perValue: 4 },
    nullify: { flat: x(10) },
    cleanse: { flat: x(8) },
    repair: { perValue: 1 },

    /** 毒は残り続けて合計ダメージが大きくなるので、1つの効果で与えられる値に上限を置く */
    poison: { perValue: 4, maxValue: x(10) },
    burn: { flat: x(9), perExtraTurn: x(3), maxExtraTurns: 5 },
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
    regen: { perValue: 5 },

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

    /**
     * MTG 要素の採用：バッチ2（決定事項ログ）。価格は目安。
     * トークン生成：基礎 =（強さ N × perValue + perToken）× 体数 M。強さは攻撃力と体力の両方（守備力0）
     */
    token: { perValue: 4, perToken: x(1), maxValue: x(5), maxTokens: 3 },
    /** 鍛錬：攻撃力と体力を+N（永続） */
    train: { perValue: 4.5, maxValue: x(10) },
    /** 衰弱：攻撃力と体力を−N（体力が0になると破壊） */
    wither: { perValue: 5, maxValue: x(10) },
    /** キーワード付与：与えるキーワードごとの固定ポイント */
    grantKeyword: {
      haste: x(4),
      taunt: x(7),
      flying: x(3),
      trample: x(2),
      undying: x(4),
      deathtouch: x(6),
      lifelink: x(3),
      divineShield: x(4),
      hexproof: x(4),
      firstStrike: x(2),
    },
    /** 格闘：自分のモンスター1体と相手モンスター1体が互いに攻撃力ぶんのダメージを与え合う */
    fight: { flat: x(9) },
    /** 再行動：もう一度攻撃できるようにする（1体につき1ターン1回） */
    ready: { flat: x(10) },
    /** 占術の N は枚数 */
    scry: { perValue: x(1.5), maxValue: 5 },
    /** 手札整理：N 枚引いて1枚捨てる。N は枚数 */
    loot: { perValue: x(3), maxValue: 3 },
    purge: { flat: x(3) },
    /** 倍化：毒は1つの効果の毒の上限（poison.maxValue）まで、出血は bleedMaxAdd まで増える。筋力は strengthCap まで */
    double: { flat: x(12), bleedMaxAdd: x(5) },
    /** 呪縛：相手のターン開始時に N ダメージ（減らない）。合計は battle.doomCap まで */
    doom: { perValue: 15, maxValue: x(2) },
    /** 一時強化：このターンだけ攻撃力+N */
    pump: { perValue: 1.5, maxValue: x(10) },
  },

  /** モンスター専用キーワードのポイント（A は攻撃力）。挑発は #83（カードの効果の対象も挑発に限る）のあと #84 で 6→8 */
  keywords: {
    haste: { perAttack: 2 },
    taunt: { flat: x(8) },
    flying: { flat: x(3) },
    /** 貫通：max(min, 攻撃力×perAttack) */
    trample: { min: x(2), perAttack: 0.5 },
    doubleAttack: { perAttack: 4, attacks: 2 },
    stealth: { flat: x(2), perAttack: 1 },
    undying: { flat: x(3), perAttack: 1 },
    selfRepair: { perValue: 2 },
    /** MTG 要素の採用：バッチ2（決定事項ログ）。接死・先制攻撃・呪禁・絆魂・武士道・聖盾 */
    deathtouch: { flat: x(6) },
    /** 先制攻撃：max(min, 攻撃力×perAttack) */
    firstStrike: { min: x(2), perAttack: 0.5 },
    hexproof: { flat: x(4) },
    /** 絆魂：max(min, 攻撃力×perAttack) */
    lifelink: { min: x(1), perAttack: 1 },
    /** 武士道 N：モンスターと戦うときだけ攻撃力+N */
    bushido: { perValue: 2, maxValue: x(5) },
    divineShield: { flat: x(4) },
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
    /** MTG 要素の採用：バッチ2（決定事項ログ）。防衛：max(min, 攻撃力×perAttack)（固定値） */
    defender: { min: x(1), perAttack: 2 },
    /** 寿命 N（N＝1・2・3 の順の固定値。短いほど大きい） */
    lifespan: { byTurns: [x(6), x(4), x(2)] },
    /** 腐乱：max(min, 攻撃力×perAttack)（固定値） */
    decay: { min: x(1), perAttack: 1 },
    exhaust: { flat: x(3) },
    /** 生け贄（タイミングの倍率を掛ける。使用時・召喚時だけ） */
    sacrifice: { flat: x(5) },
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
    /**
     * 後攻の1ターン目の補正（先攻後攻の差の調整つまみ。#73 でエナジー+1 を採用：後攻の1ターン目は 3+1＝4）。
     * BonusEnergy は成長表の基本エナジーに足す（1ターンの増加の上限には数えない）。ExtraDraw はそのターンに引く枚数に足す
     * （後攻の1ターン目は配った手札を使うので、0 なら引かない：#47・#51）。シミュレーション（scripts/sim/）で比べる
     */
    secondPlayerFirstTurnBonusEnergy: 1,
    secondPlayerFirstTurnExtraDraw: 0,
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
    /**
     * 「自分のモンスターが出るたび」「自分の他のモンスターが破壊されるたび」「パワー・スキルを使うたび」が発動するのは、
     * 1つ（パワー・モンスター）につき通算ターン1つあたりこの回数まで（MTG 要素バッチ1）
     */
    maxRepeatTriggersPerTurn: 2,
    /** 場に残せるパワーは1人この数まで。超えるときはいちばん古いものが消える（決定事項 #80。数なので倍率は掛けない） */
    maxPowers: 3,
    /** 相手の効果で減らされる、次のターンのエナジーの上限 */
    maxEnergyJamPerTurn: 1,
    /** 相手の効果で減らされる、次のターンに引く枚数の上限 */
    maxDrawJamPerTurn: 2,
    /** 相手の効果で自分の山札に入れられるノイズは、1ターンにこの枚数まで */
    maxNoiseReceivedPerTurn: 3,
    /** トークン（MTG 要素バッチ2）：場に出せるトークンは1人この数まで（数なので倍率は掛けない） */
    maxTokens: 5,
    tokenName: '小鬼',
    tokenIcon: '👺',
    /** 呪縛（MTG 要素バッチ2）の合計の上限 */
    doomCap: x(5),
  },
} as const;

export type Balance = typeof BALANCE;
