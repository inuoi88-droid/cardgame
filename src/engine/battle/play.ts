/** カードの使用とノイズの除外 */
import { BALANCE } from '../balance.ts';
import { classifyCard } from '../classify.ts';
import { TIMINGS, isPowerTiming, overloadTarget, type TargetRule } from '../options.ts';
import { describeEffect } from '../text.ts';
import { getAbility, getDrawback, getEffect } from '../registry.ts';
import type { AbilityDef, CostContext, FromDiscardRule } from '../define.ts';
import type { AbilityInstance, CardDef, EffectInstance, TimingId } from '../types.ts';
import { checkCondition } from './conditions.ts';
import { cardName, effectiveAttack, enqueue, findMonster, log, newUid, other, playerRef, playRecord } from './core.ts';
import { attacksPerTurn } from './combat.ts';
import { enqueueCardTiming, enqueueMonsters, enqueuePowers } from './triggers.ts';
import { cardTargetable, cardTargetableTaunts, destroyMonster, wardTax } from './damage.ts';
import { randInt } from './rng.ts';
import { afterDiscarded, createToken, discardCard, placeFaceDown, summon } from './zones.ts';
import { altWinOnCardPlayed, emblemFull, isEmblemCard } from './powers.ts';
import { putWaiting, waitingEntry } from './waiting.ts';
import { ruleHooks } from './rules.ts';
import { startDayNightFor } from './matchRules.ts';
import { cardModes, effectsForMode, entwineCost, firstMode, isVillain, modeMatches, resolveMode, spreeCost, tieredSurcharge, type ModeSel } from './modes.ts';
import { chargePowers, startSaga } from './powers.ts';
import { MODE_LABEL, type ModeId } from '../types.ts';
import {
  FACE_DOWN_WARD_CARD_ID,
  NOISE_CARD_ID,
  type AltPlay,
  type CardInst,
  type Chosen,
  type ExtraPayKind,
  type Monster,
  type SacrificeKind,
  type DelayedEffect,
  type GameState,
  type PlayFrom,
  type PlayerId,
  type PowerInst,
  type Step,
  type TargetRef,
} from './types.ts';

/** 護法（MTG 要素 ○ バッチB）：「選んだ1体」の相手モンスターが護法なら、そのぶんのコストの上乗せ */
export function wardTaxFor(g: GameState, p: PlayerId, chosen?: Chosen): number {
  const t = chosen?.enemy;
  if (!t || t.kind !== 'monster') return 0;
  const m = findMonster(g, t.uid);
  if (!m || m.controller === p) return 0;
  return wardTax(g, m);
}

/** コストの計算に渡す情報（MTG 要素 ○ バッチC1）：選んだ1体（護法）・どこから使うか（フラッシュバック）・キッカーを払うか */
export interface CostCtx {
  chosen?: Chosen;
  /** 'waiting' は待機ゾーンから（MTG 要素 △ バッチC：予顕はコスト−K、計画は無料、ワープ・出来事は普通のコスト） */
  from?: 'hand' | 'discard' | 'waiting';
  kick?: boolean;
  /** 選んだモード（MTG 要素 ○ バッチC2）。0 は双呪（追加エナジー） */
  mode?: number;
  // ---- MTG 要素 △ バッチB（追加の支払い・代わりの使い方・差し出す・払い方）
  /** 放題で選んだモード（2つ以上） */
  modes?: readonly number[];
  /** 切除・奮励・分隊の回数 */
  extra?: number;
  alt?: AltPlay;
  /** 現出で差し出すモンスター（犠牲・協約はコストを変えない） */
  sacrificeUid?: string;
  /** 召集・調和で休ませるモンスター */
  tapUids?: readonly string[];
  /** 探査で除外する捨て札（手札から使うとき。捨て札から使うときは脱出の除外でコストは変わらない） */
  exileUids?: readonly string[];
  pitchUid?: string;
  lifePay?: number;
}

/** コストの内訳の1段（label は「親和」「凍結」など、delta は増減） */
export interface CostStep {
  label: string;
  delta: number;
}

/**
 * コストの内訳：印刷コスト（一時蘇生・代わりの使い方）→ 軽減（親和・条件付き軽減）→ 現出・召集・探査・調和 → 凍結・軽減効果 →
 * 代替コスト → 追加の支払い（キッカー・双呪・放題・段階・切除・奮励・分隊・フラッシュバック・護法）→ 血の支払い。
 * total は払うエナジー、hp は血の支払いで払う HP（無ければ省略）
 */
export interface CostBreakdown {
  printed: number;
  steps: CostStep[];
  total: number;
  hp?: number;
}

/** 捨て札から使う能力（フラッシュバック・再活・脱出）。無ければ undefined */
export function fromDiscardAbility(def: CardDef | undefined): { a: AbilityInstance; rule: FromDiscardRule; name: string } | undefined {
  for (const a of def?.abilities ?? []) {
    const ad = getAbility(a.id);
    if (ad?.battle.fromDiscard) return { a, rule: ad.battle.fromDiscard, name: ad.name };
  }
  return undefined;
}

/** キッカーの追加エナジー（キッカーが無ければ 0） */
export function kickerCost(def: CardDef | undefined): number {
  for (const a of def?.abilities ?? []) {
    const k = getAbility(a.id)?.battle.kickerCost?.(a);
    if (k !== undefined) return k;
  }
  return 0;
}

/**
 * 待機ゾーンから使うときの決まり（MTG 要素 △ バッチC）：予顕はコスト−cut、計画は無料。ワープ・出来事は普通のコスト（どちらも undefined の項目）
 */
export function waitingRule(def: CardDef | undefined, kind: string): { name: string; cut?: number; free?: boolean } | undefined {
  for (const a of def?.abilities ?? []) {
    const ad = getAbility(a.id);
    const sa = ad?.battle.setAside;
    if (ad && sa && sa.kind === kind) return { name: ad.name, ...(sa.cut ? { cut: sa.cut(a) } : {}), ...(sa.free ? { free: true } : {}) };
  }
  return undefined;
}

// ---------------------------------------------------------------- 追加の支払い（MTG 要素 △ バッチB）

/** カードの能力のうち、test を満たす最初のもの（定義つき） */
function abilityWhere(def: CardDef | undefined, test: (ad: AbilityDef) => boolean): { a: AbilityInstance; ad: AbilityDef } | undefined {
  for (const a of def?.abilities ?? []) {
    const ad = getAbility(a.id);
    if (ad && test(ad)) return { a, ad };
  }
  return undefined;
}

/** 追加の支払い（切除・奮励・分隊）：1回のエナジーと回数の上限 */
export function extraPayOf(def: CardDef | undefined): { kind: ExtraPayKind; name: string; unit: number; max: number } | undefined {
  const x = abilityWhere(def, (ad) => ad.battle.extraPay !== undefined);
  if (!x) return undefined;
  const e = x.ad.battle.extraPay!;
  return { kind: e.kind, name: x.ad.name, unit: e.unit(x.a), max: e.max };
}

/** 代わりの使い方（試作・想起・超過・解鎖）の一覧 */
export function altsOf(def: CardDef | undefined): { kind: AltPlay; name: string; a: AbilityInstance; cost: (printed: number) => number }[] {
  return (def?.abilities ?? []).flatMap((a) => {
    const ad = getAbility(a.id);
    const alt = ad?.battle.alt;
    return ad && alt ? [{ kind: alt.kind, name: ad.name, a, cost: (printed: number) => alt.cost(a, printed) }] : [];
  });
}

/** 差し出す能力（現出・犠牲・協約） */
export function sacrificeOf(def: CardDef | undefined): { kind: SacrificeKind; name: string; minAttack: number } | undefined {
  const x = abilityWhere(def, (ad) => ad.battle.sacrifice !== undefined);
  if (!x) return undefined;
  const s = x.ad.battle.sacrifice!;
  return { kind: s.kind, name: x.ad.name, minAttack: s.minAttack?.(x.a) ?? 0 };
}

/** 召集・探査の上限（無ければ 0） */
export const convokeMax = (def: CardDef | undefined): number => abilityWhere(def, (ad) => ad.battle.convoke !== undefined)?.ad.battle.convoke!.max ?? 0;
export const delveMax = (def: CardDef | undefined): number => abilityWhere(def, (ad) => ad.battle.delve !== undefined)?.ad.battle.delve!.max ?? 0;

/** 血の支払い：HP で払えるエナジーの数（無ければ 0） */
export function lifePayMax(def: CardDef | undefined): number {
  const x = abilityWhere(def, (ad) => ad.battle.lifePay !== undefined);
  return x ? x.ad.battle.lifePay!(x.a) : 0;
}

/** 代替コストを持つか */
export const hasPitch = (def: CardDef | undefined): boolean => abilityWhere(def, (ad) => ad.battle.pitch === true) !== undefined;

/** 現出で下がるコスト：差し出すモンスターのカードの印刷コスト（トークンは0、複写トークンは元のカード） */
export function emergeCut(g: GameState, m: Monster): number {
  if (m.card.token && !m.card.token.copy) return 0;
  return g.cards[m.card.cardId]?.cost ?? 0;
}

/** 召集・調和・後援で休ませられるか（まだ攻撃回数が残っている。召喚酔い・凍結中でもよい＝動力化と同じ） */
export function canTap(g: GameState, m: Monster): boolean {
  return m.attacksUsed < attacksPerTurn(g, m);
}

/** 代替コストで除外できる手札か（このカード以外で、種類が同じ。パワーアタックはパワー。ノイズは不可） */
export function pitchMatches(g: GameState, card: CardInst, other: CardInst): boolean {
  if (other.uid === card.uid || other.cardId === NOISE_CARD_ID) return false;
  const a = g.cards[card.cardId];
  const b = g.cards[other.cardId];
  if (!a || !b) return false;
  const kind = (d: CardDef) => (classifyCard(d) === 'powerAttack' ? 'power' : classifyCard(d));
  return kind(a) === kind(b);
}

