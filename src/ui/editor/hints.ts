/**
 * 「目安」：効果の数値をふつうの言葉で言い換える（HP の何割か、合計いくつか など）。
 * 数字はすべて balance.ts から読む。正確さより分かりやすさを優先するが、嘘は書かない。
 */
import { BALANCE, getDrawback, getEffect, type CardDef, type DrawbackInstance, type EffectInstance } from '../../engine/index.ts';

const B = BALANCE.battle;
const HP = B.playerHp;
/** HP に対する割合。1割未満は「約 1/60」のように分数で（小さい値が 0〜1% に丸まって見えないように） */
const pct = (v: number) => (v <= 0 ? '0' : v * 10 < HP ? `約 1/${Math.round(HP / v)}` : `約 ${Math.round((v / HP) * 100)}%`);
const n = (x: { value?: number }) => x.value ?? 0;

/** 半減しながら残る値の合計（毒・再生） */
function decaySum(v: number, keep: number): number {
  let sum = 0;
  let cur = v;
  while (cur > 0) {
    sum += cur;
    cur = Math.floor(cur * keep);
  }
  return sum;
}

export interface Hint {
  title: string;
  description: string;
  lines: string[];
}

export function effectHint(e: EffectInstance, _card: CardDef): Hint | null {
  const def = getEffect(e.id);
  if (!def) return null;
  const v = n(e);
  const lines: string[] = [`基礎ポイント：${def.baseFormula(e)} = ${def.basePoints(e)}pt`];
  let description = def.summary;
  switch (e.id) {
    case 'damage':
      description = `ダメージ${v} ≒ プレイヤーのHP ${HP} の ${pct(v)}。モンスターなら守備力ぶん減る`;
      break;
    case 'multiHit': {
      const total = v * (e.hits ?? 0);
      description = `合計${total}ダメージ ≒ HP ${HP} の ${pct(total)}。1回ごとに守備力で減るので、守備力の高い相手には弱い`;
      break;
    }
    case 'execute':
      description = `体力${v}以下のモンスターを、守備力や不屈を無視して破壊する。プレイヤーには撃てない`;
      break;
    case 'counter':
      description = `相手が攻撃してきたとき${v}を返す（1回の攻撃につき1回）。相手が殴らなければ何も起きない`;
      break;
    case 'shield':
      description = `${v}ダメージぶんを肩代わり（HP ${HP} の ${pct(v)}）。次の自分のターン開始時に消える`;
      break;
    case 'heal':
      description = `HP を${v}回復（HP ${HP} の ${pct(v)}）`;
      break;
    case 'nullify':
      description = '次に受けるダメージ1回を 0 にする。毒・やけどは防げない';
      break;
    case 'repair':
      description = `自分のモンスター1体の体力を${v}回復（上限まで）`;
      break;
    case 'poison': {
      const total = decaySum(v, B.poisonKeepRate);
      description = `毒${v}は毎ターン半分になりながら合計およそ${total}ダメージ。守備力・シールド・無効化を無視する`;
      break;
    }
    case 'burn': {
      const turns = B.burnTurns + v;
      description = `${turns}ターンの間、ターン終了時に${B.burnDamage}ダメージ（合計${B.burnDamage * turns}）。かかっている間は与えるダメージが${B.burnDamageRateLabel}（モンスターは攻撃・反撃、プレイヤーは効果のダメージ）`;
      break;
    }
    case 'freeze':
      description = `モンスターなら次の攻撃1回ぶん、プレイヤーなら次のターンのエナジー約${B.freezeCostIncrease}ぶんを奪う`;
      break;
    case 'weak':
      description = `相手の与えるダメージが1発${B.exhaustCap}まで（モンスターは攻撃${v}回ぶん、プレイヤーはダメージのカード${v}枚ぶん）`;
      break;
    case 'vulnerable':
      description = `${v}ターンの間、相手の受けるダメージが${Math.round(B.vulnerableRate * 100)}%増える。同じターンの残りの攻撃に乗る`;
      break;
    case 'bleed':
      description = `出血${v}：攻撃やカードでダメージを受けるたび${v}追加（1枚・1回につき1回）。ターン終了時に半分になる`;
      break;
    case 'seal':
      description = 'モンスターの効果とキーワードを消す。本体（攻撃力・体力）は残る';
      break;
    case 'confuse':
      description = '次のターン、そのモンスターはランダムな相手を自動で攻撃する';
      break;
    case 'strength':
      description = `以後ずっと、アタック1枚ごとに最初の1発が+${v}。合計は${B.strengthCap}まで`;
      break;
    case 'focus':
      description = `このターンのアタック1枚ごとに最初の1発が+${v}。このカード自身には乗らない`;
      break;
    case 'attackUp':
      description = `自分のモンスター1体の攻撃力+${v}（永続）`;
      break;
    case 'defenseUp':
      description = `自分のモンスター1体の守備力+${v}（受ける攻撃1回ごとに${v}減らす）`;
      break;
    case 'regen': {
      const total = decaySum(v, B.regenKeepRate);
      description = `再生${v}は毎ターン半分になりながら合計およそ${total}回復`;
      break;
    }
    case 'draw':
      description = `カードを${v}枚引く（毎ターン引くのは${B.drawPerTurn}枚。ターン終了時に手札は捨てる）`;
      break;
    case 'energy':
      description = `このターンのエナジー+${v}（コスト${v}のカード1枚ぶん）`;
      break;
    case 'savings':
      description = `次のターンのエナジー+${v}`;
      break;
    case 'discount':
      description = `次に使うカードのコスト−${B.discountAmount}`;
      break;
    case 'drawJam':
      description = `相手が次のターンに引く枚数−${B.drawJamAmount}（${B.drawPerTurn}枚のうち1枚）`;
      break;
    case 'energyJam':
      description = `相手の次のターンのエナジー−${B.energyJamAmount}`;
      break;
    case 'noise':
      description = `相手の山札に効果のないカードを${v}枚混ぜる（相手はコスト${B.noiseRemoveCost}で除外できる）`;
      break;
    case 'bounce':
      description = `コスト${v}以下の相手モンスターを手札に戻す。手札はターン終了時に捨てられるので、ほぼ除去`;
      break;
    case 'weaken':
      description = `相手モンスター1体の攻撃力−${v}（永続、最低0）`;
      break;
    case 'revive':
      description = `捨て札のコスト${v}以下のモンスターを場に戻す`;
      break;
    default:
      break;
  }
  return { title: `目安：${def.name}`, description, lines };
}

export function drawbackHint(d: DrawbackInstance, _card: CardDef): Hint | null {
  const def = getDrawback(d.id);
  if (!def) return null;
  const v = n(d);
  let description = def.summary;
  switch (d.id) {
    case 'selfDamage':
      description = `自分に${v}ダメージ（HP ${HP} の ${pct(v)}）`;
      break;
    case 'selfPoison':
      description = `自分に毒${v}（合計およそ${decaySum(v, B.poisonKeepRate)}ダメージ）`;
      break;
    default:
      break;
  }
  const lines = def.fixed ? [`固定 −${def.basePoints(d, _card)}pt（タイミングなし）`] : [`基礎ポイント：${def.baseFormula(d, _card)} = ${def.basePoints(d, _card)}pt`];
  return { title: `目安：${def.name}`, description, lines };
}
