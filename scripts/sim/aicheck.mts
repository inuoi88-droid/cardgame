/**
 * CPU の検査：作った場面で「このターンに勝てる手順」を CPU が実行できるか（リーサルの見逃し）を難易度ごとに数える。
 *   node scripts/sim/aicheck.mts [n]   … 後半の実戦チェック（プリセット同士）の試合数（既定 10）
 * 出力：scripts/sim/out/aicheck.json
 *
 * 1. 作った場面（SCENARIOS）：相手の HP・自分の手札・場・エナジーを直接置いて、CPU にそのターンを任せる。勝てなければ見逃し
 * 2. 実戦：プリセット同士の試合で、各手番の開始時にリーサル探索（lib.canWinThisTurn）をして CPU が取り逃した回数を数える
 *
 * 難易度は ai.strategyFor(level) が用意されるまで全部同じ（貪欲法）。LEVELS_IMPLEMENTED で分かる
 */
import {
  BALANCE,
  LEVELS,
  LEVELS_IMPLEMENTED,
  PRESET_NAMES,
  argN,
  cardAtCap,
  fx,
  giveCard,
  isMain,
  mdTable,
  playTurn,
  presetSpec,
  putMonster,
  scenario,
  series,
  table,
  writeOut,
  type G,
  type Level,
} from './lib.mts';

/** 倍率1の数字を実際の量に */
const real = (n: number): number => n * BALANCE.amountScale;

interface Scenario {
  name: string;
  note: string;
  /** P0 の手番の場面を作る（P0 は先攻の1ターン目で手札は空にしてある） */
  setup: (g: G) => void;
}

// #84 でダメージが 3pt になり、コモン・コスト1ではダメージ7・連撃2×3が作れないのでレアリティを上げる（場面のための札）
const DAMAGE7 = () => cardAtCap('epic', 1, [fx({ id: 'damage', value: 7 })], null, [], { name: '火球' });
const SOLDIER = () => cardAtCap('common', 1, [], { attack: 3, hp: 3, defense: 0 }, [], { name: '兵士' });
const WARRIOR = () => cardAtCap('common', 2, [], { attack: 5, hp: 5, defense: 0 }, [], { name: '戦士' });
const TAUNT11 = () => cardAtCap('common', 1, [], { attack: 1, hp: 1, defense: 0 }, [{ id: 'taunt' }], { name: '小盾' });
const TAUNT15 = () => cardAtCap('common', 2, [], { attack: 1, hp: 5, defense: 0 }, [{ id: 'taunt' }], { name: '大盾' });
const TODOME = () => cardAtCap('rare', 2, [fx({ id: 'damage', value: 20, condition: 'enemyPoisoned' })], null, [], { name: 'とどめの一撃' });
const MULTI = () => cardAtCap('rare', 1, [fx({ id: 'multiHit', value: 2, hits: 3 })], null, [], { name: '三連撃' });
const HASTE = () => cardAtCap('common', 1, [], { attack: 2, hp: 1, defense: 0 }, [{ id: 'haste' }], { name: '突撃兵' });
const EXECUTE = () => cardAtCap('common', 1, [fx({ id: 'execute', value: 5 })], null, [], { name: '処刑' });

export const SCENARIOS: Scenario[] = [
  {
    name: '火球1枚',
    note: '相手HP7、手札：火球（ダメージ7）、エナジー1',
    setup: (g) => {
      g.players[1].hp = real(7);
      giveCard(g, 0, DAMAGE7());
      g.players[0].energy = 1;
    },
  },
  {
    name: '火球2枚',
    note: '相手HP14、手札：火球×2、エナジー2',
    setup: (g) => {
      g.players[1].hp = real(14);
      giveCard(g, 0, DAMAGE7());
      giveCard(g, 0, DAMAGE7());
      g.players[0].energy = 2;
    },
  },
  {
    name: 'モンスターで顔',
    note: '相手HP3、場：兵士3/3、エナジー0',
    setup: (g) => {
      g.players[1].hp = real(3);
      putMonster(g, 0, SOLDIER());
      g.players[0].energy = 0;
    },
  },
  {
    name: 'モンスター＋火球',
    note: '相手HP10、場：兵士3/3、手札：火球、エナジー1',
    setup: (g) => {
      g.players[1].hp = real(10);
      putMonster(g, 0, SOLDIER());
      giveCard(g, 0, DAMAGE7());
      g.players[0].energy = 1;
    },
  },
  {
    name: '挑発を殴ってから火球',
    note: '相手HP7・挑発1/1、場：戦士5/5、手札：火球、エナジー1。戦士で挑発を倒し、火球を顔に撃つ順だけ勝てる',
    setup: (g) => {
      g.players[1].hp = real(7);
      putMonster(g, 1, TAUNT11());
      putMonster(g, 0, WARRIOR());
      giveCard(g, 0, DAMAGE7());
      g.players[0].energy = 1;
    },
  },
  {
    name: 'シールド越し',
    note: '相手HP5・シールド5、手札：火球×2、エナジー2',
    setup: (g) => {
      g.players[1].hp = real(5);
      g.players[1].shield = real(5);
      giveCard(g, 0, DAMAGE7());
      giveCard(g, 0, DAMAGE7());
      g.players[0].energy = 2;
    },
  },
  {
    name: '条件つき（毒）',
    note: '相手HP20・毒1、手札：とどめの一撃（毒なら20）、エナジー2',
    setup: (g) => {
      g.players[1].hp = real(20);
      g.players[1].status.poison = real(1);
      giveCard(g, 0, TODOME());
      g.players[0].energy = 2;
    },
  },
  {
    name: '連撃',
    note: '相手HP6、手札：連撃2×3、エナジー1',
    setup: (g) => {
      g.players[1].hp = real(6);
      giveCard(g, 0, MULTI());
      g.players[0].energy = 1;
    },
  },
  {
    name: '速攻を出して殴る',
    note: '相手HP2、手札：突撃兵2/1（速攻）、エナジー1',
    setup: (g) => {
      g.players[1].hp = real(2);
      giveCard(g, 0, HASTE());
      g.players[0].energy = 1;
    },
  },
  {
    name: '処刑で挑発をどかす',
    note: '相手HP3・挑発1/5、場：兵士3/3、手札：処刑5、エナジー1',
    setup: (g) => {
      g.players[1].hp = real(3);
      putMonster(g, 1, TAUNT15());
      putMonster(g, 0, SOLDIER());
      giveCard(g, 0, EXECUTE());
      g.players[0].energy = 1;
    },
  },
];

