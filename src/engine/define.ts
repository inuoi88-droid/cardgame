/**
 * 効果・オプション・キーワード・デメリットの定義の型。
 * defs/ 以下の各ファイルは、ここにある define* 関数で1つの定義を default export する。
 * 新しい効果は defs/effects/ に1ファイル追加し、基礎ポイントを balance.ts に書けば、
 * エディター・ポイント計算・効果テキストのすべてに反映される（索引は scripts/gen-registry.mjs が自動生成）。
 */
import { BALANCE } from './balance.ts';
import type {
  AltPlay,
  CardInst,
  ChoiceSpec,
  DiscardAbilityKind,
  EffectRuntime,
  ExtraPayKind,
  GameState,
  HandAbilityKind,
  Monster,
  PlayerId,
  PowerInst,
  SacrificeKind,
  SetAsideKind,
  TargetRef,
} from './battle/types.ts';
import type { ChargeEvent, TargetRule } from './options.ts';
import type {
  AbilityInstance,
  CardBase,
  CardDef,
  CardType,
  ConditionId,
  DrawbackInstance,
  EffectInstance,
  KeywordInstance,
  ModifierId,
  Rarity,
  Stats,
  TargetId,
  TimingId,
} from './types.ts';

/**
 * ポイント計算に要るカードの情報（土台はステータスの有無で決まる。キーワードは「攻撃するたび」の倍率に使う。
 * カードの能力は起動のエナジー・キッカーの追加エナジーの倍率に使う：MTG 要素 ○ バッチC1）
 */
export type PointCard = Pick<CardDef, 'stats' | 'keywords'> & { abilities?: CardDef['abilities']; effects?: CardDef['effects'] };

export interface ParamSpec {
  /** 入力欄の名前 */
  label: string;
  min: number;
  max: number;
  default: number;
  /** HP・ダメージなどの「量」なら true（インフレ倍率の対象。古いデータの移行で倍率を掛ける） */
  scaled?: boolean;
}

export interface OptionSpec {
  label: string;
  choices: readonly { id: string; label: string }[];
  default: string;
  /**
   * 今は選べない（見送り中の）選択肢（決定事項 #102：効果「フィールド」の闘技場）。choices には入れない。
   * 保存済みのカードに残っていると検証の違反 OPTION_RETIRED（エディターでは灰色で今の値として見える）。テキスト・ポイントは普通に出す
   */
  retired?: readonly { id: string; label: string; reason: string }[];
}

export type EffectGroup = 'damage' | 'defense' | 'status' | 'buff' | 'resource' | 'disrupt' | 'special';

export const EFFECT_GROUPS: readonly { id: EffectGroup; label: string }[] = [
  { id: 'damage', label: 'ダメージ系' },
  { id: 'defense', label: '防御・回復系' },
  { id: 'status', label: '状態異常' },
  { id: 'buff', label: '強化系' },
  { id: 'resource', label: 'リソース系' },
  { id: 'disrupt', label: '妨害系' },
  { id: 'special', label: 'レアリティ限定' },
];

/** 効果テキストを作るときに渡す情報 */
export interface DescribeContext {
  /** 対象の呼び方（「相手1体」「相手モンスター全体」「自分」など） */
  target: string;
  /** 防御無視などの前置き（例：「防御無視の」） */
  modPrefix: string;
  /** 吸収などの後置き（例：「（与えたダメージの半分だけ回復）」） */
  modSuffix: string;
}

