/**
 * 場から交互に取るドラフト（決定事項 #115）。オンラインと CPU 戦で共用する純粋関数。
 * - 表向きの場にいつも field（6）枚。2人が交互に場から1枚ずつ取り、取るたびに伏せた山から1枚補充する。
 *   さらに場にいちばん長く残っている refresh（2）枚を山に混ぜ戻し、山から入れ替える（毎回3枚が新しくなる：決定事項 #134）。
 * - 1回取るとそのカードが copies（2）枚デッキに入る。1人 takes（15）回ずつで、どちらも30枚のデッキになる。
 *   レジェンドは1枚だけ入り（同名1枚）、1人 legendTakes 回まで。足りない1枚は終わったときに最後に取ったコモンで埋める。
 * - デッキのルール（レアリティの枚数・同名の上限）を破るカードは、その人は取れない（場には見えたまま）。
 * - 手番の人が場のどれも取れないときは、取れるカードが出るまで山から追加で場に出す（場が一時的に6枚を超える。超えている間は補充しない）。
 * - 最初に取る人はシード付き乱数で決める。乱数の状態は DraftState.rng に持つ。
 */
import { BALANCE } from '../balance.ts';
import { other } from '../battle/core.ts';
import { normalizeSeed, randInt, shuffle } from '../battle/rng.ts';
import type { PlayerId } from '../battle/types.ts';
import type { CardDef } from '../types.ts';
import { pickBest, seededRandom, type PickContext } from './pick.ts';
import { checkAdd, copiesOf, countTotal, deckFromCounts, draftPool, poolProblem } from './pool.ts';
import type { CpuLevel } from '../ai/cpu.ts';
import type { DraftCounts, DraftDeck, DraftResult, DraftState, DraftTaken, DraftView, TakeInfo } from './types.ts';

const D = BALANCE.draft;

export interface CreateDraftInput {
  seed: number;
  /** 使うカード（ID の重なり・ルール違反は除く。レジェンドは山に pileCopies.legend 枚ずつ） */
  pool: readonly CardDef[];
  /** 最初に取る人。無ければ乱数で決める */
  first?: PlayerId;
}

export function createDraft(input: CreateDraftInput): DraftResult<DraftState> {
  // 渡された並びに関係なく同じシードなら同じ山になるよう、ID の順にそろえてから混ぜる
  const pool = draftPool(input.pool, { legends: true }).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const problem = poolProblem(pool);
  if (problem) return { ok: false, error: problem };
  const s: DraftState = {
    v: 1,
    rng: normalizeSeed(input.seed),
    cards: Object.fromEntries(pool.map((c) => [c.id, c])),
    pile: pileOf(pool),
    field: [],
    since: [],
    picks: [],
    first: 0,
  };
  s.first = input.first ?? (randInt(s, 2) as PlayerId);
  shuffle(s, s.pile);
  refill(s);
  settle(s);
  return { ok: true, value: s };
}

/** 伏せた山の中身（混ぜる前）：1種類を pileCopies[レアリティ] 枚ずつ。同じカードが場に2枚並ぶこともある */
function pileOf(pool: readonly CardDef[]): string[] {
  return pool.flatMap((c) => Array.from({ length: D.pileCopies[c.rarity] }, () => c.id));
}

/** 終わったか（2人とも takes 回取った） */
export function isDraftDone(s: DraftState): boolean {
  return s.picks.length >= 2 * D.takes;
}

/** 次に取る人（終わっていれば null） */
export function draftTurn(s: DraftState): PlayerId | null {
  if (isDraftDone(s)) return null;
  return s.picks.length % 2 === 0 ? s.first : other(s.first);
}

/** 取った分だけの枚数（レジェンドは1枚） */
function takenCounts(s: DraftState, p: PlayerId): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const pick of s.picks) {
    if (pick.player !== p) continue;
    const def = s.cards[pick.cardId];
    counts[pick.cardId] = (counts[pick.cardId] ?? 0) + (def ? copiesOf(def) : D.copies);
  }
  return counts;
}

/**
 * そのプレイヤーのデッキ（カードID → 枚数）。終わっていて、レジェンドの分だけデッキの枚数に足りなければ、
 * その人が最後に取ったコモンを足りない枚数だけ足す（決定事項 #134）
 */
export function draftCounts(s: DraftState, p: PlayerId): Record<string, number> {
  const counts = takenCounts(s, p);
  const short = BALANCE.deck.size - countTotal(counts);
  if (isDraftDone(s) && short > 0) {
    const last = [...s.picks].reverse().find((x) => x.player === p && s.cards[x.cardId]?.rarity === 'common');
    if (last) counts[last.cardId] = (counts[last.cardId] ?? 0) + short;
  }
  return counts;
}

