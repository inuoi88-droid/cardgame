/** ドラフト戦（決定事項 #115）の型。どれも JSON にできる形 */
import type { CardDef, Deck } from '../types.ts';
import type { PlayerId } from '../battle/types.ts';

/** カードID → 枚数 */
export type DraftCounts = Readonly<Record<string, number>>;

/** 1回の取得 */
export interface DraftPick {
  player: PlayerId;
  cardId: string;
  /** この取得のあと、次の人が取れるカードが場に無かったので山から追加で出した枚数（無ければ省略） */
  extra?: number;
  /** 本人ではなく「おまかせ」が取った（timeout：時間切れ・auto：おまかせにしていた。オンラインのサーバーが付ける） */
  by?: 'timeout' | 'auto';
}

/**
 * 場から交互に取る形式のドラフトの状態（サーバーと CPU 戦が持つ。山の順番と乱数を含むので、そのままプレイヤーに見せない）。
 * 見せるときは draftView() を通す。
 */
export interface DraftState {
  v: 1;
  /** シード付き乱数の内部状態（battle/rng.ts） */
  rng: number;
  /** 使えるカードの定義（ID → 定義）。山・場・取ったカードはここの ID で指す（あとでカードの山が変わっても進められるように写して持つ） */
  cards: Record<string, CardDef>;
  /** 伏せた山（先頭から出す）。サーバーだけが知る */
  pile: string[];
  /** 表向きの場（左から並べた順） */
  field: string[];
  /** 取った順の記録 */
  picks: DraftPick[];
  /** 最初に取る人 */
  first: PlayerId;
}

/** 取れない理由 */
export type DraftBlockReason = 'rarityLimit' | 'sameName' | 'deckRule';

export interface TakeInfo {
  cardId: string;
  ok: boolean;
  reason?: DraftBlockReason;
  /** 取れない理由の文（日本語） */
  message?: string;
}

/** 取ったカードの1種類 */
export interface DraftTaken {
  card: CardDef;
  /** デッキに入った枚数（取った回数×copies） */
  count: number;
}

/** 1人のプレイヤーから見たドラフト（山の中身と順番は隠し、枚数だけ） */
export interface DraftView {
  /** 場のカード（左から） */
  field: CardDef[];
  /** 場のカードを見ている人が取れるか（field と同じ並び）。手番でなくても、自分が取れるかを表す */
  takeable: TakeInfo[];
  /** 両者が取ったカード（取った順に種類を並べる） */
  taken: [DraftTaken[], DraftTaken[]];
  /** 取った順の記録（両者が見られる公開情報） */
  picks: DraftPick[];
  /** 次に取る人（終わったら null） */
  turn: PlayerId | null;
  first: PlayerId;
  /** 山の残りの枚数 */
  pileSize: number;
  /** それぞれの残りの取得回数 */
  takesLeft: [number, number];
  done: boolean;
}

/** ドラフトでできたデッキ（createGame の PlayerSetup にそのまま渡せる） */
export interface DraftDeck {
  deck: Deck;
  cards: CardDef[];
}

export type DraftResult<T> = { ok: true; value: T } | { ok: false; error: string };
