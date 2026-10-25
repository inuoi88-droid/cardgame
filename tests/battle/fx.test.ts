// 対戦の演出（決定事項 #126）：
// - エンジンは効果・デメリット・キーワード・変化・カードの移動を構造化した出来事（LogEvent）にする（行は増やさない）
// - 相手に隠した情報（手札・山札のカード、裏向きの正体、サーチしたカード、予顕したカード）は出来事に漏らさない
// - 演出の台帳（src/ui/battle/fx/registry.ts）は登録のすべての ID を覆う。形は game-icons にある
// - 出来事 → 演出（events.ts）→ 時間割（fx/timeline.ts）、相手のターンのまとめ（fx/recap.ts）、属性（fx/element.ts）、合図（fx/cues.ts）
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ai, battle, listAbilities, listDrawbacks, listEffects, listKeywords, type AbilityInstance, type CardDef, type EffectInstance } from '../../src/engine/index.ts';
import { buildEvents, type BattleEvent, type Show } from '../../src/ui/battle/events.ts';
import { CUES, playCue, setCueHandler, sizeOf, type CueId } from '../../src/ui/battle/fx/cues.ts';
import { elementOf, guessElement } from '../../src/ui/battle/fx/element.ts';
import { buildRecap } from '../../src/ui/battle/fx/recap.ts';
import { ABILITY_FX, allFxGlyphs, ARCH_GI, DRAWBACK_FX, EFFECT_FX, EVENT_STATUS_FX, fxPreload, KEYWORD_FX, STATUS_FX } from '../../src/ui/battle/fx/registry.ts';
import { parseFxPref } from '../../src/ui/battle/fx/settings.ts';
import { planTimeline, timelineMs, TRAVEL_MS } from '../../src/ui/battle/fx/timeline.ts';
import { nextDelay } from '../../src/ui/battle/useReplay.ts';
import { STATUS_IDS } from '../../src/ui/glossary.ts';
import { UI_ICON_PATHS } from '../../src/ui/icons/generated/uiIcons.ts';
import { card } from '../helpers.ts';
import { act, attack, endTurn, fx, giveCard, M, P, play, putMonster, rich, startGame } from './helpers.ts';

type G = battle.GameState;
type PlayerId = battle.PlayerId;
const ROOT = join(__dirname, '..', '..');

let seq = 0;
const SPELL = (effects: EffectInstance[], extra: Partial<CardDef> = {}) => card({ id: `fxs${++seq}`, name: `術${seq}`, rarity: 'legend', cost: 1, effects, ...extra });
const MON = (a: number, h: number, extra: Partial<CardDef> = {}) => card({ id: `fxm${++seq}`, name: `獣${seq}`, rarity: 'legend', cost: 1, stats: { attack: a, hp: h, defense: 0 }, ...extra });
const AB = (id: string, value?: number): AbilityInstance => ({ id, ...(value === undefined ? {} : { value }) });
const evs = (g: G, from: number) => g.log.slice(from).flatMap((e) => (e.ev ? [{ e, ev: e.ev }] : []));