/**
 * 実際に払うコストの内訳（MTG 要素 ○ バッチC1 で一般化、△ バッチB で追加の支払い）。
 * ①印刷コスト（一時蘇生は K、代わりの使い方はそのコスト）②軽減（親和・条件付き軽減。それぞれの下限まで、両方なら大きい方の下限で止める）
 * ③現出・召集・探査・調和（0まで）④凍結の+1・軽減効果の−（0まで）⑤代替コスト（ここまでを0に）
 * ⑥追加の支払い（キッカー・双呪・放題・段階・切除・奮励・分隊・フラッシュバック・護法。護法は「選んだ1体」を渡したときだけ）⑦血の支払い
 */
export function costBreakdown(g: GameState, p: PlayerId, card: CardInst, ctx: CostCtx = {}): CostBreakdown {
  const def = g.cards[card.cardId];
  if (!def) return { printed: 0, steps: [], total: 0 };
  const ps = g.players[p];
  const steps: CostStep[] = [];
  const fromDiscard = ctx.from === 'discard';
  // ① 一時蘇生（捨て札から K）・代わりの使い方（MTG 要素 △ バッチB）
  let start = def.cost;
  const fd = fromDiscard ? fromDiscardAbility(def) : undefined;
  const fixed = fd?.rule.fixedCost?.(fd.a);
  if (fixed !== undefined && fixed !== start) {
    steps.push({ label: fd!.name, delta: fixed - start });
    start = fixed;
  }
  const alt = ctx.alt ? altsOf(def).find((x) => x.kind === ctx.alt) : undefined;
  if (alt) {
    const c = Math.max(0, alt.cost(start));
    if (c !== start) steps.push({ label: alt.name, delta: c - start });
    start = c;
  }
  // 待機ゾーンから（MTG 要素 △ バッチC）：予顕はコスト−K（0まで）、計画は無料（凍結・軽減も掛からない）
  const w = ctx.from === 'waiting' ? waitingEntry(g, p, card.uid) : undefined;
  const ws = w ? waitingRule(def, w.kind) : undefined;
  const planned = ws?.free === true;
  if (ws?.cut) {
    const c = Math.max(0, start - ws.cut);
    if (c !== start) steps.push({ label: ws.name, delta: c - start });
    start = c;
  } else if (planned && start > 0) {
    steps.push({ label: ws!.name, delta: -start });
    start = 0;
  }
  // ② 軽減（親和・条件付き軽減）
  const cctx: CostContext = { g, p, card, check: (c) => checkCondition(g, p, c, { forCost: true, selfUid: card.uid }) };
  const cuts: CostStep[] = [];
  let floor = 0;
  for (const a of def.abilities ?? []) {
    const ad = getAbility(a.id);
    const r = ad?.battle.reduce?.(a, cctx);
    if (!ad || !r || r.amount <= 0) continue;
    const amount = Math.min(r.amount, Math.max(0, start - r.min));
    if (amount <= 0) continue;
    floor = Math.max(floor, r.min);
    cuts.push({ label: ad.name, delta: -amount });
  }
  let excess = cuts.reduce((sum, c) => sum - c.delta, 0) - Math.max(0, start - floor);
  for (let i = cuts.length - 1; i >= 0 && excess > 0; i--) {
    const take = Math.min(excess, -cuts[i]!.delta);
    cuts[i]!.delta += take;
    excess -= take;
  }
  for (const c of cuts) if (c.delta < 0) steps.push(c);
  let base = start + cuts.reduce((sum, c) => sum + Math.min(0, c.delta), 0);
  // ③ 現出・召集・探査・調和（MTG 要素 △ バッチB。0まで）
  for (const c of paymentCuts(g, p, card, def, ctx)) {
    const d = Math.min(base, c.amount);
    if (d > 0) steps.push({ label: c.label, delta: -d });
    base -= d;
  }
  // ④ 凍結の+1・軽減効果の−（0まで）。計画したカードは無料なので掛からない
  if (ps.turn.freezeTax && !planned) {
    steps.push({ label: '凍結', delta: BALANCE.battle.freezeCostIncrease });
    base += BALANCE.battle.freezeCostIncrease;
  }
  if (ps.discount > 0 && !planned) {
    const d = Math.min(base, ps.discount * BALANCE.battle.discountAmount);
    if (d > 0) steps.push({ label: '軽減', delta: -d });
    base -= d;
  }
  // フィールド「市場」（MTG 要素 △ バッチD）：各ターン最初に使うカード（自分のターン）のコスト−N（0まで）。計画したカードは無料なので掛からない
  const market = ruleHooks(g, p).firstCardDiscount;
  if (market > 0 && !planned && g.active === p && ps.turn.cardsPlayed === 0) {
    const d = Math.min(Math.max(0, base), market);
    if (d > 0) steps.push({ label: '市場', delta: -d });
    base -= d;
  }
  base = Math.max(0, base);
  // ⑤ 代替コスト（MTG 要素 △ バッチB）：カードのコストの分を払わない（このあとの追加の支払い・護法は払う）
  if (ctx.pitchUid !== undefined && hasPitch(def) && !fromDiscard) {
    if (base > 0) steps.push({ label: '代替コスト', delta: -base });
    base = 0;
  }
  // ⑥ 追加の支払い
  let total = base;
  const add = (label: string, k: number) => {
    if (k <= 0) return;
    steps.push({ label, delta: k });
    total += k;
  };
  if (ctx.kick) add('キッカー', kickerCost(def));
  if (ctx.mode === 0) add('双呪', entwineCost(def));
  // 放題：2つ目から1つにつき K。段階：モード B・C の上乗せ
  if (ctx.modes && ctx.modes.length > 1) add('放題', spreeCost(def) * (ctx.modes.length - 1));
  add('段階', tieredSurcharge(def, ctx.mode, BALANCE.abilities.tiered.surcharge));
  const extra = extraPayOf(def);
  if (extra && ctx.extra) add(extra.name, extra.unit * Math.min(ctx.extra, extra.max));
  if (fromDiscard) {
    const fdx = fromDiscardAbility(def);
    add(fdx?.name ?? '', fdx?.rule.extraCost?.(fdx.a) ?? 0);
  }
  add('護法', wardTaxFor(g, p, ctx.chosen));
  // ⑦ 血の支払い：払うエナジーのうち n を HP で
  const n = Math.min(Math.max(0, Math.floor(ctx.lifePay ?? 0)), lifePayMax(def), total);
  const out: CostBreakdown = { printed: def.cost, steps, total };
  if (n > 0) {
    steps.push({ label: '血の支払い', delta: -n });
    out.total = total - n;
    out.hp = n * BALANCE.abilities.lifePay.hpPerEnergy;
  }
  return out;
}

/** 現出・召集・探査・調和で下がる量（uid の正しさは validatePayment が見る。ここでは見つかるものだけ数える） */
function paymentCuts(g: GameState, p: PlayerId, card: CardInst, def: CardDef, ctx: CostCtx): { label: string; amount: number }[] {
  const ps = g.players[p];
  const out: { label: string; amount: number }[] = [];
  const fromDiscard = ctx.from === 'discard';
  const own = (uid: string) => ps.board.find((m) => m.uid === uid);
  const sac = sacrificeOf(def);
  if (!fromDiscard && sac?.kind === 'emerge' && ctx.sacrificeUid) {
    const m = own(ctx.sacrificeUid);
    if (m) out.push({ label: sac.name, amount: emergeCut(g, m) });
  }
  const taps = [...new Set(ctx.tapUids ?? [])].filter((uid) => own(uid));
  if (!fromDiscard && convokeMax(def) > 0 && taps.length > 0) out.push({ label: '召集', amount: Math.min(taps.length, convokeMax(def)) });
  const tapOne = fromDiscard ? fromDiscardAbility(def)?.rule.tapOne : undefined;
  if (tapOne && taps[0]) {
    const m = own(taps[0])!;
    out.push({ label: fromDiscardAbility(def)!.name, amount: Math.min(tapOne.maxCut, Math.floor(effectiveAttack(g, m) / Math.max(1, tapOne.perEnergy))) });
  }
  const exiles = [...new Set(ctx.exileUids ?? [])].filter((uid) => uid !== card.uid && ps.discard.some((c) => c.uid === uid));
  if (!fromDiscard && delveMax(def) > 0 && exiles.length > 0) out.push({ label: '探査', amount: Math.min(exiles.length, delveMax(def)) });
  return out;
}

/** 実際に払うコスト（costBreakdown の合計） */
export function effectiveCost(g: GameState, p: PlayerId, card: CardInst, ctx: CostCtx = {}): number {
  return costBreakdown(g, p, card, ctx).total;
}

/** コストの内訳の文（ログ・画面用。例：「親和で−2、キッカーで+1」）。内訳が無ければ空 */
export function costNotes(b: CostBreakdown): string {
  return b.steps.map((s) => `${s.label}で${s.delta > 0 ? `+${s.delta}` : `−${-s.delta}`}`).join('、');
}

/** 対象の印（PlayInfo.targetCosts・選択肢の ID）：プレイヤーは `player:0`、モンスターは uid */
export const targetKey = (t: TargetRef): string => (t.kind === 'player' ? `player:${t.player}` : t.uid);
export function parseTargetKey(key: string): TargetRef {
  const m = /^player:([01])$/.exec(key);
  return m ? { kind: 'player', player: Number(m[1]) as PlayerId } : { kind: 'monster', uid: key };
}

/** カードを使ったときに出るタイミング：捨て札から使い、「捨て札から使ったとき」の効果があればそれ。なければ使用時／召喚時 */
export function playTiming(def: CardDef, from: PlayFrom = 'hand', alt?: AltPlay): TimingId {
  // 出来事（MTG 要素 △ バッチC）：モンスターのカードを呪文として使う
  if (alt === 'adventure') return 'adventure';
  if (from === 'discard' && def.effects.some((e) => e.timing === 'fromDiscard')) return 'fromDiscard';
  return def.stats ? 'summon' : 'play';
}

/**
 * 「選んだ1体」が必要な効果の作用先（timing を省略すると使用時・召喚時）。
 * mode はモード選択のカードで選ぶモード（MTG 要素 ○ バッチC2。0 は双呪、省略はすべてのモードを合わせたもの）
 */
export function chosenRules(def: CardDef, timing?: TimingId, mode?: ModeSel): { enemy: TargetRule[]; ally: boolean } {
  const t = timing ?? (def.stats ? 'summon' : 'play');
  return chosenRulesOf(
    def.effects.filter((e) => modeMatches(e, mode)),
    t,
  );
}

