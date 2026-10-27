/**
 * カードエディター。
 * スマホ：上部に固定のミニプレビュー（予算メーター付き）→ 基本・種類・効果・デメリットのフォーム → 保存バー。内訳はシート。
 * PC：左にフォーム、右に等倍プレビューと内訳（固定）。
 * 検証は入力欄の直下に出し、「理由を見る」で最初の違反へ飛ぶ。未保存で離れるときと、モンスターをやめるときは確認する。
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  BALANCE,
  CARD_DESCRIPTION_MAX,
  CARD_TYPE_LABEL,
  CURSE_LABEL,
  RARITIES,
  RARITY_LABEL,
  analyzeCard,
  abilityChoices,
  availableDrawbacks,
  cardBase,
  createAbility,
  setAbilities as setCardAbilities,
  getAbility,
  createDrawback,
  createEffect,
  descriptionLength,
  describeAbility,
  getDrawback,
  getKeyword,
  isNameTaken,
  newCard,
  keywordStats,
  normalizeDescription,
  setMonster,
  setTribe,
  type CardDef,
  type ConditionId,
  type DrawbackInstance,
  type EffectInstance,
  type Violation,
} from '../../engine/index.ts';
import '../editor.css';
import '../editor/extras.css';
import { CardView } from '../components/CardView.tsx';
import { useConfirm } from '../components/ConfirmDialog.tsx';
import { Stepper, Violations } from '../components/controls.tsx';
import { useIsPhone } from '../components/dialogUtil.ts';
import { DrawbackRow, EffectRow } from '../components/EffectRow.tsx';
import { CardArt } from '../components/CardArt.tsx';
import { CostGem, frameClasses, RarityGem, StatMini } from '../components/cardParts.tsx';
import { iconLabel } from '../icons/ref.ts';
import { PointPanel } from '../components/PointPanel.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { useToast } from '../components/Toast.tsx';
import { budgetOf } from '../editor/budget.ts';
import { EffectPicker, type PickerMode } from '../editor/EffectPicker.tsx';
import { MiniPreview } from '../editor/MiniPreview.tsx';
import { OptionPicker } from '../editor/OptionPicker.tsx';
import { abilityConditionOptions, abilityOptionOptions, tribeFromValue, tribeOptions, tribeValue } from '../editor/pickOptions.ts';
import { TEMPLATES, type CardTemplate } from '../editor/templates.ts';
import { effectRowViolations, effectSectionViolations, fieldId, findFieldElement, violationsAt, violationsExactly } from '../editor/validation.ts';
import { navigate, setNavigationGuard } from '../router.ts';
import { NEW_DRAFT, actions, cardDrafts, useStore } from '../store.ts';
import { cx, uuid, stepOf } from '../util.ts';
import { UiIcon } from '../components/UiIcon.tsx';
import { FeedbackButton, FeedbackSheet } from '../feedback/FeedbackSheet.tsx';
import { EffectIcon } from '../editor/EffectIcon.tsx';

/** カードの絵の選択パネル（検索の辞書・分類を含むので、開くときに読む。決定事項 #105） */
const IconPicker = lazy(() => import('../components/IconPicker.tsx').then((m) => ({ default: m.IconPicker })));

/** 比べるときの形：説明は空白や空欄の違いを無視し、項目の順番にも左右されないように別に並べる */
const comparable = (c: CardDef | null) => {
  if (!c) return 'null';
  const { description, ...rest } = c;
  return JSON.stringify([rest, normalizeDescription(description) ?? null]);
};
const sameCard = (a: CardDef | null, b: CardDef | null) => comparable(a) === comparable(b);

let keySeq = 0;
const genKey = () => `r${++keySeq}`;
const keysFor = (n: number) => Array.from({ length: n }, genKey);

/** 配列の i と i+dir を入れ替える */
function swap<T>(xs: readonly T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= xs.length) return [...xs];
  const out = [...xs];
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
}

