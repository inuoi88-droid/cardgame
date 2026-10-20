/** モンスターの攻撃 */
import { BALANCE } from '../balance.ts';
import { getDrawback } from '../registry.ts';
import {
  allMonsters,
  cardName,
  effectiveAttack,
  enqueue,
  findMonster,
  log,
  monsterDormant,
  monsterLabel,
  newUid,
  other,
  playerRef,
  sourceOfMonster,
  targetExists,
  targetLabel,
  isEnded,
} from './core.ts';
import { combatBonus, combatSourceOf, dealDamage, keywordFlags, playerBonus, setCrown, targetableTaunts } from './damage.ts';
import { enqueueCardTiming, enqueueEnemyAttacked } from './triggers.ts';
import type { GameState, Monster, PlayerId, TargetRef } from './types.ts';

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
  // MTG 要素 △ バッチA：卵（培養）・休眠
  if (m.card.token?.egg) return '卵はまだ攻撃できない（孵化を待つ）';
  if (monsterDormant(g, m)) return '休眠中：このターンは攻撃できない';
  // 一時蘇生（MTG 要素 △ バッチB）のモンスターは速攻を持つ
  if (m.enteredTurn === g.turnIndex && !keywordFlags(g, m).haste && !m.unearthed) return '場に出たターンは攻撃できません';
  if (m.attacksUsed >= attacksPerTurn(g, m)) return 'このターンはもう攻撃しました';
  return null;
}

/**
 * 手動攻撃で選べる対象（挑発・飛行・隠密を考える）。MTG 要素 △ バッチA：飛行のモンスターは、相手に対空（隠密でない）がいれば
 * 対空しか攻撃できない。潜伏のモンスターは、挑発がすべて自分より攻撃力が高ければ挑発を無視できる
 */
export function attackTargets(g: GameState, m: Monster): TargetRef[] {
  const opp = other(m.controller);
  const monsters = g.players[opp].board.filter((x) => !x.stealth);
  const flags = keywordFlags(g, m);
  const refs = (list: Monster[]) => list.map((x): TargetRef => ({ kind: 'monster', uid: x.uid }));
  if (flags.flying) {
    const reach = monsters.filter((x) => keywordFlags(g, x).reach);
    if (reach.length > 0) return refs(reach);
  } else {
    const taunts = targetableTaunts(g, opp);
    const atk = effectiveAttack(g, m);
    const skulk = flags.skulk === true && taunts.every((x) => effectiveAttack(g, x) > atk);
    if (taunts.length > 0 && !skulk) return refs(taunts);
  }
  return [playerRef(opp), ...refs(monsters)];
}

/**
 * 後援（MTG 要素 △ バッチB）：このモンスターの攻撃で休ませられる自分の他のモンスター（今攻撃できるもの）。後援が無ければ空
 */
export function enlistOptions(g: GameState, m: Monster): Monster[] {
  if (m.sealed || !keywordFlags(g, m).enlist) return [];
  return g.players[m.controller].board.filter((x) => x.uid !== m.uid && attackBlockReason(g, x) === null);
}

