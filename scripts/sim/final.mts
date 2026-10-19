/**
 * 最終調整（決定事項 #84）の測定。プリセット総当たり・ミラー・BURN・モンスターだけのデッキ（MONO）・挑発に寄せたデッキ（TAUNTX）・
 * パワーの極端デッキ（B0・B1 の火球／鉄の盾の枠をパワー10枚に差し替え）をまとめて回す。
 *   node scripts/sim/final.mts <tag> <n> <group...>
 *   group: valid rr mirror burn mono taunt tauntvs power pair（pair は環境変数 PAIRS="2-4,0-3" でプリセットの番号の組）
 * 出力：scripts/sim/out/final/<tag>.json（git には入れない）。表は標準出力。
 * 価格を試すときは --import ./scripts/sim/out/round2/patch.mts と PATCH_JSON（round3.md の「再現方法」）。
 * そのときプリセットのカードが違反になるなら、量を同じ割合で減らして作れる最大にする（autoFit。目安用）。GROW=1 なら余った体力を増やす。
 */
import { mkdirSync } from 'node:fs';
import {
  B0,
  B1,
  BURN,
  BALANCE,
  PRESET_DECKS,
  analyzeCard,
  analyzeDeck,
  burnCard,
  buildDeck,
  cardAtCap,
  fill,
  fitValue,
  fx,
  pct,
  presetSpec,
  series,
  writeOut,
  type DeckSpec,
  type SeriesResult,
} from './lib.mts';
import { EXTREME10, variant } from './stress10.mts';
import { createEffect, type CardDef, type EffectInstance, type KeywordInstance, type Rarity, type Stats } from '../../src/engine/index.ts';
import { SAMPLE_CARDS } from '../../src/samples.ts';
import { TEMPLATES } from '../../src/ui/editor/templates.ts';

const eff = (id: string, over: Partial<EffectInstance> = {}): EffectInstance => ({ ...createEffect(id, 'spell'), ...over });
const st = (attack: number, hp: number, defense = 0): Stats => ({ attack, hp, defense });

/** 体力を 0.25 刻みで最大にしたモンスター（攻撃力・キーワードは固定） */
function mon(name: string, rarity: Rarity, cost: number, attack: number, keywords: KeywordInstance[] = [], defense = 0): CardDef {
  for (let hp = 40; hp >= 1; hp -= 0.25) {
    try {
      return cardAtCap(rarity, cost, [], st(attack, hp, defense), keywords, { name });
    } catch {
      /* 次へ */
    }
  }
  throw new Error(`作れない：${name}`);
}
/** 同名の上限を守って n 枚（fill はカードを作り直すので、体力の決まったカードの中身を渡す） */
function many(card: CardDef, rarity: Rarity, n: number): [CardDef, number][] {
  if (rarity === 'common') return [[card, n]];
  return fill(card.name, rarity, card.cost, { stats: { ...card.stats!, attack: card.stats!.attack / BALANCE.scale, hp: card.stats!.hp / BALANCE.scale, defense: card.stats!.defense / BALANCE.scale }, keywords: card.keywords }, n);
}

/** 上限で作ったモンスターだけのデッキ（コスト1〜4、キーワードあり、呪文なし） */
export const MONO = (): DeckSpec => {
  const K = (id: string): KeywordInstance => ({ id });
  const list: [CardDef, number][] = [
    [mon('兵士', 'common', 1, 3), 6],
    [mon('突撃兵', 'common', 1, 2, [K('haste')]), 4],
    [mon('盾兵', 'common', 2, 3, [K('taunt')]), 4],
    [mon('鷹', 'common', 2, 4, [K('flying')]), 4],
    [mon('破城槌', 'common', 3, 6, [K('trample')]), 3],
    ...many(mon('騎兵', 'rare', 2, 4, [K('haste')]), 'rare', 3),
    ...many(mon('グリフォン', 'rare', 3, 6, [K('flying')]), 'rare', 3),
    ...many(mon('双剣士', 'epic', 3, 4, [K('doubleAttack')]), 'epic', 2),
    [mon('巨竜', 'legend', 4, 9, [K('flying'), K('trample')]), 1],
  ];
  return buildDeck('MONO', list);
};

/** 挑発に寄せたデッキ：挑発の壁20枚＋コスト1のダメージ10枚 */
export const TAUNTX = (): DeckSpec => {
  const K = (id: string): KeywordInstance => ({ id });
  const fire = burnCard();
  return buildDeck('TAUNTX', [
    [mon('衛兵', 'common', 1, 1, [K('taunt')]), 10],
    [mon('城壁', 'common', 2, 3, [K('taunt')]), 10],
    [fire, 10],
  ]);
};

