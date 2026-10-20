/** 解決キュー：積まれた処理を先頭から順に実行し、選択が要れば止まる */
import { BALANCE } from '../balance.ts';
import type { EffectDef } from '../define.ts';
import { effectModifiers } from '../points.ts';
import { getDrawback, getEffect } from '../registry.ts';
import { describeDrawback, describeEffect } from '../text.ts';
import type { EffectInstance } from '../types.ts';
import { checkCondition } from './conditions.ts';
import { checkGameEnd, enqueue, findMonster, log, other, playRecord } from './core.ts';
import { finishCard } from './play.ts';
import { makeRuntime, resolveTargets } from './runtime.ts';
import { retainOptions, runAutoAttacks, turnEndEffects, turnEndFinish } from './turn.ts';
import { discardChosen } from './zones.ts';
import { CONDITIONS, REPEAT_CAPPED_TIMINGS } from '../options.ts';
import type { GameState, Step } from './types.ts';

/** 1回の行動で処理する上限（効果の無限ループを防ぐ） */
const MAX_STEPS = 5000;

export function runQueue(g: GameState): void {
  let count = 0;
  while (g.queue.length > 0 && !g.pending && g.phase !== 'ended') {
    if (++count > MAX_STEPS) {
      log(g, 0, '処理が多すぎるため打ち切りました', 'info');
      g.queue = [];
      break;
    }
    const step = g.queue.shift()!;
    g.qInsert = 0;
    executeStep(g, step);
  }
  g.qInsert = 0;
}

function executeStep(g: GameState, step: Step): void {
  switch (step.t) {
    case 'effect':
      return executeEffect(g, step);
    case 'drawback':
      return executeDrawback(g, step);
    case 'cardDone':
      return finishCard(g, step.player, step.card, step.protectKey, step.depth);
    case 'autoAttacks':
      return runAutoAttacks(g, step.player);
    case 'turnEndEffects':
      return turnEndEffects(g, step.player);
    case 'retain':
      return executeRetain(g, step);
    case 'discardChoice':
      return executeDiscardChoice(g, step);
    case 'turnEndFinish':
      return turnEndFinish(g, step.player, step.kept);
  }
}

/**
 * 数値の倍数（X・相手モンスター1体につき・このターン使ったカード1枚につき）。付いていなければ null。
 * 掛けた値は効果の入力欄の上限まで（ダメージ系で回数のあるものは、値×回数が1枚のダメージの上限まで）
 */
function scaledEffect(g: GameState, step: Extract<Step, { t: 'effect' }>, def: EffectDef): { effect: EffectInstance; factor: number; why: string } | null {
  const scale = effectModifiers(step.effect).find((m) => m.scope === 'scale');
  if (!scale) return null;
  const me = step.src.controller;
  const cap = BALANCE.modifierParams.scaleCountCap;
  let factor = 0;
  let why = '';
  switch (scale.id) {
    case 'xEnergy':
      factor = step.protectKey ? (g.protect[step.protectKey]?.x ?? 0) : 0;
      why = `X＝${factor}`;
      break;
    case 'perEnemyMonster': {
      const count = g.players[other(me)].board.length;
      factor = Math.min(count, cap);
      why = `相手モンスター${count}体${count > cap ? `（最大${cap}）` : ''}`;
      break;
    }
    case 'perCardPlayed': {
      const count = g.active === me ? g.players[me].turn.cardsPlayed : 0;
      factor = Math.min(count, cap);
      why = g.active === me ? `このターン使ったカード${count}枚${count > cap ? `（最大${cap}）` : ''}` : '相手のターン';
      break;
    }
    default:
      return null;
  }
  const base = step.effect.value ?? 0;
  let max = def.value?.max ?? Infinity;
  if (def.isDamage && def.hits) max = Math.min(max, Math.floor(BALANCE.params.damagePerCardMax / Math.max(1, step.effect.hits ?? 1)));
  const value = Math.min(base * factor, max);
  return { effect: { ...step.effect, value }, factor, why };
}

/** 場を離れたモンスター（全体破壊でいっしょに消えたものなど）の、繰り返し誘発の効果は発動しない */
function sourceGone(g: GameState, step: Extract<Step, { t: 'effect' }>): boolean {
  return step.src.kind === 'monster' && REPEAT_CAPPED_TIMINGS.includes(step.timing) && !findMonster(g, step.src.uid);
}

