/**
 * 演出の台帳（VFX レジストリ。決定事項 #126）。効果・キーワード・デメリット・カードの能力・状態の ID ごとに、
 * 軽い演出の型（arch）・属性の色（el）・形（gi：game-icons の名前）を1行で決める。
 *
 * - 効果を足したら EFFECT_FX にも1行（tests/battle/fx.test.ts が登録の網羅と形の実在を確かめる）。足さなくても型 'rune' で何か出る。
 * - 形は、エディターの印（editor/effectIcons.ts の EFFECT_ICON）・用語の印（glossary の gi）と同じ意味の形を使う（1つの形＝1つの意味）。
 *   同梱していない形は対戦の始めに先読みする（fxPreload）。読めるまでは型の形（ARCH_GI。同梱）を出す。
 * - エンジン（defs/）には入れない：見た目は画面の都合なので UI 側に置く。
 */
import type { CardDef } from '../../../engine/index.ts';
import { EFFECT_ICON } from '../../editor/effectIcons.ts';
import { UI_ICON_PATHS } from '../../icons/generated/uiIcons.ts';
import { KEYWORD_GI, glossary, mechanicGlossary, type StatusId } from '../../glossary.ts';

/**
 * 演出の型：
 * bolt 弾が飛んで当たる（ダメージ・状態異常を与える。対象が2つ以上なら1回の掃き）／ heal 立ちのぼる光／ ward 守りの輪／
 * buff 上向きの山形／ debuff 下向きの山形／ bind 鎖と錠（封じる）／ summon 召喚の円陣／ shatter 砕ける（破壊）／
 * draw 山札→手札／ discard 手札・山札→捨て札／ energy エナジーの脈動／ tint 盤面の色（フィールド）／ move 移る（手札・相手の場へ）／
 * rune 形が光るだけ（そのほか）
 */
export type FxArch = 'bolt' | 'heal' | 'ward' | 'buff' | 'debuff' | 'bind' | 'summon' | 'shatter' | 'draw' | 'discard' | 'energy' | 'tint' | 'move' | 'rune';

/** 属性（色）。auto は使ったカードの絵・名前から決める（ダメージ・連撃。element.ts） */
export type FxElement = 'fire' | 'poison' | 'ice' | 'holy' | 'shadow' | 'blood' | 'arcane' | 'physical';

export interface FxSpec {
  arch: FxArch;
  el: FxElement | 'auto';
  /** game-icons の名前（"gi:" なし） */
  gi: string;
}

/** 型ごとの形（同梱。個別の形が読めるまでの代わり） */
export const ARCH_GI: Record<FxArch, string> = {
  bolt: 'explosion-rays',
  heal: 'heart-plus',
  ward: 'energy-shield',
  buff: 'upgrade',
  debuff: 'shattered-sword',
  bind: 'padlock',
  summon: 'sparkles',
  shatter: 'skull-crack',
  draw: 'card-draw',
  discard: 'card-discard',
  energy: 'crystal-growth',
  tint: 'sun',
  move: 'return-arrow',
  rune: 'magic-swirl',
};

const e = (arch: FxArch, el: FxSpec['el'], gi: string): FxSpec => ({ arch, el, gi });
/** 効果の形はエディターの印と同じ（無ければ型の形） */
const ef = (id: string, arch: FxArch, el: FxSpec['el']): FxSpec => e(arch, el, EFFECT_ICON[id] ?? ARCH_GI[arch]);

