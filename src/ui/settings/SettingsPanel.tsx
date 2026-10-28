/**
 * 設定（歯車）の中身：文字の大きさ・演出・効果音と BGM。上の帯の歯車（SettingsButton）と対戦のメニューで同じものを使う。
 * どれも見る人ごと・この端末だけの設定（localStorage）。
 */
import { useState } from 'react';
import { FX_LEVEL_LABEL, useFxLevel } from '../battle/fx/settings.ts';
import { Sheet } from '../components/Sheet.tsx';
import { UiIcon } from '../components/UiIcon.tsx';
import { SoundSettings } from '../sound/SoundSettings.tsx';
import { cx } from '../util.ts';
import { setTextSize, TEXT_SIZE_LABEL, TEXT_SIZES, useTextSize } from './textSize.ts';
import './settings.css';

export function SettingsPanel() {
  const size = useTextSize();
  const fx = useFxLevel();
  return (
    <div className="settings-panel">
      {/* 文字の大きさ：画面の文字（ボタン・説明・ログなど）。カードの面は枠に合わせて変えない */}
      <div className="set-row" role="group" aria-label="文字の大きさ">
        <span>
          <UiIcon name="spectacles" /> 文字の大きさ
        </span>
        <span className="set-row__seg settings-panel__sizes" role="radiogroup" aria-label="文字の大きさ">
          {TEXT_SIZES.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={size === s} className={cx('chip', size === s && 'is-active')} data-size={s} onClick={() => setTextSize(s)}>
              {TEXT_SIZE_LABEL[s]}
            </button>
          ))}
        </span>
        <span className="set-row__note">ボタン・説明・ログなどの文字の大きさ。カードの面の文字は変わりません</span>
      </div>
      {/* 演出（決定事項 #126）：標準／控えめ。端末の「動きを減らす」なら控えめに固定 */}
      <div className="set-row" role="group" aria-label="演出">
        <span>
          <UiIcon name="gi:sparkles" /> 演出
        </span>
        <span className="set-row__seg" role="radiogroup" aria-label="演出">
          {(['full', 'calm'] as const).map((l) => (
            <button key={l} type="button" role="radio" aria-checked={fx.chosen === l} className={cx('chip', fx.chosen === l && 'is-active')} disabled={fx.reduce} onClick={() => fx.setLevel(l)}>
              {FX_LEVEL_LABEL[l]}
            </button>
          ))}
        </span>
        <span className="set-row__note">{fx.reduce ? '端末の「視差効果を減らす／動きを減らす」がオンなので、控えめで表示しています' : '控えめ：対戦で飛ぶ演出や粒を出さず、その場で短く光るだけ'}</span>
      </div>
      {/* 効果音と BGM（決定事項 #127・#128）：オン・オフと音量（既定はオフ） */}
      <SoundSettings />
    </div>
  );
}

/** 上の帯の歯車：押すと設定のシート */
export function SettingsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="nav-btn topbar__gear" aria-label="設定" title="設定（文字の大きさ・演出・効果音・BGM）" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span className="nav-btn__icon" aria-hidden="true">
          <UiIcon name="cog" />
        </span>
        <span className="nav-btn__label">設定</span>
      </button>
      <Sheet open={open} title="設定" onClose={() => setOpen(false)} desktop="modal">
        <SettingsPanel />
      </Sheet>
    </>
  );
}