function contextOf(s: DraftState, p: PlayerId): PickContext {
  return { counts: takenCounts(s, p), byId: byIdOf(s) };
}

function byIdOf(s: DraftState): Map<string, CardDef> {
  return new Map(Object.entries(s.cards));
}

/** 場のカードそれぞれを、そのプレイヤーが取れるか（理由付き。手番かどうかは見ない） */
export function takeInfos(s: DraftState, p: PlayerId): TakeInfo[] {
  const counts = takenCounts(s, p);
  const byId = byIdOf(s);
  return s.field.map((cardId) => {
    const def = s.cards[cardId];
    if (!def) return { cardId, ok: false, reason: 'deckRule', message: 'カードが見つかりません' };
    const r = checkAdd(counts, def, byId);
    if (r.ok) return { cardId, ok: true };
    return { cardId, ok: false, reason: r.reason === 'full' ? 'deckRule' : r.reason, message: r.message };
  });
}

/** 場の置かれた時期（無い古い状態は全部0） */
function sinceOf(s: DraftState): number[] {
  if (!s.since || s.since.length !== s.field.length) s.since = s.field.map(() => 0);
  return s.since;
}

/** 場の右端に山から1枚置く */
function place(s: DraftState): void {
  sinceOf(s).push(s.picks.length);
  s.field.push(s.pile.shift()!);
}

/** 場が field 枚より少なければ、山から補充する */
function refill(s: DraftState): void {
  while (s.field.length < D.field && s.pile.length > 0) place(s);
}

/**
 * 場にいちばん長く残っている refresh 枚（keep の枠は除く）を山に混ぜ戻し、同じ枠に山から1枚ずつ出す（決定事項 #134）。
 * 同じ古さなら乱数で選ぶ。山から出してから戻すので、戻したカードがすぐ同じ枠に出ることはない。入れ替えたカードの ID を返す
 */
function refreshField(s: DraftState, keep: number): string[] {
  const since = sinceOf(s);
  const order = s.field
    .map((_, j) => ({ j, at: since[j]!, tie: 0 }))
    .filter((x) => x.j !== keep)
    .map((x) => ({ ...x, tie: randInt(s, 1 << 20) }))
    .sort((a, b) => a.at - b.at || a.tie - b.tie);
  const swapped: string[] = [];
  for (const { j } of order.slice(0, D.refresh)) {
    if (s.pile.length === 0) break;
    const old = s.field[j]!;
    s.field[j] = s.pile.shift()!;
    since[j] = s.picks.length;
    s.pile.splice(randInt(s, s.pile.length + 1), 0, old);
    swapped.push(old);
  }
  return swapped;
}

/** 手番の人が場のどれも取れなければ、取れるカードが出るまで山から追加で出す。出した枚数を返す */
function settle(s: DraftState): number {
  const p = draftTurn(s);
  if (p === null) return 0;
  let extra = 0;
  while (s.pile.length > 0 && !takeInfos(s, p).some((t) => t.ok)) {
    place(s);
    extra++;
  }
  return extra;
}

export type TakeResult = { ok: true; state: DraftState } | { ok: false; error: string; reason: 'turn' | 'notInField' | 'untakeable' | 'done' };

/** 場から1枚取る。元の状態は変えない */
export function applyTake(state: DraftState, player: PlayerId, cardId: string): TakeResult {
  if (isDraftDone(state)) return { ok: false, error: 'ドラフトはもう終わっています', reason: 'done' };
  if (draftTurn(state) !== player) return { ok: false, error: '相手が選ぶ番です', reason: 'turn' };
  const i = state.field.indexOf(cardId);
  if (i < 0) return { ok: false, error: 'そのカードは場にありません', reason: 'notInField' };
  const info = takeInfos(state, player)[i]!;
  if (!info.ok) return { ok: false, error: info.message ?? 'そのカードは取れません', reason: 'untakeable' };
  const s = structuredClone(state);
  const since = sinceOf(s);
  s.picks.push({ player, cardId });
  const pick = s.picks[s.picks.length - 1]!;
  // 取ったカードの場所にそのまま補充する。場が一時的に field 枚を超えているとき（追加で出した分）は詰める
  let kept = -1;
  if (s.field.length <= D.field && s.pile.length > 0 && !isDraftDone(s)) {
    s.field[i] = s.pile.shift()!;
    since[i] = s.picks.length;
    kept = i;
  } else {
    s.field.splice(i, 1);
    since.splice(i, 1);
  }
  if (!isDraftDone(s)) {
    // 長く残っているカードを入れ替える（補充したばかりの枠は除く）
    const swapped = refreshField(s, kept);
    if (swapped.length > 0) pick.swapped = swapped;
    refill(s);
    const extra = settle(s);
    if (extra > 0) pick.extra = extra;
  }
  return { ok: true, state: s };
}

