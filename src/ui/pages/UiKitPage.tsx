/**
 * UI キット（#/ui-kit。メニューには出さない）。共通部品の見本と使い方。
 * 画面を作るときの参照用：ボタンの種類、バッジ・チップ、トースト、確認ダイアログ、ポップオーバー、シート、用語集。
 */
import { useState } from 'react';
import { useConfirm } from '../components/ConfirmDialog.tsx';
import { Modal } from '../components/controls.tsx';
import { Popover } from '../components/Popover.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { useToast } from '../components/Toast.tsx';
import { glossary, keywordGlossary, STATUS_IDS } from '../glossary.ts';

export function UiKitPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [sheet, setSheet] = useState(false);
  const [modal, setModal] = useState(false);
  const [answer, setAnswer] = useState<string>('');

  return (
    <>
      <div className="page-head">
        <h1>UI キット</h1>
        <span className="hint">共通部品の見本（開発用）</span>
      </div>

      <section className="panel">
        <h2>ボタン</h2>
        <div className="btn-row">
          <button type="button" className="btn btn--primary">
            主ボタン
          </button>
          <button type="button" className="btn">
            通常
          </button>
          <button type="button" className="btn btn--secondary">
            控えめ
          </button>
          <button type="button" className="btn btn--ghost">
            ゴースト
          </button>
          <button type="button" className="btn btn--danger">
            削除
          </button>
          <button type="button" className="btn btn--danger-filled">
            危険（塗り）
          </button>
          <button type="button" className="btn" disabled>
            無効
          </button>
        </div>
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button type="button" className="btn btn--small btn--primary">
            小・主
          </button>
          <button type="button" className="btn btn--small">
            小
          </button>
          <button type="button" className="btn btn--small btn--danger">
            小・削除
          </button>
          <button type="button" className="btn btn--icon" aria-label="閉じる">
            ✕
          </button>
          <button type="button" className="btn btn--big btn--primary">
            大きい主ボタン
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>バッジ・チップ・通知</h2>
        <div className="btn-row">
          <span className="badge">種類</span>
          <span className="badge badge--rare">レア</span>
          <span className="badge badge--curse">呪い</span>
          <span className="badge badge--ok">使用できます</span>
          <span className="badge badge--ng">要修正</span>
          <span className="badge badge--warn">条件未達</span>
          <span className="badge badge--mine">あなた</span>
          <span className="badge badge--enemy">相手</span>
        </div>
        <div className="chips" style={{ marginTop: 8 }}>
          <button type="button" className="chip is-active">
            すべて
          </button>
          <button type="button" className="chip">
            コモン
          </button>
          <button type="button" className="chip">
            呪い
          </button>
        </div>
        <div className="notice" style={{ marginTop: 12 }}>
          お知らせ（.notice）
        </div>
        <div className="notice notice--ng">エラー（.notice--ng）</div>
        <div className="notice notice--warn">注意（.notice--warn）</div>
        <div className="notice notice--ok">成功（.notice--ok）</div>
      </section>

      <section className="panel">
        <h2>トースト・確認・シート・モーダル</h2>
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => toast({ text: '「火の粉」を保存しました', kind: 'ok' })}>
            トースト（成功）
          </button>
          <button type="button" className="btn" onClick={() => toast({ text: 'サーバーにつながりません', kind: 'ng' })}>
            トースト（エラー）
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => toast({ text: '「火の粉」を削除しました', kind: 'info', action: { label: '元に戻す', onClick: () => toast({ text: '戻しました', kind: 'ok' }) } })}
          >
            トースト（元に戻す）
          </button>
          <button
            type="button"
            className="btn btn--danger"
            onClick={async () => {
              const ok = await confirm({ title: '「火の粉」を削除しますか？', message: '削除したあと、しばらくの間は「元に戻す」で戻せます。', okLabel: '削除', danger: true });
              setAnswer(ok ? '削除を選びました' : 'キャンセルしました');
            }}
          >
            確認ダイアログ（危険）
          </button>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const ok = await confirm({ title: 'ターンを終了しますか？', message: 'まだ使えるカードが2枚あります。', okLabel: '終了する' });
              setAnswer(ok ? '終了を選びました' : 'キャンセルしました');
            }}
          >
            確認ダイアログ（通常）
          </button>
          <button type="button" className="btn" onClick={() => setSheet(true)}>
            シート
          </button>
          <button type="button" className="btn" onClick={() => setModal(true)}>
            モーダル
          </button>
        </div>
        {answer && <p className="hint">{answer}</p>}
      </section>

      <section className="panel">
        <h2>ポップオーバー（状態異常・キーワード）</h2>
        <p className="hint">タップ（PC はホバーでも）で説明が出ます。文は用語集（glossary.ts）から。</p>
        <div className="btn-row">
          {STATUS_IDS.map((id) => {
            const g = glossary[id];
            return (
              <Popover key={id} content={{ title: `${g.icon} ${g.name}`, description: g.short, lines: id === 'poison' ? ['次のターン開始時：100ダメージ → 残り50'] : undefined }}>
                <span className={`badge badge--${g.tone === 'bad' ? 'ng' : g.tone === 'good' ? 'ok' : 'mine'}`}>
                  {g.icon} {g.name}
                </span>
              </Popover>
            );
          })}
        </div>
        <div className="btn-row" style={{ marginTop: 8 }}>
          {Object.entries(keywordGlossary).map(([id, g]) => (
            <Popover key={id} content={{ title: `${g.icon} ${g.name}`, description: g.short }}>
              <span className="badge">{g.name}</span>
            </Popover>
          ))}
        </div>
      </section>

      <Sheet open={sheet} title="シートの見本" onClose={() => setSheet(false)}>
        <p>スマホでは下から出て、つまみを下に引くと閉じます。PC では右側のパネルです。</p>
        <ul>
          {Array.from({ length: 30 }, (_, i) => (
            <li key={i}>スクロールする中身 {i + 1}</li>
          ))}
        </ul>
      </Sheet>
      {modal && (
        <Modal title="モーダルの見本" onClose={() => setModal(false)}>
          <p>Tab はこの中だけを巡り、Escape や背景のタップで閉じます。閉じると開いたボタンにフォーカスが戻ります。</p>
          <label className="field">
            <span>入力欄</span>
            <input type="text" placeholder="ここに入力" />
          </label>
          <div className="btn-row">
            <button type="button" className="btn btn--primary" onClick={() => setModal(false)}>
              OK
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
