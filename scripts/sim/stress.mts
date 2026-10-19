/**
 * 極端なデッキ（1つの効果だけに寄せたデッキ）を基準デッキ B0・B1 にぶつけて、効果ごとの強さの上限を測る。
 *   node scripts/sim/stress.mts [n]   … 1組み合わせあたり n 試合（既定 60）
 * 出力：scripts/sim/out/stress.json
 *
 * 各デッキはコモン・コスト1（例外は備考に記す）のカード30枚。数値 N は価格表の範囲で作れる最大（fitValue）なので、
 * balance.ts の価格を変えればデッキも自動で追従する。
 *
 * | キー         | 中身                                             | 備考 |
 * |--------------|--------------------------------------------------|------|
 * | damage       | ダメージ N ×30                                   | 純バーン |
 * | multiHit     | 連撃 N×3 ×30                                     | |
 * | pierce       | 防御無視ダメージ N ×30                           | |
 * | drain        | 吸収ダメージ N ×30                               | |
 * | execute      | 処刑 N ×30                                       | モンスター限定 |
 * | counter      | 反撃 N（自分）×30                                | |
 * | shield       | シールド N ×30                                   | |
 * | heal         | 回復 N ×30                                       | |
 * | nullify      | 無効化 ×30                                       | |
 * | poison       | 毒 N ×30                                         | |
 * | burn         | やけど（延長 N）×30                              | |
 * | freeze       | 凍結 ×30                                         | |
 * | weak         | 弱体 N ターン ×30                                | |
 * | vulnerable   | 脆弱 N ターン ×30                                | |
 * | bleed        | 出血 N ×30                                       | |
 * | seal         | 封印 ×30                                         | モンスター限定 |
 * | confuse      | 混乱 ×30                                         | モンスター限定 |
 * | strength     | 筋力 N ×15 ＋ ダメージ7 ×15                      | 筋力はアタックに乗るので半分はアタック |
 * | focus        | 気合 N ×15 ＋ ダメージ7 ×15                      | 同上 |
 * | attackUp     | 攻撃力アップ N ×15 ＋ 兵士 3/3 ×15               | 自分のモンスターが要る |
 * | defenseUp    | 守備力アップ N ×15 ＋ 兵士 3/3 ×15               | 同上 |
 * | regen        | 再生 N ×30                                       | |
 * | draw         | ドロー N ×30                                     | |
 * | energy       | エナジー +N ×30                                  | |
 * | savings      | 貯金 N ×30                                       | |
 * | discount     | 軽減 ×30                                         | |
 * | search       | サーチ ×30                                       | |
 * | retain       | 保持 ×30                                         | |
 * | drawJam      | ドロー妨害 ×30                                   | |
 * | energyJam    | エナジー妨害 ×30                                 | |
 * | noise        | ノイズ N ×30                                     | |
 * | bounce       | バウンス（コスト N 以下）×30                     | |
 * | weaken       | 弱化 N ×30                                       | モンスター限定 |
 * | dispel       | 解除 ×30                                         | |
 * | revive       | 蘇生（コスト N 以下）×4 ＋ 兵士 3/3 ×26          | エピック・コスト2（デッキの上限4枚） |
 * | wipe         | 全体破壊 ×2 ＋ 兵士 3/3 ×28                      | レジェンド・コスト2（上限2枚） |
 * | steal        | 奪取 ×2 ＋ 兵士 3/3 ×28                          | レジェンド・コスト3（上限2枚） |
 * | vanilla      | 兵士 3/3 ×30                                     | 純モンスター |
 * | haste        | 速攻 N/2 ×30                                     | N は攻撃力 |
 * | taunt        | 挑発 1/N ×30                                     | N は体力 |
 * | flying       | 飛行 2/N ×30                                     | |
 * | trample      | 貫通 3/N ×30                                     | |
 * | doubleAttack | 二回攻撃 1/N ×30                                 | |
 * | stealth      | 隠密 2/N ×30                                     | |
 * | undying      | 不屈 2/N ×30                                     | |
 * | selfRepair   | 自己修復 N 1/3 ×30                               | |
 * | powerBurn    | パワー「ターン開始時に相手にダメージ N」×30      | |
 * | attackPoison | 1/2「攻撃するたび毒 N」×30                       | |
 */
