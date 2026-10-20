/** モンスターの攻撃 */
import { BALANCE } from '../balance.ts';
import { getDrawback } from '../registry.ts';
import {
  allMonsters,
  effectiveAttack,
  findMonster,
  log,
  monsterLabel,
  newUid,
  other,
  playerRef,
  sourceOfMonster,
  targetExists,
  targetLabel,
  isEnded,
} from './core.ts';
import { combatBonus, combatSourceOf, dealDamage, keywordFlags, targetableTaunts } from './damage.ts';
import { enqueueCardTiming } from './triggers.ts';
import type { GameState, Monster, TargetRef } from './types.ts';

export function attacksPerTurn(g: GameState, m: Monster): number {
  return keywordFlags(g, m).attacksPerTurn ?? 1;
}

/** 攻撃できないデメリット（防衛。封印されても働く）を持つか */
export function cannotAttack(g: GameState, m: Monster): boolean {
  return (g.cards[m.card.cardId]?.drawbacks ?? []).some((d) => getDrawback(d.id)?.battle.cannotAttack === true);
}

/** 消耗（MTG 要素 ○ バッチA）で、このターンは攻撃できないか（持ち主のターンの数え方で判定する） */
export function exerted(g: GameState, m: Monster): boolean {
  const t = m.counters.exertTurn;
  return t !== undefined && t === g.players[m.controller].turnsTaken;
}

/** 消耗のデメリットを持つか（封印されても働く） */
function hasExert(g: GameState, m: Monster): boolean {
  return (g.cards[m.card.cardId]?.drawbacks ?? []).some((d) => getDrawback(d.id)?.battle.exert === true);
}

/** このモンスターが今、手動で攻撃できるか。できなければ理由 */
export function attackBlockReason(g: GameState, m: Monster): string | null {
  if (g.phase !== 'main') return '今は攻撃できません';
  if (m.controller !== g.active) return '自分のターンではありません';
  if (cannotAttack(g, m)) return '防衛：このモンスターは攻撃できない';
  if (exerted(g, m)) return '消耗：このターンは攻撃できない';
  if (m.status.freezeActive) return '凍結していて攻撃できません';
  if (m.status.confuseActive) return '混乱していて、ターン開始時に自動で攻撃しました';
  if (m.betraying) return '裏切ったモンスターは自分では攻撃できません';
  if (m.enteredTurn === g.turnIndex && !keywordFlags(g, m).haste) return '場に出たターンは攻撃できません';
  if (m.attacksUsed >= attacksPerTurn(g, m)) return 'このターンはもう攻撃しました';
  return null;
}

/** 手動攻撃で選べる対象（挑発・飛行・隠密を考える） */
export function attackTargets(g: GameState, m: Monster): TargetRef[] {
  const opp = other(m.controller);
  const monsters = g.players[opp].board.filter((x) => !x.stealth);
  if (!keywordFlags(g, m).flying) {
    const taunts = targetableTaunts(g, opp);
    if (taunts.length > 0) return taunts.map((x) => ({ kind: 'monster', uid: x.uid }));
  }
  return [playerRef(opp), ...monsters.map((x): TargetRef => ({ kind: 'monster', uid: x.uid }))];
}

