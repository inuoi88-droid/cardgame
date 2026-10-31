// プリセットデッキの書き換え（決定事項 #148）：上書きの重ね方・下書きの操作・画面の道すじ
import { describe, expect, it } from 'vitest';
import { analyzeDeck } from '../src/engine/index.ts';
import { PRESET_DECKS, isPresetDeckId, presetEditProblem, withPresetOverrides, type PresetOverride } from '../src/presets.ts';
import { overrideOf, samePreset, setCount, replaceCard } from '../src/ui/plaza/presetDraft.ts';

const p = PRESET_DECKS[1]!;

describe('プリセットデッキの上書き', () => {
  it('上書きが無ければ元のまま。あればデッキの中身とカードだけ替わり、名前・説明・並びは元のまま', () => {
    expect(withPresetOverrides(PRESET_DECKS, [])).toEqual([...PRESET_DECKS]);
    const o = overrideOf(p);
    const changed: PresetOverride = replaceCard(o, { ...o.cards[0]!, name: '改名' });
    const out = withPresetOverrides(PRESET_DECKS, [changed, { ...changed, id: 'preset-deck-unknown' }]);
    expect(out.map((x) => x.id)).toEqual(PRESET_DECKS.map((x) => x.id));
    expect(out[1]!.name).toBe(p.name);
    expect(out[1]!.description).toBe(p.description);
    expect(out[1]!.cards[0]!.name).toBe('改名');
    expect(out[0]).toBe(PRESET_DECKS[0]);
  });
  it('デッキで使わないカードは配らない', () => {
    const o = setCount(overrideOf(p), p.cards[0]!.id, 0);
    expect(o.cards.some((c) => c.id === p.cards[0]!.id)).toBe(false);
    const withStray = { ...o, cards: [...o.cards, p.cards[0]!] };
    expect(withPresetOverrides(PRESET_DECKS, [withStray])[1]!.cards.some((c) => c.id === p.cards[0]!.id)).toBe(false);
  });
  it('ID の検査：プリセットのデッキか・カードの ID は preset- で始まり重ならない', () => {
    expect(isPresetDeckId(p.deck.id)).toBe(true);
    expect(isPresetDeckId('official-x')).toBe(false);
    expect(presetEditProblem(overrideOf(p))).toBeNull();
    expect(presetEditProblem({ id: p.deck.id, cards: [p.cards[0]!, p.cards[0]!] })).toContain('同じ ID');
    expect(presetEditProblem({ id: p.deck.id, cards: [{ ...p.cards[0]!, id: 'official-a' }] })).toContain('ID が正しくありません');
  });
});

describe('下書きの操作', () => {
  it('枚数を変える・0で外す。同じ中身かを比べられる', () => {
    const o = overrideOf(p);
    expect(samePreset(o, overrideOf(p))).toBe(true);
    const id = p.deck.entries[0]!.cardId;
    const less = setCount(o, id, p.deck.entries[0]!.count - 1);
    expect(samePreset(less, o)).toBe(false);
    const a = analyzeDeck(less.deck, new Map(less.cards.map((c) => [c.id, c])));
    expect(a.total).toBe(analyzeDeck(o.deck, new Map(o.cards.map((c) => [c.id, c]))).total - 1);
    expect(a.valid).toBe(false);
    expect(samePreset(setCount(less, id, p.deck.entries[0]!.count), o)).toBe(true);
  });
});

describe('画面の道すじ', () => {
  it('#/presets・#/presets/<デッキ>・#/presets/<デッキ>/<カード>', async () => {
    (globalThis as { window?: unknown }).window ??= { location: { hash: '' }, addEventListener: () => undefined };
    const { parseRoute } = await import('../src/ui/router.ts');
    expect(parseRoute('#/presets')).toEqual({ page: 'presets' });
    expect(parseRoute(`#/presets/${p.deck.id}`)).toEqual({ page: 'presetEdit', id: p.deck.id });
    expect(parseRoute(`#/presets/${p.deck.id}/${p.cards[0]!.id}`)).toEqual({ page: 'presetCard', id: p.deck.id, cardId: p.cards[0]!.id });
  });
});
