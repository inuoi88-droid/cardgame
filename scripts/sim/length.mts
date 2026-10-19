/**
 * 試合の長さ（各プレイヤーのターン数）の分布。プリセットのミラー戦、BURN・B0・B1 のミラー戦。
 *   node scripts/sim/length.mts [n]   … 1デッキあたり n 試合（既定 200）
 * 出力：scripts/sim/out/length.json
 *
 * 目安（監査の合格基準）：中央値 8〜10 ターン、純バーン（BURN）5 ターン以上、30 ターンの引き分け 2% 以下
 */
import { B0, B1, BURN, PRESET_NAMES, argN, isMain, mdTable, pct, presetSpec, series, table, writeOut, type DeckSpec, type SeriesResult } from './lib.mts';

export interface LengthResult {
  n: number;
  mirrors: SeriesResult[];
}

export function mirrorDecks(): DeckSpec[] {
  return [...PRESET_NAMES.map((_, i) => presetSpec(i)), BURN(), B0(), B1()];
}

export async function run(n: number): Promise<LengthResult> {
  const mirrors: SeriesResult[] = [];
  for (const d of mirrorDecks()) {
    mirrors.push(await series(d, d, n, { label: `${d.name} ミラー`, seedBase: 7000 }));
    console.error(`${d.name.padEnd(10)} 中央${mirrors.at(-1)!.turnsMedian}T`);
  }
  return { n, mirrors };
}

export function report(r: LengthResult): { text: string; md: string } {
  const maxT = Math.max(...r.mirrors.map((s) => s.turnsMax));
  const cols = Array.from({ length: maxT }, (_, i) => i + 1);
  const header = ['デッキ', '中央', '平均', 'p10', 'p90', '引分', ...cols.map((t) => `${t}T`)];
  const rows = r.mirrors.map((s) => [s.label, s.turnsMedian, s.turnsMean, s.turnsP10, s.turnsP90, pct(s.drawRate), ...cols.map((t) => s.hist[t] ?? '')]);
  const title = `試合の長さ（各プレイヤーのターン数。ミラー戦 各 ${r.n} 試合、先攻は交互）`;
  return {
    text: `## ${title}\n${table(header, rows)}`,
    md: `### ${title}\n${mdTable(header, rows)}`,
  };
}

if (isMain(import.meta.url)) {
  const r = await run(argN(200));
  console.log(report(r).text);
  console.log(`\n→ ${writeOut('length.json', r)}`);
}
