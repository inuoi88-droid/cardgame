/**
 * カードの部品（カードデザイン案A「王道ファンタジー」）：コストの六角の宝石・レアリティの小さな宝石・剣／ハート／盾の紋章。
 * 形（SVG）は CardSymbols に1度だけ定義し、各部品は <use> で参照する（数十枚のタイルでも軽い）。
 * 見た目は cardFrame.css。カードの面（CardView）・手札・場のタイル・デッキの行・ダイアログの行で共通に使う。
 */
import { memo, type ReactNode } from 'react';
import { RARITY_LABEL, type CardType, type Rarity } from '../../engine/index.ts';
import { cx } from '../util.ts';
import './cardFrame.css';
import './cardTokens.css';

/** レアリティと種類の色の class（額縁の金属・種類の光）。呪いは額縁だけ黒鉄にする */
export function frameClasses(rarity: Rarity | undefined, cardType?: CardType, curse?: boolean): string {
  return cx(`rar--${rarity ?? 'common'}`, cardType && `ty--${cardType}`, curse && 'is-cursed');
}

/** 名前の長さで銘板の文字を詰める（8字以上・10字以上） */
export function nameFit(name: string): string | undefined {
  const n = [...name].length;
  return n > 9 ? 'is-long' : n > 7 ? 'is-mid' : undefined;
}

/** コストの宝石。tone：short＝エナジー不足（赤）・down＝下がった（緑）・up＝上がった（橙） */
export function CostGem({ cost, tone, className, children, label = true }: { cost: number; tone?: 'short' | 'down' | 'up' | null; className?: string; children?: ReactNode; label?: boolean }) {
  return (
    <span className={cx('cgem', tone && `is-${tone}`, className)}>
      {label && <span className="sr">コスト</span>}
      <i>{cost}</i>
      {children}
    </span>
  );
}

/** レアリティの小さな宝石（コモン丸・レア菱形・エピック五角・レジェンド星） */
export function RarityGem({ rarity, withLabel }: { rarity: Rarity; withLabel?: 'visible' | 'sr' }) {
  return (
    <>
      <svg className="rgem" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
        <use href={`#gem-${rarity}`} />
      </svg>
      {withLabel === 'visible' ? RARITY_LABEL[rarity] : withLabel === 'sr' ? <span className="sr">{RARITY_LABEL[rarity]}</span> : null}
    </>
  );
}

const STAT_LABEL = { atk: '攻撃力', hp: '体力', def: '守備力' } as const;

/** 紋章（剣＝攻撃力・ハート＝体力・盾＝守備力）。is-buffed は明るい緑、is-hurt は薄い赤 */
export function Emblem({
  kind,
  value,
  buffed,
  hurt,
  className,
  srLabel = true,
  mini,
}: {
  kind: 'atk' | 'hp' | 'def';
  value: number;
  buffed?: boolean;
  hurt?: boolean;
  className?: string;
  srLabel?: boolean;
  /** 小さく描く（攻撃力は小さい印 #emb-atk-mini） */
  mini?: boolean;
}) {
  return (
    <span className={cx('emb', `emb--${kind}`, buffed && 'is-buffed', hurt && 'is-hurt', className)}>
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <use href={`#emb-${kind}${mini && kind === 'atk' ? '-mini' : ''}`} />
      </svg>
      {srLabel && <span className="sr">{STAT_LABEL[kind]}</span>}
      <b>{value}</b>
    </span>
  );
}

/** 小さな行の中のステータス（剣・ハート・盾の小さな印＋数字） */
export function StatMini({ attack, hp, defense }: { attack: number; hp: number; defense: number }) {
  return (
    <span className="smini">
      <span className="smini__s smini__s--atk">
        <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
          <use href="#emb-atk-mini" />
        </svg>
        <span className="sr">攻撃力</span>
        {attack}
      </span>
      <span className="smini__s smini__s--hp">
        <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
          <use href="#emb-hp" />
        </svg>
        <span className="sr">体力</span>
        {hp}
      </span>
      {defense > 0 && (
        <span className="smini__s smini__s--def">
          <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
            <use href="#emb-def" />
          </svg>
          <span className="sr">守備力</span>
          {defense}
        </span>
      )}
    </span>
  );
}

