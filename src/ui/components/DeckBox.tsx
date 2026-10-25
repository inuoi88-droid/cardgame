/**
 * デッキ箱のタイル（デッキ一覧。UI2「黒鉄と金の卓」決定事項 #111 の D）。押せば編集、右上の ⋯ で複製・書き出し・削除。
 * 鉄の板に、代表カードの絵（いちばん高いレアリティ → 枚数の多いもの）と枚数、銘板にデッキ名（人の入力なので --font-title）、
 * レアリティの宝石の数、ミニのコスト分布（鉄の柱）、1行の注記。要修正は中身を暗くして深紅の封蝋を押す。
 * 中身（絵・銘板・宝石の数・ミニのコスト分布・注記・封蝋）は `DeckBoxFace` にまとめ、対戦の準備・ロビーの DeckPicker（UI2 の B。
 * あちらはラジオ）も同じ部品と同じ `.dbox__*` の規則（pages/pages.css）で描く。外側（押せば開く／ラジオ）だけが違う。
 */
import { useMemo } from 'react';
import { RARITIES, type CardDef, type Deck, type DeckAnalysis, type Rarity } from '../../engine/index.ts';
import { deckSummary, type DeckSummary } from '../battle/deckSummary.ts';
import { cx } from '../util.ts';
import { CardArtOf } from './CardArt.tsx';
import { RarityGem } from './cardParts.tsx';
import { TileMenu } from './TileMenu.tsx';
import { UiIcon } from './UiIcon.tsx';

const GEM_ORDER: Rarity[] = [...RARITIES].reverse();

/**
 * デッキ箱の中身（DeckBox・DeckPicker で共用）。外側の要素（.dbox）の直下に並ぶ兄弟として返す。
 * - crest：絵の代わりの紋（game-icons の名前）。プリセットのデッキの紋、カードが無いときは chest
 */
export function DeckBoxFace({ s, name, crest, count, note, ng }: { s: DeckSummary; name: string; crest?: string; count?: number; note: string; ng: boolean }) {
  const max = Math.max(1, ...s.curve);
  const art = crest ?? (s.best ? null : 'chest');
  return (
    <>
      <span className="dbox__art" aria-hidden="true">
        {art ? (
          <span className="dbox__crest">
            <UiIcon name={`gi:${art}`} />
          </span>
        ) : (
          <CardArtOf card={s.best!} />
        )}
        {count !== undefined && <span className="dbox__count">{count}枚</span>}
      </span>
      <span className="dbox__name">{name}</span>
      <span className="dbox__meta" aria-hidden="true">
        <span className="dbox__gems">
          {GEM_ORDER.filter((r) => s.gems[r] > 0).map((r) => (
            <span key={r}>
              <RarityGem rarity={r} />
              {s.gems[r]}
            </span>
          ))}
        </span>
        <span className="dbox__curve">
          {s.curve.map((n, i) => (
            <i key={i} style={{ height: `${Math.max(2, Math.round((n / max) * 20))}px` }} />
          ))}
        </span>
      </span>
      <span className={cx('dbox__note', ng && 'is-ng')}>{note}</span>
      {ng && (
        <span className="dbox__seal" aria-hidden="true">
          要<br />
          修正
        </span>
      )}
    </>
  );
}

export interface DeckBoxProps {
  deck: Deck;
  a: DeckAnalysis;
  cards: readonly CardDef[];
  onOpen: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onRemove: () => void;
  /** フレンドに公開中か（決定事項 #123）。onShare が無ければメニューに出さない */
  shared?: boolean;
  onShare?: () => void;
}

export function DeckBox({ deck, a, cards, onOpen, onDuplicate, onExport, onRemove, shared = false, onShare }: DeckBoxProps) {
  const s = useMemo(() => deckSummary(deck, cards), [deck, cards]);
  const name = deck.name || '（名前なし）';
  const note = a.valid ? (a.total === a.size ? '使えます' : `${a.total} / ${a.size}枚`) : `要修正 ${a.violations.length}件：${a.violations[0]?.message ?? ''}`;
  return (
    <li className={cx('dbox', !a.valid && 'is-ng')}>
      <button type="button" className="dbox__open" onClick={onOpen} aria-label={`デッキ「${name}」を編集（${a.total} / ${a.size}枚${a.valid ? '' : `・要修正 ${a.violations.length}件`}${shared ? '・フレンドに公開中' : ''}）`} />
      <DeckBoxFace s={s} name={name} count={a.total} note={note} ng={!a.valid} />
      {shared && (
        <span className="dbox__shared" title="フレンドに公開中（フレンドが見て、コピーできます）">
          <UiIcon name="three-friends" />
          公開中
        </span>
      )}
      <TileMenu
        label={`デッキ「${name}」の操作`}
        items={[
          { icon: 'files', label: '複製', onClick: onDuplicate },
          { icon: 'share', label: '書き出し', onClick: onExport },
          ...(onShare ? [{ icon: 'three-friends' as const, label: shared ? 'フレンドへの公開をやめる' : 'フレンドに公開', onClick: onShare }] : []),
          { icon: 'trash-can', label: '削除', onClick: onRemove, danger: true },
        ]}
      />
    </li>
  );
}
