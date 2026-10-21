/**
 * 対戦のオプション（MTG 要素 △ バッチD：リーダー・フィールド・昼と夜）の測り直し。
 *   node scripts/sim/options.mts [n] [--leader] [--field] [--daynight] [--all-fields]   … 1組み合わせあたり n 試合（既定 100）。フラグを省くと全部
 * - --leader：プリセットのミラー戦で、席A だけにリーダー（席B はなし）。A の勝率が 50% からどれだけ離れるか（リーダーの強さ）
 * - --field：各フィールドを最初から置いて、プリセット総当たりの A 勝率の 50% からのずれ（そのフィールドで得をするデッキ）。
 *   見送り中のフィールド（闘技場。決定事項 #102）は --all-fields を付けたときだけ測る（戻す前の確認用）
 * - --daynight：昼と夜ありでのプリセット総当たり（試合の長さが変わらないか）
 * 出力：scripts/sim/out/options.json。どれも差が10%以内が目安（spec3 の 8.4）。外れたら balance.ts の leaders・fields を直す
 */
import { ACTIVE_FIELD_IDS, FIELD_IDS, LEADER_IDS, type FieldId, type LeaderId } from '../../src/engine/index.ts';
import { PRESET_NAMES, SERIES_HEADER, argN, isMain, pct, presetSpec, series, seriesRow, table, writeOut, type SeriesResult } from './lib.mts';

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
const allFields = flags.delete('--all-fields');
const all = flags.size === 0;

export async function run(n: number) {
  const out: { leaders: { leader: LeaderId; results: SeriesResult[] }[]; fields: { field: FieldId; results: SeriesResult[] }[]; dayNight: SeriesResult[] } = {
    leaders: [],
    fields: [],
    dayNight: [],
  };
  const presets = PRESET_NAMES.map((_, i) => presetSpec(i));
  if (all || flags.has('--leader')) {
    for (const leader of LEADER_IDS.filter((l) => l !== 'none')) {
      const results: SeriesResult[] = [];
      for (const d of presets) results.push(await series(d, d, n, { leaders: [leader, 'none'], seedBase: 7000, label: `${d.name}（A:${leader}）` }));
      out.leaders.push({ leader, results });
    }
  }
  if (all || flags.has('--field')) {
    for (const field of allFields ? FIELD_IDS : ACTIVE_FIELD_IDS) {
      const results: SeriesResult[] = [];
      for (let a = 0; a < presets.length; a++)
        for (let b = a + 1; b < presets.length; b++) results.push(await series(presets[a]!, presets[b]!, n, { field, seedBase: 8000 + a * 100 + b, label: `${presets[a]!.name} 対 ${presets[b]!.name}（${field}）` }));
      out.fields.push({ field, results });
    }
  }
  if (all || flags.has('--daynight')) {
    for (let a = 0; a < presets.length; a++)
      for (let b = a; b < presets.length; b++) out.dayNight.push(await series(presets[a]!, presets[b]!, n, { rules: { dayNight: true }, seedBase: 9000 + a * 100 + b }));
  }
  return out;
}

if (isMain(import.meta.url)) {
  const n = argN(100);
  const r = await run(n);
  const avgGap = (rs: SeriesResult[]) => rs.reduce((s, x) => s + Math.abs(x.winRate - 0.5), 0) / Math.max(1, rs.length);
  for (const l of r.leaders) {
    console.log(`\n## リーダー ${l.leader}（ミラー戦で席A だけ。各 ${n} 試合）`);
    console.log(table(SERIES_HEADER, l.results.map(seriesRow)));
    console.log(`A の平均勝率：${pct(l.results.reduce((s, x) => s + x.winRate, 0) / l.results.length)}`);
  }
  for (const f of r.fields) {
    console.log(`\n## フィールド ${f.field}（総当たり。各 ${n} 試合）`);
    console.log(table(SERIES_HEADER, f.results.map(seriesRow)));
    console.log(`50% からの平均のずれ：${pct(avgGap(f.results))}`);
  }
  if (r.dayNight.length) {
    console.log(`\n## 昼と夜あり（総当たり。各 ${n} 試合）`);
    console.log(table(SERIES_HEADER, r.dayNight.map(seriesRow)));
  }
  console.log(`\n→ ${writeOut('options.json', r)}`);
}
