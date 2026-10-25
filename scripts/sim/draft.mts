/**
 * ドラフト戦（公式カード・場から交互に取る。決定事項 #115〜#118）の測定。
 *
 *   npm run sim:draft                                   # 既定：ドラフト400回×2試合（ふつう）＋つよいどうし50回×1試合＋席の入れ替え150回＋リーサル検査20回
 *   node scripts/sim/draft.mts 600 2 --hard 80 --lethal 30 --swap 150 --tag after
 *
 * - ドラフトはエンジンの createDraft・applyTake。席ごとの取り方は draftlib.mts の PROFILES からシードで選ぶ
 *   （本物のおまかせ よわい・ふつう・つよい と、色をそろえる取り方 focus・focus-wide）
 * - 対戦は公式のルール：1戦目の先攻はランダム（決定事項 #125）、2戦目は「同じデッキでもう一戦」
 *   （前の負けが先攻、引き分けなら前に後攻だった人）
 * - 出すもの：デッキがルールどおりか・先に取った人の勝率・先攻の勝率・主な色ごとの勝率と取られ方・カードごとの取られ方と勝率
 *   （外れ値に印）・試合の長さ・引き分け・リーサルの見逃し。表は標準出力、まとめは out/draft-<tag>.json と .md
 */
import { cpus } from 'node:os';
import { Worker } from 'node:worker_threads';
import { BALANCE } from '../../src/engine/index.ts';
import { OFFICIAL_ENTRIES, officialArchetypeName, type OfficialArchetype } from '../../src/official/index.ts';
import { ARCH_OF, OFFICIAL_BY_ID, PROFILES, primaryArch, runDraftJob, type DraftJob, type DraftOutcome } from './draftlib.mts';
import { mdTable, pct, table, writeOut, type GameResult } from './lib.mts';

// ---------------------------------------------------------------- 引数

const args = process.argv.slice(2);
const flag = (name: string, fallback: number): number => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const tagIndex = args.indexOf('--tag');
const TAG = tagIndex >= 0 ? args[tagIndex + 1]! : 'latest';
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1]!.startsWith('--')));
const DRAFTS = Number(positional[0] ?? 400);
const GAMES = Number(positional[1] ?? 2);
const HARD = flag('hard', 50);
const LETHAL = flag('lethal', 20);
const SWAP = flag('swap', 150);
const SEED0 = flag('seed', 20000);

// ---------------------------------------------------------------- 並列

const workerCount = (): number => {
  const env = Number(process.env.SIM_WORKERS);
  if (Number.isFinite(env) && env >= 0) return Math.floor(env);
  return Math.max(1, Math.min(4, cpus().length));
};

async function runAll(jobs: DraftJob[], label: string): Promise<DraftOutcome[]> {
  const n = workerCount();
  const t0 = performance.now();
  if (n === 0) return jobs.map(runDraftJob);
  const CHUNK = 2;
  const chunks: DraftJob[][] = [];
  for (let i = 0; i < jobs.length; i += CHUNK) chunks.push(jobs.slice(i, i + CHUNK));
  const out: DraftOutcome[][] = new Array(chunks.length);
  let next = 0;
  let done = 0;
  const workers = Array.from({ length: n }, () => new Worker(new URL('./draft-worker.mts', import.meta.url)));
  await Promise.all(
    workers.map(
      (w) =>
        new Promise<void>((resolve, reject) => {
          const feed = () => {
            if (next >= chunks.length) {
              void w.terminate();
              resolve();
              return;
            }
            const k = next++;
            w.once('message', (m: { results?: DraftOutcome[]; error?: string }) => {
              if (m.error) {
                reject(new Error(m.error));
                return;
              }
              out[k] = m.results!;
              done += m.results!.length;
              process.stderr.write(`\r${label}: ${done}/${jobs.length}（${((performance.now() - t0) / 1000).toFixed(0)}秒）`);
              feed();
            });
            w.postMessage(chunks[k]);
          };
          w.once('error', reject);
          feed();
        }),
    ),
  );
  process.stderr.write('\n');
  return out.flat();
}

