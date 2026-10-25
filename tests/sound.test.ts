// 効果音（決定事項 #127）：音のファイル・演出の合図とのつなぎ・既定はオフ・間引きと声の上限・設定の読み方
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CUES, FX_ELEMENTS, type CueId, type CueOpts } from '../src/ui/battle/fx/cues.ts';
import type { FxArch } from '../src/ui/battle/fx/registry.ts';
import { shieldTookAll } from '../src/ui/battle/events.ts';
import { isSoundId, maxLatencyOf, priorityOf, SOUND_GROUP, SOUND_IDS, type SoundId } from '../src/ui/sound/catalog.ts';
import { addVoice, admit, AOE_TARGETS, CHAIN_MS, GroupOnce, HitGate, MAX_VOICES, magnitudeGain, newMixState, SAME_CUE_GAP_MS, throttle } from '../src/ui/sound/mixer.ts';
import { routeCue, SILENT_CAST_ARCHS } from '../src/ui/sound/route.ts';
import { DEFAULT_SOUND_PREF, getSoundPref, parseSoundPref, parseSoundPrefText, SOUND_PREF_KEY, volumeGain } from '../src/ui/sound/settings.ts';
import { classifyUi, type UiTarget } from '../src/ui/sound/uiClass.ts';
import { SFX_CREDITS } from '../src/ui/sound/credits.ts';

const ROOT = join(__dirname, '..');
const SFX = join(ROOT, 'src/ui/sound/sfx');
const manifest = JSON.parse(readFileSync(join(SFX, 'manifest.json'), 'utf8')) as {
  fxCueMap: { rows: { fx: string; cues: string[] }[]; outsideFx: string[] };
  cues: { id: string; file: string; sources: { pack: string; author: string; url: string; license: string }[] }[];
};

/** 一覧（CUES）の代表の形を、実際の ID に広げる */
function allCueIds(): CueId[] {
  const out: string[] = [];
  for (const k of Object.keys(CUES)) {
    if (k === 'cast.<属性>') for (const el of FX_ELEMENTS) out.push(`cast.${el}`);
    else if (k === 'hit.<属性>.<s|m|l>') for (const el of FX_ELEMENTS) for (const s of ['s', 'm', 'l']) out.push(`hit.${el}.${s}`);
    else out.push(k);
  }
  return out as CueId[];
}

const ARCHS: FxArch[] = ['bolt', 'heal', 'ward', 'buff', 'debuff', 'bind', 'summon', 'shatter', 'draw', 'discard', 'energy', 'tint', 'move', 'rune'];
const mine: CueOpts = { mine: true };

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}

describe('効果音のファイル', () => {
  it('台帳の 52 の音がすべて sfx/<ID>.mp3 にあり、余分なファイルも無い', () => {
    const files = readdirSync(SFX)
      .filter((f) => f.endsWith('.mp3'))
      .map((f) => f.slice(0, -4))
      .sort();
    expect(SOUND_IDS.length).toBe(52);
    expect(files).toEqual([...SOUND_IDS].sort());
    // MP3（ID3 か フレームの同期）で、小さい（合わせて 1MB 未満）
    let total = 0;
    for (const id of SOUND_IDS) {
      const buf = readFileSync(join(SFX, `${id}.mp3`));
      total += buf.length;
      const head = buf.subarray(0, 3).toString('latin1');
      expect(head === 'ID3' || (buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0), id).toBe(true);
    }
    expect(total).toBeLessThan(1024 * 1024);
  });

  it('出典の台帳（manifest.json）と同じ音で、素材はすべて CC0', () => {
    expect(manifest.cues.map((c) => c.id).sort()).toEqual([...SOUND_IDS].sort());
    for (const c of manifest.cues) {
      expect(c.file).toBe(`${c.id}.mp3`);
      for (const s of c.sources) expect(s.license, c.id).toMatch(/^CC0/);
    }
  });

  it('クレジット（sound/credits.ts・docs/CREDITS.md）は出典の台帳の素材と作者をすべて載せている', () => {
    const want = new Map<string, { author: string; url: string; sounds: Set<string> }>();
    for (const c of manifest.cues)
      for (const s of c.sources) {
        const p = want.get(s.pack) ?? { author: s.author, url: s.url, sounds: new Set<string>() };
        p.sounds.add(c.id);
        want.set(s.pack, p);
      }
    expect(SFX_CREDITS.map((c) => c.pack).sort()).toEqual([...want.keys()].sort());
    const doc = readFileSync(join(ROOT, 'docs/CREDITS.md'), 'utf8');
    for (const c of SFX_CREDITS) {
      const w = want.get(c.pack)!;
      expect(c.author, c.pack).toBe(w.author);
      expect(c.url, c.pack).toBe(w.url);
      expect([...c.sounds].sort(), c.pack).toEqual([...w.sounds].sort());
      expect(doc.includes(c.url), c.url).toBe(true);
    }
  });

  it('優先度と待てる時間は分類から（決着・ターンは長く待ち、優先度も高い）', () => {
    for (const id of SOUND_IDS) {
      expect(priorityOf(id)).toBeGreaterThanOrEqual(1);
      expect(maxLatencyOf(id)).toBeGreaterThan(0);
    }
    expect(priorityOf('victory')).toBeGreaterThan(priorityOf('hit.heavy'));
    expect(priorityOf('hit.heavy')).toBeGreaterThan(priorityOf('ui.click'));
    expect(maxLatencyOf('victory')).toBeGreaterThan(maxLatencyOf('ui.click'));
    expect(isSoundId('ui.click')).toBe(true);
    expect(isSoundId('ui.nope')).toBe(false);
  });
});

