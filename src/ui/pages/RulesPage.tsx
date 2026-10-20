/**
 * ルール／用語ページ。数字と一覧はすべてエンジン（balance.ts とレジストリ）から作るので、ルールを変えても古くならない。
 * スマホで読みやすいように、節ごとに折りたたむ。
 */
import type { MouseEvent, ReactNode } from 'react';
import {
  BALANCE,
  CARD_TYPE_LABEL,
  CONDITION_GROUPS,
  CONDITIONS,
  EFFECT_GROUPS,
  RARITIES,
  RARITY_LABEL,
  TIMING_GROUPS,
  TIMINGS,
  listAbilities,
  listDrawbacks,
  listEffects,
  listKeywords,
  listModifiers,
} from '../../engine/index.ts';
import { abilityGlossary, glossary, keywordGlossary, mechanicGlossary, modifierGlossary, type StatusId } from '../glossary.ts';
import { cx } from '../util.ts';

const B = BALANCE.battle;

function Section({ id, icon, title, open, children }: { id: string; icon: string; title: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="rules__section" id={id} open={open}>
      <summary className="rules__summary">
        <span className="rules__icon" aria-hidden="true">
          {icon}
        </span>
        <span className="rules__title">{title}</span>
        <span className="rules__chevron" aria-hidden="true">
          ▾
        </span>
      </summary>
      <div className="rules__body">{children}</div>
    </details>
  );
}

function Term({ name, children, icon, tone }: { name: ReactNode; children: ReactNode; icon?: string; tone?: 'bad' | 'good' | 'info' }) {
  return (
    <div className="term">
      <dt className={cx('term__name', tone && `term__name--${tone}`)}>
        {icon && (
          <span className="term__icon" aria-hidden="true">
            {icon}
          </span>
        )}
        {name}
      </dt>
      <dd className="term__desc">{children}</dd>
    </div>
  );
}

const SECTIONS: { id: string; icon: string; title: string }[] = [
  { id: 'win', icon: '🏆', title: '勝敗' },
  { id: 'turn', icon: '🔁', title: 'ターンの流れ' },
  { id: 'cards', icon: '🃏', title: 'カードの種類と使い方' },
  { id: 'monster', icon: '🐻', title: 'モンスターの戦闘' },
  { id: 'status', icon: '☠', title: '状態異常・持続効果' },
  { id: 'keywords', icon: '⚡', title: 'キーワード一覧' },
  { id: 'effects', icon: '✨', title: '効果一覧' },
  { id: 'options', icon: '⏱', title: 'タイミング・対象・条件・オプション' },
  { id: 'drawbacks', icon: '😈', title: 'デメリット一覧' },
  { id: 'create', icon: '✏️', title: 'カード作成のルール' },
  { id: 'limits', icon: '🔧', title: '安全装置（1ターンの上限）' },
  { id: 'online', icon: '🌐', title: 'オンライン対戦' },
];

