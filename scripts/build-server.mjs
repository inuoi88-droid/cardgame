// Edge Function 用に、src/online（とそこから使うエンジン）を1つの JS ファイルにまとめる。
// 出力：supabase/functions/cardgame/engine.js（自動生成。手で編集しない）
// 使い方：npm run build:server
import { build } from 'rolldown';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'supabase', 'functions', 'cardgame', 'engine.js');

await build({
  input: join(ROOT, 'src', 'online', 'index.ts'),
  platform: 'neutral',
  output: {
    file: OUT,
    format: 'esm',
    minify: true,
  },
});
// 圧縮するとコメントが消えるので、出力の先頭に注意書きを足す
writeFileSync(OUT, `// 自動生成（npm run build:server）。手で編集しない。元は src/online と src/engine\n${readFileSync(OUT, 'utf8')}`);
console.log('build-server: supabase/functions/cardgame/engine.js');