/**
 * 伏せた山を混ぜ直したドラフト（サーバーが取る前に、そのリクエストの暗号学的な乱数で行う）。
 * 乱数の状態は31ビットなので、最初の場から状態を総当たりで当てられると山の順番がわかってしまう。取るたびに外からの乱数を混ぜて防ぐ。
 * 山の中身は変わらず、並びだけが変わる（どの並びも等しく出るので、配られるカードの確率は変わらない）。元の状態は変えない
 */
export function stirDraft(state: DraftState, entropy: number): DraftState {
  const s = structuredClone(state);
  s.rng = normalizeSeed((s.rng ^ Math.imul(entropy | 0, 0x9e3779b1)) | 0);
  shuffle(s, s.pile);
  return s;
}

/**
 * CPU（おまかせ）が取るカード。場の取れるカードから、点（pick.ts）がいちばん高いものを選ぶ。
 * ばらつきは状態の乱数と取得回数から決める（状態は変えない。同じ状態なら同じ答え）。取れるものが無ければ null
 */
export function autoPick(s: DraftState, player: PlayerId, level: CpuLevel = 'normal', seed = 0): string | null {
  const infos = takeInfos(s, player);
  const candidates = infos.filter((t) => t.ok).map((t) => s.cards[t.cardId]!);
  const best = pickBest(candidates, contextOf(s, player), {
    level,
    opponent: contextOf(s, other(player)),
    random: seededRandom((s.rng ^ Math.imul(s.picks.length + 1, 0x9e3779b1) ^ Math.imul(player + 1, 0x85ebca6b) ^ seed) | 0),
  });
  return best?.id ?? null;
}

/** ドラフトでできたデッキ（両者）。終わる前に呼ぶと途中までのデッキ */
export function draftDecks(s: DraftState, names: [string, string] = ['ドラフトのデッキ', 'ドラフトのデッキ']): [DraftDeck, DraftDeck] {
  const one = (p: PlayerId): DraftDeck => {
    const counts = draftCounts(s, p);
    return {
      deck: deckFromCounts(orderedCounts(s, p, counts), `draft-${p}`, names[p]),
      cards: Object.keys(counts).map((id) => s.cards[id]!),
    };
  };
  return [one(0), one(1)];
}

/** 取った順に並べた枚数 */
function orderedCounts(s: DraftState, p: PlayerId, counts: DraftCounts): Record<string, number> {
  const out: Record<string, number> = {};
  for (const pick of s.picks) if (pick.player === p && out[pick.cardId] === undefined) out[pick.cardId] = counts[pick.cardId]!;
  return out;
}

/**
 * 終わったドラフトを小さくする（伏せた山を捨て、カードの定義は取ったものと場に残ったものだけにする）。
 * 終わったあとに保存しておく記録用。draftView・draftDecks はそのまま使える
 */
export function compactDraft(s: DraftState): DraftState {
  if (!isDraftDone(s)) return s;
  const keep = new Set([...s.picks.flatMap((p) => [p.cardId, ...(p.swapped ?? [])]), ...s.field]);
  return { ...s, pile: [], cards: Object.fromEntries(Object.entries(s.cards).filter(([id]) => keep.has(id))) };
}

/** 1人のプレイヤーから見たドラフト。山の中身と順番・乱数は含めない */
export function draftView(s: DraftState, seat: PlayerId): DraftView {
  const taken = (p: PlayerId): DraftTaken[] => {
    const counts = orderedCounts(s, p, draftCounts(s, p));
    return Object.entries(counts).map(([id, count]) => ({ card: s.cards[id]!, count }));
  };
  const names = (ids: readonly string[] | undefined) => ids?.map((id) => s.cards[id]?.name ?? '？');
  const left = (p: PlayerId) => D.takes - s.picks.filter((x) => x.player === p).length;
  const done = isDraftDone(s);
  return {
    field: s.field.map((id) => s.cards[id]!),
    takeable: done ? s.field.map((cardId) => ({ cardId, ok: false, message: 'ドラフトは終わりました' })) : takeInfos(s, seat),
    taken: [taken(0), taken(1)],
    picks: s.picks.map((p) => (p.swapped ? { ...p, swapped: [...p.swapped], swappedNames: names(p.swapped)! } : { ...p })),
    turn: draftTurn(s),
    first: s.first,
    pileSize: s.pile.length,
    legends: Object.values(s.cards).some((c) => c.rarity === 'legend'),
    takesLeft: [left(0), left(1)],
    done,
  };
}
