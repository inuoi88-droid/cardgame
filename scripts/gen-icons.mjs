// game-icons.net のアイコン（@iconify-json/game-icons、CC BY 3.0）から、カードの絵に使うデータを作る（決定事項 #105・#106）。
// npm run gen（dev / test / build / typecheck の前）で自動的に動く。出力は git に入れない。
//
//   generated/info.ts           … 本体に入る小さな表（総数・版・置き場所）。数 KB
//   public/icons/<stamp>/<名前>.txt … アイコン1つの形（SVG の path の d。1〜3KB）。ふつうの版は見えている絵の分だけ fetch する
//   public/icons/current.txt    … いまの stamp（デプロイの前から開いていたタブが古い置き場所を引いたとき、新しい置き場所を知るため）
//   generated/shards/sNNN.json  … 同じ形を名前順に約 24KB ずつまとめたもの。1ファイル版（HTML に JSON として埋め込む）とテストが読む
//   generated/index.json        … 選択パネル用の索引（名前の一覧と、英単語 → 日本語の辞書）。パネルを開いたときだけ読む
//
// stamp はアイコンの版と形式だけで決まる（辞書を直しても変わらない）。変わるのはアイコンの版を上げたときだけ。
// 日本語の辞書は scripts/icons/ja*.json（英単語 → 「空白区切りの日本語」。すべての英単語に項目がある：tests/icons.test.ts）。
// 環境変数 ICON_JA_DIR を指定すると、そこにある ja*.json も足す（辞書を作っている途中の確認用）。
//
// 形のデータは自分たちのバンドルから出す。カードのデータに書かれたアイコン名は「引く鍵」にしか使わないので、
// 利用者のデータから SVG が入り込むことはない（path の d を React の属性として渡すだけ）。
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'ui', 'icons', 'generated');
const PUBLIC_OUT = join(ROOT, 'public', 'icons');
const JA_DIRS = [join(ROOT, 'scripts', 'icons'), ...(process.env.ICON_JA_DIR ? [resolve(process.env.ICON_JA_DIR)] : [])];
/** 1つのシャードの path の合計の目安（バイト）。小さいほど1枚を出すときの読み込みが軽く、ファイルは増える */
const SHARD_BYTES = 24_000;
/** public に置く形の形式。変えたら上げる（stamp が変わる） */
const FORMAT = 'txt-1';
/** アイコン名として受け付ける形（ref.ts の GI_NAME と同じ） */
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const require = createRequire(import.meta.url);

function readJa() {
  const merged = new Map();
  const files = [];
  for (const dir of JA_DIRS) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => /^ja.*\.json$/.test(x)).sort()) {
      const path = join(dir, f);
      let data;
      try {
        data = JSON.parse(readFileSync(path, 'utf8'));
      } catch (e) {
        console.warn(`gen-icons: ${path} を読めませんでした（飛ばします）：${e.message}`);
        continue;
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) continue;
      files.push(path);
      for (const [token, words] of Object.entries(data)) {
        if (typeof words !== 'string' || !/^[a-z0-9]+$/.test(token)) continue;
        const list = merged.get(token) ?? [];
        for (const w of words.split(/\s+/)) {
          const word = w.normalize('NFKC').trim();
          // 制御文字や記号だけのものは入れない（検索の鍵にしか使わないが、念のため）
          if (word && word.length <= 24 && !/[\u0000-\u001f<>&"']/.test(word) && !list.includes(word)) list.push(word);
        }
        if (list.length > 0) merged.set(token, list);
      }
    }
  }
  return { files, ja: Object.fromEntries([...merged.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, v.join(' ')])) };
}

