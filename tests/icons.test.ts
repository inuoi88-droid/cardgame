// カードの絵（game-icons.net。決定事項 #105）：アイコン名の読み方・シャードの引き方・取り込み・分類・検索・おすすめ・使っている絵がすべてあること
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BALANCE, CARD_ICON_MAX, FIELDS, LEADERS, buildExport, parseImport } from '../src/engine/index.ts';
import { armyDef, eggDef, faceDownDef, siegeDef, tokenDef } from '../src/engine/battle/zones.ts';
import { conjuredCard } from '../src/engine/defs/effects/conjure.ts';
import { PRESET_DECKS as PRESETS } from '../src/presets.ts';
import { SAMPLE_CARDS } from '../src/samples.ts';
import { TEMPLATES } from '../src/ui/editor/templates.ts';
import { CATEGORY_ORDER, categoryOf } from '../src/ui/icons/categories.ts';
import { ICON_SHARD_DIGITS, ICON_SHARD_STARTS, ICON_STAMP, ICON_TOTAL } from '../src/ui/icons/generated/info.ts';
import { GI_NAME_MAX, giIcon, iconLabel, iconText, isGiIcon, parseIconRef, pathFromShard, shardIndexOf } from '../src/ui/icons/ref.ts';
import { buildSearchIndex, EFFECT_ICONS, fold, searchIcons, segmentWords, smartSearch, suggestIcons, tokensFromName, TRIBE_ICONS, TYPE_ICONS } from '../src/ui/icons/search.ts';
import { EXAMPLES } from './helpers.ts';

const ROOT = join(__dirname, '..');
const GEN = join(ROOT, 'src', 'ui', 'icons', 'generated');
const JA_FILE = join(ROOT, 'scripts', 'icons', 'ja.json');
const index = JSON.parse(readFileSync(join(GEN, 'index.json'), 'utf8')) as { names: string[]; ja: Record<string, string> };
const names = new Set(index.names);
const shardFiles = readdirSync(join(GEN, 'shards')).sort();
const shards = shardFiles.map((f) => JSON.parse(readFileSync(join(GEN, 'shards', f), 'utf8')) as Record<string, string>);

describe('アイコン名の読み方（ref.ts）', () => {
  it('gi: はアイコン、それ以外は絵文字、空は空', () => {
    expect(parseIconRef('gi:dragon-head')).toEqual({ kind: 'gi', name: 'dragon-head' });
    expect(parseIconRef('🔥')).toEqual({ kind: 'emoji', text: '🔥' });
    expect(parseIconRef('  ')).toEqual({ kind: 'empty' });
    expect(parseIconRef(undefined)).toEqual({ kind: 'empty' });
  });

  it('形の正しくない名前は代わりの絵（HTML や URL・パスを入れても名前として扱わない）', () => {
    for (const bad of ['gi:', 'gi:Dragon', 'gi:dragon head', 'gi:<svg onload=x>', 'gi:../shards/s000', 'gi:a--b', 'gi:-a', `gi:${'a'.repeat(GI_NAME_MAX + 1)}`]) {
      expect(parseIconRef(bad).kind, bad).toBe('bad');
    }
    expect(isGiIcon('gi:<b>')).toBe(false);
  });

  it('文字の中では絵文字だけを出す（game-icons は空）。読み上げは英語の名前', () => {
    expect(iconText('🐺')).toBe('🐺');
    expect(iconText('gi:wolf-head')).toBe('');
    expect(iconLabel('gi:wolf-head')).toBe('wolf head');
    expect(iconLabel('🐺')).toBe('🐺');
    expect(giIcon('fire')).toBe('gi:fire');
  });

  it('シャードは名前順の二分探索で決まり、無い名前は null（代わりの絵）', () => {
    const starts = ['apple', 'dragon', 'monkey'];
    expect(shardIndexOf('aardvark', starts)).toBe(-1);
    expect(shardIndexOf('apple', starts)).toBe(0);
    expect(shardIndexOf('cat', starts)).toBe(0);
    expect(shardIndexOf('dragon-head', starts)).toBe(1);
    expect(shardIndexOf('zebra', starts)).toBe(2);
    expect(pathFromShard({ fire: 'M0 0h10v10z' }, 'fire')).toBe('M0 0h10v10z');
    expect(pathFromShard({ fire: 'M0 0h10v10z' }, 'ice')).toBeNull();
    expect(pathFromShard({ fire: 'M0 0"/><script>' }, 'fire')).toBeNull();
    expect(pathFromShard({}, 'constructor')).toBeNull();
    expect(pathFromShard(undefined, 'fire')).toBeNull();
  });
});