/** モード選択のカードで選べるモード（このタイミングのモードと、双呪があれば 0）。モード選択でなければ空 */
export function playableModes(def: CardDef, timing: TimingId): number[] {
  // 最悪の二択（MTG 要素 △ バッチB）はモードを相手が選ぶので、使う人は選ばない
  if (isVillain(def)) return [];
  const modes: number[] = cardModes(def, timing);
  if (modes.length > 0 && entwineCost(def) > 0) modes.push(0);
  return modes;
}

/** モードの名前（「A」「B」、0 は「すべて（双呪）」） */
export function modeName(mode: number): string {
  return mode === 0 ? 'すべて（双呪）' : (MODE_LABEL[mode as ModeId] ?? String(mode));
}

/** 選んだモードが正しいか（モード選択のカードでは必須。0 は双呪のあるカードだけ）。正しければ null */
export function validateMode(def: CardDef, timing: TimingId, mode: number | undefined): string | null {
  const modes = cardModes(def, timing);
  if (modes.length === 0) return mode === undefined ? null : 'このカードはモードを選べません';
  if (mode === undefined) return 'モードを選んでください';
  if (mode === 0) return entwineCost(def) > 0 ? null : 'このカードには双呪がありません';
  return (modes as number[]).includes(mode) ? null : 'そのモードはありません';
}

/**
 * モードの選び方が正しいか（MTG 要素 △ バッチB：最悪の二択は選ばない・放題は modes で2つ以上）。正しければ null
 */
export function validateModeChoice(def: CardDef, timing: TimingId, mode: number | undefined, modes: readonly number[] | undefined): string | null {
  const list = cardModes(def, timing);
  if (isVillain(def) && list.length > 0) return mode !== undefined || modes !== undefined ? 'このカードのモードは相手が選びます' : null;
  if (modes !== undefined) {
    if (list.length === 0) return 'このカードはモードを選べません';
    if (spreeCost(def) === 0) return 'このカードはモードを複数選べません（放題がありません）';
    if (mode !== undefined) return 'モードの指定が重なっています';
    if (modes.length < 2) return 'モードを2つ以上選んでください（1つなら mode）';
    for (let i = 0; i < modes.length; i++) {
      if (!(list as number[]).includes(modes[i]!)) return 'そのモードはありません';
      if (i > 0 && modes[i]! <= modes[i - 1]!) return 'モードは重ならないように小さい順に選んでください';
    }
    return null;
  }
  return validateMode(def, timing, mode);
}

/** 超過（MTG 要素 △ バッチB）：このタイミングの「選んだ1体」の効果を全体にした写し */
export function overloadedDef(def: CardDef, timing: TimingId): CardDef {
  return {
    ...def,
    effects: def.effects.map((e) => {
      const rule = getEffect(e.id)?.targetRule;
      return e.timing === timing && e.target === 'chosen' && rule ? { ...e, target: overloadTarget(rule) } : e;
    }),
  };
}

/** 効果の一覧から、このタイミングの「選んだ1体」が必要な作用先（起動のパワーは解除されていない効果だけを渡す） */
export function chosenRulesOf(effects: readonly EffectInstance[], t: TimingId): { enemy: TargetRule[]; ally: boolean } {
  const enemy: TargetRule[] = [];
  let ally = false;
  if (TIMINGS[t].chosen !== 'manual') return { enemy, ally };
  for (const e of effects) {
    if (e.timing !== t || e.target !== 'chosen') continue;
    const rule = getEffect(e.id)?.targetRule;
    if (rule === 'allyMonsterOne') ally = true;
    else if (rule === 'fight') {
      // 格闘：自分のモンスターと相手モンスターの両方を選ぶ
      ally = true;
      enemy.push(rule);
    } else if (rule) enemy.push(rule);
  }
  return { enemy, ally };
}

/**
 * 相手側の「選んだ1体」の候補（隠密・呪禁は選べない）。
 * 相手に選べる挑発モンスターがいる間は、その挑発モンスターしか選べない（相手プレイヤーも選べない：決定事項 #83）。
 * 呪禁の挑発は数えない（呪禁の挑発しかいなければ、呪禁でないモンスターとプレイヤーから自由に選べる）
 */
export function enemyCandidates(g: GameState, p: PlayerId, rules: TargetRule[]): TargetRef[] {
  if (rules.length === 0) return [];
  const opp = other(p);
  const taunts = cardTargetableTaunts(g, opp);
  if (taunts.length > 0) return taunts.map((m): TargetRef => ({ kind: 'monster', uid: m.uid }));
  const monsters = g.players[opp].board.filter((m) => cardTargetable(g, m)).map((m): TargetRef => ({ kind: 'monster', uid: m.uid }));
  const allowPlayer = rules.some((r) => r === 'enemyAny');
  return [...(allowPlayer ? [playerRef(opp)] : []), ...monsters];
}

/**
 * 自分のモンスターの「選んだ1体」の候補。モンスターのカードを召喚する（召喚時・捨て札から使ったとき）なら自分自身も選べる。
 * 魂力（手札のまま）・起動（もう場にいる）では、場のモンスターだけ
 */
export function allyCandidates(g: GameState, p: PlayerId, card: CardInst, timing?: TimingId): string[] {
  const def = g.cards[card.cardId];
  const t = timing ?? 'summon';
  // 賛助（MTG 要素 △ バッチA）のように、使ったモンスター自身は選べない効果があれば自分自身は出さない
  const notSelf = (def?.effects ?? []).some((e) => e.timing === t && e.target === 'chosen' && getEffect(e.id)?.notSelfAlly);
  const self = def?.stats && (timing === undefined || timing === 'summon' || timing === 'fromDiscard') && !notSelf;
  return [...g.players[p].board.map((m) => m.uid), ...(self ? [card.uid] : [])];
}

const sameRef = (a: TargetRef, b: TargetRef) =>
  a.kind === 'player' ? b.kind === 'player' && a.player === b.player : b.kind === 'monster' && a.uid === b.uid;

/** 「選んだ1体」が候補に合っているか（使う・起動・魂力で共通）。合っていれば null */
export function validateChosen(enemies: TargetRef[], allies: string[], chosen: Chosen | undefined): string | null {
  // 「攻撃してきたモンスター」（MTG 要素 △ バッチA）は行動では選べない
  if (chosen?.trigger !== undefined) return 'その対象は選べません';
  if (enemies.length > 0) {
    if (!chosen?.enemy) return '対象を選んでください';
    if (!enemies.some((t) => sameRef(t, chosen.enemy!))) return 'その対象は選べません';
  } else if (chosen?.enemy) {
    return '対象は選べません';
  }
  if (allies.length > 0) {
    if (!chosen?.ally) return '自分のモンスターを選んでください';
    if (!allies.includes(chosen.ally)) return 'そのモンスターは選べません';
  } else if (chosen?.ally) {
    return '自分のモンスターは選べません';
  }
  return null;
}

/** カードを使うときの追加の指定（MTG 要素 ○ バッチC1） */
export interface PlayOpts {
  /** 'waiting' は待機ゾーンから（MTG 要素 △ バッチC） */
  from?: 'discard' | 'waiting';
  discardUid?: string;
  exileUids?: string[];
  kick?: boolean;
  /** モード選択のカードで選ぶモード（MTG 要素 ○ バッチC2。0 は双呪） */
  mode?: number;
  // ---- MTG 要素 △ バッチB
  extra?: number;
  modes?: number[];
  alt?: AltPlay;
  sacrificeUid?: string;
  tapUids?: string[];
  pitchUid?: string;
  lifePay?: number;
}

/** PlayOpts からコストの計算に渡す情報 */
export function costCtxOf(opts: PlayOpts, chosen?: Chosen): CostCtx {
  return {
    ...(chosen ? { chosen } : {}),
    from: opts.from === 'discard' ? 'discard' : opts.from === 'waiting' ? 'waiting' : 'hand',
    kick: opts.kick === true,
    ...(opts.mode !== undefined ? { mode: opts.mode } : {}),
    ...(opts.modes !== undefined ? { modes: opts.modes } : {}),
    ...(opts.extra !== undefined ? { extra: opts.extra } : {}),
    ...(opts.alt !== undefined ? { alt: opts.alt } : {}),
    ...(opts.sacrificeUid !== undefined ? { sacrificeUid: opts.sacrificeUid } : {}),
    ...(opts.tapUids !== undefined ? { tapUids: opts.tapUids } : {}),
    ...(opts.from === undefined && opts.exileUids !== undefined ? { exileUids: opts.exileUids } : {}),
    ...(opts.pitchUid !== undefined ? { pitchUid: opts.pitchUid } : {}),
    ...(opts.lifePay !== undefined ? { lifePay: opts.lifePay } : {}),
  };
}

/** 捨て札から使うときの追加の支払いが正しいか（再活・回顧の捨てる手札・脱出の除外する捨て札）。正しければ null */
export function validateFromDiscardPayment(g: GameState, p: PlayerId, card: CardInst, def: CardDef, opts: PlayOpts): string | null {
  const ps = g.players[p];
  const fd = fromDiscardAbility(def);
  if (!fd) return 'このカードは捨て札から使えません';
  // 回顧は同じカード1ターン1回、大混乱はこのターン捨てられたカードだけ（MTG 要素 △ バッチB）
  if (fd.rule.oncePerTurn && card.retraceTurn === g.turnIndex) return `${fd.name}：このカードはこのターンもう使いました（1ターン1回）`;
  if (fd.rule.onlyIfDiscardedThisTurn && card.discardedTurn !== g.turnIndex) return `${fd.name}：このターンに手札から捨てられたカードだけ使えます`;
  if (fd.rule.needsHandDiscard) {
    if (ps.hand.length === 0) return `${fd.name}：捨てる手札がありません`;
    if (!opts.discardUid) return `${fd.name}：捨てる手札を選んでください`;
    if (!ps.hand.some((c) => c.uid === opts.discardUid)) return `${fd.name}：その手札はありません`;
  } else if (opts.discardUid !== undefined) {
    return '手札を捨てる必要はありません';
  }
  const n = fd.rule.exileOthers?.(fd.a) ?? 0;
  if (n > 0) {
    const ids = opts.exileUids ?? [];
    const others = ps.discard.filter((c) => c.uid !== card.uid).length;
    if (others < n) return `${fd.name}：除外する捨て札が${n}枚ありません（他の捨て札${others}枚）`;
    if (ids.length !== n) return `${fd.name}：除外する捨て札を${n}枚選んでください`;
    if (new Set(ids).size !== ids.length) return `${fd.name}：同じカードを2回選べません`;
    if (ids.includes(card.uid)) return `${fd.name}：使うカード自身は除外できません`;
    if (ids.some((uid) => !ps.discard.some((c) => c.uid === uid))) return `${fd.name}：捨て札に無いカードが含まれています`;
  } else if (opts.exileUids !== undefined && opts.exileUids.length > 0) {
    return '捨て札を除外する必要はありません';
  }
  return null;
}

