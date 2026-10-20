/**
 * カードの詳細：大きいカード（CardView）に、レアリティ・コスト・説明文・キーワードと状態の説明、
 * 場のモンスターなら今の攻撃力・体力・守備力、パワーなら残っている効果を添える。
 * 対戦画面ではシート（スマホは下から、PC は中央のモーダル）、ダイアログの中ではモーダルで出す。
 */
import type { ReactNode } from 'react';
import { analyzeCard, battle, CARD_TYPE_LABEL, describeEffect, CURSE_LABEL, RARITY_LABEL, TRIBE_LABEL, type CardDef } from '../../engine/index.ts';
import { CardView } from '../components/CardView.tsx';
import { Modal } from '../components/controls.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { keywordGlossary } from '../glossary.ts';
import { cx } from '../util.ts';
import { attackOf, monsterChips, powerLines } from './parts.tsx';

export interface DetailExtras {
  /** 場のモンスター（今の値・状態を出す） */
  monster?: battle.Monster;
  flags?: ReturnType<typeof battle.keywordFlags>;
  /** 今の持ち主が自分のターンを迎えた回数（消耗の表示） */
  ownerTurns?: number;
  /** 実効攻撃力（激励を含む） */
  attackNow?: number;
  /** 場に残っているパワー */
  power?: battle.PowerInst;
  /** 手札での今のコスト（元のコストと違えば並べて出す） */
  cost?: number;
  /** 注意（使えない理由・発動しない効果など） */
  notes?: string[];
  /** 持ち主の表示（「あなたの場」「相手の場」など） */
  where?: string;
  /** 装備しているカード（MTG 要素 ○ バッチB） */
  equipment?: CardDef[];
  /** 裏向きの自分のモンスターの正体（MTG 要素 △ バッチC。持ち主にだけ） */
  realDef?: CardDef;
}

/** カードの自由記述の説明（CardDef に description があれば。無い版のデータでも動くように読む） */
export function descriptionOf(def: CardDef): string {
  const d = (def as { description?: unknown }).description;
  return typeof d === 'string' ? d.trim() : '';
}

const diff = (now: number, base: number) => (now === base ? null : now > base ? `+${now - base}` : `−${base - now}`);

/** トークンはカードの定義が共通（仮の強さ）なので、出たときの強さ（CardInst.token）でカードを作り直す */
function displayDef(def: CardDef, m: battle.Monster | undefined): CardDef {
  const t = m?.card.token;
  if (!t) return def;
  return { ...def, stats: { attack: t.attack, hp: t.hp, defense: t.defense ?? 0 } };
}