export interface EffectDef {
  kind: 'effect';
  id: string;
  name: string;
  group: EffectGroup;
  /** エディターでの並び順 */
  order: number;
  /** エディターに出す短い説明 */
  summary: string;
  /** 数値 N の入力欄（なければ数値なし） */
  value?: ParamSpec;
  /** 回数 M の入力欄（連撃のみ） */
  hits?: ParamSpec;
  /** 追加の選択欄（サーチの種類など） */
  option?: OptionSpec;
  /** 作用する相手。選べる対象はここから決まる */
  targetRule: TargetRule;
  /** このレアリティ以上でないと使えない */
  minRarity?: Rarity;
  /** 種類判定の「相手へのダメージ効果」 */
  isDamage?: boolean;
  /** 種類判定の「プレイヤーに永続的に残る効果」 */
  isPlayerPermanent?: boolean;
  /** 防御無視・吸収（scope "damage" のオプション）を付けられる */
  allowsMods?: boolean;
  /** 数値に掛ける倍数（scope "scale" のオプション：X・相手モンスター1体につき など）を付けられる */
  scalable?: boolean;
  /** 使えるタイミングの制限（省略ならすべて） */
  timings?: readonly TimingId[];
  /** 作用先から選べても外す対象（例：再行動の「このモンスター」） */
  excludeTargets?: readonly TargetId[];
  /** 対象「お互い」を選べる（自分に作用する効果のうち、相手にも同じことが起きてよいもの。MTG 要素 ○ バッチA） */
  symmetric?: boolean;
  /** 修飾「次のターンに（遅延）」を付けられない（再行動：ターン開始時には意味がない） */
  noDelay?: boolean;
  /** 付けられるカードの土台（省略ならどちらも。新生はモンスターのカードだけ。MTG 要素 ○ バッチB） */
  bases?: readonly CardBase[];
  /** 対象がいなくても処理する（探検：カードの移動だけは行う。MTG 要素 ○ バッチB） */
  resolveWithoutTargets?: boolean;
  // ---- MTG 要素 △ バッチA
  /** 相手に作用する効果だが、モンスターのカードなら対象「このモンスター」も選べる（容疑） */
  thisMonsterToo?: boolean;
  /** 「選んだ自分のモンスター1体」に、使ったモンスター自身は選べない（賛助） */
  notSelfAlly?: boolean;
  /** 追加指定ごとの、使えるレアリティの下限（倍化の「3倍」はレジェンドだけ） */
  optionMinRarity?: Partial<Record<string, Rarity>>;
  // ---- MTG 要素 △ バッチB
  /** 能力「犠牲」でもう一度出すときに出さない（続唱：コピーしない） */
  noCopy?: boolean;
  /** 倍率を掛ける前の基礎ポイント */
  basePoints(e: EffectInstance): number;
  /** 基礎ポイントの式（内訳表示用。例：「2×2」） */
  baseFormula(e: EffectInstance): string;
  /** 効果テキスト（タイミング・条件の前置きと句点は付けない） */
  describe(e: EffectInstance, ctx: DescribeContext): string;
  /** エディターの効果名の後ろに付ける数値表示（例：「2」「3×2」） */
  shortValue?(e: EffectInstance): string;
  /** 対戦での処理 */
  battle: {
    /** このカードを今使えない理由（HP交換：自分のHPが相手より少ないときだけ。MTG 要素 △ バッチC）。使えるなら null */
    canPlay?(g: GameState, p: PlayerId): string | null;
    /** 選択が要る効果（サーチ・回収など）は選択肢を返す。null なら選択なし */
    choose?(rt: EffectRuntime, e: EffectInstance): ChoiceSpec | null;
    /** 効果を処理する。picks は選んだ選択肢の ID */
    resolve(rt: EffectRuntime, e: EffectInstance, picks?: string[]): void;
  };
}

export interface ModifierDef {
  kind: 'modifier';
  id: ModifierId;
  name: string;
  order: number;
  summary: string;
  /**
   * damage：ダメージ系の効果（allowsMods）に付けるもの（防御無視・吸収）。テキストは効果の文の中に入る。
   * scale：数値に倍数を掛けるもの（scalable な効果に1つまで）。テキストは効果の文の前後に付く。
   * delay：効果を次の自分のターン開始時に遅らせるもの（noDelay でない効果に付けられる。X とは併用できない）
   */
  scope: 'damage' | 'scale' | 'delay';
  /** 使えるタイミングの制限（省略ならすべて） */
  timings?: readonly TimingId[];
  /** 量（valueParam）の効果にだけ付けられる（ばらつき。枚数・ターン数には付けない。MTG 要素 △ バッチA） */
  requiresScaledValue?: boolean;
  /** 基礎ポイントへの上乗せ率 */
  rate: number;
  textPrefix: string;
  textSuffix: string;
}

