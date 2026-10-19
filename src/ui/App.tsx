import { useEffect } from 'react';
import { ConfirmProvider } from './components/ConfirmDialog.tsx';
import { ToastProvider } from './components/Toast.tsx';
import { CardEditorPage } from './pages/CardEditorPage.tsx';
import { CardListPage } from './pages/CardListPage.tsx';
import { DeckBuilderPage } from './pages/DeckBuilderPage.tsx';
import { DeckListPage } from './pages/DeckListPage.tsx';
import { BattlePage } from './pages/BattlePage.tsx';
import { BattleSetupPage } from './pages/BattleSetupPage.tsx';
import { OnlineBattlePage } from './pages/OnlineBattlePage.tsx';
import { OnlineLobbyPage } from './pages/OnlineLobbyPage.tsx';
import { RulesPage } from './pages/RulesPage.tsx';
import { UiKitPage } from './pages/UiKitPage.tsx';
import { navigate, useRoute } from './router.ts';
import { useStore } from './store.ts';
import { cx } from './util.ts';

export const APP_TITLE = '自作カードバトル';

type Section = 'cards' | 'decks' | 'battle' | 'online' | 'rules';

const NAV: { id: Section; icon: string; label: string; path: string }[] = [
  { id: 'cards', icon: '🃏', label: 'カード', path: '/cards' },
  { id: 'decks', icon: '📚', label: 'デッキ', path: '/decks' },
  { id: 'battle', icon: '🤖', label: 'CPU戦', path: '/battle' },
  { id: 'online', icon: '🌐', label: 'オンライン', path: '/online' },
  { id: 'rules', icon: '📖', label: 'ルール', path: '/rules' },
];

export function App() {
  const route = useRoute();
  const { saveError } = useStore();
  const section: Section =
    route.page === 'decks' || route.page === 'deckEdit'
      ? 'decks'
      : route.page === 'battle' || route.page === 'battleSetup'
        ? 'battle'
        : route.page === 'online' || route.page === 'onlineBattle'
          ? 'online'
          : route.page === 'rules'
            ? 'rules'
            : 'cards';

  // ルールページの節（#/rules/status など）を開いた状態で表示する
  useEffect(() => {
    if (route.page !== 'rules' || !route.section) return;
    const el = document.getElementById(route.section);
    if (el instanceof HTMLDetailsElement) {
      el.open = true;
      el.scrollIntoView({ block: 'start' });
    }
  }, [route]);

  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className="app">
          <header className="topbar">
            <div className="topbar__title">{APP_TITLE}</div>
            <nav className="topbar__nav" aria-label="メニュー">
              {NAV.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={cx('nav-btn', section === n.id && 'is-active')}
                  aria-current={section === n.id ? 'page' : undefined}
                  onClick={() => navigate(n.path)}
                >
                  <span className="nav-btn__icon" aria-hidden="true">
                    {n.icon}
                  </span>
                  <span className="nav-btn__label">{n.label}</span>
                </button>
              ))}
            </nav>
          </header>
          {saveError && (
            <div className="notice notice--ng" role="alert">
              {saveError}
            </div>
          )}
          <main className="main">
            {route.page === 'cards' && <CardListPage />}
            {route.page === 'cardEdit' && <CardEditorPage id={route.id} />}
            {route.page === 'decks' && <DeckListPage />}
            {route.page === 'deckEdit' && <DeckBuilderPage id={route.id} />}
            {route.page === 'battleSetup' && <BattleSetupPage />}
            {route.page === 'battle' && <BattlePage />}
            {route.page === 'online' && <OnlineLobbyPage code={route.code} />}
            {route.page === 'onlineBattle' && <OnlineBattlePage />}
            {route.page === 'rules' && <RulesPage />}
            {route.page === 'uiKit' && <UiKitPage />}
          </main>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}
