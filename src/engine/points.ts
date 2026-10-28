/**
 * ポイント計算。合計 = ステータス + キーワード + 効果 − コストの差し引き − デメリット。
 * コストの差し引きはコストごとの表（決定事項 #67）。コスト0のカードはレアリティ上限が下がる。
 * デメリットで差し引けるのはレアリティ上限まで。コスト0のカードは差し引けない（決定事項 #64）
 */
import { BALANCE } from './balance.ts';
import { cardBase } from './classify.ts';
import type { EffectDef, ModifierDef, PointCard } from './define.ts';
import { formatMultiplier } from './labels.ts';
import { ceilPoints, floorPoints, round2 } from './math.ts';
import {
  CHARGE_EVENT_LABEL,
  CONDITIONS,
  MODE_TIMINGS,
  DEFAULT_ATTACK_PROFILE,
  chargeSpec,
  TIMINGS,
  TRAP_TIMINGS,
  conditionMultiplier,
  isPowerTiming,
  defaultTiming,
  targetLabel,
  targetMultiplier,
  timingMultiplier,
  type AttackProfile,
} from './options.ts';
import { getAbility, getDrawback, getEffect, getKeyword, getModifier } from './registry.ts';
import { TRIBE_LABEL, type AbilityInstance, type CardBase, type CardDef, type DrawbackInstance, type EffectInstance, type KeywordInstance, type PointLine, type PointSummary, type TimingId } from './types.ts';
import type { AbilityPointContext } from './define.ts';

export interface Factor {
  label: string;
  value: number;
  /** 式に出す文字（省略なら value をそのまま。例：「2.0×2+1.0」） */
  text?: string;
}

export interface EffectPoints {
  base: number;
  factors: Factor[];
  /** 丸める前の値 */
  raw: number;
  /** 切り上げ後の値 */
  value: number;
  formula: string;
}

export interface DrawbackPoints {
  base: number;
  factors: Factor[];
  raw: number;
  /** 切り捨て後の値（正の数） */
  value: number;
  formula: string;
}

/** 「基礎 × 倍率（理由）…」の式を作る。倍率1は省略し、端数が出たら丸め方を添える */
function buildFormula(baseFormula: string, base: number, factors: Factor[], raw: number, rounding: string): string {
  const shown = factors.filter((f) => f.value !== 1);
  const body =
    shown.length === 0
      ? baseFormula
      : [String(round2(base)), ...shown.map((f) => `${f.text ?? formatMultiplier(f.value)}（${f.label}）`)].join(' × ');
  return Number.isInteger(round2(raw)) ? body : `${body} = ${round2(raw)} → ${rounding}`;
}

/** モンスターの攻撃のしかた（キーワードから。「攻撃するたび」の倍率に使う） */
export function attackProfile(keywords: readonly KeywordInstance[]): AttackProfile {
  let attacks = DEFAULT_ATTACK_PROFILE.attacks;
  let haste = DEFAULT_ATTACK_PROFILE.haste;
  let rush = false;
  for (const k of keywords) {
    const b = getKeyword(k.id)?.battle;
    if (!b) continue;
    if (b.attacksPerTurn !== undefined) attacks = Math.max(attacks, b.attacksPerTurn);
    if (b.haste) haste = true;
    if (b.rush) rush = true;
  }
  // 突進（決定事項 #146）も出たターンに攻撃できる（モンスターだけ）ので、「攻撃するたび」の上乗せは疾走と同じ
  return { attacks, haste: haste || rush, ...(rush && !haste ? { rush: true } : {}) };
}

