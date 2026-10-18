/** 効果1つ・デメリット1つの入力欄。選択肢はカードの種類・レアリティ・効果に応じて絞る */
import {
  BALANCE,
  CONDITIONS,
  CONDITION_TIER_LABEL,
  EFFECT_GROUPS,
  RARITY_LABEL,
  TIMINGS,
  allowedTargets,
  availableDrawbacks,
  availableEffects,
  cardBase,
  changeEffectType,
  conditionsFor,
  createDrawback,
  describeDrawback,
  describeEffect,
  drawbackPoints,
  effectPoints,
  fitDrawback,
  fitEffect,
  formatMultiplier,
  getDrawback,
  getEffect,
  listDrawbacks,
  listEffects,
  listModifiers,
  targetLabel,
  targetMultiplier,
  timingMultiplier,
  timingsFor,
  type CardDef,
  type ConditionId,
  type ConditionTier,
  type DrawbackInstance,
  type EffectInstance,
  type ModifierId,
  type TargetId,
  type TimingId,
  type Violation,
} from '../../engine/index.ts';
import { cx, stepOf } from '../util.ts';
import { Stepper, Violations } from './controls.tsx';

interface EffectRowProps {
  effect: EffectInstance;
  card: CardDef;
  violations: Violation[];
  onChange: (e: EffectInstance) => void;
  onRemove: () => void;
}

const TIERS: ConditionTier[] = ['loose', 'normal', 'strict'];

