/** 発動タイミングごとに、効果・デメリットを解決キューに積む */
import type { CardDef, TimingId } from '../types.ts';
import { enqueue, newUid } from './core.ts';
import type { Chosen, GameState, PlayerId, PowerInst, SourceRef } from './types.ts';

interface FireOpts {
  /** アタック・パワーアタックの使用時（筋力・気合が乗る） */
  attackCard?: boolean;
  /** 封印されたモンスター（効果は発動せず、デメリットだけ残る） */
  sealed?: boolean;
  protectKey?: string;
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
  for (const effect of effects) {
    enqueue(g, { t: 'effect', src, effect, timing, chosen, attackCard: opts.attackCard ?? false, protectKey, depth });
  }
}

export function powerSource(power: PowerInst, controller: PlayerId): SourceRef {
  return { kind: 'power', uid: power.uid, cardId: power.cardId, name: power.name, controller };
}

/** パワーの、あるタイミングの効果を積む（使った順） */
export function enqueuePowers(g: GameState, p: PlayerId, timing: TimingId, depth: number, excludeUid?: string): void {
  for (const power of g.players[p].powers) {
    if (power.uid === excludeUid) continue;
    const effects = power.effects.filter((x) => !x.removed && x.effect.timing === timing).map((x) => x.effect);
    const drawbacks = power.drawbacks.filter((d) => d.timing === timing);
    if (effects.length === 0 && drawbacks.length === 0) continue;
    const src = powerSource(power, p);
    const protectKey = newUid(g, 'pk');
    for (const drawback of drawbacks) enqueue(g, { t: 'drawback', src, drawback, protectKey, depth });
    for (const effect of effects) {
      enqueue(g, { t: 'effect', src, effect, timing, chosen: {}, attackCard: false, protectKey, depth });
    }
  }
}

/** 場のモンスターの、あるタイミングの効果を積む（左から） */
export function enqueueMonsters(g: GameState, p: PlayerId, timing: TimingId, depth: number): void {
  for (const m of g.players[p].board) {
    const def = g.cards[m.card.cardId];
    if (!def) continue;
    const src: SourceRef = { kind: 'monster', uid: m.uid, cardId: m.card.cardId, name: def.name, controller: m.controller };
    enqueueCardTiming(g, src, def, timing, {}, depth, { sealed: m.sealed });
  }
}