/** タイミングの倍率の項（「攻撃するたび」は攻撃回数と疾走を式と理由に出す） */
function timingFactor(timing: keyof typeof TIMINGS, base: CardBase, card: PointCard): Factor {
  const t = TIMINGS[timing];
  if (timing === 'hitEnemyPlayer') {
    // 二回攻撃なら発動の機会も2倍
    const profile = attackProfile(card.keywords);
    const value = timingMultiplier(timing, base, profile);
    if (profile.attacks === 1) return { label: t.label, value };
    const name = getKeyword('doubleAttack')?.name ?? '二回攻撃';
    return { label: `${t.label}・${name}`, value, text: `${formatMultiplier(BALANCE.timing.hitEnemyPlayer)}×${profile.attacks}` };
  }
  if (timing === 'charged') {
    // 蓄積（MTG 要素 ○ バッチC2）：必要数とイベントで倍率が変わる
    const c = chargeSpec(card.abilities);
    return { label: `${t.label}（${c.once ? 'プラン・' : ''}蓄積${c.need}・${CHARGE_EVENT_LABEL[c.event]}）`, value: timingMultiplier(timing, base, undefined, card) };
  }
  if (timing === 'activated' || timing === 'channel') {
    // 起動・魂力（MTG 要素 ○ バッチC1）：起動のエナジーで倍率が変わる。表示はエナジーつき
    return { label: timingLabelFor(timing, card.abilities), value: timingMultiplier(timing, base, undefined, card) };
  }
  if (timing !== 'attack' || base !== 'monster') {
    // 罠（MTG 要素 △ バッチA）のパワーは、罠のタイミングの倍率が能力の倍率になる
    const trap = base === 'spell' && TRAP_TIMINGS.includes(timing) && (card.abilities ?? []).some((a) => a.id === 'trap');
    return { label: trap ? `${t.label}（罠）` : t.label, value: timingMultiplier(timing, base, DEFAULT_ATTACK_PROFILE, card) };
  }
  const profile = attackProfile(card.keywords);
  const value = timingMultiplier(timing, base, profile);
  const T = BALANCE.timing;
  const names: string[] = [t.label];
  let text = formatMultiplier(T.attack);
  if (profile.attacks !== 1) {
    text += `×${profile.attacks}`;
    names.push(getKeyword('doubleAttack')?.name ?? '二回攻撃');
  }
  if (profile.haste) {
    text += `+${formatMultiplier(T.attackHasteBonus)}`;
    names.push(getKeyword(profile.rush ? 'rush' : 'haste')?.name ?? '疾走');
  }
  return { label: names.join('・'), value, text: profile.attacks === 1 && !profile.haste ? undefined : text };
}

/** このオプション（の種類）をこの効果に付けられるか（タイミングは見ない） */
export function modifierFits(
  m: Pick<ModifierDef, 'scope' | 'requiresScaledValue'>,
  def: Pick<EffectDef, 'allowsMods' | 'scalable' | 'noDelay'> & { value?: EffectDef['value'] },
): boolean {
  switch (m.scope) {
    case 'damage':
      return def.allowsMods === true;
    case 'scale':
      // ばらつき（MTG 要素 △ バッチA）は量の効果だけ
      return def.scalable === true && (!m.requiresScaledValue || def.value?.scaled === true);
    case 'delay':
      return def.noDelay !== true;
  }
}

/**
 * 効果に付いていて、その効果に付けられるオプション（防御無視・吸収は allowsMods、数値の倍数は scalable の効果だけ、
 * 遅延は noDelay でない効果）。付けられないものは無視する（validate が違反として出す）
 */
export function effectModifiers(e: EffectInstance): ModifierDef[] {
  const def = getEffect(e.id);
  if (!def) return [];
  return [...new Set(e.mods ?? [])]
    .map((m) => getModifier(m))
    .filter((m): m is ModifierDef => m !== undefined && modifierFits(m, def));
}

/** 効果1つのポイント：基礎ポイント ×（1 + オプション）× タイミング × 対象 × 条件 → 切り上げ */
/** 毒を相手プレイヤーに与える対象 */
const POISON_ON_ENEMY_PLAYER: readonly string[] = ['enemyAll', 'everyone', 'enemyPlayer', 'bothPlayers'];

/**
 * この効果の条件が、同じカードのほかの部分で必ず満たされるか（報告 #7・#8）。
 * - 自分の場にモンスターがいる：モンスターの召喚時は、そのモンスター自身が場にいる
 * - 相手が毒状態：同じタイミングで、この効果より前に、条件なしで相手プレイヤーに毒を与える効果がある
 */
