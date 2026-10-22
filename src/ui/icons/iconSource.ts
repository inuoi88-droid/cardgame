/**
 * アイコンの形と索引の読み方：ふつうの版（決定事項 #105・#106）。
 *
 * - 形は1つずつ public/icons/<stamp>/<名前>.txt を fetch する（1〜3KB。見えている絵の分だけ）。
 * - デプロイの前から開いていたタブが古い stamp の置き場所を引いて 404 になったら、icons/current.txt でいまの stamp を1回だけ確かめて引き直す。
 * - 索引（名前の一覧と日本語の辞書）は選択パネルを開いたときに動的 import で読む（本体には入らない）。
 *
 * 1ファイル版（vite build --mode single）では iconSource.single.ts に差し替わる（vite.config.ts）。
 */
import { ICON_STAMP } from './generated/info.ts';
import { isPathData } from './ref.ts';

export interface IconIndexData {
  names: string[];
  ja: Record<string, string>;
}

let stamp = ICON_STAMP;
let stampCheck: Promise<boolean> | null = null;

function iconUrl(st: string, name: string): URL {
  return new URL(`./icons/${st}/${name}.txt`, document.baseURI);
}

/** 1つ引く。undefined は「その置き場所に無い」（404。開発サーバーが index.html を返したときも） */
async function get(st: string, name: string): Promise<string | null | undefined> {
  const res = await fetch(iconUrl(st, name));
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`icon ${name}: ${res.status}`);
  const d = (await res.text()).trim();
  return isPathData(d) ? d : undefined;
}

/** いまの stamp が変わっていたら切り替える（変わっていれば true）。1回だけ */
function checkStamp(): Promise<boolean> {
  if (!stampCheck) {
    stampCheck = fetch(new URL('./icons/current.txt', document.baseURI), { cache: 'no-cache' })
      .then(async (res) => {
        if (!res.ok) return false;
        const t = (await res.text()).trim();
        if (!/^[0-9a-f]{16}$/.test(t) || t === stamp) return false;
        stamp = t;
        return true;
      })
      .catch(() => {
        stampCheck = null;
        return false;
      });
  }
  return stampCheck;
}

/** アイコンの形（path の d）。無い名前は null。通信の失敗は例外（あとでもう一度読む） */
export async function fetchIconPath(name: string): Promise<string | null> {
  const st = stamp;
  const d = await get(st, name);
  if (d !== undefined) return d;
  if (st !== stamp || (await checkStamp())) return (await get(stamp, name)) ?? null;
  return null;
}

export async function fetchIconIndex(): Promise<IconIndexData> {
  const m = await import('./generated/index.json');
  const data = (m as { default: IconIndexData }).default;
  return { names: data.names, ja: data.ja };
}
