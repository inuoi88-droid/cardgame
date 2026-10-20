// レジストリと定義ファイルの整合性、エンジンの純粋性
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error 型定義のない .mjs スクリプト
import { generateRegistrySource, OUTPUT_PATH } from '../scripts/gen-registry.mjs';
import {
  BALANCE,
  allowedTargets,
  createDrawback,
  createEffect,
  describeDrawback,
  describeEffect,
  listDrawbacks,
  listEffects,
  listKeywords,
  listModifiers,
  timingsFor,
} from '../src/engine/index.ts';

describe('レジストリ', () => {
  it('索引ファイルが最新（defs/ のファイルがすべて登録されている）', () => {
    expect(readFileSync(OUTPUT_PATH, 'utf8')).toBe(generateRegistrySource());
  });

  it('仕様の数だけ登録されている（効果39・オプション5（MTG 要素バッチ1で数値の倍数3つ）・キーワード8・デメリット10）', () => {
    expect(listEffects()).toHaveLength(39);
    expect(listModifiers()).toHaveLength(5);
    expect(listKeywords()).toHaveLength(8);
    expect(listDrawbacks()).toHaveLength(10);
  });

  it('すべての効果に balance.ts の基礎ポイントがある', () => {
    for (const def of listEffects()) {
      expect(BALANCE.effects, def.id).toHaveProperty(def.id);
    }
    for (const def of listKeywords()) expect(BALANCE.keywords, def.id).toHaveProperty(def.id);
    for (const def of listDrawbacks()) expect(BALANCE.drawbacks, def.id).toHaveProperty(def.id);
  });

  it('すべての効果が、選べるすべてのタイミング・対象でテキストとポイントを作れる', () => {
    for (const def of listEffects()) {
      for (const base of ['monster', 'spell'] as const) {
        for (const timing of timingsFor(base)) {
          const targets = allowedTargets(def.targetRule, timing);
          expect(targets.length, `${def.id} ${timing}`).toBeGreaterThan(0);
          for (const target of targets) {
            const e = { ...createEffect(def.id, base), timing, target };
            const text = describeEffect(e);
            expect(text).toMatch(/。$/);
            expect(text).not.toContain('undefined');
            expect(Number.isFinite(def.basePoints(e))).toBe(true);
            expect(def.basePoints(e)).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('すべてのデメリットがテキストとポイントを作れる', () => {
    for (const def of listDrawbacks()) {
      const d = createDrawback(def.id, def.monsterOnly ? 'monster' : 'spell');
      expect(describeDrawback(d)).toMatch(/。$/);
      expect(describeDrawback(d)).not.toContain('undefined');
      expect(def.basePoints(d, { stats: { attack: 1, hp: 1, defense: 0 }, keywords: [] })).toBeGreaterThan(0);
    }
  });
});

describe('エンジンの純粋性', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.ts')) files.push(p);
    }
  };
  walk(join(__dirname, '..', 'src', 'engine'));
  // オンライン対戦のサーバー処理も同じエンジンで動くので、同じ決まりを守る
  walk(join(__dirname, '..', 'src', 'online'));

  it.each([
    ['Math.random', /Math\.random/],
    ['Date', /\bDate\b/],
    ['localStorage', /localStorage/],
    ['window', /\bwindow\./],
    ['document', /\bdocument\./],
    ['react', /from ['"]react/],
  ])('src/engine と src/online は %s を使わない', (_name, pattern) => {
    const offenders = files.filter((f) => pattern.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('balance.ts 以外の定義ファイルにポイントの数値を直接書いていない', () => {
    // defs/ の basePoints / points は BALANCE を参照していること
    const defsDir = join(__dirname, '..', 'src', 'engine', 'defs');
    const defFiles = files.filter((f) => f.startsWith(defsDir));
    for (const f of defFiles) {
      const src = readFileSync(f, 'utf8');
      const pointLines = src.split('\n').filter((l) => /(basePoints|points|fixedPoints|rate):/.test(l));
      for (const line of pointLines) {
        expect(line, f).not.toMatch(/=>\s*\d|:\s*\d/);
      }
    }
  });
});