const AMOUNT_IDS = new Set(['damage', 'multiHit', 'poison', 'shield', 'heal', 'attackUp', 'regen', 'execute', 'counter', 'strength', 'focus', 'bleed']);
/** 価格の試し（PATCH_JSON）で違反になったプリセットのカードは、量（効果の量・体力・攻撃力）を同じ割合で減らして作れる最大にする（目安用） */
function autoFit(c: CardDef): CardDef {
  if (analyzeCard(c).valid) return c;
  const r5 = (v: number) => Math.max(5, Math.floor(v / 5) * 5);
  for (let f = 0.97; f > 0.2; f -= 0.03) {
    const d: CardDef = {
      ...c,
      stats: c.stats ? { ...c.stats, hp: r5(c.stats.hp * f), attack: c.stats.attack === 0 ? 0 : r5(c.stats.attack * f) } : null,
      effects: c.effects.map((e) => (AMOUNT_IDS.has(e.id) && e.value ? { ...e, value: r5(e.value * f) } : e)),
    };
    if (analyzeCard(d).valid) return d;
  }
  throw new Error(`autoFit できない：${c.name}`);
}
export const FITTED: string[] = [];
const PRESETS = PRESET_DECKS.map((_, i) => {
  const p = presetSpec(i);
  const cards = p.cards.map((c) => {
    let d = autoFit(c);
    if (process.env.GROW && d.stats) {
      // 値段が下がって余ったぶん、体力を整数（倍率1）で増やす（目安用）
      for (;;) {
        const e: CardDef = { ...d, stats: { ...d.stats!, hp: d.stats!.hp + BALANCE.scale } };
        if (!analyzeCard(e).valid) break;
        d = e;
      }
    }
    if (d !== c) FITTED.push(`${p.name}/${c.name}`);
    return d;
  });
  return { ...p, cards };
});
const short = (s: SeriesResult) => ({ label: s.label, n: s.games, win: +(s.winRate * 100).toFixed(1), draw: +(s.drawRate * 100).toFixed(1), first: +(s.firstWinRate * 100).toFixed(1), med: s.turnsMedian, p90: s.turnsP90 });

function deckDesc(d: DeckSpec): string[] {
  const byId = new Map(d.cards.map((c) => [c.id, c]));
  return d.deck.entries.map((e) => {
    const c = byId.get(e.cardId)!;
    const a = analyzeCard(c);
    const s = c.stats ? ` ${c.stats.attack / 20}/${c.stats.hp / 20}${c.stats.defense ? '/' + c.stats.defense / 20 : ''}` : '';
    return `${c.name}(${c.rarity[0]}c${c.cost}${s}${c.keywords.map((k) => ' ' + k.id).join('')}) ×${e.count} ${a.points.total}/${a.points.cap}`;
  });
}

const [tag = "x", nArg = "150", ...groups] = process.argv[1]?.endsWith('final.mts') ? process.argv.slice(2) : [];
const n = Number(nArg);
const out: Record<string, unknown> = { tag, n, patch: process.env.PATCH_JSON ?? null };
const log = (s: string) => console.log(s);

async function vsList(name: string, a: DeckSpec, opps: DeckSpec[], seed: number): Promise<ReturnType<typeof short>[]> {
  const rows = [];
  for (let i = 0; i < opps.length; i++) {
    const r = short(await series(a, opps[i]!, n, { seedBase: seed + i * 1000, label: `${name} vs ${opps[i]!.name}` }));
    rows.push(r);
    log(`${r.label.padEnd(26)} ${String(r.win).padStart(5)}%  引分${r.draw}%  中央${r.med}T`);
  }
  return rows;
}

