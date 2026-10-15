// dist/ のビルド結果を、JS と CSS を埋め込んだ HTML ファイル1つ（release/cardgame.html）にまとめる。
// サーバーなしでダブルクリックして開けるようにするため（file:// では外部の module スクリプトを読み込めない）。
// 使い方：npm run build:single
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const OUT_DIR = join(ROOT, 'release');
const OUT = join(OUT_DIR, 'cardgame.html');

function fail(message) {
  console.error(`build-single: ${message}`);
  process.exit(1);
}

const assets = readdirSync(join(DIST, 'assets'));
const jsFiles = assets.filter((f) => f.endsWith('.js'));
const cssFiles = assets.filter((f) => f.endsWith('.css'));
const others = assets.filter((f) => !f.endsWith('.js') && !f.endsWith('.css'));
// コード分割や画像ファイルが増えたら、この方法では1ファイルにできないので止める
if (jsFiles.length !== 1 || cssFiles.length > 1 || others.length > 0) {
  fail(`想定外のビルド結果です（JS ${jsFiles.length}個、CSS ${cssFiles.length}個、その他 ${others.join(', ')}）`);
}

let html = readFileSync(join(DIST, 'index.html'), 'utf8');
// </script> がコード中にあると HTML が途中で切れるので逃がす
const js = readFileSync(join(DIST, 'assets', jsFiles[0]), 'utf8').replace(/<\/script/gi, '<\\/script');
const scriptTag = new RegExp(`<script type="module"[^>]*src="\\./assets/${jsFiles[0].replace('.', '\\.')}"[^>]*></script>`);
if (!scriptTag.test(html)) fail('index.html に JS の読み込みが見つかりません');
html = html.replace(scriptTag, () => `<script type="module">\n${js}\n</script>`);

if (cssFiles.length === 1) {
  const css = readFileSync(join(DIST, 'assets', cssFiles[0]), 'utf8').replace(/<\/style/gi, '<\\/style');
  const linkTag = new RegExp(`<link rel="stylesheet"[^>]*href="\\./assets/${cssFiles[0].replace('.', '\\.')}"[^>]*>`);
  if (!linkTag.test(html)) fail('index.html に CSS の読み込みが見つかりません');
  html = html.replace(linkTag, () => `<style>\n${css}\n</style>`);
}

if (/(src|href)="\.?\/?assets\//.test(html)) fail('埋め込めなかったファイルの参照が残っています');

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, html);
console.log(`release/cardgame.html を作りました（${Math.round(html.length / 1024)} KB）`);