// ---------------------------------------------------------------- エンジンの出来事
describe('演出の出来事（エンジン）', () => {
  it('効果の解決の見出しの行に effect（効果の ID・持ち主・使ったカード・対象・量）。結果の行はそれより深い', () => {
    const g = rich(startGame());
    const m = putMonster(g, 1, MON(1, 9));
    const c = giveCard(g, 0, SPELL([fx({ id: 'damage', value: 2 })], { name: '火球' }));
    const from = g.log.length;
    const s = play(g, c, { enemy: M(m) });
    const list = evs(s, from);
    const head = list.find((x) => x.ev.kind === 'effect')!;
    expect(head.ev).toMatchObject({ kind: 'effect', effectId: 'damage', player: 0, targets: [M(m)], amount: 2 });
    expect(head.ev.cardId).toBe(`p0:${s.cards[head.ev.cardId!]?.id}`);
    const dmg = list.find((x) => x.ev.kind === 'damage')!;
    expect(dmg.e.depth).toBeGreaterThan(head.e.depth);
  });

  it('全体の効果の対象はすべて、お互いの効果は両方のプレイヤー', () => {
    const g = rich(startGame());
    const a = putMonster(g, 1, MON(1, 9));
    const b = putMonster(g, 1, MON(1, 9));
    const s = play(g, giveCard(g, 0, SPELL([fx({ id: 'damage', value: 1, target: 'enemyMonsters' })])));
    expect(evs(s, 0).find((x) => x.ev.kind === 'effect')!.ev.targets).toEqual([M(a), M(b)]);
    const t = play(s, giveCard(s, 0, SPELL([fx({ id: 'draw', value: 1, target: 'bothPlayers' })])));
    expect(evs(t, s.log.length).find((x) => x.ev.kind === 'effect')!.ev.targets).toEqual([P(0), P(1)]);
  });

  it('場のモンスターの効果は source（タイル）から。条件で不発なら対象は付かない', () => {
    const g = rich(startGame());
    const mon = MON(1, 9, { effects: [fx({ id: 'damage', value: 1, timing: 'summon', target: 'enemyPlayer' })] });
    const s = play(g, giveCard(g, 0, mon));
    const head = evs(s, 0).find((x) => x.ev.kind === 'effect')!.ev;
    expect(head.source).toEqual(M(s.players[0].board[0]!.uid));
    expect(head.targets).toEqual([P(1)]);
    const t = play(s, giveCard(s, 0, SPELL([fx({ id: 'damage', value: 1, target: 'enemyPlayer', condition: 'lowHp' })])));
    const miss = evs(t, s.log.length).find((x) => x.ev.kind === 'effect')!.ev;
    expect(miss.targets).toBeUndefined();
  });

  it('デメリット：使ったときは見出しの行に drawback、ターン開始時の維持費は「維持費」の行に付く', () => {
    const g = rich(startGame());
    const s = play(g, giveCard(g, 0, SPELL([fx({ id: 'draw', value: 1, target: 'self' })], { drawbacks: [{ id: 'selfDamage', value: 1, timing: 'play' }] })));
    expect(evs(s, 0).some((x) => x.ev.kind === 'drawback' && x.ev.drawbackId === 'selfDamage' && x.ev.player === 0)).toBe(true);
    const u = rich(startGame());
    putMonster(u, 0, MON(1, 9, { drawbacks: [{ id: 'upkeep', timing: null }] }));
    const from = u.log.length;
    const t = endTurn(endTurn(u));
    const tagged = evs(t, from).find((x) => x.ev.kind === 'drawback' && x.ev.drawbackId === 'upkeep')!;
    expect(tagged.e.text).toContain('維持費');
    expect(tagged.ev.source?.kind).toBe('monster');
  });

  it('キーワード：絆魂の回復に keywordId、接死・貫通は keyword の出来事', () => {
    const g = rich(startGame());
    const a = putMonster(g, 0, MON(3, 9, { keywords: [{ id: 'lifelink' }, { id: 'deathtouch' }] }));
    const d = putMonster(g, 1, MON(0, 9));
    g.players[0].hp -= 5;
    const s = attack(g, a, M(d));
    const list = evs(s, 0).map((x) => x.ev);
    expect(list.some((ev) => ev.kind === 'heal' && ev.keywordId === 'lifelink')).toBe(true);
    expect(list.some((ev) => ev.kind === 'keyword' && ev.keywordId === 'deathtouch' && ev.target?.kind === 'monster')).toBe(true);
  });

  it('攻撃力・体力・キーワードの変化は stat（delta・keywordId）、切削は zone', () => {
    const g = rich(startGame());
    const mine = putMonster(g, 0, MON(1, 9));
    let s = play(g, giveCard(g, 0, SPELL([fx({ id: 'attackUp', value: 2 })])), { ally: mine });
    expect(evs(s, 0).some((x) => x.ev.kind === 'stat' && x.ev.delta?.attack === 2 && x.ev.target?.kind === 'monster')).toBe(true);
    const from = s.log.length;
    s = play(s, giveCard(s, 0, SPELL([fx({ id: 'grantKeyword', option: 'flying' })])), { ally: mine });
    expect(evs(s, from).some((x) => x.ev.kind === 'stat' && x.ev.keywordId === 'flying')).toBe(true);
    const from2 = s.log.length;
    s = play(s, giveCard(s, 0, SPELL([fx({ id: 'mill', value: 2, target: 'enemyPlayer' })])));
    expect(evs(s, from2).some((x) => x.ev.kind === 'zone' && x.ev.status === 'mill' && x.ev.player === 1 && x.ev.amount === 2)).toBe(true);
  });

  it('出来事を足してもログの行は増えない（CPU のシード＝ログの長さが変わらない）・JSON にできる', () => {
    const g = rich(startGame());
    putMonster(g, 1, MON(1, 9));
    const s = play(g, giveCard(g, 0, SPELL([fx({ id: 'damage', value: 1, target: 'enemyAll' })])));
    // 見出し1行・全体の対象（プレイヤーとモンスター）2行・カードを使った1行・捨て札
    const lines = s.log.slice(g.log.length);
    expect(lines.filter((e) => e.ev?.kind === 'effect')).toHaveLength(1);
    expect(lines.every((e) => e.text.length > 0)).toBe(true);
    expect(JSON.parse(JSON.stringify(s.log))).toEqual(s.log);
  });
});