/**
 * 追加の支払い・代わりの使い方・差し出す・払い方（MTG 要素 △ バッチB）が正しいか。正しければ null。
 * 探査の exileUids は手札から使うときだけ（捨て札から使うときは脱出の除外）
 */
export function validatePayment(g: GameState, p: PlayerId, card: CardInst, def: CardDef, opts: PlayOpts): string | null {
  const ps = g.players[p];
  const fromDiscard = opts.from === 'discard';
  const ownMonster = (uid: string) => ps.board.find((m) => m.uid === uid);
  const isInt = (x: unknown, lo: number, hi: number) => typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi;
  // 追加の支払い（切除・奮励・分隊）
  if (opts.extra !== undefined) {
    const e = extraPayOf(def);
    if (!e) return opts.extra === 0 ? null : 'このカードには追加の支払いがありません';
    if (!isInt(opts.extra, 0, e.max)) return `${e.name}は0〜${e.max}回です`;
    if (e.kind === 'squad' && fromDiscard && opts.extra > 0) return `${e.name}は手札から使うときだけ払えます`;
  }
  // 代わりの使い方（試作・想起・超過・解鎖）
  if (opts.alt !== undefined && !altsOf(def).some((x) => x.kind === opts.alt)) return 'このカードにはその使い方がありません';
  // 差し出す（現出・犠牲・協約）
  if (opts.sacrificeUid !== undefined) {
    const sac = sacrificeOf(def);
    if (!sac) return 'このカードは何も差し出せません';
    if (sac.kind === 'emerge' && fromDiscard) return `${sac.name}は手札から使うときだけです`;
    if (sac.kind === 'bargain') {
      const m = ownMonster(opts.sacrificeUid);
      const pw = ps.powers.find((x) => x.uid === opts.sacrificeUid);
      if (!(m && m.card.token) && !pw) return `${sac.name}：差し出せるのは自分のトークンかパワーです`;
    } else {
      const m = ownMonster(opts.sacrificeUid);
      if (!m) return `${sac.name}：生け贄にするのは自分の場のモンスターです`;
      if (sac.kind === 'casualty' && effectiveAttack(g, m) < sac.minAttack) return `${sac.name}：攻撃力${sac.minAttack}以上のモンスターだけ生け贄にできます`;
    }
  }
  // 休ませる（召集・調和）
  if (opts.tapUids !== undefined) {
    const taps = opts.tapUids;
    const tapOne = fromDiscard ? fromDiscardAbility(def)?.rule.tapOne : undefined;
    const max = tapOne ? 1 : fromDiscard ? 0 : convokeMax(def);
    if (taps.length > 0 && max === 0) return 'このカードはモンスターを休ませて使えません';
    if (taps.length > max) return `休ませられるのは${max}体までです`;
    if (new Set(taps).size !== taps.length) return '同じモンスターを2回選べません';
    for (const uid of taps) {
      const m = ownMonster(uid);
      if (!m) return '休ませるのは自分の場のモンスターです';
      if (!canTap(g, m)) return `${cardName(g, m.card.cardId)}はもう攻撃できないので休ませられません`;
      if (uid === opts.sacrificeUid) return '生け贄にするモンスターは休ませられません';
    }
  }
  // 探査（手札から使うとき）
  if (!fromDiscard && opts.exileUids !== undefined && opts.exileUids.length > 0) {
    const max = delveMax(def);
    if (max === 0) return '手札から使うときは、捨て札を除外できません';
    const ids = opts.exileUids;
    if (ids.length > max) return `探査で除外できるのは${max}枚までです`;
    if (new Set(ids).size !== ids.length) return '同じカードを2回選べません';
    if (ids.some((uid) => !ps.discard.some((c) => c.uid === uid))) return '捨て札に無いカードが含まれています';
  }
  // 代替コスト
  if (opts.pitchUid !== undefined) {
    if (!hasPitch(def)) return 'このカードには代替コストがありません';
    if (fromDiscard) return '代替コストは手札から使うときだけです';
    if ((ps.turn.pitched ?? 0) >= BALANCE.battle.maxPitchPerTurn) return `代替コストは1ターン${BALANCE.battle.maxPitchPerTurn}回までです`;
    const other = ps.hand.find((c) => c.uid === opts.pitchUid);
    if (!other) return '除外する手札がありません';
    if (!pitchMatches(g, card, other)) return '代替コストで除外できるのは、同じ種類の別の手札だけです';
  }
  // 血の支払い
  if (opts.lifePay !== undefined) {
    const max = lifePayMax(def);
    if (!isInt(opts.lifePay, 0, max)) return max === 0 ? 'このカードには血の支払いがありません' : `HPで払えるのは${max}つまでです`;
  }
  return null;
}

/** 使うカードを探す（手札・捨て札・待機ゾーン。MTG 要素 ○ バッチC1・△ バッチC） */
export function cardFrom(g: GameState, p: PlayerId, cardUid: string, from: PlayOpts['from']): CardInst | undefined {
  const ps = g.players[p];
  if (from === 'waiting') return waitingEntry(g, p, cardUid)?.card;
  return (from === 'discard' ? ps.discard : ps.hand).find((c) => c.uid === cardUid);
}

/** 待機ゾーンのカードを今使えない理由（MTG 要素 △ バッチC：置いたターンより後の自分のターンだけ。待機のカードは自動で使われる） */
export function waitingPlayBlock(g: GameState, p: PlayerId, cardUid: string): string | null {
  const w = waitingEntry(g, p, cardUid);
  if (!w) return 'そのカードは待機ゾーンにありません';
  if (w.kind === 'suspend') return '待機のカードは、残りが0になったら自動で使われます';
  if (w.since >= g.turnIndex) return '待機ゾーンに置いたターンには使えません（次の自分のターンから）';
  return null;
}

/** 裏向き（変装）で出すときに一緒に使えない指定（MTG 要素 △ バッチC） */
function faceDownExtras(opts: PlayOpts): boolean {
  return (
    opts.kick === true ||
    opts.extra !== undefined ||
    opts.mode !== undefined ||
    opts.modes !== undefined ||
    opts.sacrificeUid !== undefined ||
    (opts.tapUids?.length ?? 0) > 0 ||
    opts.pitchUid !== undefined ||
    opts.lifePay !== undefined ||
    (opts.exileUids?.length ?? 0) > 0
  );
}

export function validatePlay(g: GameState, p: PlayerId, cardUid: string, chosen: Chosen | undefined, opts: PlayOpts = {}): string | null {
  const ps = g.players[p];
  const fromDiscard = opts.from === 'discard';
  const fromWaiting = opts.from === 'waiting';
  const card = cardFrom(g, p, cardUid, opts.from);
  if (!card) return fromDiscard ? 'そのカードは捨て札にありません' : fromWaiting ? 'そのカードは待機ゾーンにありません' : 'そのカードは手札にありません';
  if (card.cardId === NOISE_CARD_ID) return 'ノイズは使えません（コストを払って除外はできます）';
  const def = g.cards[card.cardId];
  if (!def) return 'カードの定義が見つかりません';
  const ice = fromWaiting ? null : icedBlock(g, card);
  if (ice) return ice;
  if (fromWaiting) {
    const block = waitingPlayBlock(g, p, cardUid);
    if (block) return block;
    // 待機ゾーンから使うときは、追加の払い方・代わりの使い方は使えない（モード・キッカー・追加払い・差し出す・血の支払いは使える）
    if (opts.alt !== undefined || opts.discardUid !== undefined || (opts.exileUids?.length ?? 0) > 0 || opts.pitchUid !== undefined || (opts.tapUids?.length ?? 0) > 0) {
      return '待機ゾーンから使うときは、その払い方・使い方はできません';
    }
  } else if (fromDiscard) {
    const reason = validateFromDiscardPayment(g, p, card, def, opts);
    if (reason) return reason;
  } else if (opts.discardUid !== undefined || (opts.exileUids !== undefined && opts.exileUids.length > 0 && delveMax(def) === 0)) {
    return '手札から使うときは、追加の支払いはありません';
  }
  // 代わりの使い方（MTG 要素 △ バッチC）：ワープ・出来事・裏向きは手札から。裏向きはほかの指定と一緒に使えない
  if ((opts.alt === 'warp' || opts.alt === 'adventure' || opts.alt === 'faceDown') && opts.from !== undefined) return 'その使い方は手札から使うときだけです';
  if (opts.alt === 'faceDown' && faceDownExtras(opts)) return '裏向きで出すときは、ほかの払い方・モードは選べません';
  if (opts.kick && kickerCost(def) === 0) return 'このカードにはキッカーがありません';
  const payError = validatePayment(g, p, card, def, opts);
  if (payError) return payError;
  const timing = playTiming(def, fromDiscard ? 'discard' : 'hand', opts.alt);
  // 裏向きで出すときは召喚時の効果が出ないので、モード・対象は選ばない
  const modeError = opts.alt === 'faceDown' ? null : validateModeChoice(def, timing, opts.mode, opts.modes);
  if (modeError) return modeError;
  const breakdown = costBreakdown(g, p, card, costCtxOf(opts, chosen));
  if (breakdown.total > ps.energy) {
    const notes = costNotes(breakdown);
    return `エナジーが足りません（必要${breakdown.total}${notes ? `：${notes}` : ''}、残り${ps.energy}）`;
  }
  // 血の支払い：払ったあと HP が1以上残ること
  if (breakdown.hp && ps.hp - breakdown.hp < 1) return `HPが足りません（血の支払いでHP${breakdown.hp}、残りHP${ps.hp}）`;
  const reason = opts.alt === 'faceDown' || opts.alt === 'adventure' ? null : drawbackBlock(g, p, card);
  if (reason) return reason;
  // 超過（MTG 要素 △ バッチB）は「選んだ1体」を選ばない。裏向き（△ バッチC）は召喚時の効果が出ないので選ばない
  const rulesDef = opts.alt === 'overload' ? overloadedDef(def, timing) : def;
  const rules = opts.alt === 'faceDown' ? { enemy: [], ally: false } : chosenRules(rulesDef, timing, opts.modes ?? opts.mode);
  return validateChosen(enemyCandidates(g, p, rules.enemy), rules.ally ? allyCandidates(g, p, card, timing) : [], chosen);
}

