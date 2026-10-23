/**
 * メダルの列（UI2「黒鉄と金の卓」。決定事項 #112）：丸い鉄の台座に game-icons。選ぶとサファイアの縁と光。
 * CPU 戦の準備の「CPU のデッキ」（プリセットの紋）と「CPU の強さ」（形＋菱形の数 1〜3）で使う。中身は本物のラジオ
 */
import { UiIcon } from '../components/UiIcon.tsx';
import { cx } from '../util.ts';

export interface MedalOption<T extends string> {
  id: T;
  label: string;
  gi: string;
  /** 菱形の数（強さ） */
  pips?: number;
  /** 名前が人の入力・デッキ名なら true（--font-title） */
  isName?: boolean;
}

export function MedalGroup<T extends string>({ label, name, options, value, onChange }: { label: string; name: string; options: MedalOption<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="smedals" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <label key={o.id} className={cx('smedal', value === o.id && 'is-selected')}>
          <input type="radio" className="sr" name={name} checked={value === o.id} onChange={() => onChange(o.id)} />
          <span className="smedal__disc" aria-hidden="true">
            <UiIcon name={`gi:${o.gi}`} />
          </span>
          <span className={cx('smedal__name', o.isName && 'is-name')}>{o.label}</span>
          {o.pips !== undefined && (
            <span className="smedal__pips" aria-hidden="true">
              {Array.from({ length: o.pips }, (_, i) => (
                <i key={i} />
              ))}
            </span>
          )}
        </label>
      ))}
    </div>
  );
}