export function conditionSelfSatisfied(e: EffectInstance, card: PointCard): boolean {
  if (e.condition === 'hasMonster') return e.timing === 'summon' && cardBase(card) === 'monster';
  if (e.condition === 'enemyPoisoned') {
    const effects = card.effects ?? [];
    const at = effects.indexOf(e);
    return effects.some((o, i) => i < at && o.id === 'poison' && o.timing === e.timing && o.condition === null && (o.value ?? 0) > 0 && POISON_ON_ENEMY_PLAYER.includes(o.target));
  }
  return false;
}

export function effectPoints(e: EffectInstance, card: PointCard): EffectPoints {
  const def = getEffect(e.id);
  if (!def) return { base: 0, factors: [], raw: 0, value: 0, formula: '0' };
  const base = cardBase(card);
  const b = def.basePoints(e);
  const factors: Factor[] = [];

  const modDefs = effectModifiers(e);
  if (modDefs.length > 0) {
    factors.push({ label: modDefs.map((m) => m.name).join('・'), value: 1 + modDefs.reduce((s, m) => s + m.rate, 0) });
  }
  if (TIMINGS[e.timing]) factors.push(timingFactor(e.timing, base, card));
  if (BALANCE.target[e.target] !== undefined) {
    factors.push({ label: targetLabel(e.target, def.targetRule, e.timing), value: targetMultiplier(e.target, def.targetRule) });
  }
  if (e.condition && CONDITIONS[e.condition]) {
    // 同じカードの中で必ず満たされる条件（自分のモンスターがいる・自分の毒で相手が毒状態）は、きびしくないので割り引かない
    const free = conditionSelfSatisfied(e, card);
    factors.push({ label: CONDITIONS[e.condition].label + (free ? '（このカード自身で満たす）' : ''), value: free ? 1 : conditionMultiplier(e.condition, card) });
  }

  const raw = factors.reduce((x, f) => x * f.value, b);
  return { base: b, factors, raw, value: ceilPoints(raw), formula: buildFormula(def.baseFormula(e), b, factors, raw, '切り上げ') };
}

/** デメリット1つのポイント（正の数）：基礎ポイント × タイミング → 切り捨て。固定値のものはそのまま */
export function drawbackPoints(d: DrawbackInstance, card: PointCard): DrawbackPoints {
  const def = getDrawback(d.id);
  if (!def) return { base: 0, factors: [], raw: 0, value: 0, formula: '0' };
  const base = cardBase(card);
  const b = def.basePoints(d, card);
  if (def.fixed) {
    return { base: b, factors: [], raw: b, value: floorPoints(b), formula: def.baseFormula(d, card) };
  }
  const factors: Factor[] = [];
  if (d.timing && TIMINGS[d.timing]) factors.push(timingFactor(d.timing, base, card));
  const raw = factors.reduce((x, f) => x * f.value, b);
  return { base: b, factors, raw, value: floorPoints(raw), formula: buildFormula(def.baseFormula(d, card), b, factors, raw, '切り捨て') };
}

/** 内訳に出す効果名（例：「攻撃するたび 毒1」） */
export function effectLabel(e: EffectInstance, base: CardBase): string {
  const def = getEffect(e.id);
  if (!def) return `不明な効果（${e.id}）`;
  const value = def.shortValue ? def.shortValue(e) : def.hits ? `${e.value ?? 0}×${e.hits ?? 0}` : def.value ? String(e.value ?? 0) : '';
  const timing = e.timing !== defaultTiming(base) && TIMINGS[e.timing] ? `${TIMINGS[e.timing].label} ` : '';
  return `${timing}${def.name}${value}`;
}

export function drawbackLabel(d: DrawbackInstance, base: CardBase): string {
  const def = getDrawback(d.id);
  if (!def) return `不明なデメリット（${d.id}）`;
  const timing = d.timing && d.timing !== defaultTiming(base) && TIMINGS[d.timing] ? `${TIMINGS[d.timing].label} ` : '';
  return `${timing}${def.name}${def.value ? (d.value ?? 0) : ''}`;
}

