/** 対戦の入口：applyAction(状態, 行動) → 新しい状態。元の状態は書き換えない */
import { findMonster } from './core.ts';
import { attackBlockReason, attackTargets, enlistOptions, performAttack } from './combat.ts';
import { mulligan, validateMulligan } from './mulligan.ts';
import { activate, reveal, useDiscardAbility, useHandAbility, validateActivate, validateDiscardAbility, validateHandAbility, validateReveal } from './abilities.ts';
import { setAside, validateSetAside } from './waiting.ts';
import { playCard, removeNoise, validatePlay, validateRemoveNoise, type PlayOpts } from './play.ts';
import { runQueue } from './queue.ts';
import { beginEndTurn, concede } from './turn.ts';
import type { Action, ApplyResult, GameState, TargetRef } from './types.ts';

/** playCard の追加の指定（MTG 要素 ○ バッチC1：捨て札から使う・キッカー） */
function playOpts(a: Extract<Action, { type: 'playCard' }>): PlayOpts {
  const o: PlayOpts = {};
  if (a.from === 'discard' || a.from === 'waiting') o.from = a.from;
  if (a.discardUid !== undefined) o.discardUid = a.discardUid;
  if (a.exileUids !== undefined) o.exileUids = a.exileUids;
  if (a.kick === true) o.kick = true;
  // MTG 要素 ○ バッチC2：モード選択
  if (a.mode !== undefined) o.mode = a.mode;
  // MTG 要素 △ バッチB：追加の支払い・代わりの使い方・差し出す・払い方
  if (a.extra !== undefined) o.extra = a.extra;
  if (a.modes !== undefined) o.modes = a.modes;
  if (a.alt !== undefined) o.alt = a.alt;
  if (a.sacrificeUid !== undefined) o.sacrificeUid = a.sacrificeUid;
  if (a.tapUids !== undefined) o.tapUids = a.tapUids;
  if (a.pitchUid !== undefined) o.pitchUid = a.pitchUid;
  if (a.lifePay !== undefined) o.lifePay = a.lifePay;
  return o;
}

const sameRef = (a: TargetRef, b: TargetRef) =>
  a.kind === 'player' ? b.kind === 'player' && a.player === b.player : b.kind === 'monster' && a.uid === b.uid;

/** 行動が今できるか。できなければ理由（サーバーの検証にも使う） */
export function validateAction(g: GameState, a: Action): string | null {
  if (g.phase === 'ended') return '対戦は終わっています';
  if (a.player !== 0 && a.player !== 1) return 'プレイヤーが正しくありません';
  if (a.type === 'concede') return null;
  if (a.type === 'mulligan') return validateMulligan(g, a.player, a.mode, a.cardUids);
  if (g.phase !== 'main') return 'マリガン中です';
  if (g.pending) {
    if (a.type !== 'choose') return '選択の途中です';
    if (a.player !== g.pending.player) return '相手の選択を待っています';
    const ids = new Set(g.pending.options.map((o) => o.id));
    const picks = new Set(a.picks);
    if (picks.size !== a.picks.length) return '同じものを2回選べません';
    if (a.picks.some((p) => !ids.has(p))) return '選べないものが含まれています';
    if (a.picks.length < g.pending.min || a.picks.length > g.pending.max) {
      return `${g.pending.min}〜${g.pending.max}個選んでください`;
    }
    return null;
  }
  if (a.type === 'choose') return '今は選択するものがありません';
  if (a.player !== g.active) return '自分のターンではありません';
  switch (a.type) {
    case 'playCard':
      return validatePlay(g, a.player, a.cardUid, a.chosen, playOpts(a));
    case 'activate':
      return validateActivate(g, a.player, a.sourceUid, a.chosen, a.use);
    // MTG 要素 △ バッチC：待機させる・表にする
    case 'setAside':
      return validateSetAside(g, a.player, a.cardUid, a.kind);
    case 'reveal':
      return validateReveal(g, a.player, a.uid, a.chosen);
    case 'handAbility':
      return validateHandAbility(g, a.player, a.cardUid, a.ability, a.chosen);
    case 'discardAbility':
      return validateDiscardAbility(g, a.player, a.cardUid, a.ability, a.chosen);
    case 'removeNoise':
      return validateRemoveNoise(g, a.player, a.cardUid);
    case 'attack': {
      const m = findMonster(g, a.attackerUid);
      if (!m || m.controller !== a.player) return 'そのモンスターは場にいません';
      const reason = attackBlockReason(g, m);
      if (reason) return reason;
      if (!attackTargets(g, m).some((t) => sameRef(t, a.target))) return 'その相手は攻撃できません';
      // 後援（MTG 要素 △ バッチB）
      if (a.enlistUid !== undefined && !enlistOptions(g, m).some((x) => x.uid === a.enlistUid)) return 'そのモンスターは後援で休ませられません';
      return null;
    }
    case 'endTurn':
      return null;
  }
}

export function applyAction(state: GameState, a: Action): ApplyResult {
  const error = validateAction(state, a);
  if (error) return { ok: false, error };
  const g = structuredClone(state);
  g.qInsert = 0;
  switch (a.type) {
    case 'concede':
      concede(g, a.player, a.reason);
      break;
    case 'mulligan':
      mulligan(g, a.player, a.mode, a.cardUids);
      break;
    case 'choose': {
      const step = g.pending!.step;
      g.pending = null;
      g.queue.unshift({ ...step, picks: a.picks } as typeof step);
      break;
    }
    case 'playCard':
      playCard(g, a.player, a.cardUid, a.chosen ?? {}, playOpts(a));
      break;
    case 'activate':
      activate(g, a.player, a.sourceUid, a.chosen ?? {}, a.use);
      break;
    case 'setAside':
      setAside(g, a.player, a.cardUid, a.kind);
      break;
    case 'reveal':
      reveal(g, a.player, a.uid, a.chosen ?? {});
      break;
    case 'handAbility':
      useHandAbility(g, a.player, a.cardUid, a.ability, a.chosen ?? {});
      break;
    case 'discardAbility':
      useDiscardAbility(g, a.player, a.cardUid, a.ability, a.chosen ?? {});
      break;
    case 'removeNoise':
      removeNoise(g, a.player, a.cardUid);
      break;
    case 'attack':
      performAttack(g, findMonster(g, a.attackerUid)!, a.target, 0, '', a.enlistUid);
      break;
    case 'endTurn':
      beginEndTurn(g, a.player);
      break;
  }
  runQueue(g);
  return { ok: true, state: g };
}
