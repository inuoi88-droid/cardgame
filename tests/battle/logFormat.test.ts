/** ログの色分け（src/ui/battle/logFormat.ts）。DOM は使わない */
import { describe, expect, it } from 'vitest';
import { logIcon, logNamesOf, tokenizeLog, type LogNames } from '../../src/ui/battle/logFormat.ts';

const names: LogNames = {
  cards: [
    { id: 'c1', name: '火の粉' },
    { id: 'c2', name: '毒' },
    { id: 'c3', name: '見張り番' },
    { id: 'c4', name: '火の粉' },
  ],
  players: ['あなた', 'CPU'],
};

describe('tokenizeLog', () => {
  it('「」のカード名とプレイヤー名を分ける', () => {
    expect(tokenizeLog('あなたは「火の粉」を使った（コスト2、エナジー 3→1）', names)).toEqual([
      { t: 'player', text: 'あなた', player: 0 },
      { t: 'text', text: 'は' },
      { t: 'card', text: '火の粉', cardId: 'c1' },
      { t: 'text', text: 'を使った（コスト' },
      { t: 'num', text: '2', tone: 'plain' },
      { t: 'text', text: '、エナジー ' },
      { t: 'num', text: '3', tone: 'plain' },
      { t: 'text', text: '→' },
      { t: 'num', text: '1', tone: 'plain' },
      { t: 'text', text: '）' },
    ]);
  });
  it('ダメージは damage、回復は heal', () => {
    const segs = tokenizeLog('CPUの「見張り番」に12ダメージ：体力 20→8', names);
    expect(segs[0]).toEqual({ t: 'player', text: 'CPU', player: 1 });
    expect(segs).toContainEqual({ t: 'card', text: '見張り番', cardId: 'c3' });
    expect(segs).toContainEqual({ t: 'num', text: '12', tone: 'damage' });
    expect(tokenizeLog('あなたのHPが5回復：HP 10→15', names)).toContainEqual({ t: 'num', text: '5', tone: 'heal' });
  });
  it('カード名でない「」は普通の文字のまま', () => {
    const segs = tokenizeLog('条件「手札が3枚以上」を満たさないため発動しない', names);
    expect(segs.every((s) => s.t !== 'card')).toBe(true);
    expect(segs.map((s) => s.text).join('')).toBe('条件「手札が3枚以上」を満たさないため発動しない');
  });
  it('『』のパワー名もカード名', () => {
    expect(tokenizeLog('パワーは3つまで：『毒』が消えた', names)).toContainEqual({ t: 'card', text: '毒', cardId: 'c2' });
  });
  it('行の頭の「カード名：」（効果の出どころ）もカード名。普通の文中の短い名前は拾わない', () => {
    expect(tokenizeLog('火の粉：相手に10ダメージ', names)[0]).toEqual({ t: 'card', text: '火の粉', cardId: 'c1' });
    expect(tokenizeLog('見張り番のデメリット：自傷', names)[0]).toEqual({ t: 'card', text: '見張り番', cardId: 'c3' });
    expect(tokenizeLog('CPUに毒3：合計3', names).some((s) => s.t === 'card')).toBe(false);
  });
  it('同じ名前のカードは preferId を優先', () => {
    expect(tokenizeLog('「火の粉」', names, 'c4')).toEqual([{ t: 'card', text: '火の粉', cardId: 'c4' }]);
  });
  it('プレイヤー名は助詞などが続くときだけ（言葉の一部には当てない）', () => {
    const n: LogNames = { cards: [], players: ['A', 'B'] };
    expect(tokenizeLog('Aは降参した', n)[0]).toEqual({ t: 'player', text: 'A', player: 0 });
    expect(tokenizeLog('ABC', n)).toEqual([{ t: 'text', text: 'ABC' }]);
  });
  it('文字は欠けない', () => {
    const text = '── あなたのターン（3ターン目）──';
    expect(
      tokenizeLog(text, names)
        .map((s) => s.text)
        .join(''),
    ).toBe(text);
  });
});

describe('logNamesOf / logIcon', () => {
  it('view から名前を作る', () => {
    const n = logNamesOf({ cards: { x: { name: 'X' } }, players: [{ name: 'P' }, { name: 'Q' }] });
    expect(n).toEqual({ cards: [{ id: 'x', name: 'X' }], players: ['P', 'Q'] });
  });
  it('出来事ごとにアイコン', () => {
    expect(logIcon('damage')).toBe('💥');
    expect(logIcon('heal')).toBe('✚');
    expect(logIcon(undefined, 'effect')).toBe('');
    expect(logIcon('status', 'info', 'coin')).toBe('🪙');
  });
});
