// カード置き場（決定事項 #109）：仕組みのタグの表・検索のならし・絞り込み・並べ替え・節分け・グループの操作・表示の設定
import { describe, expect, it } from 'vitest';
import {
  CONDITION_IDS,
  MODIFIER_IDS,
  TARGET_IDS,
  TIMING_IDS,
  analyzeCard,
  listAbilities,
  listDrawbacks,
  listEffects,
  listKeywords,
  type CardDef,
  type CardGroup,
  type Deck,
} from '../src/engine/index.ts';
import {
  addCardsToGroup,
  copyMemberships,
  groupNameProblem,
  loadGroups,
  makeGroup,
  membershipIndex,
  moveGroup,
  nextGroupColor,
  removeCardsFromGroup,
  removeGroup,
  restoreGroup,
  updateGroup,
} from '../src/ui/collection/groups.ts';
import { DEFAULT_PREFS, EMPTY_FILTERS, autoView, buildEntry, deckUseIndex, filterChips, filterEntries, matchQuery, parsePrefs, parseQuery, sectionsFor, sortEntries } from '../src/ui/collection/query.ts';
import { ALL_TAGS, MECHANIC_TAGS, TAG_TABLES, cardTags } from '../src/ui/collection/tags.ts';
import { SAMPLE_CARDS } from '../src/samples.ts';
import { PRESET_DECKS } from '../src/presets.ts';
import { EXAMPLES, card } from './helpers.ts';

const keysOf = (o: object) => Object.keys(o).sort();
const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id).sort();

describe('仕組みのタグの表', () => {
  it('登録されている効果・キーワード・デメリット・能力はすべて表にある（タグにしないものは空の配列）。表に余計な ID もない', () => {
    expect(keysOf(TAG_TABLES.EFFECT_TAGS)).toEqual(ids(listEffects()));
    expect(keysOf(TAG_TABLES.KEYWORD_TAGS)).toEqual(ids(listKeywords()));
    expect(keysOf(TAG_TABLES.DRAWBACK_TAGS)).toEqual(ids(listDrawbacks()));
    expect(keysOf(TAG_TABLES.ABILITY_TAGS)).toEqual(ids(listAbilities()));
  });

  it('条件・タイミング・オプション・対象もすべて表にある', () => {
    expect(keysOf(TAG_TABLES.CONDITION_TAGS)).toEqual([...CONDITION_IDS].sort());
    expect(keysOf(TAG_TABLES.TIMING_TAGS)).toEqual([...TIMING_IDS].sort());
    expect(keysOf(TAG_TABLES.MODIFIER_TAGS)).toEqual([...MODIFIER_IDS].sort());
    expect(keysOf(TAG_TABLES.TARGET_TAGS)).toEqual([...TARGET_IDS].sort());
  });

  it('表で使うタグはすべて一覧にあり、一覧のタグはどれもどこかで使う', () => {
    const known = new Set<string>(MECHANIC_TAGS.map((t) => t.id));
    const used = new Set<string>(['power', 'curse']); // 種類・呪いの判定からも付く
    for (const table of Object.values(TAG_TABLES)) {
      for (const tags of Object.values(table) as (readonly string[])[]) {
        for (const t of tags) {
          expect(known.has(t), t).toBe(true);
          used.add(t);
        }
      }
    }
    expect([...known].filter((t) => !used.has(t))).toEqual([]);
  });

  it('カードからタグを付ける（効果・タイミング・キーワード・種類・種族）', () => {
    const tagsOf = (c: CardDef) => cardTags(c, analyzeCard(c));
    expect(tagsOf(EXAMPLES.hinoko)).toEqual(['damage', 'burn']);
    expect(tagsOf(EXAMPLES.dokugaNezumi)).toEqual(['poison', 'attack']);
    const dragon = card({ name: '竜', stats: { attack: 3, hp: 3, defense: 0 }, tribe: 'dragon', keywords: [{ id: 'flying' }] });
    expect(tagsOf(dragon)).toEqual(['attack', 'tribe:dragon']);
    const power = card({ name: 'パワー', cost: 2, effects: [{ id: 'draw', value: 1, timing: 'turnStart', target: 'self', condition: null }] });
    expect(tagsOf(power)).toContain('draw');
    expect(tagsOf(power)).toContain('power');
  });

  it('サンプル・プリセットのカードはほぼすべてに何かのタグが付く（バニラを除く）', () => {
    const all = [...SAMPLE_CARDS, ...PRESET_DECKS.flatMap((p) => p.cards)];
    const untagged = all.filter((c) => cardTags(c, analyzeCard(c)).length === 0 && (c.effects.length > 0 || c.keywords.length > 0));
    expect(untagged.map((c) => c.name)).toEqual([]);
  });
});