/** 効果（defs/effects）。格闘・同士討ちは攻撃の演出が続くので、見出しは形だけ（rune） */
export const EFFECT_FX: Record<string, FxSpec> = {
  // ダメージ系
  damage: ef('damage', 'bolt', 'auto'),
  multiHit: ef('multiHit', 'bolt', 'auto'),
  execute: ef('execute', 'shatter', 'physical'),
  counter: ef('counter', 'ward', 'physical'),
  fight: ef('fight', 'rune', 'physical'),
  // 防御・回復
  shield: ef('shield', 'ward', 'holy'),
  heal: ef('heal', 'heal', 'holy'),
  nullify: ef('nullify', 'ward', 'arcane'),
  cleanse: ef('cleanse', 'heal', 'holy'),
  repair: ef('repair', 'heal', 'physical'),
  guard: ef('guard', 'ward', 'holy'),
  regen: ef('regen', 'heal', 'holy'),
  // 状態異常
  poison: ef('poison', 'bolt', 'poison'),
  burn: ef('burn', 'bolt', 'fire'),
  freeze: ef('freeze', 'bind', 'ice'),
  weak: ef('weak', 'debuff', 'shadow'),
  vulnerable: ef('vulnerable', 'debuff', 'blood'),
  bleed: ef('bleed', 'debuff', 'blood'),
  seal: ef('seal', 'bind', 'arcane'),
  confuse: ef('confuse', 'debuff', 'arcane'),
  double: ef('double', 'debuff', 'poison'),
  proliferate: ef('proliferate', 'debuff', 'poison'),
  doom: ef('doom', 'bind', 'shadow'),
  rad: ef('rad', 'bolt', 'poison'),
  // 強化
  strength: ef('strength', 'buff', 'blood'),
  focus: ef('focus', 'buff', 'arcane'),
  boon: ef('boon', 'buff', 'holy'),
  attackUp: ef('attackUp', 'buff', 'physical'),
  equip: ef('equip', 'buff', 'physical'),
  defenseUp: ef('defenseUp', 'buff', 'physical'),
  token: ef('token', 'summon', 'physical'),
  offspring: ef('offspring', 'summon', 'holy'),
  populate: ef('populate', 'summon', 'holy'),
  amass: ef('amass', 'summon', 'physical'),
  train: ef('train', 'buff', 'physical'),
  explore: ef('explore', 'draw', 'physical'),
  grantKeyword: ef('grantKeyword', 'buff', 'holy'),
  startEngine: ef('startEngine', 'buff', 'fire'),
  ready: ef('ready', 'buff', 'physical'),
  pump: ef('pump', 'buff', 'physical'),
  backup: ef('backup', 'buff', 'holy'),
  perpetual: ef('perpetual', 'buff', 'arcane'),
  incubate: ef('incubate', 'summon', 'holy'),
  // リソース
  draw: ef('draw', 'draw', 'arcane'),
  prepare: ef('prepare', 'rune', 'arcane'),
  energy: ef('energy', 'energy', 'arcane'),
  harness: ef('harness', 'energy', 'physical'),
  savings: ef('savings', 'energy', 'holy'),
  bank: ef('bank', 'energy', 'holy'),
  discount: ef('discount', 'energy', 'arcane'),
  bounty: ef('bounty', 'debuff', 'physical'),
  search: ef('search', 'draw', 'arcane'),
  seek: ef('seek', 'draw', 'arcane'),
  recall: ef('recall', 'draw', 'shadow'),
  retain: ef('retain', 'rune', 'arcane'),
  scry: ef('scry', 'rune', 'arcane'),
  mill: ef('mill', 'discard', 'arcane'),
  discover: ef('discover', 'draw', 'arcane'),
  loot: ef('loot', 'draw', 'arcane'),
  crown: ef('crown', 'buff', 'holy'),
  recruit: ef('recruit', 'summon', 'physical'),
  purge: ef('purge', 'discard', 'fire'),
  conjure: ef('conjure', 'draw', 'arcane'),
  advanceSaga: ef('advanceSaga', 'rune', 'arcane'),
  gainExp: ef('gainExp', 'buff', 'holy'),
  manifest: ef('manifest', 'summon', 'arcane'),
  siege: ef('siege', 'summon', 'physical'),
  setField: ef('setField', 'tint', 'arcane'),
  // 妨害
  drawJam: ef('drawJam', 'bind', 'shadow'),
  energyJam: ef('energyJam', 'bind', 'shadow'),
  noise: ef('noise', 'discard', 'shadow'),
  bounce: ef('bounce', 'move', 'arcane'),
  slay: ef('slay', 'shatter', 'physical'),
  weaken: ef('weaken', 'debuff', 'shadow'),
  dispel: ef('dispel', 'debuff', 'arcane'),
  wither: ef('wither', 'debuff', 'shadow'),
  quash: ef('quash', 'bind', 'arcane'),
  finality: ef('finality', 'bind', 'shadow'),
  iceLock: ef('iceLock', 'bind', 'ice'),
  suspect: ef('suspect', 'debuff', 'shadow'),
  fateseal: ef('fateseal', 'rune', 'shadow'),
  exileMill: ef('exileMill', 'discard', 'shadow'),
  // レアリティ限定
  revive: ef('revive', 'summon', 'holy'),
  duplicate: ef('duplicate', 'draw', 'arcane'),
  cascade: ef('cascade', 'rune', 'arcane'),
  cloneToken: ef('cloneToken', 'summon', 'arcane'),
  wipe: ef('wipe', 'shatter', 'fire'),
  infight: ef('infight', 'rune', 'blood'),
  steal: ef('steal', 'move', 'shadow'),
  borrow: ef('borrow', 'move', 'shadow'),
  ramp: ef('ramp', 'energy', 'arcane'),
  extraTurn: ef('extraTurn', 'rune', 'arcane'),
  swapHp: ef('swapHp', 'rune', 'blood'),
  heist: ef('heist', 'move', 'shadow'),
};

