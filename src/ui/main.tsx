import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { initSound } from './sound/index.ts';
import './styles.css';
// UI2 の D（デッキ一覧・デッキ構築・ロビー・ルールなど）の規則。styles.css の後に読む（同じ強さの規則を上書きするため）
import './pages/pages.css';

// 効果音（決定事項 #127。既定はオフ）：演出の合図と画面の操作の音をつなぐ。音の本体とファイルはオンにしてから読む
initSound();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
