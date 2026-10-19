/**
 * 極端なデッキ（10枚差し替え版）：基準デッキ B0・B1 の1つの枠（10枚）を「1つの効果だけを上限まで積んだカード」に差し替え、
 * 差し替える前の基準デッキと戦わせる。効果ごとの強さの上限と、効果どうしの差（いちばん強いデッキと弱いデッキの差）を見る。
 *   node scripts/sim/stress10.mts [n] [キー...]   … 1組み合わせあたり n 試合（既定 150）
 * 出力：scripts/sim/out/stress10.json
 *
 * stress.mts（30枚すべて1つの効果）はダメージを持たないデッキが勝てずに 0% や引き分けになるので、
 * 監査 sim-c と同じく「基準デッキの1枠だけを差し替える」形で測る。
 *
 * 差し替える枠：
 * - B0（兵士 3/3 ×10・火球 ダメージ7 ×10・戦士 5/5 ×10）：呪文は火球の枠、モンスターと「打点を増やす」効果（筋力・気合・脆弱・出血）は兵士の枠
 * - B1（見習い兵 2/4.5 ×10・火球 ダメージ7.5 ×10・鉄の盾 シールド上限 ×10）：呪文は鉄の盾の枠、モンスターは見習い兵の枠
 * カードはコモン・コスト1で作れる最大の数値（fitValue）。コモンで作れない効果は上のレアリティで作り、
 * デッキに入れられる上限（レア8・エピック4・レジェンド2）を超える分は元のカードのまま残す。
 */
import { B0, B1, BALANCE, argN, buildDeck, cardAtCap, fill, fx, ironShield, isMain, mdTable, pct, series, table, writeOut, type DeckSpec, type SeriesResult } from './lib.mts';
import { createEffect, type CardDef, type EffectInstance, type KeywordInstance, type Rarity, type Stats } from '../../src/engine/index.ts';

const eff = (id: string, over: Partial<EffectInstance> = {}, monster = false): EffectInstance => ({ ...createEffect(id, monster ? 'monster' : 'spell'), ...over });

interface Parts {
  effects?: EffectInstance[];
  stats?: Stats | null;
  keywords?: KeywordInstance[];
  name?: string;
}

type Slot = 'spell' | 'monster' | 'amp';

interface Extreme {
  slot: Slot;
  build: (v: number) => Parts;
  /** 数値の刻み（量は 0.25、数は 1）。数値を使わないなら 0 */
  step: number;
  /** 試すレアリティ・コスト（先頭から） */
  tries?: [Rarity, number][];
}

const AMOUNT = 0.25;
const COUNT = 1;
const C1: [Rarity, number][] = [['common', 1]];
const ANY1: [Rarity, number][] = [
  ['common', 1],
  ['rare', 1],
  ['rare', 2],
  ['epic', 2],
  ['legend', 2],
  ['legend', 3],
];

