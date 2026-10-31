/**
 * 公式カードを書き換える（#/official/<ID>。運営だけ。決定事項 #141）。カードの編集画面を「公式」の形で使う：
 * 保存先はサーバーで、保存した時点で全員に効く（オンラインのドラフトはそのあとに始まる山から・各端末は次に開いたとき）。
 * レアリティも変えられる（決定事項 #148。ドラフトの山が組めなくなる変更はサーバーが断る）。元に戻す・履歴は公式カードの一覧の詳細から。
 */
import { useMemo } from 'react';
import { useToast } from '../components/Toast.tsx';
import { OfficialCardEditor } from '../pages/CardEditorPage.tsx';
import { navigate } from '../router.ts';
import { afterOfficialChange, plazaAct, useOfficialCards, useStaff } from './plazaStore.ts';

export function OfficialEditPage({ id }: { id: string }) {
  const staff = useStaff();
  const cards = useOfficialCards();
  const toast = useToast();
  const card = cards.find((c) => c.id === id) ?? null;
  const others = useMemo(() => cards.filter((c) => c.id !== id), [cards, id]);
  if (!staff || !card) {
    return (
      <div className="panel">
        <p>{!staff ? '公式カードを書き換えられるのは運営だけです。' : '公式カードが見つかりませんでした。'}</p>
        <button type="button" className="btn" onClick={() => navigate('/official')}>
          公式カードの一覧へ
        </button>
      </div>
    );
  }
  return (
    <OfficialCardEditor
      card={card}
      mode={{
        others,
        backTo: '/official',
        onSave: async (next) => {
          const res = await plazaAct({ op: 'officialSave', card: next });
          if (!res.ok) {
            toast({ text: res.error, kind: 'ng' });
            return false;
          }
          await afterOfficialChange();
          return true;
        },
      }}
    />
  );
}