export interface KeywordDef {
  kind: 'keyword';
  id: string;
  name: string;
  order: number;
  summary: string;
  value?: ParamSpec;
  points(k: KeywordInstance, stats: Stats): number;
  formula(k: KeywordInstance, stats: Stats): string;
  /** カードに表示する名前（例：「自己修復2」） */
  displayName(k: KeywordInstance): string;
  /** 説明文 */
  describe(k: KeywordInstance): string;
  /** 対戦での働き（封印されたモンスターでは働かない） */
  battle: {
    haste?: boolean;
    /** 突進：出たターンは相手のモンスターだけを攻撃できる（決定事項 #146） */
    rush?: boolean;
    attacksPerTurn?: number;
    taunt?: boolean;
    flying?: boolean;
    trample?: boolean;
    undying?: boolean;
    stealthOnSummon?: boolean;
    /** 接死：攻撃・反撃・格闘でダメージを与えたモンスターを破壊する（MTG 要素バッチ2） */
    deathtouch?: boolean;
    /** 先制攻撃：攻撃でモンスターを倒したとき反撃を受けない */
    firstStrike?: boolean;
    /** 呪禁：相手のカードの「選んだ1体」にならない */
    hexproof?: boolean;
    /** 絆魂：攻撃・反撃・格闘で減らしたぶん持ち主が回復する */
    lifelink?: boolean;
    /** 聖盾：最初に受けるダメージ1回を0にする */
    divineShield?: boolean;
    /** モンスターと戦うとき（攻撃・反撃・格闘）だけ攻撃力に足す量（武士道） */
    combatBonus?(k: KeywordInstance): number;
    // ---- MTG 要素 ○ バッチB
    /** 一撃離脱：攻撃したあと、場に残っていれば持ち主の手札に戻る */
    returnAfterAttack?: boolean;
    /** 激励：場にいる間、自分の他のモンスターの攻撃力に足す量 */
    auraAttack?(k: KeywordInstance): number;
    /** 護法：相手のカードの「選んだ1体」にされるとき、そのカードのコストに足す量 */
    wardTax?(k: KeywordInstance): number;
    /** 猛襲：相手プレイヤーを攻撃するときだけ攻撃力に足す量 */
    playerBonus?(k: KeywordInstance): number;
    /** 威圧：攻撃したとき、相手モンスターの反撃を受けない */
    noRetaliation?: boolean;
    /** 分身：初めて攻撃したとき、このカードのコピー（分身を持たない）を手札に加える */
    doubleTeam?: boolean;
    // ---- MTG 要素 △ バッチA
    /** 対空：相手の飛行のモンスターは、対空のモンスターしか攻撃できない（飛行に効く挑発） */
    reach?: boolean;
    /** 潜伏：挑発がすべてこのモンスターより攻撃力が高ければ、挑発を無視して攻撃できる */
    skulk?: boolean;
    // ---- MTG 要素 △ バッチB
    /** 後援：攻撃するとき、まだ攻撃できる自分の他のモンスター1体を休ませて、その攻撃力をこの攻撃に足してよい */
    enlist?: boolean;
    /** 持ち主のターン開始時 */
    onTurnStart?(rt: EffectRuntime, k: KeywordInstance, monster: Monster): void;
  };
}

