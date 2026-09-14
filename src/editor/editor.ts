import { formatLevel } from '@content/format';
import { levelProblems, type LevelJson, type Point, type Rect } from '@content/level';
import { DECOR_LAYERS, levelArtReferenceProblems, type DecorLayer } from '@content/level-art';
import { CAMERA } from '@game/tuning';
import type { App, EditorHooks } from '@app/app';
import type { GameAssets } from '@render/assets';
import { LENS } from '@render/stage';
import { PIXELS_PER_UNIT, SIM_PX_PER_ATLAS_PX } from '@render/units';
import * as ops from './doc';
import { EditorDoc, type ObjectKind, type Ref } from './doc';
import { EditorOverlay, type HandleName } from './overlay';
import { EditorPanel, GRID_SIZES, type Action, type LevelField, type Tool } from './panel';
import './editor.css';

type Drag =
  | { kind: 'pan'; startPx: Point; startCam: Point }
  | { kind: 'move'; ref: Ref; start: Point; origin: Rect; moved: boolean; base: LevelJson }
  | { kind: 'resize'; ref: Ref; handle: HandleName; origin: Rect; base: LevelJson }
  | { kind: 'create'; tool: ObjectKind; start: Point; current: Point };

interface EditorCamera {
  readonly x: number;
  readonly y: number;
  /** Lens distance in stage units; `LENS.distance` is the play view. */
  readonly distance: number;
}

const ZOOM = { min: 6, max: 160, step: 1.15 } as const;
/** Opening view: pulled back from the play lens, looking a little ahead of and above the spawn. */
const OPENING_VIEW = { zoomOut: 1.5, aheadOfSpawn: CAMERA.viewW / 4, aboveSpawn: CAMERA.viewH / 3 } as const;
/** Arrow-key pan with nothing selected, in sim px per grid step. */
const PAN_PER_GRID_STEP = 8;
/** Width of each side panel (editor.css `.editor-side`), which covers the canvas edges. */
const PANEL_WIDTH_PX = 220;
const FIT_MARGIN = 1.05;
const SAVE_ENDPOINT = '/__editor';
const BODY_FRAME: ops.FrameSize = { ...ops.BODY, px: 0.5 };
const HALF_FOV = (LENS.fovDeg * Math.PI) / 360;

/**
 * In-browser level editor (`?edit=1`). Owns the document, drives the App
 * (frozen sim, editor camera, level swaps on every change), draws the overlay,
 * and saves through the dev server's endpoint or a download when it is absent.
 */
export class Editor {
  private readonly doc: EditorDoc;
  private readonly overlay = new EditorOverlay();
  private readonly panel: EditorPanel;
  private tool: Tool = 'select';
  private prop: string | null;
  private layer: DecorLayer = 'prop';
  private grid: number = GRID_SIZES[0];
  private cam: EditorCamera;
  private drag: Drag | null = null;
  private playing = false;
  /** The level as last saved (or opened); the document is dirty when its level is a different object. */
  private savedLevel: LevelJson;
  private readonly propNames: readonly string[];
  private readonly canvas: HTMLCanvasElement;
  private readonly hooks: EditorHooks;

  constructor(
    private readonly app: App,
    private readonly assets: GameAssets,
  ) {
    const art = assets.levelArt;
    const frames = art?.props.json.frames ?? {};
    this.propNames = Object.keys(frames).sort();
    this.prop = this.propNames[0] ?? null;
    const sizer: ops.DecorSizer = (name) => {
      const f = frames[name];
      return f ? ops.frameSize(f, SIM_PX_PER_ATLAS_PX) : null;
    };
    this.doc = new EditorDoc(app.currentLevel, sizer);
    this.savedLevel = app.currentLevel;
    this.canvas = app.stage.renderer.domElement;
    const level = this.doc.level;
    this.cam = { x: level.spawn.x + OPENING_VIEW.aheadOfSpawn, y: level.spawn.y + OPENING_VIEW.aboveSpawn, distance: LENS.distance * OPENING_VIEW.zoomOut };
    const image = art ? ((art.props.texture.image as { src?: string }).src ?? null) : null;
    this.panel = new EditorPanel(
      {
        onTool: (t) => this.setTool(t),
        onProp: (p) => this.setProp(p),
        onField: (ref, key, raw) => this.setField(ref, key, raw),
        onAction: (a) => this.action(a),
        onGrid: (g) => this.setGrid(g),
        onLevelField: (key, raw) => this.setLevelField(key, raw),
      },
      art && image ? { atlas: art.props.json, imageUrl: image } : null,
    );
    this.hooks = { tool: 'select', selection: null, objects: 0, revision: 0, dirty: false, lastSave: null, playing: false };
    app.hooks.editor = this.hooks;
  }

