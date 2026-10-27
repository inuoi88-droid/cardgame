/**
 * 種族の特性・揃いの出来事（決定事項 #143）。数値は BALANCE.tribes、名前と説明は engine/tribes.ts。
 * 揃いの攻撃力・守備力（群れ・連結）・耐性（竜鱗・鋼の体）・霊体は core.ts、怨嗟は damage.ts の destroyMonster、共鳴は turn.ts のドロー、
 * 研鑽は runtime.ts の growBonus にある。ここは攻撃のあと（狩猟本能・腐食）とターン開始時（竜の息・隊列）
 */
import { BALANCE } from '../balance.ts';
import { TRIBE_SETS, TRIBE_TRAITS } from '../tribes.ts';
import { TRIBE_LABEL, type TribeId } from '../types.ts';
import { findMonster, isEnded, log, monsterLabel, other, playerRef, traitTribe, tribeSetActive } from './core.ts';
import { addStatus, dealDamage, heal } from './damage.ts';
import type { GameState, Monster, PlayerId } from './types.ts';

const T = BALANCE.tribes;

/** 攻撃の前に調べておく、攻撃した側・守った側の特性（守った側は攻撃で倒れることがある） */
export interface CombatTribes {
  attacker: TribeId | undefined;
  defender: TribeId | undefined;
}

export function combatTribes(g: GameState, attacker: Monster, defender: Monster | undefined): CombatTribes {
  return { attacker: traitTribe(g, attacker), defender: defender ? traitTribe(g, defender) : undefined };
}

/**
 * 1回の攻撃のあと：腐食（不死が攻撃・反撃でダメージを与えた相手のモンスターに毒）と狩猟本能（獣が攻撃で相手のモンスターを倒したら攻撃力+）。
 * hit は攻撃で守った側の体力を減らしたか、struck は反撃で攻撃した側の体力を減らしたか、killed は攻撃で守った側を倒したか
 */
export function afterAttack(
  g: GameState,
  attackerUid: string,
  defenderUid: string | undefined,
  tribes: CombatTribes,
  r: { hit: boolean; struck: boolean; killed: boolean },
  depth: number,
): void {
  if (isEnded(g)) return;
  const attacker = findMonster(g, attackerUid);
  const defender = defenderUid !== undefined ? findMonster(g, defenderUid) : undefined;
  if (tribes.attacker === 'undead' && r.hit && defender) rot(g, defender, depth);
  if (tribes.defender === 'undead' && r.struck && attacker) rot(g, attacker, depth);
  if (tribes.attacker === 'beast' && r.killed && attacker) hunt(g, attacker, depth);
}

function rot(g: GameState, victim: Monster, depth: number): void {
  if (isEnded(g)) return;
  const target = { kind: 'monster' as const, uid: victim.uid };
  log(g, depth, `${TRIBE_TRAITS.undead.name}：${monsterLabel(g, victim)}に毒がまわる`, 'effect', undefined, { kind: 'tribe', tribe: 'undead', status: 'trait', target });
  addStatus(g, target, 'poison', T.undead.trait.poisonOnHit, depth + 1);
}

function hunt(g: GameState, m: Monster, depth: number): void {
  const got = m.counters.hunt ?? 0;
  const gain = Math.max(0, Math.min(T.beast.trait.attackPerKill, T.beast.trait.maxBonus - got));
  if (gain <= 0) return;
  m.counters.hunt = got + gain;
  const before = m.attack;
  m.attack += gain;
  log(g, depth, `${TRIBE_TRAITS.beast.name}：${monsterLabel(g, m)}の攻撃力 ${before}→${m.attack}`, 'effect', undefined, {
    kind: 'stat',
    tribe: 'beast',
    target: { kind: 'monster', uid: m.uid },
    delta: { attack: gain },
  });
}

/** ターン開始時（再生・聖域のあと）：隊列（自分のHPが回復）と竜の息（相手プレイヤーにダメージ） */
export function tribeTurnStart(g: GameState, p: PlayerId): void {
  const ps = g.players[p];
  if (tribeSetActive(g, p, 'human') && ps.hp < ps.maxHp) {
    log(g, 1, `${TRIBE_SETS.human.name}：${ps.name}の${TRIBE_LABEL.human}が揃っている`, 'effect', undefined, { kind: 'tribe', tribe: 'human', status: 'set', player: p });
    heal(g, playerRef(p), T.human.set.heal, 2, { tribe: 'human' });
  }
  if (tribeSetActive(g, p, 'dragon')) {
    log(g, 1, `${TRIBE_SETS.dragon.name}：${ps.name}の${TRIBE_LABEL.dragon}が揃っている`, 'effect', undefined, { kind: 'tribe', tribe: 'dragon', status: 'set', player: p });
    dealDamage(g, playerRef(other(p)), T.dragon.set.breath, { kind: 'hit', source: playerRef(p), depth: 2 });
  }
}

/** 共鳴：ターン開始時に多く引く枚数（ログも書く） */
export function spiritExtraDraw(g: GameState, p: PlayerId): number {
  if (!tribeSetActive(g, p, 'spirit')) return 0;
  const n = T.spirit.set.draw;
  log(g, 1, `${TRIBE_SETS.spirit.name}：${g.players[p].name}の${TRIBE_LABEL.spirit}が揃っているので${n}枚多く引く`, 'effect', undefined, {
    kind: 'tribe',
    tribe: 'spirit',
    status: 'set',
    player: p,
  });
  return n;
}