describe('検索のならし', () => {
  it('ひらがな・カタカナ・全角半角・大文字小文字の違いをならし、空白区切りは「どれも含む」、-語は「含まない」', () => {
    const text = buildEntry(card({ name: 'ドラゴンＦＩＲＥ', description: '炎を吐く' }), analyzeCard(card({})), 0).text;
    expect(matchQuery(text, parseQuery('どらごん'))).toBe(true);
    expect(matchQuery(text, parseQuery('ﾄﾞﾗｺﾞﾝ'))).toBe(true);
    expect(matchQuery(text, parseQuery('fire 炎'))).toBe(true);
    expect(matchQuery(text, parseQuery('fire 氷'))).toBe(false);
    expect(matchQuery(text, parseQuery('どらごん -炎'))).toBe(false);
    expect(parseQuery('  ドク　-ヤケド  - ')).toEqual({ include: ['どく'], exclude: ['やけど'] });
  });

  it('効果の文・キーワード・種族・タグの名前でも当たる', () => {
    const c = card({ name: 'ネズミ', stats: { attack: 1, hp: 1, defense: 0 }, tribe: 'beast', keywords: [{ id: 'haste' }], effects: [{ id: 'poison', value: 1, timing: 'attack', target: 'chosen', condition: null }] });
    const e = buildEntry(c, analyzeCard(c), 0);
    for (const q of ['毒', '疾走', '獣', '攻撃・疾走', 'もんすたー']) expect(matchQuery(e.text, parseQuery(q)), q).toBe(true);
  });

  it('タグ・種族の読み（かな）でも当たる：「どく」で毒、「けもの」で獣', () => {
    const c = card({ name: 'ネズミ', stats: { attack: 1, hp: 1, defense: 0 }, tribe: 'beast', effects: [{ id: 'poison', value: 1, timing: 'attack', target: 'chosen', condition: null }] });
    const e = buildEntry(c, analyzeCard(c), 0);
    for (const q of ['どく', 'ドク', 'けもの']) expect(matchQuery(e.text, parseQuery(q)), q).toBe(true);
    expect(MECHANIC_TAGS.every((t) => t.kana.length > 0)).toBe(true);
  });
});

