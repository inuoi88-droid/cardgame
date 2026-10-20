// △ の MTG 要素の統合レビュー（決定事項 #101）で見つけた不具合の再現テスト。倍率1
import { describe, expect, it } from 'vitest';
import { battle, type AbilityInstance, type CardDef, type EffectInstance } from '../src/engine/index.ts';
import { card } from './helpers.ts';
import { act, endTurn, fx, giveCard, rich, startGame } from './battle/helpers.ts';
import { payNotes } from '../src/ui/components/PointPanel.tsx';

type G = battle.GameState;
type PlayAction = Extract<battle.Action, { type: 'playCard' }>;

let seq = 0;
const AB = (id: string, value?: number, extra: Partial<AbilityInstance> = {}): AbilityInstance => ({ id, ...(value === undefined ? {} : { value }), ...extra });
const SPELL = (effects: EffectInstance[], extra: Partial<CardDef> = {}) => card({ id: `txs${++seq}`, name: `呪文${seq}`, rarity: 'legend', cost: 3, effects, ...extra });
const MON = (a: number, h: number, extra: Partial<CardDef> = {}) =>
  card({ id: `txm${++seq}`, name: `獣${seq}`, rarity: 'legend', cost: 3, stats: { attack: a, hp: h, defense: 0 }, ...extra });
const play = (g: G, cardUid: string, extra: Partial<PlayAction> = {}) => act(g, { type: 'playCard', player: g.active, cardUid, chosen: {}, ...extra });
const fresh = (energy = 20) => rich(startGame(), 0, energy);
/** 相手から見える状態（ログを含む）の JSON */
const seen = (g: G, p: battle.PlayerId) => JSON.stringify(battle.viewFor(g, p));
const faceDownOf = (g: G, p: battle.PlayerId) => g.players[p].board.find((m) => m.faceDown);

const DMG4 = fx({ id: 'damage', value: 4 });

// ---------------------------------------------------------------- 隠す情報（viewFor・ログ）
describe('裏向きのモンスター・予顕のカードの uid を相手に見せない', () => {
  // 山札の uid は対戦の開始時にデッキの並び（同じカードが続く）で振られるので、uid が分かると正体の見当がつく
  it('変装で裏向きに出したモンスターは、相手から見て本当のカードの uid を持たない（場・ログ）', () => {
    let g = fresh();
    const c = giveCard(g, 0, MON(4, 6, { cost: 5, abilities: [AB('disguise', 1)] }));
    g = play(g, c, { alt: 'faceDown' });
    const m = faceDownOf(g, 0)!;
    expect(m.faceDown?.card?.uid).toBe(c);
    expect(seen(g, 1)).not.toContain(`"${c}"`);
    // 持ち主には分かる
    expect(seen(g, 0)).toContain(`"${c}"`);
    // 表にすると本当のカードになる（モンスターの uid はそのまま）
    g = act(g, { type: 'reveal', player: 0, uid: m.uid });
    expect(g.players[0].board.find((x) => x.uid === m.uid)?.card.uid).toBe(c);
  });

  it('変装で出したときのログに、本当の印刷コストとの差（変装で+N／−N）を書かない', () => {
    let g = fresh();
    const c = giveCard(g, 0, MON(4, 6, { cost: 5, abilities: [AB('disguise', 1)] }));
    g = play(g, c, { alt: 'faceDown' });
    const v = battle.viewFor(g, 1);
    const line = v.log.find((l) => l.text.includes('裏向きで出した'))!;
    expect(line.text).not.toMatch(/変装で[+−]/);
  });

  it('予示で山札から裏向きに出したモンスターも、相手に山札の uid を見せない', () => {
    let g = fresh();
    const top = g.players[0].deck[0]!.uid;
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'manifest', target: 'self' })])));
    expect(faceDownOf(g, 0)?.faceDown?.card?.uid).toBe(top);
    expect(seen(g, 1)).not.toContain(`"${top}"`);
  });

  it('予顕で伏せたカードは、相手から見て uid を持たない（待機ゾーン・ログ）', () => {
    let g = fresh();
    const c = giveCard(g, 0, SPELL([DMG4], { abilities: [AB('foretell', 1)] }));
    g = act(g, { type: 'setAside', player: 0, cardUid: c, kind: 'foretell' });
    expect(g.players[0].waiting?.[0]?.card.uid).toBe(c);
    expect(seen(g, 1)).not.toContain(`"${c}"`);
    expect(battle.viewFor(g, 1).players[0].waiting).toHaveLength(1);
    // 次の自分のターンに使える（持ち主の見え方では uid のまま）
    g = rich(endTurn(endTurn(g)), 0);
    expect(battle.waitingPlayInfos(g, 0).map((i) => i.card.uid)).toEqual([c]);
  });
});

// ---------------------------------------------------------------- 裏向き：表にしたときの体力
describe('裏向きのモンスターを表にしたとき', () => {
  it('受けたダメージで本当の体力が尽きるなら、表にしたときに破壊される（体力0のまま場に残らない）', () => {
    let g = fresh();
    // 本当の体力1（裏向きは2/2）。裏向きの間に1ダメージ
    const c = giveCard(g, 0, MON(3, 1, { cost: 3, abilities: [AB('disguise', 1)] }));
    g = play(g, c, { alt: 'faceDown' });
    const m = faceDownOf(g, 0)!;
    m.hp -= 1;
    g = act(g, { type: 'reveal', player: 0, uid: m.uid });
    expect(g.players[0].board.find((x) => x.uid === m.uid)).toBeUndefined();
    expect(g.players[0].discard.map((x) => x.uid)).toContain(c);
  });
});

// ---------------------------------------------------------------- エディターの内訳：追加の支払い・待機ゾーンの実コストの見込み
describe('内訳の実コストの見込み（追加の支払い・待機ゾーン）', () => {
  it('試作・想起・召集・予顕・変装は、能力の値から実コストの見込みを出す', () => {
    const notes = (c: CardDef) => payNotes(c).join(' / ');
    expect(notes(MON(3, 3, { cost: 4, abilities: [AB('prototype', 2)] }))).toContain('コスト2で半分の強さ');
    expect(notes(MON(3, 3, { cost: 4, abilities: [AB('evoke', 1)] }))).toContain('コスト1で出し');
    expect(notes(SPELL([DMG4], { cost: 3, abilities: [AB('convoke')] }))).toContain('最低0');
    expect(notes(SPELL([DMG4], { cost: 3, abilities: [AB('foretell', 2)] }))).toContain('後のターンにコスト1');
    expect(notes(MON(3, 3, { cost: 3, abilities: [AB('disguise', 2)] }))).toContain('合計4');
    expect(payNotes(SPELL([DMG4]))).toEqual([]);
  });
});
