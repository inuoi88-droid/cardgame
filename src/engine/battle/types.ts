/** 対戦の状態・行動・ログの型。状態はすべて JSON にできる形にする（保存・サーバー配信・テストのため）。 */
import type { CardDef, DrawbackInstance, EffectInstance, TimingId } from '../types.ts';

export type PlayerId = 0 | 1;

/** 効果や攻撃の対象 */
export type TargetRef = { kind: 'player'; player: PlayerId } | { kind: 'monster'; uid: string };

/** 状態異常と持続効果。プレイヤーとモンスターで同じ形を使う（使わない項目は0のまま） */
export interface Statuses {
  poison: number;
  /** やけどの残りターン */
  burn: number;
  /** 弱体の残りターン */
  weak: number;
  /** 脆弱の残りターン */
  vulnerable: number;
  bleed: number;
  /** 凍結：付与された（次の自分のターンに発効） */
  freezePending: boolean;
  /** 凍結：このターン発効中 */
  freezeActive: boolean;
  /** 混乱（モンスター）：付与された */
  confusePending: boolean;
  /** 混乱（モンスター）：このターン発効中 */
  confuseActive: boolean;
  /** 反撃（プレイヤー）：返すダメージの合計 */
  counter: number;
  /** 無効化（プレイヤー）：残り回数 */
  nullify: number;
  /** 再生（プレイヤー） */
  regen: number;
  /** 筋力（プレイヤー） */
  strength: number;
  /** 気合（プレイヤー、このターンだけ） */
  focus: number;
  /** 呪縛（プレイヤー。MTG 要素バッチ2）：自分のターン開始時にこの数だけダメージ。減らない。無ければ0 */
  doom?: number;
}

/** 対戦中のカード1枚 */
export interface CardInst {
  uid: string;
  /** GameState.cards のキー。ノイズは NOISE_CARD_ID */
  cardId: string;
  /** 元の持ち主（デッキの持ち主） */
  owner: PlayerId;
  /** 複製で作られたコピー。temp は使うかターン終了で除外、keep はこの試合のデッキに残る */
  copy?: 'temp' | 'keep';
  /**
   * トークン（MTG 要素バッチ2）の強さ。cardId は TOKEN_CARD_ID。場を離れるとどこにも行かずに消える
   * （捨て札・除外・手札に入らない）
   */
  token?: { attack: number; hp: number };
}

export const NOISE_CARD_ID = '__noise__';
/** トークンのカード定義のキー（GameState.cards。最初のトークンを出すときに登録する） */
export const TOKEN_CARD_ID = '__token__';

export interface Monster {
  uid: string;
  card: CardInst;
  owner: PlayerId;
  /** 今の持ち主（奪取で変わる） */
  controller: PlayerId;
  attack: number;
  hp: number;
  maxHp: number;
  defense: number;
  /** 場に出た通算ターン（このターンに出たモンスターは攻撃できない） */
  enteredTurn: number;
  attacksUsed: number;
  sealed: boolean;
  undyingUsed: boolean;
  /** 隠密で攻撃対象にならない間 true */
  stealth: boolean;
  /** 裏切りが始まった */
  betraying: boolean;
  /**
   * デメリットなどが使う数え（裏切りまでの経過ターンなど）。
   * `rt:<タイミング>:turn`・`rt:<タイミング>:count` は繰り返し誘発の回数（1ターンの上限の安全装置）
   */
  counters: Record<string, number>;
  status: Statuses;
  /** このターンだけの攻撃力の上乗せ（一時強化。無ければ0。実効攻撃力は core.ts の effectiveAttack）。各ターン終了時に消える */
  tempAttack?: number;
  /** 効果で与えられたキーワードの ID（キーワード付与。場を離れると消える。封印中は働かない） */
  granted?: string[];
  /** 聖盾を使った（キーワード付与で聖盾を与え直すと未使用に戻る） */
  shieldUsed?: boolean;
}