describe('演出の合図 → 効果音（route.ts）', () => {
  it('一覧（CUES）のすべての合図が、実在の音につながる', () => {
    const ids = allCueIds();
    expect(ids.length).toBe(Object.keys(CUES).length - 2 + FX_ELEMENTS.length + FX_ELEMENTS.length * 3);
    for (const c of ids) {
      const r = routeCue(c, mine);
      expect(r, c).not.toBeNull();
      expect(isSoundId(r!.sound), `${c} → ${r!.sound}`).toBe(true);
    }
  });

  it('型・種類の手がかりがあっても、つながる先はいつも実在の音（放つ音を出さない型は null）', () => {
    for (const c of allCueIds())
      for (const arch of ARCHS)
        for (const variant of [undefined, 'keyword', 'divine'] as const) {
          const r = routeCue(c, { mine: false, arch, ...(variant ? { variant } : {}) });
          if (c.startsWith('cast.') && SILENT_CAST_ARCHS.has(arch)) expect(r, `${c} ${arch}`).toBeNull();
          else expect(r && isSoundId(r.sound), `${c} ${arch} ${variant}`).toBe(true);
        }
  });

  it('ユーザーが選んだときの対応表（manifest の fxCueMap）どおり', () => {
    const rows = manifest.fxCueMap.rows;
    for (const row of rows) {
      const ids = row.fx.startsWith('hit.<')
        ? FX_ELEMENTS.map((el) => row.fx.replace('<属性>', el))
        : [row.fx];
      for (const id of ids) {
        const r = routeCue(id as CueId, mine);
        expect(r, id).not.toBeNull();
        expect(row.cues, id).toContain(r!.sound);
      }
    }
    // 対応表の行は、一覧の合図をすべて覆う（block は #127 で足した合図：manifest の outsideFx の shield.block）
    const covered = new Set(rows.flatMap((r) => (r.fx.startsWith('hit.<') ? FX_ELEMENTS.flatMap((el) => [r.fx.replace('<属性>', el)]) : [r.fx])));
    for (const c of allCueIds()) if (c !== 'block') expect(covered.has(c), c).toBe(true);
    expect(routeCue('block', mine)!.sound).toBe('shield.block');
  });

  it('選び分け：聖盾は聖・キーワードを得た・守り／回復の状態・物理の打撃と壁・移る', () => {
    expect(routeCue('ward', mine)!.sound).toBe('shield.gain');
    expect(routeCue('ward', { mine: true, variant: 'divine' })!.sound).toBe('spell.holy');
    expect(routeCue('buff', mine)!.sound).toBe('buff');
    expect(routeCue('buff', { mine: true, variant: 'keyword' })!.sound).toBe('keyword.grant');
    expect(routeCue('buff', { mine: true, arch: 'ward' })!.sound).toBe('shield.gain');
    expect(routeCue('cast.physical', { mine: true, arch: 'bolt' })!.sound).toBe('attack.swing');
    expect(routeCue('cast.physical', { mine: true, arch: 'bind' })!.sound).toBe('spell.earth');
    expect(routeCue('cast.shadow', { mine: true, arch: 'bolt' })!.sound).toBe('spell.dark');
    expect(routeCue('cast.holy', { mine: true, arch: 'heal' })).toBeNull();
    expect(routeCue('debuff', { mine: true, arch: 'move' })!.sound).toBe('card.fly');
    expect(routeCue('debuff', { mine: true, arch: 'rune' })!.sound).toBe('status.apply');
    expect(routeCue('hit.fire.l', mine)!.sound).toBe('hit.heavy');
    expect(routeCue('card.reveal', { mine: false })!.sound).toBe('card.play.enemy');
    // 知らせは控えめ
    expect(routeCue('notice', mine)!.gain).toBeLessThan(1);
  });

  it('52 の音はどれも、どこかで鳴る（演出・画面の操作・画面から直接）', () => {
    const reach = new Set<string>();
    for (const c of allCueIds())
      for (const arch of [undefined, ...ARCHS])
        for (const variant of [undefined, 'keyword', 'divine'] as const) {
          const r = routeCue(c, { mine: true, ...(arch ? { arch } : {}), ...(variant ? { variant } : {}) });
          if (r) reach.add(r.sound);
        }
    // hit.* は全体効果で1段上がる
    reach.add('hit.heavy');
    const src = walk(join(ROOT, 'src/ui')).map((f) => readFileSync(f, 'utf8'));
    const direct = new Set<string>();
    for (const text of src) {
      for (const m of text.matchAll(/\bsfx\(\s*'([^']+)'/g)) direct.add(m[1]!);
      for (const m of text.matchAll(/return '(ui\.[a-z]+)'/g)) direct.add(m[1]!);
      for (const m of text.matchAll(/'(victory|defeat|draw-game)'/g)) direct.add(m[1]!);
    }
    // 画面から直接鳴らす音は、どれも実在の音
    for (const id of direct) expect(isSoundId(id), id).toBe(true);
    for (const id of direct) reach.add(id);
    expect(SOUND_IDS.filter((id) => !reach.has(id))).toEqual([]);
    // 対応表の「演出の外」の音は、画面から直接（か #127 で足した合図 block）で鳴る
    for (const id of manifest.fxCueMap.outsideFx) expect(direct.has(id) || id === 'shield.block', id).toBe(true);
  });

  it('シールドが全部受け止めたダメージは「防いだ」の音（HP が減ったら着弾の音）', () => {
    expect(shieldTookAll('相手に20ダメージ（シールドが20を防いだ）：HP 100→100', 20)).toBe(true);
    expect(shieldTookAll('相手に20ダメージ（シールドが5を防いだ）：HP 100→85', 20)).toBe(false);
    expect(shieldTookAll('相手に20ダメージ：HP 100→80', 20)).toBe(false);
  });
});

describe('間引き・声の上限・着弾のまとめ（mixer.ts）', () => {
  it(`同じ音は ${SAME_CUE_GAP_MS}ms に1回まで（違う音は別）`, () => {
    const s = newMixState();
    expect(throttle(s, 'ui.click', 1000)).toBe(true);
    expect(throttle(s, 'ui.click', 1000 + SAME_CUE_GAP_MS - 1)).toBe(false);
    expect(throttle(s, 'card.draw', 1010)).toBe(true);
    expect(throttle(s, 'ui.click', 1000 + SAME_CUE_GAP_MS)).toBe(true);
  });

  it(`同時に ${MAX_VOICES} つまで。超えたら優先度の低い声を止めて鳴らし、同じか低ければ鳴らさない`, () => {
    const s = newMixState();
    for (let i = 0; i < MAX_VOICES; i++) {
      const a = admit(s, priorityOf('card.draw'), 0);
      expect(a.play).toBe(true);
      addVoice(s, { id: i + 1, cue: 'card.draw', prio: priorityOf('card.draw'), until: 500 + i }, null);
    }
    // 同じ優先度：鳴らさない
    expect(admit(s, priorityOf('card.mill'), 10)).toEqual({ play: false });
    // 低い：鳴らさない
    expect(admit(s, priorityOf('ui.click'), 10)).toEqual({ play: false });
    // 高い：いちばん早く鳴り終わる低い声を止める
    expect(admit(s, priorityOf('turn.mine'), 10)).toEqual({ play: true, steal: 1 });
    // 鳴り終わった声は数えない
    expect(admit(s, priorityOf('ui.click'), 501)).toEqual({ play: true, steal: null });
    expect(s.voices.length).toBe(MAX_VOICES - 2);
  });

  it(`全体効果（対象 ${AOE_TARGETS} つ以上）の着弾は1段重い音1回にまとめる`, () => {
    const g = new HitGate();
    g.cast(7, 4);
    expect(g.hit('small', 7, 1000)).toBe('medium');
    expect(g.hit('small', 7, 1060)).toBeNull();
    expect(g.hit('medium', 7, 1120)).toBeNull();
    expect(g.hit('small', 7, 1180)).toBeNull();
    // 大きいものはそのまま（いちばん重い）
    g.cast(8, 5);
    expect(g.hit('heavy', 8, 3000)).toBe('heavy');
  });

  it(`対象が少ない効果の着弾も組で1回。別の組は別。組の無い続き（毒の滝：${CHAIN_MS}ms 未満の間）も1回`, () => {
    const g = new HitGate();
    g.cast(1, 2);
    expect(g.hit('medium', 1, 0)).toBe('medium');
    expect(g.hit('medium', 1, 60)).toBeNull();
    expect(g.hit('small', 2, 200)).toBe('small');
    expect(g.hit('small', undefined, 400)).toBe('small');
    expect(g.hit('small', undefined, 510)).toBeNull();
    expect(g.hit('small', undefined, 620)).toBeNull();
    expect(g.hit('small', undefined, 620 + CHAIN_MS)).toBe('small');
    // 同時（あなたが受けたダメージの音と、同じダメージの着弾）
    g.player(800);
    expect(g.hit('heavy', 3, 800)).toBeNull();
    expect(g.hit('heavy', 4, 900)).toBe('heavy');
  });

  it('強化・弱体などの着弾は、同じ組の同じ音を1回に（組が無ければいつも鳴らす）', () => {
    const o = new GroupOnce();
    expect(o.pass('buff', 5, 0)).toBe(true);
    expect(o.pass('buff', 5, 60)).toBe(false);
    expect(o.pass('buff', 5, 120)).toBe(false);
    expect(o.pass('keyword.grant', 5, 120)).toBe(true);
    expect(o.pass('buff', 6, 200)).toBe(true);
    expect(o.pass('buff', undefined, 210)).toBe(true);
    expect(o.pass('buff', undefined, 220)).toBe(true);
    o.reset();
    expect(o.pass('buff', 5, 300)).toBe(true);
  });

  it('音量のつまみと大きさの差', () => {
    expect(volumeGain(0)).toBe(0);
    expect(volumeGain(1)).toBe(1);
    expect(volumeGain(0.7)).toBeGreaterThan(0.5);
    expect(volumeGain(0.7)).toBeLessThan(0.7);
    expect(volumeGain(Number.NaN)).toBe(0);
    expect(magnitudeGain(undefined)).toBe(1);
    expect(magnitudeGain(0)).toBeCloseTo(0.85);
    expect(magnitudeGain(1)).toBeCloseTo(1.1);
    expect(magnitudeGain(0.05)).toBeGreaterThan(0.85);
  });
});

describe('効果音の設定（settings.ts）', () => {
  it('既定はオフ・音量 0.7（保存が無い・ブラウザの外）', () => {
    expect(SOUND_PREF_KEY).toBe('cardgame.v1.sound');
    expect(DEFAULT_SOUND_PREF).toEqual({ on: false, volume: 0.7 });
    expect(parseSoundPrefText(null)).toEqual({ on: false, volume: 0.7 });
    expect(getSoundPref().on).toBe(false);
  });

  it('壊れた値でも落ちない（オンは true のときだけ、音量は 0〜1 に収める）', () => {
    const bad: unknown[] = [null, undefined, 1, 'on', [], [true], { on: 'true' }, { on: 1 }, { volume: 'loud' }];
    for (const b of bad) expect(parseSoundPref(b).on, JSON.stringify(b)).toBe(false);
    for (const t of ['', '{', 'null', '"x"', '[1,2]', '{"on":true', 'NaN']) expect(parseSoundPrefText(t)).toEqual({ on: false, volume: 0.7 });
    expect(parseSoundPref({ on: true })).toEqual({ on: true, volume: 0.7 });
    expect(parseSoundPref({ on: true, volume: 0.35 })).toEqual({ on: true, volume: 0.35 });
    expect(parseSoundPref({ on: true, volume: 5 }).volume).toBe(1);
    expect(parseSoundPref({ on: true, volume: -1 }).volume).toBe(0);
    expect(parseSoundPref({ on: true, volume: Number.NaN }).volume).toBe(0.7);
    expect(parseSoundPref({ on: true, volume: '0.5' }).volume).toBe(0.7);
    expect(parseSoundPref({ on: true, volume: 0.333333 }).volume).toBe(0.33);
  });
});

describe('画面の操作の音（uiClass.ts）', () => {
  const base: UiTarget = { tag: 'button', role: null, type: null, className: 'btn', label: '保存', sfx: null, pressed: false, board: false, inGroup: false };
  const t = (p: Partial<UiTarget>): UiTarget => ({ ...base, ...p });
  it('ボタン・主ボタン・閉じる／戻る・タブ・切り替え', () => {
    expect(classifyUi(base)).toBe('ui.click');
    expect(classifyUi(t({ tag: 'a', className: '' }))).toBe('ui.click');
    expect(classifyUi(t({ className: 'btn btn--primary' }))).toBe('ui.confirm');
    expect(classifyUi(t({ className: 'btn btn--primary btn--end' }))).toBe('ui.confirm');
    expect(classifyUi(t({ label: '閉じる' }))).toBe('ui.cancel');
    expect(classifyUi(t({ label: '戻る' }))).toBe('ui.cancel');
    expect(classifyUi(t({ label: 'まとめを閉じる' }))).toBe('ui.cancel');
    expect(classifyUi(t({ className: 'toast__close', label: '✕' }))).toBe('ui.cancel');
    expect(classifyUi(t({ role: 'tab' }))).toBe('ui.tab');
    expect(classifyUi(t({ className: 'nav-btn is-active', label: 'カード' }))).toBe('ui.tab');
    expect(classifyUi(t({ className: 'chip', inGroup: true, role: 'radio' }))).toBe('ui.tab');
    expect(classifyUi(t({ tag: 'summary', className: 'rules__summary' }))).toBe('ui.tab');
    expect(classifyUi(t({ tag: 'input', type: 'checkbox', className: 'u-toggle' }))).toBe('ui.toggle');
    expect(classifyUi(t({ role: 'switch' }))).toBe('ui.toggle');
    expect(classifyUi(t({ pressed: true, label: 'おまかせ' }))).toBe('ui.toggle');
  });

  it('盤面のもの（行動の音が鳴る）・入力欄・data-sfx', () => {
    expect(classifyUi(t({ tag: 'div', role: 'button', board: true }))).toBeNull();
    expect(classifyUi(t({ tag: 'input', type: 'range' }))).toBeNull();
    expect(classifyUi(t({ tag: 'input', type: 'text' }))).toBeNull();
    expect(classifyUi(t({ sfx: 'none' }))).toBeNull();
    expect(classifyUi(t({ sfx: 'turn.end' }))).toBe('turn.end');
    expect(classifyUi(t({ tag: 'div', role: null }))).toBeNull();
  });
});

describe('分類（catalog.ts）', () => {
  it('分類ごとの数（ui 6・card 8・turn 5・combat 11・magic 8・effect 11・result 3）', () => {
    const count: Record<string, number> = {};
    for (const id of SOUND_IDS) count[SOUND_GROUP[id as SoundId]] = (count[SOUND_GROUP[id as SoundId]] ?? 0) + 1;
    expect(count).toEqual({ ui: 6, card: 8, turn: 5, combat: 11, magic: 8, effect: 11, result: 3 });
  });
});
