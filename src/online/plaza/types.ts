/**
 * みんなの広場（一般公開）・運営・公式カードの上書き（決定事項 #141）の保存する形・上限・保存場所の約束（PlazaStore）。
 * 本人確認はフレンド機能のプレイヤー（secret のハッシュ。決定事項 #121）。運営はパスワードで入る：
 * パスワードはコードに書かず、DB の cardgame.admin_settings に塩つきの繰り返しハッシュだけを置く（このリポジトリは公開なので）。
 * 公開できるのは運営だけ（最初は限られた人だけ。見るのは誰でも）。公式カードの上書きは保存した時点で全員に効く（オンラインのドラフトの山にも）。
 */
import type { CardDef, Deck } from '../../engine/types.ts';

/** 1人（運営）が公開できる数 */
export const MAX_PUBLIC_ITEMS = 200;
/** 公開1つの大きさの上限（JSON の文字数。フレンドの公開デッキと同じ） */
export const PUBLIC_ITEM_MAX_CHARS = 40_000;
/** 1人の公開の大きさの合計の上限 */
export const PUBLIC_TOTAL_MAX_CHARS = 1_000_000;
/** 一覧の1回の件数 */
export const PLAZA_PAGE = 40;
/** 公開の名前の長さの上限 */
export const PUBLIC_NAME_MAX = 40;
/** 公式カードの履歴を返す件数 */
export const OFFICIAL_HISTORY_LIMIT = 30;

/** 運営のパスワードを間違えられる回数：同じプレイヤーで1時間に／同じ送り元で1時間に／全体で1時間に */
export const STAFF_FAIL_PER_PLAYER_HOUR = 5;
export const STAFF_FAIL_PER_CLIENT_HOUR = 10;
export const STAFF_FAIL_PER_HOUR = 50;

/** admin_settings の運営のパスワードの鍵 */
export const STAFF_PASSWORD_KEY = 'staff_password';

export type PublicKind = 'card' | 'deck';

/** 公開したもの */
export interface PublicItemRecord {
  /** 16進16文字 */
  id: string;
  ownerId: string;
  kind: PublicKind;
  /** 公開したカード・デッキの元の ID（持ち主・種類・元の ID で1つ。公開し直すと置き換わる） */
  sourceId: string;
  name: string;
  /** kind が card のとき */
  card?: CardDef;
  /** kind が deck のとき */
  deck?: Deck;
  cards?: CardDef[];
  /** デッキの枚数（カードは1） */
  count: number;
  /** JSON の文字数 */
  size: number;
  /** 一覧に出す表紙（カードならそのカード、デッキならいちばん多く入っているカード） */
  cover: CardDef | null;
  createdAt: number;
  updatedAt: number;
}

/** 一覧の1行（デッキは中身なし。表紙に1枚） */
export interface PublicItemSummaryRecord {
  id: string;
  ownerId: string;
  kind: PublicKind;
  sourceId: string;
  name: string;
  count: number;
  size: number;
  createdAt: number;
  updatedAt: number;
  /** カードならそのカード、デッキなら表紙（いちばん多く入っているカード） */
  cover: CardDef | null;
}

/** 公式カードの上書きの履歴の1行（card が null なら元に戻した） */
export interface OfficialHistoryRecord {
  version: number;
  cardId: string;
  card: CardDef | null;
  by: string;
  at: number;
}

/** 一覧の続きの位置（新しい順） */
export interface PlazaCursor {
  at: number;
  id: string;
}

export interface PlazaStore {
  /** 運営のパスワードの保存値（`<回数>$<塩>$<ハッシュ>`）。無ければ運営には誰もなれない */
  staffPassword(): Promise<string | null>;
  isStaff(playerId: string): Promise<boolean>;
  setStaff(playerId: string, on: boolean, at: number): Promise<void>;

  /** 公開する（持ち主・種類・元の ID が同じものがあれば、id と作った時刻を残して置き換える）。保存した id を返す */
  putItem(item: PublicItemRecord): Promise<string>;
  item(id: string): Promise<PublicItemRecord | null>;
  removeItem(id: string): Promise<void>;
  /** 新しい順。kind があればその種類だけ、before があればそれより前 */
  listItems(opts: { kind?: PublicKind; before?: PlazaCursor; limit: number }): Promise<PublicItemSummaryRecord[]>;
  itemsByOwner(ownerId: string): Promise<PublicItemSummaryRecord[]>;

  /** 公式カードの上書きと版（版は履歴の最後の番号。上書きが1つも無ければ 0） */
  officialOverrides(): Promise<{ version: number; cards: CardDef[] }>;
  /** 上書きを保存する（card が null なら上書きを消して元に戻す）。履歴に1行足し、新しい版を返す */
  saveOfficial(cardId: string, card: CardDef | null, by: string, at: number): Promise<number>;
  officialHistory(cardId: string, limit: number): Promise<OfficialHistoryRecord[]>;
}