import {
  B0,
  B1,
  BALANCE,
  argN,
  buildDeck,
  cardAtCap,
  fill,
  fitValue,
  fx,
  isMain,
  mdTable,
  pct,
  series,
  table,
  writeOut,
  type DeckSpec,
  type SeriesResult,
} from './lib.mts';
import { createEffect, type CardDef, type EffectInstance, type KeywordInstance, type Rarity, type Stats } from '../../src/engine/index.ts';

/** 効果の既定（タイミング・対象・option）を createEffect からもらい、上書きする */
const eff = (id: string, over: Partial<EffectInstance> = {}, monster = false): EffectInstance => ({ ...createEffect(id, monster ? 'monster' : 'spell'), ...over });

const SOLDIER = (): CardDef => cardAtCap('common', 1, [], { attack: 3, hp: 3, defense: 0 }, [], { name: '兵士' });
const FIREBALL = (): CardDef => cardAtCap('common', 1, [fx({ id: 'damage', value: 7 })], null, [], { name: '火球' });

interface Parts {
  effects?: EffectInstance[];
  stats?: Stats | null;
  keywords?: KeywordInstance[];
  name?: string;
}

/** 数値 N を最大にしたカード30枚のデッキ */
const single = (key: string, build: (v: number) => Parts, rarity: Rarity = 'common', cost = 1): DeckSpec => {
  const { card } = fitValue(rarity, cost, build);
  return buildDeck(key, [[card, 30]]);
};
/** 数値のないカード30枚 */
const flat = (key: string, effects: EffectInstance[], rarity: Rarity = 'common', cost = 1): DeckSpec => buildDeck(key, [[cardAtCap(rarity, cost, effects, null, [], { name: key }), 30]]);
/** 数値 N を最大にしたカード15枚＋相方15枚 */
const half = (key: string, partner: CardDef, build: (v: number) => Parts, rarity: Rarity = 'common', cost = 1): DeckSpec => {
  const { card } = fitValue(rarity, cost, build);
  return buildDeck(key, [
    [card, 15],
    [partner, 15],
  ]);
};
/** レアリティ限定の効果：デッキに入れられる上限（エピック4・レジェンド2）まで入れ、残りは兵士 */
const rareLimited = (key: string, rarity: Rarity, cost: number, build: (v: number) => Parts): DeckSpec => {
  const { value } = fitValue(rarity, cost, build);
  const parts = build(value);
  const limit = BALANCE.rarity[rarity].deckLimit ?? 30;
  return buildDeck(key, [...fill(parts.name ?? key, rarity, cost, parts, limit), [SOLDIER(), 30 - limit]]);
};
/** モンスター（キーワード付き）。fit は体力か攻撃力 */
const mon = (key: string, build: (v: number) => Parts): DeckSpec => single(key, build);

