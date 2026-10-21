/**
 * 仮の実行（シミュレーション）の道具。見える情報（view）に対して applyAction を走らせ、結果の盤面を評価する。
 * 選択待ちになったら CPU 自身の選び方で進める。ランダムな対象を持つカードは複数のシードで平均する（決定事項 #72）。
 */
import { effectsForMode, resolveMode } from '../battle/modes.ts';
import { BALANCE } from '../balance.ts';
import { applyAction } from '../battle/apply.ts';
import { findMonster, other } from '../battle/core.ts';
import { activateSource, activateTiming } from '../battle/abilities.ts';
import { costCtxOf, effectiveCost, playTiming } from '../battle/play.ts';
import { NOISE_CARD_ID, type Action, type CardInst, type GameState, type PendingChoice, type PlayerId } from '../battle/types.ts';
import type { CardDef, EffectInstance, TimingId } from '../types.ts';
import { getEffect } from '../registry.ts';
import { classifyCard } from '../classify.ts';
import { cardPickScore, evaluate, nextEnergy, raceFrame, WEIGHTS, type RaceFrame } from './evaluate.ts';

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
  // MTG 要素バッチ2：占術・手札整理・処分・生け贄の選び方
  const special = chooseSpecial(g, p, me);
  if (special) return special;
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

/** 濫用で手放す累加維持費のモンスターの、場にあるターン数（CPU の判断の目安。バランスの数値ではない） */
const EXPLOIT_UPKEEP_AGE = 3;

/** カードの「いらなさ」：ノイズ → 呪い（デメリットつき）→ それ以外。大きいほど手放したい */
function junkRank(g: GameState, cardId: string | undefined): number {
  if (!cardId || cardId === NOISE_CARD_ID) return 2;
  const def = g.cards[cardId];
  if (!def) return 2;
  return def.drawbacks.length > 0 ? 1 : 0;
}

