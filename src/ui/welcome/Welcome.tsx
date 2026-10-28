/**
 * はじめての案内：初めての人（自作のカードもデッキも無い）に、何から遊べるかを1回だけ見せる。
 * 行き先を選ぶか閉じると印（cardgame.v1.welcome）を付け、もう出さない。ルールの画面の「はじめての案内」からもう一度開ける。
 */
import { useSyncExternalStore } from 'react';
import { Modal } from '../components/controls.tsx';
import { UiIcon } from '../components/UiIcon.tsx';
import { navigate } from '../router.ts';
import { useStore } from '../store.ts';
import { cx } from '../util.ts';
import { parseWelcomeSeen, shouldShowWelcome, WELCOME_CHOICES, WELCOME_KEY } from './welcomeLogic.ts';
import './welcome.css';

interface WelcomeState {
  seen: boolean;
  /** ルールの画面から開き直した */
  forced: boolean;
}

let state: WelcomeState | null = null;
const listeners = new Set<() => void>();

function readSeen(): boolean {
  try {
    const raw = localStorage.getItem(WELCOME_KEY);
    return raw !== null && parseWelcomeSeen(JSON.parse(raw));
  } catch {
    return false;
  }
}

const get = (): WelcomeState => (state ??= { seen: typeof window === 'undefined' ? true : readSeen(), forced: false });

function set(next: WelcomeState): void {
  state = next;
  for (const f of listeners) f();
}

function subscribe(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** 閉じた印を付ける（保存できなくても今の画面では閉じる） */
function markSeen(): void {
  try {
    localStorage.setItem(WELCOME_KEY, JSON.stringify({ seen: true }));
  } catch {
    // 保存できなくても今の画面では閉じる
  }
  set({ seen: true, forced: false });
}

/** もう一度開く（ルールの画面のボタン） */
export function reopenWelcome(): void {
  set({ ...get(), forced: true });
}

export function WelcomeGuide({ page }: { page: string }) {
  const { seen, forced } = useSyncExternalStore(subscribe, get, get);
  const { cards, decks } = useStore();
  const show = forced || shouldShowWelcome({ cards: cards.length, decks: decks.length, seen, page });
  if (!show) return null;
  const go = (path: string) => {
    markSeen();
    navigate(path);
  };
  return (
    <Modal
      title="ようこそ"
      onClose={markSeen}
      size="md"
      description={
        <span className="welcome__lead">
          <UiIcon name="direction-signs" />
          自作のカードで戦う、1対1のカードゲームです。まずは遊び方を選んでください。
        </span>
      }
    >
      <div className="welcome">
        <ul className="welcome__list">
          {WELCOME_CHOICES.map((c, i) => (
            <li key={c.id}>
              <button type="button" className={cx('btn welcome__choice', i === 0 && 'btn--primary')} data-welcome={c.id} onClick={() => go(c.path)}>
                <span className="welcome__icon" aria-hidden="true">
                  <UiIcon name={c.icon} />
                </span>
                <span className="welcome__text">
                  <b>{c.title}</b>
                  <small>{c.text}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="welcome__foot">
          この案内はルールの画面からもう一度開けます。
          <button type="button" className="btn btn--small btn--ghost" onClick={markSeen}>
            あとで
          </button>
        </p>
      </div>
    </Modal>
  );
}