/** 氷結（MTG 要素 △ バッチA）で、このターンは使えない手札か。使えないなら理由 */
export const WARN_ICED = '氷結：このターンは使えない';
export function icedBlock(g: GameState, card: CardInst): string | null {
  return card.iced !== undefined && card.iced === g.turnIndex ? WARN_ICED : null;
}

/** 使ったカードの種類をこのターンの記録に足す（条件「このターン3種類以上のカードを使った」。パワーアタックはパワー。MTG 要素 △ バッチA） */
export function recordPlayedType(g: GameState, p: PlayerId, def: CardDef, as?: 'skill'): void {
  const t = as ?? classifyCard(def);
  const kind = t === 'powerAttack' ? 'power' : t;
  const turn = g.players[p].turn;
  const list = turn.typesPlayed ?? [];
  if (!list.includes(kind)) turn.typesPlayed = [...list, kind];
}

/** デメリットのせいで使えない理由（生け贄にするモンスターがいない など）。使えるなら null */
export function drawbackBlock(g: GameState, p: PlayerId, card: CardInst): string | null {
  const def = g.cards[card.cardId];
  for (const d of def?.drawbacks ?? []) {
    const reason = getDrawback(d.id)?.battle.canPlay?.(g, p, card) ?? null;
    if (reason) return reason;
  }
  // MTG 要素 △ バッチC：効果ごとの使える条件（HP交換）と、紋章の上限
  for (const e of def?.effects ?? []) {
    const reason = getEffect(e.id)?.battle.canPlay?.(g, p) ?? null;
    if (reason) return reason;
  }
  if (def && isEmblemCard(def) && emblemFull(g, p)) return `紋章は1人${BALANCE.battle.maxEmblems}つまでです`;
  return null;
}

/** カードのデメリットの寿命（あれば最短のもの） */
export function lifespanOf(def: CardDef | undefined): number | undefined {
  let life: number | undefined;
  for (const d of def?.drawbacks ?? []) {
    const n = getDrawback(d.id)?.battle.lifespan?.(d);
    if (n !== undefined) life = life === undefined ? n : Math.min(life, n);
  }
  return life;
}

export function playCard(g: GameState, p: PlayerId, cardUid: string, chosen: Chosen, opts: PlayOpts = {}): void {
  const ps = g.players[p];
  const fromDiscard = opts.from === 'discard';
  const fromWaiting = opts.from === 'waiting';
  const card = cardFrom(g, p, cardUid, opts.from)!;
  const def = g.cards[card.cardId]!;
  const breakdown = costBreakdown(g, p, card, costCtxOf(opts, chosen));
  const cost = breakdown.total;
  const before = ps.energy;
  ps.energy -= cost;
  const notes = costNotes(breakdown);
  // 計画したカード（MTG 要素 △ バッチC）は無料なので、凍結・軽減は次のカードに残す
  const waiting = fromWaiting ? waitingEntry(g, p, cardUid) : undefined;
  const planned = waiting !== undefined && waitingRule(def, waiting.kind)?.free === true;
  if (!planned) {
    ps.turn.freezeTax = false;
    ps.discount = 0;
  }
  ps.turn.cardsPlayed += 1;
  recordPlayedType(g, p, def, opts.alt === 'adventure' ? 'skill' : undefined);
  if (fromWaiting) ps.waiting = (ps.waiting ?? []).filter((w) => w.card.uid !== cardUid);
  else {
    const zone = fromDiscard ? ps.discard : ps.hand;
    zone.splice(
      zone.findIndex((c) => c.uid === cardUid),
      1,
    );
  }
  const fd = fromDiscard ? fromDiscardAbility(def) : undefined;
  const alt = opts.alt ? altsOf(def).find((x) => x.kind === opts.alt) : undefined;
  const modeNote =
    opts.modes !== undefined
      ? `モード${opts.modes.map((m) => modeName(m)).join('・')}で`
      : opts.mode === undefined
        ? ''
        : opts.mode === 0
          ? '双呪ですべてのモードで'
          : `モード${modeName(opts.mode)}で`;
  const energyNote = `（コスト${cost}${notes ? `：${notes}` : ''}、エナジー ${before}→${ps.energy}）`;
  const kickerId = opts.kick === true && kickerCost(def) > 0 ? def.abilities?.find((a) => getAbility(a.id)?.battle.kickerCost !== undefined)?.id : undefined;
  if (opts.alt === 'faceDown') {
    // 裏向き（変装。MTG 要素 △ バッチC）：相手にはカードの名前を見せない
    // 実コストの内訳（変装で±N）は本当の印刷コストを明かすので書かない。uid も本当のカードのものなので付けない（統合 #101）
    log(g, 0, `${ps.name}はモンスターを裏向きで出した（コスト${cost}、エナジー ${before}→${ps.energy}）`, 'action', undefined, { kind: 'play', player: p, cardId: FACE_DOWN_WARD_CARD_ID });
    log(g, 0, `裏向きで出したカード：「${def.name}」`, 'info', p);
  } else {
    log(g, 0, `${ps.name}は${fd ? `捨て札から${fd.name}で` : fromWaiting ? '待機ゾーンから' : ''}「${def.name}」を${alt ? `${alt.name}で` : ''}${modeNote}使った${energyNote}`, 'action', undefined, {
      kind: 'play',
      player: p,
      cardId: card.cardId,
      uid: card.uid,
      ...(fromDiscard ? { from: 'discard' as const } : fromWaiting ? { from: 'waiting' as const } : {}),
      ...(opts.mode !== undefined ? { mode: opts.mode } : {}),
      // 演出（決定事項 #126）：使い方の元になった能力（捨て札から・別の出し方・キッカー）
      ...(fd ? { abilityId: fd.a.id } : alt ? { abilityId: alt.a.id } : kickerId ? { abilityId: kickerId } : {}),
    });
  }
  if (fd) payFromDiscard(g, p, card, fd, opts);
  const paid = payExtras(g, p, card, def, opts, breakdown);
  resolvePlay(g, p, card, chosen, {
    from: fromDiscard ? 'discard' : fromWaiting ? 'waiting' : 'hand',
    depth: 1,
    ...(planned ? { freeX: true } : {}),
    kick: opts.kick === true && kickerCost(def) > 0,
    ...(opts.modes !== undefined ? { mode: opts.modes } : opts.mode !== undefined ? { mode: opts.mode } : {}),
    ...(opts.alt !== undefined ? { alt: opts.alt } : {}),
    ...(opts.extra ? { extra: opts.extra } : {}),
    ...paid,
  });
}

/**
 * 追加の支払い（MTG 要素 △ バッチB）を払う：血の支払いの HP → 休ませる（召集・調和）→ 探査の除外 → 代替コストの除外 → 差し出す（現出・犠牲・協約）。
 * 差し出したモンスターの「破壊されたとき」などは、このカードの効果より先に積む。犠牲・協約をしたかを返す
 */
function payExtras(g: GameState, p: PlayerId, card: CardInst, def: CardDef, opts: PlayOpts, b: CostBreakdown): { casualty?: boolean; bargained?: boolean } {
  const ps = g.players[p];
  const out: { casualty?: boolean; bargained?: boolean } = {};
  if (b.hp) {
    const before = ps.hp;
    ps.hp -= b.hp;
    log(g, 1, `血の支払い：${ps.name}はHP${b.hp}を払った（HP ${before}→${ps.hp}）`, 'effect', undefined, { kind: 'status', player: p, status: 'lifePay', amount: b.hp });
  }
  for (const uid of opts.tapUids ?? []) {
    const m = ps.board.find((x) => x.uid === uid);
    if (!m) continue;
    m.attacksUsed = Math.max(m.attacksUsed, attacksPerTurn(g, m));
    log(g, 1, `${cardName(g, m.card.cardId)}を休ませた（このターンは攻撃できない）`, 'info', undefined, { kind: 'status', target: { kind: 'monster', uid: m.uid }, status: 'tapped' });
  }
  if (opts.from !== 'discard' && opts.exileUids && opts.exileUids.length > 0) {
    const set = new Set(opts.exileUids);
    const moved = ps.discard.filter((c) => set.has(c.uid));
    ps.discard = ps.discard.filter((c) => !set.has(c.uid));
    ps.exile.push(...moved);
    log(g, 1, `探査：${ps.name}は捨て札の${moved.length}枚を除外した：${moved.map((c) => cardName(g, c.cardId)).join('、')}`);
  }
  if (opts.pitchUid !== undefined) {
    const i = ps.hand.findIndex((c) => c.uid === opts.pitchUid);
    if (i >= 0) {
      const [x] = ps.hand.splice(i, 1);
      ps.exile.push(x!);
      ps.turn.pitched = (ps.turn.pitched ?? 0) + 1;
      log(g, 1, `代替コスト：${ps.name}は手札の「${cardName(g, x!.cardId)}」を除外した`, 'info', undefined, { kind: 'status', player: p, cardId: x!.cardId, status: 'pitch' });
    }
  }
  // 回顧（同じカードは1ターン1回）・大混乱（捨てられた記録は消える）
  if (opts.from === 'discard') {
    const fd = fromDiscardAbility(def);
    if (fd?.rule.oncePerTurn) card.retraceTurn = g.turnIndex;
    if (fd?.rule.onlyIfDiscardedThisTurn) delete card.discardedTurn;
  }
  const sac = opts.sacrificeUid !== undefined ? sacrificeOf(def) : undefined;
  if (sac && opts.sacrificeUid !== undefined) {
    const m = ps.board.find((x) => x.uid === opts.sacrificeUid);
    if (m) {
      log(g, 1, `${sac.name}：${cardName(g, m.card.cardId)}を生け贄にした`, 'effect');
      destroyMonster(g, m, 2, true);
    } else {
      const pw = ps.powers.find((x) => x.uid === opts.sacrificeUid);
      if (pw) {
        ps.powers = ps.powers.filter((x) => x !== pw);
        log(g, 1, `${sac.name}：パワー『${pw.name}』を差し出した`, 'effect', undefined, { kind: 'destroy', player: p, cardId: pw.cardId, uid: pw.uid });
      }
    }
    if (sac.kind === 'casualty') out.casualty = true;
    if (sac.kind === 'bargain') out.bargained = true;
  }
  return out;
}

