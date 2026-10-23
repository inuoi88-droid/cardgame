/**
 * 対戦の肖像とメダルの形（UI2「黒鉄と金の卓」。決定事項 #112）。どれも src/ui/icons/uiIcons.json に同梱した game-icons。
 * - CPU の強さ：形が変わる（よわい goblin-head・ふつう robot-golem・つよい crowned-skull）＋菱形の数（1〜3）
 * - プリセットのデッキ（CPU の相手のメダル）：毒 poison-bottle・獣 wolf-head・呪い cursed-star・砦 stone-tower・歯車 gears、ランダムはさいころ
 * - あなた visored-helm、オンラインの相手 closed-barbute
 */
import type { ai } from '../../engine/index.ts';

export const CPU_PORTRAIT: Record<ai.CpuLevel, string> = { easy: 'goblin-head', normal: 'robot-golem', hard: 'crowned-skull' };
export const CPU_PIPS: Record<ai.CpuLevel, number> = { easy: 1, normal: 2, hard: 3 };
export const PRESET_GI: Record<string, string> = {
  poison: 'poison-bottle',
  beasts: 'wolf-head',
  curses: 'cursed-star',
  fortress: 'stone-tower',
  clockwork: 'gears',
};
export const RANDOM_GI = 'perspective-dice-six-faces-random';
export const ME_PORTRAIT = 'visored-helm';
export const ONLINE_OPP_PORTRAIT = 'closed-barbute';

/** プリセットのメダルの形（知らない id はさいころ） */
export const presetGi = (id: string): string => PRESET_GI[id] ?? RANDOM_GI;