for (const g of groups) {
  const t0 = performance.now();
  if (g === 'valid') {
    const bad: string[] = [];
    for (const p of PRESET_DECKS) {
      const a = analyzeDeck(p.deck, new Map(p.cards.map((c) => [c.id, c])));
      if (!a.valid) bad.push(`${p.name}: ${a.violations.map((v) => v.message).join(' / ')}`);
      for (const c of p.cards) {
        const ac = analyzeCard(c);
        if (!ac.valid) bad.push(`${p.name}/${c.name}: ${ac.points.total}/${ac.points.cap}`);
        else if (ac.points.cap - ac.points.total > 40) bad.push(`(余り) ${p.name}/${c.name}: ${ac.points.total}/${ac.points.cap}`);
      }
    }
    for (const c of SAMPLE_CARDS) {
      const ac = analyzeCard(c);
      log(`見本 ${c.name}: ${ac.points.total}/${ac.points.cap} ${ac.valid ? '' : '違反'}`);
      if (!ac.valid) bad.push(`見本 ${c.name}`);
    }
    for (const t of TEMPLATES) {
      const ac = analyzeCard(t.build(`tpl-${t.id}`));
      log(`ひな形 ${t.title}: ${ac.points.total}/${ac.points.cap} ${ac.valid ? '' : '違反'}`);
      if (!ac.valid) bad.push(`ひな形 ${t.title}`);
    }
    log('autoFit: ' + FITTED.join(', '));
    log(bad.length ? bad.join('\n') : 'プリセット・見本はすべて作れる');
    for (const d of [MONO(), TAUNTX(), BURN()]) log(`${d.name}: ${deckDesc(d).join(' / ')}`);
    out.valid = bad;
  }
  if (g === 'burn') out.burn = await vsList('BURN', BURN(), PRESETS, 100000);
  if (g === 'mono') out.mono = await vsList('MONO', MONO(), [...PRESETS, BURN()], 200000);
  if (g === 'taunt') out.taunt = await vsList('TAUNTX', TAUNTX(), [B0(), B1(), ...PRESETS], 300000);
  if (g === 'tauntvs') {
    // 参考：挑発の差し替え（stress10 の taunt）
    const rows = [];
    for (const base of ['B0', 'B1'] as const) {
      const x1 = { ...EXTREME10.taunt!, build: (v: number) => ({ stats: { attack: 1, hp: v, defense: 0 }, keywords: [{ id: 'taunt' }], name: `挑発1/${v}` }) };
      const v = variant('taunt', base, x1);
      const r = short(await series(v.deck, base === 'B0' ? B0() : B1(), n, { seedBase: base === 'B0' ? 2000 : 3000, label: `taunt10 vs ${base}（${v.desc}）` }));
      rows.push(r);
      log(`${r.label} ${r.win}% 引分${r.draw}% 中央${r.med}T`);
    }
    out.tauntvs = rows;
  }
  if (g === 'power') {
    const ANY: [Rarity, number][] = [
      ['common', 1],
      ['rare', 1],
      ['rare', 2],
      ['epic', 2],
      ['legend', 2],
      ['legend', 3],
      ['legend', 4],
      ['legend', 5],
    ];
    const mk = (id: string, timing: EffectInstance['timing'], name: string) => ({
      slot: 'spell' as const,
      step: 0.25,
      tries: ANY,
      build: (v: number) => ({ effects: [eff(id, { value: v, timing, target: 'enemyPlayer' })], name: `${name}${v}` }),
    });
    const decks: Record<string, Parameters<typeof variant>[2]> = {
      cardPlayedDmg: EXTREME10.cardPlayedDmg!,
      turnStartDmg: EXTREME10.turnStartDmg!,
      turnEndDmg: mk('damage', 'turnEnd', '終了時ダメ'),
      turnStartPoison: EXTREME10.turnStartPoison!,
      turnEndPoison: mk('poison', 'turnEnd', '終了時毒'),
      cardPlayedPoison: mk('poison', 'cardPlayed', '使うたび毒'),
    };
    const rows = [];
    for (const [key, x] of Object.entries(decks)) {
      for (const base of ['B0', 'B1'] as const) {
        const v = variant(key, base, x);
        const r = short(await series(v.deck, base === 'B0' ? B0() : B1(), n, { seedBase: base === 'B0' ? 2000 : 3000, label: `${key} vs ${base}` }));
        rows.push({ ...r, desc: v.desc });
        log(`${r.label.padEnd(24)} ${String(r.win).padStart(5)}% 引分${r.draw}% 中央${r.med}T  ${v.desc}`);
      }
    }
    out.power = rows;
  }
  if (g === 'pair') {
    const rows = [];
    for (const pr of (process.env.PAIRS ?? '2-4').split(',')) {
      const [a, b] = pr.split('-').map(Number) as [number, number];
      const r = short(await series(PRESETS[a]!, PRESETS[b]!, n, { seedBase: 400000 + (a * 10 + b) * 1000 }));
      rows.push(r);
      log(`${r.label.padEnd(26)} ${String(r.win).padStart(5)}%  引分${r.draw}%  中央${r.med}T p90 ${r.p90}`);
    }
    out.pair = rows;
  }
  if (g === 'rr') {
    const rows = [];
    for (let a = 0; a < PRESETS.length; a++) {
      for (let b = a + 1; b < PRESETS.length; b++) {
        const r = short(await series(PRESETS[a]!, PRESETS[b]!, n, { seedBase: 400000 + (a * 10 + b) * 1000 }));
        rows.push(r);
        log(`${r.label.padEnd(26)} ${String(r.win).padStart(5)}%  引分${r.draw}%  中央${r.med}T p90 ${r.p90}`);
      }
    }
    out.rr = rows;
  }
  if (g === 'mirror') {
    const rows = [];
    for (const d of [...PRESETS, B0()]) {
      const r = short(await series(d, d, n, { first: 0, seedBase: 500000, label: `${d.name} ミラー` }));
      rows.push(r);
      log(`${r.label.padEnd(20)} 先攻 ${String(r.win).padStart(5)}%  引分${r.draw}%  中央${r.med}T p90 ${r.p90}`);
    }
    out.mirror = rows;
  }
  console.error(`[${g}] ${((performance.now() - t0) / 1000).toFixed(0)}s`);
}
if (groups.length) {
  mkdirSync(new URL('./out/final/', import.meta.url), { recursive: true });
  console.log(`→ ${writeOut(`final/${tag}.json`, out)}`);
}