export interface DrawbackDef {
  kind: 'drawback';
  id: string;
  name: string;
  order: number;
  summary: string;
  value?: ParamSpec;
  /** モンスターにしか付けられない */
  monsterOnly?: boolean;
  /** 付けられるカードの種類（省略ならすべて。寿命はモンスターとパワー、廃棄はアタックとスキル） */
  cardTypes?: readonly CardType[];
  /** 同じカードに付けられないデメリット（防衛と裏切り） */
  conflicts?: readonly string[];
  /** 選べるタイミングの制限（省略ならその土台のすべて。生け贄は使用時・召喚時だけ） */
  timings?: readonly TimingId[];
  /** 倍率込みの固定値（タイミングを選ばず、basePoints がそのままポイントになる） */
  fixed?: boolean;
  /** 追加の選択欄（捨て札の除外の「枚数／コスト合計」） */
  option?: OptionSpec;
  /** 選択欄によって数値の入力欄が変わるとき（省略なら value） */
  valueFor?(d: DrawbackInstance): ParamSpec | undefined;
  /** 倍率を掛ける前のポイント（正の数）。card はステータスを見るデメリット（裏切り）が使う */
  basePoints(d: DrawbackInstance, card: PointCard): number;
  baseFormula(d: DrawbackInstance, card: PointCard): string;
  /** テキスト（タイミングの前置きと句点は付けない） */
  describe(d: DrawbackInstance): string;
  /** 対戦での処理（封印されても働く） */
  battle: {
    /** 使えるか（使えなければ理由）。生け贄にするモンスターがいない、など */
    canPlay?(g: GameState, p: PlayerId, card: CardInst): string | null;
    /** 選択が要るデメリット（生け贄）は選択肢を返す */
    choose?(rt: EffectRuntime, d: DrawbackInstance): ChoiceSpec | null;
    /** タイミングを選ぶデメリットの処理。picks は選んだ選択肢の ID */
    resolve?(rt: EffectRuntime, d: DrawbackInstance, picks?: string[]): void;
    /** このモンスターは攻撃できない（防衛。混乱・裏切りの自動攻撃もしない） */
    cannotAttack?: boolean;
    /** 攻撃したら、次の持ち主のターンは攻撃できない（消耗） */
    exert?: boolean;
    /** 寿命：場に残るターン数（持ち主のターン終了時に1減り、0で場から消える。モンスターは破壊、パワーは消える） */
    lifespan?(d: DrawbackInstance): number;
    /** 使ったあと捨て札ではなく除外される（廃棄。パワーとして残らない呪文だけ） */
    exhaust?: boolean;
    /** 場にいる間、持ち主のターン終了時（腐乱） */
    onBoardTurnEnd?(rt: EffectRuntime, d: DrawbackInstance, monster: Monster): void;
    /** 場にいる間、持ち主のターン開始時（維持費・裏切り） */
    onBoardTurnStart?(rt: EffectRuntime, d: DrawbackInstance, monster: Monster): void;
    /** このカードを引いたとき（寄生）。対戦開始時の手札・マリガンの引き直しでも働く（決定事項 #70 R7） */
    onDrawn?(rt: EffectRuntime, d: DrawbackInstance): void;
    // ---- MTG 要素 △ バッチA
    /** パワーとして場にある間、持ち主のターン開始時（累加維持費） */
    onPowerTurnStart?(rt: EffectRuntime, d: DrawbackInstance, power: PowerInst): void;
    /** 休眠：1ターンおきに休む（休眠中は攻撃できず、場にいる間のタイミングの効果が出ない） */
    dormant?: boolean;
  };
}

/** カードの能力のポイント計算に渡す情報 */
export interface AbilityPointContext {
  card: Pick<CardDef, 'stats' | 'keywords' | 'effects'> & { abilities?: CardDef['abilities']; cost?: number };
  /** このカードのすべての効果のポイントの合計 */
  effectPoints: number;
  /** このカードの使用時（モンスターなら召喚時）の効果のポイントの合計 */
  playEffectPoints: number;
  /** ステータスとキーワードのポイントの合計（MTG 要素 ○ バッチC1：捨て札から使う能力） */
  bodyPoints: number;
  /** 魂力の効果のポイントの合計 */
  channelEffectPoints: number;
  /** 「捨て札から使ったとき」の効果があるか */
  hasFromDiscard: boolean;
  /** モード選択（MTG 要素 ○ バッチC2）：いちばん高いモード以外のモードのポイントの合計（双呪が使う。モードが無ければ0） */
  modeOtherPoints: number;
  // ---- MTG 要素 △ バッチB
  /** 使用時・召喚時・捨て札から使ったときの条件付きの効果について、条件を外したときに増えるポイントの合計（切除） */
  conditionalGain: number;
  /** 使用時（モンスターなら召喚時）の「選んだ1体」の効果のポイントと作用先（奮励・超過） */
  chosenEffects: { points: number; rule: TargetRule }[];
  // ---- MTG 要素 △ バッチC
  /** タイミングごとの効果のポイントの合計（ワープの召喚時・紋章のパワーの効果など） */
  timingPoints: Partial<Record<TimingId, number>>;
  /** パワーになるタイミング（ターン開始時など）の効果のポイントの合計（紋章） */
  powerEffectPoints: number;
}

/** 動的コスト（親和・条件付き軽減。MTG 要素 ○ バッチC1）の計算に渡す道具。条件の判定は battle 側が作る */
export interface CostContext {
  g: GameState;
  p: PlayerId;
  card: CardInst;
  /** 条件を満たしているか（これから使う1枚を「使ったカード」に数え、手札の自分自身は数えない） */
  check(condition: ConditionId): boolean;
}

