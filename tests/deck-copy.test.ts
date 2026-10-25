// 戦った相手のデッキのコピー（src/ui/copy/copyLogic.ts）と対戦した相手の記録（src/ui/copy/history.ts）
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BALANCE, analyzeDeck, type CardDef, type Deck } from '../src/engine/index.ts';
import {
  COPY_SUFFIX,
  addToSourceGroup,
  clampSelection,
  copyDeck,
  copyName,
  deckCounts,
  importCards,
  isCopyNameOf,
  ownedCardIds,
  selectAll,
  selectionTotal,
  sourceGroupName,
  uniqueDeckName,
} from '../src/ui/copy/copyLogic.ts';
import {
  OPPONENTS_KEY,
  OPPONENTS_MAX,
  loadOpponents,
  parseHistory,
  pushOpponent,
  recordOpponent,
  resultFor,
  type KeyValueStore,
  type OpponentEntry,
} from '../src/ui/copy/history.ts';
import { makeGroup } from '../src/ui/collection/groups.ts';
import { opponentDeckOf } from '../src/ui/copy/roomDeck.ts';
import { PRESET_DECKS } from '../src/presets.ts';
import { card } from './helpers.ts';

/** 決まった並びの ID */
function ids(prefix = 'n') {
  let i = 0;
  return () => `${prefix}${++i}`;
}
const byId = (cards: readonly CardDef[]) => new Map(cards.map((c) => [c.id, c]));
const total = (d: Pick<Deck, 'entries'>) => d.entries.reduce((s, e) => s + e.count, 0);
const strip = ({ id: _id, name: _name, ...rest }: CardDef) => rest;

const preset = PRESET_DECKS[0]!;

describe('importCards：カードを手元に足す形にする', () => {
  it('中身が同じカードは足さずに手元のカードを使う（名前も同じとき）', () => {
    const mine = { ...preset.cards[0]!, id: 'mine-1' };
    const r = importCards([mine], preset.cards, { sourceName: '相手', newId: ids() });
    expect(r.idMap[preset.cards[0]!.id]).toBe('mine-1');
    expect(r.reused).toEqual([preset.cards[0]!.id]);
    expect(r.cards).toHaveLength(preset.cards.length - 1);
    expect(r.cards.some((c) => c.id === 'mine-1')).toBe(false);
  });

  it('足すカードの ID はいつも新しい（相手の ID が手元と重なっても）', () => {
    const clash = card({ id: preset.cards[1]!.id, name: '別のカード', cost: 2 });
    const r = importCards([clash], preset.cards, { sourceName: '相手', newId: ids('new-') });
    for (const c of r.cards) expect(c.id.startsWith('new-')).toBe(true);
    expect(new Set(r.cards.map((c) => c.id)).size).toBe(r.cards.length);
    expect(r.idMap[preset.cards[1]!.id]).not.toBe(clash.id);
  });

  it('名前が重なって中身が違うカードは「（コピー）」、それも重なれば「（コピー2）」', () => {
    const inc = card({ id: 'x', name: '火の玉', cost: 2 });
    const r1 = importCards([card({ id: 'a', name: '火の玉', cost: 1 })], [inc], { sourceName: '相手', newId: ids() });
    expect(r1.cards[0]!.name).toBe(`火の玉${COPY_SUFFIX}`);
    expect(r1.renamed).toEqual([{ from: '火の玉', to: '火の玉（コピー）' }]);
    const r2 = importCards([card({ id: 'a', name: '火の玉', cost: 1 }), card({ id: 'b', name: '火の玉（コピー）', cost: 3 })], [inc], { sourceName: '相手', newId: ids() });
    expect(r2.cards[0]!.name).toBe('火の玉（コピー2）');
  });

  it('長い名前は16文字に収める', () => {
    const long = 'あいうえおかきくけこさしすせそた';
    expect([...long].length).toBe(BALANCE.card.nameMaxLength);
    const taken = new Set([long, `${[...long].slice(0, 11).join('')}${COPY_SUFFIX}`]);
    const n1 = copyName(long, new Set([long]));
    expect([...n1].length).toBeLessThanOrEqual(BALANCE.card.nameMaxLength);
    expect(n1.endsWith(COPY_SUFFIX)).toBe(true);
    const n2 = copyName(long, taken);
    expect(n2.endsWith('（コピー2）')).toBe(true);
    expect([...n2].length).toBeLessThanOrEqual(BALANCE.card.nameMaxLength);
  });

  it('前にコピーした「（コピー）」のカードも同じカードとして使う（2回コピーしても増えない）', () => {
    const inc = card({ id: 'x', name: '火の玉', cost: 2 });
    const first = importCards([card({ id: 'a', name: '火の玉', cost: 1 })], [inc], { sourceName: '相手', newId: ids() });
    const after = [card({ id: 'a', name: '火の玉', cost: 1 }), ...first.cards];
    const again = importCards(after, [inc], { sourceName: '相手', newId: ids('z') });
    expect(again.cards).toEqual([]);
    expect(again.reused).toEqual(['x']);
    expect(again.idMap.x).toBe(first.cards[0]!.id);
    expect(isCopyNameOf('火の玉（コピー3）', '火の玉')).toBe(true);
    expect(isCopyNameOf('火の玉改', '火の玉')).toBe(false);
  });

  it('中身が同じでも名前が違うカードは別のカード（名前は同名の枚数制限に関わる）', () => {
    const inc = card({ id: 'x', name: '火の玉', cost: 2 });
    const r = importCards([{ ...inc, id: 'a', name: 'ファイアボール' }], [inc], { sourceName: '相手', newId: ids() });
    expect(r.reused).toEqual([]);
    expect(r.cards).toHaveLength(1);
    expect(r.cards[0]!.name).toBe('火の玉');
  });

  it('届いたカードどうしで中身が同じなら1枚にまとめる', () => {
    const a = card({ id: 'x1', name: '盾', cost: 1 });
    const b = { ...a, id: 'x2' };
    const r = importCards([], [a, b], { sourceName: '相手', newId: ids() });
    expect(r.cards).toHaveLength(1);
    expect(r.idMap.x1).toBe(r.idMap.x2);
    expect(r.reused).toEqual([]);
  });

  it('形の壊れたカードは読み飛ばす', () => {
    const bad = { id: 'bad', name: '壊れ' } as unknown as CardDef;
    const r = importCards([], [bad, card({ id: 'ok', name: '正常' })], { sourceName: '相手', newId: ids() });
    expect(r.skipped).toEqual(['bad']);
    expect(r.cards).toHaveLength(1);
  });

  it('レアリティ・コスト・効果はそのまま写す', () => {
    const legend = card({ id: 'L', name: '伝説の竜', rarity: 'legend', cost: 5, stats: { attack: 5, hp: 5, defense: 0 } });
    const r = importCards([], [legend], { sourceName: '相手', newId: ids() });
    expect(strip(r.cards[0]!)).toEqual(strip(legend));
  });
});