/** キーワード（defs/keywords）。形は用語の印（KEYWORD_GI）と同じ */
const kw = (id: string, arch: FxArch, el: FxElement): FxSpec => e(arch, el, KEYWORD_GI[id] ?? ARCH_GI[arch]);
export const KEYWORD_FX: Record<string, FxSpec> = {
  haste: kw('haste', 'buff', 'physical'),
  taunt: kw('taunt', 'ward', 'physical'),
  flying: kw('flying', 'buff', 'arcane'),
  trample: kw('trample', 'bolt', 'physical'),
  doubleAttack: kw('doubleAttack', 'buff', 'physical'),
  stealth: kw('stealth', 'ward', 'shadow'),
  undying: kw('undying', 'ward', 'holy'),
  selfRepair: kw('selfRepair', 'heal', 'physical'),
  deathtouch: kw('deathtouch', 'shatter', 'shadow'),
  firstStrike: kw('firstStrike', 'buff', 'physical'),
  hexproof: kw('hexproof', 'ward', 'arcane'),
  lifelink: kw('lifelink', 'heal', 'blood'),
  bushido: kw('bushido', 'buff', 'physical'),
  divineShield: kw('divineShield', 'ward', 'holy'),
  hitAndRun: kw('hitAndRun', 'move', 'physical'),
  inspire: kw('inspire', 'buff', 'holy'),
  ward: kw('ward', 'ward', 'arcane'),
  onslaught: kw('onslaught', 'buff', 'physical'),
  menace: kw('menace', 'debuff', 'shadow'),
  doubleTeam: kw('doubleTeam', 'draw', 'arcane'),
  reach: kw('reach', 'buff', 'physical'),
  skulk: kw('skulk', 'buff', 'shadow'),
  enlist: kw('enlist', 'buff', 'physical'),
};

/** デメリット（defs/drawbacks）。自分に返ってくるものは血（自傷）・闇 */
export const DRAWBACK_FX: Record<string, FxSpec> = {
  selfDamage: e('bolt', 'blood', 'imp-laugh'),
  selfPoison: e('debuff', 'poison', 'poison-bottle'),
  selfBurn: e('debuff', 'fire', 'flame'),
  discardRandom: e('discard', 'shadow', 'card-discard'),
  recoil: e('bind', 'arcane', 'lightning-dissipation'),
  pollute: e('discard', 'poison', 'card-joker'),
  gift: e('draw', 'holy', 'present'),
  upkeep: e('bolt', 'blood', 'coins'),
  parasite: e('bolt', 'blood', 'worm-mouth'),
  betrayal: e('debuff', 'blood', 'backstab'),
  defender: e('bind', 'physical', 'stone-wall'),
  lifespan: e('shatter', 'arcane', 'sands-of-time'),
  decay: e('shatter', 'shadow', 'worms'),
  exhaust: e('discard', 'shadow', 'burning-book'),
  sacrifice: e('shatter', 'blood', 'sacrificial-dagger'),
  legendary: e('rune', 'holy', 'laurel-crown'),
  exert: e('debuff', 'physical', 'tired-eye'),
  blight: e('debuff', 'shadow', 'dead-wood'),
  exileDiscard: e('discard', 'shadow', 'vortex'),
  cumulativeUpkeep: e('bolt', 'blood', 'coins-pile'),
  dormant: e('bind', 'arcane', 'night-sleep'),
};

