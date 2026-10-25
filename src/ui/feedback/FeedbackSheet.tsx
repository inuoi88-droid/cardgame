/**
 * 報告・要望のシート（決定事項 #129）。対戦の結果・対戦のメニュー・デッキ構築・カードの作成から開く。
 * - 送る：種類（バランス・バグ・その他）→ 中身 → カード（選べるときだけ）→ 本文 → 対戦の記録などを添えるか
 * - 送った報告：この端末から送った報告の状況（運営が確かめて、受付・確認中・対応予定・対応済み・見送りを書く）
 * 送った報告は定期の確認（docs/FEEDBACK_TRIAGE.md）で確かめ、妥当なものは修正して公開する。
 */
import { useEffect, useId, useMemo, useState } from 'react';
import { RARITY_LABEL, type CardDef } from '../../engine/index.ts';
import { FEEDBACK_BODY_MAX, FEEDBACK_CARDS_MAX, FEEDBACK_TOPICS, type FeedbackKind, type FeedbackSource, type FeedbackSummary } from '../../online/feedback/types.ts';
import { APP_BUILD } from '../buildInfo.ts';
import { CardArtOf } from '../components/CardArt.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { useToast } from '../components/Toast.tsx';
import { UiIcon, type UiIconProps } from '../components/UiIcon.tsx';
import { cx } from '../util.ts';
import { loadFeedbackStatus, sendFeedback } from './feedbackClient.ts';
import {
  canSend,
  defaultKind,
  fitContext,
  KIND_GI,
  KIND_HINT,
  KIND_LABEL,
  shortDate,
  STATUS_LABEL,
  TOPIC_LABEL,
  TOPIC_PLACEHOLDER,
  type FeedbackContextData,
} from './feedbackLogic.ts';
import './feedback.css';

export interface FeedbackSheetProps {
  source: FeedbackSource;
  onClose: () => void;
  /** 選べるカード（結果の画面はこの対戦のカード、デッキ構築はデッキのカード、カードの作成は編集中のカード） */
  cards?: readonly CardDef[];
  /** 最初から選んでおくカードの ID */
  preselect?: readonly string[];
  /** 添える記録を作る（無ければ添えない） */
  context?: () => FeedbackContextData;
  /** 添える記録の説明（チェックボックスの文字） */
  contextLabel?: string;
}

const KINDS: FeedbackKind[] = ['balance', 'bug', 'other'];
/** カードがこれより多いときは、名前で絞り込む欄を出す */
const FILTER_FROM = 12;

export function FeedbackSheet({ source, onClose, cards = [], preselect = [], context, contextLabel }: FeedbackSheetProps) {
  const [tab, setTab] = useState<'send' | 'mine'>('send');
  return (
    <Sheet open title="報告・要望を送る" onClose={onClose} className="fb-sheet">
      <div className="tabs fb__tabs" role="tablist" aria-label="送るか、送った報告を見るか">
        <button type="button" role="tab" aria-selected={tab === 'send'} className={cx('tab', tab === 'send' && 'is-active')} onClick={() => setTab('send')}>
          <UiIcon name="scroll-quill" />
          送る
        </button>
        <button type="button" role="tab" aria-selected={tab === 'mine'} className={cx('tab', tab === 'mine' && 'is-active')} onClick={() => setTab('mine')}>
          <UiIcon name="checklist" />
          送った報告
        </button>
      </div>
      {tab === 'send' ? (
        <SendForm source={source} cards={cards} preselect={preselect} context={context} contextLabel={contextLabel} onSent={() => setTab('mine')} />
      ) : (
        <MyReports />
      )}
    </Sheet>
  );
}

