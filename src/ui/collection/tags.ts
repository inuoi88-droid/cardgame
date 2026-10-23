/**
 * 仕組みのタグ（シナジーのタグ。決定事項 #109）：カードの効果・キーワード・能力・デメリット・条件・タイミング・オプション・種族から
 * 「毒」「トークン」「捨て札」のようなタグを自動で付ける。手で付けるものではない（保存もしない）。
 *
 * 表は登録 ID → タグの配列。空の配列は「タグにしない」と決めたもの。新しい効果などを足したら、ここにも1行足す
 * （tests/collection.test.ts が、すべての登録 ID が表にあることを確かめる）。
 */
import {
  TRIBE_IDS,
  TRIBE_LABEL,
  type CardAnalysis,
  type CardDef,
  type ConditionId,
  type ModifierId,
  type TargetId,
  type TimingId,
  type TribeId,
} from '../../engine/index.ts';

/** タグの一覧（並びは「仕組みで分けて表示」の節の順。kana は検索用の読み） */
export const MECHANIC_TAGS = [
  { id: 'damage', label: 'ダメージ', kana: 'だめーじ', hint: '直接ダメージ・連撃・貫通' },
  { id: 'removal', label: '除去', kana: 'じょきょ はかい', hint: '破壊・処刑・格闘・バウンス・奪取' },
  { id: 'poison', label: '毒', kana: 'どく', hint: '毒を与える・毒の相手に効く' },
  { id: 'burn', label: 'やけど', kana: 'やけど', hint: 'やけどを与える・やけどの相手に効く' },
  { id: 'status', label: '状態異常', kana: 'じょうたいいじょう', hint: '凍結・弱体・脆弱・出血・封印・混乱など' },
  { id: 'buff', label: '強化', kana: 'きょうか', hint: '筋力・攻撃力アップ・装備・キーワード付与' },
  { id: 'token', label: 'トークン', kana: 'とーくん', hint: 'トークンを出す・増やす' },
  { id: 'swarm', label: '横並び', kana: 'よこならび', hint: 'モンスターをたくさん並べると得をする' },
  { id: 'attack', label: '攻撃・速攻', kana: 'こうげき そっこう', hint: '速攻・飛行・攻撃するたび・相手に当てたとき' },
  { id: 'draw', label: 'ドロー・手札', kana: 'どろー てふだ', hint: 'ドロー・サーチ・占術・手札を増やす' },
  { id: 'energy', label: 'エナジー', kana: 'えなじー', hint: 'エナジーを増やす・コストを下げる' },
  { id: 'heal', label: '回復・シールド', kana: 'かいふく しーるど', hint: '回復・シールド・再生・絆魂' },
  { id: 'defense', label: '守り', kana: 'まもり', hint: '挑発・聖盾・守備力・呪禁・護法' },
  { id: 'power', label: 'パワー', kana: 'ぱわー', hint: 'パワーのカード・パワーと組む' },
  { id: 'curse', label: '呪い・自傷', kana: 'のろい じしょう', hint: '呪いのカード・自分を傷つけるデメリット・HPが少ないと効く' },
  { id: 'discard', label: '捨て札', kana: 'すてふだ', hint: '捨て札から使う・捨て札の枚数で効く・切削' },
  { id: 'waiting', label: '待機ゾーン', kana: 'たいきぞーん', hint: '予顕・計画・待機・ワープ・出来事' },
  { id: 'disrupt', label: '妨害', kana: 'ぼうがい', hint: '相手の山札・手札・エナジーを邪魔する' },
  { id: 'sacrifice', label: '破壊・生け贄', kana: 'はかい いけにえ', hint: '破壊されたとき・生け贄・味方の破壊で得をする' },
  { id: 'chain', label: '連続使用', kana: 'れんぞくしよう', hint: 'カードを使うたび・何枚目以降・続唱' },
  { id: 'extraPay', label: '追加の支払い・モード', kana: 'ついかのしはらい もーど', hint: 'キッカー・双呪・放題・想起など' },
  { id: 'growth', label: '成長・達成', kana: 'せいちょう たっせい', hint: '成長・経験・Lv・忠誠・蓄積・事件' },
  { id: 'board', label: 'フィールド・王冠', kana: 'ふぃーるど おうかん', hint: 'フィールド・昼と夜・王冠・速度' },
  { id: 'luck', label: '運', kana: 'うん', hint: 'コイン投げ・激突・ばらつき' },
  { id: 'tribal', label: '種族シナジー', kana: 'しゅぞく', hint: '同じ種族の仲間で効く' },
] as const;

export type MechanicTagId = (typeof MECHANIC_TAGS)[number]['id'];
/** 種族のタグ（tribe:dragon など。カードの種族そのもの） */
export type TribeTagId = `tribe:${TribeId}`;
export type TagId = MechanicTagId | TribeTagId;

