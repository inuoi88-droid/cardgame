/** ブラウザ ⇄ Edge Function の送受信の形と、届いたデータの検証 */
import {
  ACTIVATE_USES,
  ALT_PLAYS,
  DISCARD_ABILITY_KINDS,
  HAND_ABILITY_KINDS,
  SET_ASIDE_KINDS,
  type Action,
  type ActivateUse,
  type SetAsideKind,
  type AltPlay,
  type Chosen,
  type DiscardAbilityKind,
  type GameState,
  type HandAbilityKind,
  type MulliganMode,
  type PlayerId,
  type TargetRef,
} from '../engine/battle/types.ts';
import type { CardDef, Deck } from '../engine/types.ts';
import type { DraftView } from '../engine/draft/types.ts';
import { normalizeRules, type MatchRules } from '../engine/fields.ts';
import { toLeaderId, type LeaderId } from '../engine/leaders.ts';
import { normalizeCode } from './codes.ts';
import { BALANCE } from '../engine/balance.ts';

/**
 * create・join の leader（MTG 要素 △ バッチD）はリーダーの ID（知らない値は none）。create の rules は対戦のルールのオプション
 * （次元・昼と夜。知らない値は無し扱い）。
 * create の mode（決定事項 #115）：'deck'（省略時。自分のデッキで戦う）か 'draft'（入室後に場から交互に取るドラフト。デッキは送らない）。
 * join のデッキは自分のデッキの部屋だけ要る（ドラフトの部屋では無視する）
 */
export type OnlineRequest =
  /**
   * secret（決定事項 #121。任意）：フレンド機能のプレイヤーの鍵。送ると席がそのプレイヤーに結び付き、対戦成績・「対戦中」の表示・
   * 対戦した相手への申請に使われる。listed: true で「募集中の部屋」の一覧に出る（公開の部屋。入るのは普通の join）
   */
  | { op: 'create'; name: string; deck?: Deck; cards?: CardDef[]; leader?: LeaderId; rules?: MatchRules; mode?: RoomMode; secret?: string; listed?: boolean }
  /** features：この画面ができること（'draft' を送らない古い画面はドラフトの部屋に入れない。決定事項 #120） */
  | { op: 'join'; code: string; name: string; deck?: Deck; cards?: CardDef[]; leader?: LeaderId; features?: string[]; secret?: string }
  /** 最新の状態を取る。数秒おきに送り、接続中の目印にもする */
  | { op: 'state'; code: string; token: string }
  | { op: 'action'; code: string; token: string; version: number; action: Action }
  /** ドラフトで場から1枚取る（自分の番だけ。version は見ていた版） */
  | { op: 'take'; code: string; token: string; version: number; cardId: string }
  /** ドラフトの「おまかせ」を入れる・切る */
  | { op: 'auto'; code: string; token: string; on: boolean }
  /** 対戦が終わったあと「同じデッキでもう一戦」（両者が押したら始まる） */
  | { op: 'rematch'; code: string; token: string };

/** waiting：相手待ち／drafting：ドラフト中（ドラフトの部屋）／playing：対戦中／ended：決着（再戦で playing に戻れる） */
export type RoomStatus = 'waiting' | 'drafting' | 'playing' | 'ended';

/** 新しい画面だけが join で送る、ドラフトの部屋に入れることの印（features。決定事項 #120） */
export const DRAFT_FEATURE = 'draft';

/** 部屋の形式：自分のデッキ／ドラフト（決定事項 #115） */
export type RoomMode = 'deck' | 'draft';
export const ROOM_MODES: readonly RoomMode[] = ['deck', 'draft'];

/** ドラフトの見え方（伏せた山は枚数だけ）。auto は両者の「おまかせ」 */
export interface RoomDraftView extends DraftView {
  auto: [boolean, boolean];
}