// ---------------------------------------------------------------- 集計

type WL = { w: number; n: number };
const rate = (x: WL) => (x.n ? x.w / x.n : 0);
const add = (m: Record<string, WL>, k: string, w: number, n = 1) => {
  const x = (m[k] ??= { w: 0, n: 0 });
  x.w += w;
  x.n += n;
};
/** 勝ちを1、引き分けを0.5 */
const score = (g: GameResult, p: 0 | 1) => (g.winner === null ? 0.5 : g.winner === p ? 1 : 0);
const archName = (k: string) => (k === 'mixed' ? '混色' : officialArchetypeName(k as OfficialArchetype));

interface Summary {
  drafts: number;
  invalid: number;
  invalidReasons: string[];
  extraPerDraft: number;
  games: number;
  firstTakerG1: number;
  /** 1戦目（公式のルールで、後から取った人が先攻）の先攻の勝率 */
  goFirstG1: number;
  firstTakerAll: number;
  goFirstWin: number;
  drawRate: number;
  reasons: Record<string, number>;
  turnsMean: number;
  turnsMedian: number;
  turnsP10: number;
  turnsP90: number;
  hist: Record<number, number>;
  arch: { key: string; name: string; decks: number; share: number; games: number; win: number }[];
  archTakeShare: { key: string; name: string; takes: number; seenShare: number; takeShare: number; ratio: number }[];
  matchups: { a: string; b: string; n: number; winA: number }[];
  profiles: { key: string; games: number; win: number }[];
  cards: {
    id: string;
    name: string;
    arch: string;
    rarity: string;
    cost: number;
    seen: number;
    taken: number;
    pickRate: number;
    avgPick: number;
    games: number;
    win: number;
    flag: string;
  }[];
  rarityWin: Record<string, number>;
  lethal?: { available: number; missed: number };
}

function quantile(xs: number[], p: number): number {
  return xs.length ? xs[Math.min(xs.length - 1, Math.floor(p * xs.length))]! : 0;
}

