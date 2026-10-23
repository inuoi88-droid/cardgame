/** 対戦のオプション（MTG 要素 △ バッチD）の入力欄：リーダー（選択パネル）・次元・昼と夜。CPU 戦の準備画面とオンラインのロビーで共用 */
import type { PlanarMode } from '../../engine/index.ts';
import { UiIcon } from '../components/UiIcon.tsx';
import { OptionPicker } from '../editor/OptionPicker.tsx';
import { cx } from '../util.ts';
import { PLANAR_CHOICES, leaderOptions, type LeaderChoice } from './matchOptions.ts';
import './battle.css';

export function LeaderField({ label, title, value, onChange, allowRandom = false, id }: { label: string; title: string; value: LeaderChoice; onChange: (v: LeaderChoice) => void; allowRandom?: boolean; id?: string }) {
  return (
    <OptionPicker
      className="match-opt__leader"
      label={label}
      title={title}
      value={value}
      options={leaderOptions(allowRandom)}
      onChange={(v) => onChange(v as LeaderChoice)}
      note="リーダーは対戦のあいだずっと効く小さな効果です（カードのポイントとは関係ありません）"
      {...(id ? { id } : {})}
    />
  );
}

export function RulesFields({ field, dayNight, onField, onDayNight, name }: { field: PlanarMode; dayNight: boolean; onField: (v: PlanarMode) => void; onDayNight: (v: boolean) => void; name: string }) {
  return (
    <div className="match-opt">
      <div className="choice-list choice-list--row" role="radiogroup" aria-label="次元（フィールド）">
        {PLANAR_CHOICES.map((c) => (
          <label key={c.id} className={cx('choice', field === c.id && 'is-active')}>
            <input type="radio" name={`${name}-field`} checked={field === c.id} onChange={() => onField(c.id)} />
            <span>
              <b>次元：{c.label}</b>
              <small>{c.description}</small>
            </span>
          </label>
        ))}
      </div>
      <label className={cx('choice', 'match-opt__daynight', dayNight && 'is-active')}>
        <input type="checkbox" checked={dayNight} onChange={(e) => onDayNight(e.target.checked)} />
        <span>
          <b>
            <UiIcon name="gi:sun" />
            <UiIcon name="gi:moon" /> 昼と夜
          </b>
          <small>昼で始まり、カードの使い方で昼と夜が入れ替わる（オフでも「昼なら／夜なら」のカードが出たら始まる）</small>
        </span>
      </label>
    </div>
  );
}
