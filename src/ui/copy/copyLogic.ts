/**
 * 戦った相手のデッキ（とフレンドが公開したデッキ）をコピーする：純粋関数（React・DOM・localStorage を使わない。tests/deck-copy.test.ts）。
 *
 * - importCards：外から来たカードを手元のカード置き場に足す形にする。
 *   - 届いたカードは parseCard を通す（形の検証と、古い倍率のカードの移行。決定事項 #65）
 *   - 中身（ID と名前を除いたすべて）が手元のカードと同じで、名前が同じか「<名前>（コピー）」なら、手元のカードを使う（重ねて増やさない）
 *   - 中身が違って名前だけ重なるカードは「<名前>（コピー）」「<名前>（コピー2）」…（カード名の上限 16 文字に収める）
 *   - 足すカードの ID はいつも新しく振る（相手の ID は手元の ID と重なりうる。newId は外から渡す）
 * - copyDeck：デッキごと・選んだカードだけ（select＝カード ID → 枚数）のコピー。できたデッキの中の ID は手元の ID に付け替える
 * - addToSourceGroup：コピーで増えたカードをグループ「<相手の名前>から」に入れる（無ければ作る、あれば足す）
 *
 * レアリティ・コスト・効果はそのまま写すので、元のデッキがルールに合っていれば、デッキごとのコピーもルールに合う
 * （名前を変えるのは同じ名前の別カードを分けるときだけで、同名の枚数制限が厳しくなる向きには変わらない）。
 */
import { BALANCE, GROUP_NAME_MAX, groupKey, normalizeName, parseCard, type CardDef, type CardGroup, type Deck } from '../../engine/index.ts';
import { addCardsToGroup, makeGroup, nextGroupColor } from '../collection/groups.ts';

/** 名前が重なったときに付ける印 */
export const COPY_SUFFIX = '（コピー）';
/** 「（コピーN）」の N をどこまで探すか（これを超えたら諦めて番号を伸ばす） */
const COPY_NAME_TRIES = 99;

const chars = (s: string) => [...s];

/** i 番目のコピーの名前（1 は「（コピー）」、2 から「（コピー2）」…）。カード名の上限に収まるように元の名前を切る */
export function copyNameAt(name: string, i: number): string {
  const base = normalizeName(name);
  const suffix = i <= 1 ? COPY_SUFFIX : `（コピー${i}）`;
  const room = BALANCE.card.nameMaxLength - chars(suffix).length;
  return chars(base).slice(0, Math.max(0, room)).join('').trimEnd() + suffix;
}

/** 使われていない名前にする：重ならなければそのまま、重なれば「（コピー）」「（コピー2）」… */
export function copyName(name: string, taken: ReadonlySet<string>): string {
  const base = normalizeName(name);
  if (!taken.has(base)) return base;
  for (let i = 1; ; i++) {
    const candidate = copyNameAt(base, i);
    if (!taken.has(candidate)) return candidate;
  }
}

/** 手元のカードの名前が、届いたカードの名前そのものか、そのコピーの名前か（前にコピーしたカードを見分ける） */
export function isCopyNameOf(have: string, incoming: string): boolean {
  const h = normalizeName(have);
  const base = normalizeName(incoming);
  if (h === base) return true;
  if (!h.endsWith('）') || !h.includes('（コピー')) return false;
  for (let i = 1; i <= COPY_NAME_TRIES; i++) if (copyNameAt(base, i) === h) return true;
  return false;
}

/** 中身の鍵（ID と名前を除く。parseCard で項目の順番と倍率をそろえてから比べる） */
function contentKey(card: CardDef): string {
  const { id: _id, name: _name, ...rest } = card;
  return JSON.stringify(rest);
}

/** 届いたカードを読む（形が壊れていれば null） */
function readCard(x: unknown): CardDef | null {
  const r = parseCard(x);
  return r.ok ? r.value : null;
}

