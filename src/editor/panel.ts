import type { AtlasJson } from '@content/atlas';
import type { LevelJson } from '@content/level';
import { SIM_PX_PER_ATLAS_PX } from '@render/units';
import { fieldsFor, getField, KINDS, type FieldSpec, type ObjectKind, type Ref } from './doc';
import { KIND_COLORS } from './overlay';

/** The armed tool: a kind to create by dragging, or select/move/resize. */
export type Tool = ObjectKind | 'select';
export type Action = 'save' | 'play' | 'undo' | 'redo' | 'delete' | 'duplicate' | 'dress' | 'fit';
/** Level-wide fields edited in the panel. */
export type LevelField = 'name' | 'width' | 'height';
export const LEVEL_FIELDS: readonly LevelField[] = ['name', 'width', 'height'];

/** Palette thumbnails fit inside this box (CSS px), keeping the frame's aspect. */
const THUMB = { w: 64, h: 44 } as const;

/** What the panel needs to draw a prop thumbnail from the atlas image. */
export interface PropSource {
  readonly atlas: AtlasJson;
  readonly imageUrl: string;
}

export interface PanelHandlers {
  onTool(tool: Tool): void;
  onProp(prop: string): void;
  onField(ref: Ref, key: string, raw: string | boolean): void;
  onAction(action: Action): void;
  onGrid(size: number): void;
  onLevelField(key: LevelField, raw: string): void;
}

export const GRID_SIZES = [32, 16, 8, 1] as const;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/**
 * The editor's DOM: a toolbar of object kinds and actions on the left, the
 * prop palette below it, and the selected object's fields plus the problem
 * list on the right. The panel owns no state; the Editor pushes it in.
 */
export class EditorPanel {
  readonly root = el('div', 'editor');
  private readonly toolButtons = new Map<Tool, HTMLButtonElement>();
  private readonly palette = el('div', 'editor-palette');
  private readonly fields = el('div', 'editor-fields');
  private readonly problems = el('ul', 'editor-problems');
  private readonly status = el('div', 'editor-status');
  private readonly propButtons = new Map<string, HTMLButtonElement>();
  private readonly gridSelect = el('select');
  private readonly levelInputs = new Map<string, HTMLInputElement>();

  constructor(
    private readonly handlers: PanelHandlers,
    props: PropSource | null,
  ) {
    const left = el('div', 'editor-side editor-left');
    const right = el('div', 'editor-side editor-right');
    this.root.append(left, right);

    const tools = el('div', 'editor-tools');
    const toolButton = (tool: Tool, label: string, hint: string): void => {
      const b = el('button', 'editor-tool', label);
      b.title = hint;
      b.dataset.tool = tool;
      if (tool !== 'select') b.style.borderLeftColor = `#${KIND_COLORS[tool].toString(16).padStart(6, '0')}`;
      b.addEventListener('click', () => handlers.onTool(tool));
      this.toolButtons.set(tool, b);
      tools.append(b);
    };
    toolButton('select', 'select', 'V / Esc: select, move and resize');
    KINDS.forEach((k, i) => toolButton(k, k, `${(i + 1) % 10}: drag to create a ${k}`));
    left.append(el('h1', 'editor-title', 'BatoMan editor'), tools);

    const actions = el('div', 'editor-actions');
    const action = (name: Action, label: string, hint: string): void => {
      const b = el('button', 'editor-action', label);
      b.title = hint;
      b.dataset.action = name;
      b.addEventListener('click', () => handlers.onAction(name));
      actions.append(b);
    };
    action('save', 'save', 'Ctrl+S: validate and write the level file (dev server) or download it');
    action('play', 'play', 'P: playtest from the spawn; P again returns to the editor');
    action('undo', 'undo', 'Ctrl+Z');
    action('redo', 'redo', 'Ctrl+Shift+Z');
    action('duplicate', 'dup', 'Ctrl+D: copy the selection one tile right');
    action('delete', 'del', 'Delete');
    action('dress', 'dress', 'B: cover the selected solid with the current prop');
    action('fit', 'fit', 'Home: frame the whole level');
    left.append(actions);

    const gridRow = el('label', 'editor-row', 'grid ');
    for (const g of GRID_SIZES) {
      const o = el('option', undefined, String(g));
      o.value = String(g);
      this.gridSelect.append(o);
    }
    this.gridSelect.addEventListener('change', () => handlers.onGrid(Number(this.gridSelect.value)));
    gridRow.append(this.gridSelect);
    left.append(gridRow);

    const levelForm = el('div', 'editor-level');
    for (const key of LEVEL_FIELDS) {
      const row = el('label', 'editor-row', `${key} `);
      const input = el('input');
      input.name = `level-${key}`;
      input.addEventListener('change', () => handlers.onLevelField(key, input.value));
      row.append(input);
      levelForm.append(row);
      this.levelInputs.set(key, input);
    }
    left.append(levelForm);

    if (props) this.buildPalette(props);
    else this.palette.append(el('p', 'editor-hint', 'no prop atlas: this level has no art block'));
    left.append(this.palette);

    right.append(el('h2', undefined, 'selection'), this.fields, el('h2', undefined, 'problems'), this.problems, this.status);
  }