export const EXTREME: Record<string, () => DeckSpec> = {
  damage: () => single('damage', (v) => ({ effects: [eff('damage', { value: v })], name: `ダメージ${v}` })),
  multiHit: () => single('multiHit', (v) => ({ effects: [eff('multiHit', { value: v, hits: 3 })], name: `連撃${v}x3` })),
  pierce: () => single('pierce', (v) => ({ effects: [eff('damage', { value: v, mods: ['pierce'] })], name: `防御無視${v}` })),
  drain: () => single('drain', (v) => ({ effects: [eff('damage', { value: v, mods: ['drain'] })], name: `吸収${v}` })),
  execute: () => single('execute', (v) => ({ effects: [eff('execute', { value: v })], name: `処刑${v}` })),
  counter: () => single('counter', (v) => ({ effects: [eff('counter', { value: v })], name: `反撃${v}` })),
  shield: () => single('shield', (v) => ({ effects: [eff('shield', { value: v })], name: `シールド${v}` })),
  heal: () => single('heal', (v) => ({ effects: [eff('heal', { value: v })], name: `回復${v}` })),
  nullify: () => flat('nullify', [eff('nullify')]),
  poison: () => single('poison', (v) => ({ effects: [eff('poison', { value: v })], name: `毒${v}` })),
  burn: () => single('burn', (v) => ({ effects: [eff('burn', { value: v })], name: `やけど+${v}` }), 'common', 1),
  freeze: () => flat('freeze', [eff('freeze')]),
  weak: () => single('weak', (v) => ({ effects: [eff('weak', { value: v })], name: `弱体${v}` })),
  vulnerable: () => single('vulnerable', (v) => ({ effects: [eff('vulnerable', { value: v })], name: `脆弱${v}` })),
  bleed: () => single('bleed', (v) => ({ effects: [eff('bleed', { value: v })], name: `出血${v}` })),
  seal: () => flat('seal', [eff('seal')]),
  confuse: () => flat('confuse', [eff('confuse')]),
  strength: () => half('strength', FIREBALL(), (v) => ({ effects: [eff('strength', { value: v })], name: `筋力${v}` })),
  focus: () => half('focus', FIREBALL(), (v) => ({ effects: [eff('focus', { value: v })], name: `気合${v}` })),
  attackUp: () => half('attackUp', SOLDIER(), (v) => ({ effects: [eff('attackUp', { value: v })], name: `攻撃力+${v}` })),
  defenseUp: () => half('defenseUp', SOLDIER(), (v) => ({ effects: [eff('defenseUp', { value: v })], name: `守備力+${v}` })),
  regen: () => single('regen', (v) => ({ effects: [eff('regen', { value: v })], name: `再生${v}` })),
  draw: () => single('draw', (v) => ({ effects: [eff('draw', { value: v })], name: `ドロー${v}` })),
  energy: () => single('energy', (v) => ({ effects: [eff('energy', { value: v })], name: `エナジー+${v}` })),
  savings: () => single('savings', (v) => ({ effects: [eff('savings', { value: v })], name: `貯金${v}` })),
  discount: () => flat('discount', [eff('discount')]),
  search: () => flat('search', [eff('search')]),
  retain: () => flat('retain', [eff('retain')]),
  drawJam: () => flat('drawJam', [eff('drawJam')]),
  energyJam: () => flat('energyJam', [eff('energyJam')]),
  noise: () => single('noise', (v) => ({ effects: [eff('noise', { value: v })], name: `ノイズ${v}` })),
  bounce: () => single('bounce', (v) => ({ effects: [eff('bounce', { value: v })], name: `バウンス${v}` }), 'common', 1),
  weaken: () => single('weaken', (v) => ({ effects: [eff('weaken', { value: v })], name: `弱化${v}` })),
  dispel: () => flat('dispel', [eff('dispel')]),
  revive: () => rareLimited('revive', 'epic', 2, (v) => ({ effects: [eff('revive', { value: v })], name: `蘇生${v}` })),
  wipe: () => rareLimited('wipe', 'legend', 2, () => ({ effects: [eff('wipe')], name: '全体破壊' })),
  steal: () => rareLimited('steal', 'legend', 3, () => ({ effects: [eff('steal')], name: '奪取' })),
  vanilla: () => buildDeck('vanilla', [[SOLDIER(), 30]]),
  haste: () => mon('haste', (v) => ({ stats: { attack: v, hp: 2, defense: 0 }, keywords: [{ id: 'haste' }], name: `速攻${v}/2` })),
  taunt: () => mon('taunt', (v) => ({ stats: { attack: 1, hp: v, defense: 0 }, keywords: [{ id: 'taunt' }], name: `挑発1/${v}` })),
  flying: () => mon('flying', (v) => ({ stats: { attack: 2, hp: v, defense: 0 }, keywords: [{ id: 'flying' }], name: `飛行2/${v}` })),
  trample: () => mon('trample', (v) => ({ stats: { attack: 3, hp: v, defense: 0 }, keywords: [{ id: 'trample' }], name: `貫通3/${v}` })),
  doubleAttack: () => mon('doubleAttack', (v) => ({ stats: { attack: 1, hp: v, defense: 0 }, keywords: [{ id: 'doubleAttack' }], name: `二回攻撃1/${v}` })),
  stealth: () => mon('stealth', (v) => ({ stats: { attack: 2, hp: v, defense: 0 }, keywords: [{ id: 'stealth' }], name: `隠密2/${v}` })),
  undying: () => mon('undying', (v) => ({ stats: { attack: 2, hp: v, defense: 0 }, keywords: [{ id: 'undying' }], name: `不屈2/${v}` })),
  selfRepair: () => mon('selfRepair', (v) => ({ stats: { attack: 1, hp: 3, defense: 0 }, keywords: [{ id: 'selfRepair', value: v }], name: `自己修復${v}` })),
  powerBurn: () => single('powerBurn', (v) => ({ effects: [eff('damage', { value: v, timing: 'turnStart', target: 'enemyPlayer' })], name: `燃える大地${v}` })),
  attackPoison: () => mon('attackPoison', (v) => ({ stats: { attack: 1, hp: 2, defense: 0 }, effects: [eff('poison', { value: v, timing: 'attack' }, true)], name: `毒牙${v}` })),
};