/** 捨て札から使うときの追加の支払い（再活：手札を1枚捨てる／脱出：他の捨て札を除外）と、使ったあと除外する印 */
function payFromDiscard(g: GameState, p: PlayerId, card: CardInst, fd: NonNullable<ReturnType<typeof fromDiscardAbility>>, opts: PlayOpts): void {
  const ps = g.players[p];
  if (fd.rule.needsHandDiscard && opts.discardUid) {
    const i = ps.hand.findIndex((c) => c.uid === opts.discardUid);
    if (i >= 0) {
      const [d] = ps.hand.splice(i, 1);
      discardCard(g, d!);
      log(g, 1, `${fd.name}：${ps.name}は手札の「${cardName(g, d!.cardId)}」を捨てた`, 'info', undefined, { kind: 'discard', player: p, amount: 1 });
      afterDiscarded(g, p, d!, 1);
    }
  }
  const exile = new Set(opts.exileUids ?? []);
  if (exile.size > 0) {
    const moved = ps.discard.filter((c) => exile.has(c.uid));
    ps.discard = ps.discard.filter((c) => !exile.has(c.uid));
    ps.exile.push(...moved);
    log(g, 1, `${fd.name}：${ps.name}は捨て札の${moved.length}枚を除外した：${moved.map((c) => cardName(g, c.cardId)).join('、')}`);
  }
  if (fd.rule.exileAfter) card.exileOnLeave = true;
}

/** 封殺（MTG 要素 ○ バッチB）がこのカードに当たるか。パワーアタックはアタックにもパワーにも当たる。as は出来事（スキル扱い） */
export function quashMatches(g: GameState, p: PlayerId, def: CardDef, as?: 'skill'): boolean {
  const q = g.players[p].quash;
  if (!q || g.turnIndex > q.until) return false;
  if (q.kind === 'any') return true;
  const type = as ?? classifyCard(def);
  if (type === 'powerAttack') return q.kind === 'attack' || q.kind === 'power';
  return type === q.kind;
}

/**
 * 使ったカードの処理（手札から・無料で使う共通）：封殺 → X → 英雄的 → 召喚／効果 → 使い終わり。
 * コストの支払い・使った枚数・使ったログは呼び出し側で済ませておく
 */
function resolvePlay(
  g: GameState,
  p: PlayerId,
  card: CardInst,
  chosen: Chosen,
  opts: {
    from: PlayFrom;
    depth: number;
    freeDepth?: number;
    kick?: boolean;
    mode?: ModeSel;
    // MTG 要素 △ バッチB
    alt?: AltPlay;
    extra?: number;
    casualty?: boolean;
    bargained?: boolean;
    /** 計画したカード（MTG 要素 △ バッチC）：X は0 */
    freeX?: boolean;
    /** 待機（MTG 要素 △ バッチC）で無料で使った（モンスターは速攻） */
    suspend?: boolean;
  },
): void {
  const ps = g.players[p];
  const original = g.cards[card.cardId]!;
  const depth = opts.depth;
  const timing = playTiming(original, opts.from, opts.alt);
  // 昼と夜（MTG 要素 △ バッチD）：まだ始まっていなければ「昼なら／夜なら」のカードを使ったときに昼で始まる（裏向きは正体を見せないので始めない）
  if (opts.alt !== 'faceDown') startDayNightFor(g, original, depth);
  // 超過（MTG 要素 △ バッチB）：「選んだ1体」の効果を全体にした写しで解決する
  const def = opts.alt === 'overload' ? overloadedDef(original, timing) : original;
  const villain = isVillain(def) && cardModes(def, timing).length > 0;
  const mode = villain ? undefined : resolveMode(def, timing, opts.mode);
  // 封殺：コストは払い、使った枚数にも数えるが、カードは捨て札へ行き、何も起きない
  if (quashMatches(g, p, def, opts.alt === 'adventure' ? 'skill' : undefined)) {
    delete ps.quash;
    log(g, depth, `封殺：「${def.name}」は無効になった`, 'effect', undefined, { kind: 'status', player: p, cardId: card.cardId, uid: card.uid, status: 'quash' });
    discardCard(g, card);
    return;
  }
  const protectKey = newUid(g, 'pk');
  const rec = playRecord(g, protectKey);
  if (opts.freeDepth !== undefined) rec.freeDepth = opts.freeDepth;
  // モード選択（MTG 要素 ○ バッチC2）：選んだモードを記録（反復でも同じモード。放題は最初の1つ）
  if (mode !== undefined) rec.mode = firstMode(mode);
  if (mode !== undefined && typeof mode !== 'number') rec.modes = [...mode];
  // キッカー（MTG 要素 ○ バッチC1）：払ったことを記録（条件「キッカーを払っていれば」）
  if (opts.kick) {
    rec.kicked = true;
    log(g, depth, `キッカー：「${def.name}」のキッカーを払った`, 'info');
  }
  // MTG 要素 △ バッチB：切除（条件を無視）・奮励（相手モンスターを追加）・協約
  const extra = extraPayOf(def);
  if (extra && opts.extra && opts.extra > 0) {
    if (extra.kind === 'cleave') {
      rec.cleaved = true;
      log(g, depth, `${extra.name}：「${def.name}」の効果の条件を無視する`, 'info');
    }
    if (extra.kind === 'strive') rec.strive = Math.min(opts.extra, extra.max);
  }
  if (opts.bargained) rec.bargained = true;
  // X（全力）：使用時・召喚時の効果に X があれば、残りのエナジーをすべて使う（このカードの X の効果はすべて同じ X）。無料で使ったときは0
  const freeX = opts.from === 'free' || opts.freeX === true;
  if (opts.alt !== 'faceDown' && usesX(def, timing, mode)) {
    const x = freeX ? 0 : ps.energy;
    if (!freeX) ps.energy = 0;
    rec.x = x;
    log(g, depth, `X＝${x}${freeX ? '（無料で使ったので0）' : '（エナジーをすべて使った）'}`, 'info', undefined, { kind: 'energy', player: p, amount: ps.energy });
  }
  // 自分のカードの対象になるたび（英雄的。MTG 要素 ○ バッチA）：選んだ自分のモンスターの効果を、カードの効果より先に積む
  const targetedAlly = chosen.ally && chosenRules(def, timing, mode).ally ? ps.board.find((m) => m.uid === chosen.ally) : undefined;
  if (targetedAlly) {
    enqueueMonsters(g, p, 'targeted', depth, { onlyUid: targetedAlly.uid });
    // 各ターン初めて自分のカードの対象になったとき（雄姿。MTG 要素 △ バッチA）：1体につき1ターン1回
    if (targetedAlly.counters.valiantTurn !== g.turnIndex) {
      targetedAlly.counters.valiantTurn = g.turnIndex;
      enqueueMonsters(g, p, 'valiant', depth, { onlyUid: targetedAlly.uid });
    }
  }
  if (opts.alt === 'faceDown') {
    // 変装（MTG 要素 △ バッチC）：裏向きで出す（召喚時の効果は出ない）
    placeFaceDown(g, p, card, 'disguise', revealCostOf(def), depth);
  } else if (opts.alt === 'adventure') {
    // 出来事（MTG 要素 △ バッチC）：「出来事」の効果を呪文（スキル）として使う。使い終えたら待機ゾーンへ
    const src = { kind: 'card' as const, uid: card.uid, cardId: card.cardId, name: def.name, controller: p };
    enqueueCardTiming(g, src, def, 'adventure', chosen, depth, { protectKey });
  } else if (def.stats) {
    // 試作・解鎖・一時蘇生・最悪の二択（MTG 要素 △ バッチB）
    const fd = opts.from === 'discard' ? fromDiscardAbility(def) : undefined;
    const unleash = opts.alt === 'unleash' ? (altsOf(def).find((x) => x.kind === 'unleash')?.a.value ?? 0) : 0;
    const m = summon(g, p, card, chosen, depth, protectKey, timing, mode, {
      ...(opts.alt === 'prototype' ? { prototype: true } : {}),
      ...(unleash > 0 ? { unleash } : {}),
      ...(fd?.rule.unearth ? { unearth: true } : {}),
      ...(villain ? { villain: true } : {}),
      ...(opts.alt === 'warp' ? { warp: true } : {}),
    });
    // 待機（MTG 要素 △ バッチC）で出たモンスターは速攻を持つ（兆候）
    if (m && opts.suspend) m.counters.hasteTurn = g.turnIndex;
    // 分隊：払った回数だけコピーのトークン（召喚時の効果も出る。場のトークンの上限まで）
    if (m && extra?.kind === 'squad' && opts.extra && opts.extra > 0 && opts.from !== 'free') {
      log(g, depth, `${extra.name}：「${def.name}」のコピーを${opts.extra}体出す`, 'info');
      for (let i = 0; i < Math.min(opts.extra, extra.max); i++) {
        if (!createToken(g, p, card.cardId, { attack: def.stats.attack, hp: def.stats.hp, defense: def.stats.defense, copy: true }, depth + 1)) break;
      }
    }
    // 想起：召喚時の効果のあと破壊される
    if (m && opts.alt === 'evoke') enqueue(g, { t: 'evokeEnd', uid: m.uid, depth: depth + 1 });
  } else {
    const type = classifyCard(def);
    const attackCard = type === 'attack' || type === 'powerAttack';
    // 筋力・気合（＋恩恵）は使った時点の値を記録し、このカードの最初の1発にだけ乗せる（このカード自身が付けた分は乗らない：決定事項 #70 R3）
    if (attackCard) rec.bonus = ps.status.strength + ps.status.focus + useBoon(g, p, depth);
    const src = { kind: 'card' as const, uid: card.uid, cardId: card.cardId, name: def.name, controller: p };
    const fire = {
      attackCard,
      protectKey,
      ...(card.grow ? { grow: card.grow } : {}),
      ...(mode !== undefined ? { mode } : {}),
      ...(villain ? { villain: true } : {}),
    };
    enqueueCardTiming(g, src, def, timing, chosen, depth, fire);
    // 犠牲（MTG 要素 △ バッチB）：使用時の効果をもう一度（同じ対象・X・モード。続唱などコピーしない効果と、デメリットは除く）
    if (opts.casualty) {
      log(g, depth, `犠牲：「${def.name}」の効果がもう一度出る`, 'info');
      const copy: CardDef = { ...def, effects: def.effects.filter((e) => !getEffect(e.id)?.noCopy), drawbacks: [] };
      enqueueCardTiming(g, src, copy, timing, chosen, depth, fire);
    }
  }
  enqueue(g, {
    t: 'cardDone',
    player: p,
    card,
    protectKey,
    depth,
    ...(opts.from !== 'hand' ? { from: opts.from } : {}),
    ...(opts.alt === 'adventure' ? { adventure: true } : {}),
    ...(opts.alt === 'faceDown' ? { faceDown: true } : {}),
  });
}