/** 捨て札から使う能力の決まり（フラッシュバック・再活・脱出） */
export interface FromDiscardRule {
  /** 使ったあと除外する（モンスターなら場を離れるとき除外：CardInst.exileOnLeave） */
  exileAfter: boolean;
  /** 実コストに足すエナジー（フラッシュバック） */
  extraCost?(a: AbilityInstance): number;
  /** 手札を1枚捨てる（再活） */
  needsHandDiscard?: boolean;
  /** 他の捨て札をこの枚数だけ除外する（脱出） */
  exileOthers?(a: AbilityInstance): number;
  // ---- MTG 要素 △ バッチB
  /** 同じカードは1ターン1回（回顧） */
  oncePerTurn?: boolean;
  /** まだ攻撃できる自分のモンスター1体を休ませてよく、その攻撃力 perEnergy ごとにコスト−1（maxCut まで。調和） */
  tapOne?: { perEnergy: number; maxCut: number };
  /** このターンに手札から捨てられたカードだけ（大混乱） */
  onlyIfDiscardedThisTurn?: boolean;
  /** コストは印刷コストではなくこの値（一時蘇生。護法などは足す） */
  fixedCost?(a: AbilityInstance): number;
  /** 出たモンスターは疾走を持ち、持ち主のターン終了時に除外される（一時蘇生） */
  unearth?: boolean;
}

/** カードの能力の見出し（エディターの選択パネル。MTG 要素 △ バッチB） */
export const ABILITY_GROUPS = ['使い終わり', '捨て札から', '手札・捨て札の能力', 'コスト', '追加の支払い', 'モード', '待機ゾーン', '達成・Lv・忠誠', '場・パワー'] as const;
export type AbilityGroup = (typeof ABILITY_GROUPS)[number];

/**
 * カードの能力（MTG 要素 ○ バッチB）：モンスター以外にも付く、カード単位の性質。
 * 種類・ポイント・テキストは毎回計算し、CardDef.abilities には ID と数値・選択だけを保存する
 */