/** 宝石と紋章の形。アプリの根元に1度だけ置く（見えない SVG。display:none にするとグラデーションが効かないので大きさ0で置く） */
export const CardSymbols = memo(function CardSymbols() {
  return (
    <svg className="card-symbols" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="gg-common" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f4f6fa" />
          <stop offset=".55" stopColor="#9aa3b1" />
          <stop offset="1" stopColor="#5b6372" />
        </linearGradient>
        <linearGradient id="gg-rare" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d9ecff" />
          <stop offset=".5" stopColor="#4aa0ff" />
          <stop offset="1" stopColor="#1b4fb0" />
        </linearGradient>
        <linearGradient id="gg-epic" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3e3ff" />
          <stop offset=".5" stopColor="#b56dff" />
          <stop offset="1" stopColor="#5d23a8" />
        </linearGradient>
        <linearGradient id="gg-legend" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff6c8" />
          <stop offset=".5" stopColor="#f6c445" />
          <stop offset="1" stopColor="#a86d0c" />
        </linearGradient>
        <symbol id="gem-common" viewBox="0 0 12 12">
          <circle cx="6" cy="6" r="4.6" fill="url(#gg-common)" stroke="#11131a" strokeWidth="1" />
        </symbol>
        <symbol id="gem-rare" viewBox="0 0 12 12">
          <path d="M6 .8 11.2 6 6 11.2.8 6Z" fill="url(#gg-rare)" stroke="#0b1530" strokeWidth="1" />
          <path d="M6 .8 6 11.2M.8 6h10.4" stroke="rgba(255,255,255,.35)" strokeWidth=".6" />
        </symbol>
        <symbol id="gem-epic" viewBox="0 0 12 12">
          <path d="M6 .6 11 4.2 9 11H3L1 4.2Z" fill="url(#gg-epic)" stroke="#1a0b30" strokeWidth="1" />
          <path d="M1 4.2h10M6 .6 4 4.2 6 11 8 4.2Z" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth=".6" />
        </symbol>
        <symbol id="gem-legend" viewBox="0 0 12 12">
          <path d="M6 .4 7.6 4.3 11.7 4.6 8.6 7.2 9.6 11.3 6 9.1 2.4 11.3 3.4 7.2.3 4.6 4.4 4.3Z" fill="url(#gg-legend)" stroke="#2a1800" strokeWidth=".9" strokeLinejoin="round" />
        </symbol>
        <linearGradient id="eg-steel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f2f5fa" />
          <stop offset=".5" stopColor="#9aa6ba" />
          <stop offset="1" stopColor="#4a5468" />
        </linearGradient>
        <radialGradient id="eg-atk" cx=".38" cy=".3" r=".8">
          <stop offset="0" stopColor="#ffd37a" />
          <stop offset=".45" stopColor="#e88a2a" />
          <stop offset="1" stopColor="#8a3a08" />
        </radialGradient>
        <radialGradient id="eg-hp" cx=".35" cy=".25" r=".85">
          <stop offset="0" stopColor="#ff9a9a" />
          <stop offset=".45" stopColor="#e23246" />
          <stop offset="1" stopColor="#7a0b1c" />
        </radialGradient>
        <linearGradient id="eg-def" x1="0" y1="0" x2=".6" y2="1">
          <stop offset="0" stopColor="#cfe0f5" />
          <stop offset=".45" stopColor="#6f86a8" />
          <stop offset="1" stopColor="#2c3a52" />
        </linearGradient>
        <g id="emb-sword">
          <path d="M24 -3 28.2 3V30h-8.4V3Z" fill="url(#eg-steel)" stroke="#14161e" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M24 -1V29" stroke="rgba(255,255,255,.6)" strokeWidth="1" />
          <rect x="13.5" y="29" width="21" height="4.4" rx="1.6" fill="#d9a03a" stroke="#2a1806" strokeWidth="1.1" />
          <rect x="22" y="33" width="4" height="9.5" fill="#6b3d18" stroke="#1d0f04" strokeWidth=".9" />
          <circle cx="24" cy="44.5" r="3.2" fill="#d9a03a" stroke="#2a1806" strokeWidth="1" />
        </g>
        <symbol id="emb-atk" viewBox="0 0 48 48" overflow="visible">
          <use href="#emb-sword" transform="translate(24 24) scale(.86) translate(-24 -24) rotate(-45 24 24)" />
          <use href="#emb-sword" transform="translate(24 24) scale(.86) translate(-24 -24) rotate(45 24 24)" />
          <circle cx="24" cy="24.5" r="14.2" fill="url(#eg-atk)" stroke="#2a1204" strokeWidth="1.8" />
          <circle cx="24" cy="24.5" r="11.6" fill="none" stroke="rgba(255,230,170,.55)" strokeWidth="1" />
        </symbol>
        {/* 小さい印（12〜14px：デッキの行・ダイアログの行・スマホのタイル）：円盤を小さくし、刃を太く長くして交差した剣と読めるように */}
        <symbol id="emb-atk-mini" viewBox="0 0 48 48" overflow="visible">
          <use href="#emb-sword" transform="rotate(-45 24 24) translate(24 24) scale(1.45 1.02) translate(-24 -24)" />
          <use href="#emb-sword" transform="rotate(45 24 24) translate(24 24) scale(1.45 1.02) translate(-24 -24)" />
          <circle cx="24" cy="24.5" r="6.8" fill="url(#eg-atk)" stroke="#2a1204" strokeWidth="1.8" />
        </symbol>
        <symbol id="emb-hp" viewBox="0 0 48 48" overflow="visible">
          <path d="M24 44.5C10.5 35.2 3 27 3 16.6 3 9.3 8.4 4 14.8 4c4.3 0 7.4 2.3 9.2 5.6C25.8 6.3 28.9 4 33.2 4 39.6 4 45 9.3 45 16.6 45 27 37.5 35.2 24 44.5Z" fill="url(#eg-hp)" stroke="#2a050b" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M10 13.5c1-3.4 3.8-5.2 7-5" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="2" strokeLinecap="round" />
        </symbol>
        <symbol id="emb-def" viewBox="0 0 48 48" overflow="visible">
          <path d="M24 2.5 42.5 8.6V22c0 11-7.6 18.4-18.5 23.5C13.1 40.4 5.5 33 5.5 22V8.6Z" fill="url(#eg-def)" stroke="#0c1424" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M24 6.6 38.6 11.4V22c0 8.6-5.6 14.6-14.6 19" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="1" />
        </symbol>
      </defs>
    </svg>
  );
});