function insertAt<T>(xs: readonly T[], i: number, x: T): T[] {
  const at = Math.max(0, Math.min(xs.length, i));
  return [...xs.slice(0, at), x, ...xs.slice(at)];
}

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
  const toast = useToast();
  const confirm = useConfirm();
  const phone = useIsPhone(919);
  const draftKey = saved?.id ?? NEW_DRAFT;
  const [restored] = useState(() => {
    const d = cardDrafts.get(draftKey);
    return d && !sameCard(d, saved) ? d : null;
  });
  const [card, setCard] = useState<CardDef>(() => restored ?? saved ?? newCard(uuid()));
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [effectKeys, setEffectKeys] = useState<string[]>(() => keysFor(card.effects.length));
  const [drawbackKeys, setDrawbackKeys] = useState<string[]>(() => keysFor(card.drawbacks.length));
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState(restored !== null);
  const [touchedName, setTouchedName] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [picker, setPicker] = useState<PickerMode | null>(null);
  const [sheet, setSheet] = useState<'preview' | 'templates' | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [flash, setFlash] = useState(false);
  const [pendingJump, setPendingJump] = useState<string | null>(null);
  const [topOffset, setTopOffset] = useState(0);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 行のキー（並べ替え・複製・削除で動く）。数が合わなくなったら作り直す
  const eKeys = effectKeys.length === card.effects.length ? effectKeys : card.effects.map((_, i) => effectKeys[i] ?? `e${i}`);
  const dKeys = drawbackKeys.length === card.drawbacks.length ? drawbackKeys : card.drawbacks.map((_, i) => drawbackKeys[i] ?? `d${i}`);

  // 保存していない編集内容は下書きとして残す
  useEffect(() => {
    const pristine = saved ? sameCard(card, saved) : sameCard(card, newCard(card.id));
    if (pristine) cardDrafts.clear(draftKey);
    else cardDrafts.set(draftKey, card);
  }, [card, saved, draftKey]);

  // スマホのミニプレビューを、上部メニューのすぐ下に固定する
  useEffect(() => {
    const bar = document.querySelector('.topbar');
    if (!bar) return;
    const update = () => setTopOffset(Math.round(bar.getBoundingClientRect().height));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  const analysis = useMemo(() => analyzeCard(card), [card]);
  const budget = useMemo(() => budgetOf(analysis, card), [analysis, card]);
  const base = cardBase(card);
  const nameTaken = card.name.trim() !== '' && isNameTaken(cards, card.name, card.id);
  const descLength = descriptionLength(card.description ?? '');
  const descOver = descLength > CARD_DESCRIPTION_MAX;
  const extra: Violation[] = [
    ...(nameTaken ? [{ code: 'NAME_TAKEN', path: 'name', message: `「${card.name.trim()}」という名前のカードはすでにあります` }] : []),
    ...(descOver ? [{ code: 'DESCRIPTION_TOO_LONG', path: 'description', message: `説明は${CARD_DESCRIPTION_MAX}文字までです（いま${descLength}文字）` }] : []),
  ];
  const allViolations = [...analysis.violations, ...extra];
  const canSave = allViolations.length === 0;
  const dirty = !saved || !sameCard(card, saved);
  const pristine = !saved && sameCard(card, newCard(card.id));
  const showProblems = attempted || !pristine;
  const shownViolations = showProblems ? allViolations : [];
  const maxEffects = BALANCE.rarity[card.rarity].maxEffects;

  // 未保存のまま他の画面へ移ろうとしたら確認する（何も触っていない新しいカードは確認しない）
  useEffect(() => {
    if (!dirty || pristine) {
      setNavigationGuard(null);
      return;
    }
    setNavigationGuard(() =>
      confirm({
        title: '保存していない変更があります',
        message: '編集の内容は下書きとして残り、次に開いたときに復元できます。このまま移動しますか？',
        okLabel: '移動する',
        cancelLabel: '編集を続ける',
      }),
    );
    return () => setNavigationGuard(null);
  }, [dirty, pristine, confirm]);

  // 追加した行・違反の欄へスクロールしてフォーカス
  useEffect(() => {
    if (!pendingJump) return;
    const el = findFieldElement(pendingJump);
    setPendingJump(null);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const target = el.matches('input, select, textarea, button, [tabindex]') ? el : (el.querySelector<HTMLElement>('input, select, textarea, button, [tabindex]') ?? el);
    if (!target.hasAttribute('tabindex') && !target.matches('input, select, textarea, button')) target.tabIndex = -1;
    target.focus({ preventScroll: true });
  }, [pendingJump]);

  useEffect(() => {
    if (!focusKey) return;
    const i = eKeys.indexOf(focusKey);
    const j = dKeys.indexOf(focusKey);
    const path = i >= 0 ? `effects.${i}` : j >= 0 ? `drawbacks.${j}` : null;
    if (path) findFieldElement(path)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const t = setTimeout(() => setFocusKey(null), 400);
    return () => clearTimeout(t);
  }, [focusKey, eKeys, dKeys]);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  const update = (patch: Partial<CardDef>) => setCard((c) => ({ ...c, ...patch }));
  const flashMeter = () => {
    setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 1400);
  };
  const expand = (key: string, on = true) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  /** 違反の欄へ飛ぶ（折りたたんだ行は開く） */
  const jump = (path: string) => {
    setAttempted(true);
    setSheet(null);
    setPicker(null);
    if (path === 'points') {
      if (phone) window.scrollTo({ top: 0, behavior: 'smooth' });
      else document.getElementById('ed-meter')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      flashMeter();
      return;
    }
    const m = /^(effects|drawbacks)\.(\d+)/.exec(path);
    if (m) {
      const key = (m[1] === 'effects' ? eKeys : dKeys)[Number(m[2])];
      if (key) expand(key);
    }
    setPendingJump(path);
  };
  const showReasons = () => {
    const first = allViolations[0];
    if (first) jump(first.path ?? 'points');
  };

  // ---------------------------------------------------------------- 保存・移動
  const save = () => {
    if (!canSave) {
      setAttempted(true);
      showReasons();
      return;
    }
    const name = card.name.trim();
    const description = normalizeDescription(card.description);
    const out: CardDef = { ...card, name };
    if (description) out.description = description;
    else delete out.description;
    setNavigationGuard(null);
    actions.saveCard(out);
    cardDrafts.clear(draftKey);
    toast({ text: `「${name}」を保存しました`, kind: 'ok' });
    navigate('/cards');
  };
  const leave = async () => {
    if (dirty) {
      const ok = await confirm({
        title: '保存していない変更があります',
        message: '編集の内容は下書きとして残り、次に開いたときに復元できます。一覧へ戻りますか？',
        okLabel: '保存せずに戻る',
        cancelLabel: '編集を続ける',
      });
      if (!ok) return;
    }
    setNavigationGuard(null);
    navigate('/cards');
  };
  const replaceCard = (next: CardDef) => {
    setCard(next);
    setEffectKeys(keysFor(next.effects.length));
    setDrawbackKeys(keysFor(next.drawbacks.length));
    setExpanded(new Set());
  };
  const discardDraft = () => {
    cardDrafts.clear(draftKey);
    replaceCard(saved ?? newCard(uuid()));
    setDraftNotice(false);
  };
  const applyTemplate = async (t: CardTemplate) => {
    if (!pristine) {
      const ok = await confirm({ title: 'いまの内容を置き換えますか？', message: `編集中の内容はテンプレート「${t.title}」で上書きされます。`, okLabel: '置き換える', danger: true });
      if (!ok) return;
    }
    replaceCard(t.build(card.id));
    setSheet(null);
    toast({ text: `テンプレート「${t.title}」を読み込みました。名前や数値を変えて自分のカードにしましょう`, kind: 'ok' });
  };

  // ---------------------------------------------------------------- 効果の行
  const setEffects = (effects: EffectInstance[], keys: string[]) => {
    setCard((c) => ({ ...c, effects }));
    setEffectKeys(keys);
  };
  const addEffect = (id: string) => {
    const key = genKey();
    setEffects([...card.effects, createEffect(id, base, card.abilities, card.effects)], [...eKeys, key]);
    setExpanded(new Set([key])); // 追加・複製した行だけを開き、ほかは要約にたたむ
    setFocusKey(key);
  };
  const removeEffect = (i: number) => {
    const removed = card.effects[i]!;
    const name = analysis.points.lines.find((l) => l.kind === 'effect' && l.index === i)?.label ?? '効果';
    setEffects(
      card.effects.filter((_, j) => j !== i),
      eKeys.filter((_, j) => j !== i),
    );
    toast({
      text: `「${name}」を外しました`,
      kind: 'info',
      action: {
        label: '元に戻す',
        onClick: () => {
          const key = genKey();
          setCard((c) => ({ ...c, effects: insertAt(c.effects, i, removed) }));
          setEffectKeys((ks) => insertAt(ks, i, key));
        },
      },
    });
  };
  const moveEffect = (i: number, dir: -1 | 1) => setEffects(swap(card.effects, i, dir), swap(eKeys, i, dir));
  const duplicateEffect = (i: number) => {
    const key = genKey();
    setEffects(insertAt(card.effects, i + 1, { ...card.effects[i]! }), insertAt(eKeys, i + 1, key));
    setExpanded(new Set([key])); // 追加・複製した行だけを開き、ほかは要約にたたむ
    setFocusKey(key);
  };

  // ---------------------------------------------------------------- デメリットの行
  const setDrawbacks = (drawbacks: DrawbackInstance[], keys: string[]) => {
    setCard((c) => ({ ...c, drawbacks }));
    setDrawbackKeys(keys);
  };
  const addDrawback = (id: string) => {
    const key = genKey();
    setDrawbacks([...card.drawbacks, createDrawback(id, base)], [...dKeys, key]);
    setExpanded(new Set([key])); // 追加・複製した行だけを開き、ほかは要約にたたむ
    setFocusKey(key);
  };
  const removeDrawback = (i: number) => {
    const removed = card.drawbacks[i]!;
    const name = getDrawback(removed.id)?.name ?? 'デメリット';
    setDrawbacks(
      card.drawbacks.filter((_, j) => j !== i),
      dKeys.filter((_, j) => j !== i),
    );
    toast({
      text: `「${name}」を外しました`,
      kind: 'info',
      action: {
        label: '元に戻す',
        onClick: () => {
          const key = genKey();
          setCard((c) => ({ ...c, drawbacks: insertAt(c.drawbacks, i, removed) }));
          setDrawbackKeys((ks) => insertAt(ks, i, key));
        },
      },
    });
  };

  // ---------------------------------------------------------------- カードの能力（MTG 要素 ○ バッチB）
  const abilities = card.abilities ?? [];
  // 能力が変わったら、能力が要るタイミング・条件（起動・魂力・捨て札から使ったとき・キッカー）の効果を合わせ直す（MTG 要素 ○ バッチC1）
  const setAbilities = (next: typeof abilities) => setCard((c) => setCardAbilities(c, next));
  const addAbility = (id: string) => setAbilities([...abilities, createAbility(id)]);
  const removeAbility = (i: number) => {
    const name = getAbility(abilities[i]!.id)?.name ?? '能力';
    setAbilities(abilities.filter((_, j) => j !== i));
    toast({ text: `「${name}」を外しました`, kind: 'info' });
  };
  const abilityAddable = abilityChoices(card).some((x) => x.blocked === null);

  // ---------------------------------------------------------------- モンスター・キーワード
  const toggleMonster = async (on: boolean) => {
    if (!on) {
      const kws = card.keywords.map((k) => getKeyword(k.id)?.name ?? k.id);
      const dbs = card.drawbacks.filter((d) => getDrawback(d.id)?.monsterOnly).map((d) => getDrawback(d.id)?.name ?? d.id);
      if (kws.length > 0 || dbs.length > 0) {
        const parts = [kws.length > 0 && `キーワード：${kws.join('、')}`, dbs.length > 0 && `デメリット：${dbs.join('、')}`].filter(Boolean).join('\n');
        const ok = await confirm({
          title: 'モンスターをやめますか？',
          message: `モンスター専用のものが外れます。\n${parts}`,
          okLabel: '外してやめる',
          danger: true,
        });
        if (!ok) return;
        setDrawbackKeys((ks) => ks.filter((_, i) => !getDrawback(card.drawbacks[i]?.id ?? '')?.monsterOnly));
      }
    }
    setCard((c) => setMonster(c, on));
  };
  const toggleKeyword = (id: string) => {
    const def = getKeyword(id);
    if (!def) return;
    setCard((c) => ({
      ...c,
      keywords: c.keywords.some((k) => k.id === id) ? c.keywords.filter((k) => k.id !== id) : [...c.keywords, def.value ? { id, value: def.value.default } : { id }],
    }));
  };

  const templateCards = useMemo(
    () =>
      TEMPLATES.map((t) => {
        const c = t.build(`tpl-${t.id}`);
        return { t, card: c, a: analyzeCard(c) };
      }),
    [],
  );
  const S = BALANCE.stats;
  const nameViolations = violationsExactly(allViolations, 'name');
  const showNameError = (touchedName || attempted) && nameViolations.length > 0;
  const sectionViolations = effectSectionViolations(analysis.violations);
  const curseOk = budget.drawbackTotal >= budget.curseNeed;
  const addable = availableDrawbacks(card);

  const panel = (detailsOpen: boolean) => (
    <PointPanel card={card} analysis={analysis} budget={budget} violations={shownViolations} onJump={jump} detailsOpen={detailsOpen} meterId="ed-meter" flash={flash} />
  );

  return (
    <div className="ed">
      <div className="page-head">
        <h1>{saved ? 'カードを編集' : '新しいカード'}</h1>
        {!saved && (
          <button type="button" className="btn btn--secondary" onClick={() => setSheet('templates')}>
            <UiIcon name="spell-book" />
            テンプレートから作る
          </button>
        )}
        {/* 報告・要望（決定事項 #129）：作っているカード（ポイントの付き方が強すぎ・弱すぎなど）を最初から選んでおく */}
        <FeedbackButton className="btn--small btn--ghost" onClick={() => setFeedbackOpen(true)} />
      </div>
      {feedbackOpen && (
        <FeedbackSheet
          source="editor"
          onClose={() => setFeedbackOpen(false)}
          cards={[card]}
          preselect={[card.id]}
          context={() => ({ v: 1, editor: { cardId: card.id, saved: !!saved } })}
          contextLabel="作っているカードの情報を添える"
        />
      )}
      {draftNotice && (
        <div className="notice">
          保存していない編集内容（下書き）を復元しました。
          <button type="button" className="btn btn--small" onClick={discardDraft}>
            下書きを捨てる
          </button>
        </div>
      )}

      <div className="ed-sticky" style={{ top: topOffset }}>
        <MiniPreview card={card} analysis={analysis} budget={budget} invalidCount={shownViolations.length} flash={flash} onOpen={() => setSheet('preview')} />
      </div>

      <div className="ed-layout">
        <div className="ed-form">
          {/* ---------------------------------------------------------------- 基本 */}
          <section className="panel ed-section">
            <div className="ed-section__head">
              <span className="u-hex ed-step" aria-hidden="true">
                1
              </span>
              <h2>基本</h2>
            </div>
            <div className="ed-basic">
              <label className={cx('field ed-name', showNameError && 'field--invalid')} id={fieldId('name')}>
                <span>カード名</span>
                <input
                  type="text"
                  value={card.name}
                  placeholder="例：火の粉"
                  maxLength={BALANCE.card.nameMaxLength * 2}
                  aria-invalid={showNameError || undefined}
                  aria-describedby={showNameError ? 'ed-name-error' : undefined}
                  onChange={(e) => update({ name: e.target.value })}
                  onBlur={() => setTouchedName(true)}
                />
                <small className="field__count">
                  {[...card.name.trim()].length} / {BALANCE.card.nameMaxLength}
                </small>
                {showNameError && (
                  <span className="field__error" id="ed-name-error">
                    {nameViolations[0]!.message}
                  </span>
                )}
              </label>
              <div className="field ed-icon" id={fieldId('icon')}>
                <span>アイコン</span>
                <button type="button" className="icon-btn" onClick={() => setEmojiOpen(true)} aria-label={`アイコンを選ぶ（いま ${iconLabel(card.icon)}）`}>
                  <CardArt icon={card.icon} rarity={card.rarity} cardType={analysis.cardType} curse={analysis.isCurse} size={56} />
                </button>
              </div>
            </div>
            <label className={cx('field ed-desc', descOver && 'field--invalid')} id={fieldId('description')}>
              <span>説明（任意）</span>
              <textarea
                value={card.description ?? ''}
                rows={2}
                placeholder="例：序盤に出して毒をためる。フレーバーや使い方のメモをどうぞ"
                maxLength={CARD_DESCRIPTION_MAX * 2}
                aria-invalid={descOver || undefined}
                aria-describedby="ed-desc-count"
                onChange={(e) => update({ description: e.target.value })}
              />
              <small className={cx('field__count', descOver && 'text-ng')} id="ed-desc-count">
                {descLength} / {CARD_DESCRIPTION_MAX}
              </small>
              {descOver && <span className="field__error">説明は{CARD_DESCRIPTION_MAX}文字までです。{descLength - CARD_DESCRIPTION_MAX}文字減らしてください</span>}
              <small className="field__help">カードの下に小さく表示されます。ポイントやルールには影響しません</small>
            </label>
            <div className="field" id={fieldId('rarity')}>
              <span>レアリティ（基本の予算が決まります）</span>
              <div className="seg ed-rar" role="radiogroup" aria-label="レアリティ">
                {RARITIES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    className={cx('seg__btn', `seg__btn--${r}`, r === card.rarity && 'is-active')}
                    onClick={() => update({ rarity: r })}
                    aria-checked={r === card.rarity}
                    tabIndex={r === card.rarity ? 0 : -1}
                    onKeyDown={(e) => {
                      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
                      if (!d) return;
                      e.preventDefault();
                      const next = RARITIES[(RARITIES.indexOf(r) + d + RARITIES.length) % RARITIES.length]!;
                      update({ rarity: next });
                      (e.currentTarget.parentElement?.querySelector(`.seg__btn--${next}`) as HTMLElement | null)?.focus();
                    }}
                  >
                    <span className="ed-rar__gem" aria-hidden="true">
                      <RarityGem rarity={r} />
                    </span>
                    {RARITY_LABEL[r]}
                    <small>上限 {BALANCE.rarity[r].cap}</small>
                  </button>
                ))}
              </div>
            </div>
            {/* 種族（MTG 要素 ○ バッチC2）：同じ種族を参照する条件・修飾・対象・サーチに使う。ポイントは0 */}
            <OptionPicker
              className="ed-tribe"
              label="種族（任意）"
              title="種族"
              value={tribeValue(card.tribe)}
              options={tribeOptions()}
              onChange={(v) => setCard((c) => setTribe(c, tribeFromValue(v)))}
              id={fieldId('tribe')}
              invalid={violationsExactly(analysis.violations, 'tribe').length > 0}
              note="同じ種族を参照する条件・修飾・対象・サーチ（部族シナジー）に使います。ポイントは0"
            />
            <div className="ed-cost">
              <Stepper
                id={fieldId('cost')}
                label="コスト"
                value={card.cost}
                min={BALANCE.card.costMin}
                max={BALANCE.card.costMax}
                error={violationsExactly(analysis.violations, 'cost')[0]?.message}
                onChange={(cost) => update({ cost })}
              />
              <div className="ed-cost__bonus">
                <b>予算 +{budget.costBonus}</b>
                <ol className="ed-costscale" aria-label="コストごとに増える予算">
                  {BALANCE.card.costPoints.map((p, i) => (
                    <li key={i} className={cx(i === card.cost && 'is-on')} aria-current={i === card.cost ? 'true' : undefined}>
                      <span className="ed-costscale__gem" aria-label={`コスト${i}`}>
                        {i}
                      </span>
                      <b>+{p}</b>
                    </li>
                  ))}
                </ol>
                <small>
                  コストを上げると予算が増えます。コスト0は上限も −{BALANCE.card.cost0CapPenalty}
                </small>
              </div>
            </div>
          </section>

          {/* ---------------------------------------------------------------- 種類 */}
          <section className="panel ed-section">
            <div className="ed-section__head">
              <span className="u-hex ed-step" aria-hidden="true">
                2
              </span>
              <h2>種類</h2>
              <span className="ed-section__meta">{card.stats ? 'モンスター' : 'スキル・アタック・パワー（効果で決まる）'}</span>
            </div>
            <label className="switch">
              <input type="checkbox" checked={card.stats !== null} onChange={(e) => void toggleMonster(e.target.checked)} />
              <span>モンスターにする（ステータスを持ち、場に召喚して戦う）</span>
            </label>
            {card.stats && (
              <>
                <div className="stats-grid ed-stats">
                  <div className="ed-stat ed-stat--atk">
                    <svg className="ed-stat__sigil" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
                      <use href="#emb-atk-mini" />
                    </svg>
                    <Stepper
                      id={fieldId('stats.attack')}
                      label="攻撃力"
                      help={`+${BALANCE.scale} ごとに ${BALANCE.scale * S.attackPoints}pt`}
                      value={card.stats.attack}
                      min={S.attackMin}
                      max={S.attackMax}
                      step={BALANCE.scale}
                      snap
                      error={violationsExactly(analysis.violations, 'stats.attack')[0]?.message}
                      onChange={(attack) => setCard((c) => ({ ...c, stats: { ...c.stats!, attack } }))}
                    />
                  </div>
                  <div className="ed-stat ed-stat--hp">
                    <svg className="ed-stat__sigil" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
                      <use href="#emb-hp" />
                    </svg>
                    <Stepper
                      id={fieldId('stats.hp')}
                      label="体力"
                      help={`+${BALANCE.scale} ごとに ${BALANCE.scale * S.hpPoints}pt`}
                      value={card.stats.hp}
                      min={S.hpMin}
                      max={S.hpMax}
                      step={BALANCE.scale}
                      snap
                      error={violationsExactly(analysis.violations, 'stats.hp')[0]?.message}
                      onChange={(hp) => setCard((c) => ({ ...c, stats: { ...c.stats!, hp } }))}
                    />
                  </div>
                  <div className="ed-stat ed-stat--def">
                    <svg className="ed-stat__sigil" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
                      <use href="#emb-def" />
                    </svg>
                    <Stepper
                      id={fieldId('stats.defense')}
                      label="守備力"
                      help={`+${BALANCE.scale} ごとに ${BALANCE.scale * S.defensePoints}pt`}
                      value={card.stats.defense}
                      min={S.defenseMin}
                      max={S.defenseMax}
                      step={BALANCE.scale}
                      snap
                      error={violationsExactly(analysis.violations, 'stats.defense')[0]?.message}
                      onChange={(defense) => setCard((c) => ({ ...c, stats: { ...c.stats!, defense } }))}
                  />
                  </div>
                </div>
                <div className="ed-kws" id={fieldId('keywords')}>
                  <h3>
                    キーワード <small>{card.keywords.length}</small>
                  </h3>
                  {card.keywords.length > 0 && (
                    <ul className="ed-kw-list">
                      {card.keywords.map((k, i) => {
                        const def = getKeyword(k.id);
                        if (!def) return null;
                        const bad = violationsAt(analysis.violations, `keywords.${i}`);
                        return (
                          <li key={k.id} className={cx('ed-kw', bad.length > 0 && 'is-invalid')}>
                            <div className="ed-kw__head">
                              <EffectIcon kind="keyword" className="ed-kw__icon" />
                              <b>{def.displayName(k)}</b>
                              <span className="ed-kw__pts">{def.points(k, keywordStats(card))}pt</span>
                              <button type="button" className="btn btn--ghost btn--icon btn--small" onClick={() => toggleKeyword(k.id)} aria-label={`${def.name}を外す`}>
                                ✕
                              </button>
                            </div>
                            <p className="ed-kw__sum">{def.summary}</p>
                            {def.value && (
                              <Stepper
                                label={def.value.label}
                                value={k.value}
                                min={def.value.min}
                                max={def.value.max}
                                step={stepOf(def.value)}
                                snap={stepOf(def.value) > 1}
                                onChange={(value) => setCard((c) => ({ ...c, keywords: c.keywords.map((x) => (x.id === k.id ? { ...x, value } : x)) }))}
                              />
                            )}
                            {bad.length > 0 && <span className="field__error">{bad[0]!.message}</span>}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <button type="button" className="ed-add ed-add--small" onClick={() => setPicker('keyword')}>
                    <span className="ed-add__plus" aria-hidden="true">
                      ＋
                    </span>
                    キーワードを付ける
                  </button>
                </div>
              </>
            )}
          </section>

          {/* ---------------------------------------------------------------- 効果 */}
          <section className="panel ed-section" id={fieldId('effects')}>
            <div className="ed-section__head">
              <span className="u-hex ed-step" aria-hidden="true">
                3
              </span>
              <h2>
                効果{' '}
                <small>
                  {card.effects.length} / {maxEffects}
                </small>
              </h2>
              {card.effects.length > 1 && <span className="ed-section__meta">上から順に解決されます</span>}
            </div>
            {card.effects.map((e, i) => {
              const key = eKeys[i]!;
              return (
                <EffectRow
                  key={key}
                  index={i}
                  count={card.effects.length}
                  effect={e}
                  card={card}
                  violations={effectRowViolations(analysis.violations, card, i, maxEffects)}
                  expanded={expanded.has(key)}
                  onToggle={() => expand(key, !expanded.has(key))}
                  onChange={(next) => update({ effects: card.effects.map((x, j) => (j === i ? next : x)) })}
                  onRemove={() => removeEffect(i)}
                  onMove={(dir) => moveEffect(i, dir)}
                  onDuplicate={() => duplicateEffect(i)}
                  canDuplicate={card.effects.length < maxEffects}
                  autoFocus={focusKey === key}
                />
              );
            })}
            {sectionViolations.length > 0 && (
              <p className={cx(attempted ? 'field__error' : 'hint', 'ed-section__msg')}>{attempted ? sectionViolations[0]!.message : 'まず効果を1つ追加しましょう（モンスターなら効果なしでも作れます）'}</p>
            )}
            <button type="button" className="ed-add" onClick={() => setPicker('effect')} disabled={card.effects.length >= maxEffects}>
              {card.effects.length >= maxEffects ? (
                `${RARITY_LABEL[card.rarity]}の効果は${maxEffects}つまでです`
              ) : (
                <>
                  <span className="ed-add__plus" aria-hidden="true">
                    ＋
                  </span>
                  効果を追加
                </>
              )}
            </button>
          </section>

          {/* ---------------------------------------------------------------- カードの能力（MTG 要素 ○ バッチB） */}
          {(base === 'spell' || abilities.length > 0 || abilityAddable) && (
            <section className="panel ed-section" id={fieldId('abilities')}>
              <div className="ed-section__head">
                <span className="u-hex ed-step" aria-hidden="true">
                  ✦
                </span>
                <h2>
                  カードの能力{' '}
                  <small>
                    {abilities.length} / {BALANCE.card.maxAbilities}
                  </small>
                </h2>
              </div>
              <p className="hint">
                カード1枚に付く性質です。循環・再利用・反復・成長（アタック・スキル向け）、捨て札から使う（フラッシュバック・再活・脱出・回顧・調和・大混乱・一時蘇生）、起動、手札・捨て札の能力（サイクリング・魂力・予見・相続・発掘・不朽）、コストを変える（親和・条件付き軽減・召集・探査・血の支払い・代替コスト）、追加の支払い（キッカー・切除・奮励・分隊・試作・想起・超過・解鎖・現出・犠牲・協約・貪食）、モード選択のカードの双呪・放題・段階・最悪の二択、パワーの蓄積（プラン）・罠。追加の支払いは対戦でカードを場に落とすと「支払いのシート」で選びます。
              </p>
              {abilities.map((a, i) => {
                const def = getAbility(a.id);
                const line = analysis.points.lines.find((l) => l.kind === 'ability' && l.index === i);
                return (
                  <div key={`${a.id}-${i}`} className="ed-row ed-row--ability" id={fieldId(`abilities.${i}`)}>
                    <div className="ed-row__head">
                      <EffectIcon kind="ability" className="ed-row__icon" />
                      <b>{def ? def.displayName(a) : a.id}</b>
                      <span className="ed-row__pts">{line ? `${line.value}pt` : ''}</span>
                      <button type="button" className="btn btn--small btn--ghost" onClick={() => removeAbility(i)} aria-label={`${def?.name ?? a.id}を外す`}>
                        外す
                      </button>
                    </div>
                    {def && <p className="ed-row__summary">{def.summary}</p>}
                    {(def?.value || def?.option || def?.takesCondition || def?.onceOption) && (
                      <div className="ed-row__params">
                        {def.value && (
                          <Stepper
                            label={def.value.label}
                            value={a.value}
                            min={def.value.min}
                            max={def.value.max}
                            step={stepOf(def.value)}
                            snap={stepOf(def.value) > 1}
                            onChange={(v) => setAbilities(abilities.map((x, j) => (j === i ? { ...x, value: v } : x)))}
                          />
                        )}
                        {def.option && (
                          <OptionPicker
                            className="ed-row__option"
                            label={def.option.label}
                            title={`${def.name}の${def.option.label}`}
                            value={a.option ?? def.option.default}
                            options={abilityOptionOptions(a, card)}
                            onChange={(option) => setAbilities(abilities.map((x, j) => (j === i ? { ...x, option } : x)))}
                            id={fieldId(`abilities.${i}.option`)}
                          />
                        )}
                        {def.achieveCondition && (
                          // 事件・進化（MTG 要素 △ バッチC）：達成条件の選択パネル
                          <OptionPicker
                            className="ed-row__option"
                            label="達成条件（持ち主のターン終了時に判定）"
                            title={`${def.name}の達成条件`}
                            value={a.condition ?? ''}
                            options={abilityConditionOptions(a, card)}
                            onChange={(c) => setAbilities(abilities.map((x, j) => (j === i ? { ...x, condition: c as ConditionId } : x)))}
                            id={fieldId(`abilities.${i}.condition`)}
                            invalid={violationsAt(analysis.violations, `abilities.${i}.condition`).length > 0}
                          />
                        )}
                        {def.takesCondition && (
                          // 条件付き軽減（MTG 要素 ○ バッチC1）：条件の選択パネル（OptionPicker）を再利用
                          <OptionPicker
                            className="ed-row__option"
                            label="条件（満たすとコストが下がる）"
                            title={`${def.name}の条件`}
                            value={a.condition ?? ''}
                            options={abilityConditionOptions(a, card)}
                            onChange={(c) => setAbilities(abilities.map((x, j) => (j === i ? { ...x, condition: c as ConditionId } : x)))}
                            id={fieldId(`abilities.${i}.condition`)}
                            invalid={violationsAt(analysis.violations, `abilities.${i}.condition`).length > 0}
                            note="怒濤＝「このターン2枚目以降」、罠＝「前の相手のターンに相手が3枚以上使った」"
                          />
                        )}
                        {def.onceOption && (
                          // 1回きり（MTG 要素 △ バッチA：蓄積の「プラン」）
                          <label className="check" title={def.onceOption.label}>
                            <input
                              type="checkbox"
                              checked={a.once === true}
                              onChange={(e) =>
                                setAbilities(
                                  abilities.map((x, j) => {
                                    if (j !== i) return x;
                                    const next = { ...x };
                                    if (e.target.checked) next.once = true;
                                    else delete next.once;
                                    return next;
                                  }),
                                )
                              }
                            />
                            {def.onceOption.label}
                          </label>
                        )}
                      </div>
                    )}
                    <p className="ed-row__text">{describeAbility(a)}</p>
                    <Violations items={violationsAt(analysis.violations, `abilities.${i}`)} />
                  </div>
                );
              })}
              <Violations items={violationsExactly(analysis.violations, 'abilities')} />
              <button type="button" className="ed-add" onClick={() => setPicker('ability')} disabled={!abilityAddable}>
                {abilityAddable ? (
                  <>
                    <span className="ed-add__plus" aria-hidden="true">
                      ＋
                    </span>
                    カードの能力を追加
                  </>
                ) : (
                  '付けられるカードの能力はありません'
                )}
              </button>
            </section>
          )}

          {/* ---------------------------------------------------------------- デメリット */}
          <section className={cx('panel ed-section panel--drawback', analysis.isCurse && 'is-curse')} id={fieldId('drawbacks')}>
            <div className="ed-section__head">
              <span className="u-hex ed-step" aria-hidden="true">
                4
              </span>
              <h2>デメリット</h2>
              {analysis.isCurse && <span className="badge badge--curse">呪いカード</span>}
            </div>
            <p className="hint">デメリットを付けると呪いカードになります。付けた分だけ予算を取り戻せます（上限ぶんまで）。</p>
            <details className="ed-details">
              <summary>呪いカードの決まり</summary>
              <ul className="ed-rules">
                <li>デメリットの合計が、レアリティの上限（いま {budget.curseNeed}pt）以上必要</li>
                <li>予算に戻せるのも上限（{budget.curseNeed}pt）まで。超えた分はカードを弱くするだけ</li>
                <li>コスト{BALANCE.curse.minCostForOffset}未満のカードは予算に戻せない</li>
                <li>同じデメリットは1枚に1回まで。デッキの枚数制限は元のレアリティと同じ</li>
              </ul>
            </details>
            {analysis.isCurse && (
              <div className={cx('ed-curse-line', !curseOk && 'is-ng')} role="status">
                <span>呪いの条件：デメリット合計</span>
                <b>
                  {budget.drawbackTotal} / 必要 {budget.curseNeed}
                </b>
                <span className={cx('badge', curseOk ? 'badge--ok' : 'badge--ng')}>{curseOk ? '達成' : `あと ${budget.curseNeed - budget.drawbackTotal}pt`}</span>
              </div>
            )}
            {card.drawbacks.map((d, i) => {
              const key = dKeys[i]!;
              return (
                <DrawbackRow
                  key={key}
                  index={i}
                  drawback={d}
                  card={card}
                  violations={violationsAt(analysis.violations, `drawbacks.${i}`)}
                  expanded={expanded.has(key)}
                  onToggle={() => expand(key, !expanded.has(key))}
                  onChange={(next) => update({ drawbacks: card.drawbacks.map((x, j) => (j === i ? next : x)) })}
                  onRemove={() => removeDrawback(i)}
                  autoFocus={focusKey === key}
                />
              );
            })}
            <button type="button" className="ed-add ed-add--drawback" onClick={() => setPicker('drawback')} disabled={addable.length === 0}>
              {addable.length === 0 ? (
                '付けられるデメリットはありません'
              ) : (
                <>
                  <span className="ed-add__plus" aria-hidden="true">
                    ＋
                  </span>
                  デメリットを追加
                </>
              )}
            </button>
          </section>
        </div>

        <aside className="ed-aside" aria-label="プレビューと内訳">
          <div className={cx('ed-preview', `ed-preview--${card.rarity}`, analysis.isCurse && 'is-curse')}>
            <CardView card={card} analysis={analysis} />
            {shownViolations.length > 0 && <span className="ed-preview__ribbon">要修正 {shownViolations.length}件</span>}
          </div>
          {panel(true)}
        </aside>
      </div>

      <div className="savebar ed-savebar">
        <div className={cx('savebar__status', showProblems && !canSave && 'is-ng', !showProblems && !canSave && 'is-pending')} aria-live="polite">
          {canSave ? (dirty ? '保存できます' : '保存済み') : showProblems ? `要修正 ${allViolations.length}件` : 'カード名と効果を入れると保存できます'}
        </div>
        {!canSave && showProblems && (
          <button type="button" className="btn btn--small" onClick={showReasons}>
            理由を見る
          </button>
        )}
        <button type="button" className="btn btn--secondary" onClick={() => void leave()}>
          一覧へ
        </button>
        <button type="button" className="btn btn--primary" disabled={!dirty} onClick={save}>
          保存
        </button>
      </div>

      {emojiOpen && (
        <Suspense fallback={null}>
          <IconPicker open card={card} analysis={analysis} onSelect={(icon) => update({ icon })} onClose={() => setEmojiOpen(false)} />
        </Suspense>
      )}
      {picker && (
        <EffectPicker
          mode={picker}
          card={card}
          remaining={budget.remaining}
          onPick={(id) =>
            picker === 'effect' ? addEffect(id) : picker === 'drawback' ? addDrawback(id) : picker === 'ability' ? addAbility(id) : toggleKeyword(id)
          }
          onClose={() => setPicker(null)}
        />
      )}
      <Sheet open={sheet === 'preview'} title="プレビューと内訳" onClose={() => setSheet(null)} desktop="modal">
        <div className={cx('ed-sheet-preview', `ed-preview--${card.rarity}`, analysis.isCurse && 'is-curse')}>
          <CardView card={card} analysis={analysis} />
        </div>
        {panel(false)}
      </Sheet>
      <Sheet open={sheet === 'templates'} title="テンプレートから作る" onClose={() => setSheet(null)} desktop="modal">
        <p className="hint">予算をほどよく使った雛形です。読み込んだあと、名前・数値・効果を自由に変えられます。</p>
        <ul className="ed-tpls">
          {templateCards.map(({ t, card: c, a }) => {

            const lines = [...a.text.keywords.map((k) => k.name), ...a.text.effects, ...a.text.drawbacks.map((d) => `デメリット：${d}`)];
            return (
              <li key={t.id}>
                <button type="button" className={cx('ed-tpl', frameClasses(c.rarity, a.cardType, a.isCurse), a.isCurse && 'is-curse')} onClick={() => void applyTemplate(t)}>
                  <span className="ed-tpl__tile" aria-hidden="true">
                    <CardArt icon={c.icon} rarity={c.rarity} cardType={a.cardType} curse={a.isCurse} size={60} />
                    <CostGem cost={c.cost} className="ed-mini__gem" label={false} />
                  </span>
                  <span className="ed-tpl__main">
                    <b>{t.title}</b>
                    <span className={cx('ed-tpl__type', `text--${c.rarity}`)}>
                      {CARD_TYPE_LABEL[a.cardType]}・{RARITY_LABEL[c.rarity]}
                      {a.isCurse && `・${CURSE_LABEL}`}
                      {c.stats && (
                        <span className="ed-tpl__stats">
                          {' '}
                          <StatMini attack={c.stats.attack} hp={c.stats.hp} defense={c.stats.defense} />
                        </span>
                      )}
                    </span>
                    <span className="ed-tpl__desc">{t.description}</span>
                    {lines.length > 0 && <span className="ed-tpl__text">{lines.join(' ')}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </div>
  );
}
