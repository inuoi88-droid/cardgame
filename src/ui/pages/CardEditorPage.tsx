/** カードエディター */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BALANCE,
  EFFECT_GROUPS,
  RARITIES,
  RARITY_LABEL,
  analyzeCard,
  availableDrawbacks,
  availableEffects,
  createDrawback,
  createEffect,
  isNameTaken,
  listKeywords,
  newCard,
  setMonster,
  type CardDef,
  type KeywordDef,
  type Stats,
  type Violation,
} from '../../engine/index.ts';
import { CardView } from '../components/CardView.tsx';
import { Stepper, Violations } from '../components/controls.tsx';
import { DrawbackRow, EffectRow } from '../components/EffectRow.tsx';
import { EmojiPicker } from '../components/EmojiPicker.tsx';
import { PointPanel } from '../components/PointPanel.tsx';
import { navigate } from '../router.ts';
import { NEW_DRAFT, actions, cardDrafts, useStore } from '../store.ts';
import { cx, uuid } from '../util.ts';

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function CardEditorPage({ id }: { id: string | null }) {
  const { cards } = useStore();
  const saved = id ? (cards.find((c) => c.id === id) ?? null) : null;
  if (id && !saved) {
    return (
      <div className="panel">
        <p>カードが見つかりませんでした（削除された可能性があります）。</p>
        <button type="button" className="btn" onClick={() => navigate('/cards')}>
          カード一覧へ
        </button>
      </div>
    );
  }
  return <Editor key={id ?? NEW_DRAFT} saved={saved} />;
}

