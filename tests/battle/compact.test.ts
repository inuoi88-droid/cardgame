// スマホの詰めた表示の小道具（src/ui/battle/compact.ts）
import { describe, expect, it } from 'vitest';
import { briefChipLabel, briefLabel, HAND_BADGE_ICON, isTauntChip, overflowItems, tileChipOrder } from '../../src/ui/battle/compact.ts';

describe('overflowItems', () => {
  it('max 個までならそのまま、残りは数だけ', () => {
    expect(overflowItems([1, 2], 3)).toEqual({ shown: [1, 2], more: 0 });
    expect(overflowItems([1, 2, 3], 3)).toEqual({ shown: [1, 2, 3], more: 0 });
    expect(overflowItems([1, 2, 3, 4, 5], 3)).toEqual({ shown: [1, 2, 3], more: 2 });
  });
  it('max が 0 以下なら全部「+N」', () => {
    expect(overflowItems(['a', 'b'], 0)).toEqual({ shown: [], more: 2 });
    expect(overflowItems(['a'], -1)).toEqual({ shown: [], more: 1 });
  });
});

describe('briefLabel', () => {
  it('日本語の名前を落として、アイコンと数字を残す', () => {
    expect(briefLabel('⚡疾走')).toBe('⚡');
    expect(briefLabel('⏳寿命2')).toBe('⏳2');
    expect(briefLabel('☠40')).toBe('☠40');
    expect(briefLabel('🔒封印')).toBe('🔒');
    expect(briefLabel('🛡聖盾 使用済み')).toBe('🛡');
    expect(briefLabel('⚔攻撃した回数 3')).toBe('⚔3');
    expect(briefLabel('Lv2')).toBe('Lv2');
  });
  it('文字だけの札は最初の1文字', () => {
    expect(briefLabel('トークン')).toBe('ト');
    expect(briefLabel('')).toBe('');
  });
});

describe('HAND_BADGE_ICON', () => {
  it('手札の注意の札にはすべてアイコンがある', () => {
    for (const k of ['氷結', '封殺', 'パワー入替', '条件未達', '対象なし']) expect(HAND_BADGE_ICON[k]).toBeTruthy();
  });
});

describe('タイルの札の並び（tileChipOrder・briefChipLabel）', () => {
  const c = (id: string, label = id) => ({ id, label });
  it('挑発を先頭、次に守備力、ほかは元の順', () => {
    const out = tileChipOrder([c('kw:flying'), c('poison'), c('gr:taunt')], c('def'));
    expect(out.map((x) => x.id)).toEqual(['gr:taunt', 'def', 'kw:flying', 'poison']);
    expect(tileChipOrder([c('a'), c('b')]).map((x) => x.id)).toEqual(['a', 'b']);
  });
  it('挑発の札は名前を残す（守備力の 🛡 と見分ける）', () => {
    expect(briefChipLabel(c('kw:taunt', '🛡挑発'))).toBe('🛡挑発');
    expect(briefChipLabel(c('tg:taunt', '⏱🛡挑発'))).toBe('🛡挑発');
    expect(briefChipLabel(c('gr:taunt', '➕🛡挑発'))).toBe('🛡挑発');
    expect(briefChipLabel(c('poison', '☠40'))).toBe('☠40');
    expect(isTauntChip('kw:taunt')).toBe(true);
    expect(isTauntChip('kw:flying')).toBe(false);
  });
});
