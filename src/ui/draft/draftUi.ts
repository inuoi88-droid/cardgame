/**
 * ドラフトの画面の補助（純粋な関数。決定事項 #119）。場から交互に取る形式の画面（DraftBoard）で使う。
 * - shortReason：取れない理由の短い札（「レアは上限」など）
 * - rarityRoom：レア・エピックをあと何回取れるか（デッキの上限から）
 * - trackField：場のカードに、補充をまたいで変わらないキーを振る（新しく出たカードだけを光らせる・同じカードが2枚並んでも区別する）
 * - deckRows：取ったカードをコスト順の行にする
 */
import { BALANCE, RARITY_LABEL, type CardDef, type Rarity, type draft } from '../../engine/index.ts';

/** 取れない理由の短い札（カードの下に出す）。取れるなら null */
export function shortReason(info: draft.TakeInfo | undefined, def: CardDef | undefined): string | null {
  if (!info || info.ok) return null;
  if (info.reason === 'rarityLimit') return `${def ? RARITY_LABEL[def.rarity] : 'レアリティ'}は上限`;
  if (info.reason === 'sameName') return '同名は上限';
  return '取れません';
}

export interface RarityRoom {
  rarity: Rarity;
  /** デッキに入っている枚数 */
  copies: number;
  /** デッキに入れられる枚数（上限） */
  limit: number;
  /** あと何回取れるか */
  takesLeft: number;
}

/** 上限のあるレアリティ（レジェンドはドラフトに出ないので除く）の、使った枚数とあと取れる回数 */
export function rarityRoom(taken: readonly draft.DraftTaken[]): RarityRoom[] {
  const out: RarityRoom[] = [];
  for (const rarity of ['rare', 'epic'] as const) {
    const limit = BALANCE.rarity[rarity].deckLimit;
    if (limit === null) continue;
    const copies = taken.filter((t) => t.card.rarity === rarity).reduce((n, t) => n + t.count, 0);
    out.push({ rarity, copies, limit, takesLeft: Math.max(0, Math.floor((limit - copies) / BALANCE.draft.copies)) });
  }
  return out;
}

export interface FieldTrack {
  ids: string[];
  keys: string[];
  /** 次に振る番号 */
  seq: number;
  /** 前回から新しく場に出たカードのキー */
  fresh: string[];
}

export const EMPTY_TRACK: FieldTrack = { ids: [], keys: [], seq: 0, fresh: [] };

/**
 * 新しい場の並びにキーを振る。前の並びの順を保ったまま同じ ID を前から順に引き継ぎ（取られたカードは飛ばされる）、
 * 引き継げなかったカード（山から出たカード）に新しいキーを振る。最初の1回（前が空）は光らせない
 */
export function trackField(prev: FieldTrack, next: readonly string[]): FieldTrack {
  const keys: string[] = [];
  const fresh: string[] = [];
  let seq = prev.seq;
  let i = 0;
  for (const id of next) {
    let k = i;
    while (k < prev.ids.length && prev.ids[k] !== id) k++;
    if (k < prev.ids.length) {
      keys.push(prev.keys[k]!);
      i = k + 1;
    } else {
      const key = `f${seq++}`;
      keys.push(key);
      if (prev.ids.length > 0) fresh.push(key);
    }
  }
  return { ids: [...next], keys, seq, fresh };
}

export interface DeckRow {
  card: CardDef;
  count: number;
}

/** 取ったカードをコスト順（同じコストは名前順）の行にする */
export function deckRows(taken: readonly draft.DraftTaken[]): DeckRow[] {
  const collator = new Intl.Collator('ja');
  return [...taken].sort((a, b) => a.card.cost - b.card.cost || collator.compare(a.card.name, b.card.name)).map((t) => ({ card: t.card, count: t.count }));
}

export function takenTotal(taken: readonly draft.DraftTaken[]): number {
  return taken.reduce((n, t) => n + t.count, 0);
}

/** 取ったカードをデッキの形（コスト分布などに渡す）にする */
export function takenDeck(taken: readonly draft.DraftTaken[]): { entries: { cardId: string; count: number }[]; cards: CardDef[] } {
  return { entries: taken.map((t) => ({ cardId: t.card.id, count: t.count })), cards: taken.map((t) => t.card) };
}

/** 直前の取得の一言（「相手が『X』を取りました」）。無ければ null */
export function lastPickText(view: Pick<draft.DraftView, 'picks' | 'taken'>, me: 0 | 1, names: readonly [string, string]): string | null {
  const last = view.picks[view.picks.length - 1];
  if (!last) return null;
  const def = view.taken[last.player].find((t) => t.card.id === last.cardId)?.card;
  const who = last.player === me ? 'あなた' : names[last.player];
  const extra = last.extra ? `（取れるカードが無かったので、山から${last.extra}枚を追加で出しました）` : '';
  return `${who}が「${def?.name ?? '？'}」を取りました${extra}`;
}