function summarize(results: DraftOutcome[]): Summary {
  const invalidReasons = results.flatMap((r) => r.invalidReasons);
  const invalid = results.filter((r) => !r.valid[0] || !r.valid[1]).length;
  const games = results.flatMap((r) => r.games);
  const turns = games.map((g) => g.turns).sort((a, b) => a - b);
  const hist: Record<number, number> = {};
  const reasons: Record<string, number> = {};
  for (const g of games) {
    hist[g.turns] = (hist[g.turns] ?? 0) + 1;
    reasons[g.reason] = (reasons[g.reason] ?? 0) + 1;
  }
  let ft1 = 0;
  let ft1n = 0;
  let ftAll = 0;
  let goFirst = 0;
  let goFirst1 = 0;
  const archWL: Record<string, WL> = {};
  const archDecks: Record<string, number> = {};
  const profWL: Record<string, WL> = {};
  const cardWL: Record<string, WL> = {};
  const match: Record<string, WL> = {};
  const rarityWL: Record<string, WL> = {};
  const seen: Record<string, number> = {};
  const taken: Record<string, number> = {};
  const pickSum: Record<string, number> = {};
  const archSeen: Record<string, number> = {};
  const archTaken: Record<string, number> = {};
  for (const r of results) {
    for (const [id, n] of Object.entries(r.seen)) {
      seen[id] = (seen[id] ?? 0) + n;
      archSeen[ARCH_OF.get(id)!] = (archSeen[ARCH_OF.get(id)!] ?? 0) + n;
    }
    for (const [i, id] of r.pickOrder) {
      taken[id] = (taken[id] ?? 0) + 1;
      pickSum[id] = (pickSum[id] ?? 0) + i;
      archTaken[ARCH_OF.get(id)!] = (archTaken[ARCH_OF.get(id)!] ?? 0) + 1;
    }
    const prim = [primaryArch(r.picks[0]), primaryArch(r.picks[1])] as const;
    for (const p of [0, 1] as const) archDecks[prim[p]] = (archDecks[prim[p]] ?? 0) + 1;
    r.games.forEach((g, gi) => {
      const ftWin = score(g, r.firstTaker);
      ftAll += ftWin;
      if (gi === 0) {
        ft1 += ftWin;
        ft1n++;
        goFirst1 += score(g, g.first as 0 | 1);
      }
      goFirst += score(g, g.first as 0 | 1);
      for (const p of [0, 1] as const) {
        const s = score(g, p);
        add(archWL, prim[p], s);
        add(profWL, r.profiles[p], s);
        for (const id of new Set(r.picks[p])) add(cardWL, id, s);
        for (const id of r.picks[p]) add(rarityWL, OFFICIAL_BY_ID.get(id)!.rarity, s);
      }
      if (prim[0] !== prim[1]) {
        const [a, b] = prim[0] < prim[1] ? [0, 1] : [1, 0];
        add(match, `${prim[a as 0 | 1]}|${prim[b as 0 | 1]}`, score(g, a as 0 | 1));
      }
    });
  }
  const totalDecks = results.length * 2;
  const arch = Object.entries(archDecks)
    .map(([key, decks]) => ({ key, name: archName(key), decks, share: decks / totalDecks, games: archWL[key]?.n ?? 0, win: rate(archWL[key] ?? { w: 0, n: 0 }) }))
    .sort((a, b) => b.win - a.win);
  const totalSeen = Object.values(archSeen).reduce((a, b) => a + b, 0);
  const totalTaken = Object.values(archTaken).reduce((a, b) => a + b, 0);
  const archTakeShare = Object.keys(archSeen).map((key) => {
    const seenShare = archSeen[key]! / totalSeen;
    const takeShare = (archTaken[key] ?? 0) / totalTaken;
    return { key, name: archName(key), takes: archTaken[key] ?? 0, seenShare, takeShare, ratio: takeShare / seenShare };
  });
  const avgWin = 0.5;
  const cards = OFFICIAL_ENTRIES.map(({ card, archetype }) => {
    const wl = cardWL[card.id] ?? { w: 0, n: 0 };
    const pr = (taken[card.id] ?? 0) / Math.max(1, seen[card.id] ?? 0);
    const win = rate(wl);
    // 勝率の外れ値：±2.5 標準誤差より外で、かつ 8pt 以上離れている
    const se = Math.sqrt(0.25 / Math.max(1, wl.n));
    const flags: string[] = [];
    if (wl.n >= 30 && Math.abs(win - avgWin) > Math.max(0.08, 2.5 * se)) flags.push(win > avgWin ? '勝率高' : '勝率低');
    return {
      id: card.id,
      name: card.name,
      arch: archetype,
      rarity: card.rarity,
      cost: card.cost,
      seen: seen[card.id] ?? 0,
      taken: taken[card.id] ?? 0,
      pickRate: pr,
      avgPick: (pickSum[card.id] ?? 0) / Math.max(1, taken[card.id] ?? 0),
      games: wl.n,
      win,
      flag: flags.join('・'),
    };
  });
  // 取られ方の外れ値：同じレアリティの中で取られる割合が平均から大きく外れる
  for (const rarity of ['common', 'rare', 'epic']) {
    const xs = cards.filter((c) => c.rarity === rarity);
    const m = xs.reduce((a, c) => a + c.pickRate, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, c) => a + (c.pickRate - m) ** 2, 0) / xs.length);
    for (const c of xs) {
      if (c.pickRate > m + 2 * sd) c.flag = [c.flag, '取られすぎ'].filter(Boolean).join('・');
      if (c.pickRate < m - 2 * sd) c.flag = [c.flag, '取られない'].filter(Boolean).join('・');
    }
  }
  const lethalGames = games.filter((g) => g.lethalAvailable !== undefined);
  return {
    drafts: results.length,
    invalid,
    invalidReasons: [...new Set(invalidReasons)].slice(0, 10),
    extraPerDraft: results.reduce((a, r) => a + r.extra, 0) / Math.max(1, results.length),
    games: games.length,
    firstTakerG1: ft1 / Math.max(1, ft1n),
    goFirstG1: goFirst1 / Math.max(1, ft1n),
    firstTakerAll: ftAll / Math.max(1, games.length),
    goFirstWin: goFirst / Math.max(1, games.length),
    drawRate: games.filter((g) => g.winner === null).length / Math.max(1, games.length),
    reasons,
    turnsMean: turns.reduce((a, b) => a + b, 0) / Math.max(1, turns.length),
    turnsMedian: quantile(turns, 0.5),
    turnsP10: quantile(turns, 0.1),
    turnsP90: quantile(turns, 0.9),
    hist,
    arch,
    archTakeShare,
    matchups: Object.entries(match)
      .map(([k, v]) => {
        const [a, b] = k.split('|') as [string, string];
        return { a: archName(a), b: archName(b), n: v.n, winA: rate(v) };
      })
      .sort((x, y) => y.n - x.n),
    profiles: PROFILES.map((key) => ({ key, games: profWL[key]?.n ?? 0, win: rate(profWL[key] ?? { w: 0, n: 0 }) })),
    cards,
    rarityWin: Object.fromEntries(Object.entries(rarityWL).map(([k, v]) => [k, rate(v)])),
    ...(lethalGames.length
      ? {
          lethal: {
            available: lethalGames.reduce((a, g) => a + (g.lethalAvailable ?? 0), 0),
            missed: lethalGames.reduce((a, g) => a + (g.lethalMissed ?? 0), 0),
          },
        }
      : {}),
  };
}

