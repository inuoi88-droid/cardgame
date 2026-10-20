/**
 * 効果1つ・デメリット1つの行。
 * 要約1行（アイコン・名前・値・タイミング・対象・ポイント）をタップすると展開して、数値・タイミング・対象・条件を編集できる。
 * 並べ替え（↑↓）・複製・削除は展開した中に置く。順番は解決順。
 */
import { useEffect, useRef, type ReactNode } from 'react';
import {
  CONDITIONS,
  TIMINGS,
  cardBase,
  describeDrawback,
  describeEffect,
  drawbackPoints,
  effectPoints,
  fitDrawback,
  fitEffect,
  getDrawback,
  getEffect,
  listModifiers,
  targetLabel,
  type CardDef,
  type DrawbackInstance,
  type EffectInstance,
  type ModifierId,
  type TargetId,
  type TimingId,
  type Violation,
} from '../../engine/index.ts';
import { GROUP_ICON } from '../editor/EffectPicker.tsx';
import { drawbackHint, effectHint } from '../editor/hints.ts';
import { OptionPicker } from '../editor/OptionPicker.tsx';
import { conditionFromValue, conditionOptions, conditionValue, drawbackTimingOptions, effectOptionOptions, effectTimingOptions, targetOptions } from '../editor/pickOptions.ts';
import { fieldId } from '../editor/validation.ts';
import { cx, stepOf } from '../util.ts';
import { Popover } from './Popover.tsx';
import { Stepper, Violations } from './controls.tsx';

interface RowShellProps {
  id: string;
  kind: 'effect' | 'drawback';
  invalid: boolean;
  expanded: boolean;
  onToggle: () => void;
  icon: string;
  title: ReactNode;
  chips: ReactNode[];
  pts: string;
  hint: { title: string; description: string; lines: string[] } | null;
  index: number;
  children: ReactNode;
}