describe('copyDeck：デッキごと・選んだカードだけ', () => {
  it('デッキごと：ルールに合ったデッキはコピーしてもルールに合う（30枚・レアリティの枚数もそのまま）', () => {
    for (const p of PRESET_DECKS) {
      const before = analyzeDeck(p.deck, byId(p.cards));
      expect(before.valid, p.name).toBe(true);
      const mine = [card({ id: 'm1', name: p.cards[0]!.name, cost: 0 })]; // 名前だけ重なる手元のカード
      const r = copyDeck(p.deck, p.cards, mine, { name: `${p.name}（コピー）`, sourceName: 'CPU', newId: ids(), newDeckId: () => 'deck-1' });
      const after = analyzeDeck(r.deck, byId([...mine, ...r.cards]));
      expect(after.violations, p.name).toEqual([]);
      expect(after.total).toBe(BALANCE.deck.size);
      expect(after.rarityRows).toEqual(before.rarityRows);
      expect(r.deck.id).toBe('deck-1');
      expect(r.deck.name).toBe(`${p.name}（コピー）`);
      // デッキの中は手元の ID だけ
      const known = new Set([...mine, ...r.cards].map((c) => c.id));
      for (const e of r.deck.entries) expect(known.has(e.cardId)).toBe(true);
    }
  });

  it('選んだカードだけ：枚数はデッキにある枚数まで、0枚は入れない', () => {
    const [a, b, c] = preset.deck.entries;
    const select = { [a!.cardId]: 1, [b!.cardId]: 99, [c!.cardId]: 0, unknown: 3 };
    const r = copyDeck(preset.deck, preset.cards, [], { name: '一部', select, sourceName: '相手', newId: ids() });
    expect(r.cards).toHaveLength(2);
    expect(r.deck.entries.map((e) => e.count)).toEqual([1, b!.count]);
    expect(total(r.deck)).toBe(1 + b!.count);
    const a2 = analyzeDeck(r.deck, byId(r.cards));
    expect(a2.violations.map((v) => v.code)).toEqual(['DECK_SIZE']); // 足りないだけ
  });

  it('clampSelection・selectAll・selectionTotal・deckCounts', () => {
    const deck: Deck = {
      v: 1,
      id: 'd',
      name: 'd',
      entries: [
        { cardId: 'a', count: 2 },
        { cardId: 'b', count: 1 },
        { cardId: 'a', count: 1 },
      ],
    };
    expect(deckCounts(deck)).toEqual(
      new Map([
        ['a', 3],
        ['b', 1],
      ]),
    );
    expect(selectAll(deck)).toEqual({ a: 3, b: 1 });
    expect(clampSelection(deck, { a: 5, b: -1, c: 2 })).toEqual({ a: 3 });
    expect(selectionTotal({ a: 3, b: 1 })).toBe(4);
  });

  it('手元のカードを使うときも、デッキの1か所にまとめる', () => {
    const a = card({ id: 'x1', name: '盾', cost: 1 });
    const deck: Deck = {
      v: 1,
      id: 'd',
      name: 'd',
      entries: [
        { cardId: 'x1', count: 2 },
        { cardId: 'x2', count: 1 },
      ],
    };
    const r = copyDeck(deck, [a, { ...a, id: 'x2' }], [], { name: 'n', sourceName: 's', newId: ids() });
    expect(r.deck.entries).toEqual([{ cardId: r.cards[0]!.id, count: 3 }]);
  });

  it('ownedCardIds：すでに持っているカード', () => {
    const mine = { ...preset.cards[2]!, id: 'mine' };
    expect(ownedCardIds([mine], preset.cards)).toEqual(new Set([preset.cards[2]!.id]));
  });

  it('uniqueDeckName：重なれば番号', () => {
    expect(uniqueDeckName('相手のデッキ（コピー）', [])).toBe('相手のデッキ（コピー）');
    expect(uniqueDeckName('A', [{ name: 'A' }, { name: 'A(2)' }])).toBe('A(3)');
  });
});