/**
 * キーワードのポイント（攻撃力に比例するもの）に使う攻撃力。召喚時に自分に（自分も選べる「選んだ1体」を含む）攻撃力を足す
 * 条件なしの鍛錬・攻撃力アップは、最初から攻撃力があるものとして数える（攻撃力0で作って後から足すと比例分を逃れられるため。報告 #11）
 */
export function keywordStats(card: Pick<CardDef, 'stats' | 'effects'>): NonNullable<CardDef['stats']> {
  const s = card.stats!;
  let extra = 0;
  for (const e of card.effects) {
    if ((e.id === 'train' || e.id === 'attackUp') && e.timing === 'summon' && e.condition === null && (e.target === 'thisMonster' || e.target === 'chosen')) extra += e.value ?? 0;
  }
  // 攻撃力は最低 keywordMinAttack として数える（ほかのカードの強化で上がるので、攻撃力0でもタダにしない：報告 #19）
  const attack = Math.max(s.attack + extra, BALANCE.stats.keywordMinAttack);
  return attack !== s.attack ? { ...s, attack } : s;
}

/** ステータスとキーワードのポイントの合計（MTG 要素 ○ バッチC1：捨て札から使う能力・魂力の二者択一） */
export function bodyPoints(card: Pick<CardDef, 'stats' | 'keywords'> & { effects?: CardDef['effects'] }): number {
  if (!card.stats) return 0;
  const S = BALANCE.stats;
  const { attack, hp, defense } = card.stats;
  let v = attack * S.attackPoints + hp * S.hpPoints + defense * S.defensePoints;
  for (const k of card.keywords) {
    const def = getKeyword(k.id);
    if (def) v += def.points(k, keywordStats({ stats: card.stats, effects: card.effects ?? [] }));
  }
  return v;
}

/** カードの能力のポイント計算に渡す情報（効果のポイントの合計など） */
export function abilityContext(card: Pick<CardDef, 'stats' | 'keywords' | 'effects'> & { abilities?: CardDef['abilities']; cost?: number }): AbilityPointContext {
  const timing = card.stats ? 'summon' : 'play';
  let all = 0;
  let play = 0;
  let channel = 0;
  let conditionalGain = 0;
  const chosenEffects: AbilityPointContext['chosenEffects'] = [];
  const timingPoints: AbilityPointContext['timingPoints'] = {};
  let powerEffectPoints = 0;
  const base = cardBase(card);
  for (const e of card.effects) {
    const v = effectPoints(e, card).value;
    all += v;
    // MTG 要素 △ バッチC：タイミングごと（ワープ）・パワーの効果（紋章）
    timingPoints[e.timing] = (timingPoints[e.timing] ?? 0) + v;
    if (isPowerTiming(e.timing, base)) powerEffectPoints += v;
    if (e.timing === timing) play += v;
    if (e.timing === 'channel') channel += v;
    // MTG 要素 △ バッチB：切除（条件を外したときに増える分）・奮励／超過（「選んだ1体」の効果）
    if (e.condition !== null && MODE_TIMINGS.includes(e.timing)) conditionalGain += Math.max(0, effectPoints({ ...e, condition: null }, card).value - v);
    const rule = getEffect(e.id)?.targetRule;
    if (e.timing === timing && e.target === 'chosen' && rule) chosenEffects.push({ points: v, rule });
  }
  return {
    card,
    effectPoints: all,
    playEffectPoints: play,
    bodyPoints: bodyPoints(card),
    channelEffectPoints: channel,
    hasFromDiscard: card.effects.some((e) => e.timing === 'fromDiscard'),
    modeOtherPoints: modeSummary(card)?.others ?? 0,
    conditionalGain,
    chosenEffects,
    timingPoints,
    powerEffectPoints,
  };
}

/** モード選択（MTG 要素 ○ バッチC2）の、タイミングごとのモードのポイント（モードの付いた効果が無ければ null） */
export interface ModeSummary {
  /** タイミングごと：モードの番号 → そのモードの効果のポイントの合計 */
  groups: { timing: TimingId; points: Map<number, number> }[];
  /** いちばん高いモード以外の合計（すべてのタイミングの和） */
  others: number;
}