// ---------------------------------------------------------------- 隠した情報を漏らさない
/** 相手（viewer）にも見える、新しい公開の行の出来事（from は本当のログの位置。viewFor は本人だけの行を除くので位置がずれる） */
const publicEvs = (g: G, _viewer: PlayerId, from: number) =>
  g.log
    .slice(from)
    .filter((e) => e.private === undefined && e.ev)
    .map((e) => e.ev!);
const mentions = (list: battle.LogEvent[], token: string) => JSON.stringify(list).includes(`"${token}"`);

describe('相手に隠した情報を出来事に漏らさない', () => {
  it('サーチ：探したカードの uid・cardId は相手から見える出来事に出ない', () => {
    const g = rich(startGame());
    const secret = MON(9, 9, { name: '秘密の竜' });
    g.cards['p0:secret'] = secret;
    g.players[0].deck.splice(3, 0, { uid: 'secret-uid', cardId: 'p0:secret', owner: 0 });
    const from = g.log.length;
    let s = play(g, giveCard(g, 0, SPELL([fx({ id: 'search', option: 'monster', target: 'self' })])));
    if (s.pending) s = act(s, { type: 'choose', player: 0, picks: ['secret-uid'] });
    expect(s.players[0].hand.some((c) => c.uid === 'secret-uid')).toBe(true);
    const list = publicEvs(s, 1, from);
    expect(list.some((ev) => ev.kind === 'draw' && ev.player === 0)).toBe(true);
    expect(mentions(list, 'secret-uid')).toBe(false);
    expect(mentions(list, 'p0:secret')).toBe(false);
  });

  it('ドロー：引いた枚数だけ（引いたカードの uid・cardId は出ない）', () => {
    const g = rich(startGame());
    const top = g.players[0].deck[0]!;
    const from = g.log.length;
    const s = play(g, giveCard(g, 0, SPELL([fx({ id: 'draw', value: 1, target: 'self' })])));
    const list = publicEvs(s, 1, from);
    expect(list.find((ev) => ev.kind === 'draw')).toEqual({ kind: 'draw', player: 0, amount: 1 });
    expect(mentions(list, top.uid)).toBe(false);
  });

  it('裏向き（変装）：本当のカードの uid・cardId は相手から見える出来事に出ない', () => {
    const g = rich(startGame());
    const def = MON(4, 6, { name: '覆面の王', abilities: [AB('disguise', 1)] });
    const c = giveCard(g, 0, def);
    const from = g.log.length;
    const s = act(g, { type: 'playCard', player: 0, cardUid: c, chosen: {}, alt: 'faceDown' });
    expect(s.players[0].board[0]!.faceDown).toBeDefined();
    const list = publicEvs(s, 1, from);
    expect(mentions(list, c)).toBe(false);
    expect(mentions(list, `p0:${def.id}`)).toBe(false);
    // 自分には見える（自分の行動）
    expect(battle.viewFor(s, 0).log.slice(from).some((e) => e.text.includes('覆面の王'))).toBe(true);
  });

  it('予顕：伏せたカードの uid・cardId は相手から見える出来事に出ない', () => {
    const g = rich(startGame());
    const def = SPELL([fx({ id: 'damage', value: 4 })], { name: '伏せた矢', abilities: [AB('foretell', 1)] });
    const c = giveCard(g, 0, def);
    const from = g.log.length;
    const s = act(g, { type: 'setAside', player: 0, cardUid: c, kind: 'foretell' });
    const list = publicEvs(s, 1, from);
    expect(list.some((ev) => ev.kind === 'waiting' && ev.status === 'foretell')).toBe(true);
    expect(mentions(list, c)).toBe(false);
    expect(mentions(list, `p0:${def.id}`)).toBe(false);
  });

  it('予示：山札の一番上の正体（uid・cardId）は出ない', () => {
    const g = rich(startGame());
    g.cards['p0:hidden-top'] = MON(5, 5, { name: '山札の上' });
    g.players[0].deck.unshift({ uid: 'top-uid', cardId: 'p0:hidden-top', owner: 0 });
    const from = g.log.length;
    const s = play(g, giveCard(g, 0, SPELL([fx({ id: 'manifest', target: 'self' })], { rarity: 'rare' })));
    const list = publicEvs(s, 1, from);
    expect(list.some((ev) => ev.kind === 'summon')).toBe(true);
    expect(mentions(list, 'top-uid')).toBe(false);
    expect(mentions(list, 'p0:hidden-top')).toBe(false);
  });

  it('引いたときの効果：名前は公開だが、手札の uid は出さない', () => {
    const g = rich(startGame());
    g.cards['p0:drawn-x'] = SPELL([fx({ id: 'heal', value: 1, target: 'self', timing: 'drawn' })], { name: '引いて光る' });
    g.players[0].deck.unshift({ uid: 'drawn-uid', cardId: 'p0:drawn-x', owner: 0 });
    const from = g.log.length;
    const s = play(g, giveCard(g, 0, SPELL([fx({ id: 'draw', value: 1, target: 'self' })])));
    const list = publicEvs(s, 1, from);
    expect(list.some((ev) => ev.kind === 'status' && ev.status === 'drawn')).toBe(true);
    expect(mentions(list, 'drawn-uid')).toBe(false);
    // 引いたカードの効果の見出しも、手札のカードとしては指さない（持ち主だけ）
    const head = list.find((ev) => ev.kind === 'effect' && ev.effectId === 'heal')!;
    expect(head).toMatchObject({ player: 0 });
    expect(head.uid).toBeUndefined();
  });

  // いろいろな隠す仕組みのカードで CPU どうしに戦わせ、どの行動のあとも漏れていないことを確かめる
  const S = (id: string, cost: number, effects: EffectInstance[], extra: Partial<CardDef> = {}) => card({ id, name: id, rarity: 'common', cost, effects, ...extra });
  const Mo = (id: string, cost: number, a: number, h: number, extra: Partial<CardDef> = {}) => card({ id, name: id, rarity: 'common', cost, stats: { attack: a, hp: h, defense: 0 }, ...extra });
  const D = (v: number, extra: Partial<EffectInstance> = {}) => fx({ id: 'damage', value: v, ...extra });
  const cards: CardDef[] = [
    S('foretell', 2, [D(3)], { abilities: [AB('foretell', 1)] }),
    Mo('disguise', 3, 3, 4, { effects: [D(2, { timing: 'revealed' })], abilities: [AB('disguise', 1)] }),
    S('manifest', 1, [fx({ id: 'manifest', target: 'self' })], { rarity: 'rare' }),
    S('search', 1, [fx({ id: 'search', option: 'monster', target: 'self' })]),
    S('seek', 1, [fx({ id: 'seek', option: 'monster', target: 'self' })]),
    S('draw', 1, [fx({ id: 'draw', value: 2, target: 'self' })]),
    S('loot', 1, [fx({ id: 'loot', value: 1, target: 'self' })]),
    S('scry', 1, [fx({ id: 'scry', value: 2, target: 'self' }), D(1)]),
    S('heist', 2, [fx({ id: 'heist', target: 'enemyPlayer' })], { rarity: 'rare' }),
    Mo('bouncer', 2, 2, 2, { effects: [fx({ id: 'bounce', value: 3, timing: 'summon', target: 'random' })] }),
    Mo('wolf', 1, 2, 2),
    Mo('bear', 2, 3, 3),
  ];
  const deck = (id: string) => ({ v: 1 as const, id, name: id, entries: cards.map((c) => ({ cardId: c.id, count: c.id === 'wolf' || c.id === 'bear' ? 5 : 2 })) });
  const publicUids = (g: G): Set<string> => {
    const out = new Set<string>();
    for (const ps of g.players) {
      for (const m of ps.board) {
        out.add(m.uid);
        if (!m.faceDown) out.add(m.card.uid);
      }
      for (const c of [...ps.discard, ...ps.exile]) out.add(c.uid);
      for (const pw of [...ps.powers, ...(ps.emblems ?? [])]) out.add(pw.uid);
      for (const w of ps.waiting ?? []) if (!w.hidden) out.add(w.card.uid);
    }
    return out;
  };
  const hiddenUids = (g: G, viewer: PlayerId): Set<string> => {
    const opp: PlayerId = viewer === 0 ? 1 : 0;
    const out = new Set<string>();
    for (const c of [...g.players[opp].hand, ...g.players[opp].deck, ...g.players[viewer].deck]) out.add(c.uid);
    for (const w of g.players[opp].waiting ?? []) if (w.hidden) out.add(w.card.uid);
    for (const m of g.players[opp].board) if (m.faceDown?.card) out.add(m.faceDown.card.uid);
    return out;
  };
  const uidsOf = (ev: battle.LogEvent): string[] => [
    ...(ev.uid ? [ev.uid] : []),
    ...[ev.source, ev.target, ...(ev.targets ?? [])].flatMap((t) => (t?.kind === 'monster' ? [t.uid] : [])),
  ];
  it('いろいろなカードの CPU どうしの対戦で、どの行動のあとも出来事に漏れていない', () => {
    let checked = 0;
    for (const seed of [5, 12]) {
      const r = battle.createGame({ seed, players: [{ name: 'A', deck: deck('a'), cards }, { name: 'B', deck: deck('b'), cards }] });
      if (!r.ok) throw new Error(r.error);
      let g = r.state;
      for (let step = 0; g.phase !== 'ended' && step < 1500; step++) {
        const p = g.phase === 'mulligan' ? (g.players[0].mulligan.done ? 1 : 0) : g.pending ? g.pending.player : g.active;
        const next = battle.applyAction(g, ai.cpuAction(g, p, step, 'easy'));
        if (!next.ok) throw new Error(next.error);
        const after = next.state;
        for (const viewer of [0, 1] as const) {
          const list = publicEvs(after, viewer, g.log.length);
          if (list.length === 0) continue;
          // この行動で公開されたカード（使った・表にした・引いたときの効果で名前を出した）
          const revealedIds = new Set(list.filter((ev) => ev.kind === 'play' || ev.kind === 'reveal' || ev.kind === 'handAbility' || ev.kind === 'discardAbility' || ev.status === 'drawn').flatMap((ev) => (ev.cardId ? [ev.cardId] : [])));
          const revealedUids = new Set(list.filter((ev) => ev.kind === 'play' || ev.kind === 'reveal').flatMap((ev) => (ev.uid ? [ev.uid] : [])));
          const visibleIds = new Set([...Object.keys(battle.viewFor(g, viewer).cards), ...Object.keys(battle.viewFor(after, viewer).cards), ...revealedIds]);
          const hidden = new Set([...hiddenUids(g, viewer)].filter((u) => hiddenUids(after, viewer).has(u) && !publicUids(g).has(u) && !publicUids(after).has(u) && !revealedUids.has(u)));
          for (const ev of list) {
            for (const u of uidsOf(ev)) expect(hidden.has(u), `uid ${u} leaked in ${JSON.stringify(ev)}`).toBe(false);
            if (ev.cardId) expect(visibleIds.has(ev.cardId), `cardId ${ev.cardId} leaked in ${JSON.stringify(ev)}`).toBe(true);
            checked++;
          }
        }
        g = after;
      }
    }
    expect(checked).toBeGreaterThan(500);
  }, 120_000);
});