/** 変装（MTG 要素 △ バッチC）：裏向きを表にするエナジー（変装が無ければ null） */
export function revealCostOf(def: CardDef | undefined): number | null {
  for (const a of def?.abilities ?? []) {
    const k = getAbility(a.id)?.battle.revealCost?.(a);
    if (k !== undefined) return k;
  }
  return null;
}

/** 恩恵（MTG 要素 ○ バッチB）：アタックを使うたび1回ぶん使い、上乗せの量を返す（回数が尽きたら消える） */
function useBoon(g: GameState, p: PlayerId, depth: number): number {
  const s = g.players[p].status;
  if (!s.boonUses || s.boonUses <= 0 || !s.boon) return 0;
  const n = s.boon;
  s.boonUses -= 1;
  log(g, depth, `恩恵：このアタックの最初の1発+${n}（残り${s.boonUses}回）`, 'info');
  if (s.boonUses <= 0) {
    s.boon = 0;
    s.boonUses = 0;
  }
  return n;
}

/**
 * 無料で使う（続唱。MTG 要素 ○ バッチB）：コストを払わずに使う。「選んだ1体」が要れば相手側 → 自分側の順に選ぶ（候補が1つなら選ばない）。
 * デメリットで使えない（生け贄にするモンスターがいない など）なら手札に加える
 */
export function executeFreePlay(g: GameState, step: Extract<Step, { t: 'freePlay' }>): void {
  const p = step.player;
  const card = step.card;
  const def = g.cards[card.cardId];
  if (!def) return;
  const chosen: Chosen = { ...(step.chosen ?? {}) };
  const pick = step.picks?.[0];
  let mode = step.mode;
  if (step.stage === 'mode' && pick) mode = Number(pick);
  if (step.stage === 'enemy' && pick) chosen.enemy = parseTargetKey(pick);
  if (step.stage === 'ally' && pick) chosen.ally = pick;
  const timing = playTiming(def, 'free');
  const ask = (stage: 'mode' | 'enemy' | 'ally', prompt: string, options: { id: string; label: string; cardId?: string }[]) => {
    g.pending = { player: p, prompt, options, min: 1, max: 1, step: { ...step, chosen, stage, picks: undefined, ...(mode !== undefined ? { mode } : {}) } as Step };
  };
  // モード選択のカード（MTG 要素 ○ バッチC2）：対象より先にモードを選ぶ（無料なので双呪は選べない。最悪の二択は相手が選ぶ）
  const modes = isVillain(def) ? [] : cardModes(def, timing);
  if (step.stage === undefined && modes.length > 0 && mode === undefined) {
    const texts = modeTextsOf(def, timing);
    return ask(
      'mode',
      `無料で使う「${def.name}」のモードを選んでください`,
      modes.map((m) => ({ id: String(m), label: `${MODE_LABEL[m]}：${texts.get(m) ?? ''}` })),
    );
  }
  const rules = chosenRules(def, timing, mode);
  if ((step.stage === undefined || step.stage === 'mode') && rules.enemy.length > 0) {
    const cands = enemyCandidates(g, p, rules.enemy);
    if (cands.length === 1) chosen.enemy = cands[0];
    else if (cands.length > 1) {
      return ask(
        'enemy',
        `無料で使う「${def.name}」の対象を選んでください`,
        cands.map((t) => ({ id: targetKey(t), label: t.kind === 'player' ? g.players[t.player].name : cardName(g, findMonster(g, t.uid)?.card.cardId ?? '') })),
      );
    }
  }
  if (step.stage !== 'ally' && rules.ally) {
    const cands = allyCandidates(g, p, card);
    if (cands.length === 1) chosen.ally = cands[0];
    else if (cands.length > 1) {
      return ask(
        'ally',
        `無料で使う「${def.name}」で選ぶ自分のモンスターを選んでください`,
        cands.map((uid) => ({ id: uid, label: uid === card.uid ? `${def.name}（このカード）` : cardName(g, findMonster(g, uid)?.card.cardId ?? '') })),
      );
    }
  }
  const ps = g.players[p];
  const reason = drawbackBlock(g, p, card);
  if (reason) {
    ps.hand.push(card);
    log(g, step.depth, `${reason}：「${def.name}」は使えないので手札に加えた`);
    return;
  }
  ps.turn.cardsPlayed += 1;
  recordPlayedType(g, p, def);
  log(g, step.depth, `${ps.name}は「${def.name}」を${mode !== undefined ? `モード${modeName(mode)}で` : ''}無料で使った`, 'action', undefined, {
    kind: 'play',
    player: p,
    cardId: card.cardId,
    uid: card.uid,
    ...(mode !== undefined ? { mode } : {}),
  });
  resolvePlay(g, p, card, chosen, { from: 'free', depth: step.depth, freeDepth: step.freeDepth, ...(mode !== undefined ? { mode } : {}), ...(step.suspend ? { suspend: true } : {}) });
}

/** 使用時・召喚時（timing）の効果に X（全力）があるか（mode：モード選択のカードで選ぶモード。省略はすべて） */
export function usesX(def: CardDef, timing: TimingId = def.stats ? 'summon' : 'play', mode?: ModeSel): boolean {
  return def.effects.some((e) => e.timing === timing && modeMatches(e, mode) && (e.mods ?? []).includes('xEnergy') && getEffect(e.id)?.scalable === true);
}

/** モードの効果の文（モードの番号 → 文）。無料で使うときのモードの選択肢に使う */
function modeTextsOf(def: CardDef, timing: TimingId): Map<number, string> {
  const out = new Map<number, string>();
  for (const e of def.effects) {
    if (e.timing !== timing || e.mode === undefined) continue;
    out.set(e.mode, (out.get(e.mode) ?? '') + describeEffect(e, def, { noTiming: true }));
  }
  return out;
}

/** このカードを使うと場にパワーが残るか（パワー用タイミングの効果かデメリットがある、パワー・パワー攻撃のカード） */
export function leavesPower(def: CardDef): boolean {
  if (def.stats) return false;
  const type = classifyCard(def);
  if (type !== 'power' && type !== 'powerAttack') return false;
  // 紋章（MTG 要素 △ バッチC）はパワーの上限に数えない。特殊勝利はパワーの効果が無くても場に残る
  if (isEmblemCard(def)) return false;
  return def.effects.some((e) => isPowerTiming(e.timing, 'spell')) || def.drawbacks.some((d) => isPowerTiming(d.timing, 'spell')) || keepsPower(def);
}

/** パワーの効果が無くても場に残るカード（特殊勝利。MTG 要素 △ バッチC） */
export function keepsPower(def: CardDef): boolean {
  return (def.abilities ?? []).some((a) => getAbility(a.id)?.battle.altWin !== undefined);
}

/**
 * パワーを場に置く。すでに上限（BALANCE.battle.maxPowers）なら、先にいちばん古いパワーを消す（決定事項 #80）。
 * 消えたパワーのカードは使ったときに除外済みなので、パワーが場から消えるだけ（誘発なし）
 */
export function addPower(g: GameState, p: PlayerId, power: PowerInst, depth: number): void {
  const ps = g.players[p];
  const max = BALANCE.battle.maxPowers;
  while (ps.powers.length >= max) {
    const old = ps.powers.shift()!;
    log(g, depth, `パワーは${max}つまで：『${old.name}』が消えた`, 'effect', undefined, {
      kind: 'destroy',
      player: p,
      cardId: old.cardId,
      uid: old.uid,
    });
  }
  ps.powers.push(power);
}

/**
 * カードの処理が終わったあと：捨て札・除外・パワーとして残す、そして「カードを使うたび」。
 * 呪文の行き先（MTG 要素 ○ バッチB）：装備したモンスター ＞ 反復（手札から使ったとき）＞ 再利用（1ターン1回）＞ 循環 ＞ 廃棄 ＞ 捨て札
 */