// ---------------------------------------------------------------- 出力

function report(title: string, s: Summary, detail: boolean): string {
  const lines: string[] = [];
  const out = (x: string) => {
    console.log(x);
    lines.push(x);
  };
  out(`\n## ${title}`);
  out(
    `ドラフト ${s.drafts}回（ルール違反のデッキ ${s.invalid}${s.invalidReasons.length ? `：${s.invalidReasons.join(' / ')}` : ''}、山から追加で出した枚数 平均 ${s.extraPerDraft.toFixed(2)}）・試合 ${s.games}`,
  );
  out(
    `先に取った人の勝率 1戦目 ${pct(s.firstTakerG1)}・全試合 ${pct(s.firstTakerAll)}／先攻の勝率 1戦目 ${pct(s.goFirstG1)}・全試合 ${pct(s.goFirstWin)}（2戦目は前の負けが先攻）／引き分け ${pct(s.drawRate)}（決着の理由 ${Object.entries(s.reasons)
      .map(([k, v]) => `${k} ${v}`)
      .join('・')}）`,
  );
  out(`試合の長さ（各プレイヤーのターン数）平均 ${s.turnsMean.toFixed(1)}・中央値 ${s.turnsMedian}・p10 ${s.turnsP10}・p90 ${s.turnsP90}`);
  out(
    '分布 ' +
      Object.entries(s.hist)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([t, n]) => `${t}T:${n}`)
        .join(' '),
  );
  if (s.lethal) out(`リーサル：取れた手番 ${s.lethal.available}・見逃し ${s.lethal.missed}`);
  out(`レアリティごとの勝率（取った回数で重み）：${Object.entries(s.rarityWin).map(([k, v]) => `${k} ${pct(v)}`).join('・')}`);
  const archRows = s.arch.map((a) => [a.name, a.decks, pct(a.share), a.games, pct(a.win)]);
  out(table(['主な色', 'デッキ', '割合', '試合', '勝率'], archRows));
  if (!detail) return lines.join('\n');
  out(table(['色', '取得', '場に出た割合', '取られた割合', '比'], s.archTakeShare.map((a) => [a.name, a.takes, pct(a.seenShare), pct(a.takeShare), a.ratio.toFixed(2)])));
  out(table(['取り方', '試合', '勝率'], s.profiles.map((p) => [p.key, p.games, pct(p.win)])));
  out(table(['色 A', '色 B', '試合', 'A の勝率'], s.matchups.filter((m) => m.n >= 20).map((m) => [m.a, m.b, m.n, pct(m.winA)])));
  const cardRows = [...s.cards]
    .sort((a, b) => b.win - a.win)
    .map((c) => [c.name, archName(c.arch), c.rarity[0]!.toUpperCase(), c.cost, c.seen, pct(c.pickRate), c.avgPick.toFixed(1), c.games, pct(c.win), c.flag]);
  out(table(['カード', '色', 'R', 'C', '場', '取られ', '平均順', '試合', '勝率', '印'], cardRows));
  return lines.join('\n');
}