export function modeSummary(card: PointCard & Pick<CardDef, 'effects'>): ModeSummary | null {
  const byTiming = new Map<TimingId, Map<number, number>>();
  for (const e of card.effects) {
    if (e.mode === undefined) continue;
    const m = byTiming.get(e.timing) ?? new Map<number, number>();
    m.set(e.mode, (m.get(e.mode) ?? 0) + effectPoints(e, card).value);
    byTiming.set(e.timing, m);
  }
  if (byTiming.size === 0) return null;
  let others = 0;
  const groups: ModeSummary['groups'] = [];
  for (const [timing, points] of byTiming) {
    const values = [...points.values()];
    others += values.reduce((a, b) => a + b, 0) - Math.max(...values);
    groups.push({ timing, points });
  }
  return { groups, others };
}

/**
 * モード選択の割引（MTG 要素 ○ バッチC2）：使うときに1つしか選べないので、選ばれないモードは×modal.otherRate。
 * 割り引く量（正の数）＝ 他のモードの合計×(1−otherRate)（切り捨て）。モードが無ければ null
 */
export function modeDiscount(card: PointCard & Pick<CardDef, 'effects'>): { value: number; formula: string } | null {
  const sum = modeSummary(card);
  if (!sum) return null;
  // 放題・段階・最悪の二択（MTG 要素 △ バッチB）：モードのポイントの合計の決め方を能力が決める
  for (const a of card.abilities ?? []) {
    const def = getAbility(a.id);
    if (!def?.modeValue) continue;
    let total = 0;
    let value = 0;
    const formulas: string[] = [];
    for (const g of sum.groups) {
      const points = [...g.points.entries()].sort((x, y) => x[0] - y[0]).map(([, v]) => v);
      total += points.reduce((x, y) => x + y, 0);
      const r = def.modeValue(a, points);
      value += r.value;
      formulas.push(r.formula);
    }
    const discount = floorPoints(total - value);
    if (discount === 0) return null;
    return { value: discount, formula: `モード${round2(total)} → ${formulas.join('・')}（${def.name}） → 切り捨て` };
  }
  if (sum.others <= 0) return null;
  const rate = BALANCE.modal.otherRate;
  return { value: floorPoints(sum.others * (1 - rate)), formula: `選ばれないモード${round2(sum.others)}×${round2(1 - rate)} → 切り捨て` };
}

/** 起動・魂力のタイミングの表示名（エナジーつき。MTG 要素 ○ バッチC1） */
export function timingLabelFor(timing: TimingId, abilities: CardDef['abilities']): string {
  const id = timing === 'activated' ? 'activate' : timing === 'channel' ? 'channel' : null;
  const v = id ? (abilities ?? []).find((a) => a.id === id)?.value : undefined;
  return v === undefined ? TIMINGS[timing].label : `${TIMINGS[timing].label}（エナジー${v}）`;
}

/**
 * 魂力（MTG 要素 ○ バッチC1）の二者択一の割引：本体（ステータス・キーワード・魂力以外の効果）A と魂力の効果 B は
 * どちらか一方しか使えないので、合計を「高い方＋低い方×choice.otherRate」にする。割り引く量（正の数）。魂力が無ければ0
 */
export function choiceDiscount(card: CardDef): { value: number; formula: string } | null {
  if (!(card.abilities ?? []).some((a) => a.id === 'channel')) return null;
  const ctx = abilityContext(card);
  const b = ctx.channelEffectPoints;
  const a = ctx.bodyPoints + ctx.effectPoints - b;
  const low = Math.min(a, b);
  if (low <= 0) return null;
  const rate = BALANCE.choice.otherRate;
  const value = floorPoints(low * (1 - rate));
  return { value, formula: `本体${round2(a)}と魂力${round2(b)}：低い方${round2(low)}×${round2(1 - rate)} → 切り捨て` };
}

