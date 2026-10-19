/**
 * 全部をほどほどの試合数で回して、scripts/sim/out/summary.json と summary.md にまとめる。
 *   node scripts/sim/run-all.mts [n]   … n はプリセット総当たりの1組み合わせの試合数（既定 40）。
 *                                        極端デッキは n/4（最低8）、長さの分布は n、CPU 検査の実戦は n/20（最低3）
 * npm run sim でも同じ。目安：n=10 で 7〜8 分、n=40 で 20〜30 分（4 並列。極端デッキ 48 種と CPU 検査のリーサル探索が重い）
 */
import { BALANCE, argN, isMain, writeOut } from './lib.mts';
import * as presets from './presets.mts';
import * as stress from './stress.mts';
import * as length from './length.mts';
import * as aicheck from './aicheck.mts';

export async function runAll(n: number) {
  const t0 = performance.now();
  const step = <T,>(label: string, p: Promise<T>): Promise<T> => {
    console.error(`--- ${label}`);
    return p;
  };
  const r = {
    date: new Date().toISOString(),
    n,
    scale: BALANCE.scale,
    battle: { playerHp: BALANCE.battle.playerHp, energySchedule: BALANCE.battle.energySchedule, firstPlayerFirstTurnPenalty: BALANCE.battle.firstPlayerFirstTurnPenalty },
    presets: await step('プリセット総当たり', presets.run(n)),
    length: await step('試合の長さ', length.run(n)),
    stress: await step('極端なデッキ', stress.run(Math.max(8, Math.floor(n / 4)))),
    aicheck: await step('CPU 検査', aicheck.run(Math.max(3, Math.floor(n / 20)))),
    seconds: 0,
  };
  r.seconds = Math.round((performance.now() - t0) / 1000);
  return r;
}

export function render(r: Awaited<ReturnType<typeof runAll>>): { text: string; md: string } {
  const parts = [presets.report(r.presets), length.report(r.length), stress.report(r.stress), aicheck.report(r.aicheck)];
  const head = `シミュレーションのまとめ（${r.date}、倍率 ${r.scale}、HP ${r.battle.playerHp}、所要 ${r.seconds} 秒）`;
  return {
    text: [`# ${head}`, ...parts.map((p) => p.text)].join('\n\n'),
    md: [`# ${head}`, ...parts.map((p) => p.md)].join('\n\n'),
  };
}

if (isMain(import.meta.url)) {
  const r = await runAll(argN(60));
  const out = render(r);
  console.log(out.text);
  const json = writeOut('summary.json', r);
  const md = writeOut('summary.md', out.md + '\n');
  console.log(`\n→ ${json}\n→ ${md}`);
}
