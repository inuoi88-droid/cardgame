/**
 * ダメージの見込みの札の言葉（純粋関数。決定事項 #138。tests/battle/damagePreview.test.ts）。
 * エンジンの previewAction の1件（PreviewHit）から、大きい数字・HP の変化・理由（聖盾・シールド・守備力・やけど・脱力など）を作る
 */
import { BALANCE, type battle } from '../../engine/index.ts';

export interface HitTexts {
  /** 大きく出す数字（減る HP。ランダムなら「？」） */
  num: string;
  /** HP（体力）の変化 */
  hp: string;
  /** 理由（多すぎるときは先頭から） */
  notes: string[];
  /** 倒れる・決着 */
  kill: boolean;
  /** 何も減らない（聖盾など） */
  none: boolean;
}

/** 計算の内訳の1つ（「守備力−20で80」など）を短い理由にする。理由にしないもの（基本の加算など）は null */
function stepNote(step: string): string | null {
  const s = step.trim();
  let m: RegExpExecArray | null;
  if ((m = /^守備力−(\d+)/.exec(s))) return `守備力−${m[1]}`;
  if (s.startsWith('やけどで')) return `やけどで${BALANCE.battle.burnDamageRateLabel}`;
  if ((m = /^脱力で(\d+)/.exec(s))) return `脱力で${m[1]}まで`;
  if (s.startsWith('脆弱で')) return '脆弱で増える';
  if ((m = /^出血\+(\d+)/.exec(s))) return `出血+${m[1]}`;
  if ((m = /^筋力・気合\+(\d+)/.exec(s))) return `筋力・気合+${m[1]}`;
  if ((m = /^最低(\d+)/.exec(s))) return `最低${m[1]}`;
  if (s === '防御無視') return '防御無視';
  if (s === '無効化で0') return '無効化で0';
  return null;
}

const MAX_NOTES = 3;

/** 状態異常の短い言葉（量・ターン数・個数つき） */
const STATUS_TEXT: Record<string, (n: number) => string> = {
  poison: (n) => `毒+${n}`,
  burn: (n) => `やけど${n}T`,
  weak: (n) => `脱力+${n}`,
  vulnerable: (n) => `脆弱${n}T`,
  bleed: (n) => `出血+${n}`,
  doom: (n) => `呪縛+${n}`,
  freeze: () => '凍結',
  confuse: () => '混乱',
  rad: (n) => `放射能+${n}`,
};
const statusText = (s: { status: string; amount: number }) => STATUS_TEXT[s.status]?.(s.amount) ?? s.status;

export function hitTexts(h: battle.PreviewHit): HitTexts {
  const isPlayer = h.target.kind === 'player';
  const notes: string[] = [];
  const add = (n: string | null) => {
    if (n && !notes.includes(n)) notes.push(n);
  };
  if (h.blocked.includes('protection')) add('加護で0');
  if (h.blocked.includes('divineShield')) add('聖盾で0');
  if (h.blocked.includes('nullify')) add('無効化で0');
  if (h.shieldUsed > 0) add(`シールドが${h.shieldUsed}防ぐ`);
  if (h.survived === 'undying') add('不屈で残る');
  if (h.survived === 'indestructible') add('不壊で残る');
  for (const step of h.steps) for (const part of step.split(' → ')) add(stepNote(part));
  if (h.random) notes.unshift('ランダム');
  const kill = h.destroyed;
  const label = isPlayer ? 'HP' : '体力';
  // 状態異常だけ（ダメージなし）なら、それを大きく出す
  const statusOnly = h.dealt === 0 && h.blocked.length === 0 && !kill && h.statuses.length > 0;
  for (const s of statusOnly ? h.statuses.slice(1) : h.statuses) add(statusText(s));
  return {
    num: h.random ? '？' : statusOnly ? statusText(h.statuses[0]!) : kill && !isPlayer && h.hpLost === 0 ? '破壊' : `−${h.hpLost}`,
    hp: kill ? (isPlayer ? `${label} ${h.hpBefore}→0` : '倒せる') : `${label} ${h.hpBefore}→${h.hpAfter}`,
    notes: notes.slice(0, MAX_NOTES),
    kill,
    none: !kill && h.hpLost === 0 && !h.random && !statusOnly,
  };
}