// ---------------------------------------------------------------- 演出の台帳
const index = JSON.parse(readFileSync(join(ROOT, 'src/ui/icons/generated/index.json'), 'utf8')) as { names: string[] };
const iconNames = new Set(index.names);

describe('演出の台帳（fx/registry.ts）', () => {
  it.each([
    ['効果', EFFECT_FX, listEffects().map((d) => d.id)],
    ['キーワード', KEYWORD_FX, listKeywords().map((d) => d.id)],
    ['デメリット', DRAWBACK_FX, listDrawbacks().map((d) => d.id)],
    ['カードの能力', ABILITY_FX, listAbilities().map((d) => d.id)],
  ] as const)('%s：登録のすべての ID に演出があり、登録に無い ID は残さない', (_label, table, ids) => {
    expect(ids.filter((id) => !(id in table))).toEqual([]);
    expect(Object.keys(table).filter((id) => !ids.includes(id))).toEqual([]);
  });

  it('状態異常（用語の状態）すべてに演出がある', () => {
    expect(STATUS_IDS.filter((id) => !(id in STATUS_FX))).toEqual([]);
  });

  it('形の名前はすべて game-icons にあり、型の代わりの形は同梱', () => {
    expect(allFxGlyphs().filter((n) => !iconNames.has(n))).toEqual([]);
    for (const n of Object.values(ARCH_GI)) expect(n in UI_ICON_PATHS, n).toBe(true);
  });

  it('エンジンが出来事に付ける status はすべて演出が分かる（台帳か、種類ごとに扱うもの）', () => {
    // 種類（kind）ごとに events.ts が扱う status
    const handled = new Set([
      'foretell', 'plot', 'suspend', 'warp', 'adventure', 'tick', // waiting
      'cycling', 'channel', 'forecast', 'renew', 'dredge', 'embalm', // handAbility・discardAbility
      'gain', 'ramp', 'day', 'night', 'fight', 'infight', 'search', 'seek', 'regen', 'sanctuary', 'drain', // energy・dayNight・attack・draw・heal
      'mill', 'bounce', 'toHand', 'exile', 'noise', 'steal', // zone（ZoneMove）
      'speed', 'crown', 'chapter', 'charge', 'sagaEnd', 'none', // 速度・王冠・英雄譚・フィールド
    ]);
    const files = [
      ...readdirSync(join(ROOT, 'src/engine/battle')).map((f) => join(ROOT, 'src/engine/battle', f)),
      ...['effects', 'drawbacks', 'keywords', 'abilities'].flatMap((d) => readdirSync(join(ROOT, 'src/engine/defs', d)).map((f) => join(ROOT, 'src/engine/defs', d, f))),
    ].filter((f) => f.endsWith('.ts'));
    const found = new Set<string>();
    for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/status: '([a-zA-Z]+)'/g)) found.add(m[1]!);
    const unknown = [...found].filter((s) => !(s in EVENT_STATUS_FX) && !handled.has(s));
    expect(unknown).toEqual([]);
    expect(found.size).toBeGreaterThan(40);
  });

  it('先読みは同梱していない形だけ（見えているカードの効果の形を含む）', () => {
    const names = fxPreload([SPELL([fx({ id: 'heist', target: 'enemyPlayer' })])]);
    expect(names).toContain(EFFECT_FX.heist!.gi);
    expect(names.filter((n) => n in UI_ICON_PATHS)).toEqual([]);
  });
});

