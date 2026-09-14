import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, Points, ShaderMaterial } from 'three';
import { LENS, PALETTE } from './stage';
import { toUnits } from './units';

/**
 * GPU particles: the CPU writes a particle's origin, velocity, birth time,
 * life, colour and size into a ring buffer once, and the vertex shader
 * integrates position and fades it every frame from a single time uniform.
 * Nothing is simulated per particle on the CPU, so a burst of a hundred
 * sparks costs one attribute upload.
 */

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uGravity;
  uniform float uRefDistance;
  attribute vec3 aVelocity;
  attribute float aBirth;
  attribute float aLife;
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aDrag;
  varying vec3 vColor;
  varying float vFade;
  void main() {
    float t = uTime - aBirth;
    float u = clamp(t / aLife, 0.0, 1.0);
    bool alive = t >= 0.0 && t < aLife;
    // Drag: velocity decays exponentially; gravity pulls down.
    float k = max(aDrag, 0.0001);
    vec3 pos = position + aVelocity * (1.0 - exp(-k * t)) / k + vec3(0.0, -0.5 * uGravity * t * t, 0.0);
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    float fade = 1.0 - u;
    vFade = alive ? fade : 0.0;
    vColor = aColor;
    // aSize is CSS px at the gameplay plane (the play camera distance); nearer or farther scales with perspective.
    gl_PointSize = alive ? aSize * uPixelRatio * (0.6 + 0.4 * fade) * (uRefDistance / -mv.z) : 0.0;
  }
`;

const FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vFade;
  void main() {
    if (vFade <= 0.0) discard;
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    float soft = smoothstep(1.0, 0.3, r);
    gl_FragColor = vec4(vColor, soft * vFade);
  }
`;

/** Particles sit in front of everything on the gameplay plane. */
const PARTICLE_Z = 0.6;
/** Gravity in stage units per second squared (sim gravity 1800 px/s^2 scaled down for a floaty spark). */
const GRAVITY_UNITS = 12;

export interface BurstSpec {
  readonly count: number;
  /** Speed range in sim px/s. */
  readonly speed: readonly [number, number];
  /** Emission cone centre and half-width in radians; a full circle is [any, PI]. */
  readonly angle: number;
  readonly spread: number;
  readonly life: readonly [number, number];
  readonly color: number | readonly number[];
  readonly size: readonly [number, number];
  readonly drag?: number;
}

/** Presets used by the effects wiring in the app. Colours from the palette. */
export const BURSTS = {
  hitSpark: { count: 10, speed: [120, 320], angle: 0, spread: Math.PI * 0.6, life: [0.15, 0.35], color: [0xffffff, PALETTE.neonCyan], size: [3, 6], drag: 6 },
  weakPointSpark: { count: 18, speed: [160, 380], angle: 0, spread: Math.PI, life: [0.2, 0.45], color: [0xffffff, PALETTE.neonMagenta], size: [3, 7], drag: 5 },
  solidSpark: { count: 5, speed: [80, 220], angle: 0, spread: Math.PI * 0.5, life: [0.1, 0.25], color: PALETTE.neonCyan, size: [2, 4], drag: 8 },
  enemyDeath: { count: 40, speed: [60, 300], angle: Math.PI / 2, spread: Math.PI, life: [0.4, 0.9], color: [PALETTE.warmAmber, PALETTE.rustOrange, 0xffffff], size: [3, 8], drag: 3 },
  novaFire: { count: 24, speed: [200, 420], angle: 0, spread: Math.PI * 0.35, life: [0.2, 0.4], color: [0xfffde0, PALETTE.neonCyan], size: [3, 6], drag: 6 },
  bossPhase: { count: 60, speed: [100, 400], angle: Math.PI / 2, spread: Math.PI, life: [0.5, 1.0], color: [PALETTE.neonMagenta, 0xffffff], size: [4, 9], drag: 2 },
  bossDeath: { count: 140, speed: [80, 480], angle: Math.PI / 2, spread: Math.PI, life: [0.6, 1.6], color: [PALETTE.neonMagenta, PALETTE.warmAmber, 0xffffff], size: [4, 10], drag: 2 },
} as const satisfies Record<string, BurstSpec>;

