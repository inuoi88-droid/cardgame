/**
 * CPU 同士のシミュレーション基盤（監査のときの作業用スクリプトを整理して入れたもの）。
 *
 * - カードは倍率1の数字で書き、fromBaseScale で今の倍率（SCALE）に直す
 * - 1試合は playGame()。CPU は viewFor() で見える情報だけで決める（本物の状態で実行できない行動だけ、本物の状態で決め直す）
 * - series() は node:worker_threads で 4 並列（SIM_WORKERS で変更）。ワーカーの中身は worker.mts
 * - 先攻後攻のルールの比較などで BALANCE.battle を実行時に書き換える（patchBattle）。src 側は触らない
 *
 * 使い方は README.md を参照。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import {
  ai,
  battle,
  BALANCE,
  analyzeCard,
  analyzeDeck,
  fromBaseScale,
  type CardDef,
  type Deck,
  type EffectInstance,
  type KeywordInstance,
  type DrawbackInstance,
  type Rarity,
  type Stats,
} from '../../src/engine/index.ts';
import { PRESET_DECKS } from '../../src/presets.ts';

export { ai, battle, BALANCE, PRESET_DECKS, analyzeCard, analyzeDeck };
export type G = battle.GameState;
export type PlayerId = battle.PlayerId;

// ---------------------------------------------------------------- カード（倍率1の数字で書く）

export const fx = (e: Partial<EffectInstance> & { id: string }): EffectInstance => ({
  timing: 'play',
  target: 'chosen',
  condition: null,
  ...e,
});

export interface CardParts {
  stats?: Stats | null;
  keywords?: KeywordInstance[];
  effects?: EffectInstance[];
  drawbacks?: DrawbackInstance[];
  name?: string;
  icon?: string;
}

let seq = 0;

/** 倍率1の数字でカードを作る（検証はしない）。名前は16文字まで（card.nameMaxLength） */
export function makeCard(name: string, rarity: Rarity, cost: number, parts: CardParts = {}): CardDef {
  return fromBaseScale({
    v: 1,
    id: `sim-${++seq}-${name}`,
    name: name.slice(0, BALANCE.card.nameMaxLength),
    icon: parts.icon ?? '🎴',
    rarity,
    cost,
    stats: parts.stats ?? null,
    keywords: parts.keywords ?? [],
    effects: parts.effects ?? [],
    drawbacks: parts.drawbacks ?? [],
  });
}

/** カードの点数の短い表示（レポート用。実倍率の数字） */
export function describePoints(def: CardDef): string {
  const a = analyzeCard(def);
  return `${a.points.total}/${a.points.cap}pt`;
}

/**
 * ルールを守るカードを作る。違反があれば理由つきで例外（公平なテストにならないため）。
 * 名前を省略すると効果 ID から作る（例：damage7, poison5）
 */
export function cardAtCap(rarity: Rarity, cost: number, effects: EffectInstance[], stats?: Stats | null, keywords?: KeywordInstance[], extra: Omit<CardParts, 'stats' | 'keywords' | 'effects'> = {}): CardDef {
  const auto = [
    ...effects.map((e) => `${e.id}${e.value ?? ''}${e.hits ? 'x' + e.hits : ''}`),
    ...(keywords ?? []).map((k) => k.id),
    ...(stats ? [`${stats.attack}/${stats.hp}${stats.defense ? '/' + stats.defense : ''}`] : []),
  ].join('+');
  const def = makeCard(extra.name ?? auto, rarity, cost, { ...extra, effects, stats: stats ?? null, keywords: keywords ?? [] });
  const a = analyzeCard(def);
  if (!a.valid) {
    throw new Error(`カード「${def.name}」(${rarity} コスト${cost}) が違反：${a.violations.map((v) => v.message).join(' / ')}（${a.points.total}/${a.points.cap}pt）`);
  }
  return def;
}

/**
 * 数値 v を上から順に試して、ルールを守る最大の v でカードを作る（価格表が変わっても追従するため）。
 * build は倍率1の数字で v を受け取り、カードの部品を返す。どの v でも作れなければ例外
 */