describe('属性（fx/element.ts）', () => {
  it('絵と名前から推し量り、分からなければモンスターは物理・それ以外は魔力', () => {
    expect(guessElement({ icon: '🔥', name: 'x' })).toBe('fire');
    expect(guessElement({ icon: 'gi:ice-bolt', name: 'x' })).toBe('ice');
    expect(guessElement({ icon: 'gi:rat', name: '毒牙ネズミ' })).toBe('poison');
    expect(guessElement({ icon: 'gi:rat', name: 'ふつう' })).toBeNull();
    expect(elementOf(EFFECT_FX.damage!, { ...SPELL([]), icon: 'gi:rat', name: 'ふつう' })).toBe('arcane');
    expect(elementOf(EFFECT_FX.damage!, MON(1, 1, { icon: 'gi:rat', name: 'ふつう' }))).toBe('physical');
    expect(elementOf(EFFECT_FX.heal!, undefined)).toBe('holy');
  });
});

// ---------------------------------------------------------------- 出来事 → 演出・時間割
const showsOf = (list: BattleEvent[]) => list.map((e) => e.show);

describe('出来事 → 演出（events.ts）と時間割（fx/timeline.ts）', () => {
  it('相手のカード：手札から見せて、対象（aim）へ。効果は cast、着弾は同じ組', () => {
    const g = rich(startGame(), 0);
    const m = putMonster(g, 0, MON(1, 9));
    const s0 = endTurn(g);
    rich(s0, 1);
    const from = battle.viewFor(s0, 0).log.length;
    const s = play(s0, giveCard(s0, 1, SPELL([fx({ id: 'damage', value: 2 })], { icon: '🔥', name: '火球' })), { enemy: M(m) }, 1);
    const view = battle.viewFor(s, 0);
    const list = buildEvents(view.log.slice(from), view, 0, 1);
    const reveal = showsOf(list).find((x) => x.t === 'reveal') as Extract<Show, { t: 'reveal' }>;
    expect(reveal.aim).toEqual([m]);
    const castI = list.findIndex((e) => e.show.t === 'cast');
    const cast = list[castI]!.show as Extract<Show, { t: 'cast' }>;
    expect(cast).toMatchObject({ kind: 'effect', id: 'damage', src: 'card:1', targets: [m], el: 'fire', arch: 'bolt' });
    const hit = list.find((e) => e.show.t === 'float' && e.show.key === m)!;
    expect(hit.group).toBe(list[castI]!.group);
    expect((hit.show as Extract<Show, { t: 'float' }>).el).toBe('fire');
    // 時間割：弾が飛ぶ間だけ待って着弾
    const planned = planTimeline(list, 'full');
    expect(planned[castI]!.ms).toBe(TRAVEL_MS + 20);
    expect(timelineMs(list, { level: 'calm' })).toBeLessThan(timelineMs(list, { level: 'full' }));
  });

  it('モンスターのカードは出る場所（land）へ飛び、照準は効果の対象', () => {
    const g = endTurn(startGame());
    rich(g, 1);
    const from = battle.viewFor(g, 0).log.length;
    const s = play(g, giveCard(g, 1, MON(2, 2, { effects: [fx({ id: 'damage', value: 1, timing: 'summon', target: 'enemyPlayer' })] })), {}, 1);
    const view = battle.viewFor(s, 0);
    const reveal = showsOf(buildEvents(view.log.slice(from), view, 0, 1)).find((x) => x.t === 'reveal') as Extract<Show, { t: 'reveal' }>;
    expect(reveal.land).toBe(s.players[1].board[0]!.uid);
    expect(reveal.aim).toEqual(['p0']);
  });

  it('全体のダメージの着弾は少しずつずらして重ね、最後だけ間を取る', () => {
    const g = rich(startGame());
    for (let i = 0; i < 3; i++) putMonster(g, 1, MON(1, 9));
    const from = g.log.length;
    const s = play(g, giveCard(g, 0, SPELL([fx({ id: 'damage', value: 1, target: 'enemyMonsters' })])));
    const list = planTimeline(buildEvents(s.log.slice(from), s, 0, 1), 'full');
    const hits = list.filter((e) => e.show.t === 'float');
    expect(hits).toHaveLength(3);
    expect(hits.slice(0, 2).every((e) => e.ms === 60)).toBe(true);
    expect(hits[2]!.ms).toBeGreaterThan(200);
  });

  it('浮かぶ文字に絵文字を使わない（形は gi）', () => {
    const g = rich(startGame());
    const m = putMonster(g, 1, MON(1, 9));
    let s = play(g, giveCard(g, 0, SPELL([fx({ id: 'poison', value: 2 }), fx({ id: 'startEngine', target: 'self' }), fx({ id: 'crown', target: 'self' })])), { enemy: M(m) });
    s = play(s, giveCard(s, 0, SPELL([fx({ id: 'shield', value: 2, target: 'self' })])));
    const texts = buildEvents(s.log, s, 0, 1).flatMap((e) => (e.show.t === 'float' || e.show.t === 'notice' ? [e.show.text] : []));
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
    expect(texts.length).toBeGreaterThan(3);
    for (const t of texts) expect(emoji.test(t), t).toBe(false);
  });

  it('遅い端末の処理の遅れは次の間で取り戻す（間は決めた割合より縮めない）', () => {
    // 予定どおり：処理に時間がかからなければ、間はそのまま
    expect(nextDelay(1000, 200, 1000, 0.6)).toEqual({ delay: 200, due: 1200 });
    // 40ms 遅れて始まった：次は 160ms 後（予定の 1200 に合わせる）
    expect(nextDelay(1000, 200, 1040, 0.6)).toEqual({ delay: 160, due: 1200 });
    // 大きく遅れた：120ms（6割）より縮めず、遅れは捨てる（あとで詰め込まない）
    expect(nextDelay(1000, 200, 1500, 0.6)).toEqual({ delay: 120, due: 1620 });
    // 見出し・カードの提示（割合 1）は縮めない
    expect(nextDelay(1000, 760, 1100, 1).delay).toBe(760);
  });
});

