/**
 * 仮の実行（シミュレーション）の道具。見える情報（view）に対して applyAction を走らせ、結果の盤面を評価する。
 * 選択待ちになったら CPU 自身の選び方で進める。ランダムな対象を持つカードは複数のシードで平均する（決定事項 #72）。
 */
import { BALANCE } from '../balance.ts';
import { applyAction } from '../battle/apply.ts';
import { other } from '../battle/core.ts';
import { effectiveCost } from '../battle/play.ts';
import type { Action, GameState, PendingChoice, PlayerId } from '../battle/types.ts';
import { cardPickScore, evaluate, raceFrame, WEIGHTS, type RaceFrame } from './evaluate.ts';

/** ランダムな対象の平均を取るときのシードの数 */
export const RANDOM_SEEDS = 3;

/** 仮の実行で選択待ちを進める回数の上限 */
const MAX_AUTO_CHOICES = 4;

/** 選択待ち（サーチ・回収・保持・解除など）の選び方。仮の実行と本番の両方で使う */
export function chooseFor(g: GameState, p: PendingChoice, me: PlayerId): string[] {
  const options = p.options;
  if (options.length === 0) return [];
  const step = p.step;
  const effectId = step.t === 'effect' ? step.effect.id : step.t === 'retain' ? 'retain' : '';
  // カードを選ぶもの：すぐ使えるコスト・高いカードを優先
  const withCards = options.filter((o) => o.cardId && g.cards[o.cardId]);
  if (withCards.length === options.length && options.length > 0) {
    const scored = options.map((o) => ({ o, s: cardPickScore(g, me, g.cards[o.cardId!]!) }));
    scored.sort((a, b) => b.s - a.s);
    const n = Math.max(p.min, Math.min(1, p.max));
    if (effectId === 'retain') return scored.slice(0, p.max).map((x) => x.o.id);
    return scored.slice(0, n).map((x) => x.o.id);
  }
  if (p.max > 1 || p.min === 0) return options.slice(0, p.max).map((o) => o.id);
  return [options[0]!.id];
}

/**
 * 仮の実行用に軽くした盤面。ログを空にし、このターンに触れないもの（相手の山札・捨て札・除外、自分の除外、
 * 1ターンに引ける枚数を超える自分の山札）を外す。applyAction は毎回盤面を複製するので、小さいほど速い
 */
export function leanView(view: GameState, me: PlayerId): GameState {
  const opp = other(me);
  const players = [{ ...view.players[0] }, { ...view.players[1] }] as GameState['players'];
  players[opp].deck = [];
  players[opp].discard = [];
  players[opp].exile = [];
  players[me].deck = view.players[me].deck.slice(0, BALANCE.battle.maxDrawPerTurn);
  players[me].exile = [];
  return { ...view, log: [], players };
}

/** 行動を仮に実行し、自分の選択待ちは自動で進めた状態を返す。実行できなければ null */
export function simulate(view: GameState, action: Action, seed: number, me: PlayerId): GameState | null {
  const r = applyAction({ ...view, rng: seed }, action);
  if (!r.ok) return null;
  let s = r.state;
  for (let i = 0; i < MAX_AUTO_CHOICES && s.pending && s.pending.player === me; i++) {
    const next = applyAction(s, { type: 'choose', player: me, picks: chooseFor(s, s.pending, me) });
    if (!next.ok) break;
    s = next.state;
  }
  return s;
}

/** この行動の結果がランダムに変わるか（使用時・召喚時にランダムな対象の効果や、ランダムに捨てるデメリットがある） */
export function usesRandom(view: GameState, action: Action): boolean {
  if (action.type !== 'playCard') return false;
  const card = view.players[action.player].hand.find((c) => c.uid === action.cardUid);
  const def = card ? view.cards[card.cardId] : undefined;
  if (!def) return false;
  const timing = def.stats ? 'summon' : 'play';
  const opp = other(action.player);
  const oppBoard = view.players[opp].board.length;
  const myBoard = view.players[action.player].board.length;
  for (const e of def.effects) {
    if (e.timing !== timing) continue;
    // コイン投げの条件：仮の実行で結果を先読みしないよう、複数のシードの平均で評価する
    if (e.condition === 'coinFlip') return true;
    if (e.target !== 'random') continue;
    if (oppBoard > 0 || myBoard > 1) return true;
  }
  return def.drawbacks.some((d) => d.id === 'discardRandom' && d.timing === timing && view.players[action.player].hand.length > 1);
}

/** 評価つきの候補。タイブレークに使う情報も持つ */
export interface Candidate {
  action: Action;
  score: number;
  /** 代表の結果（最初のシード） */
  state: GameState | null;
  /** 次のターンに攻撃してくる相手モンスターを何体取り除いたか */
  kills: number;
  /** 使ったカードのコスト */
  cost: number;
  /** 相手プレイヤーの HP を減らした量 */
  face: number;
}

/**
 * 行動を評価する。ランダムな結果になる行動は複数シードの平均。
 * frame（レースの見込み）は比べる候補どうしで同じものを使う。省略すると行動の前の盤面（view）から計算する
 */