function executeEffect(g: GameState, step: Extract<Step, { t: 'effect' }>): void {
  const def = getEffect(step.effect.id);
  if (!def) return;
  const me = step.src.controller;
  if (!step.picks) {
    if (sourceGone(g, step)) return;
    log(g, step.depth, `${step.src.name}：${describeEffect(step.effect)}`, 'effect');
    if (step.effect.condition && !checkCondition(g, me, step.effect.condition, { roll: { depth: step.depth + 1 } })) {
      log(g, step.depth + 1, `条件「${CONDITIONS[step.effect.condition].label}」を満たさないため発動しない`);
      return;
    }
  }
  // 数値の倍数：効果ファイルには掛けたあとの値の写しを渡す
  const scaled = scaledEffect(g, step, def);
  if (scaled && !step.picks) {
    if (scaled.factor <= 0) {
      log(g, step.depth + 1, `${scaled.why}：数値が0のため不発`);
      return;
    }
    log(g, step.depth + 1, `${scaled.why}：数値 ${step.effect.value ?? 0}×${scaled.factor} → ${scaled.effect.value ?? 0}`);
  }
  if (scaled && scaled.factor <= 0) return;
  const effect = scaled?.effect ?? step.effect;
  const targets = resolveTargets(g, step.src, effect, step.timing, def.targetRule, step.chosen);
  const rt = makeRuntime(g, step.src, targets, {
    depth: step.depth + 1,
    attackCard: step.attackCard,
    ...(step.protectKey ? { protectKey: step.protectKey } : {}),
  });
  if (def.targetRule !== 'self' && def.targetRule !== 'enemyPlayer' && targets.length === 0) {
    log(g, step.depth + 1, '対象がいないため何も起きない');
    return;
  }
  let picks = step.picks;
  if (!picks && def.battle.choose) {
    const spec = def.battle.choose(rt, effect);
    if (spec) {
      if (spec.options.length === 0) {
        log(g, step.depth + 1, '選べるものがないため何も起きない');
        return;
      }
      if (spec.options.length === 1 && spec.min >= 1) {
        picks = [spec.options[0]!.id];
      } else {
        g.pending = { player: me, prompt: spec.prompt, options: spec.options, min: spec.min, max: spec.max, step };
        return;
      }
    }
  }
  // 効果1つを処理し終えてから勝敗を判定する（全体ダメージで両者が同時にHP0なら引き分け）
  g.holdEnd += 1;
  try {
    def.battle.resolve(rt, effect, picks);
  } finally {
    g.holdEnd -= 1;
  }
  checkGameEnd(g);
}

function executeDrawback(g: GameState, step: Extract<Step, { t: 'drawback' }>): void {
  const def = getDrawback(step.drawback.id);
  if (!def?.battle.resolve) return;
  const me = step.src.controller;
  const s = g.players[me].status;
  const before = { poison: s.poison, burn: s.burn };
  if (!step.picks) log(g, step.depth, `${step.src.name}のデメリット：${describeDrawback(step.drawback)}`, 'effect');
  const rt = makeRuntime(g, step.src, [], { depth: step.depth + 1, attackCard: false });
  // 選択が要るデメリット（生け贄）
  let picks = step.picks;
  if (!picks && def.battle.choose) {
    const spec = def.battle.choose(rt, step.drawback);
    if (spec) {
      if (spec.options.length === 0) {
        log(g, step.depth + 1, '選べるものがないため何も起きない');
        return;
      }
      if (spec.options.length === 1 && spec.min >= 1) {
        picks = [spec.options[0]!.id];
      } else {
        g.pending = { player: me, prompt: spec.prompt, options: spec.options, min: spec.min, max: spec.max, step };
        return;
      }
    }
  }
  def.battle.resolve(rt, step.drawback, picks);
  // このデメリットで付いた毒・やけどは、同じカードの浄化では消えない（決定事項 #34）
  if (step.protectKey) {
    const rec = playRecord(g, step.protectKey);
    rec.poison += Math.max(0, s.poison - before.poison);
    rec.burn += Math.max(0, s.burn - before.burn);
  }
}

/** 手札を選んで捨てる（手札整理）。手札が足りなければあるだけ */
function executeDiscardChoice(g: GameState, step: Extract<Step, { t: 'discardChoice' }>): void {
  const ps = g.players[step.player];
  const n = Math.min(step.count, ps.hand.length);
  if (step.picks) {
    discardChosen(g, step.player, step.picks.slice(0, n), step.depth);
    return;
  }
  if (n === 0) {
    log(g, step.depth, `${ps.name}は捨てる手札がない`);
    return;
  }
  if (n === ps.hand.length) {
    discardChosen(g, step.player, ps.hand.map((c) => c.uid), step.depth);
    return;
  }
  g.pending = {
    player: step.player,
    prompt: `手札から捨てるカードを${n}枚選んでください`,
    options: ps.hand.map((c) => ({ id: c.uid, label: g.cards[c.cardId]?.name ?? 'ノイズ', cardId: c.cardId })),
    min: n,
    max: n,
    step,
  };
}

function executeRetain(g: GameState, step: Extract<Step, { t: 'retain' }>): void {
  const ps = g.players[step.player];
  const max = Math.min(ps.turn.retain, retainOptions(g, step.player).length);
  if (step.picks || max === 0) {
    const allowed = new Set(retainOptions(g, step.player).map((c) => c.uid));
    const kept = (step.picks ?? []).filter((uid) => allowed.has(uid)).slice(0, max);
    enqueue(g, { t: 'turnEndFinish', player: step.player, kept });
    return;
  }
  g.pending = {
    player: step.player,
    prompt: `手札から残すカードを${max}枚まで選んでください（保持）`,
    options: retainOptions(g, step.player).map((c) => ({ id: c.uid, label: g.cards[c.cardId]?.name ?? 'ノイズ', cardId: c.cardId })),
    min: 0,
    max,
    step,
  };
}