// ---------------------------------------------------------------- 相手のターンのまとめ
describe('相手のターンのまとめ（fx/recap.ts）', () => {
  it('使ったカード・攻撃・あなたが受けたダメージ・失ったモンスターを、大事な順の帯と起きた順の一覧に', () => {
    let g = startGame();
    const mine = putMonster(g, 0, MON(0, 1));
    g = endTurn(g);
    rich(g, 1);
    const atk = putMonster(g, 1, MON(3, 9));
    g = play(g, giveCard(g, 1, SPELL([fx({ id: 'damage', value: 2, target: 'enemyPlayer' })], { name: '雷' })), {}, 1);
    g = attack(g, atk, M(mine));
    g = endTurn(g);
    const view = battle.viewFor(g, 0);
    const recap = buildRecap(view.log, view, 0)!;
    expect(recap).not.toBeNull();
    expect(recap.items.map((i) => i.kind)).toEqual(['play', 'attack', 'lost', 'damage']);
    expect(recap.items[0]!.text).toBe('「雷」を使った');
    expect(recap.chips.map((i) => i.kind)).toEqual(['damage', 'lost', 'attack', 'play']);
    expect(recap.chips[0]!.short).toBe('−2');
  });

  it('相手のターンが無い・何も起きなかったときは無い', () => {
    const g = startGame();
    expect(buildRecap(g.log, g, 0)).toBeNull();
    const s = endTurn(endTurn(g));
    expect(buildRecap(s.log, s, 0)).toBeNull();
  });
});