/** カードの能力1つのポイント（切り上げ） */
export function abilityPoints(a: AbilityInstance, ctx: AbilityPointContext): { value: number; formula: string } {
  const def = getAbility(a.id);
  if (!def) return { value: 0, formula: '0' };
  return { value: ceilPoints(def.points(a, ctx)), formula: def.formula(a, ctx) };
}

export function abilityLabel(a: AbilityInstance): string {
  const def = getAbility(a.id);
  return def ? `能力 ${def.displayName(a)}` : `不明な能力（${a.id}）`;
}

const pct = (r: number) => `${Math.round(r * 100)}%`;

/** 種族の得意・苦手の ID（キーワード・効果の ID と、ステータスは `stat:defense`）。得意でも苦手でもなければ undefined */
export function tribeLeanOf(tribe: CardDef['tribe'], id: string): 'favored' | 'unfavored' | undefined {
  if (!tribe) return undefined;
  const T = BALANCE.tribes[tribe];
  if ((T.favored as readonly string[]).includes(id)) return 'favored';
  if ((T.unfavored as readonly string[]).includes(id)) return 'unfavored';
  return undefined;
}

/**
 * 種族の得意・苦手（決定事項 #143）：モンスターのカードだけ。得意のキーワード・効果・守備力のポイントの合計 favored から
 * (1−favorRate) を引き（切り捨て）、苦手の合計 unfavored に (unfavorRate−1) を足す（切り上げ）。種族の無いカード・呪文は null
 */
export function tribeLeaning(card: Pick<CardDef, 'stats' | 'tribe' | 'keywords' | 'effects'> & PointCard): { favored: number; unfavored: number; discount: number; surcharge: number } | null {
  if (!card.stats || !card.tribe) return null;
  let favored = 0;
  let unfavored = 0;
  const add = (id: string, value: number) => {
    const lean = tribeLeanOf(card.tribe, id);
    if (lean === 'favored') favored += Math.max(0, value);
    else if (lean === 'unfavored') unfavored += Math.max(0, value);
  };
  add('stat:defense', card.stats.defense * BALANCE.stats.defensePoints);
  const ks = keywordStats(card);
  for (const k of card.keywords) {
    const def = getKeyword(k.id);
    if (def) add(k.id, def.points(k, ks));
  }
  for (const e of card.effects) add(e.id, effectPoints(e, card).value);
  const T = BALANCE.tribes;
  return { favored, unfavored, discount: floorPoints(favored * (1 - T.favorRate)), surcharge: ceilPoints(unfavored * (T.unfavorRate - 1)) };
}

/** コストの差し引き（表にないコストは0。範囲外は validate が弾く） */
export function costPoints(cost: number): number {
  return BALANCE.card.costPoints[cost] ?? 0;
}

/** レアリティの上限。コスト0のカードは下がる（決定事項 #67） */
export function rarityCap(rarity: CardDef['rarity'], cost: number): number {
  const cap = BALANCE.rarity[rarity]?.cap ?? 0;
  return cost === 0 ? Math.max(0, cap - BALANCE.card.cost0CapPenalty) : cap;
}

