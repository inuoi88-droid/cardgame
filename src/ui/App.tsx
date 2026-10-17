import { CardEditorPage } from './pages/CardEditorPage.tsx';
import { CardListPage } from './pages/CardListPage.tsx';
import { DeckBuilderPage } from './pages/DeckBuilderPage.tsx';
import { DeckListPage } from './pages/DeckListPage.tsx';
import { BattlePage } from './pages/BattlePage.tsx';
import { BattleSetupPage } from './pages/BattleSetupPage.tsx';
import { OnlineBattlePage } from './pages/OnlineBattlePage.tsx';
import { OnlineLobbyPage } from './pages/OnlineLobbyPage.tsx';
import { navigate, useRoute } from './router.ts';
import { useStore } from './store.ts';
import { cx } from './util.ts';

export function App() {
  const route = useRoute();
  const { saveError } = useStore();
  const section =
    route.page === 'decks' || route.page === 'deckEdit'
      ? 'decks'
      : route.page === 'battle' || route.page === 'battleSetup'
        ? 'battle'
        : route.page === 'online' || route.page === 'onlineBattle'
          ? 'online'
          : 'cards';

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__title">自作カードバトル<small>（仮）</small></div>
        <nav className="topbar__nav" aria-label="メニュー">
          <button type="button" className={cx('nav-btn', section === 'cards' && 'is-active')} onClick={() => navigate('/cards')}>
            🃏 カード
          </button>
          <button type="button" className={cx('nav-btn', section === 'decks' && 'is-active')} onClick={() => navigate('/decks')}>
            📚 デッキ
          </button>
          <button type="button" className={cx('nav-btn', section === 'battle' && 'is-active')} onClick={() => navigate('/battle')}>
            🤖 CPU戦
          </button>
          <button type="button" className={cx('nav-btn', section === 'online' && 'is-active')} onClick={() => navigate('/online')}>
            🌐 オンライン
          </button>
        </nav>
      </header>
      {saveError && <div className="notice notice--ng">{saveError}</div>}
      <main className="main">
        {route.page === 'cards' && <CardListPage />}
        {route.page === 'cardEdit' && <CardEditorPage id={route.id} />}
        {route.page === 'decks' && <DeckListPage />}
        {route.page === 'deckEdit' && <DeckBuilderPage id={route.id} />}
        {route.page === 'battleSetup' && <BattleSetupPage />}
        {route.page === 'battle' && <BattlePage />}
        {route.page === 'online' && <OnlineLobbyPage code={route.code} />}
        {route.page === 'onlineBattle' && <OnlineBattlePage />}
      </main>
    </div>
  );
}