export interface ImportCardsResult {
  /** 新しく足すカード（手元に同じものが無かったもの。新しい ID・必要なら「（コピー）」付きの名前） */
  cards: CardDef[];
  /** 届いたカードの ID → カード置き場での ID（手元のカードを使うときはその ID） */
  idMap: Record<string, string>;
  /** 手元の同じカードを使った、届いたカードの ID */
  reused: string[];
  /** 形が壊れていて読めなかった、届いたカードの ID */
  skipped: string[];
  /** 名前を変えたカード（届いた名前 → 足す名前） */
  renamed: { from: string; to: string }[];
}

export interface ImportOptions {
  /** 相手の名前（今は記録用。グループ名は addToSourceGroup で付ける） */
  sourceName: string;
  /** 新しいカードの ID を作る（UI は uuid。テストは決まった並び） */
  newId: () => string;
}

/**
 * 外から来たカードを手元のカード置き場に足す形にする（store には書かない。呼び出し側が actions.addCards などで保存する）。
 * 届いたカードの中で中身が同じものは1枚にまとめる
 */
export function importCards(existing: readonly CardDef[], incoming: readonly CardDef[], opts: ImportOptions): ImportCardsResult {
  /** 中身の鍵 → 手元のカード（と、このコピーで足したカード） */
  const byContent = new Map<string, { card: CardDef; added: boolean }[]>();
  const remember = (card: CardDef, added: boolean) => {
    const k = contentKey(card);
    const list = byContent.get(k);
    if (list) list.push({ card, added });
    else byContent.set(k, [{ card, added }]);
  };
  for (const c of existing) {
    const p = readCard(c);
    if (p) remember({ ...p, id: c.id, name: c.name }, false);
  }
  const taken = new Set(existing.map((c) => normalizeName(c.name)));
  const out: ImportCardsResult = { cards: [], idMap: {}, reused: [], skipped: [], renamed: [] };

  for (const inc of incoming) {
    if (Object.prototype.hasOwnProperty.call(out.idMap, inc.id)) continue;
    const card = readCard(inc);
    if (!card) {
      out.skipped.push(typeof inc?.id === 'string' ? inc.id : '');
      continue;
    }
    const same = byContent.get(contentKey(card))?.find((x) => isCopyNameOf(x.card.name, card.name));
    if (same) {
      out.idMap[inc.id] = same.card.id;
      if (!same.added) out.reused.push(inc.id);
      continue;
    }
    const name = copyName(card.name, taken);
    if (name !== normalizeName(card.name)) out.renamed.push({ from: card.name, to: name });
    const added: CardDef = { ...card, id: opts.newId(), name };
    taken.add(name);
    remember(added, true);
    out.cards.push(added);
    out.idMap[inc.id] = added.id;
  }
  return out;
}

/** デッキのカード ID → 枚数（同じカードが2か所にあればまとめる。1枚未満・整数でない枚数は数えない） */
export function deckCounts(deck: Pick<Deck, 'entries'>): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of deck.entries) {
    if (!Number.isInteger(e.count) || e.count < 1) continue;
    m.set(e.cardId, (m.get(e.cardId) ?? 0) + e.count);
  }
  return m;
}

/** 選んだ枚数を、デッキにある枚数までに収める（0 枚・知らないカードは落とす） */
export function clampSelection(deck: Pick<Deck, 'entries'>, select: Readonly<Record<string, number>>): Record<string, number> {
  const counts = deckCounts(deck);
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(select)) {
    const max = counts.get(id) ?? 0;
    const v = Math.min(max, Math.floor(n));
    if (v > 0) out[id] = v;
  }
  return out;
}

/** 選んだ枚数の合計 */
export function selectionTotal(select: Readonly<Record<string, number>>): number {
  return Object.values(select).reduce((s, n) => s + n, 0);
}

/** デッキの全部を選んだ形 */
export function selectAll(deck: Pick<Deck, 'entries'>): Record<string, number> {
  return Object.fromEntries(deckCounts(deck));
}

