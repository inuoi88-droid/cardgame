/**
 * カードのグループの画面部品（決定事項 #109）：グループの列（スマホは横に流れる札・PC は左の列）、作る／直すダイアログ、
 * 選んだカードを入れる／外すシート、並べ替え・削除の管理シート、カードの詳細の中の「入っているグループ」。
 * 保存は store.ts の actions（ここでは呼ぶだけ）。
 */
import { useId, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { GROUP_MEMO_MAX, GROUP_NAME_MAX, type CardGroup } from '../../engine/index.ts';
import { Modal } from '../components/controls.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { useToast } from '../components/Toast.tsx';
import { actions, getState } from '../store.ts';
import { cx, uuid } from '../util.ts';
import { DRAG_MIME } from './CardCollection.tsx';
import { GROUP_COLORS, groupHex, groupNameProblem, makeGroup, nextGroupColor } from './groups.ts';
import { tagLabel, type TagId } from './tags.ts';

const gc = (color: string) => ({ '--gc': groupHex(color) }) as CSSProperties;

function readDragIds(e: DragEvent): string[] | null {
  try {
    const ids: unknown = JSON.parse(e.dataTransfer.getData(DRAG_MIME));
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- グループの列

interface BarProps {
  groups: readonly CardGroup[];
  /** グループ ID → 入っている（今ある）カードの数 */
  counts: ReadonlyMap<string, number>;
  total: number;
  ungrouped: number;
  scope: string;
  onScope: (scope: string) => void;
  /** side＝PC の左の列、bar＝横に流れる札 */
  layout: 'side' | 'bar';
  onCreate?: () => void;
  onManage?: () => void;
  /** カードを札に落としたとき（PC） */
  onDropCards?: (groupId: string, ids: string[]) => void;
}

export function GroupBar({ groups, counts, total, ungrouped, scope, onScope, layout, onCreate, onManage, onDropCards }: BarProps) {
  const [over, setOver] = useState<string | null>(null);
  const dropProps = (id: string) =>
    onDropCards
      ? {
          onDragOver: (e: DragEvent) => {
            if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            if (over !== id) setOver(id);
          },
          onDragLeave: () => setOver((o) => (o === id ? null : o)),
          onDrop: (e: DragEvent) => {
            const ids = readDragIds(e);
            setOver(null);
            if (!ids) return;
            e.preventDefault();
            onDropCards(id, ids);
          },
        }
      : {};
  return (
    <nav className={cx('gbar', `gbar--${layout}`)} aria-label="グループ">
      {layout === 'side' && (
        <div className="gbar__head">
          <span>グループ</span>
          {onManage && groups.length > 0 && (
            <button type="button" className="btn btn--ghost btn--small" onClick={onManage}>
              管理
            </button>
          )}
        </div>
      )}
      <div className="gbar__list">
        <button type="button" className={cx('gitem', scope === 'all' && 'is-active')} aria-pressed={scope === 'all'} onClick={() => onScope('all')}>
          <span className="gitem__name">すべて</span>
          <span className="gitem__n">{total}</span>
        </button>
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            className={cx('gitem', scope === g.id && 'is-active', over === g.id && 'is-drop')}
            style={gc(g.color)}
            aria-pressed={scope === g.id}
            onClick={() => onScope(g.id)}
            title={g.memo}
            {...dropProps(g.id)}
          >
            <span className="gdot" aria-hidden="true" />
            <span className="gitem__name">{g.name}</span>
            <span className="gitem__n">{counts.get(g.id) ?? 0}</span>
          </button>
        ))}
        {groups.length > 0 && (
          <button type="button" className={cx('gitem gitem--none', scope === 'ungrouped' && 'is-active')} aria-pressed={scope === 'ungrouped'} onClick={() => onScope('ungrouped')}>
            <span className="gitem__name">未分類</span>
            <span className="gitem__n">{ungrouped}</span>
          </button>
        )}
        {onCreate && (
          <button type="button" className="gitem gitem--add" onClick={onCreate}>
            ＋ グループ
          </button>
        )}
        {layout === 'bar' && onManage && groups.length > 0 && (
          <button type="button" className="gitem gitem--add" onClick={onManage}>
            管理
          </button>
        )}
      </div>
      {layout === 'side' && onDropCards && groups.length > 0 && <p className="gbar__tip">カードをここへドラッグしても入れられます</p>}
    </nav>
  );
}

// ---------------------------------------------------------------- 作る・直す

interface DialogProps {
  /** 直すグループ（無ければ新しく作る） */
  group?: CardGroup;
  /** 新しく作るときの名前の初期値（タグから作るなど） */
  initialName?: string;
  initialMemo?: string;
  /** 作ったら入れるカード */
  cardIds?: readonly string[];
  onClose: () => void;
  /** 作った・直したあと（作ったときは新しいグループ） */
  onDone?: (group: CardGroup) => void;
  /** 「削除」を押したとき（直すときだけ） */
  onDelete?: () => void;
}

