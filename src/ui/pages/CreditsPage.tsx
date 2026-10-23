/**
 * クレジット（決定事項 #105）。カードの絵に使っている game-icons.net のアイコンは CC BY 3.0 なので、
 * 作者・出典・ライセンス・変更点（色）をここに書く。ナビの下の帯・ルールページ・アイコンの選択パネルからリンクする。
 */
import { CardArt } from '../components/CardArt.tsx';
import { ICON_SET_VERSION, ICON_TOTAL } from '../icons/generated/info.ts';

const SAMPLES: { icon: string; rarity: 'common' | 'rare' | 'epic' | 'legend'; cardType: 'monster' | 'attack' | 'skill' | 'power' }[] = [
  { icon: 'gi:wolf-head', rarity: 'common', cardType: 'monster' },
  { icon: 'gi:fireball', rarity: 'rare', cardType: 'attack' },
  { icon: 'gi:spell-book', rarity: 'epic', cardType: 'skill' },
  { icon: 'gi:dragon-head', rarity: 'legend', cardType: 'monster' },
  { icon: 'gi:aura', rarity: 'epic', cardType: 'power' },
];

export function CreditsPage() {
  return (
    <div className="credits">
      <div className="page-head">
        <h1>クレジット</h1>
      </div>
      <section className="panel credits__sec">
        <h2>カードの絵（アイコン）</h2>
        <div className="credits__samples" aria-hidden="true">
          {SAMPLES.map((s) => (
            <CardArt key={s.icon} icon={s.icon} rarity={s.rarity} cardType={s.cardType} size={56} />
          ))}
        </div>
        <p>
          カードの絵には、<a href="https://game-icons.net" target="_blank" rel="noreferrer">game-icons.net</a> のアイコン（{ICON_TOTAL}個）を使っています。
          作者は <b>Lorc</b>・<b>Delapouite</b> ほか、game-icons.net の
          <a href="https://game-icons.net/about.html#authors" target="_blank" rel="noreferrer">
            貢献者のみなさん
          </a>
          です。
        </p>
        <p>
          ライセンスは{' '}
          <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">
            クリエイティブ・コモンズ 表示 3.0（CC BY 3.0）
          </a>
          です。このゲームでは、白い絵をレアリティの色のグラデーションで塗り、円い台座と縁取りを付けています（<b>色と見た目を変更</b>しています）。
        </p>
        <p className="hint">
          データは Iconify の @iconify-json/game-icons（版 {ICON_SET_VERSION}）から取り込んでいます。日本語での検索のための訳語はこのゲームで付けたものです。
        </p>
      </section>
      <section className="panel credits__sec">
        <h2>見出しの書体</h2>
        <p>
          見出しとボタンの明朝は <b>しっぽり明朝 B1</b>（Shippori Mincho B1、FONTDASU）を使っています。ライセンスは{' '}
          <a href="https://openfontlicense.org" target="_blank" rel="noreferrer">
            SIL Open Font License 1.1
          </a>{' '}
          です。画面に使う文字だけを切り出してアプリに同梱しています（外から読み込みません）。
        </p>
      </section>
      <section className="panel credits__sec">
        <h2>画面の記号</h2>
        <p>メニューやボタンの記号も、カードの絵と同じ game-icons.net のアイコン（CC BY 3.0）を単色で使っています。</p>
      </section>
      <section className="panel credits__sec">
        <h2>絵文字</h2>
        <p>絵文字のアイコンは、お使いの端末のフォントで表示しています。</p>
      </section>
    </div>
  );
}
