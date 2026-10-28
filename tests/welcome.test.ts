// はじめての案内と文字の大きさの設定（画面の補助の純粋な部分）
import { describe, expect, it } from 'vitest';
import { parseTextSize, TEXT_SIZES } from '../src/ui/settings/textSize.ts';
import { parseWelcomeSeen, shouldShowWelcome, WELCOME_CHOICES } from '../src/ui/welcome/welcomeLogic.ts';

describe('はじめての案内', () => {
  it('自作のカードもデッキも無く、閉じた印も無い人にだけ出す', () => {
    expect(shouldShowWelcome({ cards: 0, decks: 0, seen: false, page: 'cards' })).toBe(true);
    expect(shouldShowWelcome({ cards: 1, decks: 0, seen: false, page: 'cards' })).toBe(false);
    expect(shouldShowWelcome({ cards: 0, decks: 1, seen: false, page: 'cards' })).toBe(false);
    expect(shouldShowWelcome({ cards: 0, decks: 0, seen: true, page: 'cards' })).toBe(false);
  });

  it('対戦・ドラフト・オンライン・招待リンクの画面には出さない', () => {
    for (const page of ['battle', 'draft', 'online', 'onlineBattle', 'friendLink']) expect(shouldShowWelcome({ cards: 0, decks: 0, seen: false, page }), page).toBe(false);
    for (const page of ['cards', 'decks', 'battleSetup', 'rules', 'official', 'plaza']) expect(shouldShowWelcome({ cards: 0, decks: 0, seen: false, page }), page).toBe(true);
  });

  it('閉じた印は { seen: true } だけ（壊れていたら見ていない扱い）', () => {
    expect(parseWelcomeSeen({ seen: true })).toBe(true);
    expect(parseWelcomeSeen({ seen: 'yes' })).toBe(false);
    expect(parseWelcomeSeen(null)).toBe(false);
  });

  it('行き先はどれも画面がある（5つ・最初はドラフト戦）', async () => {
    // router.ts は読み込むときに window.location を見るので、ハッシュだけの代わりを置く
    (globalThis as { window?: unknown }).window ??= { location: { hash: '' }, addEventListener: () => undefined };
    const { parseRoute } = await import('../src/ui/router.ts');
    expect(WELCOME_CHOICES.map((c) => c.id)).toEqual(['draft', 'cpu', 'make', 'online', 'rules']);
    const pages = WELCOME_CHOICES.map((c) => parseRoute(`#${c.path}`).page);
    expect(pages).toEqual(['draft', 'battleSetup', 'cardEdit', 'online', 'rules']);
  });
});

describe('文字の大きさの設定', () => {
  it('小・標準・大・特大。壊れていたら標準', () => {
    expect(TEXT_SIZES).toEqual(['sm', 'md', 'lg', 'xl']);
    expect(parseTextSize({ size: 'xl' })).toBe('xl');
    expect(parseTextSize({ size: 'huge' })).toBe('md');
    expect(parseTextSize('lg')).toBe('md');
    expect(parseTextSize(null)).toBe('md');
  });
});