  private buildPalette(src: PropSource): void {
    const names = Object.keys(src.atlas.frames).sort();
    for (const name of names) {
      const f = src.atlas.frames[name]!;
      const b = el('button', 'editor-prop');
      b.title = `${name} (${f.w * SIM_PX_PER_ATLAS_PX}x${f.h * SIM_PX_PER_ATLAS_PX} px)`;
      b.dataset.prop = name;
      const thumb = el('div', 'editor-thumb');
      const scale = Math.min(THUMB.w / f.w, THUMB.h / f.h);
      thumb.style.width = `${f.w * scale}px`;
      thumb.style.height = `${f.h * scale}px`;
      thumb.style.backgroundImage = `url(${src.imageUrl})`;
      thumb.style.backgroundSize = `${src.atlas.width * scale}px ${src.atlas.height * scale}px`;
      thumb.style.backgroundPosition = `-${f.x * scale}px -${f.y * scale}px`;
      b.append(thumb, el('span', 'editor-prop-name', name));
      b.addEventListener('click', () => this.handlers.onProp(name));
      this.propButtons.set(name, b);
      this.palette.append(b);
    }
  }

  setTool(tool: Tool): void {
    for (const [t, b] of this.toolButtons) b.classList.toggle('active', t === tool);
  }

  setProp(prop: string | null): void {
    for (const [p, b] of this.propButtons) b.classList.toggle('active', p === prop);
    if (prop) this.propButtons.get(prop)?.scrollIntoView({ block: 'nearest' });
  }

  setGrid(size: number): void {
    this.gridSelect.value = String(size);
  }

  setLevelFields(level: Pick<LevelJson, LevelField>): void {
    for (const [key, input] of this.levelInputs) input.value = String(level[key as LevelField]);
  }

  /** Rebuild the fields form for the selection (or a hint when nothing is selected). */
  setSelection(level: LevelJson, ref: Ref | null, propNames: readonly string[]): void {
    this.fields.replaceChildren();
    if (!ref) {
      this.fields.append(el('p', 'editor-hint', 'click an object; shift-click cycles overlapping ones'));
      return;
    }
    this.fields.append(el('div', 'editor-ref', `${ref.kind} #${ref.index}`));
    for (const spec of fieldsFor(ref.kind, propNames)) this.fields.append(this.fieldRow(level, ref, spec));
  }

  private fieldRow(level: LevelJson, ref: Ref, spec: FieldSpec): HTMLElement {
    const row = el('label', 'editor-row', `${spec.key} `);
    const value = getField(level, ref, spec.key);
    const emit = (raw: string | boolean): void => this.handlers.onField(ref, spec.key, raw);
    if (spec.type === 'bool') {
      const input = el('input');
      input.type = 'checkbox';
      input.checked = value === true;
      input.addEventListener('change', () => emit(input.checked));
      row.append(input);
    } else if (spec.type === 'enum') {
      const select = el('select');
      if (spec.optional) {
        const none = el('option', undefined, '(none)');
        none.value = '';
        select.append(none);
      }
      for (const o of spec.options ?? []) {
        const opt = el('option', undefined, o);
        opt.value = o;
        select.append(opt);
      }
      select.value = typeof value === 'string' ? value : '';
      select.addEventListener('change', () => emit(select.value));
      row.append(select);
    } else {
      const input = el('input');
      input.name = `field-${spec.key}`;
      input.value = spec.type === 'points' ? JSON.stringify(value) : value === undefined ? '' : String(value);
      if (spec.type === 'points') input.title = 'JSON array of {x, y} waypoints (collider min corner)';
      input.addEventListener('change', () => emit(input.value));
      input.addEventListener('keydown', (e) => e.stopPropagation());
      row.append(input);
    }
    return row;
  }

  setProblems(problems: readonly string[]): void {
    this.problems.replaceChildren(...problems.map((p) => el('li', undefined, p)));
    this.problems.classList.toggle('ok', problems.length === 0);
    if (problems.length === 0) this.problems.append(el('li', 'editor-ok', 'level is valid'));
  }

  setStatus(text: string, kind: 'info' | 'ok' | 'error' = 'info'): void {
    this.status.textContent = text;
    this.status.dataset.kind = kind;
  }
}