function Editor({ saved }: { saved: CardDef | null }) {
  const { cards } = useStore();
  const draftKey = saved?.id ?? NEW_DRAFT;
  const [restored] = useState(() => {
    const d = cardDrafts.get(draftKey);
    return d && !sameJson(d, saved) ? d : null;
  });
  const [card, setCard] = useState<CardDef>(() => restored ?? saved ?? newCard(uuid()));
  const [draftNotice, setDraftNotice] = useState(restored !== null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pointsRef = useRef<HTMLDivElement>(null);

  // 保存していない編集内容は下書きとして残す
  useEffect(() => {
    const pristine = saved ? sameJson(card, saved) : sameJson(card, newCard(card.id));
    if (pristine) cardDrafts.clear(draftKey);
    else cardDrafts.set(draftKey, card);
  }, [card, saved, draftKey]);

  const analysis = useMemo(() => analyzeCard(card), [card]);
  const nameTaken = card.name.trim() !== '' && isNameTaken(cards, card.name, card.id);
  const extra: Violation[] = nameTaken
    ? [{ code: 'NAME_TAKEN', path: 'name', message: `「${card.name.trim()}」という名前のカードはすでにあります` }]
    : [];
  const canSave = analysis.valid && !nameTaken;
  const dirty = !saved || !sameJson(card, saved);

  const update = (patch: Partial<CardDef>) => setCard((c) => ({ ...c, ...patch }));
  const pathViolations = (prefix: string) =>
    analysis.violations.filter((v) => v.path === prefix || v.path?.startsWith(`${prefix}.`));
  const exactViolations = (path: string) => analysis.violations.filter((v) => v.path === path);

  const save = () => {
    if (!canSave) return;
    actions.saveCard({ ...card, name: card.name.trim() });
    cardDrafts.clear(draftKey);
    navigate('/cards');
  };
  const discardDraft = () => {
    cardDrafts.clear(draftKey);
    setCard(saved ?? newCard(uuid()));
    setDraftNotice(false);
  };

  const base = analysis.base;
  const maxEffects = BALANCE.rarity[card.rarity].maxEffects;
  const addableDrawbacks = availableDrawbacks(card);
  const p = analysis.points;

  return (
    <>
      <div className="page-head">
        <h1>{saved ? 'カードを編集' : '新しいカード'}</h1>
      </div>
      {draftNotice && (
        <div className="notice">
          保存していない編集内容（下書き）を復元しました。
          <button type="button" className="btn btn--small" onClick={discardDraft}>
            下書きを捨てる
          </button>
        </div>
      )}

      <div className="editor">
        <aside className="editor__side">
          <div className="editor__preview">
            <CardView card={card} analysis={analysis} />
          </div>
          <div ref={pointsRef}>
            <PointPanel analysis={analysis} rarity={card.rarity} extraViolations={extra} />
          </div>
        </aside>

        <div className="editor__form">
          <section className="panel">
            <h2>基本</h2>
            <label className={cx('field', (pathViolations('name').length > 0 || nameTaken) && 'field--invalid')}>
              <span>カード名</span>
              <input
                type="text"
                value={card.name}
                placeholder="例：火の粉"
                onChange={(e) => update({ name: e.target.value })}
              />
              <small className="field__count">
                {[...card.name.trim()].length} / {BALANCE.card.nameMaxLength}
              </small>
            </label>
            <div className="field">
              <span>アイコン</span>
              <button type="button" className="icon-btn" onClick={() => setPickerOpen(true)} aria-label="アイコンを選ぶ">
                {card.icon}
              </button>
            </div>
            <div className="field">
              <span>レアリティ</span>
              <div className="seg">
                {RARITIES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={cx('seg__btn', `seg__btn--${r}`, r === card.rarity && 'is-active')}
                    onClick={() => update({ rarity: r })}
                    aria-pressed={r === card.rarity}
                  >
                    {RARITY_LABEL[r]}
                    <small>上限{BALANCE.rarity[r].cap}pt</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <Stepper
                label="コスト"
                value={card.cost}
                min={BALANCE.card.costMin}
                max={BALANCE.card.costMax}
                invalid={exactViolations('cost').length > 0}
                onChange={(cost) => update({ cost })}
              />
              <small className="hint">コスト1につき −{BALANCE.card.pointsPerCost}pt</small>
            </div>
          </section>

          <section className="panel">
            <h2>モンスター</h2>
            <label className="switch">
              <input type="checkbox" checked={card.stats !== null} onChange={(e) => setCard((c) => setMonster(c, e.target.checked))} />
              <span>モンスターにする（ステータスを持ち、場に召喚する）</span>
            </label>
            {card.stats && <MonsterFields card={card} stats={card.stats} setCard={setCard} violations={analysis.violations} />}
          </section>

          <section className="panel">
            <h2>
              効果{' '}
              <small>
                {card.effects.length} / {maxEffects}
              </small>
            </h2>
            <Violations items={exactViolations('effects')} />
            {card.effects.map((e, i) => (
              <EffectRow
                key={i}
                effect={e}
                card={card}
                violations={pathViolations(`effects.${i}`)}
                onChange={(next) => update({ effects: card.effects.map((x, j) => (j === i ? next : x)) })}
                onRemove={() => update({ effects: card.effects.filter((_, j) => j !== i) })}
              />
            ))}
            <select
              className="add-select"
              value=""
              disabled={card.effects.length >= maxEffects}
              onChange={(e) => e.target.value && update({ effects: [...card.effects, createEffect(e.target.value, base)] })}
              aria-label="効果を追加"
            >
              <option value="">{card.effects.length >= maxEffects ? `効果は${maxEffects}つまでです` : '＋ 効果を追加…'}</option>
              {EFFECT_GROUPS.map((g) => (
                <optgroup key={g.id} label={g.label}>
                  {availableEffects(card.rarity)
                    .filter((d) => d.group === g.id)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </section>

          <section className="panel panel--drawback">
            <h2>デメリット（呪い）</h2>
            <p className="hint">
              デメリットを1つでも付けると呪いカードになります。呪いカードはデッキの枚数制限がありませんが、デメリットの合計が上限（
              {BALANCE.rarity[card.rarity].cap}pt）以上必要です。同じデメリットは1回までです。
            </p>
            {card.drawbacks.map((d, i) => (
              <DrawbackRow
                key={i}
                drawback={d}
                card={card}
                violations={pathViolations(`drawbacks.${i}`)}
                onChange={(next) => update({ drawbacks: card.drawbacks.map((x, j) => (j === i ? next : x)) })}
                onRemove={() => update({ drawbacks: card.drawbacks.filter((_, j) => j !== i) })}
              />
            ))}
            <select
              className="add-select"
              value=""
              disabled={addableDrawbacks.length === 0}
              onChange={(e) => e.target.value && update({ drawbacks: [...card.drawbacks, createDrawback(e.target.value, base)] })}
              aria-label="デメリットを追加"
            >
              <option value="">＋ デメリットを追加…</option>
              {addableDrawbacks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </section>
        </div>
      </div>

      <div className="savebar">
        <button
          type="button"
          className={cx('savebar__pts', p.remaining < 0 && 'is-over')}
          onClick={() => pointsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          title="内訳を見る"
        >
          <b>{p.total}</b> / {p.cap}pt
          <small>{p.remaining < 0 ? `${-p.remaining}pt超過` : `残り${p.remaining}pt`}</small>
        </button>
        <span className={cx('savebar__status', !canSave && 'is-ng')}>
          {canSave ? (dirty ? '保存できます' : '保存済み') : `保存できません（理由${analysis.violations.length + extra.length}件）`}
        </span>
        <button type="button" className="btn" onClick={() => navigate('/cards')}>
          一覧へ
        </button>
        <button type="button" className="btn btn--primary" disabled={!canSave || !dirty} onClick={save}>
          保存
        </button>
      </div>

      {pickerOpen && <EmojiPicker value={card.icon} onSelect={(icon) => update({ icon })} onClose={() => setPickerOpen(false)} />}
    </>
  );
}

interface MonsterFieldsProps {
  card: CardDef;
  stats: Stats;
  setCard: (f: (c: CardDef) => CardDef) => void;
  violations: Violation[];
}

function MonsterFields({ card, stats, setCard, violations }: MonsterFieldsProps) {
  const S = BALANCE.stats;
  const setStats = (patch: Partial<Stats>) => setCard((c) => ({ ...c, stats: { ...stats, ...patch } }));
  const bad = (path: string) => violations.some((v) => v.path === path);
  const toggleKeyword = (def: KeywordDef) =>
    setCard((c) => ({
      ...c,
      keywords: c.keywords.some((k) => k.id === def.id)
        ? c.keywords.filter((k) => k.id !== def.id)
        : [...c.keywords, def.value ? { id: def.id, value: def.value.default } : { id: def.id }],
    }));

  return (
    <>
      <div className="stats-grid">
        <Stepper label={`攻撃力（${S.attackPoints}pt）`} value={stats.attack} min={S.attackMin} max={S.attackMax} invalid={bad('stats.attack')} onChange={(attack) => setStats({ attack })} />
        <Stepper label={`体力（${S.hpPoints}pt）`} value={stats.hp} min={S.hpMin} max={S.hpMax} invalid={bad('stats.hp')} onChange={(hp) => setStats({ hp })} />
        <Stepper label={`守備力（${S.defensePoints}pt）`} value={stats.defense} min={S.defenseMin} max={S.defenseMax} invalid={bad('stats.defense')} onChange={(defense) => setStats({ defense })} />
      </div>
      <h3>キーワード</h3>
      <div className="kw-grid">
        {listKeywords().map((def) => {
          const inst = card.keywords.find((k) => k.id === def.id);
          const preview = inst ?? (def.value ? { id: def.id, value: def.value.default } : { id: def.id });
          return (
            <div key={def.id} className={cx('kw-item', inst && 'is-on')}>
              <label className="check">
                <input type="checkbox" checked={inst !== undefined} onChange={() => toggleKeyword(def)} />
                <b>{def.name}</b>
                <small>{def.points(preview, stats)}pt</small>
              </label>
              {inst && def.value && (
                <Stepper
                  label={def.value.label}
                  value={inst.value}
                  min={def.value.min}
                  max={def.value.max}
                  onChange={(value) =>
                    setCard((c) => ({ ...c, keywords: c.keywords.map((k) => (k.id === def.id ? { ...k, value } : k)) }))
                  }
                />
              )}
              <p className="hint">{def.summary}</p>
            </div>
          );
        })}
      </div>
    </>
  );
}