export function fitValue(rarity: Rarity, cost: number, build: (v: number) => { effects?: EffectInstance[]; stats?: Stats | null; keywords?: KeywordInstance[]; name?: string }, max = 30, min = 1): { card: CardDef; value: number } {
  let lastError = '';
  for (let v = max; v >= min; v--) {
    const parts = build(v);
    try {
      return { card: cardAtCap(rarity, cost, parts.effects ?? [], parts.stats, parts.keywords, { name: parts.name }), value: v };
    } catch (e) {
      lastError = (e as Error).message;
    }
  }
  throw new Error(`fitValue：${min}〜${max} のどれでも作れない。最後の理由：${lastError}`);
}

// ---------------------------------------------------------------- デッキ

export interface DeckSpec {
  name: string;
  deck: Deck;
  cards: CardDef[];
}

/** デッキを作って検証する（違反なら例外） */
export function buildDeck(name: string, list: [CardDef, number][]): DeckSpec {
  const cards = list.map(([c]) => c);
  const deck: Deck = { v: 1, id: `sim-deck-${name}`, name, entries: list.map(([c, n]) => ({ cardId: c.id, count: n })) };
  const a = analyzeDeck(deck, new Map(cards.map((c) => [c.id, c])));
  if (!a.valid) {
    const bad = cards.map((c) => analyzeCard(c)).filter((x) => !x.valid);
    throw new Error(`デッキ「${name}」が違反：${a.violations.map((v) => v.message).join(' / ')}${bad.length ? `（違反カード：${bad.map((x) => x.violations.map((v) => v.message).join(',')).join(' / ')}）` : ''}`);
  }
  return { name, deck, cards };
}

/** 同名の枚数制限（レア3・エピック2・レジェンド1）を守るため、同じ内容のカードを別名で必要数だけ作る */
export function fill(name: string, rarity: Rarity, cost: number, parts: CardParts, count: number): [CardDef, number][] {
  const per = BALANCE.rarity[rarity].perNameLimit ?? count;
  const out: [CardDef, number][] = [];
  let left = count;
  for (let i = 0; left > 0; i++) {
    const n = Math.min(per, left);
    const def = makeCard(i === 0 ? name : `${name}${i + 1}`, rarity, cost, parts);
    const a = analyzeCard(def);
    if (!a.valid) throw new Error(`カード「${def.name}」が違反：${a.violations.map((v) => v.message).join(' / ')}`);
    out.push([def, n]);
    left -= n;
  }
  return out;
}

export function presetSpec(index: number): DeckSpec {
  const p = PRESET_DECKS[index];
  if (!p) throw new Error(`プリセット ${index} はない`);
  return { name: p.name, deck: p.deck, cards: p.cards };
}
export const PRESET_NAMES = PRESET_DECKS.map((p) => p.name);

const memo = new Map<string, DeckSpec>();
const once = (key: string, make: () => DeckSpec): DeckSpec => {
  let d = memo.get(key);
  if (!d) memo.set(key, (d = make()));
  return d;
};

/**
 * B0：除去とモンスターの混合（監査 sim-a の基準）。兵士 3/3 ×10、火球 ダメージ7 ×10、戦士 5/5（コスト2）×10。
 * #84 から体力と火球は価格表に追従する（体力 1.5pt・ダメージ 3pt なら 兵士 3/4、火球 5、戦士 5/6.5。作れる最大、0.25 刻み）
 */
export const B0 = (): DeckSpec =>
  once('B0', () =>
    buildDeck('B0', [
      [monsterAtCap('兵士', 1, 3, 3), 10],
      [burnCard(7, '火球'), 10],
      [monsterAtCap('戦士', 2, 5, 5), 10],
    ]),
  );

/** コモンのバニラモンスター（攻撃力は固定、体力は作れる最大。0.25 刻み、minHp 以上） */
export function monsterAtCap(name: string, cost: number, attack: number, minHp: number): CardDef {
  for (let hp = 40; hp >= minHp; hp -= 0.25) {
    try {
      return cardAtCap('common', cost, [], { attack, hp, defense: 0 }, [], { name });
    } catch {
      // 上限を超えたら次へ
    }
  }
  throw new Error(`${name} が作れない`);
}

