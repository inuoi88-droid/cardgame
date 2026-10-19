/**
 * プリセットデッキ（今は5つ）の総当たり（ミラー含む）と、先攻後攻ルールの候補の比較。
 *   node scripts/sim/presets.mts [n]   … 1組み合わせあたり n 試合（既定 200）
 * 出力：scripts/sim/out/presets.json
 *
 * - 総当たりは先攻を交互にする（A勝率は席の差、先攻勝率はルールの差を見る）
 * - 先攻後攻ルールの比較はミラー戦で先攻を席0に固定し、席0（＝先攻）の勝率を出す。50% に近いほど公平
 */
import {
  BURN,
  FIRST_PLAYER_VARIANTS,
  PRESET_NAMES,
  SERIES_HEADER,
  argN,
  isMain,
  mdTable,
  pct,
  presetSpec,
  series,
  seriesRow,
  table,
  writeOut,
  type FirstPlayerVariant,
  type SeriesResult,
} from './lib.mts';

export interface PresetsResult {
  n: number;
  roundRobin: SeriesResult[];
  /** variant → ミラー戦（先攻＝席0）の結果 */
  firstPlayer: Record<FirstPlayerVariant, SeriesResult[]>;
}

export async function run(n: number): Promise<PresetsResult> {
  const roundRobin: SeriesResult[] = [];
  for (let a = 0; a < PRESET_NAMES.length; a++) {
    for (let b = 0; b < PRESET_NAMES.length; b++) {
      roundRobin.push(await series(presetSpec(a), presetSpec(b), n, { seedBase: 1000 + (a * PRESET_NAMES.length + b) * 10000 }));
    }
  }
  const firstPlayer = {} as Record<FirstPlayerVariant, SeriesResult[]>;
  const mirrors = [...PRESET_NAMES.map((_, i) => presetSpec(i)), BURN()];
  for (const key of Object.keys(FIRST_PLAYER_VARIANTS) as FirstPlayerVariant[]) {
    const v = FIRST_PLAYER_VARIANTS[key];
    firstPlayer[key] = [];
    for (const d of mirrors) {
      firstPlayer[key].push(await series(d, d, n, { first: 0, battle: v.battle, seedBase: 50000, label: d.name }));
    }
  }
  return { n, roundRobin, firstPlayer };
}

export function report(r: PresetsResult): { text: string; md: string } {
  const rr = r.roundRobin.map(seriesRow);
  const variantKeys = Object.keys(r.firstPlayer) as FirstPlayerVariant[];
  const mirrorNames = r.firstPlayer[variantKeys[0]!]!.map((s) => s.label);
  const fpHeader = ['ミラー戦（先攻＝席0）', ...variantKeys.map((k) => FIRST_PLAYER_VARIANTS[k].label)];
  const fpRows = mirrorNames.map((name, i) => [name, ...variantKeys.map((k) => `${pct(r.firstPlayer[k]![i]!.winRate)}（中央${r.firstPlayer[k]![i]!.turnsMedian}T）`)]);
  const text = [
    `## プリセット総当たり（各 ${r.n} 試合、先攻は交互）`,
    table(SERIES_HEADER, rr),
    '',
    `## 先攻後攻ルールの比較：先攻（席0）の勝率（各 ${r.n} 試合）`,
    table(fpHeader, fpRows),
  ].join('\n');
  const md = [
    `### プリセット総当たり（各 ${r.n} 試合、先攻は交互）`,
    mdTable(SERIES_HEADER, rr),
    '',
    `### 先攻後攻ルールの比較：先攻（席0）の勝率（各 ${r.n} 試合）`,
    mdTable(fpHeader, fpRows),
  ].join('\n');
  return { text, md };
}

if (isMain(import.meta.url)) {
  const r = await run(argN(200));
  console.log(report(r).text);
  console.log(`\n→ ${writeOut('presets.json', r)}`);
}
