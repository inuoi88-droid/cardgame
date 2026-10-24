/**
 * 公式カード（src/official）の測定。
 *
 *   node scripts/sim/official.mts common 40      # アーキタイプのコモンだけのデッキ（officialCommonDeck）の総当たり（汎用を含む6つ）
 *   node scripts/sim/official.mts draft 300 2     # 「場から交互に取る」ドラフトを簡単な CPU で300回して、各2試合。
 *                                                  # 主なアーキタイプごとの勝率・先に取った側の勝率・カードごとの勝率
 *   node scripts/sim/official.mts pickers 40 2    # 取り方どうし（おまかせ・燃やしだけ・汎用だけ・でたらめ・簡単な取り方）の対戦
 *
 * ドラフトはエンジンの createDraft・applyTake（山は BALANCE.draft.pileCopies：コモン2枚・レアとエピック1枚ずつ。#117）。
 * draft の取り方はここだけの目安（レアリティ・すでに多いアーキタイプ・汎用を好む＋乱数）。本物のおまかせは pickers の autoXxx。
 */
import { BALANCE, battle, draft } from '../../src/engine/index.ts';
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
const COPIES = BALANCE.draft.copies;

function specOf(name: string, raw: { cardId: string; count: number }[]): DeckSpec {
  // 同じカードを2回取ることがある（山にコモンは2枚ずつ）ので、まとめる
  const counts = new Map<string, number>();
  for (const e of raw) counts.set(e.cardId, (counts.get(e.cardId) ?? 0) + e.count);
  const entries = [...counts].map(([cardId, count]) => ({ cardId, count }));
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

/** ドラフトの取り方：その人が取れる場のカードから1枚選ぶ */
type Picker = (s: draft.DraftState, p: battle.PlayerId, rand: () => number) => string;

const takeableIds = (s: draft.DraftState, p: battle.PlayerId) => draft.takeInfos(s, p).filter((t) => t.ok).map((t) => t.cardId);
const myPicks = (s: draft.DraftState, p: battle.PlayerId) => s.picks.filter((x) => x.player === p).map((x) => x.cardId);
function bestBy(ids: string[], score: (id: string) => number): string {
  let best = ids[0]!;
  let bestScore = -Infinity;
  for (const id of ids) {
    const v = score(id);
    if (v > bestScore) [best, bestScore] = [id, v];
  }
  return best;
}
/** 顔（相手プレイヤー）に届くダメージの合計（燃やしの目安） */
function burnOf(id: string): number {
  return byId.get(id)!.effects.filter((e) => e.id === 'damage' && ['chosen', 'enemyPlayer', 'enemyAll', 'random'].includes(e.target)).reduce((n, e) => n + (e.value ?? 0), 0);
}
const PICKERS: Record<string, Picker> = {
  /** 測定用の簡単な取り方（レアリティ・多いアーキタイプ・汎用を好む＋乱数） */
  simple: (s, p, rand) => bestBy(takeableIds(s, p), (id) => pickScore(myPicks(s, p), id, rand)),
  /** 本物のおまかせ（engine の autoPick） */
  autoEasy: (s, p) => draft.autoPick(s, p, 'easy')!,
  autoNormal: (s, p) => draft.autoPick(s, p, 'normal')!,
  autoHard: (s, p) => draft.autoPick(s, p, 'hard')!,
  /** 燃やし（顔へのダメージ）ばかり取る。無ければレアリティ順 */
  burn: (s, p, rand) => bestBy(takeableIds(s, p), (id) => burnOf(id) * 10 + (byId.get(id)!.rarity === 'common' ? 0 : 1) + rand()),
  /** 汎用だけ取る（無ければ乱数） */
  neutral: (s, p, rand) => bestBy(takeableIds(s, p), (id) => (archOf.get(id) === 'neutral' ? 10 : 0) + (byId.get(id)!.rarity === 'common' ? 0 : 1) + rand()),
  /** でたらめ */
  random: (s, p, rand) => bestBy(takeableIds(s, p), () => rand()),
};

/** engine の「場から交互に取る」ドラフト（公式カード・山はコモン2枚ずつ）。席0が a、席1が b の取り方 */
function runDraft(seed: number, a: Picker = PICKERS.simple!, b: Picker = PICKERS.simple!): [string[], string[]] {
  const rand = rng(seed);
  const created = draft.createDraft({ seed, pool: OFFICIAL_CARDS, first: (seed % 2) as battle.PlayerId });
  if (!created.ok) throw new Error(created.error);
  let s = created.value;
  while (!draft.isDraftDone(s)) {
    const p = draft.draftTurn(s)!;
    const r = draft.applyTake(s, p, (p === 0 ? a : b)(s, p, rand));
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  return [myPicks(s, 0), myPicks(s, 1)];
}

/** 取り方どうしの対戦：席0の取り方 a 対 席1の b を drafts 回、各 games 試合（先攻は交互） */
async function pickerSeries(drafts: number, games: number): Promise<void> {
  const pairs: [string, string][] = [
    ['autoHard', 'random'],
    ['autoHard', 'autoEasy'],
    ['autoHard', 'simple'],
    ['burn', 'autoNormal'],
    ['neutral', 'autoNormal'],
    ['burn', 'simple'],
    ['neutral', 'simple'],
  ];
  const rows: (string | number)[][] = [];
  const turns: number[] = [];
  for (const [ka, kb] of pairs) {
    let win = 0;
    let n = 0;
    for (let d = 0; d < drafts; d++) {
      const [a, b] = runDraft(7000 + d, PICKERS[ka]!, PICKERS[kb]!);
      const deckOf = (picks: string[], name: string) => specOf(name, picks.map((cardId) => ({ cardId, count: COPIES })));
      const r = await series(deckOf(a, ka), deckOf(b, kb), games, { seedBase: 300 * d });
      win += r.winA + r.drawRate * games * 0.5;
      n += games;
      turns.push(r.turnsMedian);
    }
    rows.push([`${ka} 対 ${kb}`, n, pct(win / n)]);
  }
  turns.sort((x, y) => x - y);
  console.log(table(['取り方（A 対 B）', '試合', 'A の勝率'], rows));
  console.log(`試合の長さの中央値 ${turns[turns.length >> 1]}T（p90 ${turns[Math.floor(turns.length * 0.9)]}T）`);
  writeOut('official-pickers.json', { rows });
}

async function draftSeries(drafts: number, games: number): Promise<void> {
  const byArch: Record<string, [number, number]> = {};
  const byCard: Record<string, [number, number]> = {};
  const turns: number[] = [];
  let firstPicker = 0;
  let total = 0;
  for (let d = 0; d < drafts; d++) {
    const [a, b] = runDraft(9000 + d);
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
else if (mode === 'pickers') await pickerSeries(argN(40, 3), argN(2, 4));
else await commonRoundRobin(argN(40, 3));
process.exit(0);