/** 場に残っているパワー */
export interface PowerInst {
  uid: string;
  cardId: string;
  name: string;
  /** パワー用タイミングの効果（解除されたものは removed） */
  effects: { effect: EffectInstance; removed: boolean }[];
  /** パワー用タイミングのデメリット（解除できない） */
  drawbacks: DrawbackInstance[];
  /** 「カードを使うたび」が発動した回数（通算ターンごと。安全装置） */
  triggers?: { turnIndex: number; count: number };
  /** 「出るたび」「破壊されるたび」「パワー・スキルを使うたび」が発動した回数（タイミングごと・通算ターンごと。安全装置） */
  repeats?: Partial<Record<TimingId, { turnIndex: number; count: number }>>;
  /** 寿命（デメリット）の残り：持ち主のターン終了時に1減り、0で消える。無ければ寿命なし */
  life?: number;
}

/** 1ターンの上限を数える（安全装置：決定事項 #64）。turnIndex が変わったら数え直す */
export interface TurnLimits {
  turnIndex: number;
  drawn: number;
  energyGained: number;
  noiseIn: number;
}

export interface PlayerState {
  name: string;
  hp: number;
  maxHp: number;
  shield: number;
  energy: number;
  deck: CardInst[];
  hand: CardInst[];
  discard: CardInst[];
  exile: CardInst[];
  board: Monster[];
  powers: PowerInst[];
  status: Statuses;
  /** 次の自分のターンへの持ち越し（貯金・反動・妨害・施し）。jam* は相手の妨害で減らされた量（上限あり） */
  next: { draw: number; energy: number; jamDraw?: number; jamEnergy?: number };
  /** 1ターンの上限の数え（無ければ0から） */
  limits?: TurnLimits;
  /**
   * このターンの記録（自分のターンの開始時に作り直す）。省略可能な項目は無ければ 0 / false。
   * enemyDamaged：相手プレイヤーのHPを減らした / allyAttacks：自分のモンスターが攻撃した回数 /
   * summoned：自分の場にモンスターを出した数 / monstersDestroyed：このターンに破壊されたモンスターの数（敵味方とも）
   */
  turn: {
    cardsPlayed: number;
    retain: number;
    freezeTax: boolean;
    enemyDamaged?: boolean;
    allyAttacks?: number;
    summoned?: number;
    monstersDestroyed?: number;
  };
  /** 次に使うカードのコスト軽減（使うまで残る） */
  discount: number;
  /** 自分のターンを迎えた回数 */
  turnsTaken: number;
  mulligan: { done: boolean; fullCount: number };
}

/** 効果や攻撃の出どころ */
export interface SourceRef {
  kind: 'card' | 'monster' | 'power' | 'system';
  uid: string;
  cardId: string;
  name: string;
  controller: PlayerId;
}

/** 「選んだ1体」の対象（相手側1つ・自分のモンスター1つ） */
export interface Chosen {
  enemy?: TargetRef;
  ally?: string;
}

/** 解決待ちの処理。キューの先頭から順に処理し、途中で選択が要れば止まる */
export type Step =
  | {
      t: 'effect';
      src: SourceRef;
      effect: EffectInstance;
      timing: TimingId;
      chosen: Chosen;
      /** アタック・パワーアタックの使用時（筋力・気合が乗る） */
      attackCard: boolean;
      /** 同じカードのデメリットで付いた毒・やけどを浄化から守るためのキー */
      protectKey?: string;
      depth: number;
      picks?: string[];
    }
  | { t: 'drawback'; src: SourceRef; drawback: DrawbackInstance; protectKey?: string; depth: number; picks?: string[] }
  /** 手札を count 枚選んで捨てる（手札整理） */
  | { t: 'discardChoice'; player: PlayerId; count: number; depth: number; picks?: string[] }
  | { t: 'cardDone'; player: PlayerId; card: CardInst; protectKey: string; depth: number }
  | { t: 'autoAttacks'; player: PlayerId }
  | { t: 'turnEndEffects'; player: PlayerId }
  | { t: 'retain'; player: PlayerId; picks?: string[] }
  | { t: 'turnEndFinish'; player: PlayerId; kept: string[] };

export interface ChoiceOption {
  id: string;
  label: string;
  /** カードを選ぶとき、そのカード（表示用） */
  cardId?: string;
}

/** プレイヤーの選択待ち */
export interface PendingChoice {
  player: PlayerId;
  prompt: string;
  options: ChoiceOption[];
  min: number;
  max: number;
  /** 選んだあとに再開する処理 */
  step: Step;
}

