// 見出し用の明朝（UI Mincho）に入れる字を集める（決定事項 #111）。gen-display-font.mjs と tests/displayFont.test.ts が使う。
//
// 明朝を使うのは「ビルドのときに分かっている UI の固定の文字」だけ（h1〜h3・主ボタン・ターン終了・ダイアログの見出し）。
// 人が入力した名前（デッキ名・カード名など）はカードと同じ --font-title なので、ここには入れなくてよい。
// src/ui の .ts / .tsx から、コメントを除いた文字列と JSX の文字を TypeScript の構文木で拾い、
// ひらがな・カタカナ・ASCII・全角の英数字・よく使う記号を足す。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

/** 字を集めない場所（生成物） */
const SKIP_DIRS = new Set(['generated']);

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(path, out);
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

/** 1つのファイルの文字列・テンプレート・JSX の文字（コメントは入らない） */
export function charsOfSource(text, fileName = 'x.tsx') {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false, kind);
  const set = new Set();
  const add = (s) => {
    for (const ch of s) set.add(ch);
  };
  const visit = (node) => {
    switch (node.kind) {
      case ts.SyntaxKind.StringLiteral:
      case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
      case ts.SyntaxKind.TemplateHead:
      case ts.SyntaxKind.TemplateMiddle:
      case ts.SyntaxKind.TemplateTail:
        add(node.text);
        break;
      case ts.SyntaxKind.JsxText:
        add(node.text);
        break;
      default:
        break;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return set;
}

/**
 * 登録の名前（src/engine/defs の `name: '…'`。効果・デメリット・能力・キーワード・修飾）。選択ダイアログの見出し
 * （「枯朽：1つ選ぶ」など）が明朝で出るので、名前の字も入れる（説明文は入れない：書体を小さく保つ）
 */
export function namesOfSource(text, fileName = 'x.ts') {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const set = new Set();
  const visit = (node) => {
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && (node.name.text === 'name' || node.name.text === 'label') && (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))) {
      for (const ch of node.initializer.text) set.add(ch);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return set;
}

/** いつも入れる字：ASCII・全角の英数字と記号・ひらがな・カタカナ・よく使う記号 */
export function baseChars() {
  const set = new Set();
  const range = (a, b) => {
    for (let c = a; c <= b; c++) set.add(String.fromCodePoint(c));
  };
  range(0x20, 0x7e); // ASCII
  range(0xff01, 0xff5e); // 全角の英数字・記号
  range(0x3041, 0x3096); // ひらがな
  range(0x309b, 0x309e);
  range(0x30a1, 0x30fe); // カタカナ（ー・ヽヾを含む）
  for (const ch of '、。・「」『』【】〈〉《》（）〔〕［］｛｝〜～…‥―‐–—・＋－×÷＝≠≦≧±％‰★☆◆◇■□●○◎▲△▼▽→←↑↓⇒⇔♪♡♥♠♣♦°′″※〒々〆〇ヶヵ　') set.add(ch);
  return set;
}

/** 明朝に入れる字のすべて（並びはコードポイント順） */
export function collectDisplayChars(root) {
  const set = baseChars();
  for (const file of walk(join(root, 'src', 'ui'), [])) {
    for (const ch of charsOfSource(readFileSync(file, 'utf8'), file)) set.add(ch);
  }
  for (const file of [...walk(join(root, 'src', 'engine', 'defs'), []), join(root, 'src', 'engine', 'options.ts')]) {
    for (const ch of namesOfSource(readFileSync(file, 'utf8'), file)) set.add(ch);
  }
  // 改行・タブなどの制御文字は入れない
  return [...set].filter((ch) => ch.codePointAt(0) >= 0x20).sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
}

/** 字を拾ったファイル（テストの説明用） */
export function sourceFiles(root) {
  return walk(join(root, 'src', 'ui'), []).map((f) => relative(root, f));
}