/**
 * B1：顔を殴り合うレース（監査 sim-c の基準）。見習い兵 2/4.5 ×10、火球 ダメージ7.5 ×10、鉄の盾（コモン・コスト1で作れる最大のシールド）×10。#84 から見習い兵の体力と火球も価格表に追従する（2/6・5）。
 * 鉄の盾は価格表に追従する（シールド 1.5/点 のときは 10、#73 の 2.5/点 からは 6）
 */
export const B1 = (): DeckSpec =>
  once('B1', () =>
    buildDeck('B1', [
      [monsterAtCap('見習い兵', 1, 2, 4.5), 10],
      [burnCard(7.5, '火球'), 10],
      [ironShield(), 10],
    ]),
  );

/** 鉄の盾：コモン・コスト1で作れる最大のシールド（0.25 刻み） */
export function ironShield(): CardDef {
  for (let v = 30; v >= 0.25; v -= 0.25) {
    try {
      return cardAtCap('common', 1, [fx({ id: 'shield', value: v, target: 'self' })], null, [], { name: '鉄の盾' });
    } catch {
      // 上限を超えたら次へ
    }
  }
  throw new Error('鉄の盾が作れない');
}

/** BURN：コスト1のダメージだけのコモン30枚（最速の顔レースの目安）。ダメージは 0.25 刻みで作れる最大（倍率20 では 0.25 も作れるので、整数に丸めない） */
export const BURN = (): DeckSpec =>
  once('BURN', () => buildDeck('BURN', [[burnCard(), 30]]));

/**
 * コモン・コスト1で作れる最大のダメージの呪文（0.25 刻み、max 以下）。
 * B0・B1 の火球（7・7.5）もこれで作る：ダメージの値段を上げて 7 が作れなくなったときは作れる最大に下がる（最終調整 #84）
 */
export function burnCard(max = 30, name?: string): CardDef {
  for (let v = max; v >= 0.25; v -= 0.25) {
    try {
      return cardAtCap('common', 1, [fx({ id: 'damage', value: v })], null, [], { name: name ?? `火球${v}` });
    } catch {
      // 上限を超えたら次へ
    }
  }
  throw new Error('火球が作れない');
}

/** 山札の埋め草（回復1・コスト1）。場面を作るテスト用 */
export const FILLER = (): CardDef => cardAtCap('common', 1, [fx({ id: 'heal', value: 1, target: 'self' })], null, [], { name: '練習用の薬' });
export const FILLER_DECK = (): DeckSpec => once('FILLER', () => buildDeck('FILLER', [[FILLER(), 30]]));

// ---------------------------------------------------------------- BALANCE の書き換え（スクリプト内だけ）

type Battle = typeof BALANCE.battle;
type NumericBattleKey = { [K in keyof Battle]: Battle[K] extends number ? K : never }[keyof Battle];
/** battle の数値だけを書き換える（例：{ secondPlayerFirstTurnBonusEnergy: 1 }） */
export type BattlePatch = Partial<Record<NumericBattleKey, number>>;

/** BALANCE.battle を書き換え、元に戻す関数を返す */
export function patchBattle(patch: BattlePatch | undefined): () => void {
  if (!patch) return () => {};
  const target = BALANCE.battle as unknown as Record<string, number>;
  const saved: Record<string, number> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    saved[k] = target[k]!;
    target[k] = v;
  }
  return () => {
    for (const [k, v] of Object.entries(saved)) target[k] = v;
  };
}

