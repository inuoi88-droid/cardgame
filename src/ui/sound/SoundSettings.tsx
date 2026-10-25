/**
 * 効果音の設定（決定事項 #127）：「効果音」のオン・オフと音量。対戦のメニュー（歯車）とルールの画面の上に置く。
 * オンにしたら確認の音（ui.confirm）を鳴らす（この操作の中で音を出せるようにする：sound/index.ts）。音量は離したときに試しの音。
 */
import { useId, type CSSProperties } from 'react';
import { UiIcon } from '../components/UiIcon.tsx';
import { cx } from '../util.ts';
import { sfx, soundSupported } from './index.ts';
import { setSoundPref, useSoundPref } from './settings.ts';
import './sound.css';

export function SoundSettings({ className }: { className?: string }) {
  const pref = useSoundPref();
  const id = useId();
  const supported = soundSupported();
  const pct = Math.round(pref.volume * 100);
  const preview = () => sfx('ui.click', { wait: true });
  return (
    <div className={cx('sound-setting', className)} role="group" aria-labelledby={`${id}-t`}>
      <label className="switch sound-setting__switch">
        <span className="sound-setting__title" id={`${id}-t`}>
          <UiIcon name="speaker" /> 効果音
        </span>
        <input
          type="checkbox"
          role="switch"
          className="u-toggle"
          checked={pref.on}
          disabled={!supported}
          aria-describedby={`${id}-n`}
          data-sfx="none"
          onChange={(e) => {
            const on = e.target.checked;
            setSoundPref({ on });
            if (on) sfx('ui.confirm', { wait: true });
          }}
        />
        <span className="sound-setting__state" aria-hidden="true">
          {pref.on ? 'オン' : 'オフ'}
        </span>
      </label>
      <label className={cx('sound-setting__vol', !pref.on && 'is-off')}>
        <span>音量</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={pct}
          disabled={!pref.on}
          aria-valuetext={`${pct}%`}
          style={{ '--vol': `${pct}%` } as CSSProperties}
          onChange={(e) => setSoundPref({ volume: Number(e.target.value) / 100 })}
          onPointerUp={preview}
          onKeyUp={(e) => (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End' || e.key.startsWith('Page')) && preview()}
        />
        <output className="sound-setting__pct">{pct}%</output>
      </label>
      <span className="sound-setting__note" id={`${id}-n`}>
        {!supported
          ? 'この端末のブラウザでは効果音を鳴らせません。'
          : `${pref.on ? '' : 'オンにすると、操作と対戦の演出に効果音が付きます。'}iPhone・iPad は消音モード（マナーモード）の間は鳴りません。`}
      </span>
    </div>
  );
}
