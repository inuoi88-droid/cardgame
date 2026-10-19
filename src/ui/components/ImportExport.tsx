/** JSON の書き出し（ファイル保存・コピー）と取り込み */
import { useState } from 'react';
import { mergeImport, parseImport, type ExportBundle, type MergeResult } from '../../engine/index.ts';
import { actions, getState } from '../store.ts';
import { downloadText, uuid } from '../util.ts';
import { Modal } from './controls.tsx';
import { useToast } from './Toast.tsx';

interface ExportProps {
  title: string;
  bundle: ExportBundle;
  filename: string;
  onClose: () => void;
}

export function ExportDialog({ title, bundle, filename, onClose }: ExportProps) {
  const text = JSON.stringify(bundle, null, 2);
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ text: 'コピーしました', kind: 'ok' });
    } catch {
      toast({ text: 'コピーできませんでした。テキストを選択してコピーしてください。', kind: 'ng' });
    }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <p className="hint">
        カード{bundle.cards.length}枚・デッキ{bundle.decks.length}個。ファイルに保存するか、テキストをコピーして渡してください。
      </p>
      <textarea className="json-box" readOnly value={text} onFocus={(e) => e.target.select()} aria-label="書き出すJSON" />
      <div className="btn-row">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            downloadText(filename, text);
            toast({ text: `${filename} を保存しました`, kind: 'ok' });
          }}
        >
          ファイルに保存
        </button>
        <button type="button" className="btn" onClick={copy}>
          テキストをコピー
        </button>
      </div>
    </Modal>
  );
}

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ merge: MergeResult; warnings: string[] } | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setText(await file.text());
    setError(null);
    setResult(null);
  };

  const run = () => {
    const parsed = parseImport(text);
    if (!parsed.ok) {
      setError(parsed.error);
      setResult(null);
      return;
    }
    const { cards, decks } = getState();
    const merge = mergeImport(cards, decks, parsed.value, uuid);
    actions.replaceAll(merge.cards, merge.decks);
    setError(null);
    const added = merge.addedCards + merge.addedDecks;
    toast({
      text: added > 0 ? `カード${merge.addedCards}枚・デッキ${merge.addedDecks}個を取り込みました` : '新しく追加するものはありませんでした（すべて取り込み済みです）',
      kind: added > 0 ? 'ok' : 'info',
    });
    // 名前の変更や読み飛ばしがなければ、詳細を見せずに閉じる
    if (merge.renamed.length === 0 && parsed.value.warnings.length === 0) {
      onClose();
      return;
    }
    setResult({ merge, warnings: parsed.value.warnings });
  };

  return (
    <Modal title="取り込み（JSON）" onClose={onClose}>
      {result ? (
        <div className="import-result">
          <p>
            {result.merge.addedCards + result.merge.addedDecks > 0
              ? `カード${result.merge.addedCards}枚・デッキ${result.merge.addedDecks}個を取り込みました。`
              : '新しく追加するものはありませんでした（すべて取り込み済みです）。'}
            {result.merge.unchangedCards > 0 && `同じ内容のカード${result.merge.unchangedCards}枚は、手元のものをそのまま使います。`}
          </p>
          {result.merge.renamed.length > 0 && (
            <>
              <p>名前が重なったため変更したカード：</p>
              <ul>
                {result.merge.renamed.map((r, i) => (
                  <li key={i}>
                    {r.from} → {r.to}
                  </li>
                ))}
              </ul>
            </>
          )}
          {result.warnings.length > 0 && (
            <>
              <p className="text-ng">読み飛ばしたデータ：</p>
              <ul className="violations">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </>
          )}
          <p className="hint">要修正のカードも取り込まれます。一覧で「要修正」と表示されたカードは、編集して直してください。</p>
          <div className="btn-row">
            <button type="button" className="btn btn--primary" onClick={onClose}>
              閉じる
            </button>
          </div>
        </div>
      ) : (
        <>
          <label className="field">
            <span>ファイルから</span>
            <input type="file" accept="application/json,.json" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <label className="field">
            <span>またはテキストを貼り付け</span>
            <textarea
              className="json-box"
              value={text}
              placeholder='{"format":"cardgame-export", ...}'
              onChange={(e) => {
                setText(e.target.value);
                setError(null);
              }}
            />
          </label>
          {error && (
            <p className="text-ng" role="alert">
              {error}
            </p>
          )}
          <div className="btn-row">
            <button type="button" className="btn btn--primary" disabled={text.trim() === ''} onClick={run}>
              取り込む
            </button>
            <button type="button" className="btn btn--secondary" onClick={onClose}>
              やめる
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