export function RulesPage() {
  const sec = (id: string) => SECTIONS.find((s) => s.id === id)!;
  const energy = B.energySchedule;
  const energyText = energy
    .map((s, i) => {
      const next = energy[i + 1];
      const range = next ? (s.fromTurn === next.fromTurn - 1 ? `${s.fromTurn}ターン目` : `${s.fromTurn}〜${next.fromTurn - 1}ターン目`) : `${s.fromTurn}ターン目以降`;
      return `${range}は${s.energy}`;
    })
    .join('、');
  const firstEnergy = (energy[0]?.energy ?? 0) - B.firstPlayerFirstTurnPenalty;
  const statusOrder: StatusId[] = ['poison', 'doom', 'burn', 'weak', 'vulnerable', 'bleed', 'freeze', 'confuse', 'seal', 'shield', 'counter', 'nullify', 'regen', 'strength', 'focus', 'stealth', 'betrayal'];

  return (
    <div className="rules">
      <div className="page-head">
        <h1>ルール</h1>
      </div>
      <p className="hint rules__intro">
        自作のカードでデッキを組み、1対1で戦うカードゲームです。数字はすべて今のバランス設定から表示しています。節をタップすると開きます。
      </p>
      <nav className="rules__toc" aria-label="目次">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#/rules/${s.id}`} className="chip" onClick={(e) => jumpTo(e, s.id)}>
            {s.icon} {s.title}
          </a>
        ))}
      </nav>

      <Section {...sec('win')} open>
        <ul>
          <li>
            プレイヤーのHPは <b>{B.playerHp}</b>。相手のHPを0にしたら勝ちです。
          </li>
          <li>
            両方のプレイヤーが <b>{B.maxTurns}ターン</b> ずつ終えても決着しなければ引き分けです。
          </li>
          <li>降参すると負けになります。オンライン対戦では、続けて時間切れになると負けです（「オンライン対戦」の節）。</li>
        </ul>
      </Section>

      <Section {...sec('turn')}>
        <h3>はじめに</h3>
        <ul>
          <li>
            先攻・後攻はランダム。最初に <b>{B.drawPerTurn}枚</b> 引きます（1ターン目はこの手札を使います）。
          </li>
          <li>
            マリガン（手札の引き直し）：全部引き直すと1回目は同じ枚数、2回目からは1枚ずつ減ります（最低{B.mulliganMinHand}枚）。選んだカードだけの引き直しは1回だけで、それで手札が決まります。
          </li>
        </ul>
        <h3>ターン開始時（この順）</h3>
        <ol>
          <li>シールドと反撃（状態）が消え、凍結・混乱が発効します。</li>
          <li>毒のダメージを受け、毒が半分（切り捨て）になります。呪縛のダメージを受けます（呪縛は減りません）。再生で回復し、再生も半分になります。</li>
          <li>維持費・裏切りなどのデメリット、自己修復が働きます。</li>
          <li>
            エナジーを得ます。エナジーは自分のターン数で増えます：<b>{energyText}</b>。先攻の1ターン目だけ−{B.firstPlayerFirstTurnPenalty}（{firstEnergy}）です。エナジーは次のターンに持ち越せません（効果「蓄え」を除く）。「最大エナジー増加」の分はここに足します。
          </li>
          <li>
            カードを <b>{B.drawPerTurn}枚</b> 引きます（1ターン目を除く）。山札が尽きたら捨て札を混ぜて山札にします。「引いたとき」の効果は、引き終えてから引いた順に発動します。
          </li>
          <li>予約していた効果（修飾「次のターンに」・カードの能力「反復」）が古い順に発動します（1人{B.maxDelayedPerPlayer}件まで）。</li>
          <li>「自分のターン開始時」の効果（パワー → 場のモンスターの左から）。混乱・裏切りのモンスターが自動で攻撃します。</li>
        </ol>
        <h3>ターン中</h3>
        <ul>
          <li>エナジーの範囲で何枚でもカードを使えます。モンスターは1ターンに1回攻撃できます（二回攻撃なら2回）。</li>
          <li>ノイズ（相手に入れられた札）は、エナジー{B.noiseRemoveCost}で除外できます。</li>
        </ul>
        <h3>ターン終了時（この順）</h3>
        <ol>
          <li>「自分のターン終了時」の効果。</li>
          <li>
            やけどのダメージ（{B.burnDamage}）。出血が半分、弱体・脆弱の残りターンが1減り、凍結・混乱が切れます。
          </li>
          <li>応召のトークンが消え、借用の残りが1減ります（0なら元の持ち主の場へ）。腐乱のモンスター（このターンに攻撃したもの）が破壊され、寿命が1減ります（0になると場から消えます）。</li>
          <li>
            <b>手札をすべて捨て札にします</b>（「保持」で残したカードを除く）。気合と、両者のモンスターの一時強化が消えます。期限の来た封殺が消えます。
          </li>
        </ol>
      </Section>

      <Section {...sec('cards')}>
        <p className="hint">種類はカードの中身から自動で決まります（保存はしません）。</p>
        <dl className="terms">
          <Term name={CARD_TYPE_LABEL.monster} icon="🐻">
            ステータス（攻撃力・体力・守備力）を持ち、自分の場に召喚します。破壊されると捨て札へ。
          </Term>
          <Term name={CARD_TYPE_LABEL.attack} icon="🔥">
            相手にダメージを与える効果を持つカード。使うと捨て札へ。筋力・気合が最初の1発に乗ります。
          </Term>
          <Term name={CARD_TYPE_LABEL.skill} icon="🪄">
            ダメージ以外の効果のカード。使うと捨て札へ。
          </Term>
          <Term name={CARD_TYPE_LABEL.power} icon="✦">
            「ターン開始時」「ターン終了時」「カードを使うたび」など、試合中ずっと続く効果。使うと除外され、効果だけが残ります。パワーは1人{B.maxPowers}つまでで、{B.maxPowers + 1}つ目を使うといちばん古いパワーが消えます。
          </Term>
          <Term name={CARD_TYPE_LABEL.powerAttack} icon="✦🔥">
            ダメージを与えたうえで永続効果を残すカード。使うと除外されます。
          </Term>
        </dl>
        <ul>
          <li>効果は書いてある順に解決します。</li>
          <li>条件付きの効果は、条件を満たしていないと発動しません（カード自体は使えます）。</li>
          {(['quash', 'freePlay', 'conjure', 'boon', 'ramp', 'bounty'] as const).map((id) => (
            <li key={id}>
              <b>{mechanicGlossary[id]!.name}</b>：{mechanicGlossary[id]!.short}。
            </li>
          ))}
        </ul>
        <h3>カードの能力</h3>
        <p className="hint">{mechanicGlossary.abilities!.short}。</p>
        <dl className="terms">
          {listAbilities().map((d) => (
            <Term key={d.id} name={d.name} icon={abilityGlossary[`ability:${d.id}`]?.icon}>
              {d.summary}
            </Term>
          ))}
        </dl>
      </Section>

      <Section {...sec('monster')}>
        <ul>
          <li>
            <b>召喚酔い</b>：場に出したターンは攻撃できません（速攻を除く）。
          </li>
          <li>攻撃先は相手プレイヤーか相手モンスターから選びます。</li>
          <li>
            <b>挑発</b>のモンスターが相手の場にいると、挑発のモンスターしか攻撃できません（<b>飛行</b>のモンスターは挑発を無視できます）。カードの効果で「選んだ1体」を選ぶときも、相手プレイヤーやほかのモンスターは選べず、挑発のモンスターしか選べません（飛行でも同じ。ランダムや全体の効果には影響しません）。<b>隠密</b>のモンスターは相手の次のターン終了まで対象に選べません（隠密中の挑発は数えません）。
          </li>
          <li>
            モンスターへのダメージは「攻撃力 − 守備力」で、最低 <b>{B.minMonsterDamage}</b>（防御無視なら守備力を引きません）。守備力はモンスター専用で、プレイヤーの防御手段はシールドです。
          </li>
          <li>
            <b>反撃</b>：相手モンスターを攻撃すると、守備側がそのときの攻撃力ぶんを攻撃したモンスターに返します。攻撃と同時に解決するので、倒された側も反撃します（相打ちあり）。守備側が封印・凍結・隠密でも反撃します。プレイヤーへの攻撃では反撃は起きません。
            {!B.retaliation.enabled && '（現在は無効）'}
          </li>
          <li>
            <b>貫通</b>のモンスターがモンスターを倒すと、余ったダメージが持ち主のプレイヤーに通ります。<b>不屈</b>のモンスターは1度だけ体力{B.undyingHp}で踏みとどまります。
          </li>
          <li>「攻撃するたび」の効果は、攻撃したモンスターが場に残っていれば発動します（反撃では発動しません）。</li>
          <li>
            <b>威圧</b>のモンスターは攻撃したときに反撃を受けません。<b>一撃離脱</b>のモンスターは攻撃のあと手札に戻ります。<b>激励</b>は自分の他のモンスターの攻撃力を上げます（重ねがけは合計）。<b>護法</b>のモンスターを相手のカードの「選んだ1体」にすると、そのカードのコストが上がります。<b>猛襲</b>は相手プレイヤーを攻撃するときだけ攻撃力が上がります。<b>分身</b>は初めて攻撃したときにカードのコピーを手札に加えます。
          </li>
          <li>
            <b>接死</b>のモンスターが攻撃・反撃・格闘でダメージを与えたモンスターは破壊されます（不屈でも踏みとどまれません）。<b>先制攻撃</b>のモンスターは、攻撃で相手を倒せば反撃を受けません。<b>聖盾</b>は最初のダメージ1回を0にします。<b>呪禁</b>のモンスターはカードの「選んだ1体」に選べません（呪禁の挑発は、カードの対象選びを縛りません）。<b>防衛</b>のモンスターは攻撃できませんが、反撃はします。
          </li>
          {(['token', 'tempAttack', 'granted', 'fight', 'lifespan', 'exert', 'equip', 'borrow', 'copyToken', 'tempToken', 'army'] as const).map((id) => (
            <li key={id}>
              <b>{mechanicGlossary[id]!.name}</b>：{mechanicGlossary[id]!.short}。
            </li>
          ))}
        </ul>
      </Section>

      <Section {...sec('status')}>
        <p className="hint">ターン数は、かかっている側のターンで数えます。対戦画面では札をタップすると説明が出ます。</p>
        <dl className="terms">
          {statusOrder.map((id) => {
            const g = glossary[id];
            return (
              <Term key={id} name={g.name} icon={g.icon} tone={g.tone}>
                {g.short}
              </Term>
            );
          })}
        </dl>
      </Section>

      <Section {...sec('keywords')}>
        <p className="hint">モンスターに付けられる性質です。封印されると働きません。</p>
        <dl className="terms">
          {listKeywords().map((def) => (
            <Term key={def.id} name={def.name} icon={keywordGlossary[def.id]?.icon}>
              {keywordGlossary[def.id]?.short ?? def.summary}
            </Term>
          ))}
        </dl>
      </Section>

      <Section {...sec('effects')}>
        <p className="hint">効果は「タイミング」「対象」「条件」を選んで付けます。ポイントは基礎ポイント × それぞれの倍率です。</p>
        {EFFECT_GROUPS.map((g) => {
          const defs = listEffects().filter((d) => d.group === g.id);
          if (defs.length === 0) return null;
          return (
            <div key={g.id} className="rules__group">
              <h3>{g.label}</h3>
              <dl className="terms">
                {defs.map((d) => (
                  <Term
                    key={d.id}
                    name={
                      <>
                        {d.name}
                        {d.minRarity && <span className="badge badge--sm">{d.minRarity === 'legend' ? 'レジェンドのみ' : `${RARITY_LABEL[d.minRarity]}以上`}</span>}
                      </>
                    }
                  >
                    {d.summary}
                  </Term>
                ))}
              </dl>
            </div>
          );
        })}
      </Section>

      <Section {...sec('options')}>
        <p className="hint">効果ごとに「いつ（タイミング）」「だれに（対象）」「どんなときに（条件）」を選び、数値に掛けるオプションを1つまで付けられます。</p>
        {TIMING_GROUPS.map((group) => (
          <div key={`t-${group}`} className="rules__group">
            <h3>タイミング：{group}</h3>
            <dl className="terms">
              {Object.values(TIMINGS)
                .filter((t) => t.group === group)
                .map((t) => (
                  <Term key={t.id} name={t.label}>
                    {t.description}
                  </Term>
                ))}
            </dl>
          </div>
        ))}
        <h3>対象（自分のモンスター・お互い）</h3>
        <dl className="terms">
          {(['thisMonster', 'allyMonsters', 'otherAllies', 'weakestAlly', 'triggerAlly', 'bothPlayers'] as const).map((id) => (
            <Term key={id} name={mechanicGlossary[id]!.name} icon={mechanicGlossary[id]!.icon}>
              {mechanicGlossary[id]!.short}
            </Term>
          ))}
        </dl>
        {CONDITION_GROUPS.map((group) => (
          <div key={`c-${group}`} className="rules__group">
            <h3>条件：{group}</h3>
            <dl className="terms">
              {Object.values(CONDITIONS)
                .filter((c) => c.group === group)
                .map((c) => (
                  <Term key={c.id} name={c.label}>
                    {c.description}
                  </Term>
                ))}
            </dl>
          </div>
        ))}
        <h3>オプション</h3>
        <dl className="terms">
          {listModifiers().map((m) => (
            <Term key={m.id} name={m.name} icon={modifierGlossary[m.id]?.icon}>
              {m.summary}（ポイント{m.rate >= 0 ? '+' : '−'}{Math.round(Math.abs(m.rate) * 100)}%）
            </Term>
          ))}
        </dl>
        <ul>
          <li>防御無視・吸収はダメージと連撃だけに付けられます。数値の倍数（X・相手モンスター1体につき・このターン使ったカード1枚につき）は1つの効果に1つまで。掛けた数値は、その効果の入力欄の上限（ダメージは1枚の合計{BALANCE.params.damagePerCardMax}）で頭打ちです。</li>
          <li>X のカードは、使うと残りのエナジーをすべて使います。カードの X の効果はすべて同じ X を使います。</li>
          {(['delayed', 'clash', 'exploit', 'drawn'] as const).map((id) => (
            <li key={id}>
              <b>{mechanicGlossary[id]!.name}</b>：{mechanicGlossary[id]!.short}。
            </li>
          ))}
          <li>
            「引いたとき」の効果のポイントの合計は、コスト0のときのレアリティ上限までです（コストを上げて得た予算で「引くだけで得をする」カードは作れません）。
          </li>
        </ul>
      </Section>

      <Section {...sec('drawbacks')}>
        <p className="hint">
          デメリットを1つでも付けると呪いカードになり、ポイントが差し引かれます（差し引けるのはレアリティ上限まで。コスト{BALANCE.curse.minCostForOffset}未満のカードは差し引けません）。
        </p>
        <dl className="terms">
          {listDrawbacks().map((d) => (
            <Term key={d.id} name={d.monsterOnly ? `${d.name}（モンスター専用）` : d.name}>
              {d.summary}
            </Term>
          ))}
        </dl>
      </Section>

      <Section {...sec('create')}>
        <h3>レアリティと上限</h3>
        <table className="rules__table">
          <thead>
            <tr>
              <th>レアリティ</th>
              <th>ポイント上限</th>
              <th>効果の数</th>
              <th>デッキに入れられる枚数</th>
            </tr>
          </thead>
          <tbody>
            {RARITIES.map((r) => {
              const R = BALANCE.rarity[r];
              return (
                <tr key={r}>
                  <td>
                    <span className={cx('dot', `dot--${r}`)} />
                    {RARITY_LABEL[r]}
                  </td>
                  <td>{R.cap}pt</td>
                  <td>{R.maxEffects}つまで</td>
                  <td>{R.deckLimit === null ? '制限なし' : `計${R.deckLimit}枚・同名${R.perNameLimit}枚まで`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <h3>ポイント計算</h3>
        <ul>
          <li>ステータス・効果・キーワードのポイントの合計から、コストのぶんとデメリットのぶんを引きます。その値がレアリティの上限以下なら作れます。</li>
          <li>
            コストの差し引き：
            {BALANCE.card.costPoints.map((p, cost) => (
              <span key={cost} className="rules__cost">
                コスト{cost}＝−{p}pt
              </span>
            ))}
          </li>
          <li>コスト0のカードは上限が{BALANCE.card.cost0CapPenalty}pt下がります。</li>
          <li>
            ステータス：攻撃力1につき{BALANCE.stats.attackPoints}pt、体力1につき{BALANCE.stats.hpPoints}pt、守備力1につき{BALANCE.stats.defensePoints}pt（守備力は{BALANCE.stats.defenseMax}
            まで）。
          </li>
          <li>効果1つのポイント＝基礎ポイント ×（1＋オプションの上乗せ率）× タイミング倍率 × 対象倍率 × 条件倍率（切り上げ）。条件は1つの効果につき1つまで。</li>
        </ul>
        <h3>呪いカード</h3>
        <ul>
          <li>デメリットを1つでも付けると呪いカードになります（元のレアリティはそのまま）。</li>
          <li>デメリットの合計がレアリティの上限以上でないと作れません。同じデメリットは1枚に1回まで。</li>
          <li>
            差し引けるのは上限（レアリティ上限 × {BALANCE.curse.maxOffsetRate}）まで。コスト{BALANCE.curse.minCostForOffset}未満のカードは差し引けません。
          </li>
          <li>デッキの枚数制限は元のレアリティと同じです。</li>
        </ul>
        <h3>デッキ</h3>
        <ul>
          <li>
            デッキはちょうど <b>{BALANCE.deck.size}枚</b>。上の表の枚数制限を守ります。
          </li>
          <li>カード名は{BALANCE.card.nameMaxLength}文字まで。同じ名前のカードは作れません。</li>
          <li>
            1枚のカードのダメージの合計（値×回数）は{BALANCE.params.damagePerCardMax}まで。毒は1つの効果で{BALANCE.effects.poison.maxValue}まで。
          </li>
        </ul>
      </Section>

      <Section {...sec('limits')}>
        <ul>
          <li>1ターンに引けるのは合計{B.maxDrawPerTurn}枚まで（ターン開始の{B.drawPerTurn}枚を含む）。</li>
          <li>1ターンに増やせるエナジーは合計+{B.maxEnergyGainPerTurn}まで（エナジー効果と貯金）。</li>
          <li>「カードを使うたび」の効果は、パワー1つにつき1ターン{B.maxCardPlayedTriggersPerTurn}回まで。</li>
          <li>{mechanicGlossary.repeatCap!.short}（相手のターンも1ターンとして数えます）。</li>
          <li>場に残せるパワーは1人{B.maxPowers}つまで。{B.maxPowers + 1}つ目を使うと、いちばん古いパワーが消えます（消えるときに効果は発動しません）。</li>
          <li>
            相手の妨害で減らされるのは、次のターンのエナジー−{B.maxEnergyJamPerTurn}・引く枚数−{B.maxDrawJamPerTurn}まで。ノイズは1ターンに{B.maxNoiseReceivedPerTurn}枚まで。
          </li>
          <li>筋力の合計は{B.strengthCap}まで。筋力・気合は1枚のカードにつき最初の1発だけに乗ります。</li>
          <li>「ダメージを受けたとき」の効果は、毒・やけどのダメージでは発動しません。</li>
        </ul>
      </Section>

      <Section {...sec('online')}>
        <ul>
          <li>部屋コードを相手に伝えて同じ部屋に入ります。先攻・後攻はランダムです。</li>
          <li>
            1ターンの制限時間は <b>{BALANCE.online.turnSeconds}秒</b>（マリガンは{BALANCE.online.mulliganSeconds}秒）。時間切れになるとターンが自動で終わります。
          </li>
          <li>
            <b>{BALANCE.online.timeoutLoseCount}回続けて</b>時間切れになると負けです。
          </li>
          <li>同じブラウザで開き直せば、対戦の続きに戻れます。</li>
        </ul>
      </Section>
    </div>
  );
}

/** 目次：ハッシュを変えずに節へスクロールして開く */
function jumpTo(e: MouseEvent, id: string) {
  e.preventDefault();
  const el = document.getElementById(id);
  if (!(el instanceof HTMLDetailsElement)) return;
  el.open = true;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
