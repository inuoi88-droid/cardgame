/**
 * 公式カードの書き換えの履歴（運営だけ。決定事項 #141）。新しい順に、いつ・誰が・どんな中身にしたか。
 * 「この内容に戻す」でその版の中身をもう一度保存する（元のカードに戻した行なら、元に戻す）。
 */
import { useEffect, useState } from 'react';
import { analyzeCard, type CardDef } from '../../engine/index.ts';
import type { OfficialHistoryView } from '../../online/plaza/protocol.ts';
import { Sheet } from '../components/Sheet.tsx';
import { useToast } from '../components/Toast.tsx';
import { afterOfficialChange, plazaAct } from './plazaStore.ts';

const when = (t: number) => {
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function summary(card: CardDef): string {
  const a = analyzeCard(card);
  const stats = card.stats ? `${card.stats.attack}/${card.stats.hp}${card.stats.defense ? `/${card.stats.defense}` : ''} ` : '';
  return `コスト${card.cost} ${stats}${[...a.text.keywords.map((k) => k.name), ...a.text.effects, ...a.text.drawbacks.map((d) => `デメリット：${d}`)].join(' ')}`;
}

export function OfficialHistorySheet({ cardId, name, onClose }: { cardId: string; name: string; onClose: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<OfficialHistoryView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void plazaAct({ op: 'officialHistory', cardId }).then((res) => {
      if (res.ok) setRows(res.history);
      else setError(res.error);
    });
  }, [cardId]);
  const restore = async (row: OfficialHistoryView) => {
    setBusy(true);
    const res = row.card ? await plazaAct({ op: 'officialSave', card: row.card }) : await plazaAct({ op: 'officialReset', cardId });
    setBusy(false);
    if (!res.ok) {
      toast({ text: res.error, kind: 'ng' });
      return;
    }
    await afterOfficialChange();
    toast({ text: row.card ? `「${row.card.name}」の内容に戻しました` : '元のカードに戻しました', kind: 'ok' });
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
              <p className="ohist__body">{r.card ? `${r.card.name}：${summary(r.card)}` : '元のカードに戻した'}</p>
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