/** 攻撃を1回行う（手動・自動共通）。enlistUid は後援で休ませるモンスター（手動の攻撃だけ） */
export function performAttack(g: GameState, m: Monster, target: TargetRef, depth: number, note = '', enlistUid?: string): void {
  // 後援（MTG 要素 △ バッチB）：攻撃の前に休ませ、その攻撃力をこの1回の攻撃に足す（反撃には足さない）
  const helper = enlistUid !== undefined ? enlistOptions(g, m).find((x) => x.uid === enlistUid) : undefined;
  let enlistBonus = 0;
  if (helper) {
    enlistBonus = effectiveAttack(g, helper);
    helper.attacksUsed = Math.max(helper.attacksUsed, attacksPerTurn(g, helper));
    log(g, depth, `後援：${monsterLabel(g, helper)}が休み、攻撃力+${enlistBonus}`, 'info', undefined, { kind: 'status', target: { kind: 'monster', uid: helper.uid }, status: 'enlist', amount: enlistBonus });
  }
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
  // 攻撃された側のプレイヤー（「相手のモンスターが攻撃するたび」。MTG 要素 △ バッチA）。守備側のモンスターが倒れる前に決める
  const defendingPlayer: PlayerId | undefined = target.kind === 'player' ? target.player : findMonster(g, target.uid)?.controller;
  // MTG 要素 ○ バッチB：攻撃する前のキーワード（威圧・一撃離脱・分身）
  const flags = keywordFlags(g, m);
  const doubleTeam = flags.doubleTeam === true && !m.card.token;
  const defender = target.kind === 'monster' ? findMonster(g, target.uid) : undefined;
  // この1回の攻撃の記録のキー：出血・反撃（状態）は攻撃と「攻撃するたび」の効果を合わせて1回（決定事項 #70 R4）
  const playKey = newUid(g, 'pk');
  // モンスターの反撃（決定事項 #69）：攻撃される前の守備側の攻撃力（一時強化・武士道を含む）・弱体・接死・絆魂で決まる（同時に解決する扱い）
  const retaliationAmount = defender ? effectiveAttack(g, defender) + combatBonus(g, defender) : 0;
  // 容疑（MTG 要素 △ バッチA）・解鎖（△ バッチB）のモンスターは反撃しない
  const retaliation =
    defender && BALANCE.battle.retaliation.enabled && retaliationAmount > 0 && !defender.suspected && !defender.unleashed
      ? { amount: retaliationAmount, weak: defender.status.weak > 0, label: monsterLabel(g, defender), source: combatSourceOf(g, defender) }
      : null;
  /** 先制攻撃：攻撃で相手モンスターを倒したら反撃を受けない */
  const firstStrike = keywordFlags(g, m).firstStrike === true;
  // 武士道：モンスターと戦うときだけ攻撃力に足す。猛襲：相手プレイヤーを攻撃するときだけ足す
  const enemy = other(m.controller);
  const toEnemyPlayer = target.kind === 'player' && target.player === enemy;
  const amount = effectiveAttack(g, m) + (defender ? combatBonus(g, m) : toEnemyPlayer ? playerBonus(g, m) : 0) + enlistBonus;
  const r = dealDamage(g, target, amount, { kind: 'attack', source: attackerRef, playKey, depth: depth + 1 });
  if (isEnded(g)) return;
  /** 相手プレイヤーのHPを減らしたか（「相手プレイヤーにダメージを与えたとき」。裏切り・混乱で自分を殴ったときは数えない） */
  let hitEnemy = target.kind === 'player' && target.player === enemy && r.hpLost > 0;
  // 王冠（MTG 要素 ○ バッチC2）：王冠を持つプレイヤーのHPを相手のモンスターの攻撃が減らしたら、王冠はそのモンスターの持ち主へ
  if (target.kind === 'player' && r.hpLost > 0) crownByAttack(g, m.controller, target.player, depth + 1);
  // 貫通：モンスターを倒して余ったダメージは、そのモンスターの持ち主のプレイヤーへ
  if (defender && r.destroyed && r.overflow > 0 && findMonster(g, m.uid) && keywordFlags(g, m).trample) {
    log(g, depth + 1, `貫通：余った${r.overflow}ダメージが${g.players[defender.controller].name}に通る`);
    const t = dealDamage(g, playerRef(defender.controller), r.overflow, { kind: 'trample', source: attackerRef, depth: depth + 2 });
    if (defender.controller === enemy && t.hpLost > 0) hitEnemy = true;
    if (t.hpLost > 0) crownByAttack(g, m.controller, defender.controller, depth + 2);
    if (isEnded(g)) return;
  }
  // 反撃：守備側が倒れていても、封印・凍結・隠密でも返す。守備側の「攻撃するたび」は発動しない。
  // 先制攻撃のモンスターが相手を倒したときは反撃を受けない
  if (retaliation && defender && flags.noRetaliation) {
    log(g, depth + 1, `威圧：${retaliation.label}の反撃を受けない`);
  } else if (retaliation && defender && m.suspected) {
    log(g, depth + 1, `容疑：${retaliation.label}の反撃を受けない`);
  } else if (retaliation && defender && firstStrike && r.destroyed) {
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
  // 分身（MTG 要素 ○ バッチB）：初めて攻撃したとき、分身を失ったこのカードのコピーを今の持ち主の手札に。元のカードも分身を失う
  if (doubleTeam) {
    const lost = [...(m.card.lostKeywords ?? []), 'doubleTeam'];
    m.card.lostKeywords = lost;
    // 永久強化（MTG 要素 △ バッチA）もコピーに写す
    const copy = {
      uid: newUid(g, 'c'),
      cardId: m.card.cardId,
      owner: m.card.owner,
      copy: 'keep' as const,
      lostKeywords: ['doubleTeam'],
      ...(m.card.perm ? { perm: { ...m.card.perm } } : {}),
    };
    g.players[m.controller].hand.push(copy);
    log(g, depth + 1, `分身：「${cardName(g, m.card.cardId)}」のコピー（分身なし）を${g.players[m.controller].name}の手札に加えた`);
  }
  // 相手のモンスターが攻撃するたび（MTG 要素 △ バッチA）：攻撃された側（攻撃したモンスターの持ち主でない側）のパワー → モンスター
  if (defendingPlayer !== undefined && defendingPlayer !== m.controller) enqueueEnemyAttacked(g, defendingPlayer, m.uid, depth + 1);
  // 一撃離脱：攻撃に関わる処理がすべて終わったあと、場に残っていれば手札に戻る
  if (flags.returnAfterAttack && !m.card.token) enqueue(g, { t: 'returnToHand', uid: m.uid, depth: depth + 1 });
}

/** 王冠を持つ victim が、attacker 側のモンスターの攻撃（貫通の余りを含む）で HP を減らされたら、王冠は attacker へ */
function crownByAttack(g: GameState, attacker: PlayerId, victim: PlayerId, depth: number): void {
  if (g.crown === victim && attacker !== victim && !isEnded(g)) setCrown(g, attacker, depth, 'steal');
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