type Map_<K extends string> = Record<K, readonly MechanicTagId[]>;

/** 効果（defs/effects） */
export const EFFECT_TAGS: Record<string, readonly MechanicTagId[]> = {
  damage: ['damage'],
  multiHit: ['damage'],
  execute: ['removal'],
  counter: ['damage', 'defense'],
  fight: ['removal'],
  shield: ['heal'],
  heal: ['heal'],
  nullify: ['defense'],
  cleanse: ['heal'],
  repair: ['heal'],
  poison: ['poison'],
  burn: ['burn'],
  freeze: ['status'],
  weak: ['status'],
  vulnerable: ['status'],
  bleed: ['status'],
  seal: ['status', 'disrupt'],
  confuse: ['status'],
  double: ['poison', 'burn', 'status'],
  proliferate: ['poison', 'burn', 'status'],
  doom: ['status', 'removal'],
  strength: ['buff'],
  focus: ['buff'],
  boon: ['buff'],
  attackUp: ['buff'],
  equip: ['buff'],
  defenseUp: ['defense'],
  regen: ['heal'],
  token: ['token'],
  offspring: ['token'],
  populate: ['token'],
  amass: ['token'],
  train: ['buff', 'growth'],
  explore: ['draw'],
  grantKeyword: ['buff'],
  startEngine: ['board'],
  ready: ['attack'],
  pump: ['buff'],
  draw: ['draw'],
  prepare: ['draw'],
  energy: ['energy'],
  harness: ['energy'],
  savings: ['energy'],
  bank: ['energy'],
  discount: ['energy'],
  bounty: ['removal'],
  search: ['draw'],
  seek: ['draw'],
  recall: ['discard', 'draw'],
  retain: ['draw'],
  scry: ['draw'],
  mill: ['discard'],
  discover: ['draw'],
  loot: ['draw', 'discard'],
  crown: ['board'],
  recruit: ['draw', 'discard'],
  purge: ['discard'],
  conjure: ['draw'],
  drawJam: ['disrupt'],
  energyJam: ['disrupt'],
  noise: ['disrupt'],
  bounce: ['removal'],
  slay: ['removal'],
  weaken: ['disrupt'],
  dispel: ['disrupt'],
  wither: ['removal'],
  quash: ['disrupt'],
  revive: ['discard'],
  duplicate: ['chain'],
  cascade: ['chain'],
  cloneToken: ['token'],
  wipe: ['removal'],
  infight: ['removal'],
  steal: ['removal'],
  borrow: ['disrupt'],
  ramp: ['energy'],
  finality: ['removal'],
  rad: ['status'],
  gainExp: ['growth'],
  iceLock: ['disrupt'],
  advanceSaga: ['power'],
  incubate: ['token'],
  suspect: ['disrupt'],
  guard: ['defense'],
  backup: ['buff'],
  fateseal: ['disrupt'],
  perpetual: ['buff'],
  exileMill: ['disrupt'],
  manifest: ['token'],
  extraTurn: [],
  setField: ['board'],
  swapHp: [],
  heist: ['disrupt'],
  siege: ['disrupt'],
};

/** キーワード（defs/keywords） */
export const KEYWORD_TAGS: Record<string, readonly MechanicTagId[]> = {
  haste: ['attack'],
  taunt: ['defense'],
  flying: ['attack'],
  trample: ['damage', 'attack'],
  doubleAttack: ['attack'],
  stealth: ['attack'],
  undying: ['defense'],
  selfRepair: ['heal'],
  deathtouch: ['removal'],
  firstStrike: ['attack'],
  hexproof: ['defense'],
  lifelink: ['heal'],
  bushido: ['buff'],
  divineShield: ['defense'],
  hitAndRun: ['attack'],
  inspire: ['buff', 'swarm'],
  ward: ['defense'],
  onslaught: ['attack'],
  menace: ['attack'],
  doubleTeam: ['token'],
  reach: ['defense'],
  skulk: ['attack'],
  enlist: ['attack', 'swarm'],
};

/** デメリット（defs/drawbacks） */
export const DRAWBACK_TAGS: Record<string, readonly MechanicTagId[]> = {
  selfDamage: ['curse'],
  selfPoison: ['curse', 'poison'],
  selfBurn: ['curse', 'burn'],
  discardRandom: ['discard'],
  recoil: ['curse'],
  pollute: ['curse'],
  gift: [],
  upkeep: [],
  parasite: ['curse'],
  betrayal: ['curse'],
  defender: [],
  lifespan: [],
  decay: [],
  exhaust: [],
  sacrifice: ['sacrifice'],
  legendary: [],
  exert: [],
  blight: [],
  exileDiscard: ['discard'],
  cumulativeUpkeep: [],
  dormant: [],
};

