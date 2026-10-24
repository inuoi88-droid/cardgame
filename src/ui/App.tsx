import { useEffect } from 'react';
import { CardSymbols } from './components/cardParts.tsx';
import { UiIcon, type UiIconName } from './components/UiIcon.tsx';
import { ConfirmProvider } from './components/ConfirmDialog.tsx';
import { ToastProvider } from './components/Toast.tsx';
import { CardEditorPage } from './pages/CardEditorPage.tsx';
import { CardListPage } from './pages/CardListPage.tsx';
import { DeckBuilderPage } from './pages/DeckBuilderPage.tsx';
import { DeckListPage } from './pages/DeckListPage.tsx';
import { BattlePage } from './pages/BattlePage.tsx';
import { BattleSetupPage } from './pages/BattleSetupPage.tsx';
import { DraftPage } from './pages/DraftPage.tsx';
import { OfficialCardsPage } from './pages/OfficialCardsPage.tsx';
import { OnlineBattlePage } from './pages/OnlineBattlePage.tsx';
import { OnlineLobbyPage } from './pages/OnlineLobbyPage.tsx';
import { CreditsPage } from './pages/CreditsPage.tsx';
import { RulesPage } from './pages/RulesPage.tsx';
import { UiKitPage } from './pages/UiKitPage.tsx';
import { navigate, useRoute } from './router.ts';
import { useStore } from './store.ts';
import { cx } from './util.ts';

export const APP_TITLE = '自作カードバトル';

type Section = 'cards' | 'decks' | 'battle' | 'online' | 'rules';

const NAV: { id: Section; icon: UiIconName; label: string; path: string }[] = [
  { id: 'cards', icon: 'card-play', label: 'カード', path: '/cards' },
  { id: 'decks', icon: 'chest', label: 'デッキ', path: '/decks' },
  { id: 'battle', icon: 'crossed-swords', label: 'CPU戦', path: '/battle' },
  { id: 'online', icon: 'world', label: 'オンライン', path: '/online' },
  { id: 'rules', icon: 'rule-book', label: 'ルール', path: '/rules' },
];

export function App() {
  const route = useRoute();
  const { saveError } = useStore();
  const section: Section =
    route.page === 'decks' || route.page === 'deckEdit'
      ? 'decks'
      : route.page === 'battle' || route.page === 'battleSetup' || route.page === 'draft' || route.page === 'official'
        ? 'battle'
        : route.page === 'online' || route.page === 'onlineBattle'
          ? 'online'
          : route.page === 'rules' || route.page === 'credits'
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
        <CardSymbols />
        <div className="app">
          <header className="topbar">
            <div className="topbar__title">
              <span className="topbar__crest" aria-hidden="true">
                <UiIcon name="swords-emblem" />
              </span>
              {APP_TITLE}
            </div>
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
                    <UiIcon name={n.icon} />
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
            {route.page === 'draft' && <DraftPage />}
            {route.page === 'official' && <OfficialCardsPage />}
            {route.page === 'online' && <OnlineLobbyPage code={route.code} />}
            {route.page === 'onlineBattle' && <OnlineBattlePage />}
            {route.page === 'rules' && <RulesPage />}
            {route.page === 'uiKit' && <UiKitPage />}
            {route.page === 'credits' && <CreditsPage />}
          </main>
          {/* カードの絵（game-icons.net、CC BY 3.0）の表示。対戦画面では出さない（決定事項 #105） */}
          {route.page !== 'battle' && route.page !== 'onlineBattle' && (
            <footer className="app-foot">
              カードの絵：
              <a href="https://game-icons.net" target="_blank" rel="noreferrer">
                game-icons.net
              </a>
              （Lorc・Delapouite ほか・CC BY 3.0）・<a href="#/credits">クレジット</a>
            </footer>
          )}
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}
