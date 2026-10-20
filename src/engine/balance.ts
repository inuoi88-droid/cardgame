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
    /** カードの能力（MTG 要素 ○ バッチB）は1枚にこの数まで */
    maxAbilities: 2,
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
    /**
     * MTG 要素 ○ バッチA（決定事項ログ）。引いたとき（奇跡）・自分のカードの対象になるたび（英雄的。モンスター専用）・
     * コスト timingParams.bigCardCost 以上のカードを使うたび（演目。モンスターとパワー）
     */
    drawn: 0.9,
    targeted: 1.5,
    bigCardPlayedMonster: 1.2,
    bigCardPlayedPower: 3.5,
    /**
     * MTG 要素 ○ バッチC1（決定事項ログ）。捨て札から使ったとき（余波）・魂力・起動（起動のエナジー1・2・3 の順。
     * モンスターと、パワー（モンスター以外）で違う）
     */
    fromDiscard: 0.8,
    channel: 1.0,
    activatedMonster: [2.2, 1.6, 1.1],
    activatedPower: [5.0, 3.6, 2.4],
    /**
     * MTG 要素 ○ バッチC2（決定事項ログ）。英雄譚の章（第1章は使ったとき、第2章・第3章は次の自分のターン開始時から1章ずつ）と、
     * 蓄積がたまったとき（chargedPower × min(1, イベントの頻度 ÷ 必要数)。頻度は abilities.charge.rates）
     */
    chapter1: 1.0,
    chapter2: 0.9,
    chapter3: 0.8,
    chargedPower: 6.0,
    /**
     * MTG 要素 △ バッチA（決定事項ログ）。相手のモンスターが攻撃するたび（モンスターとパワーで違う。能力「罠」のパワーは
     * abilities.trap.timingRate）・捨てられたとき（マッドネス）・各ターン初めて自分のカードの対象になったとき（雄姿）
     */
    enemyAttackedMonster: 1.5,
    enemyAttackedPower: 4.0,
    discarded: 0.6,
    valiant: 1.0,
    /** MTG 要素 △ バッチB（決定事項ログ）。能力「相続」（捨て札から除外して使う）・能力「予見」（手札に残したまま使う） */
    renew: 0.9,
    forecast: 1.0,
    /**
     * MTG 要素 △ バッチC（決定事項ログ）。出来事（モンスターのカードを呪文として使う。能力「出来事」の abilities.adventure.rate も掛ける）・
     * 達成したとき・Lvが上がったとき（最大2回）・忠誠+1（毎ターン使える）・忠誠−K（忠誠 L ≥ K なら最初から使えるので [0]、そうでなければ [1]）・
     * 表になったとき・砦を落としたとき（砦の体力 N（倍率1の数字）2〜6 の順。体力が多いほど落としにくい）
     */
    adventure: 1.0,
    achievedNow: 0.7,
    leveledUp: 1.6,
    loyaltyPlus: 4.0,
    loyaltyMinus: [1.2, 0.8],
    revealed: 0.9,
    siegeWonByHp: [0.9, 0.8, 0.7, 0.6, 0.5],
  },
  /** タイミングに出てくる数（MTG 要素 ○ バッチA） */
  timingParams: {
    /** 「コスト3以上のカードを使うたび」（印刷コスト） */
    bigCardCost: 3,
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
    /** MTG 要素 ○ バッチA：自分の他のモンスター全体（喊声）・いちばん体力の低い自分のモンスター（鼓舞）・お互い（対称効果。相手も得するぶん安い） */
    otherAllies: 1.8,
    weakestAlly: 0.9,
    bothPlayers: 0.4,
    /** MTG 要素 ○ バッチC2：同じ種族の自分のモンスター全体（ロード）。#95 で 1.6→2.0（同じ種族だけのデッキでは自分のモンスター全体と同じになるため） */
    tribeAllies: 2.0,
    /** MTG 要素 △ バッチA：攻撃してきたモンスター（「相手のモンスターが攻撃するたび」だけ） */
    attacker: 1.0,
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
    /** MTG 要素 ○ バッチA（決定事項ログ） */
    enemyPlayedMany: 0.6,
    veteran: 0.6,
    strongerAlly: 0.7,
    totalAttack: 0.6,
    twoAllyAttacks: 0.6,
    coven: 0.5,
    delirium: 0.7,
    criticalHp: 0.4,
    bigDamageThisTurn: 0.6,
    skillsInDiscard: 0.85,
    healedThisTurn: 0.6,
    /** 「相手が毒状態」（0.45）より厳しいので低く */
    enemyPoisonHigh: 0.4,
    notFirstCard: 0.8,
    clash: 0.45,
    exploit: 0.6,
    /** MTG 要素 ○ バッチC1：キッカーを払っていれば（キッカーの追加エナジーで conditionByKicker を使う。これはカードが無いとき） */
    kicked: 0.6,
    /** MTG 要素 ○ バッチC2：同じ種族の自分のモンスターがいる・速度が最大・王冠を持っている */
    tribeAlly: 0.7,
    maxSpeed: 0.5,
    /** #95 で 0.6→0.75（モンスターのいないデッキは王冠を奪われにくく、ほぼいつも満たせた） */
    hasCrown: 0.75,
    /** MTG 要素 △ バッチA：このターン3種類以上のカードを使った（収斂）・捨て札にモンスターとパワーが4枚以上（落魄）・このモンスターがこのターン攻撃していない（長久） */
    converge: 0.5,
    descend: 0.7,
    rested: 0.7,
    /** MTG 要素 △ バッチB：協約したなら（トークンかパワーを差し出したとき） */
    bargained: 0.6,
    /** MTG 要素 △ バッチC：達成していれば（事件・進化）・Lv2以上なら・Lv3なら */
    achieved: 0.5,
    level2: 0.6,
    level3: 0.4,
  },
  /** 「キッカーを払っていれば」の倍率（キッカーの追加エナジー1・2 の順。MTG 要素 ○ バッチC1） */
  conditionByKicker: [0.6, 0.45],
  /** 二者択一（魂力。バッチC2 のモード選択も）：高い方＋低い方×otherRate */
  choice: { otherRate: 0.3 },
  /**
   * モード選択（MTG 要素 ○ バッチC2）：ポイント＝「いつも」の効果＋最も高いモード＋他のモードの合計×otherRate。
   * モードは1枚に maxModes まで
   */
  modal: { otherRate: 0.3, maxModes: 3 },

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
    /** MTG 要素 ○ バッチA。「前の相手のターンに相手がカードを3枚以上使った」 */
    enemyCardsMin: 3,
    /** 「このモンスターが3回以上攻撃した」 */
    veteranAttacks: 3,
    /** 「自分のモンスターの攻撃力の合計が8以上」（量なので倍率を掛ける） */
    totalAttackMin: x(8),
    /** 「このターン自分のモンスターが2回以上攻撃した」 */
    allyAttacksMin: 2,
    /** 「攻撃力の違う自分のモンスターが3体以上」 */
    covenMin: 3,
    /** 「捨て札にカードの種類が3種類以上」 */
    deliriumMin: 3,
    /** 「自分のHPが4分の1以下」（最大HPに掛ける割合） */
    criticalHpRate: 0.25,
    /** 「このターン相手に合計6以上のダメージを与えた」（量） */
    bigDamageMin: x(6),
    /** 「捨て札にスキルが2枚以上」 */
    skillsInDiscardMin: 2,
    /** 「相手の毒が3以上」（量） */
    enemyPoisonMin: x(3),
    /** 「このターン2枚目以降に使う」 */
    notFirstCardFrom: 2,
    /** MTG 要素 △ バッチA。「このターン3種類以上のカードを使った」（種類はモンスター・アタック・スキル・パワー） */
    convergeMin: 3,
    /** 「捨て札にモンスターとパワーが合わせて4枚以上」 */
    descendMin: 4,
  },

  /**
   * 効果に付けるオプション（基礎ポイントへの上乗せ率）。pierce・drain はダメージ系、
   * xEnergy・perEnemyMonster・perCardPlayed は数値に掛ける倍数（MTG 要素バッチ1。1効果に1つまで）
   */
  modifiers: {
    pierce: 0.4,
    drain: 0.4,
    xEnergy: 0.2,
    // 測定（決定事項 #89）：0.5 では相手モンスターの多いデッキ（B0）に 100% 勝つため、2体ぶんで元が取れる 1.0 に
    perEnemyMonster: 1.0,
    perCardPlayed: 0.8,
    /** MTG 要素 ○ バッチA：次のターンに（遅延。×0.75）・捨て札のモンスター1枚につき（数値の倍数） */
    nextTurn: -0.25,
    perDiscardMonster: 1.2,
    /** MTG 要素 ○ バッチC2：同じ種族の自分のモンスター1体につき（自分自身を含む。数の上限は scaleCountCap） */
    perTribeAlly: 1.0,
    /** MTG 要素 △ バッチA：萎縮（ダメージで減った体力のぶん最大体力も減る）・経験1につき（数値の倍数）・ばらつき（期待値は同じで少し安い） */
    witherDmg: 0.1,
    perExp: 1.0,
    gamble: -0.1,
  },
  modifierParams: {
    /** 「相手モンスター1体につき」「このターン使ったカード1枚につき」の数の上限 */
    scaleCountCap: 3,
    /** 「捨て札のモンスター1枚につき」の数の上限 */
    discardCountCap: 5,
    /** MTG 要素 △ バッチA。「経験1につき」の数の上限 */
    expCountCap: 5,
    /** 「ばらつき」の倍率（どれか1つがシード乱数で決まる） */
    gambleRates: [0.5, 1, 1.5],
    /** 「ばらつき」の量の刻み（切り捨て。最低もこの値。倍率1では1になる） */
    gambleStep: x(0.5),
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
    token: { perValue: 4, perToken: x(1), maxValue: x(5), maxTokens: 3, normalRate: 1, mobilizeRate: 0.7 },
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

    /**
     * MTG 要素 ○ バッチB（決定事項ログ）。価格は目安。
     * 装備：N×perValue＋flat。討伐：flat＋コストN×perCost。借用：N ターンの順の値。蓄え・準備・動力化：N×perValue
     */
    equip: { perValue: 3, flat: x(3), maxValue: x(5) },
    slay: { flat: x(10), perCost: x(5), maxValue: 5 },
    borrow: { byTurns: [x(14), x(22), x(28)] },
    bank: { perValue: x(3), maxValue: 2 },
    bounty: { flat: x(2), perValue: x(3), maxValue: 2 },
    prepare: { perValue: x(3), maxValue: 2 },
    /** 続唱：flat＋コストN×perCost。山札は maxReveal 枚までめくる */
    cascade: { flat: x(4), perCost: x(8), maxValue: 4, maxReveal: 10 },
    /** 新生：攻撃力 stat・体力 stat のコピー */
    offspring: { flat: x(6), stat: x(1) },
    mill: { selfPerValue: x(0.5), enemyPerValue: x(1), maxValue: 5 },
    /** 封殺：すべての種類なら any、種類を指定すれば typed */
    quash: { any: x(25), typed: x(15) },
    proliferate: { perValue: 5, maxValue: x(3) },
    populate: { flat: x(6) },
    explore: { flat: x(2), perValue: 3, maxValue: x(5) },
    /** 動員：#95 で perValue 5→7（1体に集まり、出たターン以外はすぐ攻撃できる。極端なデッキが基準デッキに全勝した） */
    amass: { perValue: 7, maxValue: x(5) },
    harness: { perValue: x(5), maxValue: 2 },
    /** 徴募：捨てたのがスキルなら攻撃力 stat・体力 stat のトークン */
    recruit: { flat: x(6), stat: x(1) },
    infight: { flat: x(12) },
    seek: { flat: x(5) },
    /** 創出：1枚＝（元の効果の基礎ポイント（ダメージ・回復・シールドの perValue）×N×rate＋flat）。M 枚まで */
    conjure: { flat: x(1), rate: 1.1, maxValue: x(5), maxCards: 2 },
    /** 発見：山札の上 look 枚から1枚 */
    discover: { flat: x(6), look: 3 },
    /** 恩恵：N×perValueUse×M（M 回まで） */
    boon: { perValueUse: 2.5, maxValue: x(5), maxUses: 3 },
    ramp: { flat: x(30) },
    cloneToken: { flat: x(25) },
    /** MTG 要素 ○ バッチC2（決定事項ログ）：エンジン始動（速度ゲージを始める）・王冠を得る */
    startEngine: { flat: x(2) },
    crown: { flat: x(10) },
    /**
     * MTG 要素 △ バッチA（決定事項ログ）。価格は目安。消滅の印・放射能 N（枚数）・経験 N・氷結 N・章を進める・
     * 培養 N（N×perValue＋base）・容疑（攻撃力+attack）・守護（不壊／加護）・賛助 N（N×perValue＋base）・消術 N・
     * 永久強化 N（1枚につき攻撃力・体力それぞれ cardCap まで）・山札消滅 N
     */
    finality: { flat: x(2) },
    rad: { perCount: x(1.2), maxCount: 3 },
    gainExp: { perCount: x(2), maxCount: 2 },
    iceLock: { perCount: x(4), maxCount: 2 },
    advanceSaga: { flat: x(3) },
    incubate: { perValue: 3, base: x(0.5), maxValue: x(5) },
    suspect: { flat: x(5), attack: x(1) },
    guard: { indestructible: x(8), protection: x(7) },
    backup: { perValue: 4.5, base: x(2), maxValue: x(3) },
    fateseal: { perCount: x(1.5), maxCount: 3 },
    perpetual: { perValue: 4, maxValue: x(2), cardCap: x(5) },
    exileMill: { perCount: x(1.2), maxCount: 3 },
    /** トークン生成の「落とし子」（破壊されると持ち主のエナジー+1）：1体につき足す */
    tokenSpawn: { perToken: x(1.5) },
    /** 倍化の「3倍」（レジェンドだけ）：固定ポイントに足す */
    doubleTriple: { flat: x(20) },
    /**
     * MTG 要素 △ バッチC（決定事項ログ）。価格は目安。予示（山札の一番上を裏向きで出す）・追加ターン（レジェンド・1試合1回）・
     * HP交換（レジェンド・1試合1回。自分が得る HP は最大HP×gainCapRate まで）・強奪（相手の山札から look 枚を見て1枚のコピー）・
     * 砦を築く（体力 minValue〜maxValue。報酬は「砦を落としたとき」の倍率で払う）
     */
    manifest: { flat: x(9) },
    extraTurn: { flat: x(40) },
    swapHp: { flat: x(30), gainCapRate: 0.5 },
    heist: { flat: x(8), look: 3 },
    siege: { flat: x(1), minValue: x(2), maxValue: x(6) },
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
    /**
     * 接死：max(flat, 体力×perHp)。反撃でも働くので、体力の高い接死（とくに挑発の壁）は何度も相手を破壊する。
     * 測定（決定事項 #89）：flat だけだと コスト3 の「接死・挑発 1/13」＋火球のデッキが B0・B1 に 100%
     */
    deathtouch: { flat: x(6), perHp: 1 },
    /** 先制攻撃：max(min, 攻撃力×perAttack) */
    firstStrike: { min: x(2), perAttack: 0.5 },
    hexproof: { flat: x(4) },
    /** 絆魂：max(min, 攻撃力×perAttack) */
    lifelink: { min: x(1), perAttack: 1 },
    /** 武士道 N：モンスターと戦うときだけ攻撃力+N */
    bushido: { perValue: 2, maxValue: x(5) },
    divineShield: { flat: x(4) },
    /**
     * MTG 要素 ○ バッチB（決定事項ログ）。一撃離脱（固定）・激励 N・護法 N（N は追加コスト）・猛襲 N・
     * 威圧＝max(min, 攻撃力×perAttack)・分身＝rate×（攻撃力×3＋体力×1.5＋守備力×4。ステータスのポイント）
     */
    hitAndRun: { flat: x(1) },
    /** 激励：#95 で perValue 4.5→5.5（並べるほど増える。極端なデッキが B0 に 88%） */
    inspire: { perValue: 5.5, maxValue: x(3) },
    ward: { perValue: x(3), maxValue: 2 },
    onslaught: { perValue: 2, maxValue: x(5) },
    menace: { min: x(3), perAttack: 1 },
    doubleTeam: { rate: 0.4 },
    /** MTG 要素 △ バッチA（決定事項ログ）。対空（飛行に効く挑発）・潜伏（自分より攻撃力の高い挑発を無視） */
    reach: { flat: x(2) },
    skulk: { flat: x(2) },
    /** MTG 要素 △ バッチB：後援（攻撃するとき、他の自分のモンスター1体を休ませてその攻撃力を足す） */
    enlist: { flat: x(3) },
  },

  /**
   * カードの能力（MTG 要素 ○ バッチB。決定事項ログ）。循環は固定、再利用・反復はこのカードの使用時の効果のポイントの合計×rate、
   * 成長は N×perValue×（使用時のダメージ効果の数。連撃は回数）。成長の上乗せは maxGrow まで
   */
  abilities: {
    shuffleBack: { flat: x(1) },
    buyback: { rate: 0.5 },
    rebound: { rate: 0.7 },
    grow: { perValue: 4.5, maxValue: x(3), maxGrow: x(10) },
    /**
     * MTG 要素 ○ バッチC1（決定事項ログ）。捨て札から使う能力の基礎＝このカードの効果（魂力を除く）・ステータス・キーワードの
     * ポイントの合計。「捨て札から使ったとき」の効果があるカードは、ステータス・キーワードだけ×率＋fromDiscardFlat
     * フラッシュバック：追加コスト0・1・2 の順の率。脱出：除外する枚数 minCount〜maxCount の順の率
     */
    flashback: { rateByExtra: [0.5, 0.4, 0.3], fromDiscardFlat: x(1), maxExtra: 2 },
    jumpStart: { rate: 0.4, fromDiscardFlat: x(1) },
    escape: { rateByCount: [0.9, 0.8, 0.7, 0.6], minCount: 2, maxCount: 5, fromDiscardFlat: x(1) },
    /** 起動：エナジー minCost〜maxCost（ポイントはタイミングの倍率 timing.activatedMonster / activatedPower） */
    activate: { minCost: 1, maxCost: 3, flat: x(0) },
    /** サイクリング：固定のポイントと、払うエナジー */
    cycling: { flat: x(2), cost: 1 },
    /** 魂力：払うエナジーは0〜maxCost（ポイントはタイミングの倍率 timing.channel と二者択一の割引） */
    channel: { maxCost: 2, flat: x(0) },
    /** 親和：perStep×min(maxReduction, 印刷コスト−minCost)。軽減してもコストは minCost まで */
    affinity: { perStep: x(4), maxReduction: 3, minCost: 1 },
    /** 条件付き軽減：perStep×K×条件の倍率（K は印刷コストまで）。軽減してもコストは minCost まで */
    costCut: { perStep: x(10), maxReduction: 2, minCost: 0 },
    /** キッカー：追加エナジー1〜maxExtra（ポイントは条件「キッカーを払っていれば」の倍率） */
    kicker: { maxExtra: 2, flat: x(0) },
    /** MTG 要素 ○ バッチC2（決定事項ログ）。双呪：他のモードの合計×rate を足す。追加エナジー1〜maxExtra */
    entwine: { rate: 0.4, maxExtra: 2 },
    /**
     * 蓄積：必要数 min〜max。イベントごとの頻度（1ターンあたりの見込み。「蓄積がたまったとき」の倍率に使う）。
     * たまるのは1つにつき1ターン battle.maxRepeatTriggersPerTurn 回まで
     */
    charge: { min: 2, max: 5, flat: x(0), rates: { turnStart: 1, cardPlayed: 2, allySummoned: 1, enemyDamaged: 1, allyDestroyed: 0.7 } },
    /**
     * MTG 要素 △ バッチA（決定事項ログ）。蓄積の「プラン（1回きり）」：「蓄積がたまったとき」の倍率×planRate（ただし planMin 未満にしない）。
     * 罠：罠のパワーの効果は、タイミングの倍率の代わりに timingRate（能力自体は0pt）
     */
    chargePlan: { planRate: 0.35, planMin: 1.0 },
    trap: { timingRate: 1.2, flat: x(0) },
    /**
     * MTG 要素 △ バッチB（決定事項ログ）。追加の支払い（放題・段階・切除・奮励・分隊）・代わりの使い方（試作・想起・超過・解鎖）・
     * 差し出す（現出・犠牲・協約・貪食）・払い方（召集・探査・血の支払い・代替コスト）・相手が選ぶ（最悪の二択）・
     * 捨て札から使う（回顧・調和・大混乱・一時蘇生）・捨て札の能力（相続・発掘・不朽）・手札の能力（予見）。
     * rate の配列は追加のエナジー（または数値）の小さい順
     */
    /** 放題：他のモードの合計×otherRate（追加エナジー K＝1・2 の順） */
    spree: { otherRate: [0.5, 0.4], maxCost: 2, flat: x(0) },
    /** 段階：モード A・B・C の追加エナジー。各モードのポイントから 追加エナジー×perEnergy を引いてからモード選択の式 */
    tiered: { surcharge: [0, 1, 2], perEnergy: x(10), flat: x(0) },
    /** 切除：条件付きの効果ごとに（条件なし−条件付き）×rate（K＝1・2） */
    cleave: { rate: [0.6, 0.45], maxCost: 2 },
    /** 奮励：「選んだ1体（相手）」の効果×rate（K＝1・2）。払えるのは maxTimes 回まで */
    strive: { rate: [0.5, 0.35], maxCost: 2, maxTimes: 2 },
    /** 分隊：本体（ステータス・キーワード・効果）×rate（K＝minCost〜maxCost）。払えるのは maxTimes 回まで */
    squad: { rate: [0.45, 0.35, 0.25], minCost: 2, maxCost: 4, maxTimes: 2 },
    /** 試作：perCost×K（K は1〜maxCut、印刷コスト未満）。攻撃力・体力は半分（step の刻みに切り捨て、体力は最低 step） */
    prototype: { perCost: x(2), maxCut: 3, step: x(0.5) },
    /** 想起：召喚時の効果×rate（想起コスト E は 0〜maxCost、印刷コスト未満） */
    evoke: { rate: 0.5, maxCost: 2 },
    /** 超過：「選んだ1体」の効果について（全体の倍率−1）×その効果×rate（K＝1・2・3） */
    overload: { rate: [0.6, 0.45, 0.35] },
    /** 解鎖：N×perValue（N は minValue〜maxValue。量） */
    unleash: { perValue: 2, minValue: x(1), maxValue: x(2) },
    /** 協約：能力は0pt（条件「協約したなら」の倍率 condition.bargained） */
    bargain: { flat: x(0) },
    /** 現出：固定。印刷コスト minCost 以上のカードだけ */
    emerge: { flat: x(3), minCost: 2 },
    /** 犠牲：使用時の効果×rate（N＝x(1)・x(2)・x(3) の順） */
    casualty: { rate: [0.5, 0.4, 0.3], minValue: x(1), maxValue: x(3) },
    /** 貪食：base＋N×perValue（N は minValue〜maxValue）。生け贄にできるのは max 体まで */
    devour: { perValue: 4.5, base: x(1), max: 3, minValue: x(1), maxValue: x(2) },
    /** 召集：固定。休ませる1体につきコスト−1（max まで）。印刷コスト minCost 以上 */
    convoke: { flat: x(3), max: 3, minCost: 2 },
    /** 探査：固定。除外する捨て札1枚につきコスト−1（max まで）。印刷コスト minCost 以上 */
    delve: { flat: x(3), max: 3, minCost: 2 },
    /** 血の支払い：K×perEnergy。エナジー1を HP hpPerEnergy で払う（K は max まで） */
    lifePay: { perEnergy: x(2), hpPerEnergy: x(2), max: 2 },
    /** 代替コスト：固定（1ターン battle.maxPitchPerTurn 回） */
    pitch: { flat: x(6) },
    /** 最悪の二択：低いモード＋高いモード×highRate */
    villain: { highRate: 0.2, flat: x(0) },
    /** 回顧：効果・本体×rate（捨て札から使ったときの効果があるカードは本体×rate＋fromDiscardFlat） */
    retrace: { rate: 0.5, fromDiscardFlat: x(1) },
    /** 調和：効果・本体×rate（N＝0・1・2）。休ませたモンスターの攻撃力 attackPerEnergy ごとにコスト−1（maxCut まで） */
    harmonize: { rate: [0.5, 0.4, 0.3], attackPerEnergy: x(2), maxCut: 3, fromDiscardFlat: x(1) },
    /** 大混乱：効果・本体×rate */
    mayhem: { rate: 0.4, fromDiscardFlat: x(1) },
    /** 一時蘇生：本体（ステータス・キーワード・召喚時の効果）×rate（K＝1・2・3） */
    unearth: { rate: [0.45, 0.35, 0.25] },
    /** 相続：エナジー0〜maxCost（ポイントは「相続」のタイミングの倍率 timing.renew） */
    renew: { maxCost: 2, flat: x(0) },
    /** 発掘：固定。山札の上 N 枚（minCount〜maxCount）を捨て札に置いて手札に戻す（1ターン battle.maxDredgePerTurn 回） */
    dredge: { flat: x(2), minCount: 2, maxCount: 4 },
    /** 不朽：本体×rate（K＝1・2・3）。永遠はコピーが攻撃力・体力 eternalStats で、eternalFlat を足す */
    embalm: { rate: [0.4, 0.3, 0.2], eternalStats: x(4), eternalFlat: x(2), flat: x(0) },
    /** 予見：エナジー0〜maxCost（ポイントは「予見」のタイミングの倍率 timing.forecast） */
    forecast: { maxCost: 2, flat: x(0) },
    /**
     * MTG 要素 △ バッチC（決定事項ログ）。待機ゾーン（予顕・計画・待機・ワープ・出来事）・達成（事件・進化）・Lvアップ・忠誠・
     * 裏向き（変装）・特殊勝利・紋章。数（エナジー・ターン・回数）には倍率を掛けない
     */
    /** 予顕：エナジー setCost で伏せ、後のターンにコスト−K。base＋(K−1)×perCut（K は1〜maxCut） */
    foretell: { setCost: 2, base: x(2), perCut: x(6), maxCut: 2 },
    /** 計画：今の実コストを払って表向きで待機させ、後のターンに無料で使う */
    plot: { flat: x(2) },
    /** 待機：エナジーK（0〜maxCost。印刷コスト未満）で待機させ、Nターン（1〜maxTurns）後に無料で使う */
    suspend: { flat: x(3), maxTurns: 3, maxCost: 2 },
    /** ワープ：エナジーK（1〜maxCost。印刷コスト未満）で出し、ターン終了時に待機ゾーンへ。flat＋召喚時の効果×summonRate */
    warp: { flat: x(2), summonRate: 0.4, maxCost: 3 },
    /** 出来事：出来事の効果は×rate（タイミングの倍率に掛ける。能力自体は0pt）。出来事のエナジーは0〜maxCost */
    adventure: { rate: 0.8, maxCost: 3, flat: x(0) },
    /** 事件：固定（条件の重さは「達成していれば」「達成したとき」の倍率で払う） */
    quest: { flat: x(1) },
    /** 進化 N：flat＋N×perValue（N は minValue〜maxValue。量） */
    evolve: { flat: x(1), perValue: 2.7, minValue: x(1), maxValue: x(3) },
    /** Lvアップ：エナジーK（1〜maxCost）。モンスターは N（0〜maxValue。量）×perValue、パワーは0（条件・タイミングの倍率で払う） */
    levelUp: { perValue: 5, maxCost: 3, maxValue: x(2), powerFlat: x(0) },
    /** 忠誠 L（minLoyalty〜maxLoyalty）と −K（minCut〜maxCut）。能力は0pt（タイミングの倍率で払う） */
    loyalty: { minLoyalty: 2, maxLoyalty: 5, minCut: 2, maxCut: 4, flat: x(0) },
    /** 変装：エナジー playCost で裏向きに出し、K（0〜maxCost）で表にする */
    disguise: { playCost: 2, flat: x(3), maxCost: 3 },
    /** 特殊勝利：固定。目標（カードを cards 枚使う／自分のターン開始を turns 回／自分のターン開始時にモンスター board 体） */
    altWin: { flat: x(30), goals: { cards: 12, turns: 4, board: 5 } },
    /** 紋章：パワーの効果×rate（能力のポイントは（rate−1）×パワーの効果） */
    emblem: { rate: 1.3 },
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
    /** MTG 要素 ○ バッチA（決定事項ログ）。伝説：同じ名前のものが場にあると使えない（固定値） */
    legendary: { fixed: x(2) },
    /** 消耗：攻撃したら次の自分のターンは攻撃できない。max(min, 攻撃力×perAttack)（固定値） */
    exert: { min: x(1), perAttack: 1 },
    /** 枯朽 N：自分のモンスター1体の攻撃力と体力を−N（N×perValue × タイミング。N は maxValue まで） */
    blight: { perValue: 3, maxValue: x(5) },
    /** 捨て札の除外：枚数 N（N×perCard）か、コストの合計 N（N×perCost）。× タイミング */
    exileDiscard: { perCard: x(0.8), perCost: x(0.4), maxCount: 5, maxCost: 10 },
    /**
     * MTG 要素 △ バッチA（決定事項ログ）。累加維持費 N：N×perValue（固定値。N は minValue〜maxValue。場にいるターン数は maxAge で止まる）。
     * 休眠：モンスターは max(min, 攻撃力×perAttack)、パワーはパワーの効果のポイント×powerRate（固定値）
     */
    cumulativeUpkeep: { perValue: 4, minValue: x(0.5), maxValue: x(2), maxAge: 6 },
    dormant: { min: x(2), perAttack: 1.5, powerRate: 0.4 },
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
    /** 守護の不壊（MTG 要素 △ バッチA）で踏みとどまるときの体力 */
    indestructibleHp: x(1),
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
    /** 予約（修飾「次のターンに」。MTG 要素 ○ バッチA）は1人この件数まで（数なので倍率は掛けない） */
    maxDelayedPerPlayer: 6,
    /** MTG 要素 ○ バッチB：無料で使う（続唱）の深さの上限（無料で使ったカードの続唱からさらに使うのはこの段まで） */
    maxFreePlayDepth: 2,
    /** 動員の「軍団」トークン（1人 maxArmy 体） */
    armyName: '軍団',
    armyIcon: '🛡️',
    maxArmy: 1,
    /** 最大エナジー増加は1人この回数まで */
    rampCap: 1,
    /** MTG 要素 △ バッチA：放射能の合計の上限と、モンスター以外1枚ごとのダメージ。経験・氷結の上限。卵の孵化までの自分のターン数 */
    radCap: 10,
    radDamage: x(1),
    expCap: 10,
    iceCap: 3,
    eggHatchTurns: 2,
    eggName: '卵',
    eggIcon: '🥚',
    /** MTG 要素 △ バッチB：代替コスト・発掘は1人1ターンこの回数まで */
    maxPitchPerTurn: 1,
    maxDredgePerTurn: 1,
    /**
     * MTG 要素 △ バッチC：待機ゾーンの枚数・Lv の上限・忠誠の上限・裏向きのモンスターの攻撃力と体力・変装の護法・紋章の数・
     * 1人が築ける砦の数・特殊勝利で勝てる最初の通算ターン
     */
    maxWaiting: 5,
    maxLevel: 3,
    loyaltyMax: 9,
    faceDownStats: x(2),
    faceDownWard: 1,
    faceDownName: '裏向きのモンスター',
    faceDownIcon: '🂠',
    maxEmblems: 1,
    maxSieges: 1,
    siegeName: '砦',
    siegeIcon: '🏰',
    altWinEarliestTurn: 8,
  },

  /** 速度ゲージ（MTG 要素 ○ バッチC2）：エンジン始動で start、自分のターンに相手のHPを減らすと1ターン1回+1、max まで */
  speed: { start: 1, max: 4 },
  /** 王冠（MTG 要素 ○ バッチC2）：持っていると自分のターン開始時に extraDraw 枚多く引く */
  crown: { extraDraw: 1 },
} as const;

export type Balance = typeof BALANCE;
