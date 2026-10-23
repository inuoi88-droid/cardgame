import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles.css';
// UI2 の D（デッキ一覧・デッキ構築・ロビー・ルールなど）の規則。styles.css の後に読む（同じ強さの規則を上書きするため）
import './pages/pages.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