export function EffectRow({ effect, card, violations, onChange, onRemove }: EffectRowProps) {
  const base = cardBase(card);
  const def = getEffect(effect.id);
  const available = new Set(availableEffects(card.rarity).map((d) => d.id));
  const p = effectPoints(effect, base);
  const targets = def ? allowedTargets(def.targetRule, effect.timing) : [];
  const conditions = conditionsFor(effect.timing);
  const has = (path: string) => violations.some((v) => v.path?.endsWith(path));

  return (
    <div className={cx('row-card', violations.length > 0 && 'row-card--invalid')}>
      <div className="row-card__head">
        <select
          className="row-card__kind"
          value={effect.id}
          onChange={(e) => onChange(changeEffectType(effect, e.target.value, base))}
          aria-label="効果の種類"
        >
          {EFFECT_GROUPS.map((g) => (
            <optgroup key={g.id} label={g.label}>
              {listEffects()
                .filter((d) => d.group === g.id)
                .map((d) => (
                  <option key={d.id} value={d.id} disabled={!available.has(d.id) && d.id !== effect.id}>
                    {d.name}
                    {d.minRarity && !available.has(d.id)
                      ? `（${d.minRarity === 'legend' ? 'レジェンドのみ' : `${RARITY_LABEL[d.minRarity]}以上`}）`
                      : ''}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <span className="row-card__pts">{p.value}pt</span>
        <button type="button" className="btn btn--ghost btn--icon" onClick={onRemove} aria-label="この効果を削除">
          ✕
        </button>
      </div>
      {def && <p className="hint">{def.summary}</p>}

      {def && (def.value || def.hits || def.option) && (
        <div className="row-card__params">
          {def.value && (
            <Stepper
              label={def.value.label}
              value={effect.value}
              min={def.value.min}
              max={def.value.max}
              step={stepOf(def.value)}
              invalid={has('.value')}
              onChange={(v) => onChange({ ...effect, value: v })}
            />
          )}
          {def.hits && (
            <Stepper
              label={def.hits.label}
              value={effect.hits}
              min={def.hits.min}
              max={def.hits.max}
              invalid={has('.hits')}
              onChange={(v) => onChange({ ...effect, hits: v })}
            />
          )}
          {def.option && (
            <label className="field">
              <span>{def.option.label}</span>
              <select value={effect.option ?? def.option.default} onChange={(e) => onChange({ ...effect, option: e.target.value })}>
                {def.option.choices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      <div className="row-card__selects">
        <label className={cx('field', has('.timing') && 'field--invalid')}>
          <span>タイミング</span>
          <select value={effect.timing} onChange={(e) => onChange(fitEffect({ ...effect, timing: e.target.value as TimingId }, base))}>
            {timingsFor(base).map((t) => (
              <option key={t} value={t}>
                {TIMINGS[t].label}（×{formatMultiplier(timingMultiplier(t, base))}）
              </option>
            ))}
            {!timingsFor(base).includes(effect.timing) && <option value={effect.timing}>{TIMINGS[effect.timing]?.label}（使えません）</option>}
          </select>
        </label>
        {def && (
          <label className={cx('field', has('.target') && 'field--invalid')}>
            <span>対象</span>
            <select
              value={effect.target}
              disabled={targets.length === 1 && targets[0] === effect.target}
              onChange={(e) => onChange({ ...effect, target: e.target.value as TargetId })}
            >
              {targets.map((t) => (
                <option key={t} value={t}>
                  {targetLabel(t, def.targetRule, effect.timing)}（×{formatMultiplier(targetMultiplier(t))}）
                </option>
              ))}
              {!targets.includes(effect.target) && <option value={effect.target}>（選べない対象）</option>}
            </select>
          </label>
        )}
        <label className={cx('field', has('.condition') && 'field--invalid')}>
          <span>条件</span>
          <select
            value={effect.condition ?? ''}
            onChange={(e) => onChange({ ...effect, condition: (e.target.value || null) as ConditionId | null })}
          >
            <option value="">なし（×1.0）</option>
            {TIERS.map((tier) => (
              <optgroup key={tier} label={`${CONDITION_TIER_LABEL[tier]}（×${formatMultiplier(BALANCE.condition[tier])}）`}>
                {conditions
                  .filter((c) => CONDITIONS[c].tier === tier)
                  .map((c) => (
                    <option key={c} value={c}>
                      {CONDITIONS[c].label}
                    </option>
                  ))}
              </optgroup>
            ))}
            {effect.condition && !conditions.includes(effect.condition) && (
              <option value={effect.condition}>{CONDITIONS[effect.condition]?.label}（使えません）</option>
            )}
          </select>
        </label>
      </div>

      {def?.allowsMods && (
        <div className="row-card__mods">
          {listModifiers().map((m) => {
            const on = effect.mods?.includes(m.id) ?? false;
            return (
              <label key={m.id} className="check" title={m.summary}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => {
                    const mods = on ? (effect.mods ?? []).filter((x) => x !== m.id) : [...(effect.mods ?? []), m.id as ModifierId];
                    const next: EffectInstance = { ...effect, mods };
                    if (mods.length === 0) delete next.mods;
                    onChange(next);
                  }}
                />
                {m.name}（+{Math.round(m.rate * 100)}%）
              </label>
            );
          })}
        </div>
      )}

      <p className="row-card__text">{describeEffect(effect)}</p>
      <p className="row-card__formula">
        {p.formula} = <b>{p.value}pt</b>
      </p>
      <Violations items={violations} />
    </div>
  );
}

// ---------------------------------------------------------------- デメリット

interface DrawbackRowProps {
  drawback: DrawbackInstance;
  card: CardDef;
  violations: Violation[];
  onChange: (d: DrawbackInstance) => void;
  onRemove: () => void;
}

export function DrawbackRow({ drawback, card, violations, onChange, onRemove }: DrawbackRowProps) {
  const base = cardBase(card);
  const def = getDrawback(drawback.id);
  const p = drawbackPoints(drawback, base);
  const others = card.drawbacks.filter((d) => d !== drawback);
  const choosable = new Set(availableDrawbacks({ ...card, drawbacks: others }).map((d) => d.id));
  const has = (path: string) => violations.some((v) => v.path?.endsWith(path));

  return (
    <div className={cx('row-card row-card--drawback', violations.length > 0 && 'row-card--invalid')}>
      <div className="row-card__head">
        <select
          className="row-card__kind"
          value={drawback.id}
          onChange={(e) => onChange(createDrawback(e.target.value, base))}
          aria-label="デメリットの種類"
        >
          {listDrawbacks().map((d) => (
            <option key={d.id} value={d.id} disabled={!choosable.has(d.id) && d.id !== drawback.id}>
              {d.name}
              {d.monsterOnly ? '（モンスター）' : ''}
            </option>
          ))}
        </select>
        <span className="row-card__pts">−{p.value}pt</span>
        <button type="button" className="btn btn--ghost btn--icon" onClick={onRemove} aria-label="このデメリットを削除">
          ✕
        </button>
      </div>
      {def && <p className="hint">{def.summary}</p>}
      <div className="row-card__params">
        {def?.value && (
          <Stepper
            label={def.value.label}
            value={drawback.value}
            min={def.value.min}
            max={def.value.max}
            step={stepOf(def.value)}
            invalid={has('.value')}
            onChange={(v) => onChange({ ...drawback, value: v })}
          />
        )}
        {def && def.fixedPoints === undefined && (
          <label className={cx('field', has('.timing') && 'field--invalid')}>
            <span>タイミング</span>
            <select
              value={drawback.timing ?? ''}
              onChange={(e) => onChange(fitDrawback({ ...drawback, timing: e.target.value as TimingId }, base))}
            >
              {timingsFor(base).map((t) => (
                <option key={t} value={t}>
                  {TIMINGS[t].label}（×{formatMultiplier(timingMultiplier(t, base))}）
                </option>
              ))}
            </select>
          </label>
        )}
        {def && def.fixedPoints !== undefined && <p className="hint">倍率込みの固定値です（タイミングは選べません）</p>}
      </div>
      <p className="row-card__text row-card__text--drawback">{describeDrawback(drawback)}</p>
      <p className="row-card__formula">
        {p.formula} = <b>−{p.value}pt</b>
      </p>
      <Violations items={violations} />
    </div>
  );
}