/** カードの能力（defs/abilities）。使い方の見出し（使った・起動した・待機ゾーンへ）に添える形 */
export const ABILITY_FX: Record<string, FxSpec> = {
  shuffleBack: e('rune', 'arcane', 'card-random'),
  buyback: e('draw', 'holy', 'return-arrow'),
  rebound: e('rune', 'arcane', 'boomerang'),
  grow: e('buff', 'holy', 'sprout'),
  flashback: e('rune', 'fire', 'burning-book'),
  jumpStart: e('rune', 'arcane', 'jump-across'),
  escape: e('rune', 'shadow', 'exit-door'),
  activate: e('rune', 'arcane', 'bolt-spell-cast'),
  cycling: e('discard', 'arcane', 'cycle'),
  channel: e('rune', 'arcane', 'magic-swirl'),
  affinity: e('energy', 'arcane', 'magnet'),
  costCut: e('energy', 'arcane', 'price-tag'),
  kicker: e('buff', 'physical', 'boot-kick'),
  entwine: e('rune', 'arcane', 'linked-rings'),
  charge: e('energy', 'arcane', 'battery-plus'),
  trap: e('bind', 'physical', 'wolf-trap'),
  spree: e('rune', 'arcane', 'card-pick'),
  tiered: e('rune', 'arcane', 'stairs'),
  cleave: e('rune', 'physical', 'cleaver'),
  strive: e('bolt', 'arcane', 'target-arrows'),
  squad: e('summon', 'physical', 'dark-squad'),
  prototype: e('summon', 'physical', 'gear-hammer'),
  evoke: e('shatter', 'arcane', 'spark-spirit'),
  overload: e('bolt', 'arcane', 'electric'),
  unleash: e('buff', 'blood', 'unlocking'),
  emerge: e('summon', 'blood', 'tentacle-strike'),
  casualty: e('shatter', 'blood', 'sacrificial-dagger'),
  bargain: e('rune', 'shadow', 'gift-trap'),
  devour: e('buff', 'blood', 'carnivore-mouth'),
  convoke: e('energy', 'holy', 'trumpet'),
  delve: e('discard', 'shadow', 'trench-spade'),
  lifePay: e('bolt', 'blood', 'bleeding-heart'),
  pitch: e('discard', 'arcane', 'card-burn'),
  villain: e('rune', 'shadow', 'scales'),
  retrace: e('rune', 'arcane', 'backward-time'),
  harmonize: e('energy', 'holy', 'harp'),
  mayhem: e('rune', 'fire', 'fire-dash'),
  unearth: e('summon', 'shadow', 'raise-zombie'),
  renew: e('rune', 'holy', 'scroll-unfurled'),
  dredge: e('discard', 'shadow', 'spade'),
  embalm: e('summon', 'holy', 'mummy-head'),
  forecast: e('rune', 'arcane', 'crystal-ball'),
  foretell: e('move', 'arcane', 'card-play'),
  plot: e('move', 'arcane', 'scroll-quill'),
  suspend: e('move', 'arcane', 'hourglass'),
  warp: e('move', 'arcane', 'portal'),
  adventure: e('move', 'holy', 'book-cover'),
  disguise: e('summon', 'shadow', 'domino-mask'),
  quest: e('rune', 'holy', 'laurels'),
  evolve: e('buff', 'holy', 'dna1'),
  levelUp: e('buff', 'holy', 'level-three'),
  loyalty: e('rune', 'holy', 'crown-coin'),
  altWin: e('rune', 'holy', 'trophy-cup'),
  emblem: e('rune', 'holy', 'shield-echoes'),
};