describe('絞り込み・並べ替え・節分け', () => {
  const list = [
    card({ id: 'a', name: 'あ', cost: 3, rarity: 'rare', stats: { attack: 2, hp: 2, defense: 0 }, tribe: 'dragon' }),
    card({ id: 'b', name: 'い', cost: 1, effects: [{ id: 'poison', value: 1, timing: 'play', target: 'chosen', condition: null }] }),
    card({ id: 'c', name: 'う', cost: 2, rarity: 'epic', effects: [{ id: 'draw', value: 1, timing: 'play', target: 'self', condition: null }] }),
  ];
  const entries = list.map((c, i) => buildEntry(c, analyzeCard(c), i));
  const groups: CardGroup[] = [makeGroup('g1', '毒の沼', 'green', undefined, ['b']), makeGroup('g2', 'ドロー', 'blue', undefined, ['b', 'c'])];
  const decks: Deck[] = [{ v: 1, id: 'd1', name: 'デッキ', entries: [{ cardId: 'a', count: 2 }] }];
  const ctx = { membership: membershipIndex(groups), deckUse: deckUseIndex(decks) };
  const names = (xs: { card: CardDef }[]) => xs.map((x) => x.card.id);

  it('グループ・未分類・種類・コスト・種族・デッキ・タグで絞り込む', () => {
    expect(names(filterEntries(entries, '', EMPTY_FILTERS, 'g2', ctx))).toEqual(['b', 'c']);
    expect(names(filterEntries(entries, '', EMPTY_FILTERS, 'ungrouped', ctx))).toEqual(['a']);
    expect(names(filterEntries(entries, '', { ...EMPTY_FILTERS, types: ['monster'] }, 'all', ctx))).toEqual(['a']);
    expect(names(filterEntries(entries, '', { ...EMPTY_FILTERS, costs: [1, 2] }, 'all', ctx))).toEqual(['b', 'c']);
    expect(names(filterEntries(entries, '', { ...EMPTY_FILTERS, tribes: ['none'] }, 'all', ctx))).toEqual(['b', 'c']);
    expect(names(filterEntries(entries, '', { ...EMPTY_FILTERS, deck: 'unused' }, 'all', ctx))).toEqual(['b', 'c']);
    expect(names(filterEntries(entries, '', { ...EMPTY_FILTERS, deck: 'd1' }, 'all', ctx))).toEqual(['a']);
    expect(names(filterEntries(entries, '', { ...EMPTY_FILTERS, tags: ['poison'] }, 'all', ctx))).toEqual(['b']);
    expect(names(filterEntries(entries, 'う', EMPTY_FILTERS, 'g2', ctx))).toEqual(['c']);
  });

  it('掛かっている絞り込みの札は1つずつ外せる', () => {
    const f = { ...EMPTY_FILTERS, costs: [1, 2], tags: ['poison' as const], deck: 'd1' };
    const chips = filterChips(f, decks);
    expect(chips.map((c) => c.label)).toEqual(['コスト1', 'コスト2', 'デッキ「デッキ」', '#毒']);
    expect(chips[0]!.without.costs).toEqual([2]);
    expect(chips[2]!.without.deck).toBe('any');
  });

  it('並べ替え（追加順・新しい順・コスト・レアリティ・名前、逆順）', () => {
    expect(names(sortEntries(entries, 'added'))).toEqual(['a', 'b', 'c']);
    expect(names(sortEntries(entries, 'newest'))).toEqual(['c', 'b', 'a']);
    expect(names(sortEntries(entries, 'cost'))).toEqual(['b', 'c', 'a']);
    expect(names(sortEntries(entries, 'cost', true))).toEqual(['a', 'c', 'b']);
    expect(names(sortEntries(entries, 'rarity', true))).toEqual(['c', 'a', 'b']);
    expect(names(sortEntries(entries, 'name'))).toEqual(['a', 'b', 'c']);
  });

  it('節分け：グループは1枚が複数の節に出て、どこにも無いものは「未分類」。空の節は出さない', () => {
    const s = sectionsFor(entries, 'group', groups, ctx.membership);
    expect(s.map((x) => [x.label, names(x.entries)])).toEqual([
      ['毒の沼', ['b']],
      ['ドロー', ['b', 'c']],
      ['未分類', ['a']],
    ]);
    const t = sectionsFor(entries, 'tag', groups, ctx.membership);
    expect(t.map((x) => x.label)).toEqual(['毒', 'ドロー・手札', '種族：竜']);
    expect(sectionsFor(entries, 'cost', [], new Map()).map((x) => x.label)).toEqual(['コスト 1', 'コスト 2', 'コスト 3']);
    expect(ALL_TAGS).toContain('tribe:dragon');
  });
});

