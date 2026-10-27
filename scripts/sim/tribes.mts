/**
 * 種族の特徴（決定事項 #143）の測定。
 *
 *   node scripts/sim/tribes.mts 60          # 1組み合わせ 60 試合
 *
 * - plain：コスト2のバニラ（N/N。作れる最大）20枚＋火球10枚。種族の札だけが違う → 特性と揃いの強さ（得意・苦手は関係しない）
 *   - 各種族 vs 種族なし、と、種族どうしの総当たり
 * - fav：コスト2の「得意なキーワード1つ＋N/N」20枚＋火球10枚。種族あり（割引で数値が大きい）vs 同じキーワードの種族なし
 *   → 得意の割引・特性・揃いを合わせた強さ
 */
import { TRIBE_IDS, TRIBE_LABEL, type KeywordInstance, type TribeId } from '../../src/engine/index.ts';
import { argN, buildDeck, burnCard, fitValue, isMain, pct, series, table, writeOut, type DeckSpec } from './lib.mts';

/** 種族ごとの、いちばん「らしい」得意なもの（機械は守備力） */
const SIGNATURE: Record<TribeId, { kw?: string; defense?: number }> = {
  beast: { kw: 'haste' },
  dragon: { kw: 'flying' },
  undead: { kw: 'lifelink' },
  machine: { defense: 1 },
  spirit: { kw: 'stealth' },
  human: { kw: 'taunt' },
};

const fireball = () => burnCard(undefined, '火球');

function plain(tribe: TribeId | undefined): DeckSpec {
  const tag = tribe ?? 'none';
  const { card } = fitValue('common', 2, (v) => ({ stats: { attack: v, hp: v, defense: 0 }, ...(tribe ? { tribe } : {}), name: `素${tag}${v}` }));
  return buildDeck(`plain-${tag}`, [
    [card, 20],
    [fireball(), 10],
  ]);
}

function fav(sig: TribeId, tribe: TribeId | undefined): DeckSpec {
  const s = SIGNATURE[sig];
  const tag = `${sig}${tribe ? '' : '-none'}`;
  const keywords: KeywordInstance[] = s.kw ? [{ id: s.kw }] : [];
  const { card } = fitValue('common', 2, (v) => ({
    stats: { attack: v, hp: v, defense: s.defense ?? 0 },
    keywords,
    ...(tribe ? { tribe } : {}),
    name: `得${tag}${v}`,
  }));
  return buildDeck(`fav-${tag}`, [
    [card, 20],
    [fireball(), 10],
  ]);
}

async function main(n: number): Promise<void> {
  const out: Record<string, unknown> = {};
  // 1) plain：種族 vs 種族なし
  const none = plain(undefined);
  const rows1: (string | number)[][] = [];
  for (const [i, t] of TRIBE_IDS.entries()) {
    const r = await series(plain(t), none, n, { seedBase: 100 + i * 7, label: `plain ${t}` });
    rows1.push([`${TRIBE_LABEL[t]} vs なし`, n, pct(r.winRate), pct(r.drawRate), r.turnsMedian]);
  }
  console.log('■ バニラ20＋火球10：種族の札だけ違う（特性と揃い）');
  console.log(table(['対戦', 'n', '種族の勝率', '引分', '中央T'], rows1));
  out.plain = rows1;

  // 2) plain：種族どうしの総当たり
  const score: Record<string, number[]> = {};
  const rows2: (string | number)[][] = [];
  for (let i = 0; i < TRIBE_IDS.length; i++) {
    for (let j = i + 1; j < TRIBE_IDS.length; j++) {
      const a = TRIBE_IDS[i]!;
      const b = TRIBE_IDS[j]!;
      const r = await series(plain(a), plain(b), n, { seedBase: 1000 + i * 10 + j, label: `rr ${a}-${b}` });
      (score[a] ??= []).push(r.winRate);
      (score[b] ??= []).push(1 - r.winRate - r.drawRate);
      rows2.push([`${TRIBE_LABEL[a]} vs ${TRIBE_LABEL[b]}`, n, pct(r.winRate), pct(r.drawRate)]);
    }
  }
  console.log('\n■ バニラの種族どうし（総当たり）');
  console.log(table(['対戦', 'n', 'A勝率', '引分'], rows2));
  const avg = TRIBE_IDS.map((t) => [TRIBE_LABEL[t], pct((score[t] ?? []).reduce((x, y) => x + y, 0) / Math.max(1, (score[t] ?? []).length))]);
  console.log(table(['種族', '平均勝率'], avg));
  out.rr = { rows: rows2, avg };

  // 3) fav：得意なキーワードのデッキ、種族あり vs なし
  const rows3: (string | number)[][] = [];
  for (const [i, t] of TRIBE_IDS.entries()) {
    const withT = fav(t, t);
    const without = fav(t, undefined);
    const r = await series(withT, without, n, { seedBase: 3000 + i * 7, label: `fav ${t}` });
    rows3.push([`${TRIBE_LABEL[t]}（${withT.cards[0]!.name}）vs なし（${without.cards[0]!.name}）`, n, pct(r.winRate), pct(r.drawRate), r.turnsMedian]);
  }
  console.log('\n■ 得意なもの＋N/N 20＋火球10：種族あり vs 同じキーワードの種族なし（得意の割引・特性・揃い）');
  console.log(table(['対戦', 'n', '種族の勝率', '引分', '中央T'], rows3));
  out.fav = rows3;
  writeOut('tribes.json', out);
}

if (isMain(import.meta.url)) await main(argN(60));
