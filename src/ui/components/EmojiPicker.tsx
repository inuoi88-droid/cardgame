import { useState } from 'react';
import { EMOJI_GROUPS } from '../emoji.ts';
import { cx } from '../util.ts';
import { Modal } from './controls.tsx';

interface Props {
  value: string;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

const RECENT_KEY = 'cardgame.v1.recentEmoji';
const RECENT_MAX = 8;

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function pushRecent(e: string): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([e, ...readRecent().filter((x) => x !== e)].slice(0, RECENT_MAX)));
  } catch {
    // 保存できなくても困らない
  }
}

export function EmojiPicker({ value, onSelect, onClose }: Props) {
  const [recent] = useState(readRecent);
  const groups = recent.length > 0 ? [{ label: '最近使った', items: recent }, ...EMOJI_GROUPS] : EMOJI_GROUPS;
  return (
    <Modal title="アイコンを選ぶ" onClose={onClose}>
      {groups.map((g) => (
        <section key={g.label} className="emoji-group">
          <h3>{g.label}</h3>
          <div className="emoji-grid">
            {g.items.map((e) => (
              <button
                key={e}
                type="button"
                className={cx('emoji-btn', e === value && 'emoji-btn--active')}
                aria-label={e}
                aria-pressed={e === value}
                onClick={() => {
                  pushRecent(e);
                  onSelect(e);
                  onClose();
                }}
              >
                {e}
              </button>
            ))}
          </div>
        </section>
      ))}
    </Modal>
  );
}
