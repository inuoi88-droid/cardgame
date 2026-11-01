// プレイヤーの報告 #20・#23・#24（2026-11-01 の確認。決定事項 #149）の値段を測る。基準デッキ B0 の1つの枠（10枚）を報告の形の
// カードに差し替えて、元の B0 と戦わせる（CPU ふつう・先攻は交互）。「能力あり」と「同じカードで能力なし」を並べて、能力のぶんの差を見る。
//   node scripts/sim/feedback-1101.mts [試合数] [キー…]   例：node scripts/sim/feedback-1101.mts 200 delve delve0
// 認める目安（docs/FEEDBACK_TRIAGE.md）：勝率が 60% 以上か 40% 以下で、95% 信頼区間が 50% をまたがない。
import { B0, argN, buildDeck, burnCard, fitValue, fx, isMain, makeCard, monsterAtCap, pct, series, type DeckSpec } from './lib.mts';
import { BALANCE, analyzeCard, type CardDef } from '../../src/engine/index.ts';

// DELVE_STEP=8 で探査の1つあたりの値段（倍率1の数）だけ差し替えて試せる（カードを作るのは主のスレッドなので、ここで足りる）
if (process.env.DELVE_STEP) (BALANCE.abilities.delve as { perStep: number }).perStep = Number(process.env.DELVE_STEP) * BALANCE.amountScale;

const SOLDIER = () => monsterAtCap('兵士', 1, 3, 3);
const FIREBALL = () => burnCard(7, '火球');
const WARRIOR = () => monsterAtCap('戦士', 2, 5, 5);

/** B0 の1枠を差し替えたデッキ */
const swap = (name: string, slot: 'soldier' | 'fireball' | 'warrior', card: CardDef, count = 10): DeckSpec => {
  const rest: [CardDef, number][] = [];
  if (slot !== 'soldier') rest.push([SOLDIER(), 10]);
  if (slot !== 'fireball') rest.push([FIREBALL(), 10]);
  if (slot !== 'warrior') rest.push([WARRIOR(), 10]);
  const kept: [CardDef, number][] = count < 10 ? [[slot === 'soldier' ? SOLDIER() : slot === 'fireball' ? FIREBALL() : WARRIOR(), 10 - count]] : [];
  return buildDeck(name, [[card, count], ...kept, ...rest]);
};

/** B0 の1枠のうち cards.length×each 枚を差し替えたデッキ（残りは元のカード） */
const swapMany = (name: string, slot: 'soldier' | 'fireball' | 'warrior', cards: CardDef[], each: number): DeckSpec => {
  const orig = slot === 'soldier' ? SOLDIER() : slot === 'fireball' ? FIREBALL() : WARRIOR();
  const rest: [CardDef, number][] = [];
  if (slot !== 'soldier') rest.push([SOLDIER(), 10]);
  if (slot !== 'fireball') rest.push([FIREBALL(), 10]);
  if (slot !== 'warrior') rest.push([WARRIOR(), 10]);
  return buildDeck(name, [...cards.map((c): [CardDef, number] => [c, each]), [orig, 10 - cards.length * each], ...rest]);
};

/**
 * 報告 #24 の形：コスト5・コモンのモンスターに探査。報告のカード（攻撃力10・守備力1・自己修理4）は探査の値段が上がると作れないので、
 * 攻撃力・体力を同じ数 v にして作れる最大にする（守備力1・自己修理4はそのまま。作れなければ外す）
 */
const bob = (delve: boolean) => {
  for (const extra of [{ defense: 1, repair: true }, { defense: 0, repair: false }]) {
    try {
      return fitValue('common', 5, (v) => ({
        stats: { attack: v, hp: v, defense: extra.defense },
        keywords: extra.repair ? [{ id: 'selfRepair', value: 4 }] : [],
        ...(delve ? { abilities: [{ id: 'delve' }] } : {}),
        name: delve ? `探査の大型${v}` : `大型${v}`,
      }), 30, 1).card;
    } catch {
      // 守備力・自己修理を外して作り直す
    }
  }
  throw new Error('探査の大型が作れない');
};

/** 報告 #23 の形：エピックのパワー（自分のターン開始時に相手にダメージ）。血の支払い2つあり／なし（コスト4。ダメージは作れる最大） */
const power = (life: boolean) =>
  fitValue('epic', 4, (v) => ({
    effects: [fx({ id: 'damage', value: v, timing: 'turnStart', target: 'enemyPlayer' })],
    ...(life ? { abilities: [{ id: 'lifePay', value: 2 }] } : {}),
    name: life ? `血のパワー${v}` : `パワー${v}`,
  }), 20, 1).card;

/**
 * 報告 #20 の形：攻撃するたび・破壊されたとき2つの山札消滅（疾走・二回攻撃、体力は今の最低）。報告のまま（消滅3つずつ）は今の値段で
 * 予算を超えるので、作れる最大の枚数（v）で作る。v が0になるならキーワードを外した形
 */
const miller = () => {
  for (const keywords of [[{ id: 'doubleAttack' }, { id: 'haste' }], [{ id: 'haste' }], []]) {
    for (let v = 3; v >= 1; v--) {
      const c = makeCard(`山札消滅の犬${v}`, 'common', 2, {
        stats: { attack: 0, hp: 1, defense: 0 },
        keywords,
        effects: [
          fx({ id: 'exileMill', value: v, target: 'enemyPlayer', timing: 'attack' }),
          fx({ id: 'exileMill', value: v, target: 'enemyPlayer', timing: 'destroyed' }),
          fx({ id: 'exileMill', value: v, target: 'enemyPlayer', timing: 'destroyed' }),
        ],
      });
      if (analyzeCard(c).valid) return c;
    }
  }
  throw new Error('山札消滅の犬が作れない');
};

/** エピックは同名2枚まで：同じ中身を別名で2枚ずつ */
const twoNames = (make: () => CardDef): CardDef[] => [make(), { ...make(), id: `${make().id}-b`, name: `${make().name}b` }];

export const DECKS: Record<string, () => DeckSpec> = {
  delve: () => swap('探査の大型', 'warrior', bob(true)),
  delve0: () => swap('大型（探査なし）', 'warrior', bob(false)),
  life: () => swapMany('血のパワー', 'fireball', twoNames(() => power(true)), 2),
  life0: () => swapMany('パワー（血なし）', 'fireball', twoNames(() => power(false)), 2),
  mill: () => swap('山札消滅の犬', 'soldier', miller()),
};

if (isMain(import.meta.url)) {
  const n = argN(200);
  const keys = process.argv.slice(3).filter((k) => k in DECKS);
  for (const key of keys.length ? keys : Object.keys(DECKS)) {
    let deck: DeckSpec;
    try {
      deck = DECKS[key]!();
    } catch (e) {
      console.log(`${key}: 作れない（${(e as Error).message}）`);
      continue;
    }
    const r = await series(deck, B0(), n, { label: key });
    const p = r.winRate;
    const half = 1.96 * Math.sqrt((p * (1 - p)) / Math.max(1, r.games));
    const cards = deck.cards.map((c) => `${c.name}（コスト${c.cost}・${analyzeCard(c).points.total}/${analyzeCard(c).points.cap}pt）`).join('・');
    console.log(`${key.padEnd(7)} vs B0  ${pct(p)}（95%: ${pct(Math.max(0, p - half))}〜${pct(Math.min(1, p + half))}）  平均 ${r.turnsMean.toFixed(1)}T  ${cards}`);
  }
}