/** Tiny LCG so the look is stable run to run; the sim's rng is not for presentation. */
class FxRandom {
  private s = 0x9e3779b9;
  next(): number {
    this.s = (Math.imul(this.s, 1664525) + 1013904223) >>> 0;
    return this.s / 4294967296;
  }
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }
}

export class ParticleSystem {
  readonly points: Points;
  private readonly material: ShaderMaterial;
  private readonly position: BufferAttribute;
  private readonly velocity: BufferAttribute;
  private readonly birth: BufferAttribute;
  private readonly life: BufferAttribute;
  private readonly color: BufferAttribute;
  private readonly size: BufferAttribute;
  private readonly drag: BufferAttribute;
  private head = 0;
  private time = 0;
  private readonly rnd = new FxRandom();
  private readonly tmpColor = new Color();
  /** Particles written since the last upload, for the attribute update ranges. */
  private dirty = false;

  constructor(readonly capacity = 2048) {
    const geo = new BufferGeometry();
    const attr = (size: number): BufferAttribute => {
      const a = new BufferAttribute(new Float32Array(capacity * size), size);
      a.setUsage(DynamicDrawUsage);
      return a;
    };
    this.position = attr(3);
    this.velocity = attr(3);
    this.birth = attr(1);
    this.life = attr(1);
    this.color = attr(3);
    this.size = attr(1);
    this.drag = attr(1);
    // Everything starts dead: birth far in the future would also work, but life 0 is simplest.
    geo.setAttribute('position', this.position);
    geo.setAttribute('aVelocity', this.velocity);
    geo.setAttribute('aBirth', this.birth);
    geo.setAttribute('aLife', this.life);
    geo.setAttribute('aColor', this.color);
    geo.setAttribute('aSize', this.size);
    geo.setAttribute('aDrag', this.drag);
    this.material = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 }, uGravity: { value: GRAVITY_UNITS }, uRefDistance: { value: LENS.distance } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: AdditiveBlending,
    });
    this.points = new Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 50;
  }

  /** Emit a burst at a sim-pixel position. `flipX` mirrors the cone for shots travelling left. */
  burst(x: number, y: number, spec: BurstSpec, flipX = false): void {
    const colors = typeof spec.color === 'number' ? [spec.color] : spec.color;
    for (let i = 0; i < spec.count; i++) {
      const k = this.head;
      this.head = (this.head + 1) % this.capacity;
      const a = spec.angle + this.rnd.range(-spec.spread, spec.spread);
      const sp = toUnits(this.rnd.range(spec.speed[0], spec.speed[1]));
      const dirX = Math.cos(a) * (flipX ? -1 : 1);
      this.position.setXYZ(k, toUnits(x), toUnits(y), PARTICLE_Z);
      this.velocity.setXYZ(k, dirX * sp, Math.sin(a) * sp, 0);
      this.birth.setX(k, this.time);
      this.life.setX(k, this.rnd.range(spec.life[0], spec.life[1]));
      this.tmpColor.setHex(colors[Math.floor(this.rnd.next() * colors.length)]!);
      this.color.setXYZ(k, this.tmpColor.r, this.tmpColor.g, this.tmpColor.b);
      this.size.setX(k, this.rnd.range(spec.size[0], spec.size[1]));
      this.drag.setX(k, spec.drag ?? 4);
    }
    this.dirty = true;
  }

  /** Advance the clock; call once per rendered frame before drawing. */
  update(deltaSeconds: number, pixelRatio: number): void {
    this.time += deltaSeconds;
    this.material.uniforms['uTime']!.value = this.time;
    this.material.uniforms['uPixelRatio']!.value = pixelRatio;
    if (this.dirty) {
      for (const a of [this.position, this.velocity, this.birth, this.life, this.color, this.size, this.drag]) a.needsUpdate = true;
      this.dirty = false;
    }
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
    this.points.removeFromParent();
  }
}