export interface AiCheckResult {
  levelsImplemented: boolean;
  scenarios: { name: string; note: string; won: Record<Level, boolean> }[];
  /** 難易度ごとの見逃し数（作った場面） */
  scenarioMisses: Record<Level, number>;
  /** 実戦：難易度ごとのリーサルの回数と見逃し */
  inGame: Record<Level, { games: number; lethalAvailable: number; lethalMissed: number }>;
  n: number;
}

export async function run(n: number): Promise<AiCheckResult> {
  const scenarios: AiCheckResult['scenarios'] = [];
  const scenarioMisses = { easy: 0, normal: 0, hard: 0 } as Record<Level, number>;
  for (const sc of SCENARIOS) {
    const won = {} as Record<Level, boolean>;
    for (const level of LEVELS) {
      const g = scenario({ seed: 1 });
      g.players[0].hand = [];
      sc.setup(g);
      const r = playTurn(g, 0, level);
      won[level] = r.won;
      if (!r.won) scenarioMisses[level] += 1;
    }
    scenarios.push({ name: sc.name, note: sc.note, won });
  }
  const inGame = {} as AiCheckResult['inGame'];
  for (const level of LEVELS) {
    let games = 0;
    let lethalAvailable = 0;
    let lethalMissed = 0;
    for (let a = 0; a < PRESET_NAMES.length; a++) {
      const b = (a + 1) % PRESET_NAMES.length;
      const s = await series(presetSpec(a), presetSpec(b), n, { level, checkLethal: true, seedBase: 9000 });
      games += s.games;
      lethalAvailable += s.lethalAvailable ?? 0;
      lethalMissed += s.lethalMissed ?? 0;
    }
    inGame[level] = { games, lethalAvailable, lethalMissed };
    console.error(`${level}: 実戦 ${games} 試合、リーサル ${lethalAvailable} 回、見逃し ${lethalMissed} 回`);
    if (!LEVELS_IMPLEMENTED) {
      // 難易度がまだないので、残りのレベルは同じ結果
      for (const other of LEVELS) if (!(other in inGame)) inGame[other] = { ...inGame[level] };
      break;
    }
  }
  return { levelsImplemented: LEVELS_IMPLEMENTED, scenarios, scenarioMisses, inGame, n };
}

export function report(r: AiCheckResult): { text: string; md: string } {
  const mark = (ok: boolean) => (ok ? '○' : '×（見逃し）');
  const header = ['場面', ...LEVELS, '内容'];
  const rows = r.scenarios.map((s) => [s.name, ...LEVELS.map((l) => mark(s.won[l])), s.note]);
  const sumHeader = ['難易度', '場面の見逃し', '実戦の試合数', 'リーサルの回数', '見逃し', '見逃し率'];
  const sumRows = LEVELS.map((l) => {
    const g = r.inGame[l];
    return [l, `${r.scenarioMisses[l]}/${r.scenarios.length}`, g.games, g.lethalAvailable, g.lethalMissed, g.lethalAvailable ? `${((100 * g.lethalMissed) / g.lethalAvailable).toFixed(0)}%` : '-'];
  });
  const note = r.levelsImplemented ? '' : '（難易度はまだエンジンにないので、全レベル貪欲法で同じ結果）';
  const title = `CPU のリーサル検査${note}`;
  return {
    text: [`## ${title}`, table(header, rows), '', table(sumHeader, sumRows)].join('\n'),
    md: [`### ${title}`, mdTable(header, rows), '', mdTable(sumHeader, sumRows)].join('\n'),
  };
}

if (isMain(import.meta.url)) {
  const r = await run(argN(10));
  console.log(report(r).text);
  console.log(`\n→ ${writeOut('aicheck.json', r)}`);
}