/** 先攻後攻のルールの候補（presets.mts のミラー戦で比べる） */
export const FIRST_PLAYER_VARIANTS = {
  current: { label: '現行（先攻1T目 −1）', battle: { firstPlayerFirstTurnPenalty: 1, secondPlayerFirstTurnBonusEnergy: 0, secondPlayerFirstTurnExtraDraw: 0 } },
  coin: { label: '＋後攻1T目 エナジー+1', battle: { firstPlayerFirstTurnPenalty: 1, secondPlayerFirstTurnBonusEnergy: 1, secondPlayerFirstTurnExtraDraw: 0 } },
  card: { label: '＋後攻1T目 ドロー+1', battle: { firstPlayerFirstTurnPenalty: 1, secondPlayerFirstTurnBonusEnergy: 0, secondPlayerFirstTurnExtraDraw: 1 } },
} satisfies Record<string, { label: string; battle: BattlePatch }>;
export type FirstPlayerVariant = keyof typeof FIRST_PLAYER_VARIANTS;

// ---------------------------------------------------------------- CPU

export type Level = 'easy' | 'normal' | 'hard';
export const LEVELS: readonly Level[] = ['easy', 'normal', 'hard'];

/**
 * 難易度に対応する戦略。エンジンが ai.strategyFor(level) か ai.strategies[level] を公開していればそれを使い、
 * なければ（今はまだ難易度がないので）どのレベルも貪欲法
 */
export function strategyFor(level: Level = 'normal'): ai.Strategy {
  const extra = ai as unknown as { strategyFor?: (level: Level) => ai.Strategy; strategies?: Partial<Record<Level, ai.Strategy>> };
  return extra.strategyFor?.(level) ?? extra.strategies?.[level] ?? ai.greedyStrategy;
}
export const LEVELS_IMPLEMENTED = (() => {
  const extra = ai as unknown as { strategyFor?: unknown; strategies?: unknown };
  return Boolean(extra.strategyFor || extra.strategies);
})();

/** 今、行動すべきプレイヤー（終わっていれば null） */
export function whoActs(g: G): PlayerId | null {
  if (g.phase === 'ended') return null;
  if (g.phase === 'mulligan') return g.players[0].mulligan.done ? 1 : 0;
  if (g.pending) return g.pending.player;
  return g.active;
}

/** CPU の行動を1つ決める。見える情報（viewFor）で決め、本物の状態で実行できないときだけ本物の状態で決め直す */
export function decide(g: G, p: PlayerId, seed: number, level: Level = 'normal'): battle.Action {
  const strategy = strategyFor(level);
  const view = battle.viewFor(g, p);
  const action = ai.cpuAction(view, p, seed, strategy);
  if (battle.validateAction(g, action) === null) return action;
  return ai.cpuAction(g, p, seed, strategy);
}

// ---------------------------------------------------------------- リーサル探索（CPU の見逃しを数える）

/** このターン中に（カード使用・攻撃・選択だけで）勝てる手順があるか。深さと状態数に上限のある DFS */
export function canWinThisTurn(g: G, me: PlayerId, depthLeft = 7, budget = { left: 4000 }, seen = new Set<string>()): boolean {
  if (g.phase === 'ended') return g.result?.winner === me;
  if (depthLeft === 0 || budget.left <= 0) return false;
  if (whoActs(g) !== me) return false;
  const acts = battle.legalActions(g, me).filter((a) => a.type !== 'endTurn' && a.type !== 'concede' && a.type !== 'removeNoise');
  const score = (a: battle.Action): number => {
    if (a.type === 'attack') return a.target.kind === 'player' ? 3 : 1;
    if (a.type === 'playCard') return a.chosen?.enemy?.kind === 'player' ? 2 : 1.5;
    return 0;
  };
  acts.sort((a, b) => score(b) - score(a));
  for (const a of acts) {
    const r = battle.applyAction(g, a);
    if (!r.ok) continue;
    budget.left -= 1;
    const key = signature(r.state);
    if (seen.has(key)) continue;
    seen.add(key);
    if (canWinThisTurn(r.state, me, depthLeft - 1, budget, seen)) return true;
    if (budget.left <= 0) return false;
  }
  return false;
}

const signature = (g: G): string =>
  [
    g.players[0].hp,
    g.players[1].hp,
    g.players[g.active].energy,
    g.players[g.active].hand.map((c) => c.uid).join(','),
    g.players[0].board.map((m) => `${m.uid}:${m.hp}:${m.attacksUsed}`).join(','),
    g.players[1].board.map((m) => `${m.uid}:${m.hp}:${m.attacksUsed}`).join(','),
    g.pending ? 'p' : '',
  ].join('|');