/** 行の枠：要約行（ボタン）＋展開した中身 */
function RowShell({ id, kind, invalid, expanded, onToggle, icon, title, chips, pts, hint, index, children }: RowShellProps) {
  return (
    <div className={cx('ed-row', `ed-row--${kind}`, invalid && 'ed-row--invalid', expanded && 'is-open')} id={id}>
      <div className="ed-row__head">
        <button type="button" className="ed-row__toggle" aria-expanded={expanded} onClick={onToggle} aria-label={`${index + 1}番目の${kind === 'effect' ? '効果' : 'デメリット'}：${typeof title === 'string' ? title : ''}（${expanded ? '閉じる' : '開く'}）`}>
          <span className="ed-row__icon" aria-hidden="true">
            {icon}
          </span>
          <span className="ed-row__main">
            <span className="ed-row__title">
              {title}
              {invalid && <span className="badge badge--ng badge--sm">要修正</span>}
            </span>
            <span className="ed-row__chips">{chips}</span>
          </span>
          <span className="ed-row__chev" aria-hidden="true">
            ▾
          </span>
        </button>
        <span className="ed-row__side">
          <span className={cx('ed-row__pts', kind === 'drawback' && 'is-minus')}>{pts}</span>
          {hint && (
            <Popover content={hint} placement="bottom" className="ed-row__hint">
              <span className="ed-row__hint-btn">目安</span>
            </Popover>
          )}
        </span>
      </div>
      {expanded && <div className="ed-row__body">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- 効果

interface EffectRowProps {
  index: number;
  count: number;
  effect: EffectInstance;
  card: CardDef;
  violations: Violation[];
  expanded: boolean;
  onToggle: () => void;
  onChange: (e: EffectInstance) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  canDuplicate: boolean;
  /** 追加直後：最初の入力欄にフォーカスする */
  autoFocus?: boolean;
}

export function EffectRow({ index, count, effect, card, violations, expanded, onToggle, onChange, onRemove, onMove, onDuplicate, canDuplicate, autoFocus }: EffectRowProps) {
  const base = cardBase(card);
  const def = getEffect(effect.id);
  const p = effectPoints(effect, card);
  const targets = targetOptions(effect, card);
  const has = (suffix: string) => violations.some((v) => v.path?.endsWith(suffix));
  const firstRef = useRef<HTMLDivElement>(null);
  const nth = `${index + 1}番目の効果`;

  useEffect(() => {
    if (!autoFocus || !expanded) return;
    const el = firstRef.current?.querySelector<HTMLElement>('input, select, button');
    el?.focus({ preventScroll: true });
  }, [autoFocus, expanded]);

  const step = def?.value ? stepOf(def.value) : 1;
  const stepHelp = (() => {
    if (!def?.value || step === 1) return undefined;
    const next = effectPoints({ ...effect, value: Math.min(def.value.max, (effect.value ?? 0) + step) }, card).value;
    const delta = next - p.value;
    return delta > 0 ? `+${step} ごとに +${delta}pt` : undefined;
  })();

  const shortValue = def ? (def.shortValue ? def.shortValue(effect) : def.hits ? `${effect.value ?? 0}×${effect.hits ?? 0}` : def.value ? String(effect.value ?? 0) : '') : '';
  const timingChip = TIMINGS[effect.timing]?.label ?? effect.timing;
  const targetChip = def ? targetLabel(effect.target, def.targetRule, effect.timing) : effect.target;
  const chips: ReactNode[] = [
    <span key="t" className="ed-chip">
      {timingChip}
    </span>,
    <span key="g" className="ed-chip">
      {targetChip}
    </span>,
  ];
  if (effect.condition && CONDITIONS[effect.condition]) {
    chips.push(
      <span key="c" className="ed-chip ed-chip--cond">
        {CONDITIONS[effect.condition].label}
      </span>,
    );
  }
  (effect.mods ?? []).forEach((m) => chips.push(<span key={m} className="ed-chip ed-chip--mod">{listModifiers().find((x) => x.id === m)?.name ?? m}</span>));

  return (
    <RowShell
      id={fieldId(`effects.${index}`)}
      kind="effect"
      invalid={violations.length > 0}
      expanded={expanded}
      onToggle={onToggle}
      icon={def ? GROUP_ICON[def.group] : '？'}
      title={`${def?.name ?? effect.id}${shortValue ? ` ${shortValue}` : ''}`}
      chips={chips}
      pts={`${p.value}pt`}
      hint={effectHint(effect, card)}
      index={index}
    >
      {def && <p className="ed-row__summary">{def.summary}</p>}
      <div className="ed-row__params" ref={firstRef}>
        {def?.value && (
          <Stepper
            label={def.value.label}
            help={stepHelp}
            value={effect.value}
            min={def.value.min}
            max={def.value.max}
            step={step}
            snap={step > 1}
            invalid={has('.value')}
            onChange={(v) => onChange({ ...effect, value: v })}
          />
        )}
        {def?.hits && (
          <Stepper label={def.hits.label} value={effect.hits} min={def.hits.min} max={def.hits.max} invalid={has('.hits')} onChange={(v) => onChange({ ...effect, hits: v })} />
        )}
        {def?.option && (
          <OptionPicker
            className="ed-row__option"
            label={def.option.label}
            title={`${nth}の${def.option.label}`}
            value={effect.option ?? def.option.default}
            options={effectOptionOptions(effect, card)}
            onChange={(option) => onChange({ ...effect, option })}
            id={fieldId(`effects.${index}.option`)}
            invalid={has('.option')}
          />
        )}
      </div>

      <div className="ed-row__selects">
        <OptionPicker
          label="タイミング"
          title={`${nth}のタイミング`}
          value={effect.timing}
          options={effectTimingOptions(effect, card)}
          onChange={(t) => onChange(fitEffect({ ...effect, timing: t as TimingId }, base))}
          id={fieldId(`effects.${index}.timing`)}
          invalid={has('.timing')}
          note="いつ発動するか。倍率がポイントに掛かります"
        />
        {def && (
          <OptionPicker
            label="対象"
            title={`${nth}の対象`}
            value={effect.target}
            options={targets}
            onChange={(t) => onChange({ ...effect, target: t as TargetId })}
            id={fieldId(`effects.${index}.target`)}
            invalid={has('.target')}
            disabled={targets.length === 1 && targets[0]!.id === effect.target}
          />
        )}
        <OptionPicker
          label="条件（付けると安くなる）"
          title={`${nth}の条件`}
          value={conditionValue(effect.condition)}
          options={conditionOptions(effect, card)}
          onChange={(v) => onChange({ ...effect, condition: conditionFromValue(v) })}
          id={fieldId(`effects.${index}.condition`)}
          invalid={has('.condition')}
          note="条件を満たしたときだけ発動する代わりに、ポイントが安くなります"
        />
      </div>

      {def?.allowsMods && (
        <div className="ed-row__mods">
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

      <p className="ed-row__text">{describeEffect(effect)}</p>
      {p.factors.some((f) => f.value !== 1) && (
        <p className="ed-row__formula">
          {p.formula} = <b>{p.value}pt</b>
        </p>
      )}
      <Violations items={violations} />

      <div className="ed-row__actions">
        <button type="button" className="btn btn--small" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`${nth}を上へ`}>
          ↑ 上へ
        </button>
        <button type="button" className="btn btn--small" onClick={() => onMove(1)} disabled={index >= count - 1} aria-label={`${nth}を下へ`}>
          ↓ 下へ
        </button>
        <button type="button" className="btn btn--small" onClick={onDuplicate} disabled={!canDuplicate}>
          複製
        </button>
        <span className="ed-row__spacer" />
        <button type="button" className="btn btn--small btn--danger" onClick={onRemove}>
          削除
        </button>
      </div>
    </RowShell>
  );
}

// ---------------------------------------------------------------- デメリット

interface DrawbackRowProps {
  index: number;
  drawback: DrawbackInstance;
  card: CardDef;
  violations: Violation[];
  expanded: boolean;
  onToggle: () => void;
  onChange: (d: DrawbackInstance) => void;
  onRemove: () => void;
  autoFocus?: boolean;
}

export function DrawbackRow({ index, drawback, card, violations, expanded, onToggle, onChange, onRemove, autoFocus }: DrawbackRowProps) {
  const base = cardBase(card);
  const def = getDrawback(drawback.id);
  const p = drawbackPoints(drawback, card);
  const has = (suffix: string) => violations.some((v) => v.path?.endsWith(suffix));
  const firstRef = useRef<HTMLDivElement>(null);
  const nth = `${index + 1}番目のデメリット`;

  useEffect(() => {
    if (!autoFocus || !expanded) return;
    firstRef.current?.querySelector<HTMLElement>('input, select, button')?.focus({ preventScroll: true });
  }, [autoFocus, expanded]);

  const step = def?.value ? stepOf(def.value) : 1;
  const chips: ReactNode[] = [
    <span key="t" className="ed-chip">
      {def?.fixed ? '固定（タイミングなし）' : (TIMINGS[drawback.timing ?? 'play']?.label ?? '')}
    </span>,
  ];
  if (def?.monsterOnly) chips.push(<span key="m" className="ed-chip">モンスター専用</span>);

  return (
    <RowShell
      id={fieldId(`drawbacks.${index}`)}
      kind="drawback"
      invalid={violations.length > 0}
      expanded={expanded}
      onToggle={onToggle}
      icon="☠"
      title={`${def?.name ?? drawback.id}${def?.value ? ` ${drawback.value ?? 0}` : ''}`}
      chips={chips}
      pts={`−${p.value}pt`}
      hint={drawbackHint(drawback, card)}
      index={index}
    >
      {def && <p className="ed-row__summary">{def.summary}</p>}
      <div className="ed-row__params" ref={firstRef}>
        {def?.value && (
          <Stepper
            label={def.value.label}
            value={drawback.value}
            min={def.value.min}
            max={def.value.max}
            step={step}
            snap={step > 1}
            invalid={has('.value')}
            onChange={(v) => onChange({ ...drawback, value: v })}
          />
        )}
        {def && !def.fixed && (
          <OptionPicker
            label="タイミング"
            title={`${nth}のタイミング`}
            value={drawback.timing ?? ''}
            options={drawbackTimingOptions(drawback, card)}
            onChange={(t) => onChange(fitDrawback({ ...drawback, timing: t as TimingId }, base))}
            id={fieldId(`drawbacks.${index}.timing`)}
            invalid={has('.timing')}
          />
        )}
        {def?.fixed && <p className="hint">固定 −{p.value}pt（タイミングなし）</p>}
      </div>
      <p className="ed-row__text ed-row__text--drawback">{describeDrawback(drawback)}</p>
      {p.factors.some((f) => f.value !== 1) && (
        <p className="ed-row__formula">
          {p.formula} = <b>−{p.value}pt</b>
        </p>
      )}
      <Violations items={violations} />
      <div className="ed-row__actions">
        <span className="ed-row__spacer" />
        <button type="button" className="btn btn--small btn--danger" onClick={onRemove}>
          削除
        </button>
      </div>
    </RowShell>
  );
}