export const EXTREME10: Record<string, Extreme> = {
  damage: { slot: 'spell', step: AMOUNT, build: (v) => ({ effects: [eff('damage', { value: v })], name: `ダメージ${v}` }) },
  multiHit: { slot: 'spell', step: AMOUNT, build: (v) => ({ effects: [eff('multiHit', { value: v, hits: 3 })], name: `連撃${v}x3` }) },
  drain: { slot: 'spell', step: AMOUNT, build: (v) => ({ effects: [eff('damage', { value: v, mods: ['drain'] })], name: `吸収${v}` }) },
  dmgEnemyAll: { slot: 'spell', step: AMOUNT, build: (v) => ({ effects: [eff('damage', { value: v, target: 'enemyAll' })], name: `全体ダメージ${v}` }) },
  dmgEnemyMon: { slot: 'spell', step: AMOUNT, build: (v) => ({ effects: [eff('damage', { value: v, target: 'enemyMonsters' })], name: `敵モン全体${v}` }) },
  execute: { slot: 'spell', step: AMOUNT, build: (v) => ({ effects: [eff('execute', { value: v })], name: `処刑${v}` }) },
  poison: { slot: 'spell', step: AMOUNT, build: (v) => ({ effects: [eff('poison', { value: v })], name: `毒${v}` }) },
  poisonEnemyAll: { slot: 'spell', step: AMOUNT, build: (v) => ({ effects: [eff('poison', { value: v, target: 'enemyAll' })], name: `毒霧${v}` }) },
  strength: { slot: 'amp', step: AMOUNT, build: (v) => ({ effects: [eff('strength', { value: v })], name: `筋力${v}` }) },
  focus: { slot: 'amp', step: AMOUNT, build: (v) => ({ effects: [eff('focus', { value: v })], name: `気合${v}` }) },
  vulnerable: { slot: 'amp', step: COUNT, build: (v) => ({ effects: [eff('vulnerable', { value: v })], name: `脆弱${v}` }) },
  bleed: { slot: 'amp', step: AMOUNT, build: (v) => ({ effects: [eff('bleed', { value: v })], name: `出血${v}` }) },
  weak: { slot: 'spell', step: COUNT, build: (v) => ({ effects: [eff('weak', { value: v })], name: `弱体${v}` }) },
  freeze: { slot: 'spell', step: 0, build: () => ({ effects: [eff('freeze')], name: '凍結' }) },
  counter: { slot: 'spell', step: AMOUNT, build: (v) => ({ effects: [eff('counter', { value: v })], name: `反撃${v}` }) },
  shield: { slot: 'spell', step: AMOUNT, build: (v) => ({ effects: [eff('shield', { value: v })], name: `シールド${v}` }) },
  heal: { slot: 'spell', step: AMOUNT, build: (v) => ({ effects: [eff('heal', { value: v })], name: `回復${v}` }) },
  regen: { slot: 'spell', step: AMOUNT, build: (v) => ({ effects: [eff('regen', { value: v })], name: `再生${v}` }) },
  draw: { slot: 'spell', step: COUNT, build: (v) => ({ effects: [eff('draw', { value: v })], name: `ドロー${v}` }) },
  energy: { slot: 'spell', step: COUNT, build: (v) => ({ effects: [eff('energy', { value: v })], name: `エナジー+${v}` }) },
  savings: { slot: 'spell', step: COUNT, build: (v) => ({ effects: [eff('savings', { value: v })], name: `貯金${v}` }) },
  discount: { slot: 'spell', step: 0, build: () => ({ effects: [eff('discount')], name: '軽減' }) },
  bounce: { slot: 'spell', step: COUNT, build: (v) => ({ effects: [eff('bounce', { value: v })], name: `バウンス${v}` }) },
  attackUp: { slot: 'spell', step: AMOUNT, build: (v) => ({ effects: [eff('attackUp', { value: v })], name: `攻撃力+${v}` }) },
  steal: { slot: 'spell', step: 0, tries: ANY1, build: () => ({ effects: [eff('steal')], name: '奪取' }) },
  wipe: { slot: 'spell', step: 0, tries: ANY1, build: () => ({ effects: [eff('wipe')], name: '全体破壊' }) },
  cardPlayedDmg: {
    slot: 'spell',
    step: AMOUNT,
    tries: ANY1,
    build: (v) => ({ effects: [eff('damage', { value: v, timing: 'cardPlayed', target: 'enemyPlayer' })], name: `使うたび${v}` }),
  },
  turnStartDmg: {
    slot: 'spell',
    step: AMOUNT,
    tries: ANY1,
    build: (v) => ({ effects: [eff('damage', { value: v, timing: 'turnStart', target: 'enemyPlayer' })], name: `開始時${v}ダメ` }),
  },
  turnStartPoison: {
    slot: 'spell',
    step: AMOUNT,
    tries: ANY1,
    build: (v) => ({ effects: [eff('poison', { value: v, timing: 'turnStart', target: 'enemyPlayer' })], name: `開始時毒${v}` }),
  },
  turnStartDraw: {
    slot: 'spell',
    step: COUNT,
    tries: ANY1,
    build: (v) => ({ effects: [eff('draw', { value: v, timing: 'turnStart', target: 'self' })], name: `開始時ドロー${v}` }),
  },
  turnStartEnergy: {
    slot: 'spell',
    step: COUNT,
    tries: ANY1,
    build: (v) => ({ effects: [eff('energy', { value: v, timing: 'turnStart', target: 'self' })], name: `開始時エナジー${v}` }),
  },
  vanilla: { slot: 'monster', step: AMOUNT, build: (v) => ({ stats: { attack: 3, hp: v, defense: 0 }, name: `兵士3/${v}` }) },
  taunt: { slot: 'monster', step: AMOUNT, build: (v) => ({ stats: { attack: 2, hp: v, defense: 0 }, keywords: [{ id: 'taunt' }], name: `挑発2/${v}` }) },
  flying: { slot: 'monster', step: AMOUNT, build: (v) => ({ stats: { attack: 2, hp: v, defense: 0 }, keywords: [{ id: 'flying' }], name: `飛行2/${v}` }) },
  doubleAttack: { slot: 'monster', step: AMOUNT, build: (v) => ({ stats: { attack: 1, hp: v, defense: 0 }, keywords: [{ id: 'doubleAttack' }], name: `二回攻撃1/${v}` }) },
  haste: { slot: 'monster', step: AMOUNT, build: (v) => ({ stats: { attack: v, hp: 2, defense: 0 }, keywords: [{ id: 'haste' }], name: `速攻${v}/2` }) },
  trample: { slot: 'monster', step: AMOUNT, build: (v) => ({ stats: { attack: 3, hp: v, defense: 0 }, keywords: [{ id: 'trample' }], name: `貫通3/${v}` }) },
  stealth: { slot: 'monster', step: AMOUNT, build: (v) => ({ stats: { attack: 2, hp: v, defense: 0 }, keywords: [{ id: 'stealth' }], name: `隠密2/${v}` }) },
  undying: { slot: 'monster', step: AMOUNT, build: (v) => ({ stats: { attack: 2, hp: v, defense: 0 }, keywords: [{ id: 'undying' }], name: `不屈2/${v}` }) },
  attackPoison: {
    slot: 'monster',
    step: AMOUNT,
    build: (v) => ({ stats: { attack: 1, hp: 2, defense: 0 }, effects: [eff('poison', { value: v, timing: 'attack' }, true)], name: `毒牙${v}` }),
  },
};