// ---------------------------------------------------------------- 1試合

export interface GameOpts {
  /** 先攻の席。省略するとシードで決まる（ランダム） */
  first?: PlayerId;
  level?: Level;
  /** 行動数の上限（無限ループの安全装置） */
  maxActions?: number;
  /** 各手番の開始時にリーサルを探し、見逃しを数える（重い） */
  checkLethal?: boolean;
  /** 試合中だけ BALANCE.battle を書き換える */
  battle?: BattlePatch;
}

export interface GameResult {
  seed: number;
  first: PlayerId;
  winner: PlayerId | null;
  draw: boolean;
  reason: string;
  /** 試合の長さ（各プレイヤーのターン数＝ turnIndex を2で割って切り上げ） */
  turns: number;
  turnsTaken: [number, number];
  cardsPlayed: [number, number];
  finalHp: [number, number];
  actions: number;
  /** checkLethal のときだけ：リーサルがあった手番の数と、CPU が取り逃した数 */
  lethalAvailable?: number;
  lethalMissed?: number;
  ms: number;
}

export function playGame(a: DeckSpec, b: DeckSpec, seed: number, opts: GameOpts = {}): GameResult {
  const restore = patchBattle(opts.battle);
  try {
    const t0 = performance.now();
    const r = battle.createGame({
      seed,
      first: opts.first,
      players: [
        { name: a.name, deck: a.deck, cards: a.cards },
        { name: b.name, deck: b.deck, cards: b.cards },
      ],
    });
    if (!r.ok) throw new Error(r.error);
    let g = r.state;
    const maxActions = opts.maxActions ?? 2000;
    const level = opts.level ?? 'normal';
    const cardsPlayed: [number, number] = [0, 0];
    let actions = 0;
    let lethalAvailable = 0;
    let lethalMissed = 0;
    let checkedTurn = -1;
    let lethalHere = false;
    while (g.phase !== 'ended' && actions < maxActions) {
      const p = whoActs(g)!;
      if (opts.checkLethal && g.phase === 'main' && !g.pending && g.turnIndex !== checkedTurn) {
        checkedTurn = g.turnIndex;
        lethalHere = canWinThisTurn(g, p);
        if (lethalHere) lethalAvailable += 1;
      }
      const action = decide(g, p, (seed * 7919 + actions * 104729) >>> 0, level);
      if (action.type === 'playCard') cardsPlayed[p] += 1;
      if (action.type === 'endTurn' && lethalHere) lethalMissed += 1;
      const res = battle.applyAction(g, action);
      if (!res.ok) throw new Error(`行動できない：${res.error} ${JSON.stringify(action)}`);
      g = res.state;
      g.log = []; // ログは使わない（structuredClone を軽くする）
      actions += 1;
    }
    const winner = g.result?.winner ?? null;
    return {
      seed,
      first: g.first,
      winner,
      draw: winner === null,
      reason: g.result?.reason ?? 'actionCap',
      turns: Math.max(g.players[0].turnsTaken, g.players[1].turnsTaken),
      turnsTaken: [g.players[0].turnsTaken, g.players[1].turnsTaken],
      cardsPlayed,
      finalHp: [g.players[0].hp, g.players[1].hp],
      actions,
      ...(opts.checkLethal ? { lethalAvailable, lethalMissed } : {}),
      ms: performance.now() - t0,
    };
  } finally {
    restore();
  }
}

// ---------------------------------------------------------------- 連戦（ワーカーで並列）

export interface SeriesOpts extends GameOpts {
  /** 連番シードの始まり */
  seedBase?: number;
  label?: string;
}