describe('生成したデータ（scripts/gen-icons.mjs）', () => {
  it('全部のアイコンが、名前から決まるシャードに入っていて、形が path の d として正しい', () => {
    expect(ICON_TOTAL).toBe(index.names.length);
    expect(ICON_TOTAL).toBeGreaterThan(4000);
    expect(shardFiles).toHaveLength(ICON_SHARD_STARTS.length);
    expect(shardFiles[0]).toBe(`s${'0'.repeat(ICON_SHARD_DIGITS)}.json`);
    for (const name of index.names) {
      const i = shardIndexOf(name, ICON_SHARD_STARTS);
      expect(pathFromShard(shards[i], name), name).not.toBeNull();
    }
  });

  it('シャードは小さく分かれている（1つ 40KB 未満）', () => {
    for (const f of shardFiles) expect(readFileSync(join(GEN, 'shards', f)).length, f).toBeLessThan(40_000);
  });

  it('ふつうの版の形はアイコン1つずつのファイル（public/icons/<stamp>/<名前>.txt）で、シャードと同じ形。いまの stamp も置く', () => {
    const dir = join(ROOT, 'public', 'icons', ICON_STAMP);
    expect(readFileSync(join(ROOT, 'public', 'icons', 'current.txt'), 'utf8')).toBe(ICON_STAMP);
    for (const name of index.names) {
      const file = join(dir, `${name}.txt`);
      expect(existsSync(file), name).toBe(true);
      expect(readFileSync(file, 'utf8')).toBe(pathFromShard(shards[shardIndexOf(name, ICON_SHARD_STARTS)], name));
    }
  });
});

describe('日本語の辞書（scripts/icons/ja.json）', () => {
  const ja = JSON.parse(readFileSync(JA_FILE, 'utf8')) as Record<string, string>;
  const tokens = new Set(index.names.flatMap((n) => n.split('-')));

  it('アイコン名のすべての英単語に項目がある（訳さない単語は空でよい）。無い単語の項目は無い', () => {
    expect([...tokens].filter((t) => !(t in ja))).toEqual([]);
    expect(Object.keys(ja).filter((t) => !tokens.has(t))).toEqual([]);
    for (const [t, words] of Object.entries(ja)) expect(typeof words, t).toBe('string');
    // ほとんどの単語には訳がある（空は数字や固有の綴りなど）
    expect(Object.values(ja).filter((w) => w.trim() !== '').length).toBeGreaterThan(tokens.size * 0.9);
  });

  it('索引（generated/index.json）に辞書がそのまま入る（空の項目は省く）', () => {
    expect(Object.keys(index.ja).length).toBe(Object.values(ja).filter((w) => w.trim() !== '').length);
    expect(index.ja.dragon).toContain('竜');
  });
});

