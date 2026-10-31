/**
 * みんなの広場・運営・公式カードの上書き（決定事項 #141）の画面側の状態と送信。
 * - 本人確認はフレンド機能のプレイヤー（socialStore の identity。無ければ作る）。運営かどうかはサーバーが決め、端末には表示用の控えだけ置く
 *   （`cardgame.v1.staff`＝{ friendCode, staff }。控えが運営でもサーバーは毎回確かめる）
 * - 公式カードとプリセットデッキ（#148）の上書きは端末に控える（`cardgame.v1.official`＝{ version, cards, presets }）。起動時と運営が
 *   保存したときに取り直し、CPU 戦のドラフト・公式カードの一覧は `useOfficialCards()`、CPU 戦の相手・対戦の準備のデッキ・ドラフトの
 *   「あなたのカード＋プリセット」は `usePresetDecks()`（元のものに上書きを重ねたもの）を使う
 */
import { useSyncExternalStore } from 'react';
import type { CardDef, Deck } from '../../engine/index.ts';
import type { PlazaError, PlazaOk, PlazaRequest } from '../../online/plaza/protocol.ts';
import { OFFICIAL_CARDS, withOfficialOverrides } from '../../official/index.ts';
import { PRESET_DECKS, withPresetOverrides, type PresetDeck, type PresetOverride } from '../../presets.ts';
import { callServer } from '../online/client.ts';
import { ensurePlayer, getSocial } from '../social/socialStore.ts';

type NetworkError = { ok: false; error: string; reason: 'network' };
export type PlazaReply<K extends PlazaRequest['op']> = PlazaOk<K> | PlazaError | NetworkError;

/** 鍵の要らない送信（一覧・1つ・公式カードの上書き） */
export async function callPlaza<R extends PlazaRequest>(req: R): Promise<PlazaReply<R['op']>> {
  return (await callServer(req as never)) as unknown as PlazaReply<R['op']>;
}

type WithoutSecret<R> = R extends { secret: string } ? Omit<R, 'secret'> : never;
export type PlazaAction = WithoutSecret<PlazaRequest>;

/** プレイヤーの鍵を付けて送る（プレイヤーが無ければ作る） */
export async function plazaAct<A extends PlazaAction>(req: A): Promise<PlazaReply<A['op']>> {
  const id = getSocial().identity ?? (await ensurePlayer());
  if (!id) return { ok: false, error: getSocial().error ?? 'プレイヤーを用意できませんでした（通信を確かめてください）', reason: 'network' };
  const res = (await callServer({ ...req, secret: id.secret } as never)) as unknown as PlazaReply<A['op']>;
  if (!res.ok && res.reason === 'staff') setStaffMark(id.friendCode, false);
  return res;
}

// ---------------------------------------------------------------- 運営の控え

const STAFF_KEY = 'cardgame.v1.staff';
interface StaffMark {
  friendCode: string;
  staff: boolean;
}

function readStaff(): StaffMark | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STAFF_KEY) ?? 'null') as Partial<StaffMark> | null;
    return raw && typeof raw.friendCode === 'string' && typeof raw.staff === 'boolean' ? { friendCode: raw.friendCode, staff: raw.staff } : null;
  } catch {
    return null;
  }
}

let staffMark: StaffMark | null = readStaff();
const staffListeners = new Set<() => void>();

function setStaffMark(friendCode: string, staff: boolean): void {
  staffMark = { friendCode, staff };
  try {
    localStorage.setItem(STAFF_KEY, JSON.stringify(staffMark));
  } catch {
    // 保存できなくても開いている間は使える
  }
  for (const l of staffListeners) l();
}

/** この端末のプレイヤーが運営か（控え。プレイヤーが替わっていれば false） */
export function isStaffNow(): boolean {
  const me = getSocial().identity;
  return !!me && staffMark?.friendCode === me.friendCode && staffMark.staff;
}

export function useStaff(): boolean {
  return useSyncExternalStore(
    (cb) => {
      staffListeners.add(cb);
      return () => staffListeners.delete(cb);
    },
    isStaffNow,
    () => false,
  );
}

/** サーバーに運営かを確かめ直す（プレイヤーがまだ無ければ何もしない） */
export async function refreshStaff(): Promise<void> {
  const me = getSocial().identity;
  if (!me) return;
  const res = await plazaAct({ op: 'plazaMe' });
  if (res.ok) setStaffMark(res.friendCode, res.staff);
}

export async function staffLogin(password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await plazaAct({ op: 'staffLogin', password });
  if (!res.ok) return { ok: false, error: res.error };
  const me = getSocial().identity;
  if (me) setStaffMark(me.friendCode, true);
  return { ok: true };
}