export function GroupDialog({ group, initialName = '', initialMemo = '', cardIds = [], onClose, onDone, onDelete }: DialogProps) {
  const groups = getState().groups;
  const [name, setName] = useState(group?.name ?? initialName);
  const [color, setColor] = useState(group?.color ?? nextGroupColor(groups));
  const [memo, setMemo] = useState(group?.memo ?? initialMemo);
  const [touched, setTouched] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const nameId = useId();
  const problem = groupNameProblem(groups, name, group?.id);
  const save = () => {
    setTouched(true);
    if (problem) return;
    if (group) {
      actions.updateGroup(group.id, { name, color, memo: memo.trim() === '' ? null : memo });
      onDone?.(getState().groups.find((g) => g.id === group.id) ?? group);
    } else {
      const g = makeGroup(uuid(), name, color, memo, cardIds);
      actions.createGroup(g);
      onDone?.(g);
    }
    onClose();
  };
  // カードの詳細（body 直下のシート）の上に重ねて出すので、こちらも body 直下へ
  return createPortal(
    <Modal title={group ? 'グループを直す' : cardIds.length > 0 ? `新しいグループ（${cardIds.length}枚を入れる）` : '新しいグループ'} onClose={onClose} initialFocus={nameRef}>
      <form
        className="gdlg"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="field" htmlFor={nameId}>
          <span>名前</span>
        </label>
        <input
          id={nameId}
          ref={nameRef}
          type="text"
          value={name}
          maxLength={GROUP_NAME_MAX}
          placeholder="例：毒の沼・竜デッキ用"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={touched && problem !== null}
          aria-describedby={touched && problem ? `${nameId}-err` : undefined}
        />
        {touched && problem && (
          <p id={`${nameId}-err`} className="text-ng gdlg__err" role="alert">
            {problem}
          </p>
        )}
        <fieldset className="gdlg__colors">
          <legend>色</legend>
          <div className="swatches" role="radiogroup" aria-label="色">
            {GROUP_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={color === c.id}
                aria-label={c.label}
                className={cx('swatch', color === c.id && 'is-active')}
                style={{ background: c.hex }}
                onClick={() => setColor(c.id)}
              />
            ))}
          </div>
        </fieldset>
        <label className="field">
          <span>
            メモ（任意・{GROUP_MEMO_MAX}文字まで）<small>どう組み合わせると強いか など</small>
          </span>
          <textarea value={memo} maxLength={GROUP_MEMO_MAX} rows={3} placeholder="例：毒をばらまいて、毒の相手に効くカードでとどめ" onChange={(e) => setMemo(e.target.value)} />
        </label>
        <div className="btn-row gdlg__foot">
          <button type="submit" className="btn btn--primary">
            {group ? '保存' : '作る'}
          </button>
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            やめる
          </button>
          {group && onDelete && (
            <button type="button" className="btn btn--danger gdlg__del" onClick={onDelete}>
              削除
            </button>
          )}
        </div>
      </form>
    </Modal>,
    document.body,
  );
}

// ---------------------------------------------------------------- 選んだカードを入れる・外す

interface PickerProps {
  mode: 'add' | 'remove';
  cardIds: readonly string[];
  onClose: () => void;
  /** 新しいグループを作って入れる（add のとき） */
  onCreate?: () => void;
}