/** 占術・手札整理・処分・生け贄（MTG 要素バッチ2）の選び方。当てはまらなければ null */
function chooseSpecial(g: GameState, p: PendingChoice, me: PlayerId): string[] | null {
  const step = p.step;
  const options = p.options;
  const n = Math.max(p.min, 0);
  if (step.t === 'effect' && step.effect.id === 'scry') {
    // 残すのは「ノイズ・呪いでなく、次のターンの基本エナジー以下のコスト」のカード。それ以外を山札の下（捨て札）へ
    const energy = nextEnergy(g, me);
    return options
      .filter((o) => {
        if (junkRank(g, o.cardId) > 0) return true;
        return (g.cards[o.cardId!]?.cost ?? 0) > energy;
      })
      .slice(0, p.max)
      .map((o) => o.id);
  }
  if (step.t === 'discardChoice') {
    // ノイズ → 呪い → このターン払えないコストのうち一番重いもの → 一番軽いもの。
    // 徴募（MTG 要素 ○ バッチB）なら、スキルを少し優先する（小鬼が出る）
    const energy = g.players[me].energy;
    const cost = (id: string | undefined) => (id && g.cards[id] ? g.cards[id]!.cost : 0);
    const isSkill = (id: string | undefined) => (id && id !== NOISE_CARD_ID && g.cards[id] ? classifyCard(g.cards[id]!) === 'skill' : false);
    // 捨てられたときの効果（MTG 要素 △ バッチA）のあるカードは、ノイズ・呪いの次に捨てる
    const onDiscard = (id: string | undefined) => (id && g.cards[id] ? g.cards[id]!.effects.some((e) => e.timing === 'discarded') : false);
    const scored = options.map((o) => {
      const junk = junkRank(g, o.cardId);
      const c = cost(o.cardId);
      const key =
        (junk > 0 ? 1000 * junk : onDiscard(o.cardId) ? 500 : c > energy ? 100 + c : 10 - c) + (step.then === 'recruit' && isSkill(o.cardId) ? 50 : 0);
      return { o, key };
    });
    scored.sort((a, b) => b.key - a.key);
    return scored.slice(0, n).map((x) => x.o.id);
  }
  if (step.t === 'effect' && step.effect.id === 'purge') {
    // ノイズ → 呪いカード → 選ばない
    const best = [...options].sort((a, b) => junkRank(g, b.cardId) - junkRank(g, a.cardId))[0];
    return best && junkRank(g, best.cardId) > 0 ? [best.id] : [];
  }
  // MTG 要素 ○ バッチB：居住（評価値の一番高いトークン）・発見（占術と同じ考え方で、すぐ使える一番重いカード）
  if (step.t === 'effect' && step.effect.id === 'populate') {
    const scored = options.map((o) => {
      const m = findMonster(g, o.id);
      return { o, v: m ? m.attack * 3 + m.hp * 1.5 : -1 };
    });
    scored.sort((a, b) => b.v - a.v);
    return scored[0] ? [scored[0].o.id] : [];
  }
  if (step.t === 'effect' && step.effect.id === 'discover') {
    const energy = Math.max(g.players[me].energy, nextEnergy(g, me));
    const scored = options.map((o) => {
      const def = o.cardId ? g.cards[o.cardId] : undefined;
      const junk = junkRank(g, o.cardId);
      const v = !def ? 0 : junk > 0 ? -1000 * junk : (def.cost <= energy ? 100 : 0) + def.cost;
      return { o, v };
    });
    scored.sort((a, b) => b.v - a.v);
    return scored[0] ? [scored[0].o.id] : [];
  }
  // MTG 要素 △ バッチA：消術（相手の山札の上のうち、ノイズ・呪いでないものを下へ）・永久強化（攻撃力の高いモンスター）・章を進める（いちばん古い英雄譚）
  if (step.t === 'effect' && step.effect.id === 'fateseal') {
    return options.filter((o) => junkRank(g, o.cardId) === 0).slice(0, p.max).map((o) => o.id);
  }
  if (step.t === 'effect' && step.effect.id === 'perpetual') {
    const scored = options.map((o) => ({ o, v: g.cards[o.cardId ?? '']?.stats?.attack ?? -1 }));
    scored.sort((a, b) => b.v - a.v);
    return scored[0] ? [scored[0].o.id] : [];
  }
  if (step.t === 'effect' && step.effect.id === 'advanceSaga') return options[0] ? [options[0].id] : [];
  // MTG 要素 △ バッチB：貪食（トークン → 寿命の残り少ない → 攻撃力が上がる量より低いもの。それ以外は食べない）
  if (step.t === 'devourChoice') {
    const scored = options
      .map((o) => findMonster(g, o.id))
      .filter((m): m is NonNullable<typeof m> => m !== undefined && (m.card.token !== undefined || m.counters.life === 1 || m.attack < step.amount))
      .sort((a, b) => (a.card.token ? 0 : 1) - (b.card.token ? 0 : 1) || a.attack * 3 + a.hp * 1.5 - (b.attack * 3 + b.hp * 1.5));
    return scored.slice(0, p.max).map((m) => m.uid);
  }
  // MTG 要素 ○ バッチA：濫用・枯朽・捨て札の除外
  if (step.t === 'exploitChoice') {
    // 見える情報には解決待ちの効果が無い（view.ts がキューを隠す）ので、仮に実行して比べられない。
    // どうせ場を離れるモンスター（トークン・裏切り・寿命の残り1・攻撃した腐乱）だけを、評価値の低い順に選ぶ。いなければ選ばない
    const expendable = options
      .map((o) => findMonster(g, o.id))
      .filter((m): m is NonNullable<typeof m> => {
        if (!m) return false;
        const def = g.cards[m.card.cardId];
        const decaying = m.counters.attackedTurn === g.turnIndex && (def?.drawbacks.some((d) => d.id === 'decay') ?? false);
        // 累加維持費（MTG 要素 △ バッチA）が重くなったモンスターも手放す
        const upkeep = (def?.drawbacks.some((d) => d.id === 'cumulativeUpkeep') ?? false) && (m.counters.age ?? 0) >= EXPLOIT_UPKEEP_AGE;
        return m.card.token !== undefined || m.betraying || m.counters.life === 1 || decaying || upkeep;
      })
      .sort((a, b) => a.attack * 3 + a.hp * 1.5 - (b.attack * 3 + b.hp * 1.5));
    return expendable[0] ? [expendable[0].uid] : [];
  }
  if (step.t === 'drawback' && step.drawback.id === 'blight') {
    // トークン → 枯朽で死なないもののうち評価値（攻撃力×3＋体力×1.5）が一番低いもの → 全部死ぬなら一番低いもの
    const amount = step.drawback.value ?? 0;
    const scored = options.map((o) => {
      const m = findMonster(g, o.id);
      if (!m) return { o, key: Infinity };
      const value = m.attack * 3 + m.hp * 1.5;
      return { o, key: (m.card.token ? 0 : m.hp > amount ? 1e6 : 2e6) + value };
    });
    scored.sort((a, b) => a.key - b.key);
    return scored.slice(0, Math.max(1, n)).map((x) => x.o.id);
  }
  if (step.t === 'drawback' && step.drawback.id === 'exileDiscard') {
    // ノイズ → 呪い → コストの低い順（コストの合計なら、ノイズ・呪いのうちコストのあるもの → コストの高い順に、届くまで）
    const cost = (id: string | undefined) => (id && g.cards[id] ? g.cards[id]!.cost : 0);
    if (step.drawback.option === 'costSum') {
      const need = step.drawback.value ?? 0;
      const sorted = [...options].filter((o) => cost(o.cardId) > 0).sort((a, b) => junkRank(g, b.cardId) - junkRank(g, a.cardId) || cost(b.cardId) - cost(a.cardId));
      const picks: string[] = [];
      let sum = 0;
      for (const o of sorted) {
        if (sum >= need) break;
        picks.push(o.id);
        sum += cost(o.cardId);
      }
      return picks.length >= Math.max(1, p.min) ? picks : options.slice(0, Math.max(1, p.min)).map((o) => o.id);
    }
    const sorted = [...options].sort((a, b) => junkRank(g, b.cardId) - junkRank(g, a.cardId) || cost(a.cardId) - cost(b.cardId));
    return sorted.slice(0, n).map((o) => o.id);
  }
  if (step.t === 'drawback' && step.drawback.id === 'sacrifice') {
    // トークン → 破壊されたときの効果を持つもの → 評価値（攻撃力×3＋体力×1.5）が一番低いもの
    const scored = options.map((o) => {
      const m = findMonster(g, o.id);
      if (!m) return { o, key: Infinity };
      const def = g.cards[m.card.cardId];
      const onDeath = def?.effects.some((e) => e.timing === 'destroyed' && getEffect(e.id)) ?? false;
      const value = m.attack * 3 + m.hp * 1.5;
      return { o, key: (m.card.token ? 0 : onDeath ? 1e6 : 2e6) + value };
    });
    scored.sort((a, b) => a.key - b.key);
    return scored.slice(0, Math.max(1, n)).map((x) => x.o.id);
  }
  return null;
}

