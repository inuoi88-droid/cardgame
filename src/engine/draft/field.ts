/**
 * 場から交互に取るドラフト（決定事項 #115）。オンラインと CPU 戦で共用する純粋関数。
 * - 表向きの場にいつも field（6）枚。2人が交互に場から1枚ずつ取り、取るたびに伏せた山から1枚補充する。
 * - 1回取るとそのカードが copies（2）枚デッキに入る。1人 takes（15）回ずつで、どちらも30枚のデッキになる。
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
import { checkAdd, deckFromCounts, draftPool, poolProblem } from './pool.ts';
import type { CpuLevel } from '../ai/cpu.ts';
import type { DraftCounts, DraftDeck, DraftResult, DraftState, DraftTaken, DraftView, TakeInfo } from './types.ts';

const D = BALANCE.draft;

export interface CreateDraftInput {
  seed: number;
  /** 使うカード（ID の重なり・ルール違反・レジェンドは除く） */
  pool: readonly CardDef[];
  /** 最初に取る人。無ければ乱数で決める */
  first?: PlayerId;
}

export function createDraft(input: CreateDraftInput): DraftResult<DraftState> {
  // 渡された並びに関係なく同じシードなら同じ山になるよう、ID の順にそろえてから混ぜる
  const pool = draftPool(input.pool).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const problem = poolProblem(pool);
  if (problem) return { ok: false, error: problem };
  const s: DraftState = {
    v: 1,
    rng: normalizeSeed(input.seed),
    cards: Object.fromEntries(pool.map((c) => [c.id, c])),
    pile: pileOf(pool),
    field: [],
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

/** そのプレイヤーのデッキ（カードID → 枚数） */
export function draftCounts(s: DraftState, p: PlayerId): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const pick of s.picks) if (pick.player === p) counts[pick.cardId] = (counts[pick.cardId] ?? 0) + D.copies;
  return counts;
}

function contextOf(s: DraftState, p: PlayerId): PickContext {
  return { counts: draftCounts(s, p), byId: byIdOf(s) };
}

function byIdOf(s: DraftState): Map<string, CardDef> {
  return new Map(Object.entries(s.cards));
}

/** 場のカードそれぞれを、そのプレイヤーが取れるか（理由付き。手番かどうかは見ない） */
export function takeInfos(s: DraftState, p: PlayerId): TakeInfo[] {
  const counts = draftCounts(s, p);
  const byId = byIdOf(s);
  return s.field.map((cardId) => {
    const def = s.cards[cardId];
    if (!def) return { cardId, ok: false, reason: 'deckRule', message: 'カードが見つかりません' };
    const r = checkAdd(counts, def, byId);
    if (r.ok) return { cardId, ok: true };
    return { cardId, ok: false, reason: r.reason === 'full' ? 'deckRule' : r.reason, message: r.message };
  });
}

/** 場が field 枚より少なければ、山から補充する */
function refill(s: DraftState): void {
  while (s.field.length < D.field && s.pile.length > 0) s.field.push(s.pile.shift()!);
}

/** 手番の人が場のどれも取れなければ、取れるカードが出るまで山から追加で出す。出した枚数を返す */
function settle(s: DraftState): number {
  const p = draftTurn(s);
  if (p === null) return 0;
  let extra = 0;
  while (s.pile.length > 0 && !takeInfos(s, p).some((t) => t.ok)) {
    s.field.push(s.pile.shift()!);
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
  // 取ったカードの場所にそのまま補充する（ほかのカードは動かさない）。場が一時的に field 枚を超えているとき（追加で出した分）は詰める
  if (s.field.length <= D.field && s.pile.length > 0 && s.picks.length + 1 < 2 * D.takes) s.field[i] = s.pile.shift()!;
  else s.field.splice(i, 1);
  s.picks.push({ player, cardId });
  if (!isDraftDone(s)) {
    refill(s);
    const extra = settle(s);
    if (extra > 0) s.picks[s.picks.length - 1]!.extra = extra;
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
  const keep = new Set([...s.picks.map((p) => p.cardId), ...s.field]);
  return { ...s, pile: [], cards: Object.fromEntries(Object.entries(s.cards).filter(([id]) => keep.has(id))) };
}

/** 1人のプレイヤーから見たドラフト。山の中身と順番・乱数は含めない */
export function draftView(s: DraftState, seat: PlayerId): DraftView {
  const taken = (p: PlayerId): DraftTaken[] => {
    const counts = orderedCounts(s, p, draftCounts(s, p));
    return Object.entries(counts).map(([id, count]) => ({ card: s.cards[id]!, count }));
  };
  const left = (p: PlayerId) => D.takes - s.picks.filter((x) => x.player === p).length;
  const done = isDraftDone(s);
  return {
    field: s.field.map((id) => s.cards[id]!),
    takeable: done ? s.field.map((cardId) => ({ cardId, ok: false, message: 'ドラフトは終わりました' })) : takeInfos(s, seat),
    taken: [taken(0), taken(1)],
    picks: s.picks.map((p) => ({ ...p })),
    turn: draftTurn(s),
    first: s.first,
    pileSize: s.pile.length,
    takesLeft: [left(0), left(1)],
    done,
  };
}