/** カードの能力（defs/abilities） */
export const ABILITY_TAGS: Record<string, readonly MechanicTagId[]> = {
  shuffleBack: [],
  buyback: ['chain'],
  rebound: ['chain'],
  grow: ['growth'],
  flashback: ['discard'],
  jumpStart: ['discard'],
  escape: ['discard'],
  activate: [],
  cycling: ['discard', 'draw'],
  channel: ['discard'],
  affinity: ['energy'],
  costCut: ['energy'],
  kicker: ['extraPay'],
  entwine: ['extraPay'],
  charge: ['growth', 'power'],
  trap: ['power'],
  spree: ['extraPay'],
  tiered: ['extraPay'],
  cleave: ['extraPay'],
  strive: ['extraPay'],
  squad: ['extraPay', 'token'],
  prototype: ['extraPay'],
  evoke: ['extraPay'],
  overload: ['extraPay'],
  unleash: ['extraPay'],
  emerge: ['sacrifice'],
  casualty: ['sacrifice'],
  bargain: ['sacrifice', 'extraPay'],
  devour: ['sacrifice'],
  convoke: ['energy'],
  delve: ['discard', 'energy'],
  lifePay: ['curse'],
  pitch: ['energy'],
  villain: ['extraPay'],
  retrace: ['discard'],
  harmonize: ['discard'],
  mayhem: ['discard'],
  unearth: ['discard'],
  renew: ['discard'],
  dredge: ['discard', 'draw'],
  embalm: ['discard', 'token'],
  forecast: [],
  foretell: ['waiting'],
  plot: ['waiting'],
  suspend: ['waiting'],
  warp: ['waiting'],
  adventure: ['waiting'],
  disguise: ['extraPay'],
  quest: ['growth'],
  evolve: ['growth'],
  levelUp: ['growth'],
  loyalty: ['growth', 'power'],
  altWin: ['power'],
  emblem: ['power'],
};

/** 効果のオプション */
export const MODIFIER_TAGS: Map_<ModifierId> = {
  pierce: ['damage'],
  drain: ['heal'],
  witherDmg: ['damage'],
  xEnergy: ['energy'],
  perEnemyMonster: [],
  perCardPlayed: ['chain'],
  nextTurn: [],
  perDiscardMonster: ['discard'],
  perTribeAlly: ['tribal'],
  perExp: ['growth'],
  gamble: ['luck'],
};

/** 条件 */
export const CONDITION_TAGS: Map_<ConditionId> = {
  hasMonster: [],
  enemyHpHigher: [],
  enemyPoisoned: ['poison'],
  lowHp: ['curse'],
  smallHand: [],
  enemyPoisonBurn: ['poison', 'burn'],
  nthCard: ['chain'],
  manyMonsters: ['swarm'],
  enemyDamagedThisTurn: ['damage'],
  monsterDestroyedThisTurn: ['sacrifice'],
  allyAttackedThisTurn: ['attack'],
  loneMonster: [],
  twoPowers: ['power'],
  coinFlip: ['luck'],
  secondPlayer: [],
  emptyHand: [],
  bigMonster: ['buff'],
  bigDiscard: ['discard'],
  monsterInHand: [],
  twoSummonsThisTurn: ['swarm'],
  enemyPlayedMany: [],
  veteran: ['attack'],
  strongerAlly: [],
  totalAttack: ['swarm', 'buff'],
  twoAllyAttacks: ['attack'],
  coven: ['swarm'],
  delirium: ['discard'],
  criticalHp: ['curse'],
  bigDamageThisTurn: ['damage'],
  skillsInDiscard: ['discard'],
  healedThisTurn: ['heal'],
  enemyPoisonHigh: ['poison'],
  notFirstCard: ['chain'],
  clash: ['luck'],
  exploit: ['sacrifice'],
  kicked: ['extraPay'],
  tribeAlly: ['tribal'],
  maxSpeed: ['board'],
  hasCrown: ['board'],
  converge: ['chain'],
  descend: ['discard'],
  rested: [],
  bargained: ['extraPay'],
  achieved: ['growth'],
  level2: ['growth'],
  level3: ['growth'],
  isDay: ['board'],
  isNight: ['board'],
};

/** タイミング */
export const TIMING_TAGS: Map_<TimingId> = {
  play: [],
  summon: [],
  destroyed: ['sacrifice'],
  damaged: [],
  attack: ['attack'],
  turnStart: [],
  turnEnd: [],
  cardPlayed: ['chain'],
  allySummoned: ['swarm'],
  allyDestroyed: ['sacrifice'],
  powerPlayed: ['power'],
  skillPlayed: ['chain'],
  hitEnemyPlayer: ['attack'],
  drawn: ['draw'],
  targeted: [],
  bigCardPlayed: ['chain'],
  fromDiscard: ['discard'],
  activated: [],
  channel: ['discard'],
  chapter1: ['power'],
  chapter2: ['power'],
  chapter3: ['power'],
  charged: ['growth'],
  enemyAttacked: ['defense'],
  discarded: ['discard'],
  valiant: [],
  renew: ['discard'],
  forecast: [],
  adventure: ['waiting'],
  achievedNow: ['growth'],
  leveledUp: ['growth'],
  loyaltyPlus: ['growth'],
  loyaltyMinus: ['growth'],
  revealed: [],
  siegeWon: ['disrupt'],
};