describe('カードのデータ（io.ts）', () => {
  it('gi: の絵のカードを書き出して読み戻せる。絵文字のカードもそのまま', () => {
    const gi = { ...EXAMPLES.hinoko, id: 'gi-card', name: '竜の火', icon: 'gi:dragon-breath' };
    const r = parseImport(JSON.stringify(buildExport([gi, EXAMPLES.todome], [])));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.cards.map((c) => c.icon)).toEqual(['gi:dragon-breath', EXAMPLES.todome.icon]);
  });

  it('長すぎる絵は壊れたデータとして読まない（上限はどの gi: 名も絵文字の並びも収まる長さ）', () => {
    expect(CARD_ICON_MAX).toBeGreaterThanOrEqual('gi:'.length + GI_NAME_MAX);
    const long = { ...EXAMPLES.hinoko, icon: 'x'.repeat(CARD_ICON_MAX + 1) };
    const r = parseImport(JSON.stringify(buildExport([long, EXAMPLES.todome], [])));
    expect(r.ok && r.value.cards.map((c) => c.name)).toEqual(['とどめの一撃']);
    expect(r.ok && r.value.warnings[0]).toContain('アイコンが長すぎます');
    // 知らない名前の gi: は読める（表示は代わりの絵）
    const unknown = parseImport(JSON.stringify({ ...EXAMPLES.hinoko, icon: 'gi:no-such-icon' }));
    expect(unknown.ok && unknown.value.cards[0]!.icon).toBe('gi:no-such-icon');
  });
});

describe('使っている絵がすべてある', () => {
  const used: [string, string][] = [];
  const add = (where: string, icon: string) => {
    if (icon.startsWith('gi:')) used.push([where, icon.slice(3)]);
  };
  for (const p of PRESETS) for (const c of p.cards) add(`プリセット ${c.name}`, c.icon);
  for (const c of SAMPLE_CARDS) add(`サンプル ${c.name}`, c.icon);
  for (const t of TEMPLATES) add(`テンプレート ${t.title}`, t.build('x').icon);
  for (const id of Object.keys(LEADERS) as (keyof typeof LEADERS)[]) add(`リーダー ${id}`, LEADERS[id].art);
  for (const id of Object.keys(FIELDS) as (keyof typeof FIELDS)[]) add(`フィールド ${id}`, FIELDS[id].art);
  for (const k of ['tokenArt', 'armyArt', 'eggArt', 'faceDownArt', 'siegeArt'] as const) add(k, BALANCE.battle[k]);
  for (const k of ['fireball', 'potion', 'ward'] as const) add(`創出 ${k}`, conjuredCard(k, 1).icon);
  for (const d of [tokenDef(), armyDef(), eggDef(), faceDownDef(false), siegeDef()]) add(d.name, d.icon);
  add('ノイズ', 'gi:static');
  for (const [k, list] of Object.entries({ ...TRIBE_ICONS })) for (const n of list) used.push([`種族 ${k}`, n]);
  for (const [k, list] of Object.entries({ ...TYPE_ICONS })) for (const n of list) used.push([`種類 ${k}`, n]);
  for (const [k, list] of Object.entries({ ...EFFECT_ICONS })) for (const n of list) used.push([`効果 ${k}`, n]);

  it('プリセット・サンプル・テンプレート・特別なカード・リーダー・フィールド・おすすめの表', () => {
    expect(used.length).toBeGreaterThan(100);
    const missing = used.filter(([, n]) => !names.has(n));
    expect(missing).toEqual([]);
  });

  it('プリセット・サンプル（作成例を含む）・テンプレートは game-icons の絵', () => {
    for (const p of PRESETS) for (const c of p.cards) expect(isGiIcon(c.icon), c.name).toBe(true);
    for (const c of SAMPLE_CARDS) expect(isGiIcon(c.icon), c.name).toBe(true);
    for (const t of TEMPLATES) expect(isGiIcon(t.build('x').icon), t.title).toBe(true);
  });
});

