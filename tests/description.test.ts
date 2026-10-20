// カードの説明（任意の短い文章）：読み込み・書き出し・上限・古いデータ・ポイントに関係しないこと
import { describe, expect, it } from 'vitest';
import {
  CARD_DESCRIPTION_MAX,
  analyzeCard,
  buildExport,
  descriptionLength,
  mergeImport,
  normalizeDescription,
  parseCard,
  parseImport,
  type CardDef,
} from '../src/engine/index.ts';
import { checkDeck } from '../src/online/room.ts';
import { PRESET_DECKS } from '../src/presets.ts';
import { EXAMPLES } from './helpers.ts';

const withDesc = (description: unknown): unknown => ({ ...EXAMPLES.hinoko, description });

function parsed(x: unknown): CardDef {
  const r = parseCard(x);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('カードの説明', () => {
  it('書き出し→取り込みで説明がそのまま戻る', () => {
    const c = parsed(withDesc('最初の1枚に。毒と合わせると強い'));
    expect(c.description).toBe('最初の1枚に。毒と合わせると強い');
    const r = parseImport(JSON.stringify(buildExport([c], [])));
    expect(r.ok && r.value.cards[0]).toEqual(c);
  });

  it('説明のない古いカードもそのまま読め、description の項目は増えない', () => {
    const c = parsed(EXAMPLES.hinoko);
    expect(c.description).toBeUndefined();
    expect('description' in c).toBe(false);
  });

  it('前後の空白・改行・制御文字・文字の向きを変える記号を取り除く', () => {
    expect(parsed(withDesc('  炎の\n精霊\t\u0000です  ')).description).toBe('炎の 精霊 です');
    expect(parsed(withDesc('a\u202Eb')).description).toBe('a b');
    expect(normalizeDescription('　')).toBeUndefined();
  });

  it('空・空白だけ・文字列以外は「説明なし」として読む（カードは捨てない）', () => {
    for (const d of ['', '   ', 42, null, { text: 'x' }, ['x']]) {
      const c = parsed(withDesc(d));
      expect('description' in c).toBe(false);
    }
  });

  it(`${CARD_DESCRIPTION_MAX}文字を超えた分は切り詰める（絵文字は1文字と数える）`, () => {
    const exact = 'あ'.repeat(CARD_DESCRIPTION_MAX);
    expect(parsed(withDesc(exact)).description).toBe(exact);
    const long = '🔥'.repeat(CARD_DESCRIPTION_MAX + 20);
    const d = parsed(withDesc(long)).description!;
    expect([...d]).toHaveLength(CARD_DESCRIPTION_MAX);
    expect(d).toBe('🔥'.repeat(CARD_DESCRIPTION_MAX));
    expect(descriptionLength(long)).toBe(CARD_DESCRIPTION_MAX + 20);
  });

  it('ポイント・種類・検証には関係しない', () => {
    const plain = analyzeCard(EXAMPLES.hinoko);
    const described = analyzeCard(parsed(withDesc('説明つき')));
    expect(described.points).toEqual(plain.points);
    expect(described.cardType).toBe(plain.cardType);
    expect(described.violations).toEqual(plain.violations);
  });

  it('説明だけが違うカードは、取り込みで別のカードとして扱う', () => {
    const base = parsed(EXAMPLES.hinoko);
    const other = parsed({ ...EXAMPLES.hinoko, id: 'other', description: 'メモ' });
    const m = mergeImport([base], [], { cards: [other], decks: [] }, () => 'new-id');
    expect(m.addedCards).toBe(1);
    const same = mergeImport([base], [], { cards: [{ ...base, id: 'again' }], decks: [] }, () => 'new-id');
    expect(same.unchangedCards).toBe(1);
  });

  it('オンライン対戦のデッキ検証は説明つきのカードを受け付け、長すぎる説明は切り詰める', () => {
    const preset = PRESET_DECKS[0]!;
    const cards = preset.cards.map((c, i) => ({ ...c, description: i === 0 ? 'x'.repeat(CARD_DESCRIPTION_MAX * 3) : `メモ${i}` }));
    const r = checkDeck(JSON.parse(JSON.stringify(preset.deck)), JSON.parse(JSON.stringify(cards)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const c of r.value.cards) expect([...(c.description ?? '')].length).toBeLessThanOrEqual(CARD_DESCRIPTION_MAX);
    expect(r.value.cards.some((c) => c.description?.startsWith('メモ'))).toBe(true);
  });
});
