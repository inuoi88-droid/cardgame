/**
 * 種族の特性と揃えたときのボーナスの説明（決定事項 #143）。カードの詳細（一覧・デッキ構築・対戦）で使う。
 * 得意・苦手はポイントの話なので、ここでは対戦で働くものだけ
 */
import { BALANCE, TRIBE_SETS, TRIBE_TRAITS, type TribeId } from '../../engine/index.ts';
import './cards.css';

export function TribeInfo({ tribe }: { tribe: TribeId }) {
  return (
    <dl className="tribe-info">
      <div>
        <dt>特性「{TRIBE_TRAITS[tribe].name}」</dt>
        <dd>{TRIBE_TRAITS[tribe].text}</dd>
      </div>
      <div>
        <dt>
          揃い「{TRIBE_SETS[tribe].name}」<small>（場に{BALANCE.tribes.setSize}体以上）</small>
        </dt>
        <dd>{TRIBE_SETS[tribe].text}</dd>
      </div>
    </dl>
  );
}