export interface AbilityDef {
  kind: 'ability';
  id: string;
  name: string;
  order: number;
  summary: string;
  value?: ParamSpec;
  option?: OptionSpec;
  /** 付けられるカードの種類（省略ならすべて） */
  cardTypes?: readonly CardType[];
  minRarity?: Rarity;
  /** 同じカードに付けられない能力・デメリットの ID */
  conflicts?: readonly string[];
  points(a: AbilityInstance, ctx: AbilityPointContext): number;
  formula(a: AbilityInstance, ctx: AbilityPointContext): string;
  /** カードに表示する名前（例：「成長2」） */
  displayName(a: AbilityInstance): string;
  /** テキスト（句点なし） */
  describe(a: AbilityInstance): string;
  battle: {
    /** 使い終えたあとの行き先（循環：山札に混ぜる／再利用：手札に戻る／反復：次の自分のターンにもう一度） */
    afterUse?: 'shuffle' | 'hand' | 'rebound';
    /** 成長：使うたび、このカード（個体）のダメージ・連撃の数値に足す量 */
    grow?(a: AbilityInstance): number;
    // ---- MTG 要素 ○ バッチC1
    /** 捨て札から使える（フラッシュバック・再活・脱出） */
    fromDiscard?: FromDiscardRule;
    /** 起動：場のモンスター・パワーの「起動」の効果を使うときのエナジー */
    activateCost?(a: AbilityInstance): number;
    /** 手札から使う能力（サイクリング・魂力・予見）と、そのエナジー */
    handAbility?: { kind: HandAbilityKind; cost(a: AbilityInstance): number };
    /** コストの軽減（親和・条件付き軽減）。amount は軽減の量、min は軽減してもこれより下げない値 */
    reduce?(a: AbilityInstance, ctx: CostContext): { amount: number; min: number } | null;
    /** キッカー：払ってもよい追加エナジー */
    kickerCost?(a: AbilityInstance): number;
    // ---- MTG 要素 ○ バッチC2
    /** 双呪：すべてのモードを選ぶときの追加エナジー */
    entwineCost?(a: AbilityInstance): number;
    /** 蓄積：必要数と、たまるイベント */
    charge?(a: AbilityInstance): { need: number; event: ChargeEvent };
    // ---- MTG 要素 △ バッチA
    /** 罠：パワーの効果が初めて出たら、そのあとパワーが消える */
    trap?: boolean;
    // ---- MTG 要素 △ バッチB
    /** 追加の支払い（切除・奮励・分隊）：1回ぶんのエナジーと、払える回数 */
    extraPay?: { kind: ExtraPayKind; unit(a: AbilityInstance): number; max: number };
    /** 代わりの使い方（試作・想起・超過・解鎖）：そのときの基本のコスト（印刷コストの代わり。軽減の前） */
    alt?: { kind: AltPlay; cost(a: AbilityInstance, printed: number): number };
    /** 放題：2つ目からのモード1つにつき払うエナジー */
    spreeCost?(a: AbilityInstance): number;
    /** 段階：モード B・C に追加のエナジー */
    tiered?: boolean;
    /** 最悪の二択：モードは相手が選ぶ */
    villain?: boolean;
    /** 差し出す（現出・犠牲・協約）。犠牲は攻撃力 minAttack 以上のモンスターだけ */
    sacrifice?: { kind: SacrificeKind; minAttack?(a: AbilityInstance): number };
    /** 貪食：生け贄にした1体につき攻撃力・体力に足す量 */
    devour?(a: AbilityInstance): number;
    /** 召集：休ませる1体につきコスト−1（max まで） */
    convoke?: { max: number };
    /** 探査：除外する捨て札1枚につきコスト−1（max まで） */
    delve?: { max: number };
    /** 血の支払い：HP で払えるエナジーの数 */
    lifePay?(a: AbilityInstance): number;
    /** 代替コスト：同じ種類の手札1枚を除外すれば、カードのコストの分を払わない */
    pitch?: boolean;
    /** 捨て札のカードの能力（相続・発掘・不朽）と、そのエナジー */
    discardAbility?: { kind: DiscardAbilityKind; cost(a: AbilityInstance): number };
    // ---- MTG 要素 △ バッチC
    /**
     * 手札から待機ゾーンに置く（予顕・計画・待機）。setCost は置くときのエナジー（省略は今の実コスト＝計画）、
     * cut は待機ゾーンから使うときのコストの軽減（予顕）、free は待機ゾーンから無料で使う（計画）、time は待機のターン数（待機）
     */
    setAside?: { kind: SetAsideKind; setCost?(a: AbilityInstance): number; cut?(a: AbilityInstance): number; free?: boolean; time?(a: AbilityInstance): number };
    /** Lvアップ：Lv を1上げるエナジーと、モンスターの攻撃力・体力の上がる量 */
    levelUp?: { cost(a: AbilityInstance): number; amount(a: AbilityInstance): number };
    /** 忠誠：場に出たときの忠誠 L と、−K の K */
    loyalty?: { start(a: AbilityInstance): number; cut(a: AbilityInstance): number };
    /** 変装：裏向きを表にするエナジー */
    revealCost?(a: AbilityInstance): number;
    /** 達成（事件はパワー、進化はモンスター。進化は攻撃力・体力+amount） */
    achieve?: { kind: 'quest' | 'evolve'; amount?(a: AbilityInstance): number };
    /** 特殊勝利の目標 */
    altWin?(a: AbilityInstance): AltWinGoal;
    /** 紋章：場のパワーではなく紋章になる */
    emblem?: boolean;
  };
  // ---- MTG 要素 △ バッチB
  /** 支払いの種類（extra：追加の支払い・代わりの使い方は1枚に1つ＝EXTRA_CONFLICT／sacrifice：差し出す能力は1つ＝SACRIFICE_CONFLICT） */
  payGroup?: 'extra' | 'sacrifice';
  /** モード選択のカードだけ（放題・段階・最悪の二択） */
  requiresModes?: boolean;
  /** 印刷コストがこの値以上のカードだけ（現出・召集・探査＝MIN_COST） */
  minPrintedCost?: number;
  /** 使用時・召喚時の「選んだ1体」の効果が要る（奮励は相手側、超過はどちらでも） */
  requiresChosen?: 'enemy' | 'any';
  /** モードのポイントの合計の決め方（放題・段階・最悪の二択）。points はモードごと（A・B・C の順）のポイント */
  modeValue?(a: AbilityInstance, points: number[]): { value: number; formula: string };
  /** エディターの選択パネルの見出し */
  group?: AbilityGroup;
  /** 「1回きり」のチェック（AbilityInstance.once。蓄積の「プラン」）。label はエディターの表示 */
  onceOption?: { label: string };
  /** この能力に条件を付ける（条件付き軽減。エディターに条件の選択パネルを出す） */
  takesCondition?: boolean;
  /** このタイミングの効果が要る（起動・魂力。無ければ違反） */
  requiresTiming?: TimingId;
  // ---- MTG 要素 △ バッチC
  /** このどれかのタイミングの効果が要る（忠誠：+1 か −K） */
  requiresAnyTiming?: readonly TimingId[];
  /** 能力に達成条件を付ける（事件・進化。条件は options.ts の achieveConditions()） */
  achieveCondition?: boolean;
  /** 英雄譚（章の効果）と同時に付けられない（事件・忠誠・紋章） */
  noSaga?: boolean;
  /** 印刷コストより小さい数値が要る（待機・ワープの K）。value か option（数字の選択肢）のどちらか */
  belowPrintedCost?: 'value' | 'option';
}