describe('分類（categories.ts）', () => {
  it('代表的なアイコン', () => {
    expect(categoryOf('wolf-head')).toBe('creature');
    expect(categoryOf('skull-crossed-bones')).toBe('undead');
    expect(categoryOf('dragon-head')).toBe('monster');
    expect(categoryOf('dragon-shield')).toBe('monster');
    expect(categoryOf('broadsword')).toBe('weapon');
    expect(categoryOf('fire-shield')).toBe('armor');
    expect(categoryOf('spell-book')).toBe('magic');
    expect(categoryOf('oak-leaf')).toBe('nature');
    expect(categoryOf('fireball')).toBe('element');
    expect(categoryOf('monkey-wrench')).toBe('creature');
    expect(categoryOf('wrench')).toBe('tool');
    expect(categoryOf('gems')).toBe('treasure');
    expect(categoryOf('yin-yang')).toBe('symbol');
    expect(categoryOf('castle')).toBe('place');
    expect(categoryOf('greek-temple')).toBe('place');
    expect(categoryOf('pizza-slice')).toBe('food');
    expect(categoryOf('ak47')).toBe('weapon');
    expect(categoryOf('galleon')).toBe('tool');
  });

  it('どの分類にもアイコンがあり、「その他」は15%未満（分類で絞る意味があるように）', () => {
    const count = new Map<string, number>();
    for (const n of index.names) count.set(categoryOf(n), (count.get(categoryOf(n)) ?? 0) + 1);
    for (const c of CATEGORY_ORDER) expect(count.get(c) ?? 0, c).toBeGreaterThan(20);
    expect(count.get('other')!).toBeLessThan(index.names.length * 0.15);
  });
});