/**
 * 仮の実行用に軽くした盤面。ログを空にし、このターンに触れないもの（相手の山札・捨て札・除外、自分の除外、
 * 1ターンに引ける枚数を超える自分の山札）を外す。applyAction は毎回盤面を複製するので、小さいほど速い。
 * 山札を外した相手は、仮の実行でターンを終えても引かない（疲労にもしない：noFatigue。決定事項 #102）
 */
export function leanView(view: GameState, me: PlayerId): GameState {
  const opp = other(me);
  const players = [{ ...view.players[0] }, { ...view.players[1] }] as GameState['players'];
  players[opp].deck = [];
  players[opp].discard = [];
  players[opp].exile = [];
  players[opp].noFatigue = true;
  players[me].deck = view.players[me].deck.slice(0, BALANCE.battle.maxDrawPerTurn);
  players[me].exile = [];
  return { ...view, log: [], players };
}

/** 行動を仮に実行し、自分の選択待ちは自動で進めた状態を返す。実行できなければ null */
export function simulate(view: GameState, action: Action, seed: number, me: PlayerId): GameState | null {
  const r = applyAction({ ...view, rng: seed }, action);
  if (!r.ok) return null;
  let s = r.state;
  for (let i = 0; i < MAX_AUTO_CHOICES && s.pending; i++) {
    const pending: PendingChoice = s.pending;
    if (pending.player !== me) {
      // 最悪の二択（MTG 要素 △ バッチB）：相手は自分にとって悪い方（自分の評価が低い方）を選ぶと見積もる
      if (pending.step.t !== 'villainChoice') break;
      const frame = raceFrame(view, me);
      let worst: { state: GameState; score: number } | null = null;
      for (const o of pending.options) {
        const n = applyAction(s, { type: 'choose', player: pending.player, picks: [o.id] });
        if (!n.ok) continue;
        const score = evaluate(n.state, me, frame);
        if (!worst || score < worst.score) worst = { state: n.state, score };
      }
      if (!worst) break;
      s = worst.state;
      continue;
    }
    const next = applyAction(s, { type: 'choose', player: me, picks: chooseFor(s, pending, me) });
    if (!next.ok) break;
    s = next.state;
  }
  return s;
}

