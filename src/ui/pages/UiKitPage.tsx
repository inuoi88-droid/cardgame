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
import { UiIcon } from '../components/UiIcon.tsx';
import { UI_ICON_PATHS, type UiIconName } from '../icons/generated/uiIcons.ts';
import { glossary, keywordGlossary, STATUS_IDS } from '../glossary.ts';
import { analyzeDeck } from '../../engine/index.ts';
import { PRESET_DECKS } from '../../presets.ts';
import { CostCurve } from '../components/CostCurve.tsx';
import { DeckBox } from '../components/DeckBox.tsx';
import { MoreDots } from '../components/TileMenu.tsx';

export function UiKitPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [sheet, setSheet] = useState(false);
  const [modal, setModal] = useState(false);
  const [answer, setAnswer] = useState<string>('');
  const [tab, setTab] = useState(0);
  const [rarity, setRarity] = useState(1);
  const [radio, setRadio] = useState('normal');

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
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button type="button" className="btn btn--primary">
            <UiIcon name="quill-ink" />
            新しいカード
          </button>
          <button type="button" className="btn btn--icon" aria-label="ログ">
            <UiIcon name="scroll-unfurled" />
          </button>
          <button type="button" className="btn btn--icon" aria-label="メニュー">
            <UiIcon name="cog" />
          </button>
          <button type="button" className="btn btn--danger">
            <UiIcon name="trash-can" />
            削除
          </button>
          <button type="button" className="btn btn--primary btn--end is-pulse">
            ターン終了
          </button>
          <button type="button" className="btn btn--primary btn--end" disabled>
            相手のターン
          </button>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          金の主ボタンは1画面に1つ（h1・手番の銘板と合わせて金は3か所まで）。何度も出る小さな主ボタンは .btn--primary.btn--small（サファイアの縁の鉄）。ターン終了は
          .btn--end（.is-pulse で脈動）。
        </p>
      </section>

      <section className="panel">
        <h2>板・銘板・帯・区切り</h2>
        <div className="btn-row">
          <span className="u-hex">1</span>
          <span className="u-plate">銘板（.u-plate）</span>
          <span className="u-plate u-plate--name">鬱蒼の鶫</span>
        </div>
        <hr className="u-divider" />
        <div className="u-banner">帯（.u-banner）</div>
        <div className="u-banner u-banner--gold" style={{ marginTop: 8 }}>
          勝利
        </div>
        <div className="u-banner u-banner--crimson" style={{ marginTop: 8 }}>
          敗北
        </div>
        <div className="panel panel--drawback" style={{ marginTop: 16, marginBottom: 0 }}>
          危険の板（.panel--drawback）
        </div>
        <div className="empty" style={{ marginTop: 16 }}>
          <UiIcon name="chest" />
          <span>まだデッキがありません（.empty）</span>
        </div>
      </section>

      <section className="panel">
        <h2>入力・切り替え</h2>
        <label className="field">
          <span>カード名</span>
          <input type="text" defaultValue="白銀の騎士" />
        </label>
        <label className="field">
          <span>探す</span>
          <input type="search" placeholder="名前・効果・種族で探す" />
        </label>
        <label className="field">
          <span>並べ替え</span>
          <select defaultValue="cost">
            <option value="cost">コストが低い順</option>
            <option value="name">名前（あ→ん）</option>
          </select>
        </label>
        <label className="field">
          <span>説明（任意）</span>
          <textarea rows={2} placeholder="例：序盤に出して毒をためる。" />
        </label>
        <div className="btn-row">
          <label className="check">
            <input type="checkbox" defaultChecked /> モンスターにする
          </label>
          <label className="check">
            <input type="checkbox" /> 昼と夜
          </label>
          <label className="switch">
            <input type="checkbox" className="u-toggle" defaultChecked /> 演出
          </label>
        </div>
        <div className="btn-row" role="radiogroup" aria-label="強さ">
          {['weak', 'normal', 'strong'].map((v) => (
            <label key={v} className="check">
              <input type="radio" name="kit-radio" checked={radio === v} onChange={() => setRadio(v)} />
              {v === 'weak' ? 'よわい' : v === 'normal' ? 'ふつう' : 'つよい'}
            </label>
          ))}
        </div>
        <div className="seg" style={{ marginTop: 8 }}>
          {(['', '--rare', '--epic', '--legend'] as const).map((m, i) => (
            <button key={m} type="button" className={`seg__btn${m ? ` seg__btn${m}` : ''}${rarity === i ? ' is-active' : ''}`} onClick={() => setRarity(i)}>
              {['コモン', 'レア', 'エピック', 'レジェンド'][i]}
              <small>上限 {[100, 160, 240, 360][i]}</small>
            </button>
          ))}
        </div>
        <div className="tabs" role="tablist" style={{ marginTop: 12 }}>
          {['カード', 'コンパクト', 'リスト'].map((t, i) => (
            <button key={t} type="button" role="tab" aria-selected={tab === i} className={`tab${tab === i ? ' is-active' : ''}`} onClick={() => setTab(i)}>
              {t}
            </button>
          ))}
        </div>
        <ul className="violations">
          <li>デッキは30枚にしてください（今 28枚）</li>
          <li>レジェンドは2枚までです</li>
        </ul>
        <p className="ok-msg">✓ このカードは作成できます</p>
      </section>

      <section className="panel">
        <h2>画面の枠の記号（UiIcon）</h2>
        <p className="hint">game-icons.net の形を単色で。1つの形は1つの意味だけ（src/ui/icons/uiIcons.json）。</p>
        <div className="kit-icons">
          {(Object.keys(UI_ICON_PATHS) as UiIconName[]).map((n) => (
            <span key={n} className="kit-icons__item" title={n}>
              <UiIcon name={n} size={24} />
              <small>{n}</small>
            </span>
          ))}
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
        <h2>デッキ・置き場・ルールの部品</h2>
        <p className="hint">デッキ箱（DeckBox。押せば編集・⋯ で操作・要修正は封蝋）、コスト分布（CostCurve）、畳める節（.fold）、要修正の札（.cwarn）、ルールの目次（.rules__tocitem）、何もないとき（.empty--hero）。</p>
        <ul className="dboxes">
          {PRESET_DECKS.slice(0, 2).map((p, i) => {
            const byId = new Map(p.cards.map((c) => [c.id, c]));
            const deck = i === 0 ? p.deck : { ...p.deck, entries: p.deck.entries.map((e, k) => (k === 0 ? { ...e, count: e.count + 9 } : e)) };
            return <DeckBox key={p.id} deck={deck} a={analyzeDeck(deck, byId)} cards={p.cards} onOpen={() => toast({ text: `「${p.name}」を開く`, kind: 'info' })} onDuplicate={() => undefined} onExport={() => undefined} onRemove={() => undefined} />;
          })}
        </ul>
        <div style={{ marginTop: 16 }}>
          <CostCurve deck={PRESET_DECKS[0]!.deck} cards={PRESET_DECKS[0]!.cards} />
        </div>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button type="button" className="cwarn">
            要修正 8枚
          </button>
          <button type="button" className="btn" aria-label="その他の操作">
            <MoreDots />
          </button>
          <a href="#/rules/win" className="rules__tocitem">
            <UiIcon name="trophy-cup" />
            勝敗
          </a>
        </div>
        <details className="fold" style={{ marginTop: 12 }}>
          <summary>
            <span className="fold__title">対戦のルール</span>
            <span className="fold__value">基本ルール</span>
          </summary>
          <div className="fold__body hint">畳んだ中身（MatchOptionsForm など）</div>
        </details>
        <div className="empty empty--hero" style={{ marginTop: 12 }}>
          <UiIcon name="open-chest" />
          <p className="empty__title">まだデッキがありません</p>
          <p>何もないときは、形・明朝の一言・説明・ボタンを並べる。</p>
        </div>
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
