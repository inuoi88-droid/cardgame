// 書き出し・取り込みのカードのグループ（決定事項 #109）：任意の項目。古い書き出しもそのまま読め、取り込みでは名前でまとめて ID を付け替える
import { describe, expect, it } from 'vitest';
import { buildExport, mergeImport, parseGroup, parseImport, type CardGroup } from '../src/engine/index.ts';
import { EXAMPLES, card } from './helpers.ts';

const cards = Object.values(EXAMPLES);
const g = (id: string, name: string, cardIds: string[], extra: Partial<CardGroup> = {}): CardGroup => ({ v: 1, id, name, color: 'red', cardIds, ...extra });

let counter = 0;
const newId = () => `new-${++counter}`;

describe('グループの書き出し', () => {
  it('グループを渡さなければ項目ごと付けない（今までと同じ形）', () => {
    expect('groups' in buildExport(cards, [])).toBe(false);
    expect('groups' in buildExport(cards, [], [])).toBe(false);
  });

  it('書き出すカードの ID だけに絞る（空になったグループも残す）', () => {
    const b = buildExport([EXAMPLES.hinoko], [], [g('g1', '火', [EXAMPLES.hinoko.id, EXAMPLES.todome.id]), g('g2', '空', [EXAMPLES.todome.id])]);
    expect(b.groups).toEqual([g('g1', '火', [EXAMPLES.hinoko.id]), g('g2', '空', [])]);
  });

  it('書き出して読み戻すと同じグループになる', () => {
    const groups = [g('g1', '毒の沼', [EXAMPLES.dokugaNezumi.id], { memo: '毒を撒く\n毒の相手に強い', color: 'green' }), g('g2', '竜デッキ用', [EXAMPLES.hinoko.id, EXAMPLES.todome.id])];
    const r = parseImport(JSON.stringify(buildExport(cards, [], groups)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.groups).toEqual(groups);
    expect(r.value.warnings).toEqual([]);
  });
});

describe('グループの読み取り', () => {
  it('古い書き出し（groups なし）は groups を空で読む', () => {
    const old = { format: 'cardgame-export', version: 1, cards, decks: [] };
    const r = parseImport(JSON.stringify(old));
    expect(r.ok && r.value.groups).toEqual([]);
  });

  it('形の壊れたグループは読み飛ばして警告を出す（カードは読む）', () => {
    const bundle = { ...buildExport(cards, []), groups: [{ id: 'x', name: '', cardIds: [] }, { id: 'y', name: 'ok', cardIds: 'nope' }, 3, g('z', '良い', [])] };
    const r = parseImport(JSON.stringify(bundle));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.cards).toHaveLength(4);
    expect(r.value.groups.map((x) => x.name)).toEqual(['良い']);
    expect(r.value.warnings).toHaveLength(3);
  });

  it('名前・メモ・色・カード ID をそろえる（長すぎる名前は切り、知らない色は既定、重なる ID は1つ）', () => {
    const r = parseGroup({ id: 'a', name: '  とても\n長い名前のグループですよ本当に長いのです  ', color: 'Not A Color', memo: '‮あ\r\n\r\n\r\n\r\nい  ', cardIds: ['c1', 'c1', 5, '', 'c2'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([...r.value.name].length).toBeLessThanOrEqual(20);
    expect(r.value.name.startsWith('とても 長い')).toBe(true);
    expect(r.value.color).toBe('slate');
    expect(r.value.memo).toBe('あ\n\nい');
    expect(r.value.cardIds).toEqual(['c1', 'c2']);
  });

  it('グループだけの書き出しも読める', () => {
    const r = parseImport(JSON.stringify({ format: 'cardgame-export', version: 1, cards: [], decks: [], groups: [g('g', 'だけ', [])] }));
    expect(r.ok && r.value.groups).toHaveLength(1);
  });
});

describe('グループの取り込み（統合）', () => {
  it('同じ名前（全角半角・大文字小文字の違いは同じとみなす）は手元のグループにカードを足す。色は手元のまま、手元にメモが無ければ取り込む', () => {
    const mine = [g('m1', 'Dragon', [EXAMPLES.hinoko.id], { color: 'blue' })];
    const inc = [g('i1', 'ＤＲＡＧＯＮ', [EXAMPLES.hinoko.id, EXAMPLES.todome.id], { memo: '竜で殴る', color: 'red' })];
    const m = mergeImport(cards, [], { cards: [], decks: [], groups: inc }, newId, mine);
    expect(m.groups).toEqual([g('m1', 'Dragon', [EXAMPLES.hinoko.id, EXAMPLES.todome.id], { color: 'blue', memo: '竜で殴る' })]);
    expect(m.addedGroups).toBe(0);
    expect(m.mergedGroups).toBe(1);
    // 手元の配列は変えない
    expect(mine[0]!.cardIds).toEqual([EXAMPLES.hinoko.id]);
  });

  it('カードの ID の付け替え（中身が同じ・ID が重なる）に合わせて、グループの中の ID も付け替える', () => {
    const mine = [EXAMPLES.hinoko, EXAMPLES.todome];
    const sameContent = { ...EXAMPLES.hinoko, id: 'their-hinoko' };
    const clash = card({ id: EXAMPLES.todome.id, name: '別物', cost: 2 });
    const fresh = card({ id: 'their-new', name: '新顔' });
    const inc = [g('ig', '取り込み', ['their-hinoko', EXAMPLES.todome.id, 'their-new', 'missing'])];
    const m = mergeImport(mine, [], { cards: [sameContent, clash, fresh], decks: [], groups: inc }, newId, []);
    const clashId = m.cards.find((c) => c.name === '別物')!.id;
    expect(clashId).not.toBe(EXAMPLES.todome.id);
    expect(m.groups).toHaveLength(1);
    // 中身が同じ → 手元の ID、ID が重なった → 新しい ID、新しいカード → そのまま、どこにも無い ID → 落とす
    expect(m.groups[0]!.cardIds).toEqual([EXAMPLES.hinoko.id, clashId, 'their-new']);
    expect(m.addedGroups).toBe(1);
  });

  it('ID が手元のグループと重なる別の名前のグループは新しい ID にする', () => {
    const m = mergeImport(cards, [], { cards: [], decks: [], groups: [g('g1', 'べつ', [])] }, () => 'fresh', [g('g1', 'もと', [])]);
    expect(m.groups.map((x) => [x.id, x.name])).toEqual([
      ['g1', 'もと'],
      ['fresh', 'べつ'],
    ]);
  });

  it('グループを渡さない呼び方（今までの呼び出し）でも動き、groups は空', () => {
    const m = mergeImport(cards, [], { cards: [], decks: [] }, newId);
    expect(m.groups).toEqual([]);
    expect(m.addedGroups).toBe(0);
  });

  it('同じものをもう一度取り込んでも増えない', () => {
    const groups = [g('g1', '毒', [EXAMPLES.dokugaNezumi.id], { memo: 'm' })];
    const once = mergeImport([], [], { cards, decks: [], groups }, newId, []);
    const twice = mergeImport(once.cards, once.decks, { cards, decks: [], groups }, newId, once.groups);
    expect(twice.groups).toEqual(once.groups);
    expect(twice.addedGroups + twice.mergedGroups).toBe(0);
  });
});
