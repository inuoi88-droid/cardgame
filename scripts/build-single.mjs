// dist/ のビルド結果を、JS と CSS を埋め込んだ HTML ファイル1つ（release/cardgame.html）にまとめる。
// サーバーなしでダブルクリックして開けるようにするため（file:// では外部の module スクリプトを読み込めない）。
// 使い方：npm run build:single
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// mode single のビルド（vite build --mode single --outDir dist-single）を使う
const DIST = join(ROOT, 'dist-single');
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
// JS は本文の最後（#root のあと・カードの絵のデータの前）に async で置く（下の説明）。まず head から外す
html = html.replace(scriptTag, '');

if (cssFiles.length === 1) {
  const css = readFileSync(join(DIST, 'assets', cssFiles[0]), 'utf8').replace(/<\/style/gi, '<\\/style');
  const linkTag = new RegExp(`<link rel="stylesheet"[^>]*href="\\./assets/${cssFiles[0].replace('.', '\\.')}"[^>]*>`);
  if (!linkTag.test(html)) fail('index.html に CSS の読み込みが見つかりません');
  html = html.replace(linkTag, () => `<style>\n${css}\n</style>`);
}

if (/(src|href)="\.?\/?assets\//.test(html)) fail('埋め込めなかったファイルの参照が残っています');

// カードの絵の形（シャード）と選択パネルの索引を JSON のまま埋め込む（決定事項 #106）。JS としては解析されないので起動は重くならず、
// src/ui/icons/iconSource.single.ts が要るシャードだけをそのとき JSON.parse する
const GEN = join(ROOT, 'src', 'ui', 'icons', 'generated');
const jsonTag = (id, file) => `<script type="application/json" id="${id}">${readFileSync(file, 'utf8').replace(/</g, '\\u003c')}</script>`;
const iconTags = [
  jsonTag('gi-index', join(GEN, 'index.json')),
  ...readdirSync(join(GEN, 'shards'))
    .filter((f) => /^s\d+\.json$/.test(f))
    .sort()
    .map((f) => jsonTag(`gi-${f.replace(/\.json$/, '')}`, join(GEN, 'shards', f))),
];
// 効果音（決定事項 #127）：src/ui/sound/sfx/*.mp3 を base64 の文字のまま埋め込む（type が JS ではないので解析されない）。
// src/ui/sound/sfxSource.single.ts が鳴らすときに1つずつ読んで戻す（ネットなしでも鳴る）
const SFX = join(ROOT, 'src', 'ui', 'sound', 'sfx');
const sfxTags = readdirSync(SFX)
  .filter((f) => f.endsWith('.mp3'))
  .sort()
  .map((f) => `<script type="text/plain" id="sfx-${f.slice(0, -'.mp3'.length)}">${readFileSync(join(SFX, f)).toString('base64')}</script>`);
if (sfxTags.length === 0) fail('効果音（src/ui/sound/sfx/*.mp3）が見つかりません');
// 埋め込んだ絵のデータ（約 6MB）を読み終わるのを待たずに画面を出すため、JS は async のモジュールにして絵のデータより前に置く
// （ふつうのモジュールは文書を全部読み終えてから動く）。絵と音のデータは iconSource.single.ts・sfxSource.single.ts が DOMContentLoaded を待ってから読む
const bodyEnd = html.lastIndexOf('</body>');
if (bodyEnd < 0) fail('index.html に </body> が見つかりません');
html = `${html.slice(0, bodyEnd)}<script type="module" async>\n${js}\n</script>\n${iconTags.join('\n')}\n${sfxTags.join('\n')}\n${html.slice(bodyEnd)}`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, html);
console.log(`release/cardgame.html を作りました（${Math.round(html.length / 1024)} KB）`);
