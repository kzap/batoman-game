import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from 'three';
import type { Vec2 } from '@core/math/vec2';

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
export const CAMERA = {
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
 * Contains no gameplay logic; it draws whatever the app tells it to.
 */
export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  private readonly canvas: HTMLCanvasElement;
  private readonly maxPixelRatio: number;
  private marker: Mesh | null = null;

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

    this.camera = new PerspectiveCamera(CAMERA.fovDeg, 16 / 9, CAMERA.near, CAMERA.far);
    this.camera.position.set(0, 2, CAMERA.distance);
    this.camera.lookAt(0, 2, 0);

    this.scene.fog = new Fog(PALETTE.smogPurple, 40, 220);
    this.buildLights();
    this.resize();
  }

  private buildLights(): void {
    // Low ambient so the key/rim pair does the work of separating Z=0 from the backdrop.
    this.scene.add(new AmbientLight(PALETTE.smogPurple, 0.6));

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

  /**
   * Grey-box reference scene: ground slab at Z=0, a couple of platform blocks,
   * backdrop planes at the standard layer depths, and a marker the sim drives.
   * Exists so Phase 0 has something visible that proves depth layering,
   * lighting, and the sim -> render path work.
   */
  addReferenceScene(): void {
    const solid = new MeshStandardMaterial({ color: PALETTE.concreteGrey, roughness: 0.9 });
    const rust = new MeshStandardMaterial({ color: PALETTE.rustOrange, roughness: 0.8 });

    const ground = new Mesh(new BoxGeometry(24, 1, 2), solid);
    ground.position.set(0, -0.5, LAYER_Z.gameplay);
    this.scene.add(ground);

    const stepA = new Mesh(new BoxGeometry(3, 0.5, 2), rust);
    stepA.position.set(-4, 1.25, LAYER_Z.gameplay);
    this.scene.add(stepA);

    const stepB = new Mesh(new BoxGeometry(3, 0.5, 2), rust);
    stepB.position.set(4, 2.5, LAYER_Z.gameplay);
    this.scene.add(stepB);

    interface Backdrop {
      z: number;
      color: number;
      /** Plane width in world units; sized so it fills the view at its depth. */
      width: number;
    }
    const backdrops: Backdrop[] = [
      { z: LAYER_Z.nearStructures, color: 0x3a2f4d, width: 40 },
      { z: LAYER_Z.midStructures, color: PALETTE.smogPurple, width: 90 },
      { z: LAYER_Z.farStructures, color: 0x1a1530, width: 180 },
      { z: LAYER_Z.farSky, color: PALETTE.deepShadow, width: 420 },
    ];
    for (const { z, color, width } of backdrops) {
      // Backdrops are unlit: only fog affects them, so Z=0 lighting stays readable.
      const plane = new Mesh(new PlaneGeometry(width, width * 0.5), new MeshBasicMaterial({ color }));
      plane.position.set(0, width * 0.15, z);
      this.scene.add(plane);
    }

    this.marker = new Mesh(
      new BoxGeometry(0.6, 1.2, 0.6),
      new MeshStandardMaterial({ color: PALETTE.neonCyan, emissive: PALETTE.neonCyan, emissiveIntensity: 0.6 }),
    );
    this.marker.position.set(0, 1.5, LAYER_Z.gameplay);
    this.scene.add(this.marker);
  }

  /** Place the reference marker on the gameplay plane. No-op before addReferenceScene(). */
  setMarker(p: Vec2): void {
    this.marker?.position.set(p.x, p.y, LAYER_Z.gameplay);
  }
}