export function generate() {
  const pkgPath = require.resolve('@iconify-json/game-icons/package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const iconsPath = join(dirname(pkgPath), 'icons.json');
  const { files: jaFiles, ja } = readJa();
  const stamp = createHash('sha256').update(pkg.version).update(FORMAT).digest('hex').slice(0, 16);
  // 作り直すかどうかは中身（辞書・このスクリプト）でも決める
  const content = createHash('sha256').update(stamp).update(readFileSync(fileURLToPath(import.meta.url))).update(JSON.stringify(ja)).digest('hex').slice(0, 16);
  const stampPath = join(OUT, 'stamp.txt');
  if (existsSync(stampPath) && readFileSync(stampPath, 'utf8') === content && existsSync(join(OUT, 'info.ts')) && existsSync(join(PUBLIC_OUT, stamp))) return { changed: false };

  const set = JSON.parse(readFileSync(iconsPath, 'utf8'));
  const paths = new Map();
  for (const [name, icon] of Object.entries(set.icons)) {
    const m = /^<path fill="currentColor" d="([^"]+)"\/>$/.exec(icon.body);
    if (!m || !NAME_RE.test(name)) throw new Error(`gen-icons: 想定外の形のアイコン ${name}`);
    if ((icon.width ?? set.width) !== 512 || (icon.height ?? set.height) !== 512) throw new Error(`gen-icons: 512×512 でないアイコン ${name}`);
    paths.set(name, m[1]);
  }
  // 別名（綴りの直し）も同じ形で引けるようにする
  for (const [alias, a] of Object.entries(set.aliases ?? {})) {
    if (NAME_RE.test(alias) && paths.has(a.parent) && !a.rotate && !a.hFlip && !a.vFlip) paths.set(alias, paths.get(a.parent));
  }
  const names = [...paths.keys()].sort();

  // 名前順に約 SHARD_BYTES ずつ分ける（並びが名前順なので、選択パネルを上から見ていくと続きのシャードを読む）
  const shards = [];
  let cur = null;
  for (const name of names) {
    if (!cur || cur.bytes >= SHARD_BYTES) {
      cur = { start: name, icons: {}, bytes: 0 };
      shards.push(cur);
    }
    cur.icons[name] = paths.get(name);
    cur.bytes += paths.get(name).length + name.length + 6;
  }

  rmSync(OUT, { recursive: true, force: true });
  rmSync(PUBLIC_OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, 'shards'), { recursive: true });
  mkdirSync(join(PUBLIC_OUT, stamp), { recursive: true });
  const width = String(shards.length - 1).length;
  shards.forEach((s, i) => {
    writeFileSync(join(OUT, 'shards', `s${String(i).padStart(width, '0')}.json`), JSON.stringify(s.icons));
  });
  for (const name of names) writeFileSync(join(PUBLIC_OUT, stamp, `${name}.txt`), paths.get(name));
  writeFileSync(join(PUBLIC_OUT, 'current.txt'), stamp);
  writeFileSync(join(OUT, 'index.json'), JSON.stringify({ v: 1, names, ja }));
  writeFileSync(
    join(OUT, 'info.ts'),
    [
      '// 自動生成ファイル。手で編集しないこと（scripts/gen-icons.mjs が生成する）',
      `/** @iconify-json/game-icons の版 */`,
      `export const ICON_SET_VERSION = ${JSON.stringify(pkg.version)};`,
      `/** アイコンの数（別名を含む） */`,
      `export const ICON_TOTAL = ${names.length};`,
      `/** 日本語の辞書にある英単語の数 */`,
      `export const ICON_JA_TOKENS = ${Object.keys(ja).length};`,
      `/** 形の置き場所（public/icons/<stamp>/<名前>.txt）。アイコンの版か形式が変われば変わる */`,
      `export const ICON_STAMP = ${JSON.stringify(stamp)};`,
      `/** シャード（1ファイル版の埋め込み）のファイル名の桁数 */`,
      `export const ICON_SHARD_DIGITS = ${width};`,
      `/** 各シャードの最初のアイコン名（名前順）。名前からシャードを決める（ref.ts の shardIndexOf。1ファイル版だけが使う） */`,
      `export const ICON_SHARD_STARTS: readonly string[] = ${JSON.stringify(shards.map((s) => s.start))};`,
      '',
    ].join('\n'),
  );
  writeFileSync(stampPath, content);
  return { changed: true, icons: names.length, shards: shards.length, jaTokens: Object.keys(ja).length, jaFiles };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = generate();
  if (r.changed) {
    console.log(`gen-icons: アイコン ${r.icons} 個を書き出しました（シャード ${r.shards} 個・日本語の辞書 ${r.jaTokens} 語${r.jaFiles.length ? `：${r.jaFiles.length} ファイル` : '・なし'}）`);
  }
}