/** 対象（種族の仲間だけタグにする） */
export const TARGET_TAGS: Map_<TargetId> = {
  chosen: [],
  random: [],
  enemyMonsters: [],
  enemyAll: [],
  everyone: [],
  self: [],
  enemyPlayer: [],
  board: [],
  thisMonster: [],
  allyMonsters: [],
  otherAllies: [],
  weakestAlly: [],
  bothPlayers: [],
  tribeAllies: ['tribal'],
  attacker: [],
};

/** 「同じ種族」を探せる効果（サーチ・抽出の選択肢 'tribe'） */
const TRIBAL_OPTION_EFFECTS = new Set(['search', 'seek']);

const TAG_ORDER = new Map<TagId, number>([...MECHANIC_TAGS.map((t, i) => [t.id, i] as const), ...TRIBE_IDS.map((t, i) => [`tribe:${t}` as TribeTagId, 100 + i] as const)]);

export function tagLabel(id: TagId): string {
  if (id.startsWith('tribe:')) return `種族：${TRIBE_LABEL[id.slice(6) as TribeId] ?? id.slice(6)}`;
  return MECHANIC_TAGS.find((t) => t.id === id)?.label ?? id;
}

const TRIBE_KANA: Record<TribeId, string> = { beast: 'けもの', dragon: 'りゅう どらごん', undead: 'ふし', machine: 'きかい', spirit: 'せいれい', human: 'ひと にんげん' };

/** 検索用の読み（「どく」で毒のカードが見つかるように） */
export function tagReading(id: TagId): string {
  if (id.startsWith('tribe:')) return TRIBE_KANA[id.slice(6) as TribeId] ?? '';
  return MECHANIC_TAGS.find((t) => t.id === id)?.kana ?? '';
}

export function tagHint(id: TagId): string {
  if (id.startsWith('tribe:')) return `種族が${TRIBE_LABEL[id.slice(6) as TribeId] ?? ''}のカード`;
  return MECHANIC_TAGS.find((t) => t.id === id)?.hint ?? '';
}

/** すべてのタグ（並び順） */
export const ALL_TAGS: readonly TagId[] = [...MECHANIC_TAGS.map((t) => t.id), ...TRIBE_IDS.map((t) => `tribe:${t}` as TribeTagId)];

export function isTagId(x: unknown): x is TagId {
  return typeof x === 'string' && TAG_ORDER.has(x as TagId);
}

/** カード1枚のタグ（並びは MECHANIC_TAGS の順、種族は最後） */
export function cardTags(card: CardDef, a: CardAnalysis): TagId[] {
  const out = new Set<TagId>();
  const add = (xs: readonly MechanicTagId[] | undefined) => xs?.forEach((t) => out.add(t));
  for (const e of card.effects) {
    add(EFFECT_TAGS[e.id]);
    add(TIMING_TAGS[e.timing]);
    add(TARGET_TAGS[e.target]);
    if (e.condition) add(CONDITION_TAGS[e.condition]);
    e.mods?.forEach((m) => add(MODIFIER_TAGS[m]));
    if (e.option === 'tribe' && TRIBAL_OPTION_EFFECTS.has(e.id)) out.add('tribal');
  }
  for (const k of card.keywords) add(KEYWORD_TAGS[k.id]);
  for (const d of card.drawbacks) {
    add(DRAWBACK_TAGS[d.id]);
    if (d.timing) add(TIMING_TAGS[d.timing]);
  }
  for (const ab of card.abilities ?? []) {
    add(ABILITY_TAGS[ab.id]);
    if (ab.condition) add(CONDITION_TAGS[ab.condition]);
  }
  if (a.cardType === 'power' || a.cardType === 'powerAttack') out.add('power');
  if (a.isCurse) out.add('curse');
  if (card.tribe && (TRIBE_IDS as readonly string[]).includes(card.tribe)) out.add(`tribe:${card.tribe}`);
  return [...out].sort((x, y) => (TAG_ORDER.get(x) ?? 999) - (TAG_ORDER.get(y) ?? 999));
}

/** テスト用：表のキーの一覧 */
export const TAG_TABLES = { EFFECT_TAGS, KEYWORD_TAGS, DRAWBACK_TAGS, ABILITY_TAGS, MODIFIER_TAGS, CONDITION_TAGS, TIMING_TAGS, TARGET_TAGS } as const;