export function calculatePoints(card: CardDef): PointSummary {
  const base = cardBase(card);
  const S = BALANCE.stats;
  const lines: PointLine[] = [];

  if (card.stats) {
    const { attack, hp, defense } = card.stats;
    if (attack !== 0) lines.push({ kind: 'stat', label: `攻撃力${attack}`, formula: `${attack}×${S.attackPoints}`, value: attack * S.attackPoints });
    lines.push({ kind: 'stat', label: `体力${hp}`, formula: `${hp}×${S.hpPoints}`, value: hp * S.hpPoints });
    if (defense !== 0) lines.push({ kind: 'stat', label: `守備力${defense}`, formula: `${defense}×${S.defensePoints}`, value: defense * S.defensePoints });

    card.keywords.forEach((k, index) => {
      const def = getKeyword(k.id);
      if (!def || !card.stats) return;
      lines.push({ kind: 'keyword', index, label: def.displayName(k), formula: def.formula(k, keywordStats(card)), value: def.points(k, keywordStats(card)) });
    });
  }

  card.effects.forEach((e, index) => {
    const p = effectPoints(e, card);
    lines.push({ kind: 'effect', index, label: effectLabel(e, base), formula: p.formula, value: p.value });
  });

  // 新生のコピーも召喚時の効果を出す（攻撃力アップなどが2回出る）ので、その分のポイントを足す（報告 #7）
  if (card.effects.some((e) => e.id === 'offspring')) {
    const again = card.effects.reduce((s, e) => (e.id !== 'offspring' && e.timing === 'summon' ? s + effectPoints(e, card).value : s), 0);
    if (again > 0) lines.push({ kind: 'limit', label: '新生のコピーにも出る召喚時の効果', formula: `召喚時の効果の合計${again}をもう1回`, value: again });
  }

  // カードの能力（MTG 要素 ○ バッチB）：再利用・反復は効果のポイントから決まる
  const ctx = abilityContext(card);
  (card.abilities ?? []).forEach((a, index) => {
    const p = abilityPoints(a, ctx);
    lines.push({ kind: 'ability', index, label: abilityLabel(a), formula: p.formula, value: p.value });
  });

  // 種族の得意・苦手（決定事項 #143）
  const lean = tribeLeaning(card);
  if (lean && lean.discount > 0) {
    lines.push({ kind: 'limit', label: `種族（${TRIBE_LABEL[card.tribe!]}）の得意`, formula: `得意${lean.favored}の${pct(1 - BALANCE.tribes.favorRate)}引き`, value: -lean.discount });
  }
  if (lean && lean.surcharge > 0) {
    lines.push({ kind: 'limit', label: `種族（${TRIBE_LABEL[card.tribe!]}）の苦手`, formula: `苦手${lean.unfavored}の${pct(BALANCE.tribes.unfavorRate - 1)}増し`, value: lean.surcharge });
  }

  // モード選択の割引（MTG 要素 ○ バッチC2）
  const modal = modeDiscount(card);
  if (modal && modal.value > 0) {
    lines.push({ kind: 'limit', label: 'モード選択の割引', formula: modal.formula, value: -modal.value });
  }

  // 魂力の二者択一の割引（MTG 要素 ○ バッチC1）
  const choice = choiceDiscount(card);
  if (choice && choice.value > 0) {
    lines.push({ kind: 'limit', label: '二者択一の割引（魂力）', formula: choice.formula, value: -choice.value });
  }

  const costPt = costPoints(card.cost);
  if (costPt !== 0) {
    lines.push({ kind: 'cost', label: `コスト${card.cost}`, formula: `−${costPt}`, value: -costPt });
  }

  let drawbackTotal = 0;
  card.drawbacks.forEach((d, index) => {
    const p = drawbackPoints(d, card);
    drawbackTotal += p.value;
    lines.push({ kind: 'drawback', index, label: drawbackLabel(d, base), formula: p.formula, value: -p.value + 0 });
  });

  const cap = rarityCap(card.rarity, card.cost);
  const limit = drawbackOffsetLimit(card.cost, cap);
  const drawbackOffset = Math.min(drawbackTotal, limit);
  if (drawbackTotal > drawbackOffset) {
    const why = limit === 0 ? `コスト${BALANCE.curse.minCostForOffset}未満のカードは差し引けない` : `差し引けるのは${limit}ptまで`;
    lines.push({
      kind: 'limit',
      label: 'デメリットの差し引き上限',
      formula: `${drawbackTotal} − ${drawbackOffset}（${why}）`,
      value: drawbackTotal - drawbackOffset,
    });
  }

  const total = lines.reduce((s, l) => s + l.value, 0);
  return { lines, total, cap, remaining: cap - total, drawbackTotal, drawbackOffset };
}

/** デメリットで差し引けるポイントの上限 */
export function drawbackOffsetLimit(cost: number, cap: number): number {
  const C = BALANCE.curse;
  return cost < C.minCostForOffset ? 0 : Math.floor(cap * C.maxOffsetRate);
}