/** 特殊勝利（MTG 要素 △ バッチC）の目標：カードを使う／自分のターン開始を迎える／自分のターン開始時に場のモンスターがそろう */
export type AltWinGoal = 'cards' | 'turns' | 'board';
export const ALT_WIN_GOALS = ['cards', 'turns', 'board'] as const satisfies readonly AltWinGoal[];

export const defineEffect = (def: Omit<EffectDef, 'kind'>): EffectDef => ({ kind: 'effect', ...def });
export const defineAbility = (def: Omit<AbilityDef, 'kind'>): AbilityDef => ({ kind: 'ability', ...def });
export const defineModifier = (def: Omit<ModifierDef, 'kind'>): ModifierDef => ({ kind: 'modifier', ...def });
export const defineKeyword = (def: Omit<KeywordDef, 'kind'>): KeywordDef => ({ kind: 'keyword', ...def });
export const defineDrawback = (def: Omit<DrawbackDef, 'kind'>): DrawbackDef => ({ kind: 'drawback', ...def });

// ---------------------------------------------------------------- 定義ファイル用の小道具

/** 量（ダメージ・回復・毒など）の入力欄。初期値は倍率1のときの値で書く（インフレ倍率を掛けて使う） */
export function valueParam(label = 'N', opts: { min?: number; max?: number; default?: number } = {}): ParamSpec {
  return {
    label,
    min: opts.min ?? BALANCE.params.valueMin,
    max: opts.max ?? BALANCE.params.valueMax,
    default: (opts.default ?? 1) * BALANCE.amountScale,
    scaled: true,
  };
}

/** 数（枚数・エナジー・ターン数）の入力欄。インフレ倍率は掛けない */
export function countParam(label = 'N', opts: { min?: number; max?: number; default?: number } = {}): ParamSpec {
  return {
    label,
    min: opts.min ?? BALANCE.params.countMin,
    max: opts.max ?? BALANCE.params.countMax,
    default: opts.default ?? 1,
  };
}

/** デメリットの数値の入力欄（選択欄で変わるものは valueFor） */
export function drawbackValueSpec(def: Pick<DrawbackDef, 'value' | 'valueFor'>, d: DrawbackInstance): ParamSpec | undefined {
  return def.valueFor ? def.valueFor(d) : def.value;
}

/** 効果の追加指定（未設定なら定義の初期値） */
export function optionOf(def: { option?: OptionSpec }, e: { option?: string }): string | undefined {
  return e.option ?? def.option?.default;
}

/** インスタンスから N を取り出す（未設定なら 0） */
export const n = (x: { value?: number }): number => x.value ?? 0;

/** 「a×b」形式の式。値が1なら係数だけ */
export const mulFormula = (...xs: number[]): string => xs.join('×');

/** 対戦：効果を使ったプレイヤー自身 */
export const me = (rt: EffectRuntime): TargetRef => ({ kind: 'player', player: rt.controller });

/** 対戦：ダメージ効果のオプション */
export const modsOf = (e: EffectInstance) => ({
  pierce: e.mods?.includes('pierce') ?? false,
  drain: e.mods?.includes('drain') ?? false,
  /** 萎縮（MTG 要素 △ バッチA）：モンスターが減らした体力のぶん、最大体力も減る */
  wither: e.mods?.includes('witherDmg') ?? false,
});
