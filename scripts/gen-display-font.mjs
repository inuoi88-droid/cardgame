// 見出し用の明朝（UI Mincho）を作り直す（決定事項 #111）：npm run gen:font
//
// 明朝は「UI の固定の文字」だけに使うので、その字だけを Shippori Mincho B1（SIL OFL 1.1）の ExtraBold（800）から切り出して
// src/ui/theme/fonts/ui-mincho.woff2 に置く（生成物はコミットする。ビルドとテストにネットや Python は要らない）。
// Vite 版は CSS の url() でハッシュ付きのファイルに、1ファイル版はデータ URI として HTML に埋め込まれる。どちらも外部への通信なし。
//
// 元の書体は google/fonts のリポジトリの TTF（Google Fonts の配信版は palt＝字形の余白を詰める機能が抜けているため、こちらを使う）。
// 要るもの：ネット（curl で raw.githubusercontent.com）と Python 3 の fontTools・brotli。元の TTF は node_modules/.cache に置いて使い回す。
// 字が足りなくなると tests/displayFont.test.ts が落ちるので、UI の文字を足したらこれを回す。
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectDisplayChars } from './font/chars.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'src', 'ui', 'theme', 'fonts');
const CACHE = join(ROOT, 'node_modules', '.cache', 'display-font');
const FAMILY = 'Shippori Mincho B1';
const WEIGHT = 800;
const SRC_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/shipporiminchob1/ShipporiMinchoB1-ExtraBold.ttf';
const SRC = join(CACHE, 'ShipporiMinchoB1-ExtraBold.ttf');

mkdirSync(CACHE, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });
if (!existsSync(SRC)) execFileSync('curl', ['-sSfL', '--retry', '3', '-o', SRC, SRC_URL], { stdio: 'inherit' });

const chars = collectDisplayChars(ROOT);
const tmp = mkdtempSync(join(tmpdir(), 'display-font-'));
try {
  const out = join(OUT_DIR, 'ui-mincho.woff2');
  const charsPath = join(tmp, 'chars.txt');
  writeFileSync(charsPath, chars.join(''));
  const covered = JSON.parse(execFileSync('python3', [join(ROOT, 'scripts', 'font', 'subset.py'), SRC, charsPath, out], { encoding: 'utf8' }));
  const coveredSet = new Set(covered);
  // 書体に無い字（絵文字など）。これは代わりの書体で出る（テストはこの一覧を「入れなくてよい字」として扱う）
  const absent = chars.map((c) => c.codePointAt(0)).filter((cp) => cp > 32 && !coveredSet.has(cp));
  writeFileSync(
    join(OUT_DIR, 'ui-mincho.json'),
    `${JSON.stringify(
      {
        note: 'scripts/gen-display-font.mjs の生成物。手で編集しないこと',
        family: FAMILY,
        weight: WEIGHT,
        source: SRC_URL,
        license: 'SIL Open Font License 1.1',
        covered: String.fromCodePoint(...covered),
        absent: String.fromCodePoint(...absent),
      },
      null,
      1,
    )}\n`,
  );
  const kb = Math.round(readFileSync(out).length / 1024);
  console.log(`gen-display-font: ${covered.length} 字（書体に無い字 ${absent.length}）を切り出しました（${kb} KB）`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