export function CardDetailBody({ def: rawDef, extras = {} }: { def: CardDef; extras?: DetailExtras }) {
  const { monster: m, power, cost, notes, where } = extras;
  const def = displayDef(rawDef, m);
  const a = analyzeCard(def);
  const desc = descriptionOf(def);
  const chips = m ? monsterChips(def, m, extras.flags ?? {}, extras.ownerTurns, extras.attackNow, extras.realDef?.name) : [];
  const statusChips = chips.filter((c) => !c.id.startsWith('kw:'));
  return (
    <div className="cdetail">
      <div className="cdetail__card">
        <CardView card={def} analysis={a} />
      </div>
      <div className="cdetail__info">
        <div className="cdetail__meta">
          <span className={cx('cdetail__tag', `cdetail__tag--${def.rarity}`)}>{RARITY_LABEL[def.rarity]}</span>
          <span className="cdetail__tag">{CARD_TYPE_LABEL[a.cardType]}</span>
          {a.isCurse && <span className="cdetail__tag cdetail__tag--curse">{CURSE_LABEL}</span>}
          {def.tribe && <span className="cdetail__tag">種族：{TRIBE_LABEL[def.tribe]}</span>}
          <span className="cdetail__tag">
            コスト {cost ?? def.cost}
            {cost !== undefined && cost !== def.cost && <small>（元 {def.cost}）</small>}
          </span>
          {where && <span className="cdetail__tag cdetail__tag--where">{where}</span>}
        </div>

        {desc && (
          <section className="cdetail__sec cdetail__desc">
            <h3>説明</h3>
            <p>{desc}</p>
          </section>
        )}

        {m && def.stats && (
          <section className="cdetail__sec">
            <h3>いまの状態</h3>
            <dl className="cdetail__stats">
              <div>
                <dt>⚔ 攻撃力</dt>
                <dd>
                  {attackOf(m, extras.attackNow)}
                  {diff(attackOf(m, extras.attackNow), def.stats.attack) && (
                    <small className={attackOf(m, extras.attackNow) > def.stats.attack ? 'is-up' : 'is-down'}>{diff(attackOf(m, extras.attackNow), def.stats.attack)}</small>
                  )}
                </dd>
              </div>
              <div>
                <dt>❤ 体力</dt>
                <dd>
                  {m.hp}
                  <small>/{m.maxHp}</small>
                </dd>
              </div>
              <div>
                <dt>🛡 守備力</dt>
                <dd>
                  {m.defense}
                  {diff(m.defense, def.stats.defense) && <small className={m.defense > def.stats.defense ? 'is-up' : 'is-down'}>{diff(m.defense, def.stats.defense)}</small>}
                </dd>
              </div>
            </dl>
            {statusChips.length > 0 && (
              <ul className="cdetail__list">
                {statusChips.map((c) => (
                  <li key={c.id}>
                    <span className={`st st--${c.tone}`}>{c.label}</span>
                    <span>
                      {c.card.description}
                      {c.card.lines?.length ? <small> {c.card.lines.join('・')}</small> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {extras.realDef && (
          <section className="cdetail__sec">
            <h3>正体（あなたにだけ見える）</h3>
            <p>
              {extras.realDef.icon}「{extras.realDef.name}」
              {m?.faceDown?.revealCost !== null && m?.faceDown?.revealCost !== undefined ? `：自分のターンにエナジー${m.faceDown.revealCost}で表にできる` : '：モンスターでないので表にできない'}
            </p>
            <ul className="cdetail__plain">
              {analyzeCard(extras.realDef).text.effects.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </section>
        )}

        {extras.equipment && extras.equipment.length > 0 && (
          <section className="cdetail__sec">
            <h3>装備しているカード（場を離れると持ち主の手札に戻る）</h3>
            <ul className="cdetail__list">
              {extras.equipment.map((e, i) => (
                <li key={`${e.id}${i}`}>
                  <span className="st st--good">
                    {e.icon}
                    {e.name}
                  </span>
                  <span>{e.effects.filter((x) => x.id === 'equip').map((x) => describeEffect(x, e, { noTiming: true })).join('')}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {a.text.keywords.length > 0 && (
          <section className="cdetail__sec">
            <h3>キーワード{m?.sealed ? '（封印中は働かない）' : ''}</h3>
            <ul className="cdetail__list">
              {def.keywords.map((k, i) => {
                const g = keywordGlossary[k.id];
                const t = a.text.keywords[i];
                return (
                  <li key={`${k.id}${i}`}>
                    <span className="st st--kw">
                      {g?.icon ?? '◆'}
                      {t?.name ?? g?.name ?? k.id}
                    </span>
                    <span>{t?.text ?? g?.short ?? ''}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {power && (
          <section className="cdetail__sec">
            <h3>パワーとして残っている効果</h3>
            <ul className="cdetail__plain">
              {powerLines(power, def).map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </section>
        )}

        {notes && notes.length > 0 && (
          <ul className="cdetail__notes">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** ノイズ（定義のないカード）の詳細 */
export function NoiseDetailBody({ cost }: { cost: number }) {
  return (
    <div className="cdetail cdetail--noise">
      <p>
        📛 <b>ノイズ</b>：何もしないカード。エナジー{cost}を払うと除外できます。
      </p>
    </div>
  );
}

/** 対戦画面の詳細シート（スマホは下から、PC は中央） */
export function CardDetailSheet({ title, onClose, children, actions }: { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  return (
    <Sheet open title={title} onClose={onClose} desktop="modal">
      {children}
      {actions && <div className="cdetail__actions">{actions}</div>}
    </Sheet>
  );
}

/** ダイアログの上に重ねる詳細（マリガン・選択・捨て札の一覧から） */
export function CardDetailModal({ def, onClose }: { def: CardDef | null; onClose: () => void }) {
  if (!def) return null;
  return (
    <Modal title={def.name} onClose={onClose}>
      <CardDetailBody def={def} />
    </Modal>
  );
}
