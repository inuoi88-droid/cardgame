// エクスポートとインポート
import { describe, expect, it } from 'vitest';
import { buildExport, exportDeck, isNameTaken, mergeImport, parseImport, uniqueName, type Deck } from '../src/engine/index.ts';
import { EXAMPLES } from './helpers.ts';

const cards = Object.values(EXAMPLES);
const deck: Deck = { v: 1, id: 'deck1', name: '毒デッキ', entries: [{ cardId: EXAMPLES.hinoko.id, count: 30 }] };

let counter = 0;
const newId = () => `new-${++counter}`;

describe('エクスポート→インポート', () => {
  it('書き出したものをそのまま読み戻せる', () => {
    const text = JSON.stringify(buildExport(cards, [deck]));
    const r = parseImport(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.cards).toEqual(cards);
    expect(r.value.decks).toEqual([deck]);
    expect(r.value.warnings).toEqual([]);
  });

  it('デッキの書き出しには使っているカードだけが入る', () => {
    const b = exportDeck(deck, new Map(cards.map((c) => [c.id, c])));
    expect(b.cards.map((c) => c.name)).toEqual(['火の粉']);
    expect(b.decks).toHaveLength(1);
  });

  it('カード1枚やカードの配列も読める', () => {
    const one = parseImport(JSON.stringify(EXAMPLES.todome));
    expect(one.ok && one.value.cards[0]!.name).toBe('とどめの一撃');
    const list = parseImport(JSON.stringify(cards));
    expect(list.ok && list.value.cards).toHaveLength(4);
  });

  it('壊れたJSONや関係ないデータは理由付きで拒否する', () => {
    expect(parseImport('{abc')).toEqual({ ok: false, error: 'JSONとして読めませんでした' });
    expect(parseImport('{"hello":1}').ok).toBe(false);
  });

  it('形の壊れたカードは読み飛ばして警告を出す', () => {
    const bad = { ...EXAMPLES.hinoko, id: 'bad', effects: [{ id: 'damage', timing: 'sometime', target: 'chosen' }] };
    const r = parseImport(JSON.stringify(buildExport([EXAMPLES.todome, bad as never], [])));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.cards.map((c) => c.name)).toEqual(['とどめの一撃']);
    expect(r.value.warnings).toEqual(['「火の粉」の効果が正しくありません']);
  });

  it('知らない項目は取り除く', () => {
    const r = parseImport(JSON.stringify({ ...EXAMPLES.hinoko, points: 999, cardType: 'legend' }));
    expect(r.ok && Object.keys(r.value.cards[0]!)).toEqual(['v', 'id', 'name', 'icon', 'rarity', 'cost', 'stats', 'keywords', 'effects', 'drawbacks']);
  });
});

describe('取り込み時の統合', () => {
  it('中身が同じカードは増やさない', () => {
    const m = mergeImport(cards, [], { cards, decks: [] }, newId);
    expect(m.cards).toHaveLength(4);
    expect(m.addedCards).toBe(0);
    expect(m.unchangedCards).toBe(4);
  });

  it('IDが同じで中身が違うカードは新しいIDにし、名前が重なれば番号を付ける。デッキの参照も付け替える', () => {
    const changed = { ...EXAMPLES.hinoko, cost: 0 };
    const incomingDeck: Deck = { ...deck, id: 'deck2', entries: [{ cardId: changed.id, count: 30 }] };
    const m = mergeImport(cards, [deck], { cards: [changed], decks: [incomingDeck] }, newId);
    const added = m.cards[m.cards.length - 1]!;
    expect(added.id).not.toBe(EXAMPLES.hinoko.id);
    expect(added.name).toBe('火の粉(2)');
    expect(m.renamed).toEqual([{ from: '火の粉', to: '火の粉(2)' }]);
    expect(m.decks[1]!.entries[0]!.cardId).toBe(added.id);
    expect(m.addedDecks).toBe(1);
  });
});

describe('カード名', () => {
  it('同じ名前はコレクション内で使えない（前後の空白は無視）', () => {
    expect(isNameTaken(cards, ' 火の粉 ')).toBe(true);
    expect(isNameTaken(cards, '火の粉', EXAMPLES.hinoko.id)).toBe(false);
    expect(isNameTaken(cards, '新しいカード')).toBe(false);
  });

  it('重なったら番号を付け、16文字を超えないよう縮める', () => {
    expect(uniqueName('火の粉', new Set(['火の粉']))).toBe('火の粉(2)');
    expect(uniqueName('火の粉', new Set(['火の粉', '火の粉(2)']))).toBe('火の粉(3)');
    const long = 'あ'.repeat(16);
    expect([...uniqueName(long, new Set([long]))]).toHaveLength(16);
  });
});
