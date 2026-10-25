/**
 * 効果音と BGM の設定（決定事項 #127・#128）：それぞれのオン・オフと音量。対戦のメニュー（歯車）とルールの画面の上に置く。
 * 効果音をオンにしたら確認の音（ui.confirm）を鳴らす（この操作の中で音を出せるようにする：sound/index.ts）。音量は離したときに試しの音。
 * BGM はオンにしたら、その画面の曲が流れ始める（音量のつまみはそのまま聞きながら合わせる）。
 */
import { useId, type CSSProperties, type ReactNode } from 'react';
import { UiIcon, type UiIconProps } from '../components/UiIcon.tsx';
import { cx } from '../util.ts';
import { BGM_REMOTE } from './bgmSource.ts';
import { sfx, soundSupported } from './index.ts';
import { setMusicPref, setSoundPref, useMusicPref, useSoundPref, type SoundPref } from './settings.ts';
import './sound.css';

export function SoundSettings({ className }: { className?: string }) {
  const pref = useSoundPref();
  const music = useMusicPref();
  const supported = soundSupported();
  const preview = () => sfx('ui.click', { wait: true });
  return (
    <div className={cx('sound-settings', className)}>
      <SoundRow
        title="効果音"
        icon="speaker"
        pref={pref}
        supported={supported}
        onToggle={(on) => {
          setSoundPref({ on });
          if (on) sfx('ui.confirm', { wait: true });
        }}
        onVolume={(volume) => setSoundPref({ volume })}
        onRelease={preview}
        note={!supported ? 'この端末のブラウザでは効果音を鳴らせません。' : pref.on ? null : 'オンにすると、操作と対戦の演出に効果音が付きます。'}
      />
      <SoundRow
        title="BGM"
        icon="lyre"
        pref={music}
        supported={supported}
        onToggle={(on) => setMusicPref({ on })}
        onVolume={(volume) => setMusicPref({ volume })}
        note={
          !supported
            ? 'この端末のブラウザでは BGM を流せません。'
            : `${music.on ? '' : 'オンにすると、ロビー・カードとデッキ作り・ドラフト・対戦でそれぞれの曲が流れます。'}${BGM_REMOTE ? '1ファイル版は曲を公開サイトから読みます（ネットにつながっていないと流れません）。' : ''}` || null
        }
      />
      {supported && <span className="sound-setting__note">iPhone・iPad は消音モード（マナーモード）の間は鳴りません。</span>}
    </div>
  );
}

function SoundRow({
  title,
  icon,
  pref,
  supported,
  onToggle,
  onVolume,
  onRelease,
  note,
}: {
  title: string;
  icon: UiIconProps['name'];
  pref: SoundPref;
  supported: boolean;
  onToggle: (on: boolean) => void;
  onVolume: (v: number) => void;
  /** つまみを離したとき（効果音は試しの音） */
  onRelease?: () => void;
  note: ReactNode;
}) {
  const id = useId();
  const pct = Math.round(pref.volume * 100);
  return (
    <div className="sound-setting" role="group" aria-labelledby={`${id}-t`}>
      <label className="switch sound-setting__switch">
        <span className="sound-setting__title" id={`${id}-t`}>
          <UiIcon name={icon} /> {title}
        </span>
        <input
          type="checkbox"
          role="switch"
          className="u-toggle"
          checked={pref.on}
          disabled={!supported}
          aria-describedby={note ? `${id}-n` : undefined}
          data-sfx="none"
          onChange={(e) => onToggle(e.target.checked)}
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
          aria-label={`${title}の音量`}
          aria-valuetext={`${pct}%`}
          style={{ '--vol': `${pct}%` } as CSSProperties}
          onChange={(e) => onVolume(Number(e.target.value) / 100)}
          onPointerUp={onRelease}
          onKeyUp={(e) => onRelease && (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End' || e.key.startsWith('Page')) && onRelease()}
        />
        <output className="sound-setting__pct">{pct}%</output>
      </label>
      {note && (
        <span className="sound-setting__note" id={`${id}-n`}>
          {note}
        </span>
      )}
    </div>
  );
}
