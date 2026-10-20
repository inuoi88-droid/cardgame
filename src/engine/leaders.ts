/**
 * リーダー（MTG 要素 △ バッチD：#15 ヴァンガードのアレンジ）。対戦の開始時に選ぶ小さな常時の効果。
 * カードのポイントとは関係ない（デッキの外）。数値は balance.ts の leaders、効果の処理は battle/rules.ts の ruleHooks。
 */
import { BALANCE } from './balance.ts';

const L = BALANCE.leaders;

export const LEADER_IDS = ['none', 'knight', 'mage', 'summoner', 'alchemist', 'scholar'] as const;
export type LeaderId = (typeof LEADER_IDS)[number];

export interface LeaderInfo {
  id: LeaderId;
  name: string;
  icon: string;
  /** 1行の説明（数字は balance.ts から） */
  description: string;
}

export const LEADERS: Record<LeaderId, LeaderInfo> = {
  none: { id: 'none', name: 'なし', icon: '・', description: 'リーダーの効果なし' },
  knight: { id: 'knight', name: '騎士', icon: '🏇', description: `最大HPとHPが+${L.knight.hp}` },
  mage: { id: 'mage', name: '魔術師', icon: '🧙', description: `最初の手札が${L.mage.firstHand}枚多い（配るときだけ）` },
  summoner: { id: 'summoner', name: '召喚士', icon: '📯', description: `自分のモンスターが場に出るたび、そのモンスターの体力と最大体力+${L.summoner.hp}（トークンも）` },
  alchemist: {
    id: 'alchemist',
    name: '錬金術師',
    icon: '⚗',
    description: `自分の${L.alchemist.everyTurns}・${L.alchemist.everyTurns * 2}・${L.alchemist.everyTurns * 3}…ターン目の開始時にエナジー+${L.alchemist.energy}`,
  },
  scholar: {
    id: 'scholar',
    name: '賢者',
    icon: '📜',
    description: `自分の${L.scholar.everyTurns}・${L.scholar.everyTurns * 2}・${L.scholar.everyTurns * 3}…ターン目に${L.scholar.draw}枚多く引く（1ターンに引ける上限に数える）`,
  },
};

export function isLeaderId(x: unknown): x is LeaderId {
  return typeof x === 'string' && (LEADER_IDS as readonly string[]).includes(x);
}

/** 知らない値・無いものは 'none' */
export function toLeaderId(x: unknown): LeaderId {
  return isLeaderId(x) ? x : 'none';
}