/**
 * ダメージの種類。attack：モンスターの攻撃 / hit：ダメージ・連撃効果の1回分（格闘も） / counter：反撃（状態） /
 * retaliate：攻撃されたモンスターの反撃 / trample：貫通の余り / poison・burn・doom：毒・やけど・呪縛 / self：自傷・維持費・寄生
 */
export type DamageKind = 'attack' | 'hit' | 'counter' | 'retaliate' | 'trample' | 'poison' | 'burn' | 'doom' | 'self';

/** ログに付ける構造化された出来事（UI の演出・再生用。決定事項 #71）。公開情報だけを入れる */
export interface LogEvent {
  kind:
    | 'damage'
    | 'heal'
    | 'shield'
    | 'status'
    | 'play'
    | 'summon'
    | 'destroy'
    | 'draw'
    | 'attack'
    | 'retaliate'
    | 'turnStart'
    | 'turnEnd'
    | 'energy'
    | 'discard'
    | 'result';
  player?: PlayerId;
  target?: TargetRef;
  source?: TargetRef;
  /** ダメージ・回復・シールド・状態の量、引いた枚数、エナジーなど */
  amount?: number;
  cardId?: string;
  uid?: string;
  status?: string;
  /** damage のとき、ダメージの種類（毒・やけど・自傷などの区別） */
  damageKind?: DamageKind;
}

export interface LogEntry {
  turn: number;
  depth: number;
  text: string;
  kind: 'turn' | 'action' | 'effect' | 'damage' | 'info' | 'result';
  /** このプレイヤーにだけ見せる（引いたカード名など） */
  private?: PlayerId;
  /** 構造化された出来事（あれば） */
  ev?: LogEvent;
}

/**
 * カード1回の使用（または1回のタイミングの発動）の記録。キーは protectKey。
 * poison・burn：同じカードのデメリットで付いた毒・やけど（浄化から守る：決定事項 #34）
 * bonus：使った時点の筋力＋気合。最初の1発にだけ乗せる（決定事項 #70 R3）
 * bleedHit・counterHit：出血・反撃（状態）をもう働かせた対象（1枚につき1回：決定事項 #70 R4）
 */
export interface PlayRecord {
  poison: number;
  burn: number;
  bonus?: number;
  bonusUsed?: boolean;
  bleedHit?: string[];
  counterHit?: string[];
  /** X（全力）で使ったエナジー（このカードの X の効果がすべて使う） */
  x?: number;
}

export interface GameResult {
  winner: PlayerId | null;
  /** timeout：オンライン対戦で続けて時間切れになった */
  reason: 'hp' | 'turnLimit' | 'concede' | 'timeout';
}

export interface GameState {
  v: 1;
  /** シード付き乱数の内部状態 */
  rng: number;
  /** 通算ターン（両者の合計）。マリガン中は0 */
  turnIndex: number;
  phase: 'mulligan' | 'main' | 'ended';
  active: PlayerId;
  first: PlayerId;
  players: [PlayerState, PlayerState];
  /** この対戦で使うカード定義（キーはプレイヤーごとに分けた ID） */
  cards: Record<string, CardDef>;
  queue: Step[];
  /** キューに割り込ませる位置（処理中だけ使う） */
  qInsert: number;
  /** 1つの効果を処理している間は決着を保留する（同時にHP0なら引き分けにするため） */
  holdEnd: number;
  pending: PendingChoice | null;
  /** カード1回の使用の記録（浄化から守る毒・やけど、筋力・気合、出血・反撃の1回判定）。ターン開始時に空になる */
  protect: Record<string, PlayRecord>;
  result: GameResult | null;
  log: LogEntry[];
  nextUid: number;
}

export type MulliganMode = 'keep' | 'all' | 'partial';

export type Action =
  | { type: 'mulligan'; player: PlayerId; mode: MulliganMode; cardUids?: string[] }
  | { type: 'playCard'; player: PlayerId; cardUid: string; chosen?: Chosen }
  | { type: 'attack'; player: PlayerId; attackerUid: string; target: TargetRef }
  | { type: 'removeNoise'; player: PlayerId; cardUid: string }
  | { type: 'choose'; player: PlayerId; picks: string[] }
  | { type: 'endTurn'; player: PlayerId }
  | { type: 'concede'; player: PlayerId; reason?: 'timeout' };

export type ApplyResult = { ok: true; state: GameState } | { ok: false; error: string };