// ---------------------------------------------------------------- 合図・設定
describe('合図（fx/cues.ts）と設定（fx/settings.ts）', () => {
  it('playCue は差し込んだ関数に ID と側・大きさを渡す（差し込まなければ何もしない）', () => {
    const got: [CueId, unknown][] = [];
    playCue('heal', { mine: true });
    setCueHandler((c, o) => got.push([c, o]));
    playCue('hit.fire.l', { mine: false, magnitude: 0.1 });
    setCueHandler(null);
    playCue('draw', { mine: true });
    expect(got).toEqual([['hit.fire.l', { mine: false, magnitude: 0.1 }]]);
  });

  it('合図の一覧に説明がある（属性つきは代表の形）・大きさの区切り', () => {
    for (const k of ['turn.mine', 'turn.enemy', 'card.reveal', 'cast.<属性>', 'hit.<属性>.<s|m|l>', 'heal', 'ward', 'summon', 'destroy', 'draw', 'player.hit', 'recap']) expect(CUES[k], k).toBeTruthy();
    expect(sizeOf(1, 100)).toBe('s');
    expect(sizeOf(4, 100)).toBe('m');
    expect(sizeOf(30, 100)).toBe('l');
  });

  it('合図の一覧は docs/SPEC.md の決定事項 #126 にも全部書いてある（表の中の | は全角）', () => {
    const row = readFileSync(join(ROOT, 'docs/SPEC.md'), 'utf8')
      .split('\n')
      .find((l) => l.startsWith('| 126 |'));
    expect(row).toBeTruthy();
    for (const k of Object.keys(CUES)) expect(row!.includes(k.replace(/\|/g, '｜')), k).toBe(true);
  });

  it('演出の設定は「控えめ」だけを読み、壊れていたら標準', () => {
    expect(parseFxPref({ level: 'calm' })).toBe('calm');
    expect(parseFxPref({ level: 'full' })).toBe('full');
    expect(parseFxPref(null)).toBe('full');
    expect(parseFxPref('calm')).toBe('full');
  });
});
