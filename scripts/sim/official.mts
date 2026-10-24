/**
 * 公式カード（src/official）の測定。
 *
 *   node scripts/sim/official.mts common 40      # アーキタイプのコモンだけのデッキ（officialCommonDeck）の総当たり（汎用を含む6つ）
 *   node scripts/sim/official.mts draft 300 2     # 「場から交互に取る」ドラフトを簡単な CPU で300回して、各2試合。
 *                                                  # 主なアーキタイプごとの勝率・先に取った側の勝率・カードごとの勝率
 *
 * ドラフトの取り方はここだけの目安（レアリティ・すでに多いアーキタイプ・汎用を好む＋乱数）。本物のドラフトの CPU とは別。
 * 場は BALANCE.draft の数字があればそれを使い、なければ6枚・2枚ずつ・15回。山は公式カードを1種類1枚ずつ混ぜたもの。
 */
import { BALANCE } from '../../src/engine/index.ts';
import {
  OFFICIAL_ARCHETYPE_IDS,
  OFFICIAL_CARDS,
  OFFICIAL_ENTRIES,
  officialArchetypeName,
  officialCommonDeck,
  type OfficialArchetype,
} from '../../src/official/index.ts';
import { argN, pct, series, table, writeOut, type DeckSpec } from './lib.mts';

const byId = new Map(OFFICIAL_CARDS.map((c) => [c.id, c]));
const archOf = new Map(OFFICIAL_ENTRIES.map((e) => [e.card.id, e.archetype]));
const D = BALANCE.draft as {
  copies: number;
  rounds: number;
  field?: number;
  takes?: number;
};
const COPIES = D.copies;
const TAKES = D.takes ?? D.rounds;
const FIELD = D.field ?? 6;

function specOf(name: string, entries: { cardId: string; count: number }[]): DeckSpec {
  return {
    name,
    deck: { v: 1, id: `sim-${name}`, name, entries },
    cards: entries.map((e) => byId.get(e.cardId)!),
  };
}

async function commonRoundRobin(n: number): Promise<void> {
  const specs = OFFICIAL_ARCHETYPE_IDS.map((a) => specOf(officialArchetypeName(a), officialCommonDeck(a).entries));
  const rows: (string | number)[][] = [];
  const score: Record<string, number[]> = {};
  for (let i = 0; i < specs.length; i++) {
    for (let j = i + 1; j < specs.length; j++) {
      const a = specs[i]!;
      const b = specs[j]!;
      const r = await series(a, b, n, { seedBase: 5000 + i * 100 + j });
      (score[a.name] ??= []).push(r.winRate);
      (score[b.name] ??= []).push(1 - r.winRate - r.drawRate);
      rows.push([`${a.name} vs ${b.name}`, n, pct(r.winRate), pct(r.drawRate), pct(r.firstWinRate), r.turnsMedian]);
    }
  }
  console.log(table(['対戦', 'n', 'A勝率', '引分', '先攻勝率', '中央T'], rows));
  const avg = Object.entries(score).map(([k, v]) => [k, pct(v.reduce((x, y) => x + y, 0) / v.length)]);
  console.log(table(['コモンのデッキ', '平均勝率'], avg));
  writeOut('official-common.json', { rows, avg });
}

/** シード付きの乱数（mulberry32） */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** このピックでデッキのルール（レアリティの枚数）を破らないか */
function takeable(picks: string[], id: string): boolean {
  const r = byId.get(id)!.rarity;
  const limit = BALANCE.rarity[r].deckLimit;
  if (limit === null) return true;
  const n = picks.filter((x) => byId.get(x)!.rarity === r).length;
  return (n + 1) * COPIES <= limit;
}

function pickScore(picks: string[], id: string, rand: () => number): number {
  const a = archOf.get(id)!;
  const counts: Record<string, number> = {};
  for (const x of picks) counts[archOf.get(x)!] = (counts[archOf.get(x)!] ?? 0) + 1;
  const top = Object.entries(counts)
    .filter(([k]) => k !== 'neutral')
    .sort((x, y) => y[1] - x[1])
    .slice(0, 2)
    .map(([k]) => k);
  const rarity = byId.get(id)!.rarity;
  let s = rarity === 'epic' ? 4 : rarity === 'rare' ? 2.5 : 1;
  if (a === 'neutral') s += 1.2;
  else if (top.includes(a)) s += 2 + (counts[a] ?? 0) * 0.3;
  else if (picks.length >= 6) s -= 1.5;
  return s + rand() * 1.5;
}