export async function staffLogout(): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await plazaAct({ op: 'staffLogout' });
  if (!res.ok) return { ok: false, error: res.error };
  const me = getSocial().identity;
  if (me) setStaffMark(me.friendCode, false);
  return { ok: true };
}

// ---------------------------------------------------------------- 公式カードの上書き

const OFFICIAL_KEY = 'cardgame.v1.official';
interface OfficialCache {
  version: number;
  cards: CardDef[];
  /** プリセットデッキの上書き（決定事項 #148） */
  presets: PresetOverride[];
}

function readOfficial(): OfficialCache {
  try {
    const raw = JSON.parse(localStorage.getItem(OFFICIAL_KEY) ?? 'null') as Partial<OfficialCache> | null;
    if (raw && typeof raw.version === 'number' && Array.isArray(raw.cards)) {
      // プリセットの無い古い控え（#148 より前）は、同じ版でも中身を取り直す（版 -1 で since を付けない）
      return Array.isArray(raw.presets) ? { version: raw.version, cards: raw.cards, presets: raw.presets } : { version: -1, cards: raw.cards, presets: [] };
    }
  } catch {
    // 読めなければ上書きなし
  }
  return { version: 0, cards: [], presets: [] };
}

let official = readOfficial();
let officialCards: readonly CardDef[] = withOfficialOverrides(OFFICIAL_CARDS, official.cards);
let presetDecks: readonly PresetDeck[] = withPresetOverrides(PRESET_DECKS, official.presets);
const officialListeners = new Set<() => void>();

function setOfficial(next: OfficialCache): void {
  official = next;
  officialCards = withOfficialOverrides(OFFICIAL_CARDS, next.cards);
  presetDecks = withPresetOverrides(PRESET_DECKS, next.presets);
  try {
    localStorage.setItem(OFFICIAL_KEY, JSON.stringify(next));
  } catch {
    // 保存できなくても開いている間は使える
  }
  for (const l of officialListeners) l();
}

/** 公式カード（運営の書き換えを重ねたもの） */
export function getOfficialCards(): readonly CardDef[] {
  return officialCards;
}

export function useOfficialCards(): readonly CardDef[] {
  return useSyncExternalStore(
    (cb) => {
      officialListeners.add(cb);
      return () => officialListeners.delete(cb);
    },
    getOfficialCards,
    () => OFFICIAL_CARDS,
  );
}

/** 書き換えられている公式カードの ID */
export function overriddenIds(): ReadonlySet<string> {
  return new Set(official.cards.map((c) => c.id));
}

/** プリセットデッキ（運営の書き換えを重ねたもの。決定事項 #148） */
export function getPresetDecks(): readonly PresetDeck[] {
  return presetDecks;
}

export function usePresetDecks(): readonly PresetDeck[] {
  return useSyncExternalStore(
    (cb) => {
      officialListeners.add(cb);
      return () => officialListeners.delete(cb);
    },
    getPresetDecks,
    () => PRESET_DECKS,
  );
}

/** 書き換えられているプリセットデッキの ID（デッキの ID：preset-deck-<id>） */
export function overriddenPresetIds(): ReadonlySet<string> {
  return new Set(official.presets.map((p) => p.id));
}

let officialInFlight: Promise<void> | null = null;

/** 上書きを取り直す（版が同じなら中身は送られてこない）。通信できなければ控えのまま */
export function refreshOfficial(): Promise<void> {
  officialInFlight ??= (async () => {
    const res = await callPlaza(official.version >= 0 ? { op: 'officialList', since: official.version } : { op: 'officialList' });
    officialInFlight = null;
    if (res.ok && res.cards) setOfficial({ version: res.version, cards: res.cards, presets: res.presets ?? [] });
  })();
  return officialInFlight;
}

/** 運営が書き換えた（または元に戻した）あと：取り直す */
export async function afterOfficialChange(): Promise<void> {
  official = { ...official, version: -1 };
  await refreshOfficial();
}

// ---------------------------------------------------------------- 公開（運営だけ）

/** カードを広場に公開する（同じカードは置き換わる）。できなければ理由 */
export async function publishCard(card: CardDef): Promise<string | null> {
  const res = await plazaAct({ op: 'plazaPublish', kind: 'card', card });
  return res.ok ? null : res.error;
}

/** デッキを広場に公開する（使っているカードもいっしょに）。できなければ理由 */
export async function publishDeck(deck: Deck, cards: readonly CardDef[]): Promise<string | null> {
  const used = new Set(deck.entries.map((e) => e.cardId));
  const res = await plazaAct({ op: 'plazaPublish', kind: 'deck', deck, cards: cards.filter((c) => used.has(c.id)) });
  return res.ok ? null : res.error;
}
