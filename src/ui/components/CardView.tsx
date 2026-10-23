/**
 * カードの面（カードデザイン案A「王道ファンタジー」。決定事項 #107）。
 * 額縁の金属はレアリティ（呪いは焼けた黒鉄）、コストは六角の宝石、名前は銘板、絵はアーチ窓、ステータスは剣・ハート・盾の紋章。
 * size 'lg' はエディターのプレビュー・詳細など、'sm' は一覧・ドラフト（本文は行の境目で切って「…」と「全文 ›」。押すと詳細）。
 */
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { analyzeCard, CARD_TYPE_LABEL, CURSE_LABEL, RARITY_LABEL, TRIBE_LABEL, type CardAnalysis, type CardDef } from '../../engine/index.ts';
import { cx } from '../util.ts';
import { CardArt } from './CardArt.tsx';
import { CostGem, Emblem, frameClasses, nameFit, RarityGem } from './cardParts.tsx';
import './cards.css';

interface Props {
  card: CardDef;
  analysis?: CardAnalysis;
  size?: 'sm' | 'lg';
  onClick?: () => void;
  /** onClick があるときの読み上げ名（既定は「〇〇の詳細を見る」） */
  actionLabel?: string;
  /** onClick があるときの tabIndex（既定 0。一覧のロービング tabindex で -1 にする） */
  tabIndex?: number;
}

/** モードの行「A：…」「B（+1）：…」 */
const MODE_LINE = /^([ABC])(（[^）]*）)?：(.*)$/;
/** 一覧の小さいカードの本文1行の高さ（cardFrame.css の .tcg__clamp と同じ） */
const CLAMP_LINE = 18;

export function CardView({ card, analysis, size = 'lg', onClick, actionLabel, tabIndex = 0 }: Props) {
  const a = useMemo(() => analysis ?? analyzeCard(card), [analysis, card]);
  const name = card.name.trim() || '（名前なし）';
  const tribe = card.tribe && TRIBE_LABEL[card.tribe] ? TRIBE_LABEL[card.tribe] : null;
  const typeLabel = `${CARD_TYPE_LABEL[a.cardType]}${a.isCurse ? `・${CURSE_LABEL}` : ''}${tribe ? `・${tribe}` : ''}`;
  const sm = size === 'sm';
  const invalid = sm && !a.valid;
  const textRef = useRef<HTMLDivElement>(null);
  const clamped = useClamp(sm ? textRef : null, a);
  return (
    <div
      className={cx('tcg', `tcg--${size}`, frameClasses(card.rarity, a.cardType, a.isCurse), card.stats && 'tcg--monster', invalid && 'is-invalid', clamped && 'is-clamped', onClick && 'tcg--clickable')}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? tabIndex : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
              e.preventDefault();
              onClick();
            }
          : undefined
      }
      aria-label={onClick ? `${actionLabel ?? `${name}の詳細を見る`}${invalid ? '（要修正）' : ''}` : undefined}
    >
      <div className="tcg__face">
        <div className="tcg__banner">
          <span className={cx('tcg__name', nameFit(name))}>{name}</span>
        </div>
        <div className="tcg__art">
          <CardArt icon={card.icon} rarity={card.rarity} cardType={a.cardType} curse={a.isCurse} size={sm ? 'var(--card-art-sm, 52px)' : 'var(--card-art-lg, 92px)'} />
          {a.isCurse && (
            <span className="tcg__seal" aria-hidden="true">
              呪
            </span>
          )}
          {invalid && <span className="tcg__invalid">要修正</span>}
        </div>
        <div className="tcg__type">
          <span className="tcg__tl">{sm ? CARD_TYPE_LABEL[a.cardType] : typeLabel}</span>
          <span className="tcg__rar">
            {/* 種類の文字が長いとき（呪い・種族つき）は、種類の帯が狭ければレアリティを宝石だけにする（帯の幅はコンテナクエリ。cardFrame.css） */}
            {sm ? (
              <RarityGem rarity={card.rarity} withLabel="sr" />
            ) : [...typeLabel].length + RARITY_LABEL[card.rarity].length > 13 ? (
              <>
                <RarityGem rarity={card.rarity} withLabel="sr" />
                <span className="tcg__rarl" aria-hidden="true">
                  {RARITY_LABEL[card.rarity]}
                </span>
              </>
            ) : (
              <RarityGem rarity={card.rarity} withLabel="visible" />
            )}
            {sm && a.isCurse && <span className="sr">・{CURSE_LABEL}</span>}
          </span>
        </div>
        <div className="tcg__text" ref={textRef}>
          {sm ? <ClampedText a={a} /> : <FullText a={a} description={card.description} />}
        </div>
      </div>
      <CostGem cost={card.cost} />
      {card.stats && (
        <div className="tcg-stats">
          <Emblem kind="atk" value={card.stats.attack} />
          {card.stats.defense > 0 && <Emblem kind="def" value={card.stats.defense} />}
          <Emblem kind="hp" value={card.stats.hp} />
        </div>
      )}
    </div>
  );
}

