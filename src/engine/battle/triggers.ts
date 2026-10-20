/** 発動タイミングごとに、効果・デメリットを解決キューに積む */
import { BALANCE } from '../balance.ts';
import { REPEAT_CAPPED_TIMINGS, TIMINGS } from '../options.ts';
import type { CardDef, EffectInstance, TimingId } from '../types.ts';
import { enqueue, log, newUid } from './core.ts';
import { allyCandidates, chosenRules, enemyCandidates } from './play.ts';
import { pick } from './rng.ts';
import type { CardInst, Chosen, GameState, PlayerId, PowerInst, SourceRef } from './types.ts';

interface FireOpts {
  /** アタック・パワーアタックの使用時（筋力・気合が乗る） */
  attackCard?: boolean;
  /** 封印されたモンスター（効果は発動せず、デメリットだけ残る） */
  sealed?: boolean;
  protectKey?: string;
  /** 成長（MTG 要素 ○ バッチB）：ダメージ・連撃の数値に足す量 */
  grow?: number;
}

/**
 * カード（モンスターを含む）の、あるタイミングのデメリットと効果を積む。
 * 決定事項 #34：同じカードの同じタイミングでは、デメリットを先に処理してから効果を処理する。
 */
export function enqueueCardTiming(
  g: GameState,
  src: SourceRef,
  def: CardDef,
  timing: TimingId,
  chosen: Chosen,
  depth: number,
  opts: FireOpts,
): void {
  const effects = opts.sealed ? [] : def.effects.filter((e) => e.timing === timing);
  const drawbacks = def.drawbacks.filter((d) => d.timing === timing);
  if (effects.length === 0 && drawbacks.length === 0) return;
  const protectKey = opts.protectKey ?? newUid(g, 'pk');
  for (const drawback of drawbacks) enqueue(g, { t: 'drawback', src, drawback, protectKey, depth });
  // 濫用（MTG 要素 ○ バッチA）：使用時・召喚時の効果に条件「生け贄にしたなら」があれば、デメリットのあと・効果の前に選ぶ
  if ((timing === 'play' || timing === 'summon') && effects.some((e) => e.condition === 'exploit')) {
    enqueue(g, { t: 'exploitChoice', player: src.controller, protectKey, depth });
  }
  for (const effect of effects) {
    enqueue(g, { t: 'effect', src, effect, timing, chosen, attackCard: opts.attackCard ?? false, protectKey, depth, ...(opts.grow ? { grow: opts.grow } : {}) });
  }
}

export function powerSource(power: PowerInst, controller: PlayerId): SourceRef {
  return { kind: 'power', uid: power.uid, cardId: power.cardId, name: power.name, controller };
}

export interface EnqueueOpts {
  /** 発動させないパワー・モンスター（いま置いたパワー、いま出たモンスター） */
  excludeUid?: string;
  /** 「選んだ1体」（「出たモンスター」など） */
  chosen?: Chosen;
  /** このモンスターだけ（「自分のカードの対象になるたび」） */
  onlyUid?: string;
}

/**
 * 繰り返し誘発の安全装置：1つのパワー・モンスターにつき、通算ターン1つあたり上限の回数まで。
 * 数えて、まだ発動できれば true（上限を超えた最初の1回だけログを出す）
 */
function allowRepeat(
  g: GameState,
  timing: TimingId,
  name: string,
  depth: number,
  read: () => { turnIndex: number; count: number } | undefined,
  write: (t: { turnIndex: number; count: number }) => void,
): boolean {
  const capped = timing === 'cardPlayed' || REPEAT_CAPPED_TIMINGS.includes(timing);
  if (!capped) return true;
  const max = timing === 'cardPlayed' ? BALANCE.battle.maxCardPlayedTriggersPerTurn : BALANCE.battle.maxRepeatTriggersPerTurn;
  const prev = read();
  const t = prev && prev.turnIndex === g.turnIndex ? { ...prev } : { turnIndex: g.turnIndex, count: 0 };
  t.count += 1;
  write(t);
  if (t.count <= max) return true;
  if (t.count === max + 1) log(g, depth, `「${name}」の「${TIMINGS[timing].label}」はこのターンもう発動しない（1ターン${max}回まで）`, 'info');
  return false;
}