  attach(): void {
    document.body.classList.add('editing');
    document.body.append(this.panel.root);
    this.app.stage.scene.add(this.overlay.group);
    this.app.setMode('edit');
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKey);
    this.panel.setTool(this.tool);
    this.panel.setProp(this.prop);
    this.show();
    this.setGrid(this.grid);
    this.pushCamera();
  }

  detach(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKey);
    this.overlay.dispose();
    this.panel.root.remove();
    document.body.classList.remove('editing');
    this.app.setMode('play');
    this.app.hooks.editor = null;
  }

  // ---- State -----------------------------------------------------------------

  private get level(): LevelJson {
    return this.doc.level;
  }

  private get dirty(): boolean {
    return this.level !== this.savedLevel;
  }

  /** Record a document change as one undo step (from `base` when a drag previewed intermediate states) and show it. */
  private commit(next: LevelJson, select?: Ref | null, base: LevelJson = this.level): void {
    if (!this.doc.commitFrom(base, next)) return;
    if (select !== undefined) this.doc.selection = select;
    this.show();
  }

  /** Bring the world, overlay and panel in line with the document. */
  private show(): void {
    const problems = this.problems();
    // The sim only ever sees a valid level; an invalid state stays visible in the overlay and problem list until fixed.
    if (problems.length === 0) this.app.loadLevel(this.level);
    this.overlay.rebuild(this.level, this.doc.selection, this.doc.sizer);
    this.panel.setSelection(this.level, this.doc.selection, this.propNames);
    this.panel.setLevelFields(this.level);
    this.panel.setProblems(problems);
    this.hooks.selection = this.doc.selection ? `${this.doc.selection.kind}#${this.doc.selection.index}` : null;
    this.hooks.objects = ops.allRefs(this.level).length;
    this.hooks.revision = this.doc.revision;
    this.hooks.dirty = this.dirty;
    if (this.dirty) this.panel.setStatus(`${this.level.id}: unsaved changes (Ctrl+S)`);
  }

  private problems(): string[] {
    const list = levelProblems(this.level);
    const art = this.level.art;
    if (list.length === 0 && art && this.assets.levelArt) {
      // Backdrop stems cannot change in the editor, so the loaded set is the valid set; props are checked against the atlas.
      const frames = new Set(Object.keys(this.assets.levelArt.props.json.frames));
      const backdrops = new Set(Object.values(art.backdrops).filter((x): x is string => typeof x === 'string'));
      list.push(...levelArtReferenceProblems(art, this.level.movingSolids.map((m) => m.prop), frames, backdrops));
    }
    return list;
  }

  private select(ref: Ref | null): void {
    this.doc.selection = ref;
    this.show();
  }

  private setTool(tool: Tool): void {
    this.tool = tool;
    this.hooks.tool = tool;
    this.panel.setTool(tool);
    this.canvas.style.cursor = tool === 'select' ? 'default' : 'crosshair';
  }

  private setProp(prop: string): void {
    this.prop = prop;
    this.panel.setProp(prop);
    const sel = this.doc.selection;
    // With a decor piece selected the palette re-skins it; otherwise it arms the decor tool.
    if (sel?.kind === 'decor') this.commit(ops.setField(this.level, sel, 'prop', prop, this.doc.sizer));
    else this.setTool('decor');
  }

  private setGrid(size: number): void {
    this.grid = size;
    this.panel.setGrid(size);
    this.overlay.setGrid(size, this.level);
  }

  private setLevelField(key: LevelField, raw: string): void {
    if (key === 'name') {
      this.commit({ ...this.level, name: raw });
      return;
    }
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) return this.panel.setStatus(`${key} must be a positive integer`, 'error');
    this.commit({ ...this.level, [key]: n });
  }

  private setField(ref: Ref, key: string, raw: string | boolean): void {
    const spec = ops.fieldsFor(ref.kind, this.propNames).find((f) => f.key === key);
    if (!spec) return;
    let value: unknown;
    if (typeof raw === 'boolean') value = raw ? true : undefined;
    else if (raw === '' || raw === '(none)') value = undefined;
    else if (spec.type === 'int') {
      value = Number(raw);
      if (!Number.isInteger(value)) return this.panel.setStatus(`${key} must be an integer`, 'error');
    } else if (spec.type === 'points') {
      try {
        value = JSON.parse(raw);
      } catch {
        return this.panel.setStatus('path must be a JSON array of {x, y}', 'error');
      }
    } else value = raw;
    if (value === undefined && !spec.optional) return this.panel.setStatus(`${key} is required`, 'error');
    this.commit(ops.setField(this.level, ref, key, value, this.doc.sizer));
  }

  // ---- Actions ---------------------------------------------------------------

  private action(a: Action): void {
    const sel = this.doc.selection;
    switch (a) {
      case 'save':
        void this.save();
        return;
      case 'play':
        this.togglePlay();
        return;
      case 'undo':
        if (this.doc.undo()) this.afterHistory();
        return;
      case 'redo':
        if (this.doc.redo()) this.afterHistory();
        return;
      case 'delete':
        if (sel) this.commit(ops.remove(this.level, sel), null);
        return;
      case 'duplicate':
        if (sel) {
          const r = ops.duplicate(this.level, sel, this.doc.sizer);
          this.commit(r.level, r.ref);
        }
        return;
      case 'dress':
        if (sel && (sel.kind === 'solid' || sel.kind === 'oneWay') && this.prop && this.level.art) {
          this.commit(ops.dressSpan(this.level, sel, this.prop, this.doc.sizer, this.layer));
        } else this.panel.setStatus('dress needs a selected solid or one-way and a prop atlas', 'error');
        return;
      case 'fit':
        this.fit();
        return;
    }
  }

  private afterHistory(): void {
    this.show();
  }

  private togglePlay(): void {
    this.playing = !this.playing;
    this.hooks.playing = this.playing;
    this.overlay.group.visible = !this.playing;
    this.panel.root.classList.toggle('playing', this.playing);
    if (this.playing) {
      this.app.setMode('play');
      this.panel.setStatus('playtesting: P returns to the editor');
    } else {
      this.app.setMode('edit');
      this.pushCamera();
      this.panel.setStatus('editing');
    }
  }

  private async save(): Promise<void> {
    const problems = this.problems();
    if (problems.length) {
      this.panel.setStatus(`not saved: ${problems.length} problem(s)`, 'error');
      return;
    }
    const text = formatLevel(this.level);
    const id = this.level.id;
    try {
      const ping = await fetch(`${SAVE_ENDPOINT}/ping`);
      if (!ping.ok) throw new Error('no dev server');
      const res = await fetch(`${SAVE_ENDPOINT}/levels/${encodeURIComponent(id)}`, { method: 'PUT', body: text, headers: { 'Content-Type': 'application/json' } });
      const body = (await res.json()) as { ok: boolean; problems?: string[]; path?: string };
      if (!body.ok) {
        this.panel.setStatus(`server rejected: ${(body.problems ?? []).join('; ')}`, 'error');
        return;
      }
      this.markSaved(`saved ${body.path ?? id}`);
    } catch {
      // No dev server (production build): hand the file to the browser instead.
      const blob = new Blob([text], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${id}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      this.markSaved(`downloaded ${id}.json (no dev server)`);
    }
  }

  private markSaved(message: string): void {
    this.savedLevel = this.level;
    this.hooks.dirty = false;
    this.hooks.lastSave = message;
    this.panel.setStatus(message, 'ok');
  }

  // ---- Camera ----------------------------------------------------------------

  private pushCamera(): void {
    this.app.setEditorCamera(this.cam);
    this.overlay.setScale(this.unitsPerPx());
  }

  /** Stage units per CSS pixel on the Z=0 plane at the current distance. */
  private unitsPerPx(): number {
    const h = 2 * this.cam.distance * Math.tan(HALF_FOV);
    return h / (this.canvas.clientHeight || 1);
  }

  /** Frame the whole level in the part of the canvas the side panels leave uncovered. */
  private fit(): void {
    const l = this.level;
    const canvasW = this.canvas.clientWidth || 1;
    const canvasH = this.canvas.clientHeight || 1;
    const visibleW = Math.max(1, canvasW - 2 * PANEL_WIDTH_PX);
    const needH = Math.max(l.height / PIXELS_PER_UNIT, (l.width / PIXELS_PER_UNIT) * (canvasH / visibleW) * (canvasW / canvasH)) * FIT_MARGIN;
    this.cam = { x: l.width / 2, y: l.height / 2, distance: Math.min(ZOOM.max, needH / (2 * Math.tan(HALF_FOV))) };
    this.pushCamera();
  }

  private zoom(factor: number, aboutPx: Point): void {
    const before = this.pick(aboutPx);
    this.cam = { ...this.cam, distance: Math.min(ZOOM.max, Math.max(ZOOM.min, this.cam.distance * factor)) };
    this.pushCamera();
    // Keep the point under the cursor fixed.
    this.app.stage.setCamera(this.cam.x / PIXELS_PER_UNIT, this.cam.y / PIXELS_PER_UNIT, this.cam.distance);
    const after = this.pick(aboutPx);
    this.cam = { ...this.cam, x: this.cam.x + before.x - after.x, y: this.cam.y + before.y - after.y };
    this.pushCamera();
  }

  // ---- Pointer ---------------------------------------------------------------

  private canvasPx(e: PointerEvent | WheelEvent): Point {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** Canvas pixel to sim px on the gameplay plane. */
  private pick(px: Point): Point {
    const u = this.app.stage.pickPlane(px.x, px.y);
    return { x: u.x * PIXELS_PER_UNIT, y: u.y * PIXELS_PER_UNIT };
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (this.playing) return;
    const px = this.canvasPx(e);
    const p = this.pick(px);
    this.canvas.setPointerCapture(e.pointerId);
    if (e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey)) {
      this.drag = { kind: 'pan', startPx: px, startCam: { x: this.cam.x, y: this.cam.y } };
      return;
    }
    if (e.button !== 0) return;
    if (this.tool !== 'select') {
      this.drag = { kind: 'create', tool: this.tool, start: p, current: p };
      return;
    }
    const sel = this.doc.selection;
    if (sel) {
      const b = ops.bounds(this.level, sel, this.doc.sizer);
      const handle = this.overlay.handleAt(b, p, this.unitsPerPx());
      if (handle) {
        this.drag = { kind: 'resize', ref: sel, handle, origin: b, base: this.level };
        return;
      }
    }
    const hits = ops.refsAt(this.level, p, this.doc.sizer);
    let ref: Ref | null = hits[0] ?? null;
    if (e.shiftKey && sel) {
      // Cycle through overlapping objects.
      const i = hits.findIndex((h) => ops.sameRef(h, sel));
      ref = hits[(i + 1) % Math.max(1, hits.length)] ?? null;
    } else if (sel && hits.some((h) => ops.sameRef(h, sel))) ref = sel;
    this.select(ref);
    if (ref) this.drag = { kind: 'move', ref, start: p, origin: ops.bounds(this.level, ref, this.doc.sizer), moved: false, base: this.level };
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d) return;
    const px = this.canvasPx(e);
    const p = this.pick(px);
    switch (d.kind) {
      case 'pan': {
        const upp = this.unitsPerPx() * PIXELS_PER_UNIT;
        this.cam = { ...this.cam, x: d.startCam.x - (px.x - d.startPx.x) * upp, y: d.startCam.y + (px.y - d.startPx.y) * upp };
        this.pushCamera();
        return;
      }
      case 'create':
        d.current = p;
        this.overlay.setGhost(this.ghostRect(d), d.tool);
        return;
      case 'move': {
        const dx = ops.snap(p.x - d.start.x, this.grid);
        const dy = ops.snap(p.y - d.start.y, this.grid);
        if (dx === 0 && dy === 0 && !d.moved) return;
        d.moved = true;
        // Rebuild from the drag's base level so snapping does not accumulate.
        const moved = ops.move(d.base, d.ref, dx, dy, this.doc.sizer);
        this.preview(moved);
        return;
      }
      case 'resize':
        this.preview(ops.setBounds(d.base, d.ref, this.resized(d.origin, d.handle, p), this.doc.sizer));
        return;
    }
  };

  private readonly onPointerUp = (): void => {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.kind === 'create') {
      this.overlay.setGhost(null, d.tool);
      const r = this.ghostRect(d);
      if (r.w === 0 || r.h === 0) return;
      try {
        const added = ops.add(this.level, d.tool, r, { ...(this.prop ? { prop: this.prop } : {}), layer: this.layer, sizer: this.doc.sizer });
        this.commit(added.level, added.ref);
        if (d.tool === 'spawn' || d.tool === 'exit') this.setTool('select');
      } catch (err) {
        this.panel.setStatus((err as Error).message, 'error');
      }
      return;
    }
    if (d.kind === 'pan' || (d.kind === 'move' && !d.moved)) return;
    // The previews bypassed history; record the whole drag as one undo step from where it started.
    this.commit(this.level, d.ref, d.base);
  };

  /** Show an intermediate state during a drag without recording history. */
  private preview(level: LevelJson): void {
    this.doc.preview(level);
    if (levelProblems(level).length === 0) this.app.loadLevel(level);
    this.overlay.rebuild(level, this.doc.selection, this.doc.sizer);
  }

  private ghostRect(d: Extract<Drag, { kind: 'create' }>): Rect {
    const raw = ops.rectFromDrag(d.start, d.current);
    const point = d.tool === 'spawn' || d.tool === 'enemy' || d.tool === 'decor';
    if (point) {
      // Point objects are placed at the click, sized by their body or natural frame.
      const size = d.tool === 'decor' && this.prop ? (this.doc.sizer(this.prop) ?? BODY_FRAME) : BODY_FRAME;
      const x = ops.snap(d.current.x, this.grid);
      const y = ops.snap(d.current.y, this.grid);
      return { x: x - size.w * size.px, y, w: size.w, h: size.h };
    }
    return ops.snapRect(raw, this.grid);
  }

  private resized(o: Rect, h: HandleName, p: Point): Rect {
    let x0 = o.x;
    let y0 = o.y;
    let x1 = o.x + o.w;
    let y1 = o.y + o.h;
    const sx = ops.snap(p.x, this.grid);
    const sy = ops.snap(p.y, this.grid);
    if (h.includes('w')) x0 = Math.min(sx, x1 - Math.max(1, this.grid));
    if (h.includes('e')) x1 = Math.max(sx, x0 + Math.max(1, this.grid));
    if (h.includes('s')) y0 = Math.min(sy, y1 - Math.max(1, this.grid));
    if (h.includes('n')) y1 = Math.max(sy, y0 + Math.max(1, this.grid));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  private readonly onWheel = (e: WheelEvent): void => {
    if (this.playing) return;
    e.preventDefault();
    this.zoom(e.deltaY > 0 ? ZOOM.step : 1 / ZOOM.step, this.canvasPx(e));
  };

  // ---- Keyboard --------------------------------------------------------------

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (this.drag) return; // a drag owns the document until the pointer is released
    const mod = e.metaKey || e.ctrlKey;
    if (e.code === 'KeyP' && !mod) {
      this.togglePlay();
      e.preventDefault();
      return;
    }
    if (this.playing) return;
    if (mod && e.code === 'KeyS') {
      void this.save();
    } else if (mod && e.code === 'KeyZ') {
      this.action(e.shiftKey ? 'redo' : 'undo');
    } else if (mod && e.code === 'KeyY') {
      this.action('redo');
    } else if (mod && e.code === 'KeyD') {
      this.action('duplicate');
    } else if (e.code === 'Delete' || e.code === 'Backspace') {
      this.action('delete');
    } else if (e.code === 'Escape') {
      if (this.tool !== 'select') this.setTool('select');
      else this.select(null);
    } else if (e.code === 'KeyV') {
      this.setTool('select');
    } else if (e.code === 'KeyB') {
      this.action('dress');
    } else if (e.code === 'Home') {
      this.fit();
    } else if (e.code === 'KeyG') {
      this.setGrid(GRID_SIZES[(GRID_SIZES.indexOf(this.grid as (typeof GRID_SIZES)[number]) + 1) % GRID_SIZES.length]!);
    } else if (e.code === 'KeyF' && this.doc.selection?.kind === 'decor') {
      const flip = ops.getField(this.level, this.doc.selection, 'flip') === true;
      this.commit(ops.setField(this.level, this.doc.selection, 'flip', flip ? undefined : true, this.doc.sizer));
    } else if (e.code === 'KeyL') {
      this.layer = DECOR_LAYERS[(DECOR_LAYERS.indexOf(this.layer) + 1) % DECOR_LAYERS.length]!;
      const sel = this.doc.selection;
      if (sel?.kind === 'decor') this.commit(ops.setField(this.level, sel, 'layer', this.layer === 'prop' ? undefined : this.layer, this.doc.sizer));
      this.panel.setStatus(`decor layer: ${this.layer}`);
    } else if (/^Digit\d$/.test(e.code)) {
      const i = (Number(e.code.slice(5)) + 9) % 10;
      const kind = ops.KINDS[i];
      if (kind) this.setTool(kind);
    } else if (e.code.startsWith('Arrow')) {
      const step = e.shiftKey ? 1 : this.grid;
      const dx = e.code === 'ArrowLeft' ? -step : e.code === 'ArrowRight' ? step : 0;
      const dy = e.code === 'ArrowDown' ? -step : e.code === 'ArrowUp' ? step : 0;
      const sel = this.doc.selection;
      if (sel) this.commit(ops.move(this.level, sel, dx, dy, this.doc.sizer));
      else {
        this.cam = { ...this.cam, x: this.cam.x + dx * PAN_PER_GRID_STEP, y: this.cam.y + dy * PAN_PER_GRID_STEP };
        this.pushCamera();
      }
    } else return;
    e.preventDefault();
  };
}