/**
 * 行動で使うカード（と出るタイミング）：手札・捨て札（MTG 要素 ○ バッチC1）から使うカード、手札から使う能力（魂力）、
 * 起動するモンスター・パワー。当てはまらなければ null
 */
export function actionCard(view: GameState, action: Action): { card?: CardInst; def: CardDef; timing: TimingId; effects: EffectInstance[] } | null {
  const ps = view.players[action.player];
  if (action.type === 'playCard') {
    const card =
      action.from === 'waiting'
        ? (ps.waiting ?? []).find((w) => w.card.uid === action.cardUid)?.card
        : (action.from === 'discard' ? ps.discard : ps.hand).find((c) => c.uid === action.cardUid);
    const def = card ? view.cards[card.cardId] : undefined;
    if (!card || !def) return null;
    const timing = playTiming(def, action.from === 'discard' ? 'discard' : 'hand', action.alt);
    // モード選択（MTG 要素 ○ バッチC2）：選んだモードの効果だけ（放題は選んだモードすべて：△ バッチB）
    // 裏向き（変装。MTG 要素 △ バッチC）は召喚時の効果が出ない
    if (action.alt === 'faceDown') return { card, def, timing, effects: [] };
    return { card, def, timing, effects: effectsForMode(def.effects, timing, resolveMode(def, timing, action.modes ?? action.mode)) };
  }
  if (action.type === 'handAbility') {
    const card = ps.hand.find((c) => c.uid === action.cardUid);
    const def = card ? view.cards[card.cardId] : undefined;
    if (!card || !def) return null;
    const timing = action.ability === 'forecast' ? 'forecast' : 'channel';
    return { card, def, timing, effects: action.ability === 'cycling' ? [] : def.effects.filter((e) => e.timing === timing) };
  }
  if (action.type === 'discardAbility') {
    const card = ps.discard.find((c) => c.uid === action.cardUid);
    const def = card ? view.cards[card.cardId] : undefined;
    if (!card || !def) return null;
    return { card, def, timing: 'renew', effects: action.ability === 'renew' ? def.effects.filter((e) => e.timing === 'renew') : [] };
  }
  if (action.type === 'activate') {
    const src = activateSource(view, action.player, action.sourceUid, action.use);
    if (!src) return null;
    const timing = activateTiming(action.use);
    return { def: src.def, timing, effects: src.def.effects.filter((e) => e.timing === timing) };
  }
  // 裏向きを表にする（MTG 要素 △ バッチC）
  if (action.type === 'reveal') {
    const card = ps.board.find((m) => m.uid === action.uid)?.faceDown?.card;
    const def = card ? view.cards[card.cardId] : undefined;
    if (!card || !def) return null;
    return { card, def, timing: 'revealed', effects: def.effects.filter((e) => e.timing === 'revealed') };
  }
  return null;
}