/** 状態異常・強化（glossary の状態。形は用語の印と同じ） */
const st = (id: StatusId, arch: FxArch, el: FxElement): FxSpec => e(arch, el, glossary[id].gi ?? ARCH_GI[arch]);
export const STATUS_FX: Record<StatusId, FxSpec> = {
  poison: st('poison', 'debuff', 'poison'),
  doom: st('doom', 'bind', 'shadow'),
  rad: st('rad', 'debuff', 'poison'),
  burn: st('burn', 'debuff', 'fire'),
  weak: st('weak', 'debuff', 'shadow'),
  vulnerable: st('vulnerable', 'debuff', 'blood'),
  bleed: st('bleed', 'debuff', 'blood'),
  freeze: st('freeze', 'bind', 'ice'),
  confuse: st('confuse', 'debuff', 'arcane'),
  seal: st('seal', 'bind', 'arcane'),
  shield: st('shield', 'ward', 'holy'),
  counter: st('counter', 'ward', 'physical'),
  nullify: st('nullify', 'ward', 'arcane'),
  regen: st('regen', 'heal', 'holy'),
  strength: st('strength', 'buff', 'blood'),
  focus: st('focus', 'buff', 'arcane'),
  stealth: st('stealth', 'ward', 'shadow'),
  betrayal: st('betrayal', 'debuff', 'blood'),
  retaliation: st('retaliation', 'bolt', 'physical'),
};

const mg = (id: string, fallback: string) => mechanicGlossary[id]?.gi ?? fallback;

/**
 * ログの出来事の status（kind 'status'・'stat'・'zone' など）ごとの演出と、浮かぶ文字の言葉（label）。
 * エンジンが出す status をすべて載せる（tests/battle/fx.test.ts がエンジンのソースと見比べる）
 */
export const EVENT_STATUS_FX: Record<string, FxSpec & { label: string }> = {
  // 状態（damage.ts の addStatus）
  ...Object.fromEntries(Object.entries(STATUS_FX).map(([k, v]) => [k, { ...v, label: glossary[k as StatusId].name }])),
  // ○ バッチB
  bounty: { ...e('debuff', 'physical', mg('bounty', 'wanted-reward')), label: '懸賞' },
  quash: { ...e('bind', 'arcane', mg('quash', 'cancel')), label: '封殺' },
  boon: { ...e('buff', 'holy', EFFECT_ICON.boon!), label: '恩恵' },
  // △ バッチA
  exp: { ...e('buff', 'holy', EFFECT_ICON.gainExp!), label: '経験' },
  ice: { ...e('bind', 'ice', EFFECT_ICON.iceLock!), label: '氷結' },
  finality: { ...e('bind', 'shadow', mg('finality', 'tombstone')), label: '消滅の印' },
  suspected: { ...e('debuff', 'shadow', mg('suspected', 'spy')), label: '容疑' },
  indestructible: { ...e('ward', 'holy', mg('indestructible', 'diamond-hard')), label: '不壊' },
  protection: { ...e('ward', 'holy', mg('protection', 'angel-wings')), label: '加護' },
  // △ バッチB
  devour: { ...e('buff', 'blood', 'carnivore-mouth'), label: '貪食' },
  enlist: { ...e('buff', 'physical', KEYWORD_GI.enlist!), label: '後援' },
  tapped: { ...e('bind', 'physical', 'night-sleep'), label: '休み' },
  lifePay: { ...e('bolt', 'blood', 'bleeding-heart'), label: '血の支払い' },
  // △ バッチD：リーダー「召喚士」
  summoner: { ...e('buff', 'holy', 'heart-plus'), label: '体力+' },
  divineShield: { ...e('ward', 'holy', KEYWORD_GI.divineShield!), label: '聖盾' },
  // 演出（決定事項 #126）で付けたもの
  discount: { ...e('energy', 'arcane', EFFECT_ICON.discount!), label: 'コスト−' },
  retain: { ...e('rune', 'arcane', EFFECT_ICON.retain!), label: '保持' },
  jam: { ...e('bind', 'shadow', EFFECT_ICON.drawJam!), label: '妨害' },
  nextTurn: { ...e('buff', 'arcane', 'clockwise-rotation'), label: '次のターン' },
  cleanse: { ...e('heal', 'holy', EFFECT_ICON.cleanse!), label: '浄化' },
  dispel: { ...e('debuff', 'arcane', EFFECT_ICON.dispel!), label: '解除' },
  seal: { ...e('bind', 'arcane', 'padlock'), label: '封印' },
  temp: { ...e('buff', 'physical', mg('tempAttack', 'upgrade')), label: 'このターン' },
  ready: { ...e('buff', 'physical', EFFECT_ICON.ready!), label: '再行動' },
  exhaust: { ...e('bind', 'physical', EFFECT_ICON.harness!), label: '動力化' },
  perpetual: { ...e('buff', 'arcane', EFFECT_ICON.perpetual!), label: '永久強化' },
  regenTick: { ...e('heal', 'holy', 'regeneration'), label: '再生' },
  // プレイヤーの出来事（知らせ）
  coin: { ...e('rune', 'arcane', 'coins'), label: 'コイン投げ' },
  clash: { ...e('rune', 'physical', 'sword-clash'), label: '激突' },
  delayed: { ...e('rune', 'arcane', 'hourglass'), label: '予約' },
  drawn: { ...e('draw', 'arcane', 'card-draw'), label: '引いたときの効果' },
  rebound: { ...e('rune', 'arcane', 'boomerang'), label: '反復' },
  trap: { ...e('bind', 'physical', 'wolf-trap'), label: '罠が発動した' },
  enemyAttacked: { ...e('rune', 'arcane', 'magic-swirl'), label: 'パワーが相手の攻撃に反応した' },
  villain: { ...e('rune', 'shadow', 'scales'), label: '最悪の二択' },
  discarded: { ...e('discard', 'shadow', 'card-discard'), label: '捨てられたときの効果' },
  exileMill: { ...e('discard', 'shadow', EFFECT_ICON.exileMill!), label: '山札消滅' },
  pitch: { ...e('discard', 'arcane', 'card-burn'), label: '代替コスト' },
  extraTurn: { ...e('rune', 'arcane', EFFECT_ICON.extraTurn!), label: '追加ターン' },
  swapHp: { ...e('rune', 'blood', EFFECT_ICON.swapHp!), label: 'HP交換' },
  heist: { ...e('move', 'shadow', EFFECT_ICON.heist!), label: '強奪' },
  emblem: { ...e('rune', 'holy', 'shield-echoes'), label: '紋章になった' },
  siegeWon: { ...e('shatter', 'physical', mg('siege', 'castle')), label: '砦を落とした' },
  manifest: { ...e('summon', 'arcane', mg('faceDown', 'domino-mask')), label: '予示' },
  fatigue: { ...e('bolt', 'shadow', 'empty-hourglass'), label: '疲労' },
};