export interface SeriesResult {
  label: string;
  games: number;
  winA: number;
  winB: number;
  draws: number;
  /** 席A（deckA）の勝率・引き分け率（0〜1） */
  winRate: number;
  drawRate: number;
  /** 決着した試合のうち先攻が勝った割合 */
  firstWinRate: number;
  /** A が先攻だったとき／後攻だったときの A の勝率 */
  winRateAsFirst: number;
  winRateAsSecond: number;
  turnsMean: number;
  turnsMedian: number;
  turnsP10: number;
  turnsP90: number;
  turnsMax: number;
  /** ターン数ごとの試合数 */
  hist: Record<number, number>;
  reasons: Record<string, number>;
  cardsPerTurn: [number, number];
  lethalAvailable?: number;
  lethalMissed?: number;
  ms: number;
}

export interface WorkerJob {
  a: DeckSpec;
  b: DeckSpec;
  seeds: number[];
  firsts: (PlayerId | undefined)[];
  opts: GameOpts;
}

const workerCount = (): number => {
  const env = Number(process.env.SIM_WORKERS);
  if (Number.isFinite(env) && env >= 0) return Math.floor(env);
  return Math.max(1, Math.min(4, cpus().length));
};

let pool: Worker[] | null = null;
function getPool(): Worker[] {
  if (!pool) {
    pool = Array.from({ length: workerCount() }, () => {
      const w = new Worker(new URL('./worker.mts', import.meta.url));
      w.unref(); // 待っている間だけ ref() する（スクリプトが終わればプロセスも終わる）
      return w;
    });
  }
  return pool;
}

function runOnWorker(w: Worker, job: WorkerJob): Promise<GameResult[]> {
  return new Promise((resolveJob, reject) => {
    const onMessage = (m: { results?: GameResult[]; error?: string }) => {
      cleanup();
      if (m.error) reject(new Error(m.error));
      else resolveJob(m.results ?? []);
    };
    const onError = (e: Error) => {
      cleanup();
      reject(e);
    };
    const cleanup = () => {
      w.off('message', onMessage);
      w.off('error', onError);
      w.unref();
    };
    w.ref();
    w.on('message', onMessage);
    w.on('error', onError);
    w.postMessage(job);
  });
}

/** ジョブをそのまま（このスレッドで）実行する。ワーカーからも使う */
export function runJob(job: WorkerJob): GameResult[] {
  return job.seeds.map((seed, i) => playGame(job.a, job.b, seed, { ...job.opts, first: job.firsts[i] }));
}

/**
 * A 対 B を n 試合。先攻は opts.first を指定しなければ交互（偶数番は A、奇数番は B が先攻）。
 * ワーカーに分けて並列に回す（SIM_WORKERS=0 でこのスレッドで直列）
 */
export async function series(a: DeckSpec, b: DeckSpec, n: number, opts: SeriesOpts = {}): Promise<SeriesResult> {
  const t0 = performance.now();
  const seedBase = opts.seedBase ?? 1000;
  const seeds = Array.from({ length: n }, (_, i) => seedBase + i);
  const firsts = seeds.map((_, i): PlayerId | undefined => opts.first ?? ((i % 2) as PlayerId));
  const { seedBase: _s, label: _l, ...gameOpts } = opts;
  void _s;
  void _l;
  const workers = workerCount();
  let results: GameResult[];
  if (workers === 0 || n < 2) {
    results = runJob({ a, b, seeds, firsts, opts: gameOpts });
  } else {
    const ws = getPool();
    const chunk = Math.ceil(n / ws.length);
    const jobs: Promise<GameResult[]>[] = [];
    for (let k = 0; k < ws.length; k++) {
      const s = seeds.slice(k * chunk, (k + 1) * chunk);
      if (s.length === 0) break;
      jobs.push(runOnWorker(ws[k]!, { a, b, seeds: s, firsts: firsts.slice(k * chunk, (k + 1) * chunk), opts: gameOpts }));
    }
    results = (await Promise.all(jobs)).flat();
  }
  return summarize(results, opts.label ?? `${a.name} vs ${b.name}`, performance.now() - t0);
}

