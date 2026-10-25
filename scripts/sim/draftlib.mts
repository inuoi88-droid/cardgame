/**
 * ドラフト戦のシミュレーションの中身（draft.mts と draft-worker.mts が使う）。
 * 1つのジョブ＝公式カードで「場から交互に取る」ドラフトを1回（エンジンの createDraft・applyTake）して、
 * できた2つのデッキで対戦する（1戦目の先攻はランダム（決定事項 #125。シードから決める）、2戦目以降は「同じデッキでもう一戦」の
 * ルール＝前の負けが先攻、引き分けなら前に後攻だった人）。
 */
import { analyzeDeck, draft, type battle, type CardDef } from '../../src/engine/index.ts';
import { OFFICIAL_CARDS, OFFICIAL_ENTRIES, type OfficialArchetype } from '../../src/official/index.ts';
import { playGame, type DeckSpec, type GameResult, type Level } from './lib.mts';

type PlayerId = battle.PlayerId;

export const OFFICIAL_BY_ID = new Map(OFFICIAL_CARDS.map((c) => [c.id, c]));
export const ARCH_OF = new Map(OFFICIAL_ENTRIES.map((e) => [e.card.id, e.archetype]));

/**
 * 取り方（プロフィール）。
 * - auto-easy／auto-normal／auto-hard：本物のおまかせ（engine の autoPick。ばらつきと妨害は強さしだい）
 * - focus：おまかせの点（cpuPickScore）に「色をそろえる」重みとばらつき（±30%）を掛ける。人が色を決めて取るときの目安
 * - focus-wide：focus のばらつきを大きく（±60%）。下手な人・迷う人の目安
 */
export const PROFILES = ['auto-easy', 'auto-normal', 'auto-hard', 'focus', 'focus-wide'] as const;
export type Profile = (typeof PROFILES)[number];
/** 席ごとにプロフィールを選ぶ重み（PROFILES と同じ並び） */
const PROFILE_WEIGHTS = [1, 2, 1, 3, 1];

/** シード付きの乱数（mulberry32） */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function profileFor(seed: number, seat: PlayerId): Profile {
  const r = rng(seed * 31 + seat * 17 + 5)();
  const total = PROFILE_WEIGHTS.reduce((a, b) => a + b, 0);
  let x = r * total;
  for (let i = 0; i < PROFILES.length; i++) {
    x -= PROFILE_WEIGHTS[i]!;
    if (x < 0) return PROFILES[i]!;
  }
  return PROFILES[PROFILES.length - 1]!;
}

const myPicks = (s: draft.DraftState, p: PlayerId) => s.picks.filter((x) => x.player === p).map((x) => x.cardId);

/** 色（汎用を除く）ごとの取得回数 */
export function archCounts(picks: readonly string[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const id of picks) {
    const a = ARCH_OF.get(id)!;
    if (a !== 'neutral') c[a] = (c[a] ?? 0) + 1;
  }
  return c;
}

/**
 * デッキの主な色。いちばん多い色が MIXED_MAX 回以下なら「混色」、色が無ければ汎用
 */
const MIXED_MAX = 4;
export function primaryArch(picks: readonly string[]): OfficialArchetype | 'mixed' {
  const sorted = Object.entries(archCounts(picks)).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return 'neutral';
  if (sorted[0]![1] <= MIXED_MAX) return 'mixed';
  return sorted[0]![0] as OfficialArchetype;
}

function focusPick(s: draft.DraftState, p: PlayerId, rand: () => number, noise: number): string {
  const byId = new Map(Object.entries(s.cards));
  const counts = draft.draftCounts(s, p);
  const picks = myPicks(s, p);
  const top = Object.entries(archCounts(picks))
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
  let best = '';
  let bestScore = -Infinity;
  for (const t of draft.takeInfos(s, p)) {
    if (!t.ok) continue;
    const a = ARCH_OF.get(t.cardId)!;
    let mult = 1;
    if (picks.length >= 3 && a !== 'neutral') {
      if (a === top[0]) mult = 1.4;
      else if (a === top[1]) mult = 1.15;
      else mult = picks.length >= 7 ? 0.55 : 0.8;
    }
    const v = draft.cpuPickScore(s.cards[t.cardId]!, counts, byId) * mult * (1 + noise * (2 * rand() - 1));
    if (v > bestScore) [best, bestScore] = [t.cardId, v];
  }
  return best;
}