/** 席の入れ替え：同じドラフト・同じシードで先攻を入れ替えた2試合から、先に取った得（デッキの差）と先攻の得を分ける */
function swapReport(results: DraftOutcome[]): string {
  let ft = 0;
  let gf = 0;
  let n = 0;
  let both = 0;
  for (const r of results) {
    for (const g of r.games) {
      ft += score(g, r.firstTaker);
      gf += score(g, g.first as 0 | 1);
      n++;
    }
    // 先攻を入れ替えても同じ人が勝った（デッキで決まった）割合
    if (r.games[0]!.winner !== null && r.games[0]!.winner === r.games[1]!.winner) both++;
  }
  const line = `\n## 席の入れ替え（ドラフト ${results.length}回・先攻を入れ替えて2試合ずつ）\n先に取った人の勝率 ${pct(ft / n)}（デッキの差）／先攻の勝率 ${pct(gf / n)}（席の差）／入れ替えても同じ人が勝った ${pct(both / results.length)}`;
  console.log(line);
  return line;
}

// ---------------------------------------------------------------- 本体

const t0 = performance.now();
const normalJobs: DraftJob[] = Array.from({ length: DRAFTS }, (_, i) => ({ seed: SEED0 + i, games: GAMES, level: 'normal' }));
const hardJobs: DraftJob[] = Array.from({ length: HARD }, (_, i) => ({ seed: SEED0 + 50000 + i, games: 1, level: 'hard' }));
const swapJobs: DraftJob[] = Array.from({ length: SWAP }, (_, i) => ({ seed: SEED0 + 70000 + i, games: 2, level: 'normal', mode: 'swap' }));
const lethalJobs: DraftJob[] = Array.from({ length: LETHAL }, (_, i) => ({ seed: SEED0 + 90000 + i, games: 1, level: 'normal', checkLethal: true }));

const normal = summarize(await runAll(normalJobs, 'ふつう'));
const hard = HARD > 0 ? summarize(await runAll(hardJobs, 'つよいどうし')) : null;
const swap = SWAP > 0 ? await runAll(swapJobs, '席の入れ替え') : null;
const swapLine = swap ? swapReport(swap) : '';
const lethal = LETHAL > 0 ? summarize(await runAll(lethalJobs, 'リーサル検査')) : null;

const md: string[] = [
  `# ドラフトの測定（${TAG}）`,
  '',
  `ドラフト ${DRAFTS}回×${GAMES}試合（CPU ふつう）、つよいどうし ${HARD}回×1試合、リーサル検査 ${LETHAL}回。公式カード・場に${BALANCE.draft.field}枚・${BALANCE.draft.takes}回ずつ。`,
];
md.push(report('ふつう', normal, true));
if (hard) md.push(report('つよいどうし', hard, true));
if (swap) md.push(swapLine);
if (lethal) md.push(report('リーサル検査（ふつう）', lethal, false));
md.push('', mdTable(['主な色', 'デッキ割合', '勝率'], normal.arch.map((a) => [a.name, pct(a.share), pct(a.win)])));
const ms = performance.now() - t0;
console.log(`\n${(ms / 1000).toFixed(0)}秒`);
writeOut(`draft-${TAG}.json`, { tag: TAG, drafts: DRAFTS, games: GAMES, normal, hard, swap: swapLine, lethal, ms });
writeOut(`draft-${TAG}.md`, md.join('\n'));
process.exit(0);
