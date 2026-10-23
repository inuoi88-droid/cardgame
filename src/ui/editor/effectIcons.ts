/**
 * エディターの効果・デメリット・能力・キーワードの印（UI2「黒鉄と金の卓」。決定事項 #111 の (C)）。
 * 絵文字の代わりに game-icons.net の形を単色で描く（editor/EffectIcon.tsx）。
 *
 * - 見出し（グループ）の形は src/ui/icons/uiIcons.json に同梱（同期で描ける）。効果ごとの形は必要なときに読み、
 *   読めるまでは見出しの形を出す（チラつかない・オフラインでも何か出る）。
 * - 効果を足したら EFFECT_ICON に1行足す（足さなくても見出しの形が出る。tests/editorIcons.test.ts が網羅と名前の実在を確かめる）。
 * - エンジン（defs/effects）には入れない：絵は画面の都合なので UI 側に置く。
 */
import type { EffectGroup } from '../../engine/index.ts';

/** 効果の見出しの形（同梱） */
export const GROUP_GI: Record<EffectGroup, string> = {
  damage: 'explosion-rays',
  defense: 'healing',
  status: 'bubbling-flask',
  buff: 'biceps',
  resource: 'card-exchange',
  disrupt: 'manacles',
  special: 'cut-diamond',
};

/** デメリット・カードの能力・キーワードの形（同梱） */
export const DRAWBACK_GI = 'imp-laugh';
export const ABILITY_GI = 'rune-stone';
export const KEYWORD_GI = 'rune-sword';

/** 効果ごとの形（同梱していないものは必要なときに読む） */
export const EFFECT_ICON: Record<string, string> = {
  // ダメージ系
  damage: 'explosion-rays',
  counter: 'riposte',
  execute: 'guillotine',
  fight: 'fist',
  multiHit: 'sword-spin',
  // 防御・回復系
  cleanse: 'water-splash',
  guard: 'guarded-tower',
  heal: 'healing',
  nullify: 'cancel',
  repair: 'auto-repair',
  shield: 'energy-shield',
  // 状態異常
  bleed: 'bleeding-wound',
  burn: 'flame',
  confuse: 'spiral-arrow',
  doom: 'grim-reaper',
  double: 'twin-shell',
  freeze: 'frozen-orb',
  poison: 'poison-bottle',
  proliferate: 'virus',
  rad: 'radioactive',
  seal: 'padlock',
  vulnerable: 'broken-shield',
  weak: 'broken-bone',
  // 強化系
  amass: 'dark-squad',
  attackUp: 'sword-brandish',
  backup: 'shaking-hands',
  boon: 'angel-outfit',
  defenseUp: 'shield-reflect',
  equip: 'armor-vest',
  explore: 'compass',
  focus: 'meditation',
  grantKeyword: 'scroll-quill',
  incubate: 'egg-clutch',
  offspring: 'sprout',
  perpetual: 'infinity',
  populate: 'family-tree',
  pump: 'muscle-up',
  ready: 'clockwise-rotation',
  regen: 'regeneration',
  setField: 'mountains',
  startEngine: 'clockwork',
  strength: 'biceps',
  token: 'chess-pawn',
  train: 'weight-lifting-up',
  // リソース系
  advanceSaga: 'open-book',
  bank: 'piggy-bank',
  bounty: 'wanted-reward',
  conjure: 'magic-hat',
  crown: 'crown',
  discount: 'price-tag',
  discover: 'light-bulb',
  draw: 'card-draw',
  energy: 'crystal-growth',
  gainExp: 'stars-stack',
  harness: 'power-generator',
  loot: 'card-exchange',
  manifest: 'crystal-ball',
  mill: 'card-burn',
  prepare: 'checklist',
  purge: 'burning-book',
  recall: 'return-arrow',
  recruit: 'flying-flag',
  retain: 'locked-chest',
  savings: 'coins',
  scry: 'eye-target',
  search: 'spyglass',
  seek: 'card-pickup',
  siege: 'castle',
  // レアリティ限定
  borrow: 'grab',
  cascade: 'waterfall',
  cloneToken: 'mirror-mirror',
  duplicate: 'gemini',
  extraTurn: 'backward-time',
  heist: 'robber',
  infight: 'sword-clash',
  ramp: 'battery-plus',
  revive: 'angel-wings',
  steal: 'snatch',
  swapHp: 'swap-bag',
  wipe: 'mushroom-cloud',
  // 妨害系
  bounce: 'shield-bounces',
  dispel: 'magic-broom',
  drawJam: 'interdiction',
  energyJam: 'lightning-dissipation',
  exileMill: 'vortex',
  fateseal: 'eye-shield',
  finality: 'tombstone',
  iceLock: 'ice-cube',
  noise: 'card-joker',
  quash: 'crossed-chains',
  slay: 'bowie-knife',
  suspect: 'hood',
  weaken: 'broken-axe',
  wither: 'dead-wood',
};

/** 効果の形の名前（無ければ見出しの形） */
export function effectGi(id: string, group: EffectGroup | undefined): string {
  return EFFECT_ICON[id] ?? (group ? GROUP_GI[group] : GROUP_GI.special);
}
