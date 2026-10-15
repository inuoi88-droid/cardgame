import { EMOJI_GROUPS } from '../emoji.ts';
import { cx } from '../util.ts';
import { Modal } from './controls.tsx';

interface Props {
  value: string;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ value, onSelect, onClose }: Props) {
  return (
    <Modal title="アイコンを選ぶ" onClose={onClose}>
      {EMOJI_GROUPS.map((g) => (
        <section key={g.label} className="emoji-group">
          <h3>{g.label}</h3>
          <div className="emoji-grid">
            {g.items.map((e) => (
              <button
                key={e}
                type="button"
                className={cx('emoji-btn', e === value && 'emoji-btn--active')}
                onClick={() => {
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
