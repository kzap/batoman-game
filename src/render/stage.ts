import { AmbientLight, Color, DirectionalLight, Fog, Mesh, PerspectiveCamera, Scene, WebGLRenderer } from 'three';

/** Palette anchors from docs/ART.md. */
export const PALETTE = {
  deepShadow: 0x0d0d1a,
  smogPurple: 0x2a1f3d,
  concreteGrey: 0x4a4a5a,
  rustOrange: 0xb85c2a,
  neonCyan: 0x00e5ff,
  neonMagenta: 0xff2d78,
  warmAmber: 0xffaa33,
} as const;

/**
 * Camera parameters for the 2.5D view. A narrow FOV keeps jump distances
 * readable: perspective compression is small at Z=0 so horizontal travel
 * on screen stays close to linear in world units.
 */
export const LENS = {
  fovDeg: 30,
  /** Distance from camera to the gameplay plane (Z=0). */
  distance: 22,
  near: 0.1,
  far: 400,
} as const;

/** Z depths for scene layers. Gameplay is at 0; negative is away from camera. */
export const LAYER_Z = {
  farSky: -150,
  farStructures: -60,
  midStructures: -25,
  nearStructures: -8,
  gameplay: 0,
  foregroundNear: 5,
  foregroundClose: 15,
} as const;

export interface StageOptions {
  canvas: HTMLCanvasElement;
  /** Cap on devicePixelRatio to bound fill cost on retina displays. */
  maxPixelRatio?: number;
}

/**
 * Owns the Three.js renderer, scene graph, camera, and lighting.
 * Contains no gameplay logic; views (LevelView, EntityView) add themselves to
 * `scene` and the app points the camera each frame.
 */
export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  private readonly canvas: HTMLCanvasElement;
  private readonly maxPixelRatio: number;

  constructor(opts: StageOptions) {
    this.canvas = opts.canvas;
    this.maxPixelRatio = opts.maxPixelRatio ?? 2;

    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      // Lets tests and screenshot tooling read the framebuffer after present.
      preserveDrawingBuffer: true,
    });
    this.renderer.setClearColor(new Color(PALETTE.deepShadow));

    this.camera = new PerspectiveCamera(LENS.fovDeg, 16 / 9, LENS.near, LENS.far);
    this.camera.position.set(0, 2, LENS.distance);
    this.camera.lookAt(0, 2, 0);

    this.scene.fog = new Fog(PALETTE.smogPurple, 40, 220);
    this.buildLights();
    this.resize();
  }

  private buildLights(): void {
    // Grey-box level of ambient so untextured faces read; Phase 4 lowers it once art carries the contrast.
    this.scene.add(new AmbientLight(0x8a8aa0, 1.4));

    const key = new DirectionalLight(PALETTE.warmAmber, 2.2);
    key.position.set(-6, 10, 12);
    this.scene.add(key);

    const rim = new DirectionalLight(PALETTE.neonCyan, 1.4);
    rim.position.set(8, 4, -6);
    this.scene.add(rim);
  }

  /** Fit renderer and camera to the canvas's CSS size. Call on window resize. */
  resize(): void {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, this.maxPixelRatio));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.scene.traverse((o) => {
      if (o instanceof Mesh) {
        o.geometry.dispose();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m.dispose();
      }
    });
    this.renderer.dispose();
  }

  /** Look at a point on the gameplay plane (stage units) from the fixed distance. */
  setCamera(x: number, y: number): void {
    this.camera.position.set(x, y, LENS.distance);
    this.camera.lookAt(x, y, 0);
  }
}