function SendForm({
  source,
  cards,
  preselect,
  context,
  contextLabel,
  onSent,
}: Required<Pick<FeedbackSheetProps, 'source' | 'cards' | 'preselect'>> & Pick<FeedbackSheetProps, 'context' | 'contextLabel'> & { onSent: () => void }) {
  const toast = useToast();
  const id = useId();
  const [kind, setKind] = useState<FeedbackKind>(() => defaultKind(source));
  const [topic, setTopic] = useState<string>(() => FEEDBACK_TOPICS[defaultKind(source)][0]!);
  const [body, setBody] = useState('');
  const [picked, setPicked] = useState<Set<string>>(() => new Set(preselect));
  const [filter, setFilter] = useState('');
  const [attach, setAttach] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chooseKind = (k: FeedbackKind) => {
    setKind(k);
    setTopic(FEEDBACK_TOPICS[k][0]!);
    setError(null);
  };
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? cards.filter((c) => c.name.toLowerCase().includes(q)) : cards;
  }, [cards, filter]);
  const toggle = (cardId: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(cardId)) n.delete(cardId);
      else if (n.size < FEEDBACK_CARDS_MAX) n.add(cardId);
      return n;
    });
  const chosen = cards.filter((c) => picked.has(c.id));
  const ok = canSend(body, chosen.length);
  const bodyLen = [...body].length;

  const submit = async () => {
    if (!ok || sending) return;
    setSending(true);
    setError(null);
    const ctx = context && attach ? fitContext(context()) : undefined;
    const r = await sendFeedback({
      kind,
      topic,
      source,
      body,
      cards: chosen,
      ...(ctx ? { context: ctx as unknown as Record<string, unknown> } : {}),
      app: { build: APP_BUILD, page: location.hash || '#/', ua: navigator.userAgent },
    });
    setSending(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    toast({ text: `報告を送りました（受付番号 ${r.id}）。ありがとうございます`, kind: 'ok' });
    setBody('');
    onSent();
  };

  return (
    <form
      className="fb__form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="fb__kinds" role="radiogroup" aria-label="報告の種類">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            aria-label={KIND_LABEL[k]}
            aria-describedby={`${id}-${k}`}
            className={cx('fb__kind', kind === k && 'is-active')}
            onClick={() => chooseKind(k)}
          >
            <UiIcon name={KIND_GI[k] as UiIconProps['name']} />
            <span className="fb__kind-name">{KIND_LABEL[k]}</span>
            <span className="fb__kind-hint" id={`${id}-${k}`}>
              {KIND_HINT[k]}
            </span>
          </button>
        ))}
      </div>

      <div className="fb__topics" role="radiogroup" aria-label="中身">
        {FEEDBACK_TOPICS[kind].map((t) => (
          <button key={t} type="button" role="radio" aria-checked={topic === t} className={cx('chip', topic === t && 'is-active')} onClick={() => setTopic(t)}>
            {TOPIC_LABEL[kind][t]}
          </button>
        ))}
      </div>

      {cards.length > 0 && (
        <fieldset className="fb__cards">
          <legend>
            {kind === 'balance' ? 'どのカードのことですか？' : '関係するカード（あれば）'}
            <span className="fb__count">
              {chosen.length > 0 ? `${chosen.length}枚選択` : kind === 'balance' ? '選ぶと確かめやすくなります' : '任意'}
            </span>
          </legend>
          {cards.length >= FILTER_FROM && (
            <input type="search" className="fb__filter" placeholder="カード名で絞り込む" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="カード名で絞り込む" />
          )}
          <ul className="fb__card-list">
            {shown.map((c) => (
              <li key={c.id}>
                <label className={cx('fb__card', picked.has(c.id) && 'is-picked')}>
                  <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                  <CardArtOf card={c} size={28} />
                  <span className="fb__card-name u-name">{c.name}</span>
                  <span className="fb__card-meta">
                    {RARITY_LABEL[c.rarity]}・コスト{c.cost}
                  </span>
                </label>
              </li>
            ))}
            {shown.length === 0 && <li className="fb__none">当てはまるカードがありません</li>}
          </ul>
        </fieldset>
      )}

      <label className="field fb__body">
        <span>{kind === 'balance' ? '気になったこと（任意）' : '内容'}</span>
        <textarea
          rows={5}
          maxLength={FEEDBACK_BODY_MAX}
          value={body}
          placeholder={TOPIC_PLACEHOLDER[kind][topic]}
          onChange={(e) => setBody(e.target.value)}
          aria-describedby={`${id}-n`}
        />
        <span className="field__count">
          {bodyLen} / {FEEDBACK_BODY_MAX}
        </span>
      </label>

      {context && (
        <label className="check fb__attach">
          <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
          {contextLabel ?? 'この画面の情報を添える'}
        </label>
      )}

      <p className="hint fb__note" id={`${id}-n`}>
        送った報告は運営が確かめ、直せるものは直して公開します（状況は「送った報告」で見られます）。名前や連絡先などの個人情報は書かないでください。画面の版とブラウザの種類も一緒に送ります。
      </p>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      <div className="btn-row fb__actions">
        <button type="submit" className="btn btn--primary" disabled={!ok || sending}>
          <UiIcon name="scroll-quill" />
          {sending ? '送っています…' : '送る'}
        </button>
        {!ok && <span className="fb__need">{cards.length > 0 ? '本文を書くか、カードを選んでください' : '内容を書いてください'}</span>}
      </div>
    </form>
  );
}

function MyReports() {
  const [state, setState] = useState<{ loading: boolean; error: string | null; reports: FeedbackSummary[] }>({ loading: true, error: null, reports: [] });
  useEffect(() => {
    let alive = true;
    void loadFeedbackStatus().then((r) => {
      if (!alive) return;
      setState(r.ok ? { loading: false, error: null, reports: r.reports } : { loading: false, error: r.error, reports: [] });
    });
    return () => {
      alive = false;
    };
  }, []);
  if (state.loading) return <p className="hint fb__empty">読み込んでいます…</p>;
  if (state.error)
    return (
      <p className="field__error" role="alert">
        {state.error}
      </p>
    );
  if (state.reports.length === 0) return <p className="hint fb__empty">この端末から送った報告はまだありません。</p>;
  return (
    <ul className="fb__mine">
      {state.reports.map((r) => (
        <li key={r.id} className="fb__report">
          <div className="fb__report-head">
            <span className="fb__report-id">#{r.id}</span>
            <span className="fb__report-kind">
              {KIND_LABEL[r.kind]}・{TOPIC_LABEL[r.kind]?.[r.topic] ?? r.topic}
            </span>
            <span className={cx('fb__status', `fb__status--${r.status}`)}>{STATUS_LABEL[r.status] ?? r.status}</span>
          </div>
          {r.excerpt && <p className="fb__excerpt">{r.excerpt}</p>}
          {r.note && <p className="fb__reply">運営より：{r.note}</p>}
          <span className="fb__date">
            {shortDate(r.createdAt)}
            {r.updatedAt > r.createdAt + 60_000 ? `（更新 ${shortDate(r.updatedAt)}）` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** 報告・要望のシートを開くボタン（画面ごとに置く。compact は形だけ＝スマホの操作バー） */
export function FeedbackButton({ onClick, compact = false, className }: { onClick: () => void; compact?: boolean; className?: string }) {
  return (
    <button type="button" className={cx('btn', compact && 'btn--icon', className)} onClick={onClick} aria-label={compact ? '報告・要望を送る' : undefined}>
      <UiIcon name="scroll-quill" />
      {!compact && <span className="btn__label">報告・要望</span>}
    </button>
  );
}