/** 攻撃を1回行う（手動・自動共通） */
export function performAttack(g: GameState, m: Monster, target: TargetRef, depth: number, note = ''): void {
  m.attacksUsed += 1;
  // 腐乱などが見る「攻撃したターン」
  m.counters.attackedTurn = g.turnIndex;
  // 場に出てから攻撃した回数（条件「このモンスターが3回以上攻撃した」。MTG 要素 ○ バッチA）
  m.counters.attacksTotal = (m.counters.attacksTotal ?? 0) + 1;
  // 消耗：次の持ち主のターンは攻撃できない
  if (hasExert(g, m)) m.counters.exertTurn = g.players[m.controller].turnsTaken + 1;
  // このターンの記録：手番のプレイヤーのモンスターが攻撃した（自動攻撃も数える）
  if (m.controller === g.active) {
    const turn = g.players[g.active].turn;
    turn.allyAttacks = (turn.allyAttacks ?? 0) + 1;
  }
  const attackerRef: TargetRef = { kind: 'monster', uid: m.uid };
  log(g, depth, `${monsterLabel(g, m)}が${targetLabel(g, target)}を攻撃${note}`, 'action', undefined, { kind: 'attack', source: attackerRef, target });
  const defender = target.kind === 'monster' ? findMonster(g, target.uid) : undefined;
  // この1回の攻撃の記録のキー：出血・反撃（状態）は攻撃と「攻撃するたび」の効果を合わせて1回（決定事項 #70 R4）
  const playKey = newUid(g, 'pk');
  // モンスターの反撃（決定事項 #69）：攻撃される前の守備側の攻撃力（一時強化・武士道を含む）・弱体・接死・絆魂で決まる（同時に解決する扱い）
  const retaliationAmount = defender ? effectiveAttack(defender) + combatBonus(g, defender) : 0;
  const retaliation =
    defender && BALANCE.battle.retaliation.enabled && retaliationAmount > 0
      ? { amount: retaliationAmount, weak: defender.status.weak > 0, label: monsterLabel(g, defender), source: combatSourceOf(g, defender) }
      : null;
  /** 先制攻撃：攻撃で相手モンスターを倒したら反撃を受けない */
  const firstStrike = keywordFlags(g, m).firstStrike === true;
  // 武士道：モンスターと戦うときだけ攻撃力に足す
  const amount = effectiveAttack(m) + (defender ? combatBonus(g, m) : 0);
  const r = dealDamage(g, target, amount, { kind: 'attack', source: attackerRef, playKey, depth: depth + 1 });
  if (isEnded(g)) return;
  const enemy = other(m.controller);
  /** 相手プレイヤーのHPを減らしたか（「相手プレイヤーにダメージを与えたとき」。裏切り・混乱で自分を殴ったときは数えない） */
  let hitEnemy = target.kind === 'player' && target.player === enemy && r.hpLost > 0;
  // 貫通：モンスターを倒して余ったダメージは、そのモンスターの持ち主のプレイヤーへ
  if (defender && r.destroyed && r.overflow > 0 && findMonster(g, m.uid) && keywordFlags(g, m).trample) {
    log(g, depth + 1, `貫通：余った${r.overflow}ダメージが${g.players[defender.controller].name}に通る`);
    const t = dealDamage(g, playerRef(defender.controller), r.overflow, { kind: 'trample', source: attackerRef, depth: depth + 2 });
    if (defender.controller === enemy && t.hpLost > 0) hitEnemy = true;
    if (isEnded(g)) return;
  }
  // 反撃：守備側が倒れていても、封印・凍結・隠密でも返す。守備側の「攻撃するたび」は発動しない。
  // 先制攻撃のモンスターが相手を倒したときは反撃を受けない
  if (retaliation && defender && firstStrike && r.destroyed) {
    log(g, depth + 1, `先制攻撃：${retaliation.label}の反撃を受けない`);
  } else if (retaliation && defender) {
    dealDamage(g, attackerRef, retaliation.amount, {
      kind: 'retaliate',
      source: { kind: 'monster', uid: defender.uid },
      sourceWeak: retaliation.weak,
      combatSource: retaliation.source,
      prefix: `${retaliation.label}の反撃：`,
      depth: depth + 1,
    });
    if (isEnded(g)) return;
  }
  // 攻撃するたび（攻撃したモンスターが場に残っていれば）
  const attacker = findMonster(g, m.uid);
  if (attacker && !attacker.sealed) {
    const def = g.cards[attacker.card.cardId];
    const chosen = targetExists(g, target) ? { enemy: target } : {};
    if (def) enqueueCardTiming(g, sourceOfMonster(g, attacker), def, 'attack', chosen, depth + 1, { protectKey: playKey });
    // 相手プレイヤーにダメージを与えたとき（1回の攻撃で最大1回）
    if (def && hitEnemy) enqueueCardTiming(g, sourceOfMonster(g, attacker), def, 'hitEnemyPlayer', {}, depth + 1, { protectKey: playKey });
  }
}

/** 混乱・裏切りの自動攻撃の対象 */
export function autoAttackTarget(g: GameState, m: Monster, random: (n: number) => number): TargetRef | undefined {
  if (m.betraying) return playerRef(m.controller);
  // 混乱：自分以外の敵味方すべてからランダム（挑発・隠密は無視）
  const pool: TargetRef[] = [
    playerRef(0),
    playerRef(1),
    ...allMonsters(g)
      .filter((x) => x.uid !== m.uid)
      .map((x): TargetRef => ({ kind: 'monster', uid: x.uid })),
  ];
  return pool[random(pool.length)];
}