export interface StressRow {
  key: string;
  cards: string;
  vsB0: SeriesResult;
  vsB1: SeriesResult;
}
export interface StressResult {
  n: number;
  rows: StressRow[];
}

/** デッキの中身の短い表示（カード名×枚数） */
const contents = (d: DeckSpec): string => d.deck.entries.map((e) => `${d.cards.find((c) => c.id === e.cardId)?.name}×${e.count}`).join(' ');

export async function run(n: number, keys: string[] = Object.keys(EXTREME)): Promise<StressResult> {
  const rows: StressRow[] = [];
  for (const key of keys) {
    const make = EXTREME[key];
    if (!make) throw new Error(`知らないデッキ：${key}`);
    const d = make();
    const vsB0 = await series(d, B0(), n, { label: `${key} vs B0`, seedBase: 2000 });
    const vsB1 = await series(d, B1(), n, { label: `${key} vs B1`, seedBase: 3000 });
    rows.push({ key, cards: contents(d), vsB0, vsB1 });
    console.error(`${key.padEnd(14)} vs B0 ${pct(vsB0.winRate)} (中央${vsB0.turnsMedian}T)  vs B1 ${pct(vsB1.winRate)} (中央${vsB1.turnsMedian}T)`);
  }
  return { n, rows };
}

const HEADER = ['デッキ', '中身', 'vs B0 勝率', '引分', '中央T', 'vs B1 勝率', '引分', '中央T'];
const rowOf = (r: StressRow) => [r.key, r.cards, pct(r.vsB0.winRate), pct(r.vsB0.drawRate), r.vsB0.turnsMedian, pct(r.vsB1.winRate), pct(r.vsB1.drawRate), r.vsB1.turnsMedian];

export function report(r: StressResult): { text: string; md: string } {
  const title = `極端なデッキ vs 基準デッキ（各 ${r.n} 試合、先攻は交互。B0＝除去とモンスター、B1＝顔レース）`;
  return {
    text: `## ${title}\n${table(HEADER, r.rows.map(rowOf))}`,
    md: `### ${title}\n${mdTable(HEADER, r.rows.map(rowOf))}`,
  };
}

if (isMain(import.meta.url)) {
  const keys = process.argv.slice(3);
  const r = await run(argN(60), keys.length ? keys : undefined);
  console.log(report(r).text);
  console.log(`\n→ ${writeOut('stress.json', r)}`);
}