/** 効果・キーワード・デメリット・能力の演出（無ければ rune） */
export function fxOf(kind: 'effect' | 'keyword' | 'drawback' | 'ability', id: string | undefined): FxSpec {
  const table = kind === 'effect' ? EFFECT_FX : kind === 'keyword' ? KEYWORD_FX : kind === 'drawback' ? DRAWBACK_FX : ABILITY_FX;
  return (id && table[id]) || e('rune', 'arcane', ARCH_GI.rune);
}

/** 出来事の status の演出（無ければ null） */
export const statusFx = (status: string | undefined): (FxSpec & { label: string }) | null => (status && EVENT_STATUS_FX[status]) || null;

/** 演出に出てくる形の名前をすべて（先読み・テスト用） */
export function allFxGlyphs(): string[] {
  const out = new Set<string>(Object.values(ARCH_GI));
  for (const t of [EFFECT_FX, KEYWORD_FX, DRAWBACK_FX, ABILITY_FX, STATUS_FX, EVENT_STATUS_FX]) for (const s of Object.values(t)) out.add(s.gi);
  return [...out];
}

/**
 * 対戦の始めに先読みする形（同梱していないものだけ）：見えているカードの効果・キーワード・デメリット・能力と、
 * キーワード（付与で出る）・出来事の知らせの形
 */
export function fxPreload(cards: readonly CardDef[]): string[] {
  const out = new Set<string>([...Object.values(EVENT_STATUS_FX).map((s) => s.gi), ...Object.values(KEYWORD_FX).map((s) => s.gi)]);
  for (const c of cards) {
    for (const x of c.effects) out.add(fxOf('effect', x.id).gi);
    for (const x of c.keywords) out.add(fxOf('keyword', x.id).gi);
    for (const x of c.drawbacks) out.add(fxOf('drawback', x.id).gi);
    for (const x of c.abilities ?? []) out.add(fxOf('ability', x.id).gi);
  }
  return [...out].filter((n) => !Object.prototype.hasOwnProperty.call(UI_ICON_PATHS, n));
}