describe('グループ「<相手の名前>から」', () => {
  it('無ければ作り、あれば足す', () => {
    const r1 = addToSourceGroup([], 'たろう', ['c1', 'c2'], ids('g'));
    expect(r1.created).toBe(true);
    expect(r1.groups).toHaveLength(1);
    expect(r1.groups[0]!.name).toBe('たろうから');
    expect(r1.groups[0]!.cardIds).toEqual(['c1', 'c2']);
    const r2 = addToSourceGroup(r1.groups, 'たろう', ['c2', 'c3'], ids('h'));
    expect(r2.created).toBe(false);
    expect(r2.groupId).toBe(r1.groupId);
    expect(r2.groups[0]!.cardIds).toEqual(['c1', 'c2', 'c3']);
  });

  it('ほかのグループはそのまま。足すカードが無ければ何もしない', () => {
    const other = makeGroup('o', '毒', 'red', undefined, ['z']);
    const r = addToSourceGroup([other], 'CPU（毒）', [], ids());
    expect(r.groups).toEqual([other]);
    expect(r.groupId).toBeNull();
    const r2 = addToSourceGroup([other], 'CPU（毒）', ['a'], ids());
    expect(r2.groups[0]).toEqual(other);
    expect(r2.groups[1]!.color).not.toBe('red');
  });

  it('名前はグループ名の上限に収め、「から」は残す', () => {
    const name = sourceGroupName('とてもとてもとてもとても長いプレイヤーの名前');
    expect([...name].length).toBeLessThanOrEqual(20);
    expect(name.endsWith('から')).toBe(true);
    expect(sourceGroupName('   ')).toBe('相手から');
  });
});

