/**
 * プリセットデッキ（CPU 戦の相手・対戦の準備で選べるデッキ）の一覧と、運営の書き換え（決定事項 #148）。
 * - #/presets：一覧（誰でも見られる。運営には「書き換える」）
 * - #/presets/<デッキの ID>：枚数・入れるカード・カードの中身を直す（運営だけ）。直した内容は端末の下書き（presetDraft.ts）に置き、
 *   「全員に反映」でまとめてサーバーに送る。デッキのルールはデッキ構築と同じ analyzeDeck（サーバーは checkDeck）
 * - #/presets/<デッキの ID>/<カードの ID>：カードの編集画面（公式カードの書き換えと同じ形）。保存すると下書きに入る
 */
import { useEffect, useMemo, useState } from 'react';
import { analyzeCard, analyzeDeck, newCard, normalizeName, type CardDef } from '../../engine/index.ts';
import type { PresetHistoryView } from '../../online/plaza/protocol.ts';
import type { PresetDeck, PresetOverride } from '../../presets.ts';
import { CardDetail } from '../components/CardDetail.tsx';
import { frameClasses } from '../components/cardParts.tsx';
import { useConfirm } from '../components/ConfirmDialog.tsx';
import { useIsPhone } from '../components/dialogUtil.ts';
import { Sheet } from '../components/Sheet.tsx';
import { useToast } from '../components/Toast.tsx';
import { UiIcon } from '../components/UiIcon.tsx';
import { OfficialCardEditor } from '../pages/CardEditorPage.tsx';
import { CardRowInfo, CountControl } from '../pages/DeckBuilderPage.tsx';
import { navigate } from '../router.ts';
import { useStore } from '../store.ts';
import { cx } from '../util.ts';
import { afterOfficialChange, overriddenPresetIds, plazaAct, useOfficialCards, usePresetDecks, useStaff } from './plazaStore.ts';
import { addCopy, clearPresetDraft, getPresetDraft, overrideOf, replaceCard, samePreset, setCount, setPresetDraft, usePresetDraft } from './presetDraft.ts';
import './plaza.css';

const total = (o: { deck: { entries: { count: number }[] } }) => o.deck.entries.reduce((n, e) => n + e.count, 0);