export function GroupPicker({ mode, cardIds, onClose, onCreate }: PickerProps) {
  const toast = useToast();
  const { groups, cards } = getState();
  const ids = new Set(cardIds);
  /** 消したばかりのカード（元に戻せるようにグループには ID が残っている）は数えない */
  const exists = new Set(cards.map((c) => c.id));
  const rows = groups.map((g) => ({ g, inside: g.cardIds.filter((id) => ids.has(id)).length })).filter((r) => mode === 'add' || r.inside > 0);
  const run = (g: CardGroup) => {
    if (mode === 'add') {
      const n = actions.addToGroup(g.id, cardIds);
      toast({
        text: n > 0 ? `「${g.name}」に${n}枚入れました` : `${cardIds.length}枚とも「${g.name}」に入っています`,
        kind: n > 0 ? 'ok' : 'info',
        action: n > 0 ? { label: '元に戻す', onClick: () => actions.removeFromGroup(g.id, cardIds.filter((id) => !g.cardIds.includes(id))) } : undefined,
      });
    } else {
      const before = g.cardIds.filter((id) => ids.has(id));
      const n = actions.removeFromGroup(g.id, cardIds);
      toast({ text: `「${g.name}」から${n}枚外しました`, kind: 'info', action: { label: '元に戻す', onClick: () => actions.addToGroup(g.id, before) } });
    }
    onClose();
  };
  return (
    <Sheet open title={mode === 'add' ? `グループに入れる（${cardIds.length}枚）` : `グループから外す（${cardIds.length}枚）`} onClose={onClose}>
      {rows.length === 0 && <p className="hint">{mode === 'add' ? 'まだグループがありません。' : '選んだカードはどのグループにも入っていません。'}</p>}
      <ul className="gpick">
        {rows.map(({ g, inside }) => (
          <li key={g.id}>
            <button type="button" className="gpick__row" style={gc(g.color)} onClick={() => run(g)}>
              <span className="gdot" aria-hidden="true" />
              <span className="gpick__name">{g.name}</span>
              <small>{inside > 0 ? `${cardIds.length}枚中${inside}枚が入っています` : `${g.cardIds.filter((id) => exists.has(id)).length}枚`}</small>
            </button>
          </li>
        ))}
      </ul>
      {mode === 'add' && onCreate && (
        <button type="button" className="btn btn--primary gpick__new" onClick={onCreate}>
          ＋ 新しいグループを作って入れる
        </button>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- 管理（並べ替え・直す・削除）

export function GroupManager({ counts, onClose, onEdit, onDelete, onCreate }: { counts: ReadonlyMap<string, number>; onClose: () => void; onEdit: (g: CardGroup) => void; onDelete: (g: CardGroup) => void; onCreate: () => void }) {
  const groups = getState().groups;
  const [, rerender] = useState(0);
  const move = (id: string, d: number) => {
    actions.moveGroup(id, d);
    rerender((n) => n + 1);
  };
  return (
    <Sheet open title={`グループの管理（${groups.length}）`} onClose={onClose}>
      <ul className="gman">
        {groups.map((g, i) => (
          <li key={g.id} className="gman__row" style={gc(g.color)}>
            <span className="gdot" aria-hidden="true" />
            <span className="gman__text">
              <b>{g.name}</b>
              <small>
                {counts.get(g.id) ?? 0}枚{g.memo ? `・${g.memo}` : ''}
              </small>
            </span>
            <span className="gman__btns">
              <button type="button" className="btn btn--ghost btn--icon btn--small" disabled={i === 0} onClick={() => move(g.id, -1)} aria-label={`${g.name}を上へ`}>
                ↑
              </button>
              <button type="button" className="btn btn--ghost btn--icon btn--small" disabled={i === groups.length - 1} onClick={() => move(g.id, 1)} aria-label={`${g.name}を下へ`}>
                ↓
              </button>
              <button type="button" className="btn btn--small" onClick={() => onEdit(g)}>
                直す
              </button>
              <button type="button" className="btn btn--small btn--danger" onClick={() => onDelete(g)} aria-label={`${g.name}を削除`}>
                削除
              </button>
            </span>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn--primary gpick__new" onClick={onCreate}>
        ＋ 新しいグループ
      </button>
    </Sheet>
  );
}

// ---------------------------------------------------------------- カードの詳細の中

interface MembershipProps {
  cardId: string;
  groups: readonly CardGroup[];
  tags: readonly TagId[];
  onNewGroup: () => void;
  /** タグを押したとき（そのタグで絞り込む） */
  onTag?: (t: TagId) => void;
}

export function CardMembership({ cardId, groups, tags, onNewGroup, onTag }: MembershipProps) {
  return (
    <div className="cmem">
      <div className="cmem__row" role="group" aria-label="入れるグループ">
        <span className="cmem__label">グループ</span>
        {groups.map((g) => {
          const on = g.cardIds.includes(cardId);
          return (
            <button
              key={g.id}
              type="button"
              className={cx('gtoggle', on && 'is-on')}
              style={gc(g.color)}
              aria-pressed={on}
              onClick={() => (on ? actions.removeFromGroup(g.id, [cardId]) : actions.addToGroup(g.id, [cardId]))}
            >
              <span className="gdot" aria-hidden="true" />
              {g.name}
              {on && <span aria-hidden="true">✓</span>}
            </button>
          );
        })}
        <button type="button" className="gtoggle gtoggle--add" onClick={onNewGroup}>
          ＋ 新しいグループ
        </button>
      </div>
      {tags.length > 0 && (
        <div className="cmem__row" role="group" aria-label="仕組みのタグ">
          <span className="cmem__label">仕組み</span>
          {tags.map((t) =>
            onTag ? (
              <button key={t} type="button" className="ttag ttag--btn" onClick={() => onTag(t)} title="このタグで絞り込む">
                #{tagLabel(t)}
              </button>
            ) : (
              <span key={t} className="ttag">
                #{tagLabel(t)}
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}