export function summarize(results: GameResult[], label: string, ms = 0): SeriesResult {
  const n = results.length;
  const winA = results.filter((r) => r.winner === 0).length;
  const winB = results.filter((r) => r.winner === 1).length;
  const draws = n - winA - winB;
  const decided = results.filter((r) => r.winner !== null);
  const asFirst = results.filter((r) => r.first === 0);
  const asSecond = results.filter((r) => r.first === 1);
  const turns = results.map((r) => r.turns).sort((x, y) => x - y);
  const q = (p: number) => turns[Math.min(turns.length - 1, Math.floor(p * turns.length))] ?? 0;
  const hist: Record<number, number> = {};
  const reasons: Record<string, number> = {};
  for (const r of results) {
    hist[r.turns] = (hist[r.turns] ?? 0) + 1;
    reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const rate = (num: number, den: number) => (den ? num / den : 0);
  const hasLethal = results.some((r) => r.lethalAvailable !== undefined);
  return {
    label,
    games: n,
    winA,
    winB,
    draws,
    winRate: rate(winA, n),
    drawRate: rate(draws, n),
    firstWinRate: rate(decided.filter((r) => r.winner === r.first).length, decided.length),
    winRateAsFirst: rate(asFirst.filter((r) => r.winner === 0).length, asFirst.length),
    winRateAsSecond: rate(asSecond.filter((r) => r.winner === 0).length, asSecond.length),
    turnsMean: avg(turns),
    turnsMedian: q(0.5),
    turnsP10: q(0.1),
    turnsP90: q(0.9),
    turnsMax: turns[turns.length - 1] ?? 0,
    hist,
    reasons,
    cardsPerTurn: [avg(results.map((r) => r.cardsPlayed[0] / Math.max(1, r.turnsTaken[0]))), avg(results.map((r) => r.cardsPlayed[1] / Math.max(1, r.turnsTaken[1])))],
    ...(hasLethal
      ? {
          lethalAvailable: results.reduce((s, r) => s + (r.lethalAvailable ?? 0), 0),
          lethalMissed: results.reduce((s, r) => s + (r.lethalMissed ?? 0), 0),
        }
      : {}),
    ms,
  };
}

// ---------------------------------------------------------------- 場面を作る（CPU の検査用）

/** 両者が埋め草デッキで手札を決め、P0 の1ターン目が始まった状態。手札・場・HP を直接いじって場面を作る */
export function scenario(opts: { seed?: number; first?: PlayerId } = {}): G {
  const d = FILLER_DECK();
  const r = battle.createGame({
    seed: opts.seed ?? 1,
    first: opts.first ?? 0,
    players: [
      { name: 'P0', deck: d.deck, cards: d.cards },
      { name: 'P1', deck: d.deck, cards: d.cards },
    ],
  });
  if (!r.ok) throw new Error(r.error);
  let g = r.state;
  for (const p of [0, 1] as const) {
    const res = battle.applyAction(g, { type: 'mulligan', player: p, mode: 'keep' });
    if (!res.ok) throw new Error(res.error);
    g = res.state;
  }
  return g;
}

let uidSeq = 0;

/** カードを手札に入れる（定義も登録する）。uid を返す */
export function giveCard(g: G, p: PlayerId, def: CardDef): string {
  const key = `p${p}:${def.id}`;
  g.cards[key] = def;
  const uid = `sim-h${++uidSeq}`;
  g.players[p].hand.push({ uid, cardId: key, owner: p });
  return uid;
}

/** モンスターを直接場に出す（このターンから攻撃できる） */
export function putMonster(g: G, p: PlayerId, def: CardDef, patch: Partial<battle.Monster> = {}): string {
  if (!def.stats) throw new Error(`${def.name} はモンスターではない`);
  const key = `p${p}:${def.id}`;
  g.cards[key] = def;
  const uid = `sim-m${++uidSeq}`;
  g.players[p].board.push({
    uid,
    card: { uid, cardId: key, owner: p },
    owner: p,
    controller: p,
    attack: def.stats.attack,
    hp: def.stats.hp,
    maxHp: def.stats.hp,
    defense: def.stats.defense,
    enteredTurn: -1,
    attacksUsed: 0,
    sealed: false,
    undyingUsed: false,
    stealth: false,
    betraying: false,
    counters: {},
    status: {
      poison: 0,
      burn: 0,
      weak: 0,
      vulnerable: 0,
      bleed: 0,
      freezePending: false,
      freezeActive: false,
      confusePending: false,
      confuseActive: false,
      counter: 0,
      nullify: 0,
      regen: 0,
      strength: 0,
      focus: 0,
    },
    ...patch,
  });
  return uid;
}

/** p の手番を CPU に任せて、ターン終了か決着まで進める。won は p が勝ったか */
export function playTurn(g: G, p: PlayerId, level: Level, seed = 1, maxActions = 60): { won: boolean; state: G; actions: battle.Action[] } {
  const actions: battle.Action[] = [];
  let s = g;
  for (let i = 0; i < maxActions && s.phase !== 'ended' && whoActs(s) === p; i++) {
    const a = decide(s, p, seed + i, level);
    actions.push(a);
    const r = battle.applyAction(s, a);
    if (!r.ok) throw new Error(`行動できない：${r.error} ${JSON.stringify(a)}`);
    s = r.state;
    if (a.type === 'endTurn') break;
  }
  return { won: s.result?.winner === p, state: s, actions };
}

// ---------------------------------------------------------------- 出力の道具

export const OUT_DIR = new URL('./out/', import.meta.url);

/** scripts/sim/out/<name>.json に書く */
export function writeOut(name: string, data: unknown): string {
  mkdirSync(OUT_DIR, { recursive: true });
  const url = new URL(`./${name}`, OUT_DIR);
  writeFileSync(url, typeof data === 'string' ? data : JSON.stringify(data, null, 1));
  return url.pathname;
}

/** そのファイルが `node file.mts` で直接実行されているか（run-all から import されたときは false） */
export function isMain(url: string): boolean {
  const entry = process.argv[1];
  return Boolean(entry) && pathToFileURL(resolve(entry!)).href === url;
}

/** argv の n（省略時は既定値） */
export function argN(fallback: number, index = 2): number {
  const v = Number(process.argv[index]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

/** 表示幅（全角は2） */
export function width(s: string): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    w += c > 0x2e7f && !(c >= 0xff61 && c <= 0xff9f) ? 2 : 1;
  }
  return w;
}

const pad = (s: string, w: number, right: boolean) => {
  const fill = ' '.repeat(Math.max(0, w - width(s)));
  return right ? fill + s : s + fill;
};

/** 等幅の表にする。数字の列は右寄せ */
export function table(header: string[], rows: (string | number)[][]): string {
  const cells = rows.map((r) => r.map((c) => (typeof c === 'number' ? fmtNum(c) : c)));
  const widths = header.map((h, i) => Math.max(width(h), ...cells.map((r) => width(r[i] ?? ''))));
  const numeric = header.map((_, i) => cells.length > 0 && cells.every((r) => r[i] === undefined || /^[-+]?[\d.,%]+$/.test(r[i]!)));
  const line = (r: string[]) => r.map((c, i) => pad(c ?? '', widths[i]!, numeric[i]! && c !== header[i])).join('  ');
  return [line(header), widths.map((w) => '-'.repeat(w)).join('  '), ...cells.map(line)].join('\n');
}

export const fmtNum = (x: number): string => (Number.isInteger(x) ? String(x) : x.toFixed(1));
export const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

/** Markdown の表 */
export function mdTable(header: string[], rows: (string | number)[][]): string {
  const cells = rows.map((r) => r.map((c) => (typeof c === 'number' ? fmtNum(c) : c)));
  return [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`, ...cells.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

/** 連戦の結果を1行にまとめる（表の行） */
export function seriesRow(s: SeriesResult): (string | number)[] {
  return [s.label, s.games, pct(s.winRate), pct(s.drawRate), pct(s.firstWinRate), s.turnsMedian, s.turnsMean, s.turnsP10, s.turnsP90];
}
export const SERIES_HEADER = ['対戦', 'n', 'A勝率', '引分', '先攻勝率', '中央T', '平均T', 'p10', 'p90'];