/** この行動の結果がランダムに変わるか（使用時・召喚時にランダムな対象の効果や、ランダムに捨てるデメリットがある） */
export function usesRandom(view: GameState, action: Action): boolean {
  const ac = actionCard(view, action);
  if (!ac) return false;
  const { def, timing } = ac;
  const opp = other(action.player);
  const oppBoard = view.players[opp].board.length;
  const myBoard = view.players[action.player].board.length;
  for (const e of ac.effects) {
    // コイン投げ・激突の条件・ばらつき（MTG 要素 △ バッチA）：仮の実行で結果を先読みしないよう、複数のシードの平均で評価する
    if (e.condition === 'coinFlip' || e.condition === 'clash') return true;
    if (e.mods?.includes('gamble')) return true;
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
  return { action, score: total / seeds + hiddenDeckBonus(view, action), state: first, ...outcome(view, first!, action, me) };
}

/**
 * 見える情報では自分の山札が隠れているので、仮の実行では価値が出ない効果（MTG 要素 ○ バッチB）の見込み：
 * 続唱（コストN以下のカードを無料で使う）と抽出（山札から1枚）。使用時・召喚時の効果だけ（条件は見ない）
 */
export function hiddenDeckBonus(view: GameState, action: Action): number {
  const ac = actionCard(view, action);
  if (!ac) return 0;
  let bonus = 0;
  for (const e of ac.effects) {
    if (e.id === 'cascade') bonus += (e.value ?? 0) * WEIGHTS.cascadePerCost;
    if (e.id === 'seek') bonus += WEIGHTS.seekCard;
  }
  return bonus;
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
    const card = actionCard(before, action)?.card;
    if (card) cost = effectiveCost(before, me, card, costCtxOf(action, action.chosen ?? {}));
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
        .map(
          (m) =>
            `${m.uid}:${m.hp}:${m.attack}:${m.tempAttack ?? 0}:${m.attacksUsed}:${m.status.poison}:${m.status.vulnerable}:${m.status.weak}:${(m.granted ?? []).join('+')}:${m.shieldUsed ? 1 : 0}`,
        )
        .join(','),
    );
    const s = p.status;
    parts.push(`${s.poison}:${s.vulnerable}:${s.weak}:${s.bleed}:${s.strength}:${s.focus}:${s.nullify}:${s.counter}:${s.doom ?? 0}`);
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
    const card = actionCard(g, a)?.card;
    const t = a.chosen?.enemy;
    // 捨て札から使う・キッカー（MTG 要素 ○ バッチC1）も区別する（捨て札のカードは手札に無いので、見つからなければ uid）
    const extra = `${a.from ?? ''}:${a.kick ? 'k' : ''}:${a.discardUid ?? ''}:${(a.exileUids ?? []).join('+')}:${a.mode ?? ''}:${(a.modes ?? []).join('+')}:${a.extra ?? ''}:${a.alt ?? ''}:${a.sacrificeUid ?? ''}:${(a.tapUids ?? []).join('+')}:${a.pitchUid ?? ''}:${a.lifePay ?? ''}`;
    // 永久強化（MTG 要素 △ バッチA）された個体は別のカード
    const perm = card?.perm ? `${card.perm.attack}/${card.perm.hp}` : '';
    return `c:${card?.cardId ?? a.cardUid}:${card?.copy ?? ''}:${card?.grow ?? 0}:${card?.buybackTurn ?? ''}:${perm}:${extra}|${t ? (t.kind === 'player' ? 'p' : t.uid) : ''}|${a.chosen?.ally ?? ''}`;
  }
  if (a.type === 'handAbility') {
    const card = g.players[a.player].hand.find((c) => c.uid === a.cardUid);
    const t = a.chosen?.enemy;
    return `h:${a.ability}:${card?.cardId ?? a.cardUid}:${card?.copy ?? ''}|${t ? (t.kind === 'player' ? 'p' : t.uid) : ''}|${a.chosen?.ally ?? ''}`;
  }
  if (a.type === 'attack') {
    const m = g.players[a.player].board.find((x) => x.uid === a.attackerUid);
    if (!m) return `a:${a.attackerUid}`;
    const t = a.target.kind === 'player' ? 'p' : a.target.uid;
    // MTG 要素 △ バッチA：容疑・守護・消滅の印・このターンだけのキーワード・最大体力も区別する
    const extra = `${m.maxHp}:${m.suspected ? 's' : ''}:${m.guard?.kind ?? ''}:${m.finality ? 'f' : ''}:${(m.tempGranted ?? []).join('+')}`;
    return `a:${a.enlistUid ?? ''}:${m.card.cardId}:${JSON.stringify(m.card.token ?? null)}:${m.attack}:${m.tempAttack ?? 0}:${m.hp}:${m.defense}:${m.attacksUsed}:${m.sealed}:${m.stealth}:${JSON.stringify(m.granted ?? [])}:${m.shieldUsed ?? false}:${m.counters.life ?? ''}:${m.counters.readyTurn === g.turnIndex ? 'r' : ''}:${extra}:${JSON.stringify(m.status)}|${t}`;
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
    if (a.type === 'playCard' || a.type === 'activate' || a.type === 'handAbility' || a.type === 'discardAbility') return a.chosen?.enemy?.kind === 'player' ? 2.5 : 2;
    return 0;
  };
  return dedupeActions(g, actions.filter((a) => a.type !== 'endTurn' && a.type !== 'concede')).sort((a, b) => rank(b) - rank(a));
}
