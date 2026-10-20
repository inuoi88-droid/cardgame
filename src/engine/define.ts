/**
 * 効果・オプション・キーワード・デメリットの定義の型。
 * defs/ 以下の各ファイルは、ここにある define* 関数で1つの定義を default export する。
 * 新しい効果は defs/effects/ に1ファイル追加し、基礎ポイントを balance.ts に書けば、
 * エディター・ポイント計算・効果テキストのすべてに反映される（索引は scripts/gen-registry.mjs が自動生成）。
 */
import { BALANCE } from './balance.ts';
import type { CardInst, ChoiceSpec, EffectRuntime, GameState, Monster, PlayerId, TargetRef } from './battle/types.ts';
import type { TargetRule } from './options.ts';
import type {
  AbilityInstance,
  CardBase,
  CardDef,
  CardType,
  DrawbackInstance,
  EffectInstance,
  KeywordInstance,
  ModifierId,
  Rarity,
  Stats,
  TargetId,
  TimingId,
} from './types.ts';

/** ポイント計算に要るカードの情報（土台はステータスの有無で決まる。キーワードは「攻撃するたび」の倍率に使う） */
export type PointCard = Pick<CardDef, 'stats' | 'keywords'>;

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
  };
}

/** カードの能力のポイント計算に渡す情報 */
export interface AbilityPointContext {
  card: Pick<CardDef, 'stats' | 'keywords' | 'effects'>;
  /** このカードのすべての効果のポイントの合計 */
  effectPoints: number;
  /** このカードの使用時（モンスターなら召喚時）の効果のポイントの合計 */
  playEffectPoints: number;
}

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
  };
}

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
});
