// エディターの印（UI2 の (C)。決定事項 #111）：効果ごとの game-icons の形がそろっているか。
// 効果を足したら src/ui/editor/effectIcons.ts の EFFECT_ICON にも1行足す（足さなくても見出しの形が出るが、ここで気づけるように）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EFFECT_GROUPS, listEffects } from '../src/engine/index.ts';
import { ABILITY_GI, DRAWBACK_GI, EFFECT_ICON, GROUP_GI, KEYWORD_GI, effectGi } from '../src/ui/editor/effectIcons.ts';
import { UI_ICON_PATHS } from '../src/ui/icons/generated/uiIcons.ts';

const ROOT = join(__dirname, '..');
const index = JSON.parse(readFileSync(join(ROOT, 'src/ui/icons/generated/index.json'), 'utf8')) as { names: string[] };
const names = new Set(index.names);

describe('エディターの印（effectIcons.ts）', () => {
  it('すべての効果に形がある', () => {
    const missing = listEffects()
      .map((d) => d.id)
      .filter((id) => !(id in EFFECT_ICON));
    expect(missing).toEqual([]);
  });

  it('登録にない効果の形を残さない', () => {
    const ids = new Set(listEffects().map((d) => d.id));
    expect(Object.keys(EFFECT_ICON).filter((id) => !ids.has(id))).toEqual([]);
  });

  it('形の名前はすべて game-icons にある', () => {
    const all = [...Object.values(EFFECT_ICON), ...Object.values(GROUP_GI), DRAWBACK_GI, ABILITY_GI, KEYWORD_GI];
    expect(all.filter((n) => !names.has(n))).toEqual([]);
  });

  it('見出し・デメリット・能力・キーワードの形は同梱（読み込みを待たずに描ける）', () => {
    for (const g of EFFECT_GROUPS) expect(GROUP_GI[g.id] in UI_ICON_PATHS, g.id).toBe(true);
    for (const n of [DRAWBACK_GI, ABILITY_GI, KEYWORD_GI]) expect(n in UI_ICON_PATHS, n).toBe(true);
  });

  it('形の無い効果は見出しの形になる', () => {
    expect(effectGi('no-such-effect', 'damage')).toBe(GROUP_GI.damage);
    expect(effectGi('no-such-effect', undefined)).toBe(GROUP_GI.special);
  });

  it('エディターの部品に絵文字の記号を残さない', () => {
    const files = ['src/ui/components/EffectRow.tsx', 'src/ui/editor/EffectPicker.tsx', 'src/ui/editor/OptionPicker.tsx', 'src/ui/editor/MiniPreview.tsx', 'src/ui/components/PointPanel.tsx'];
    for (const f of files) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      for (const e of ['💥', '🛡', '☠', '💪', '🃏', '🌀', '✨', '🔒', '▾', '✓']) expect(src.includes(e), `${f} ${e}`).toBe(false);
    }
  });
});