function primary(picks: string[]): OfficialArchetype {
  const c: Record<string, number> = {};
  for (const x of picks) if (archOf.get(x) !== 'neutral') c[archOf.get(x)!] = (c[archOf.get(x)!] ?? 0) + 1;
  return (Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'neutral') as OfficialArchetype;
}

function draft(seed: number): [string[], string[]] {
  const rand = rng(seed);
  const pile = OFFICIAL_CARDS.map((c) => c.id);
  for (let i = pile.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pile[i], pile[j]] = [pile[j]!, pile[i]!];
  }
  const field = pile.splice(0, FIELD);
  const picks: [string[], string[]] = [[], []];
  for (let t = 0; t < TAKES * 2; t++) {
    const mine = picks[t % 2]!;
    while (!field.some((id) => takeable(mine, id)) && pile.length > 0) field.push(pile.shift()!);
    let best = '';
    let bestScore = -Infinity;
    for (const id of field.filter((x) => takeable(mine, x))) {
      const s = pickScore(mine, id, rand);
      if (s > bestScore) [best, bestScore] = [id, s];
    }
    mine.push(best);
    field.splice(field.indexOf(best), 1);
    if (field.length < FIELD && pile.length > 0) field.push(pile.shift()!);
  }
  return picks;
}

async function draftSeries(drafts: number, games: number): Promise<void> {
  const byArch: Record<string, [number, number]> = {};
  const byCard: Record<string, [number, number]> = {};
  const turns: number[] = [];
  let firstPicker = 0;
  let total = 0;
  for (let d = 0; d < drafts; d++) {
    const [a, b] = draft(9000 + d);
    const deckOf = (p: string[], name: string) =>
      specOf(
        name,
        p.map((cardId) => ({ cardId, count: COPIES })),
      );
    const r = await series(deckOf(a, 'A'), deckOf(b, 'B'), games, {
      seedBase: 100 * d,
    });
    turns.push(r.turnsMedian);
    const played = r.winA + r.winB;
    for (const [p, w] of [
      [a, r.winA],
      [b, r.winB],
    ] as const) {
      const k = primary(p);
      const x = (byArch[k] ??= [0, 0]);
      x[0] += w;
      x[1] += played;
      for (const id of p) {
        const y = (byCard[id] ??= [0, 0]);
        y[0] += w;
        y[1] += played;
      }
    }
    firstPicker += r.winA;
    total += played;
  }
  turns.sort((x, y) => x - y);
  const archRows = Object.entries(byArch).map(([k, [w, n]]) => [officialArchetypeName(k as OfficialArchetype), n, pct(w / n)]);
  console.log(table(['主なアーキタイプ', '試合', '勝率'], archRows));
  console.log(
    `先に取った側の勝率 ${pct(firstPicker / total)}、試合の長さの中央値 ${turns[turns.length >> 1]}T（p90 ${turns[Math.floor(turns.length * 0.9)]}T）`,
  );
  const cardRows = Object.entries(byCard)
    .map(([id, [w, n]]) => [byId.get(id)!.name, officialArchetypeName(archOf.get(id)!), byId.get(id)!.rarity, n, w / n] as const)
    .sort((x, y) => y[4] - x[4])
    .map((r) => [r[0], r[1], r[2], r[3], pct(r[4])]);
  console.log(table(['カード', 'アーキタイプ', 'レアリティ', '試合', '勝率'], cardRows));
  writeOut('official-draft.json', {
    archRows,
    cardRows,
    firstPicker: firstPicker / total,
  });
}

const mode = process.argv[2] ?? 'common';
if (mode === 'draft') await draftSeries(argN(300, 3), argN(2, 4));
else await commonRoundRobin(argN(40, 3));
process.exit(0);