export interface CopyDeckOptions extends ImportOptions {
  /** できるデッキの名前 */
  name: string;
  /** 選んだカード（カード ID → 枚数）。省くとデッキごと */
  select?: Readonly<Record<string, number>>;
  /** 新しいデッキの ID を作る（省くと newId） */
  newDeckId?: () => string;
}

export interface CopyDeckResult extends ImportCardsResult {
  /** できたデッキ（中のカード ID は手元の ID。選んだカードだけのときは枚数が足りないこともある） */
  deck: Deck;
}

/**
 * デッキをコピーする：要るカードを手元に足す形にして、手元の ID で組んだデッキを作る。
 * select を渡すと、選んだカードを選んだ枚数だけ（デッキにある枚数まで）
 */
export function copyDeck(deck: Deck, cards: readonly CardDef[], existing: readonly CardDef[], opts: CopyDeckOptions): CopyDeckResult {
  const counts = opts.select ? new Map(Object.entries(clampSelection(deck, opts.select))) : deckCounts(deck);
  const byId = new Map(cards.map((c) => [c.id, c]));
  // デッキに出てくる順で、要るカードだけ
  const order = [...deckCounts(deck).keys()].filter((id) => (counts.get(id) ?? 0) > 0 && byId.has(id));
  const imported = importCards(
    existing,
    order.map((id) => byId.get(id)!),
    opts,
  );
  const merged = new Map<string, number>();
  for (const id of order) {
    const to = imported.idMap[id];
    if (to === undefined) continue;
    merged.set(to, (merged.get(to) ?? 0) + counts.get(id)!);
  }
  const out: Deck = {
    v: 1,
    id: (opts.newDeckId ?? opts.newId)(),
    name: normalizeName(opts.name),
    entries: [...merged].map(([cardId, count]) => ({ cardId, count })),
  };
  return { ...imported, deck: out };
}

/** 届いたデッキのうち、手元にもう同じカードがあるものの ID（シートの「すでに持っています」） */
export function ownedCardIds(existing: readonly CardDef[], cards: readonly CardDef[]): Set<string> {
  let n = 0;
  const r = importCards(existing, cards, { sourceName: '', newId: () => `__preview-${n++}` });
  return new Set(r.reused);
}

/** 手元のデッキと重ならないデッキ名（重なれば「(2)」「(3)」…） */
export function uniqueDeckName(name: string, decks: readonly Pick<Deck, 'name'>[]): string {
  const base = normalizeName(name);
  const taken = new Set(decks.map((d) => normalizeName(d.name)));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}(${i})`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** コピーしたカードを入れるグループの名前「<相手の名前>から」（グループ名の上限に収まるように相手の名前を切る） */
export function sourceGroupName(sourceName: string): string {
  const name = normalizeName(sourceName.replace(/\s+/gu, ' ')) || '相手';
  return (
    chars(name)
      .slice(0, GROUP_NAME_MAX - 2)
      .join('')
      .trimEnd() + 'から'
  );
}

/**
 * コピーで増えたカードをグループ「<相手の名前>から」に入れる。同じ名前のグループがあれば足し、無ければ作る。
 * cardIds が空なら何もしない（groupId は null）
 */
export function addToSourceGroup(
  groups: readonly CardGroup[],
  sourceName: string,
  cardIds: readonly string[],
  newId: () => string,
): { groups: CardGroup[]; groupId: string | null; created: boolean } {
  if (cardIds.length === 0) return { groups: [...groups], groupId: null, created: false };
  const name = sourceGroupName(sourceName);
  const key = groupKey(name);
  const same = groups.find((g) => groupKey(g.name) === key);
  if (same) return { groups: addCardsToGroup(groups, same.id, cardIds).groups, groupId: same.id, created: false };
  const g = makeGroup(newId(), name, nextGroupColor(groups), undefined, cardIds);
  return { groups: [...groups, g], groupId: g.id, created: true };
}
