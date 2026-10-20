// src/engine/defs/ 以下の定義ファイルを走査し、レジストリの索引 src/engine/registry.generated.ts を生成する。
// npm run dev / test / build の前に自動で実行される。
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE_DIR = join(ROOT, 'src', 'engine');
export const OUTPUT_PATH = join(ENGINE_DIR, 'registry.generated.ts');

const KINDS = [
  { dir: 'effects', exportName: 'EFFECT_DEFS', type: 'EffectDef' },
  { dir: 'modifiers', exportName: 'MODIFIER_DEFS', type: 'ModifierDef' },
  { dir: 'keywords', exportName: 'KEYWORD_DEFS', type: 'KeywordDef' },
  { dir: 'drawbacks', exportName: 'DRAWBACK_DEFS', type: 'DrawbackDef' },
  { dir: 'abilities', exportName: 'ABILITY_DEFS', type: 'AbilityDef' },
];

export function generateRegistrySource() {
  const imports = [];
  const exports = [];
  for (const { dir, exportName, type } of KINDS) {
    const files = readdirSync(join(ENGINE_DIR, 'defs', dir))
      .filter((f) => f.endsWith('.ts'))
      .sort();
    const idents = files.map((f) => `${dir}_${f.replace(/\.ts$/, '').replace(/[^A-Za-z0-9_]/g, '_')}`);
    files.forEach((f, i) => imports.push(`import ${idents[i]} from './defs/${dir}/${f}';`));
    exports.push(`export const ${exportName}: readonly ${type}[] = [\n${idents.map((x) => `  ${x},`).join('\n')}\n];`);
  }
  return [
    '// 自動生成ファイル。手で編集しないこと（scripts/gen-registry.mjs が生成する）',
    "import type { AbilityDef, DrawbackDef, EffectDef, KeywordDef, ModifierDef } from './define.ts';",
    ...imports,
    '',
    ...exports,
    '',
  ].join('\n');
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const source = generateRegistrySource();
  const current = existsSync(OUTPUT_PATH) ? readFileSync(OUTPUT_PATH, 'utf8') : '';
  if (current !== source) {
    writeFileSync(OUTPUT_PATH, source);
    console.log('registry.generated.ts を更新しました');
  }
}