/** 数値を上から刻みごとに試し、ルールを守る最大の数値でカードを作る */
function fit(x: Extreme): { card: CardDef; parts: Parts; rarity: Rarity; cost: number; value: number } {
  const tries = x.tries ?? C1;
  let last = '';
  for (const [rarity, cost] of tries) {
    const values = x.step === 0 ? [0] : Array.from({ length: Math.round(30 / x.step) }, (_, i) => 30 - i * x.step);
    for (const v of values) {
      const parts = x.build(v);
      try {
        const card = cardAtCap(rarity, cost, parts.effects ?? [], parts.stats, parts.keywords, { name: parts.name });
        return { card, parts, rarity, cost, value: v };
      } catch (e) {
        last = (e as Error).message;
      }
    }
  }
  throw new Error(`作れない：${last}`);
}

const SOLDIER = () => cardAtCap('common', 1, [], { attack: 3, hp: 3, defense: 0 }, [], { name: '兵士' });
const FIRE7 = () => cardAtCap('common', 1, [fx({ id: 'damage', value: 7 })], null, [], { name: '火球' });
const WARRIOR = () => cardAtCap('common', 2, [], { attack: 5, hp: 5, defense: 0 }, [], { name: '戦士' });
const APPRENTICE = () => cardAtCap('common', 1, [], { attack: 2, hp: 4.5, defense: 0 }, [], { name: '見習い兵' });
const FIRE75 = () => cardAtCap('common', 1, [fx({ id: 'damage', value: 7.5 })], null, [], { name: '火球' });
const SHIELD10 = () => ironShield();