export function scoreAction(view: GameState, action: Action, seed: number, me: PlayerId, frame: RaceFrame = raceFrame(view, me)): Candidate | null {
  const seeds = usesRandom(view, action) ? RANDOM_SEEDS : 1;
  let total = 0;
  let first: GameState | null = null;
  for (let k = 0; k < seeds; k++) {
    const s = simulate(view, action, seed * RANDOM_SEEDS + k, me);
    if (!s) return null;
    if (!first) first = s;
    total += evaluate(s, me, frame);
  }
  return { action, score: total / seeds, state: first, ...outcome(view, first!, action, me) };
}

/** タイブレーク用：除去した攻撃してくるモンスターの数、コスト、顔へのダメージ */
export function outcome(before: GameState, after: GameState, action: Action, me: PlayerId): Pick<Candidate, 'kills' | 'cost' | 'face'> {
  const opp = other(me);
  const alive = new Set(after.players[opp].board.map((m) => m.uid));
  let kills = 0;
  for (const m of before.players[opp].board) {
    if (m.attack > 0 && !m.status.freezePending && !alive.has(m.uid)) kills += 1;
  }
  let cost = 0;
  if (action.type === 'playCard') {
    const card = before.players[me].hand.find((c) => c.uid === action.cardUid);
    if (card) cost = effectiveCost(before, me, card);
  }
  const face = Math.max(0, before.players[opp].hp - after.players[opp].hp);
  return { kills, cost, face };
}

/** a が b より良いか。評価値がほぼ同じなら「除去 → コストの高いカード → 顔へのダメージ」の順で決める */
export function better(a: Candidate, b: Candidate): boolean {
  const eps = WEIGHTS.tieEpsilon;
  if (a.score > b.score + eps) return true;
  if (b.score > a.score + eps) return false;
  if (a.kills !== b.kills) return a.kills > b.kills;
  if (a.cost !== b.cost) return a.cost > b.cost;
  if (a.face !== b.face) return a.face > b.face;
  return a.score > b.score;
}

/** 盤面の要点をまとめた文字列（同じ盤面に二度行かないための印） */
export function signature(g: GameState): string {
  const parts: string[] = [`${g.players[0].hp}/${g.players[0].shield}`, `${g.players[1].hp}/${g.players[1].shield}`, `${g.players[g.active].energy}`];
  for (const p of g.players) {
    parts.push(p.hand.map((c) => c.uid).join(','));
    parts.push(
      p.board
        .map((m) => `${m.uid}:${m.hp}:${m.attack}:${m.attacksUsed}:${m.status.poison}:${m.status.vulnerable}:${m.status.weak}`)
        .join(','),
    );
    const s = p.status;
    parts.push(`${s.poison}:${s.vulnerable}:${s.weak}:${s.bleed}:${s.strength}:${s.focus}:${s.nullify}:${s.counter}`);
  }
  parts.push(g.pending ? 'p' : '');
  return parts.join('|');
}

/**
 * 同じ結果になる行動の印（同じカードが手札に2枚あるとき、同じ対象への使用は1回だけ仮に実行すればよい）。
 * 攻撃はモンスターのカード・数値・状態が同じなら同じ結果
 */
export function actionKey(g: GameState, a: Action): string {
  if (a.type === 'playCard') {
    const card = g.players[a.player].hand.find((c) => c.uid === a.cardUid);
    const t = a.chosen?.enemy;
    return `c:${card?.cardId}:${card?.copy ?? ''}|${t ? (t.kind === 'player' ? 'p' : t.uid) : ''}|${a.chosen?.ally ?? ''}`;
  }
  if (a.type === 'attack') {
    const m = g.players[a.player].board.find((x) => x.uid === a.attackerUid);
    if (!m) return `a:${a.attackerUid}`;
    const t = a.target.kind === 'player' ? 'p' : a.target.uid;
    return `a:${m.card.cardId}:${m.attack}:${m.hp}:${m.defense}:${m.attacksUsed}:${m.sealed}:${m.stealth}:${JSON.stringify(m.status)}|${t}`;
  }
  return JSON.stringify(a);
}

/** 同じ結果になる行動を1つにまとめる */
export function dedupeActions(g: GameState, actions: Action[]): Action[] {
  const seen = new Set<string>();
  const out: Action[] = [];
  for (const a of actions) {
    const key = actionKey(g, a);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

/** 行動の候補（ターン終了・降参・ノイズ除外を除く）。顔を狙う行動を先に並べる */
export function orderForSearch(g: GameState, actions: Action[]): Action[] {
  const rank = (a: Action): number => {
    if (a.type === 'attack') return a.target.kind === 'player' ? 3 : 1;
    if (a.type === 'playCard') return a.chosen?.enemy?.kind === 'player' ? 2.5 : 2;
    return 0;
  };
  return dedupeActions(g, actions.filter((a) => a.type !== 'endTurn' && a.type !== 'concede')).sort((a, b) => rank(b) - rank(a));
}