/** 効果ファイルの処理関数に渡す道具（battle/runtime.ts が作る） */
export interface EffectRuntime {
  readonly g: GameState;
  readonly controller: PlayerId;
  readonly opponent: PlayerId;
  /** この効果の対象（解決時点で有効なものだけ） */
  readonly targets: TargetRef[];
  readonly src: SourceRef;
  /** ダメージ効果の1回分（出血・反撃が働く。筋力・気合はアタックの使用時、そのカードの最初の1発にだけ乗る） */
  hit(target: TargetRef, amount: number, opts?: { pierce?: boolean; drain?: boolean }): void;
  /** 自分へのダメージ（自傷など） */
  selfDamage(amount: number): void;
  heal(target: TargetRef, amount: number): void;
  addStatus(target: TargetRef, key: StatusKey, amount: number): void;
  setSealed(target: TargetRef): void;
  gainShield(player: PlayerId, amount: number): void;
  gainEnergy(player: PlayerId, amount: number): void;
  addNextTurn(player: PlayerId, delta: { draw?: number; energy?: number }): void;
  addDiscount(player: PlayerId, amount: number): void;
  addRetain(player: PlayerId, amount: number): void;
  draw(player: PlayerId, count: number): void;
  addNoise(player: PlayerId, count: number): void;
  discardRandom(player: PlayerId, count: number): void;
  cleanse(player: PlayerId): void;
  changeAttack(target: TargetRef, delta: number): void;
  changeDefense(target: TargetRef, delta: number): void;
  destroy(target: TargetRef): void;
  bounce(target: TargetRef): void;
  steal(target: TargetRef): void;
  /** 選択肢を作るための情報 */
  monster(target: TargetRef): Monster | undefined;
  player(id: PlayerId): PlayerState;
  cardDef(cardId: string): CardDef | undefined;
  cardName(cardId: string): string;
  /** 選んだカードを動かす */
  takeFromDeck(player: PlayerId, cardUid: string): void;
  takeFromDiscard(player: PlayerId, cardUid: string): void;
  copyFromHand(player: PlayerId, cardUid: string, keep: boolean): void;
  reviveFromDiscard(player: PlayerId, cardUid: string): void;
  dispelOptions(player: PlayerId): ChoiceOption[];
  dispel(player: PlayerId, key: string): void;
  log(text: string): void;
  // ---- MTG 要素バッチ2
  /** 攻撃力と体力（最大値も）を変える（衰弱で体力が0以下になると破壊。ダメージではない） */
  changeStats(target: TargetRef, attack: number, hp: number): void;
  /** このターンだけ攻撃力を上げる（一時強化） */
  addTempAttack(target: TargetRef, amount: number): void;
  /** キーワードを与える（重複は無視。不屈・聖盾は使用済みを戻す） */
  grantKeyword(target: TargetRef, keywordId: string): void;
  /** もう一度攻撃できるようにする（1体につき1ターン1回） */
  ready(target: TargetRef): void;
  /** 格闘：ally と enemy が互いに攻撃力ぶんのダメージを与え合う */
  fight(ally: TargetRef, enemy: TargetRef): void;
  /** 攻撃力 attack・体力 hp のトークンを count 体出す（場のトークンの上限まで） */
  createTokens(player: PlayerId, attack: number, hp: number, count: number): void;
  /** 手札を count 枚選んで捨てる処理を積む（この効果のあとに選ぶ） */
  chooseDiscard(player: PlayerId, count: number): void;
  /** 手札か捨て札のカードを除外する */
  exileCard(player: PlayerId, cardUid: string): void;
  /** 占術：山札の上の uids を、元の並びのまま山札の下か捨て札へ */
  scryMove(player: PlayerId, uids: string[], toDiscard: boolean): void;
}

export type StatusKey =
  | 'poison'
  | 'burn'
  | 'weak'
  | 'vulnerable'
  | 'bleed'
  | 'freeze'
  | 'confuse'
  | 'counter'
  | 'nullify'
  | 'regen'
  | 'strength'
  | 'focus'
  | 'doom';

/** 選択を求めるときの指定（効果ファイルが返す） */
export interface ChoiceSpec {
  prompt: string;
  options: ChoiceOption[];
  min: number;
  max: number;
}
