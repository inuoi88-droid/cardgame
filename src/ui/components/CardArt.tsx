/**
 * カードの絵（決定事項 #105）。カードの絵が出るところはすべてこれを使う（一覧・デッキ構築・対戦の手札とモンスター・詳細・ダイアログ・エディター）。
 *
 * - "gi:<名前>"：game-icons.net（Lorc・Delapouite ほか、CC BY 3.0。色を変えて使用。クレジットは #/credits）の白い絵を
 *   レアリティのグラデーション（コモン銀・レア青・エピック紫・レジェンド金）で塗り、暗い円盤にのせる。
 * - 円盤の縁の色は種類（アタック赤・スキル緑・パワー紫・モンスター橙・呪い深紅）。
 * - 絵文字のカードは同じ円盤に絵文字をのせる（古いカード・取り込んだカード）。
 * - 形を読んでいる間は同じ大きさの空の円盤（レイアウトがずれない）。読めなかったとき（オフラインなど）は種類の絵文字を出し、
 *   読み直せたら絵に替わる（load.ts。決定事項 #106）。知らない名前は「？」。
 *
 * 大きさは size（px の数か CSS の長さ）。省略すると 1.3em（置き場所の文字の大きさに合わせる）。
 */
import { memo, useId, useMemo, type CSSProperties } from 'react';
import { analyzeCard, type CardAnalysis, type CardDef, type CardType, type Rarity } from '../../engine/index.ts';
import { parseIconRef } from '../icons/ref.ts';
import { useIconPath } from '../icons/load.ts';
import { cx } from '../util.ts';
import './cardArt.css';

/** ノイズ（定義のないカード）の絵 */
export const NOISE_ART = 'gi:static';

export interface CardArtProps {
  icon: string | undefined;
  rarity?: Rarity;
  /** 縁の色（種類）。呪いは curse を true に */
  cardType?: CardType;
  curse?: boolean;
  /** px の数、または CSS の長さ（'3.2em' など）。省略は 1.3em */
  size?: number | string;
  className?: string;
  /** 読み上げる名前。省略すると飾り（aria-hidden）として扱う（たいていカード名が隣にあるため） */
  label?: string;
  /** 縁と円盤を出さず、絵だけ（小さな行の中など） */
  bare?: boolean;
}

export const CardArt = memo(function CardArt({ icon, rarity = 'common', cardType, curse, size, className, label, bare }: CardArtProps) {
  const ref = parseIconRef(icon);
  const style = size === undefined ? undefined : ({ '--cart-size': typeof size === 'number' ? `${size}px` : size } as CSSProperties);
  return (
    <span
      className={cx('cart', `cart--${rarity}`, cardType && `cart--t-${cardType}`, curse && 'cart--curse', bare && 'cart--bare', className)}
      style={style}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {ref.kind === 'gi' ? (
        <GiGlyph name={ref.name} fallback={curse ? FALLBACK.curse : FALLBACK[cardType ?? 'none']} />
      ) : ref.kind === 'emoji' ? (
        <span className="cart__emoji">{ref.text}</span>
      ) : (
        <span className="cart__unknown">？</span>
      )}
    </span>
  );
});

/** カード1枚の絵（種類・呪いはカードから計算する。analysis を渡せば計算しない） */
export function CardArtOf({ card, analysis, ...rest }: { card: CardDef; analysis?: CardAnalysis } & Omit<CardArtProps, 'icon' | 'rarity' | 'cardType' | 'curse'>) {
  const a = useMemo(() => analysis ?? analyzeCard(card), [analysis, card]);
  return <CardArt icon={card.icon} rarity={card.rarity} cardType={a.cardType} curse={a.isCurse} {...rest} />;
}

/** 形を読めなかったときの代わり（種類で見分けがつくように） */
const FALLBACK: Record<CardType | 'curse' | 'none', string> = {
  monster: '🐾',
  attack: '⚔️',
  skill: '✨',
  power: '🔮',
  powerAttack: '💥',
  curse: '💀',
  none: '🃏',
};

function GiGlyph({ name, fallback }: { name: string; fallback: string }) {
  const d = useIconPath(name);
  const gid = `cart-g${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  if (d === 'loading') return <span className="cart__loading" />;
  if (d === 'error') return <span className="cart__emoji cart__fallback">{fallback}</span>;
  if (d === null) return <span className="cart__unknown">？</span>;
  return (
    <svg className="cart__svg" viewBox="0 0 512 512" focusable="false">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" className="cart__s0" />
          <stop offset="0.5" className="cart__s1" />
          <stop offset="1" className="cart__s2" />
        </linearGradient>
      </defs>
      <path d={d} fill={`url(#${gid})`} />
    </svg>
  );
}