/** 大きいカードの本文：キーワード → 効果（モードは見出し＋A/B/C の行）→ 能力の札 → デメリット → 説明文 */
function FullText({ a, description }: { a: CardAnalysis; description?: string }) {
  return (
    <>
      {a.text.keywords.length > 0 && (
        <div className="tcg__kws">
          {a.text.keywords.map((k, i) => (
            <span key={i} className="tkw" title={k.text}>
              {k.name}
            </span>
          ))}
        </div>
      )}
      {a.text.effects.map((t, i) => {
        const m = MODE_LINE.exec(t);
        if (m) {
          return (
            <p key={i} className="tcg__mode">
              <i className="mk" aria-label={`モード${m[1]}`}>
                {m[1]}
              </i>
              <span>
                {m[2] ?? ''}
                {m[3]}
              </span>
            </p>
          );
        }
        return (
          <p key={i} className={/選ぶ：$/.test(t) ? 'tcg__modehead' : undefined}>
            {t}
          </p>
        );
      })}
      {a.text.abilities.length > 0 && (
        <div className="tcg__kws tcg__abs">
          {a.text.abilities.map((x, i) => (
            <span key={i} className="tkw tkw--ability" title={x.text}>
              {x.name}
            </span>
          ))}
        </div>
      )}
      {a.text.drawbacks.map((t, i) => (
        <p key={`d${i}`} className="tcg__db">
          <span className="sr">デメリット：</span>
          {t}
        </p>
      ))}
      {description && <p className="tcg__desc">{description}</p>}
    </>
  );
}

/** 小さいカードの本文：1つの段落にまとめて行数で切る（全文は押すと詳細） */
function ClampedText({ a }: { a: CardAnalysis }) {
  const parts: ReactNode[] = [];
  if (a.text.keywords.length > 0) {
    parts.push(
      <span key="kw">
        {a.text.keywords.map((k, i) => (
          <span key={i} className="tkw">
            {k.name}
          </span>
        ))}
      </span>,
    );
  }
  a.text.effects.forEach((t, i) => {
    const m = MODE_LINE.exec(t);
    parts.push(
      m ? (
        <span key={`e${i}`}>
          <i className="mk">{m[1]}</i>
          {m[2] ?? ''}
          {m[3]}
        </span>
      ) : (
        <span key={`e${i}`}>{t}</span>
      ),
    );
  });
  if (a.text.abilities.length > 0) {
    parts.push(
      <span key="ab">
        {a.text.abilities.map((x, i) => (
          <span key={i} className="tkw tkw--ability">
            {x.name}
          </span>
        ))}
      </span>,
    );
  }
  a.text.drawbacks.forEach((t, i) => {
    parts.push(
      <span key={`d${i}`} className="tcg__cdb">
        {t}
      </span>,
    );
  });
  return (
    <div className="tcg__clampwrap">
      <div className="tcg__clamp">
        {parts.map((p, i) => (
          <span key={i}>
            {i > 0 && <br />}
            {p}
          </span>
        ))}
      </div>
      <span className="tcg__more" aria-hidden="true">
        全文 ›
      </span>
    </div>
  );
}

/**
 * 一覧の小さいカード：本文の欄の高さから入る行数を決め（--lines）、はみ出すかどうかを返す。
 * 欄の大きさが変わったら（画面の幅・回転）測り直す。
 */
function useClamp(ref: RefObject<HTMLDivElement | null> | null, key: unknown): boolean {
  const [clamped, setClamped] = useState(false);
  useLayoutEffect(() => {
    const box = ref?.current;
    if (!box) return;
    const el = box.querySelector<HTMLElement>('.tcg__clamp');
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(box);
      const h = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      el.style.setProperty('--lines', String(Math.max(1, Math.floor(h / CLAMP_LINE))));
      setClamped(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [ref, key]);
  return clamped;
}