const when = (t: number) => {
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** デッキの中身の1行（カード名×枚数） */
function contents(o: { deck: { entries: { cardId: string; count: number }[] }; cards: readonly CardDef[] }): string {
  const byId = new Map(o.cards.map((c) => [c.id, c]));
  return o.deck.entries.map((e) => `${byId.get(e.cardId)?.name ?? '？'}×${e.count}`).join('・');
}

export function PresetsPage() {
  const presets = usePresetDecks();
  const staff = useStaff();
  const edited = useMemo(() => overriddenPresetIds(), [presets]);
  return (
    <div className="presets">
      <h1>プリセットデッキ</h1>
      <p className="hint">
        CPU 戦の相手と、対戦の準備で選べるデッキです。
        {staff && '運営は中身（枚数・入れるカード・カード）を書き換えられます。書き換えは「全員に反映」した時点で全員に効きます。'}
      </p>
      <ul className="presets__list">
        {presets.map((p) => (
          <li key={p.id} className="panel presets__item">
            <div className="presets__head">
              <h2>{p.name}</h2>
              {edited.has(p.deck.id) && <span className="badge badge--sm badge--warn">運営が書き換え済み</span>}
              {staff && getPresetDraft(p.deck.id) && <span className="badge badge--sm">反映していない変更あり</span>}
            </div>
            <p className="hint">
              {p.description}（{p.deck.entries.length}種類・{total(p)}枚）
            </p>
            <p className="presets__cards">{contents(p)}</p>
            {staff && (
              <div className="btn-row">
                <button type="button" className="btn btn--primary" onClick={() => navigate(`/presets/${p.deck.id}`)}>
                  書き換える
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function NotAvailable({ staff }: { staff: boolean }) {
  return (
    <div className="panel">
      <p>{!staff ? 'プリセットデッキを書き換えられるのは運営だけです。' : 'プリセットデッキが見つかりませんでした。'}</p>
      <button type="button" className="btn" onClick={() => navigate('/presets')}>
        プリセットデッキの一覧へ
      </button>
    </div>
  );
}

/** いまのプリセットと下書き。下書きが無ければいまのプリセットから */
function useWork(id: string): { current: PresetDeck | undefined; base: PresetOverride | null; work: PresetOverride | null; draft: PresetOverride | null } {
  const presets = usePresetDecks();
  const current = presets.find((p) => p.deck.id === id);
  const draft = usePresetDraft(id);
  const base = useMemo(() => (current ? overrideOf(current) : null), [current]);
  return { current, base, work: draft ?? base, draft };
}

export function PresetEditPage({ id }: { id: string }) {
  const staff = useStaff();
  const { current, base, work, draft } = useWork(id);
  const toast = useToast();
  const confirm = useConfirm();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [history, setHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const phone = useIsPhone(600);
  const analyses = useMemo(() => new Map((work?.cards ?? []).map((c) => [c.id, analyzeCard(c)])), [work]);
  const a = useMemo(() => (work ? analyzeDeck(work.deck, new Map(work.cards.map((c) => [c.id, c]))) : null), [work]);
  if (!staff || !current || !base || !work || !a) return <NotAvailable staff={staff} />;

  const edited = overriddenPresetIds().has(id);
  const dirty = draft !== null && !samePreset(draft, base);
  /** 下書きを更新する（いまのプリセットと同じに戻ったら下書きを消す） */
  const update = (next: PresetOverride) => (samePreset(next, base) ? clearPresetDraft(id) : setPresetDraft(next));
  const byId = new Map(work.cards.map((c) => [c.id, c]));
  const detail = detailId ? byId.get(detailId) : undefined;

  const changeCount = async (card: CardDef, n: number) => {
    if (n <= 0) {
      const ok = await confirm({ title: `「${card.name || '（名前なし）'}」をデッキから外しますか？`, message: 'このカードの書き換えも消えます（「全員に反映」するまでは、ほかの人には効きません）。', okLabel: '外す', danger: true });
      if (!ok) return;
    }
    update(setCount(work, card.id, n));
  };
  const publish = async () => {
    setBusy(true);
    const res = await plazaAct({ op: 'presetSave', preset: work });
    setBusy(false);
    if (!res.ok) {
      toast({ text: res.error, kind: 'ng' });
      return;
    }
    clearPresetDraft(id);
    await afterOfficialChange();
    toast({ text: `「${current.name}」を書き換えました（全員に反映されます）`, kind: 'ok' });
  };
  const discard = async () => {
    const ok = await confirm({ title: '反映していない変更を捨てますか？', message: `「${current.name}」は、いま全員に配られている内容に戻ります。`, okLabel: '捨てる', danger: true });
    if (ok) clearPresetDraft(id);
  };
  const reset = async () => {
    const ok = await confirm({ title: '元のデッキに戻しますか？', message: '運営の書き換えをやめて、最初のプリセットデッキに戻します（全員に反映されます）。', okLabel: '元に戻す', danger: true });
    if (!ok) return;
    const res = await plazaAct({ op: 'presetReset', presetId: id });
    if (!res.ok) {
      toast({ text: res.error, kind: 'ng' });
      return;
    }
    clearPresetDraft(id);
    await afterOfficialChange();
    toast({ text: '元のデッキに戻しました', kind: 'ok' });
  };

  return (
    <>
      <div className="presets presets--edit">
        <h1>プリセットデッキを書き換える：{current.name}</h1>
        <p className="hint">
          枚数・入れるカード・カードの中身を直して「全員に反映」すると、CPU 戦の相手と対戦の準備のデッキが全員この内容になります。反映するまでは、この端末の下書きです。
        </p>
        <div className="btn-row">
          <button type="button" className="btn btn--primary" onClick={() => setAdding(true)}>
            ＋ カードを加える
          </button>
          <button type="button" className="btn" onClick={() => setHistory(true)}>
            <UiIcon name="gi:backward-time" />
            履歴
          </button>
          {draft && (
            <button type="button" className="btn btn--ghost" onClick={() => void discard()}>
              変更を捨てる
            </button>
          )}
          {edited && (
            <button type="button" className="btn btn--danger" onClick={() => void reset()}>
              元のデッキに戻す
            </button>
          )}
        </div>
        {!a.valid && (
          <div className="notice notice--ng" role="note">
            <b>要修正 {a.violations.length}件</b>
            <ul>
              {a.violations.slice(0, 6).map((v, i) => (
                <li key={i}>{v.message}</li>
              ))}
            </ul>
          </div>
        )}
        <section className="panel">
          <h2>デッキの中身（{work.deck.entries.length}種類）</h2>
          <p className="hint presets__tip">カードを押すと詳細が開き、そこからも書き換えられます。</p>
          <ul className="card-rows">
            {work.deck.entries.map((entry) => {
              const card = byId.get(entry.cardId);
              const ca = card ? analyses.get(card.id) : undefined;
              if (!card || !ca) return null;
              return (
                <li key={entry.cardId} className={cx('card-row', frameClasses(card.rarity, ca.cardType, ca.isCurse), !ca.valid && 'is-invalid')}>
                  <CardRowInfo card={card} a={ca} onPreview={() => setDetailId(card.id)} />
                  {/* スマホは名前を広く見せるため出さない（行を押すと出る詳細の「書き換える」から。空の枠は行の決まりで畳まれる） */}
                  {phone ? (
                    <span />
                  ) : (
                    <button type="button" className="btn btn--small" onClick={() => navigate(`/presets/${id}/${card.id}`)}>
                      書き換える
                    </button>
                  )}
                  <CountControl count={entry.count} onChange={(n) => void changeCount(card, n)} />
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <div className="savebar">
        <span className={cx('savebar__pts', a.total !== a.size && 'is-over')}>
          <b>{a.total}</b> / {a.size}枚
        </span>
        <span className={cx('savebar__status', !a.valid && 'is-ng')} aria-live="polite">
          {!a.valid ? `要修正 ${a.violations.length}件` : dirty ? '反映できます' : edited ? '反映済み' : '元のまま'}
        </span>
        <button type="button" className="btn btn--secondary" onClick={() => navigate('/presets')}>
          一覧へ
        </button>
        <button type="button" className="btn btn--primary" disabled={!a.valid || !dirty || busy} onClick={() => void publish()}>
          {busy ? '保存中…' : '全員に反映'}
        </button>
      </div>

      {detail && (
        <CardDetail
          card={detail}
          analysis={analyses.get(detail.id)}
          onClose={() => setDetailId(null)}
          actions={
            <button type="button" className="btn btn--primary" onClick={() => navigate(`/presets/${id}/${detail.id}`)}>
              書き換える
            </button>
          }
        />
      )}
      {adding && (
        <AddCardSheet
          work={work}
          onAdd={(card, edit) => {
            const { next, id: added } = addCopy(work, card);
            update(next);
            setAdding(false);
            if (edit) navigate(`/presets/${id}/${added}`);
            else toast({ text: `「${next.cards.at(-1)!.name}」を1枚入れました`, kind: 'ok' });
          }}
          onClose={() => setAdding(false)}
        />
      )}
      {history && <PresetHistorySheet deckId={id} name={current.name} onClose={() => setHistory(false)} />}
    </>
  );
}

type Source = 'official' | 'mine' | 'presets';
const SOURCES: { id: Source; label: string }[] = [
  { id: 'official', label: '公式カード' },
  { id: 'mine', label: '自分のカード' },
  { id: 'presets', label: 'ほかのプリセット' },
];
/** 一度に並べる数（多すぎると重い。名前で絞る） */
const ADD_LIMIT = 60;

/** カードを加える：公式カード・自分のカード・ほかのプリセットのカードを写す（ID と名前はデッキの中で付け直す）か、新しく作る */
function AddCardSheet({ work, onAdd, onClose }: { work: PresetOverride; onAdd: (card: CardDef, edit: boolean) => void; onClose: () => void }) {
  const official = useOfficialCards();
  const { cards: mine } = useStore();
  const presets = usePresetDecks();
  const [source, setSource] = useState<Source>('official');
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<CardDef | null>(null);
  const list = useMemo(() => {
    const inDeck = new Set(work.cards.map((c) => c.id));
    const all = source === 'official' ? official : source === 'mine' ? mine : presets.filter((p) => p.deck.id !== work.id).flatMap((p) => p.cards);
    const q = normalizeName(query);
    return all.filter((c) => !inDeck.has(c.id) && (q === '' || normalizeName(c.name).includes(q)));
  }, [source, query, official, mine, presets, work]);
  const shown = list.slice(0, ADD_LIMIT);
  return (
    <Sheet open title="カードを加える" onClose={onClose} desktop="modal">
      <div className="presets__add">
        <div className="btn-row">
          <button type="button" className="btn btn--primary" onClick={() => onAdd({ ...newCard('new'), name: '新しいカード' }, true)}>
            新しく作る
          </button>
        </div>
        <div className="tabs" role="tablist" aria-label="写すカード">
          {SOURCES.map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={source === s.id} className={cx('tab', source === s.id && 'is-active')} onClick={() => setSource(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        <input type="search" className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="名前で絞り込み" aria-label="名前で絞り込み" maxLength={40} />
        <p className="hint">
          写したカードはこのデッキだけのカードになります（元のカードは変わりません）。{list.length > ADD_LIMIT && `${list.length}枚のうち${ADD_LIMIT}枚を表示しています。名前で絞ってください。`}
        </p>
        {shown.length === 0 && <p className="hint">見つかりませんでした。</p>}
        <ul className="card-rows">
          {shown.map((c) => {
            const ca = analyzeCard(c);
            return (
              <li key={c.id} className={cx('card-row', frameClasses(c.rarity, ca.cardType, ca.isCurse), !ca.valid && 'is-invalid')}>
                <CardRowInfo card={c} a={ca} onPreview={() => setPreview(c)} />
                <span />
                <button type="button" className="btn btn--small btn--primary" onClick={() => onAdd(c, false)}>
                  ＋ 入れる
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {preview && (
        <CardDetail
          card={preview}
          onClose={() => setPreview(null)}
          actions={
            <>
              <button type="button" className="btn btn--primary" onClick={() => onAdd(preview, false)}>
                ＋ 入れる
              </button>
              <button type="button" className="btn" onClick={() => onAdd(preview, true)}>
                入れて書き換える
              </button>
            </>
          }
        />
      )}
    </Sheet>
  );
}

/** プリセットデッキの書き換えの履歴（運営だけ）。「この内容に戻す」でその版をもう一度保存する */
function PresetHistorySheet({ deckId, name, onClose }: { deckId: string; name: string; onClose: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<PresetHistoryView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void plazaAct({ op: 'presetHistory', presetId: deckId }).then((res) => {
      if (res.ok) setRows(res.history);
      else setError(res.error);
    });
  }, [deckId]);
  const restore = async (row: PresetHistoryView) => {
    setBusy(true);
    const res = row.preset ? await plazaAct({ op: 'presetSave', preset: row.preset }) : await plazaAct({ op: 'presetReset', presetId: deckId });
    setBusy(false);
    if (!res.ok) {
      toast({ text: res.error, kind: 'ng' });
      return;
    }
    clearPresetDraft(deckId);
    await afterOfficialChange();
    toast({ text: row.preset ? 'この内容に戻しました' : '元のデッキに戻しました', kind: 'ok' });
    onClose();
  };
  return (
    <Sheet open title={`「${name}」の書き換えの履歴`} onClose={onClose} desktop="modal">
      {error && <p className="field__error">{error}</p>}
      {!rows && !error && <p className="hint">読み込んでいます…</p>}
      {rows && rows.length === 0 && <p className="hint">まだ書き換えられていません。</p>}
      {rows && rows.length > 0 && (
        <ol className="ohist">
          {rows.map((r, i) => (
            <li key={r.version} className="ohist__row">
              <div className="ohist__head">
                <b>{when(r.at)}</b>
                <span>{r.by}</span>
                {i === 0 && <span className="badge badge--sm">今</span>}
              </div>
              <p className="ohist__body">{r.preset ? `${r.preset.deck.entries.length}種類・${total(r.preset)}枚：${contents(r.preset)}` : '元のデッキに戻した'}</p>
              {i > 0 && (
                <button type="button" className="btn btn--small" disabled={busy} onClick={() => void restore(r)}>
                  この内容に戻す
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </Sheet>
  );
}

/** プリセットのカードの書き換え（#/presets/<デッキ>/<カード>）。保存すると下書きに入る（全員にはまだ効かない） */
export function PresetCardEditPage({ id, cardId }: { id: string; cardId: string }) {
  const staff = useStaff();
  const { current, base, work } = useWork(id);
  const card = work?.cards.find((c) => c.id === cardId) ?? null;
  const others = useMemo(() => (work ? work.cards.filter((c) => c.id !== cardId) : []), [work, cardId]);
  if (!staff || !current || !base || !card) return <NotAvailable staff={staff} />;
  return (
    <OfficialCardEditor
      card={card}
      mode={{
        others,
        backTo: `/presets/${id}`,
        title: `「${current.name}」のカードを書き換える`,
        saveLabel: 'デッキに入れる',
        savedText: (name) => `「${name}」を書き換えました（デッキの画面の「全員に反映」で全員に届きます）`,
        problem: () => null,
        onSave: async (next) => {
          const w = getPresetDraft(id) ?? base;
          const updated = replaceCard(w, next);
          if (samePreset(updated, base)) clearPresetDraft(id);
          else setPresetDraft(updated);
          return true;
        },
      }}
    />
  );
}