export function finishCard(g: GameState, p: PlayerId, card: CardInst, protectKey: string, depth: number, from: PlayFrom = 'hand', adventure = false, faceDown = false): void {
  const ps = g.players[p];
  const def = g.cards[card.cardId];
  const equipTo = g.protect[protectKey]?.equipTo;
  const playedMode = g.protect[protectKey]?.mode;
  delete g.protect[protectKey];
  // 成長：使うたび、このカード（個体）のダメージ・連撃の数値が増える（上限あり）
  if (def && !adventure) growCard(g, card, def, depth);
  let newPower: PowerInst | undefined;
  if (def && adventure) {
    // 出来事（MTG 要素 △ バッチC）：使い終えたら待機ゾーンへ（いっぱいなら捨て札）。後の自分のターンにモンスターとして出せる
    if (!putWaiting(g, p, card, 'adventure', depth)) {
      discardCard(g, card);
      log(g, depth, `待機ゾーンがいっぱいなので「${def.name}」は捨て札に置かれた`);
    }
  } else if (def && !def.stats) {
    const type = classifyCard(def);
    if (type === 'power' || type === 'powerAttack') {
      newPower = {
        uid: newUid(g, 'pw'),
        cardId: card.cardId,
        name: def.name,
        effects: def.effects.filter((e) => isPowerTiming(e.timing, 'spell')).map((effect) => ({ effect, removed: false })),
        drawbacks: def.drawbacks.filter((d) => isPowerTiming(d.timing, 'spell')),
      };
      if (newPower.effects.length > 0 || newPower.drawbacks.length > 0 || keepsPower(def)) {
        const life = lifespanOf(def);
        if (life !== undefined) newPower.life = life;
        // 休眠（MTG 要素 △ バッチA）：置いたターンを起点に1ターンおきに休む
        if (def.drawbacks.some((d) => getDrawback(d.id)?.battle.dormant)) newPower.dormantFrom = ps.turnsTaken;
        // 忠誠（MTG 要素 △ バッチC）：忠誠 L で出る
        const loyalty = loyaltyStart(def);
        if (loyalty !== undefined) newPower.loyalty = loyalty;
        if (isEmblemCard(def)) {
          // 紋章（MTG 要素 △ バッチC）：パワーの上限に数えない（もういっぱいなら何も残らない）
          if (emblemFull(g, p)) log(g, depth, `紋章は1人${BALANCE.battle.maxEmblems}つまでなので、「${def.name}」は何も残さずに除外された`);
          else {
            ps.emblems = [...(ps.emblems ?? []), newPower];
            log(g, depth, `「${def.name}」は紋章になった（パワーの上限に数えず、解除されない）`, 'effect', undefined, { kind: 'status', player: p, uid: newPower.uid, cardId: card.cardId, status: 'emblem' });
          }
          ps.exile.push(card);
        } else {
          addPower(g, p, newPower, depth);
          log(g, depth, `「${def.name}」はパワーとして場に残り、カードは除外された${life !== undefined ? `（寿命${life}）` : ''}${loyalty !== undefined ? `（忠誠${loyalty}）` : ''}`);
          // 蓄積（MTG 要素 ○ バッチC2）は0から。英雄譚は第1章が出る
          if ((def.abilities ?? []).some((a) => a.id === 'charge')) newPower.charge = 0;
          // 特殊勝利（MTG 要素 △ バッチC）の進みは0から
          if (keepsPower(def)) newPower.progress = 0;
          startSaga(g, p, newPower, depth);
          ps.exile.push(card);
        }
      } else {
        log(g, depth, `「${def.name}」は除外された`);
        ps.exile.push(card);
      }
    } else {
      spellDestination(g, p, card, def, depth, from, equipTo, playedMode);
    }
  }
  enqueuePowers(g, p, 'cardPlayed', depth, { excludeUid: newPower?.uid });
  // 蓄積（MTG 要素 ○ バッチC2）：カードを使うたび（いま置いたパワー自身は数えない）
  chargePowers(g, p, 'cardPlayed', depth, newPower?.uid);
  // 特殊勝利（MTG 要素 △ バッチC）：カードを使った数（いま置いたパワー自身は数えない）
  altWinOnCardPlayed(g, p, depth, newPower?.uid);
  if (g.phase === 'ended') return;
  // 自分がパワー／スキルを使うたび：パワー（いま置いたものを除く）→ 場のモンスター（左から）。出来事はスキル
  const type = def ? (adventure ? 'skill' : classifyCard(def)) : null;
  const timing = type === 'power' || type === 'powerAttack' ? 'powerPlayed' : type === 'skill' ? 'skillPlayed' : null;
  if (timing) {
    enqueuePowers(g, p, timing, depth, { excludeUid: newPower?.uid });
    enqueueMonsters(g, p, timing, depth);
  }
  // コスト3以上のカードを使うたび（演目。MTG 要素 ○ バッチA）：印刷コストで判定。いま置いたパワー・いま出たモンスター自身は除く
  // 裏向き（変装。MTG 要素 △ バッチC）は本当のコストを見せないので、変装のコストで判定する
  const printed = faceDown ? BALANCE.abilities.disguise.playCost : (def?.cost ?? 0);
  if (def && printed >= BALANCE.timingParams.bigCardCost) {
    enqueuePowers(g, p, 'bigCardPlayed', depth, { excludeUid: newPower?.uid });
    enqueueMonsters(g, p, 'bigCardPlayed', depth, def.stats ? { excludeUid: card.uid } : {});
  }
}

/** 忠誠（MTG 要素 △ バッチC）：場に出たときの忠誠（忠誠が無ければ undefined） */
export function loyaltyStart(def: CardDef | undefined): number | undefined {
  for (const a of def?.abilities ?? []) {
    const l = getAbility(a.id)?.battle.loyalty;
    if (l) return Math.min(l.start(a), BALANCE.battle.loyaltyMax);
  }
  return undefined;
}

/** カードの能力のうち、使ったあとの行き先を決めるもの */
function afterUseOf(def: CardDef): 'shuffle' | 'hand' | 'rebound' | undefined {
  for (const a of def.abilities ?? []) {
    const after = getAbility(a.id)?.battle.afterUse;
    if (after) return after;
  }
  return undefined;
}

/** 成長：カードの成長の能力の量だけ、この個体の grow を増やす（上限 abilities.grow.maxGrow） */
function growCard(g: GameState, card: CardInst, def: CardDef, depth: number): void {
  let add = 0;
  for (const a of def.abilities ?? []) add += getAbility(a.id)?.battle.grow?.(a) ?? 0;
  if (add <= 0) return;
  const before = card.grow ?? 0;
  const after = Math.min(before + add, BALANCE.abilities.grow.maxGrow);
  if (after === before) return;
  card.grow = after;
  log(g, depth, `成長：「${def.name}」のダメージ+${after}（この1枚だけ）`, 'info');
}

/** モンスター・パワー以外のカードの行き先 */
function spellDestination(
  g: GameState,
  p: PlayerId,
  card: CardInst,
  def: CardDef,
  depth: number,
  from: PlayFrom,
  equipTo: string | undefined,
  mode: number | undefined,
): void {
  const ps = g.players[p];
  // 装備：そのモンスターがまだ場にいれば、カードはモンスターに付く（捨て札から使ったものは、外れるとき除外）
  const host = equipTo ? findMonster(g, equipTo) : undefined;
  if (host) {
    (host.equipment ??= []).push(card);
    log(g, depth, `「${def.name}」を${g.players[host.controller].name}の「${cardName(g, host.card.cardId)}」に装備した`);
    return;
  }
  // フラッシュバック・再活（MTG 要素 ○ バッチC1）：捨て札から使ったら除外（再利用・循環より先）
  if (card.exileOnLeave) {
    g.players[card.owner].exile.push(card);
    log(g, depth, `「${def.name}」は捨て札から使ったので除外された`);
    return;
  }
  const after = afterUseOf(def);
  const keepable = card.copy !== 'temp';
  if (after === 'rebound' && from === 'hand') {
    const max = BALANCE.battle.maxDelayedPerPlayer;
    const list = ps.delayed ?? [];
    // モード選択のカード（MTG 要素 ○ バッチC2）は、選んだモードの効果だけもう一度
    const effects = effectsForMode(def.effects, 'play', resolveMode(def, 'play', mode));
    if (effects.length > 0 && list.length < max) {
      const entry: DelayedEffect = {
        id: newUid(g, 'dl'),
        src: { kind: 'card', uid: card.uid, cardId: card.cardId, name: def.name, controller: p },
        effect: effects[0]!,
        timing: 'play',
        chosen: {},
        label: `${def.name}：反復（使用時の効果がもう一度発動）`,
        rebound: { card, effects },
      };
      ps.delayed = [...list, entry];
      log(g, depth, `反復：「${def.name}」は除外され、次の自分のターン開始時に使用時の効果がもう一度発動する`, 'effect', undefined, {
        kind: 'status',
        player: p,
        status: 'delayed',
        amount: ps.delayed.length,
      });
      return;
    }
    if (list.length >= max) log(g, depth, `予約は${max}件までなので、反復できない`);
  }
  if (after === 'hand' && keepable && card.buybackTurn !== g.turnIndex) {
    card.buybackTurn = g.turnIndex;
    ps.hand.push(card);
    log(g, depth, `再利用：「${def.name}」は手札に戻った（同じカードは1ターン1回）`);
    return;
  }
  if (after === 'shuffle' && keepable) {
    const deck = g.players[card.owner].deck;
    deck.splice(randInt(g, deck.length + 1), 0, card);
    log(g, depth, `循環：「${def.name}」は山札に混ざった`);
    return;
  }
  if (def.drawbacks.some((d) => getDrawback(d.id)?.battle.exhaust)) {
    // 廃棄：捨て札ではなく除外へ
    g.players[card.owner].exile.push(card);
    log(g, depth, `廃棄：「${def.name}」は除外された`);
    return;
  }
  discardCard(g, card);
}

/** ノイズの除外（カードを使ったことには数えない：決定事項 #45） */
export function validateRemoveNoise(g: GameState, p: PlayerId, cardUid: string): string | null {
  const ps = g.players[p];
  const card = ps.hand.find((c) => c.uid === cardUid);
  if (!card || card.cardId !== NOISE_CARD_ID) return 'そのノイズは手札にありません';
  if (ps.energy < BALANCE.battle.noiseRemoveCost) return 'エナジーが足りません';
  return null;
}

export function removeNoise(g: GameState, p: PlayerId, cardUid: string): void {
  const ps = g.players[p];
  const i = ps.hand.findIndex((c) => c.uid === cardUid);
  const [card] = ps.hand.splice(i, 1);
  ps.energy -= BALANCE.battle.noiseRemoveCost;
  ps.exile.push(card!);
  log(g, 0, `${ps.name}はエナジー${BALANCE.battle.noiseRemoveCost}を払ってノイズを除外した`, 'action');
}