/** パワーの、あるタイミングの効果を積む（使った順） */
export function enqueuePowers(g: GameState, p: PlayerId, timing: TimingId, depth: number, opts: EnqueueOpts = {}): void {
  for (const power of g.players[p].powers) {
    if (power.uid === opts.excludeUid) continue;
    const effects = power.effects.filter((x) => !x.removed && x.effect.timing === timing).map((x) => x.effect);
    const drawbacks = power.drawbacks.filter((d) => d.timing === timing);
    if (effects.length === 0 && drawbacks.length === 0) continue;
    // 「カードを使うたび」などはパワー1つにつき1ターンに規定回数まで（安全装置：決定事項 #64）
    const ok = allowRepeat(
      g,
      timing,
      power.name,
      depth,
      () => (timing === 'cardPlayed' ? power.triggers : power.repeats?.[timing]),
      (t) => {
        if (timing === 'cardPlayed') power.triggers = t;
        else power.repeats = { ...power.repeats, [timing]: t };
      },
    );
    if (!ok) continue;
    const src = powerSource(power, p);
    const protectKey = newUid(g, 'pk');
    for (const drawback of drawbacks) enqueue(g, { t: 'drawback', src, drawback, protectKey, depth });
    for (const effect of effects) {
      enqueue(g, { t: 'effect', src, effect, timing, chosen: opts.chosen ?? {}, attackCard: false, protectKey, depth });
    }
  }
}

/** 場のモンスターの、あるタイミングの効果を積む（左から） */
export function enqueueMonsters(g: GameState, p: PlayerId, timing: TimingId, depth: number, opts: EnqueueOpts = {}): void {
  for (const m of g.players[p].board) {
    if (m.uid === opts.excludeUid) continue;
    if (opts.onlyUid !== undefined && m.uid !== opts.onlyUid) continue;
    const def = g.cards[m.card.cardId];
    if (!def) continue;
    const hasAny = (!m.sealed && def.effects.some((e) => e.timing === timing)) || def.drawbacks.some((d) => d.timing === timing);
    if (!hasAny) continue;
    const key = `rt:${timing}`;
    const ok = allowRepeat(
      g,
      timing,
      def.name,
      depth,
      () => (m.counters[`${key}:turn`] === undefined ? undefined : { turnIndex: m.counters[`${key}:turn`]!, count: m.counters[`${key}:count`] ?? 0 }),
      (t) => {
        m.counters[`${key}:turn`] = t.turnIndex;
        m.counters[`${key}:count`] = t.count;
      },
    );
    if (!ok) continue;
    const src: SourceRef = { kind: 'monster', uid: m.uid, cardId: m.card.cardId, name: def.name, controller: m.controller };
    enqueueCardTiming(g, src, def, timing, opts.chosen ?? {}, depth, { sealed: m.sealed });
  }
}

/** 予約した効果を発動させる（自分のターン開始時、引いた後・ターン開始時のパワーより前）。古い順 */
export function enqueueDelayed(g: GameState, p: PlayerId): void {
  const ps = g.players[p];
  const list = ps.delayed ?? [];
  if (list.length === 0) return;
  ps.delayed = [];
  for (const d of list) {
    if (d.rebound) {
      enqueueRebound(g, p, d.src, d.rebound.card, d.rebound.effects);
      continue;
    }
    enqueue(g, {
      t: 'effect',
      src: { ...d.src, controller: p },
      effect: d.effect,
      timing: d.timing,
      chosen: d.chosen,
      attackCard: false,
      protectKey: newUid(g, 'pk'),
      depth: 1,
    });
  }
}

/**
 * 反復（MTG 要素 ○ バッチB）の2回目：使用時の効果をまとめて積み、そのあとカードを捨て札へ。
 * 「選んだ1体」はランダムな合法の対象（相手側は選べる候補から、自分側は自分のモンスターから）。カードを使ったことには数えない
 */
function enqueueRebound(g: GameState, p: PlayerId, src: SourceRef, card: CardInst, effects: EffectInstance[]): void {
  const def = g.cards[card.cardId];
  const chosen: Chosen = {};
  if (def) {
    const rules = chosenRules(def);
    const enemy = pick(g, enemyCandidates(g, p, rules.enemy));
    if (enemy) chosen.enemy = enemy;
    if (rules.ally) {
      const ally = pick(g, allyCandidates(g, p, card).filter((uid) => uid !== card.uid));
      if (ally) chosen.ally = ally;
    }
  }
  log(g, 1, `反復：「${src.name}」の使用時の効果がもう一度発動する`, 'effect', undefined, { kind: 'status', player: p, cardId: card.cardId, uid: card.uid, status: 'rebound' });
  const protectKey = newUid(g, 'pk');
  for (const effect of effects) {
    enqueue(g, {
      t: 'effect',
      src: { ...src, controller: p },
      effect,
      timing: 'play',
      chosen,
      attackCard: false,
      protectKey,
      depth: 2,
      ...(card.grow ? { grow: card.grow } : {}),
    });
  }
  enqueue(g, { t: 'reboundDone', card, depth: 2 });
}
