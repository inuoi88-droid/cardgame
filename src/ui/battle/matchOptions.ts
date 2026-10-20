/**
 * 対戦のオプション（MTG 要素 △ バッチD：リーダー・次元・昼と夜）の選択肢と表示用の文。
 * 選択肢はエンジンの一覧（LEADERS・FIELDS・PLANAR_*）から作る（ID を書かない）。
 */
import { BALANCE, FIELDS, LEADER_IDS, LEADERS, PLANAR_DESCRIPTION, PLANAR_LABEL, PLANAR_MODES, battle, type LeaderId, type MatchRules, type PlanarMode } from '../../engine/index.ts';
import type { PickOption } from '../editor/OptionPicker.tsx';

/** 準備画面で「おまかせ」（対戦の開始時にランダム） */
export const RANDOM_LEADER = 'random';
export type LeaderChoice = LeaderId | typeof RANDOM_LEADER;

export function isLeaderChoice(x: unknown): x is LeaderChoice {
  return x === RANDOM_LEADER || (typeof x === 'string' && (LEADER_IDS as readonly string[]).includes(x));
}

/** リーダーの選択肢（OptionPicker 用）。allowRandom なら「おまかせ」を先頭に */
export function leaderOptions(allowRandom = false): PickOption[] {
  const list: PickOption[] = LEADER_IDS.map((id) => ({
    id,
    label: id === 'none' ? 'なし' : `${LEADERS[id].icon} ${LEADERS[id].name}`,
    description: LEADERS[id].description,
    ...(id === 'none' ? { pinned: true } : {}),
  }));
  if (allowRandom) list.unshift({ id: RANDOM_LEADER, label: '🎲 おまかせ', description: '対戦の開始時に、なし以外からランダムに決める', pinned: true });
  return list;
}

/** 「おまかせ」を決める（UI だけの乱数。エンジンには決まったリーダーを渡す） */
export function resolveLeader(choice: LeaderChoice | undefined, random: () => number = Math.random): LeaderId {
  if (choice === undefined) return 'none';
  if (choice !== RANDOM_LEADER) return choice;
  const pool = LEADER_IDS.filter((id) => id !== 'none');
  return pool[Math.floor(random() * pool.length)] ?? 'none';
}

export const PLANAR_CHOICES: { id: PlanarMode; label: string; description: string }[] = PLANAR_MODES.map((id) => ({
  id,
  label: PLANAR_LABEL[id],
  description: PLANAR_DESCRIPTION[id],
}));

/** 準備画面・ロビーで選んだルールを、エンジンに渡す形にする（何も無ければ undefined） */
export function toRules(field: PlanarMode, dayNight: boolean): MatchRules | undefined {
  const out: MatchRules = {};
  if (field !== 'off') out.field = field;
  if (dayNight) out.dayNight = true;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** ルールの1行の説明（ロビー・結果などに出す） */
export function rulesSummary(rules: MatchRules | undefined): string {
  const parts = [rules?.field && rules.field !== 'off' ? `次元：${PLANAR_LABEL[rules.field]}` : '', rules?.dayNight ? '昼と夜あり' : ''].filter(Boolean);
  return parts.length > 0 ? parts.join('・') : '基本ルール';
}

/** 対戦画面のフィールドの帯の文（無ければ null）。次元が移り変わるなら次の切り替えまでのターン */
export function fieldBand(g: battle.GameState): { icon: string; name: string; description: string; note: string } | null {
  if (!g.field) return null;
  const f = FIELDS[g.field.id];
  if (!f) return null;
  const next = battle.nextPlanarTurn(g);
  const who = g.field.by === null ? '次元' : `${g.players[g.field.by]?.name ?? ''}が置いた`;
  const note = next === null ? who : `${who}・あと${Math.max(0, next - g.turnIndex)}ターンで移り変わる`;
  return { icon: f.icon, name: f.name, description: f.description, note };
}

/** 昼と夜の表示（まだ始まっていなければ null） */
export function dayNightBand(g: battle.GameState): { icon: string; name: string; description: string } | null {
  if (!g.dayNight) return null;
  const D = BALANCE.dayNight;
  const day = g.dayNight === 'day';
  return {
    icon: day ? '☀' : '🌙',
    name: day ? '昼' : '夜',
    description: day
      ? `今は昼。「昼なら」の効果が働く。手番の人がこのターンにカードを${D.toNight === 0 ? '1枚も使わない' : `${D.toNight}枚以下しか使わない`}と、ターンの終わりに夜になる`
      : `今は夜。「夜なら」の効果が働く。手番の人がこのターンにカードを${D.toDay}枚以上使うと、ターンの終わりに昼になる`,
  };
}