/** 基準デッキの1枠を差し替えたデッキ */
export function variant(key: string, base: 'B0' | 'B1', x: Extreme): { deck: DeckSpec; desc: string } {
  const f = fit(x);
  const limit = Math.min(10, BALANCE.rarity[f.rarity].deckLimit ?? 10);
  const extreme = f.rarity === 'common' ? ([[f.card, limit]] as [CardDef, number][]) : fill(f.parts.name ?? key, f.rarity, f.cost, f.parts, limit);
  const slots: Record<string, [CardDef, number]> =
    base === 'B0'
      ? { monster: [SOLDIER(), 10], spell: [FIRE7(), 10], other: [WARRIOR(), 10] }
      : { monster: [APPRENTICE(), 10], spell: [SHIELD10(), 10], other: [FIRE75(), 10] };
  const slotKey = x.slot === 'monster' ? 'monster' : x.slot === 'amp' ? (base === 'B0' ? 'monster' : 'spell') : 'spell';
  const replaced = slots[slotKey]!;
  const list: [CardDef, number][] = [];
  for (const [k, entry] of Object.entries(slots)) {
    if (k !== slotKey) list.push(entry);
  }
  list.push(...extreme);
  if (limit < 10) list.push([replaced[0], 10 - limit]);
  const tag = f.rarity === 'common' ? '' : `［${f.rarity}・コスト${f.cost}］`;
  return {
    deck: buildDeck(`${key}/${base}`, list),
    desc: `${replaced[0].name}→${f.parts.name ?? key}${tag}×${limit}`,
  };
}

export interface Stress10Row {
  key: string;
  descB0: string;
  descB1: string;
  vsB0: SeriesResult;
  vsB1: SeriesResult;
}
export interface Stress10Result {
  n: number;
  rows: Stress10Row[];
  failed: { key: string; error: string }[];
}

export async function run(n: number, keys: string[] = Object.keys(EXTREME10)): Promise<Stress10Result> {
  const rows: Stress10Row[] = [];
  const failed: { key: string; error: string }[] = [];
  for (const key of keys) {
    const x = EXTREME10[key];
    if (!x) throw new Error(`知らないデッキ：${key}`);
    let a0: ReturnType<typeof variant>, a1: ReturnType<typeof variant>;
    try {
      a0 = variant(key, 'B0', x);
      a1 = variant(key, 'B1', x);
    } catch (e) {
      failed.push({ key, error: (e as Error).message });
      console.error(`${key}: ${(e as Error).message}`);
      continue;
    }
    const vsB0 = await series(a0.deck, B0(), n, { label: `${key} vs B0`, seedBase: 2000, level: 'normal' });
    const vsB1 = await series(a1.deck, B1(), n, { label: `${key} vs B1`, seedBase: 3000, level: 'normal' });
    rows.push({ key, descB0: a0.desc, descB1: a1.desc, vsB0, vsB1 });
    console.error(`${key.padEnd(16)} vs B0 ${pct(vsB0.winRate)} 引分${pct(vsB0.drawRate)} (中央${vsB0.turnsMedian}T)  vs B1 ${pct(vsB1.winRate)} 引分${pct(vsB1.drawRate)} (中央${vsB1.turnsMedian}T)`);
  }
  return { n, rows, failed };
}

const HEADER = ['デッキ', 'B0 の差し替え', 'vs B0 勝率', '引分', '中央T', 'B1 の差し替え', 'vs B1 勝率', '引分', '中央T'];
const rowOf = (r: Stress10Row) => [r.key, r.descB0, pct(r.vsB0.winRate), pct(r.vsB0.drawRate), r.vsB0.turnsMedian, r.descB1, pct(r.vsB1.winRate), pct(r.vsB1.drawRate), r.vsB1.turnsMedian];

export function report(r: Stress10Result): { text: string; md: string } {
  const title = `極端なデッキ（基準デッキの10枚を差し替え）vs 元の基準デッキ（各 ${r.n} 試合、先攻は交互）`;
  const fails = r.failed.map((f) => `- ${f.key}：${f.error}`).join('\n');
  return {
    text: `## ${title}\n${table(HEADER, r.rows.map(rowOf))}${fails ? `\n作れなかったデッキ：\n${fails}` : ''}`,
    md: `### ${title}\n${mdTable(HEADER, r.rows.map(rowOf))}${fails ? `\n\n作れなかったデッキ：\n${fails}` : ''}`,
  };
}

if (isMain(import.meta.url)) {
  const keys = process.argv.slice(3);
  const r = await run(argN(150), keys.length ? keys : undefined);
  console.log(report(r).text);
  console.log(`\n→ ${writeOut('stress10.json', r)}`);
}
