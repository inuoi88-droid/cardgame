/** 解決キュー：積まれた処理を先頭から順に実行し、選択が要れば止まる */
import { getDrawback, getEffect } from '../registry.ts';
import { describeDrawback, describeEffect } from '../text.ts';
import { checkCondition } from './conditions.ts';
import { enqueue, log } from './core.ts';
import { finishCard } from './play.ts';
import { makeRuntime, resolveTargets } from './runtime.ts';
import { retainOptions, runAutoAttacks, turnEndEffects, turnEndFinish } from './turn.ts';
import { CONDITIONS } from '../options.ts';
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
    case 'turnEndFinish':
      return turnEndFinish(g, step.player, step.kept);
  }
}

function executeEffect(g: GameState, step: Extract<Step, { t: 'effect' }>): void {
  const def = getEffect(step.effect.id);
  if (!def) return;
  const me = step.src.controller;
  if (!step.picks) {
    log(g, step.depth, `${step.src.name}：${describeEffect(step.effect)}`, 'effect');
    if (step.effect.condition && !checkCondition(g, me, step.effect.condition)) {
      log(g, step.depth + 1, `条件「${CONDITIONS[step.effect.condition].label}」を満たさないため発動しない`);
      return;
    }
  }
  const targets = resolveTargets(g, step.src, step.effect, step.timing, def.targetRule, step.chosen);
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
    const spec = def.battle.choose(rt, step.effect);
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
  def.battle.resolve(rt, step.effect, picks);
}

function executeDrawback(g: GameState, step: Extract<Step, { t: 'drawback' }>): void {
  const def = getDrawback(step.drawback.id);
  if (!def?.battle.resolve) return;
  const me = step.src.controller;
  const s = g.players[me].status;
  const before = { poison: s.poison, burn: s.burn };
  log(g, step.depth, `${step.src.name}のデメリット：${describeDrawback(step.drawback)}`, 'effect');
  def.battle.resolve(makeRuntime(g, step.src, [], { depth: step.depth + 1, attackCard: false }), step.drawback);
  // このデメリットで付いた毒・やけどは、同じカードの浄化では消えない（決定事項 #34）
  if (step.protectKey) {
    const prev = g.protect[step.protectKey] ?? { poison: 0, burn: 0 };
    g.protect[step.protectKey] = {
      poison: prev.poison + Math.max(0, s.poison - before.poison),
      burn: prev.burn + Math.max(0, s.burn - before.burn),
    };
  }
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