export function pickWith(profile: Profile, s: draft.DraftState, p: PlayerId, rand: () => number, seed: number): string {
  switch (profile) {
    case 'auto-easy':
      return draft.autoPick(s, p, 'easy', seed)!;
    case 'auto-normal':
      return draft.autoPick(s, p, 'normal', seed)!;
    case 'auto-hard':
      return draft.autoPick(s, p, 'hard', seed)!;
    case 'focus':
      return focusPick(s, p, rand, 0.3);
    case 'focus-wide':
      return focusPick(s, p, rand, 0.6);
  }
}

export interface DraftJob {
  seed: number;
  /** 対戦の数（1戦目＋「同じデッキでもう一戦」） */
  games: number;
  level: Level;
  checkLethal?: boolean;
  /** 席ごとの取り方（無ければシードで選ぶ） */
  profiles?: [Profile, Profile];
  /**
   * 'swap'：公式の先攻（後から取った人）と、入れ替えた先攻（先に取った人）で、同じシードの試合を1つずつ（games は無視して2試合）。
   * デッキの差（先に取った得）と先攻の得を分けて測る
   */
  mode?: 'official' | 'swap';
}

export interface DraftOutcome {
  seed: number;
  profiles: [Profile, Profile];
  /** 最初に取った人 */
  firstTaker: PlayerId;
  picks: [string[], string[]];
  /** 何番目に取ったか（カードID → 取った順の番号の配列。0〜29） */
  pickOrder: [number, string][];
  /** 場に出た回数（最初の場・補充・追加。カードID → 回数） */
  seen: Record<string, number>;
  /** 取れないカードしか無くて山から追加で出した枚数 */
  extra: number;
  valid: [boolean, boolean];
  invalidReasons: string[];
  games: GameResult[];
  level: Level;
}

function specOf(name: string, d: draft.DraftDeck): DeckSpec {
  return { name, deck: d.deck, cards: d.cards };
}

export function runDraftJob(job: DraftJob): DraftOutcome {
  const profiles = job.profiles ?? [profileFor(job.seed, 0), profileFor(job.seed, 1)];
  const rand = rng(job.seed ^ 0x5bd1e995);
  const created = draft.createDraft({ seed: job.seed, pool: OFFICIAL_CARDS });
  if (!created.ok) throw new Error(created.error);
  let s = created.value;
  const seen: Record<string, number> = {};
  for (const id of s.field) seen[id] = (seen[id] ?? 0) + 1;
  const pickOrder: [number, string][] = [];
  let extra = 0;
  while (!draft.isDraftDone(s)) {
    const p = draft.draftTurn(s)!;
    const id = pickWith(profiles[p], s, p, rand, job.seed);
    const before = s.pile;
    const r = draft.applyTake(s, p, id);
    if (!r.ok) throw new Error(`取れない：${r.error}`);
    pickOrder.push([s.picks.length, id]);
    s = r.state;
    const dealt = before.slice(0, before.length - s.pile.length);
    for (const x of dealt) seen[x] = (seen[x] ?? 0) + 1;
    extra += s.picks[s.picks.length - 1]!.extra ?? 0;
  }
  const decks = draft.draftDecks(s, ['A', 'B']);
  const byId = new Map<string, CardDef>(Object.entries(s.cards));
  const invalidReasons: string[] = [];
  const valid = decks.map((d) => {
    const a = analyzeDeck(d.deck, byId);
    if (!a.valid) invalidReasons.push(...a.violations.map((v) => v.message));
    return a.valid;
  }) as [boolean, boolean];
  const games: GameResult[] = [];
  // 1戦目の先攻はランダム（決定事項 #125）。シミュレーションではシードから決める
  let first = ((job.seed >>> 4) & 1) as PlayerId;
  const specs = [specOf('A', decks[0]), specOf('B', decks[1])] as const;
  if (job.mode === 'swap') {
    for (const f of [first, s.first]) games.push(playGame(specs[0], specs[1], (job.seed * 101 + 1) >>> 0, { first: f, level: job.level }));
  } else {
    for (let g = 0; g < job.games; g++) {
      const r = playGame(specs[0], specs[1], (job.seed * 101 + g * 7 + 1) >>> 0, { first, level: job.level, checkLethal: job.checkLethal });
      games.push(r);
      // 次の対戦の先攻：負けた人。引き分けなら前に後攻だった人
      first = r.winner === null ? ((1 - r.first) as PlayerId) : ((1 - r.winner) as PlayerId);
    }
  }
  return {
    seed: job.seed,
    profiles,
    firstTaker: s.first,
    picks: [myPicks(s, 0), myPicks(s, 1)],
    pickOrder,
    seen,
    extra,
    valid,
    invalidReasons,
    games,
    level: job.level,
  };
}