/** 1人のプレイヤーから見た部屋の様子 */
export interface RoomView {
  code: string;
  seat: PlayerId;
  status: RoomStatus;
  version: number;
  /** 自分から見える対戦の状態（相手の非公開情報は隠してある） */
  view: GameState | null;
  /** 今の手番（またはマリガン）の締め切り（エポックミリ秒） */
  deadline: number | null;
  /** サーバーの現在時刻（残り時間の表示を合わせるため） */
  serverNow: number;
  names: [string, string | null];
  opponentConnected: boolean;
  /** 続けて時間切れになった回数 */
  timeouts: [number, number];
  /** 対戦のルールのオプション（MTG 要素 △ バッチD。無ければどれも無し） */
  rules?: MatchRules;
  /** 両者のリーダー（MTG 要素 △ バッチD。まだ入っていない席は null） */
  leaders?: [LeaderId, LeaderId | null];
  /** 部屋の形式（決定事項 #115。古いサーバーの返事には無い＝deck） */
  mode?: RoomMode;
  /** ドラフトの部屋で、ドラフトが始まってから（終わったあとも記録として残る。終わると done） */
  draft?: RoomDraftView;
  /** 決着したあと「同じデッキでもう一戦」を押したか（席ごと）。再戦できる部屋で決着しているときだけ */
  rematch?: [boolean, boolean];
  /** この部屋で始めた対戦の数（1戦目から1） */
  games?: number;
  /**
   * 相手のデッキ（決定事項 #121：戦った相手のデッキをコピーできるように）。決着した（status が 'ended'）ときだけ入る。
   * 自分のデッキの部屋は相手が出したデッキ、ドラフトの部屋は相手がドラフトで作ったデッキ。name はそのデッキの名前（deck.name と同じ）。
   * 待機中・ドラフト中・対戦中は入らない（相手の山札の中身が漏れないように）。再戦が始まると消えるので、画面は決着したときに控える
   */
  opponentDeck?: { name: string; deck: Deck; cards: CardDef[] };
  /**
   * 相手のフレンドコード（決定事項 #121）。自分と相手の両方の席がプレイヤーに結び付いているときだけ（結果の画面の「フレンド申請」、
   * 対戦した相手の記録に使う）。相手の内部の ID や鍵は返さない
   */
  opponentFriendCode?: string;
  /** 「募集中の部屋」の一覧に出す部屋か（作成者が listed: true で作った） */
  listed?: boolean;
}

/** player：create・join の secret のプレイヤーが見つからない（端末のプレイヤー情報が無効。決定事項 #121） */
export type ErrorReason = 'version' | 'notFound' | 'auth' | 'invalid' | 'player';

export type OnlineResponse =
  | ({ ok: true; token?: string } & RoomView)
  | { ok: false; error: string; reason?: ErrorReason };

/** 1回の送信の大きさの上限（文字数） */
export const MAX_BODY_CHARS = 400_000;
/** 行動に含められる ID の数の上限 */
const MAX_IDS = 100;
const MAX_ID_CHARS = 100;
/** join の features の数の上限 */
const MAX_FEATURES = 10;

/** サーバーが受け取った形（デッキとカードは room.ts の checkDeck で調べる） */
export type ParsedRequest =
  | { op: 'create'; name: unknown; deck: unknown; cards: unknown; leader: LeaderId; rules?: MatchRules; mode: RoomMode; listed: boolean; secret?: string }
  | { op: 'join'; code: string; name: unknown; deck: unknown; cards: unknown; leader: LeaderId; features: string[]; secret?: string }
  | { op: 'state'; code: string; token: string }
  | { op: 'action'; code: string; token: string; version: number; action: Action }
  | { op: 'take'; code: string; token: string; version: number; cardId: string }
  | { op: 'auto'; code: string; token: string; on: boolean }
  | { op: 'rematch'; code: string; token: string };

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isId = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= MAX_ID_CHARS;
const isPlayer = (x: unknown): x is PlayerId => x === 0 || x === 1;
const isIdList = (x: unknown): x is string[] => Array.isArray(x) && x.length <= MAX_IDS && x.every(isId);
const isToken = (x: unknown): x is string => typeof x === 'string' && /^[0-9a-f]{64}$/.test(x);
const isIntIn = (x: unknown, lo: number, hi: number): x is number => typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi;
/** 追加の支払いの回数の上限（受付の形の検証。能力ごとの上限はエンジンが見る） */
const MAX_EXTRA = 3;
/** 休ませるモンスターの数の上限（受付の形の検証） */
const MAX_TAPS = 5;
/** 放題のモード：1〜maxModes の昇順・重複なし・2つ以上 */
const isModeList = (x: unknown): x is number[] =>
  Array.isArray(x) &&
  x.length >= 2 &&
  x.length <= BALANCE.modal.maxModes &&
  x.every((m, i) => isIntIn(m, 1, BALANCE.modal.maxModes) && (i === 0 || m > (x[i - 1] as number)));

