/**
 * デッキ箱のタイル（デッキ一覧。UI2「黒鉄と金の卓」決定事項 #111 の D）。押せば編集、右上の ⋯ で複製・書き出し・削除。
 * 鉄の板に、代表カードの絵（いちばん高いレアリティ → 枚数の多いもの）と枚数、銘板にデッキ名（人の入力なので --font-title）、
 * レアリティの宝石の数、ミニのコスト分布（鉄の柱）、1行の注記。要修正は中身を暗くして深紅の封蝋を押す。
 * 対戦の準備・ロビーの DeckPicker（UI2 の B）と同じ見た目の語彙（あちらはラジオ、こちらは押せば開く）
 */
import { useMemo } from 'react';
import { RARITIES, type CardDef, type Deck, type DeckAnalysis, type Rarity } from '../../engine/index.ts';
import { deckSummary } from '../battle/deckSummary.ts';
import { cx } from '../util.ts';
import { CardArtOf } from './CardArt.tsx';
import { RarityGem } from './cardParts.tsx';
import { TileMenu } from './TileMenu.tsx';
import { UiIcon } from './UiIcon.tsx';

const GEM_ORDER: Rarity[] = [...RARITIES].reverse();

export interface DeckBoxProps {
  deck: Deck;
  a: DeckAnalysis;
  cards: readonly CardDef[];
  onOpen: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onRemove: () => void;
}

export function DeckBox({ deck, a, cards, onOpen, onDuplicate, onExport, onRemove }: DeckBoxProps) {
  const s = useMemo(() => deckSummary(deck, cards), [deck, cards]);
  const max = Math.max(1, ...s.curve);
  const name = deck.name || '（名前なし）';
  const note = a.valid ? (a.total === a.size ? '使えます' : `${a.total} / ${a.size}枚`) : `要修正 ${a.violations.length}件：${a.violations[0]?.message ?? ''}`;
  return (
    <li className={cx('dbox', !a.valid && 'is-ng')}>
      <button type="button" className="dbox__open" onClick={onOpen} aria-label={`デッキ「${name}」を編集（${a.total} / ${a.size}枚${a.valid ? '' : `・要修正 ${a.violations.length}件`}）`} />
      <span className="dbox__art" aria-hidden="true">
        {s.best ? (
          <CardArtOf card={s.best} />
        ) : (
          <span className="dbox__crest">
            <UiIcon name="chest" />
          </span>
        )}
        <span className="dbox__count">{a.total}枚</span>
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
      <span className={cx('dbox__note', !a.valid && 'is-ng')}>{note}</span>
      {!a.valid && (
        <span className="dbox__seal" aria-hidden="true">
          要<br />
          修正
        </span>
      )}
      <TileMenu
        label={`デッキ「${name}」の操作`}
        items={[
          { icon: 'files', label: '複製', onClick: onDuplicate },
          { icon: 'share', label: '書き出し', onClick: onExport },
          { icon: 'trash-can', label: '削除', onClick: onRemove, danger: true },
        ]}
      />
    </li>
  );
}
