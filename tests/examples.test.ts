// 仕様の「作成例」4枚。計算結果が決定事項 #68 の価格表と一致すること
import { describe, expect, it } from 'vitest';
import { analyzeCard } from '../src/engine/index.ts';
import { EXAMPLES } from './helpers.ts';

const lineValues = (c: ReturnType<typeof analyzeCard>) => c.points.lines.map((l) => [l.label, l.value]);

describe('作成例', () => {
  it('1. 火の粉：ダメージ2で4pt、やけどで10pt、コスト1で−10pt。合計4pt、作成可能、アタック', () => {
    const a = analyzeCard(EXAMPLES.hinoko);
    expect(lineValues(a)).toEqual([
      ['ダメージ2', 4],
      ['やけど', 10],
      ['コスト1', -10],
    ]);
    expect(a.points.total).toBe(4);
    expect(a.points.cap).toBe(5);
    expect(a.points.remaining).toBe(1);
    expect(a.cardType).toBe('attack');
    expect(a.isCurse).toBe(false);
    expect(a.violations).toEqual([]);
    expect(a.valid).toBe(true);
  });

  it('2. 毒牙ネズミ：攻撃力1で3pt、体力2で4pt、攻撃するたび毒1で4×2.0＝8pt、コスト1で−10pt。合計5pt（上限ちょうど）、モンスター', () => {
    const a = analyzeCard(EXAMPLES.dokugaNezumi);
    expect(lineValues(a)).toEqual([
      ['攻撃力1', 3],
      ['体力2', 4],
      ['攻撃するたび 毒1', 8],
      ['コスト1', -10],
    ]);
    expect(a.points.lines[2]!.formula).toBe('4 × 2.0（攻撃するたび）');
    expect(a.points.total).toBe(5);
    expect(a.points.cap).toBe(5);
    expect(a.cardType).toBe('monster');
    expect(a.valid).toBe(true);
    // 仕様の効果テキスト例と一致する
    expect(a.text.effects).toEqual(['攻撃するたび、相手に毒1を与える。']);
  });

  it('3. とどめの一撃：条件「相手が毒状態」で20ダメージ、40×0.7＝28pt。コスト2で−20pt。合計8pt、アタック', () => {
    const a = analyzeCard(EXAMPLES.todome);
    expect(lineValues(a)).toEqual([
      ['ダメージ20', 28],
      ['コスト2', -20],
    ]);
    expect(a.points.lines[0]!.formula).toBe('40 × 0.7（相手が毒状態）');
    expect(a.points.total).toBe(8);
    expect(a.points.cap).toBe(8);
    expect(a.cardType).toBe('attack');
    expect(a.valid).toBe(true);
    expect(a.text.effects).toEqual(['相手が毒状態なら、相手1体に20ダメージを与える。']);
  });

  it('4. 狂戦士の契約：筋力+5で45pt、デメリット1.5×4×8.0＝48pt（差し引けるのは上限の18まで）、コスト1で−10pt。合計17pt、呪いのパワー', () => {
    const a = analyzeCard(EXAMPLES.kyosenshi);
    expect(lineValues(a)).toEqual([
      ['筋力5', 45],
      ['コスト1', -10],
      ['自分のターン開始時 自傷4', -48],
      ['デメリットの差し引き上限', 30],
    ]);
    expect(a.points.lines[2]!.formula).toBe('6 × 8.0（自分のターン開始時）');
    expect(a.points.total).toBe(17);
    expect(a.points.cap).toBe(18);
    expect(a.points.drawbackTotal).toBe(48);
    expect(a.points.drawbackOffset).toBe(18);
    expect(a.isCurse).toBe(true);
    expect(a.cardType).toBe('power');
    expect(a.valid).toBe(true);
    expect(a.text.drawbacks).toEqual(['自分のターン開始時、自分に4ダメージ。']);
  });
});
