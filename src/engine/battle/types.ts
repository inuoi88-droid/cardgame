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
}

export const NOISE_CARD_ID = '__noise__';

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
  /** デメリットなどが使う数え（裏切りまでの経過ターンなど） */
  counters: Record<string, number>;
  status: Statuses;
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
  /** 次の自分のターンへの持ち越し（貯金・反動・妨害・施し） */
  next: { draw: number; energy: number };
  /** このターンの記録 */
  turn: { cardsPlayed: number; retain: number; freezeTax: boolean };
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
  | { t: 'drawback'; src: SourceRef; drawback: DrawbackInstance; protectKey?: string; depth: number }
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

export interface LogEntry {
  turn: number;
  depth: number;
  text: string;
  kind: 'turn' | 'action' | 'effect' | 'damage' | 'info' | 'result';
  /** このプレイヤーにだけ見せる（引いたカード名など） */
  private?: PlayerId;
}

export interface GameResult {
  winner: PlayerId | null;
  reason: 'hp' | 'turnLimit' | 'concede';
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
  pending: PendingChoice | null;
  /** 浄化から守る毒・やけど（カードのデメリットで付いた分） */
  protect: Record<string, { poison: number; burn: number }>;
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
  | { type: 'concede'; player: PlayerId };

export type ApplyResult = { ok: true; state: GameState } | { ok: false; error: string };

/** 効果ファイルの処理関数に渡す道具（battle/runtime.ts が作る） */
export interface EffectRuntime {
  readonly g: GameState;
  readonly controller: PlayerId;
  readonly opponent: PlayerId;
  /** この効果の対象（解決時点で有効なものだけ） */
  readonly targets: TargetRef[];
  readonly src: SourceRef;
  /** ダメージ効果の1回分（出血・反撃が働く。筋力・気合はアタックの使用時だけ乗る） */
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
  | 'focus';

/** 選択を求めるときの指定（効果ファイルが返す） */
export interface ChoiceSpec {
  prompt: string;
  options: ChoiceOption[];
  min: number;
  max: number;
}