function parseTarget(x: unknown): TargetRef | null {
  if (!isObj(x)) return null;
  if (x.kind === 'player' && isPlayer(x.player)) return { kind: 'player', player: x.player };
  if (x.kind === 'monster' && isId(x.uid)) return { kind: 'monster', uid: x.uid };
  return null;
}

/** 「選んだ1体」（使う・起動・魂力で共通）。無ければ undefined、形が壊れていれば null */
function parseChosen(x: unknown): Chosen | undefined | null {
  if (x === undefined) return undefined;
  if (!isObj(x)) return null;
  const chosen: Chosen = {};
  if (x.enemy !== undefined) {
    const t = parseTarget(x.enemy);
    if (!t) return null;
    chosen.enemy = t;
  }
  if (x.ally !== undefined) {
    if (!isId(x.ally)) return null;
    chosen.ally = x.ally;
  }
  return chosen;
}

/** 行動の形を調べ、知っている項目だけで作り直す（ブラウザからの行動に理由付きの降参は認めない） */
export function parseAction(x: unknown): Action | null {
  if (!isObj(x) || !isPlayer(x.player)) return null;
  const player = x.player;
  switch (x.type) {
    case 'mulligan': {
      const modes: MulliganMode[] = ['keep', 'all', 'partial'];
      if (!modes.includes(x.mode as MulliganMode)) return null;
      if (x.cardUids !== undefined && !isIdList(x.cardUids)) return null;
      return { type: 'mulligan', player, mode: x.mode as MulliganMode, ...(x.cardUids ? { cardUids: [...x.cardUids] } : {}) };
    }
    case 'playCard': {
      if (!isId(x.cardUid)) return null;
      const chosen = parseChosen(x.chosen);
      if (chosen === null) return null;
      // MTG 要素 ○ バッチC1：捨て札から使う（from は 'discard'。△ バッチC で待機ゾーンの 'waiting'）・再活で捨てる手札・脱出で除外する捨て札・キッカー
      if (x.from !== undefined && x.from !== 'discard' && x.from !== 'waiting') return null;
      if (x.discardUid !== undefined && !isId(x.discardUid)) return null;
      if (x.exileUids !== undefined && !isIdList(x.exileUids)) return null;
      if (x.kick !== undefined && typeof x.kick !== 'boolean') return null;
      // MTG 要素 ○ バッチC2：モード（0〜3 の整数。0 は双呪。合っているかはエンジンの validatePlay が見る）
      if (x.mode !== undefined && !(Number.isInteger(x.mode) && (x.mode as number) >= 0 && (x.mode as number) <= BALANCE.modal.maxModes)) return null;
      // MTG 要素 △ バッチB：追加の支払い（0〜3）・放題のモード（1〜3 の昇順・重複なし・2〜3個）・代わりの使い方・差し出す・休ませる（5体まで）・
      // 代替コスト・血の支払い（0〜2）。合っているかはエンジンの validatePlay が見る
      if (x.extra !== undefined && !isIntIn(x.extra, 0, MAX_EXTRA)) return null;
      if (x.modes !== undefined && !isModeList(x.modes)) return null;
      if (x.alt !== undefined && !(ALT_PLAYS as readonly unknown[]).includes(x.alt)) return null;
      if (x.sacrificeUid !== undefined && !isId(x.sacrificeUid)) return null;
      if (x.tapUids !== undefined && !(isIdList(x.tapUids) && x.tapUids.length <= MAX_TAPS)) return null;
      if (x.pitchUid !== undefined && !isId(x.pitchUid)) return null;
      if (x.lifePay !== undefined && !isIntIn(x.lifePay, 0, BALANCE.abilities.lifePay.max)) return null;
      return {
        type: 'playCard',
        player,
        cardUid: x.cardUid,
        ...(chosen ? { chosen } : {}),
        ...(x.from === 'discard' ? { from: 'discard' as const } : x.from === 'waiting' ? { from: 'waiting' as const } : {}),
        ...(x.discardUid !== undefined ? { discardUid: x.discardUid } : {}),
        ...(x.exileUids !== undefined ? { exileUids: [...x.exileUids] } : {}),
        ...(x.kick === true ? { kick: true } : {}),
        ...(x.mode !== undefined ? { mode: x.mode as number } : {}),
        ...(x.extra !== undefined ? { extra: x.extra as number } : {}),
        ...(x.modes !== undefined ? { modes: [...(x.modes as number[])] } : {}),
        ...(x.alt !== undefined ? { alt: x.alt as AltPlay } : {}),
        ...(x.sacrificeUid !== undefined ? { sacrificeUid: x.sacrificeUid } : {}),
        ...(x.tapUids !== undefined ? { tapUids: [...x.tapUids] } : {}),
        ...(x.pitchUid !== undefined ? { pitchUid: x.pitchUid } : {}),
        ...(x.lifePay !== undefined ? { lifePay: x.lifePay as number } : {}),
      };
    }
    case 'activate': {
      if (!isId(x.sourceUid)) return null;
      const chosen = parseChosen(x.chosen);
      if (chosen === null) return null;
      // MTG 要素 △ バッチC：Lvアップ・忠誠+1・忠誠−K
      if (x.use !== undefined && !(ACTIVATE_USES as readonly unknown[]).includes(x.use)) return null;
      return { type: 'activate', player, sourceUid: x.sourceUid, ...(chosen ? { chosen } : {}), ...(x.use !== undefined ? { use: x.use as ActivateUse } : {}) };
    }
    // MTG 要素 △ バッチC：待機させる（予顕・計画・待機）・裏向きを表にする
    case 'setAside': {
      if (!isId(x.cardUid)) return null;
      if (!(SET_ASIDE_KINDS as readonly unknown[]).includes(x.kind)) return null;
      return { type: 'setAside', player, cardUid: x.cardUid, kind: x.kind as SetAsideKind };
    }
    case 'reveal': {
      if (!isId(x.uid)) return null;
      const chosen = parseChosen(x.chosen);
      if (chosen === null) return null;
      return { type: 'reveal', player, uid: x.uid, ...(chosen ? { chosen } : {}) };
    }
    case 'handAbility': {
      if (!isId(x.cardUid)) return null;
      if (!(HAND_ABILITY_KINDS as readonly unknown[]).includes(x.ability)) return null;
      const chosen = parseChosen(x.chosen);
      if (chosen === null) return null;
      return { type: 'handAbility', player, cardUid: x.cardUid, ability: x.ability as HandAbilityKind, ...(chosen ? { chosen } : {}) };
    }
    // MTG 要素 △ バッチB：捨て札のカードの能力（相続・発掘・不朽）
    case 'discardAbility': {
      if (!isId(x.cardUid)) return null;
      if (!(DISCARD_ABILITY_KINDS as readonly unknown[]).includes(x.ability)) return null;
      const chosen = parseChosen(x.chosen);
      if (chosen === null) return null;
      return { type: 'discardAbility', player, cardUid: x.cardUid, ability: x.ability as DiscardAbilityKind, ...(chosen ? { chosen } : {}) };
    }
    case 'attack': {
      const target = parseTarget(x.target);
      if (!isId(x.attackerUid) || !target) return null;
      // 後援（MTG 要素 △ バッチB）
      if (x.enlistUid !== undefined && !isId(x.enlistUid)) return null;
      return { type: 'attack', player, attackerUid: x.attackerUid, target, ...(x.enlistUid !== undefined ? { enlistUid: x.enlistUid } : {}) };
    }
    case 'removeNoise':
      return isId(x.cardUid) ? { type: 'removeNoise', player, cardUid: x.cardUid } : null;
    case 'choose':
      return isIdList(x.picks) ? { type: 'choose', player, picks: [...x.picks] } : null;
    case 'endTurn':
      return { type: 'endTurn', player };
    case 'concede':
      return { type: 'concede', player };
    default:
      return null;
  }
}