describe('対戦した相手の記録', () => {
  const entry = (id: string, at: number, over: Partial<OpponentEntry> = {}): OpponentEntry => ({
    id,
    at,
    source: 'cpu',
    opponentName: `CPU（${preset.name}）`,
    deck: preset.deck,
    cards: preset.cards,
    result: 'win',
    ...over,
  });

  it('新しい順に最大20件、同じ ID は置き換える', () => {
    let list: OpponentEntry[] = [];
    for (let i = 0; i < 25; i++) list = pushOpponent(list, entry(`g${i}`, 1000 + i));
    expect(list).toHaveLength(OPPONENTS_MAX);
    expect(list[0]!.id).toBe('g24');
    expect(list.at(-1)!.id).toBe('g5');
    list = pushOpponent(list, entry('g10', 5000, { result: 'loss' }));
    expect(list).toHaveLength(OPPONENTS_MAX);
    const g10 = list.filter((e) => e.id === 'g10');
    expect(g10).toHaveLength(1);
    expect(g10[0]!.result).toBe('loss');
    expect(g10[0]!.at).toBe(1010); // 最初に記録した時刻のまま（並びも変わらない）
    expect(list[0]!.id).toBe('g24');
  });

  it('デッキに使っていないカードは残さない', () => {
    const extra = card({ id: 'unused', name: '使わない' });
    const list = pushOpponent([], entry('a', 1, { cards: [...preset.cards, extra] }));
    expect(list[0]!.cards.some((c) => c.id === 'unused')).toBe(false);
  });

  it('保存データを読む：壊れた件と重なった ID は捨てる', () => {
    const good = entry('a', 2, { friendCode: 'ABCD', source: 'friend' });
    const parsed = parseHistory([good, { id: 'b' }, good, entry('c', 3, { result: null, source: 'draft' }), 'x']);
    expect(parsed.map((e) => e.id)).toEqual(['c', 'a']);
    expect(parsed[1]!.friendCode).toBe('ABCD');
    expect(parsed[0]!.result).toBeNull();
    expect(parseHistory({})).toEqual([]);
  });

  it('resultFor：見ている人から見た結果', () => {
    expect(resultFor({ winner: 0 }, 0)).toBe('win');
    expect(resultFor({ winner: 0 }, 1)).toBe('loss');
    expect(resultFor({ winner: null }, 1)).toBe('draw');
    expect(resultFor(null, 1)).toBeNull();
  });

  it('recordOpponent は渡した保存先に書く（容量不足なら古いものから減らす）', () => {
    const data = new Map<string, string>();
    let limit = Infinity;
    const store: KeyValueStore = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => {
        if (v.length > limit) throw new Error('quota');
        data.set(k, v);
      },
    };
    recordOpponent(entry('a', 1), store);
    recordOpponent(entry('b', 2), store);
    expect(loadOpponents(store).map((e) => e.id)).toEqual(['b', 'a']);
    limit = (data.get(OPPONENTS_KEY)!.length * 2) / 3;
    const saved = recordOpponent(entry('c', 3), store);
    expect(saved.map((e) => e.id)).toEqual(['c']);
    expect(loadOpponents(store).map((e) => e.id)).toEqual(['c']);
  });
});

describe('オンラインの部屋から相手のデッキ（opponentDeckOf）', () => {
  const base = { code: 'ABCD', seat: 0 as const, names: ['わたし', 'たろう'] as [string, string | null] };
  const od = { name: 'たろう', deck: preset.deck, cards: preset.cards };

  it('決着していなければ何も返さない（対戦中・ドラフト中・待機中）', () => {
    for (const status of ['waiting', 'drafting', 'playing'] as const) expect(opponentDeckOf({ ...base, status, opponentDeck: od })).toBeNull();
  });

  it('決着したら opponentDeck を使い、名前は部屋の名前', () => {
    const r = opponentDeckOf({ ...base, status: 'ended', opponentDeck: { ...od, name: '' } });
    expect(r!.name).toBe('たろう');
    expect(r!.deck).toBe(preset.deck);
  });

  it('opponentDeck の無い古いサーバーでも、ドラフトの部屋なら公開の記録から組む', () => {
    const taken = preset.deck.entries.map((e) => ({ card: preset.cards.find((c) => c.id === e.cardId)!, count: e.count }));
    const draft = { done: true, taken: [[], taken] } as unknown as Parameters<typeof opponentDeckOf>[0]['draft'];
    const r = opponentDeckOf({ ...base, status: 'ended', draft });
    expect(total(r!.deck)).toBe(BALANCE.deck.size);
    expect(analyzeDeck(r!.deck, byId(r!.cards)).valid).toBe(true);
    expect(opponentDeckOf({ ...base, status: 'ended' })).toBeNull();
  });
});

describe('コピーの画面の CSS', () => {
  it('カードの部品の規則と !important を置かない', () => {
    const css = readFileSync(join(__dirname, '../src/ui/copy/copy.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const sels = [...css.matchAll(/([^{}]+)\{/g)].map((m) => m[1]!.trim()).filter((s) => !s.startsWith('@'));
    expect(sels.filter((s) => /\.(tcg|hc|mt|card-row|lrow|crow)(?![\w-])|\.(tcg|hc|mt|card-row|lrow|crow)__/.test(s))).toEqual([]);
    expect(css.includes('!important')).toBe(false);
  });
});
