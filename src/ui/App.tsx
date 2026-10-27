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
import { OfficialEditPage } from './plaza/OfficialEditPage.tsx';
import { PlazaPage } from './plaza/PlazaPage.tsx';
import { PlazaRuntime } from './plaza/PlazaRuntime.tsx';
import { BuildStamp } from './plaza/StaffEntry.tsx';
import { OnlineBattlePage } from './pages/OnlineBattlePage.tsx';
import { OnlineLobbyPage } from './pages/OnlineLobbyPage.tsx';
import { CreditsPage } from './pages/CreditsPage.tsx';
import { NewsBanner } from './news/NewsBanner.tsx';
import { PatchNotesPage } from './news/PatchNotesPage.tsx';
import { RulesPage } from './pages/RulesPage.tsx';
import { UiKitPage } from './pages/UiKitPage.tsx';
import { FriendLinkPage } from './social/FriendLinkPage.tsx';
import { InviteBanner } from './social/InviteNotices.tsx';
import { SocialRuntime } from './social/SocialRuntime.tsx';
import { badgeCount } from './social/socialLogic.ts';
import { useSocial } from './social/socialStore.ts';
import { navigate, useRoute } from './router.ts';
import { sceneForPage, setBaseBgmScene } from './sound/bgmScene.ts';
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

/** 招待の知らせを上に出さない画面 */
const NO_BANNER: ReadonlySet<string> = new Set(['online', 'onlineBattle', 'friendLink', 'battle', 'draft']);

export function App() {
  const route = useRoute();
  const { saveError } = useStore();
  // オンラインのタブの印：届いたフレンド申請と対戦の招待の数（決定事項 #123）
  const badge = badgeCount(useSocial().snap);
  // 公式カードの一覧（#/official）は CPU 戦・オンラインのどちらからも開くので、どのタブも光らせない
  const section: Section | null =
    route.page === 'official' || route.page === 'officialEdit' || route.page === 'plaza'
      ? null
      : route.page === 'decks' || route.page === 'deckEdit'
      ? 'decks'
      : route.page === 'battle' || route.page === 'battleSetup' || route.page === 'draft'
        ? 'battle'
        : route.page === 'online' || route.page === 'onlineBattle' || route.page === 'friendLink'
          ? 'online'
          : route.page === 'rules' || route.page === 'credits' || route.page === 'news'
            ? 'rules'
            : 'cards';

  // BGM の場面（決定事項 #128）：画面から決まる土台。対戦・ドラフトの盤面はその中で上書きする
  useEffect(() => setBaseBgmScene(sceneForPage(route.page)), [route.page]);

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
        <SocialRuntime />
        <PlazaRuntime />
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
                    {n.id === 'online' && badge > 0 && <span className="nav-btn__badge">{badge > 9 ? '9+' : badge}</span>}
                  </span>
                  <span className="nav-btn__label">{n.label}</span>
                  {n.id === 'online' && badge > 0 && <span className="u-sr-only">（新しいお知らせ {badge}件）</span>}
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
            {/* 届いた対戦の招待（流れの中。オンラインの画面はロビーに、対戦・ドラフトの画面は見出しの札に出す：決定事項 #124） */}
            {!NO_BANNER.has(route.page) && <InviteBanner />}
            {/* 新しい更新のお知らせ（決定事項 #131）：対戦・ドラフトの途中と更新情報の画面には出さない */}
            {!NO_BANNER.has(route.page) && route.page !== 'news' && <NewsBanner />}
            {route.page === 'cards' && <CardListPage />}
            {route.page === 'cardEdit' && <CardEditorPage id={route.id} />}
            {route.page === 'decks' && <DeckListPage />}
            {route.page === 'deckEdit' && <DeckBuilderPage id={route.id} />}
            {route.page === 'battleSetup' && <BattleSetupPage />}
            {route.page === 'battle' && <BattlePage />}
            {route.page === 'draft' && <DraftPage />}
            {route.page === 'official' && <OfficialCardsPage />}
            {route.page === 'officialEdit' && <OfficialEditPage id={route.id} />}
            {route.page === 'plaza' && <PlazaPage />}
            {route.page === 'online' && <OnlineLobbyPage code={route.code} tab={route.tab === 'friends' ? 'friends' : 'battle'} />}
            {route.page === 'friendLink' && <FriendLinkPage parts={route.parts} />}
            {route.page === 'onlineBattle' && <OnlineBattlePage />}
            {route.page === 'rules' && <RulesPage />}
            {route.page === 'uiKit' && <UiKitPage />}
            {route.page === 'credits' && <CreditsPage />}
            {route.page === 'news' && <PatchNotesPage />}
          </main>
          {/* カードの絵（game-icons.net、CC BY 3.0）の表示。対戦画面では出さない（決定事項 #105） */}
          {route.page !== 'battle' && route.page !== 'onlineBattle' && (
            <footer className="app-foot">
              カードの絵：
              <a href="https://game-icons.net" target="_blank" rel="noreferrer">
                game-icons.net
              </a>
              （Lorc・Delapouite ほか・CC BY 3.0）・<a href="#/credits">クレジット</a>・<a href="#/news">更新情報</a>・<a href="#/plaza">みんなの広場</a>
              <BuildStamp />
            </footer>
          )}
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}