export function parseRequest(x: unknown): Parsed<ParsedRequest> {
  const bad = (error: string): Parsed<ParsedRequest> => ({ ok: false, error });
  if (!isObj(x)) return bad('送信の形式が正しくありません');
  // MTG 要素 △ バッチD：リーダー（知らない値は none）とルール（知らない値は無し扱い）は作り直す
  const leader = toLeaderId(x.leader);
  // フレンド機能のプレイヤーの鍵（決定事項 #121。無ければ今までどおり席は誰にも結び付かない）
  if ((x.op === 'create' || x.op === 'join') && x.secret !== undefined && !isToken(x.secret)) return bad('プレイヤーの鍵が正しくありません');
  const secret = typeof x.secret === 'string' ? { secret: x.secret } : {};
  if (x.op === 'create') {
    if (x.listed !== undefined && typeof x.listed !== 'boolean') return bad('公開の指定が正しくありません');
    const rules = normalizeRules(x.rules);
    if (x.mode !== undefined && !(ROOM_MODES as readonly unknown[]).includes(x.mode)) return bad('部屋の形式が正しくありません');
    const mode: RoomMode = x.mode === 'draft' ? 'draft' : 'deck';
    return { ok: true, value: { op: 'create', name: x.name, deck: x.deck, cards: x.cards, leader, ...(rules ? { rules } : {}), mode, listed: x.listed === true, ...secret } };
  }
  const code = normalizeCode(x.code);
  if (!code) return bad('部屋コードが正しくありません');
  if (x.op === 'join') {
    const features = Array.isArray(x.features) ? x.features.filter(isId).slice(0, MAX_FEATURES) : [];
    return { ok: true, value: { op: 'join', code, name: x.name, deck: x.deck, cards: x.cards, leader, features, ...secret } };
  }
  if (!isToken(x.token)) return bad('合言葉が正しくありません');
  if (x.op === 'state') return { ok: true, value: { op: 'state', code, token: x.token } };
  if (x.op === 'action') {
    if (typeof x.version !== 'number' || !Number.isInteger(x.version)) return bad('版番号が正しくありません');
    const action = parseAction(x.action);
    if (!action) return bad('行動の形式が正しくありません');
    return { ok: true, value: { op: 'action', code, token: x.token, version: x.version, action } };
  }
  if (x.op === 'take') {
    if (typeof x.version !== 'number' || !Number.isInteger(x.version)) return bad('版番号が正しくありません');
    if (!isId(x.cardId)) return bad('カードの指定が正しくありません');
    return { ok: true, value: { op: 'take', code, token: x.token, version: x.version, cardId: x.cardId } };
  }
  if (x.op === 'auto') {
    if (typeof x.on !== 'boolean') return bad('おまかせの指定が正しくありません');
    return { ok: true, value: { op: 'auto', code, token: x.token, on: x.on } };
  }
  if (x.op === 'rematch') return { ok: true, value: { op: 'rematch', code, token: x.token } };
  return bad('知らない操作です');
}