describe('検索とおすすめ（search.ts）', () => {
  const si = buildSearchIndex(index.names, index.ja);

  it('ひらがな・カタカナ・全角半角・大文字小文字をならす', () => {
    expect(fold('ドラゴン')).toBe('どらごん');
    expect(fold('ＦＩＲＥ')).toBe('fire');
  });

  it('日本語（漢字・カタカナ・ひらがな）でも英語でも見つかる', () => {
    for (const q of ['竜', 'ドラゴン', 'dragon', 'DRAGON']) expect(searchIcons(si, q).slice(0, 20), q).toContain('dragon-head');
    expect(searchIcons(si, '狼')).toContain('wolf-head');
    expect(searchIcons(si, '剣').length).toBeGreaterThan(10);
    // 空白区切りは「どれも含む」
    expect(searchIcons(si, 'dragon head')).toEqual(expect.arrayContaining(['dragon-head', 'spiked-dragon-head']));
    expect(searchIcons(si, 'zzzzqqq')).toEqual([]);
  });

  it('完全に一致する語が先に来る', () => {
    expect(searchIcons(si, 'fire')[0]).toBe('fire');
  });

  it('よく使う日本語の1語で、ふさわしいものが上に来る（竜・骸骨・剣・炎・狼）', () => {
    const top = (q: string, n: number) => searchIcons(si, q).slice(0, n);
    expect(top('竜', 10)).toContain('dragon-head');
    expect(top('竜', 10).every((x) => /dragon|hydra|wyvern|drake/.test(x))).toBe(true);
    expect(top('骸骨', 3)).toContain('skeleton');
    expect(top('骸骨', 10).every((x) => /skull|skeleton|bone/.test(x))).toBe(true);
    expect(top('剣', 15).every((x) => /sword|blade|gladius|saber|sabre|katana|rapier/.test(x))).toBe(true);
    expect(top('剣', 30)).toEqual(expect.arrayContaining(['crossed-swords', 'rune-sword']));
    expect(top('炎', 2)).toEqual(['flame', expect.stringMatching(/flame|fire/)]);
    expect(top('炎', 10).every((x) => /flame|fire|ifrit|burn/.test(x))).toBe(true);
    expect(top('狼', 1)).toEqual(['wolf-head']);
    expect(searchIcons(si, '狼')).toEqual(expect.arrayContaining(['direwolf', 'wolf-howl', 'werewolf']));
  });

  it('全部に当たるものが無ければ、語に切り分けて「近いもの」を出す（炎の剣・氷の竜・剣 炎）', () => {
    expect(searchIcons(si, '炎の剣')).toEqual([]);
    for (const q of ['炎の剣', '剣 炎']) {
      const r = smartSearch(si, q);
      expect(new Set(r.near), q).toEqual(new Set(['炎', '剣']));
      const top = r.names.slice(0, 30);
      expect(top.some((x) => /flame|fire/.test(x)), q).toBe(true);
      expect(top.some((x) => /sword/.test(x)), q).toBe(true);
    }
    const ice = smartSearch(si, '氷の竜');
    expect(ice.near).toEqual(['氷', '竜']);
    expect(ice.names.slice(0, 40)).toEqual(expect.arrayContaining(['dragon-head', 'ice-bolt']));
    // 当たるならふつうの検索のまま（near は null）。知らない語だけなら空
    expect(smartSearch(si, '竜').near).toBeNull();
    expect(smartSearch(si, 'zzzzqqq')).toEqual({ names: [], near: null });
  });

  it('語の切り分けは、長い語の中の短い語（とかげ の中の かげ）を使わない', () => {
    expect(segmentWords(si, '火吹きトカゲ').map((x) => x.word)).not.toContain('かげ');
    expect(segmentWords(si, '火吹きトカゲ').map((x) => x.word)).toContain('とかげ');
    expect(segmentWords(si, '吸血鬼の王').map((x) => x.word)).toEqual(['吸血鬼', '王']);
  });

  it('分類で絞れる。空の検索は分類の全部（名前順）', () => {
    const undead = searchIcons(si, '', 'undead');
    expect(undead.length).toBeGreaterThan(20);
    expect(undead.every((n) => categoryOf(n) === 'undead')).toBe(true);
    expect(searchIcons(si, '').length).toBe(index.names.length);
  });

  it('カード名から辞書を逆に引く（後ろの語ほど主役）', () => {
    const t = tokensFromName(si, '毒の刃');
    expect(t).toContain('poison');
    expect(t.indexOf('blade')).toBeGreaterThanOrEqual(0);
    expect(t.indexOf('blade')).toBeLessThan(t.indexOf('poison'));
  });

  it('名前からのおすすめは、どの語の絵も入り、数字や短い語の取り違えを出さない', () => {
    const sug = (name: string) => suggestIcons(si, { name }).slice(0, 10);
    // 吸血鬼の王：王（crown・king）だけで埋まらず、吸血鬼も入る
    expect(sug('吸血鬼の王').some((x) => /vampire|dracula/.test(x))).toBe(true);
    expect(sug('吸血鬼の王').some((x) => /king/.test(x))).toBe(true);
    expect(sug('氷の女王').some((x) => /ice/.test(x))).toBe(true);
    expect(sug('氷の女王').some((x) => /queen/.test(x))).toBe(true);
    expect(sug('ゴブリンの群れ').slice(0, 4).some((x) => /goblin/.test(x))).toBe(true);
    expect(sug('雷鳴の一撃').some((x) => /-1$|-one$|^one-/.test(x))).toBe(false);
    expect(sug('雷鳴の一撃').some((x) => /thunder|lightning/.test(x))).toBe(true);
    expect(sug('火吹きトカゲ').some((x) => /shadow/.test(x))).toBe(false);
    expect(sug('火吹きトカゲ').some((x) => /lizard|gecko/.test(x))).toBe(true);
    expect(sug('炎の剣').some((x) => /flame|fire/.test(x))).toBe(true);
    expect(sug('炎の剣').some((x) => /sword/.test(x))).toBe(true);
    expect(sug('竜')[0]).toBe('dragon-head');
  });

  it('おすすめは名前・種族・効果・種類から、あるアイコンだけ・重複なし', () => {
    const s = suggestIcons(si, { name: '竜', tribe: 'dragon', cardType: 'monster', effectIds: ['damage'] });
    expect(s[0]).toMatch(/dragon/);
    expect(s).toContain('dragon-head');
    expect(new Set(s).size).toBe(s.length);
    expect(s.every((n) => names.has(n))).toBe(true);
    const empty = suggestIcons(si, { name: '', cardType: 'skill' });
    expect(empty).toEqual(TYPE_ICONS.skill!.filter((n) => names.has(n)));
  });
});