describe('グループの操作', () => {
  const base = [makeGroup('g1', '一', 'red', 'メモ', ['a']), makeGroup('g2', '二', 'blue')];

  it('作る・入れる・外す（重ならない）・並べ替え・削除と元に戻す', () => {
    const r1 = addCardsToGroup(base, 'g2', ['a', 'b', 'a']);
    expect(r1.added).toBe(2);
    expect(r1.groups[1]!.cardIds).toEqual(['a', 'b']);
    expect(addCardsToGroup(r1.groups, 'g2', ['a']).added).toBe(0);
    const r2 = removeCardsFromGroup(r1.groups, 'g2', ['a', 'zzz']);
    expect(r2.removed).toBe(1);
    expect(r2.groups[1]!.cardIds).toEqual(['b']);
    expect(moveGroup(base, 'g2', -1).map((g) => g.id)).toEqual(['g2', 'g1']);
    expect(moveGroup(base, 'g2', 1).map((g) => g.id)).toEqual(['g1', 'g2']);
    const del = removeGroup(base, 'g1');
    expect(del.groups.map((g) => g.id)).toEqual(['g2']);
    expect(restoreGroup(del.groups, del.removed!, del.index)).toEqual(base);
    // 元の配列は変えない
    expect(base[1]!.cardIds).toEqual([]);
  });

  it('名前・色・メモを直す（空の名前は無視、メモは null で消す）', () => {
    const u = updateGroup(base, 'g1', { name: '  ', color: 'green', memo: null });
    expect(u[0]).toEqual({ v: 1, id: 'g1', name: '一', color: 'green', cardIds: ['a'] });
    expect(updateGroup(base, 'g2', { name: '新しい名前', memo: 'シナジー' })[1]).toMatchObject({ name: '新しい名前', memo: 'シナジー' });
  });

  it('名前の重なり（全角半角・大文字小文字をならす）と空の名前を知らせる', () => {
    const gs = [makeGroup('x', 'Dragon', 'red')];
    expect(groupNameProblem(gs, 'ｄｒａｇｏｎ')).toMatch(/もうあります/);
    expect(groupNameProblem(gs, 'ｄｒａｇｏｎ', 'x')).toBeNull();
    expect(groupNameProblem(gs, '   ')).toMatch(/グループ名/);
    expect(groupNameProblem(gs, '竜')).toBeNull();
  });

  it('複製したカードは元のカードのグループに入る', () => {
    const out = copyMemberships(base, new Map([['a', 'a2']]));
    expect(out[0]!.cardIds).toEqual(['a', 'a2']);
    expect(out[1]).toBe(base[1]);
  });

  it('保存データの読み込み：壊れたもの・同じ ID の2つ目を捨て、無いカードの ID を落とす', () => {
    const data = [base[0], { ...base[1], id: 'g1' }, { id: 'bad' }, makeGroup('g3', '三', 'violet', undefined, ['a', 'gone'])];
    const out = loadGroups(data, new Set(['a']));
    expect(out.map((g) => g.id)).toEqual(['g1', 'g3']);
    expect(out[1]!.cardIds).toEqual(['a']);
    expect(loadGroups('nope')).toEqual([]);
  });

  it('新しいグループの色は、まだ使っていない色から', () => {
    expect(nextGroupColor([])).toBe('red');
    expect(nextGroupColor(base)).toBe('orange');
  });

  it('カード ID → グループの索引', () => {
    const m = membershipIndex([makeGroup('g1', '一', 'red', undefined, ['a', 'b']), makeGroup('g2', '二', 'red', undefined, ['b'])]);
    expect(m.get('b')).toEqual(['g1', 'g2']);
    expect(m.get('c')).toBeUndefined();
  });
});

describe('表示の設定（localStorage に置く値）', () => {
  it('壊れた値・知らない値は既定に戻す', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('x')).toEqual(DEFAULT_PREFS);
    const p = parsePrefs({ view: 'huge', sort: 'magic', desc: 'yes', sectionBy: 'tag', filters: { types: ['monster', 'nope'], costs: [1, 99, '2'], tags: ['poison', 'nope'], curse: 'only', deck: 5 }, collapsed: ['a', 3] });
    expect(p.view).toBeNull();
    expect(p.sort).toBe('added');
    expect(p.desc).toBe(false);
    expect(p.sectionBy).toBe('tag');
    expect(p.filters).toEqual({ ...EMPTY_FILTERS, types: ['monster'], costs: [1], tags: ['poison'], curse: 'only' });
    expect(p.collapsed).toEqual(['a']);
  });

  it('保存した値は読み戻せる', () => {
    const p = { ...DEFAULT_PREFS, view: 'list' as const, sort: 'cost' as const, desc: true, scope: 'g1', filters: { ...EMPTY_FILTERS, rarities: ['epic' as const], deck: 'unused' } };
    expect(parsePrefs(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it('自動の表示：スマホで60枚より多いとリスト', () => {
    expect(autoView(true, 61)).toBe('list');
    expect(autoView(true, 60)).toBe('card');
    expect(autoView(false, 500)).toBe('card');
  });
});
