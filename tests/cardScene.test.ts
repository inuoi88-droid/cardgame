// カードの絵の窓の背景（決定事項 #142）：場面の決め方（種族 → 呪い → 属性 → 種類）と、SVG が毎回同じ・正しい形であること
import { describe, expect, it } from 'vitest';
import { TRIBE_IDS } from '../src/engine/index.ts';
import { SCENE_IDS, TRIBE_SCENE, VARIANTS, sceneBackground, sceneOf, sceneStyle, sceneSvg, variantOf } from '../src/ui/components/cardScene.ts';

describe('カードの背景', () => {
  it('種族があれば種族の場面（呪いでも）', () => {
    for (const t of TRIBE_IDS) {
      expect(sceneOf({ tribe: t, icon: 'gi:fire', name: '炎' }, 'monster')).toBe(TRIBE_SCENE[t]);
      expect(sceneOf({ tribe: t, icon: '', name: '' }, 'monster', true)).toBe(TRIBE_SCENE[t]);
    }
    expect(new Set(Object.values(TRIBE_SCENE)).size).toBe(TRIBE_IDS.length);
  });

  it('種族が無ければ 呪い → 絵と名前の属性 → 種類', () => {
    expect(sceneOf({ icon: 'gi:fireball', name: '火球' }, 'attack', true)).toBe('cursed');
    expect(sceneOf({ icon: 'gi:fireball', name: '火球' }, 'attack')).toBe('flame');
    expect(sceneOf({ icon: '🃏', name: '氷の槍' }, 'attack')).toBe('glacier');
    expect(sceneOf({ icon: '🃏', name: 'テスト' }, 'attack')).toBe('dusk');
    expect(sceneOf({ icon: '🃏', name: 'テスト' }, 'skill')).toBe('meadow');
    expect(sceneOf({ icon: '🃏', name: 'テスト' }, 'power')).toBe('starfield');
    expect(sceneOf(undefined, undefined)).toBe('meadow');
  });

  it('どの場面・変化も正しい SVG で、同じ入力なら同じ文字列', () => {
    for (const s of SCENE_IDS) {
      for (let v = 0; v < VARIANTS; v++) {
        const svg = sceneSvg(s, v);
        expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'), s).toBe(true);
        expect(svg.endsWith('</svg>')).toBe(true);
        expect(svg).not.toMatch(/NaN|undefined|Infinity/);
        expect(svg).toBe(sceneSvg(s, v));
        // 開きと閉じの数（自己終了でない要素）
        for (const tag of ['g', 'defs', 'linearGradient', 'radialGradient']) {
          expect((svg.match(new RegExp(`<${tag}[ >]`, 'g')) ?? []).length, `${s} ${tag}`).toBe((svg.match(new RegExp(`</${tag}>`, 'g')) ?? []).length);
        }
      }
      expect(sceneSvg(s, 0)).not.toBe(sceneSvg(s, 1));
    }
  });

  it('CSS の値は data URI で使い回す。変化はカードの ID で決まる', () => {
    expect(sceneBackground('forest', 0)).toBe(sceneBackground('forest', 0));
    expect(sceneBackground('forest', 0)).toMatch(/^url\("data:image\/svg\+xml,%3Csvg/);
    expect(variantOf('abc')).toBe(variantOf('abc'));
    expect(new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((x) => variantOf(x))).size).toBeGreaterThan(1);
    const st = sceneStyle({ id: 'x', tribe: 'dragon', icon: '', name: '' }, 'monster') as Record<string, string>;
    expect(st['--art-scene']).toBe(sceneBackground('volcano', variantOf('x')));
  });
});
