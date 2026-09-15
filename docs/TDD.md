# BatoMan v2 - Technical Design

Status: skeleton. Sections are filled in by the phase that implements them. Anything not marked
`[implemented]` describes intent, not shipped code.

## 1. Stack `[implemented: Phase 0]`

| Package | Version | Role |
|---|---|---|
| `three` | 0.186 | Renderer, scene graph, loaders |
| `postprocessing` | 6.39 (added in Phase 4) | Bloom, vignette, grain, DOF |
| `vite` | 7 | Dev server, bundler |
| `typescript` | 5.9 (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) | |
| `vitest` | 5 | Unit and replay tests |
| `@playwright/test` | 1.63 | E2E against the production build |
| `sharp` | 0.35 (added in Phase 1) | Offline asset tooling |

Node 20.19+ or 22.12+ (`engines`; Vite 7 requirement). Path aliases `@core`, `@game`, `@render`, `@app`, `@content` are defined in
`tsconfig.json` and `vite.config.ts`; `vitest.config.ts` inherits them via `mergeConfig`.

## 2. Layers `[implemented: Phase 0]`

`core <- game <- render/app <- editor`. `src/editor` is loaded on demand (`?edit=1`) as its own chunk and may
import every other layer; nothing imports it except `main.ts`. ESLint (`eslint.config.js`) forbids `core` and `game` from importing `three`,
`postprocessing`, or anything under `render/` or `app/` (aliased or relative); from touching browser globals
(`window`, `document`, `navigator`, storage, timers, `performance`, `globalThis`); and from calling
`Math.random`, `Date.now`, `performance.now`, or `new Date`.

## 3. Time `[implemented: Phase 0]`

`FixedClock` (`src/core/sim/clock.ts`) accumulates frame time and issues whole ticks at `SIM_HZ = 120`.
At most `MAX_TICKS_PER_FRAME = 8` ticks run per frame; excess time is discarded and reported as `dropped`.
The remainder fraction `alpha` in `[0, 1)` drives render interpolation. Negative, NaN, and infinite frame
durations count as zero.

## 4. Sim `[implemented: Phase 2-6]`

Units are integer sim pixels with Y up; 32 px tiles; the player is 24 x 48 (24 x 24 crouched). The renderer
maps pixels to stage units; nothing in `core/` or `game/` knows about Three.js.

### 4.1 Collision (`src/core/sim/collision.ts`)

The Celeste Actor/Solid model. `Body` holds integer `x, y` plus per-axis remainders in [-0.5, 0.5];
`CollisionWorld.moveX/moveY` add the fractional amount to the remainder, round, and move one pixel at a
time, stopping at the first solid pixel and dropping the remainder on impact. Consequences: no tunnelling
at any speed, exact replay, and slow speeds still accumulate.

- One-way platforms block only a downward move whose start position has the feet exactly on the top edge;
  `ignoreOneWay` lets the player drop through (down + jump).
- `ceilingCorrection: n` shifts the body up to `n` px sideways when a rising move is blocked, so clipping a
  ledge corner by a few pixels does not kill the jump.
- `moveSolid` moves a solid by whole pixels, carries riders (feet on its top edge with horizontal overlap)
  without disturbing their own remainders, and pushes bodies it runs into; a body pushed into another solid
  is reported to `onSquish`. Riders are re-evaluated between the horizontal and vertical pass, so a rider
  stopped by a wall is left behind. The solid is non-collidable during its own move.

### 4.2 Player (`src/game/player.ts`, tuning in `src/game/tuning.ts`)

All timers are ticks. Per tick: timers, sense (grounded, walls), dash, crouch, horizontal accel/decel,
jump, gravity, fire, then integrate through the collision world. Mechanics and their tuning keys:

| Mechanic | Behaviour | Keys |
|---|---|---|
| Run | Approach `runSpeed` at ground/air accel; separate decel; overspeed bleeds at `overspeedDecel` | `runSpeed`, `groundAccel`, `groundDecel`, `airAccel`, `airDecel` |
| Jump | `jumpSpeed` up; release before the apex clamps to `jumpReleaseSpeed`; gravity scaled by `apexGravityScale` near the apex while held and `fastFallScale` after release | `jumpSpeed`, `jumpReleaseSpeed`, `apexThreshold` |
| Coyote / buffer | Jump accepted `coyoteTicks` after leaving ground; a press is remembered `jumpBufferTicks` | |
| Wall slide / kick | Pushing into a wall while airborne caps fall speed at `wallSlideSpeed`; jump kicks away at (`wallJumpX`, `wallJumpY`) and ignores horizontal input for `wallJumpLockTicks`; accepted `wallCoyoteTicks` after leaving the wall | |
| Dash | `dashSpeed` for `dashTicks` with gravity off and i-frames; one per airtime, refilled on landing; `dashCooldownTicks` between dashes; ends at `dashEndSpeed` | |
| Crouch / slide | Down on the ground halves the hitbox; entered at speed it slides with `slideDecel`; crouch-walk at `crouchSpeed`; stands only with headroom | `crouchHeight`, `slideMinSpeed` |
| Fire | On press only, `fireCooldownTicks` apart; not while sliding | |

Measured with the defaults: full jump 81 px high (2.5 tiles), 0.67 s airtime, 133 px horizontal at run
speed, so a 3-tile gap is the widest a plain jump clears; wider gaps need a dash or a platform.

### 4.3 World (`src/game/world.ts`)

`World(level, seed)` builds the collision world from the level JSON and spawns the level's enemies, then
`step(input)` runs one tick: movers, player (or respawn countdown), zones, enemies, projectiles, camera.
Zones: death zones and falling below y = 0 kill instantly (`pit`); `crusher` hazards kill; `spikes` deal 1
damage with knockback away from the hazard; checkpoints move the respawn point; the exit sets
`status: 'complete'` once `exitOpen` (no boss, or the boss is dead). Death clears projectiles, respawns
every enemy fresh and the player after `respawnTicks` with one life fewer; at zero lives
`status: 'gameover'`. Damage respects `Health` invulnerability (`invulnTicks`) and the dash's i-frames; a
fatal hit skips hurt-stun.

`snapshot()` is the renderer's only view: player exact position/pose/hp/charge, projectiles (kind, centre,
velocity), enemies (section 4.6), the boss bar state, moving solids, status and lives. `events` announces
jump, land, dash, fire (with kind), hurt, death, respawn, checkpoint, complete, gameover, and the combat
events `shotEnd`, `enemyHit`, `enemyDeath`, `bossPhase`, `bossDefeated`, each with a level-pixel position,
for audio and effects.

The seeded `Rng` (`src/core/sim/rng.ts`, mulberry32) lives on the World and is passed to enemies through
their context; camera shake is its only consumer so far.

### 4.5a Combat (`src/game/projectiles.ts`, tuning `PROJECTILE`, `NOVA`, `ENEMY_SHOT`)

`ProjectilePool` holds 64 slots reused in place (a full pool recycles the oldest shot); ids are fresh per
shot so the renderer can key sprites. A projectile is a centre, velocity, box, damage, range and kind:
`plasma` (tap fire: 12x6, 720 px/s, 480 px range, 1 damage, 10-tick cooldown), `nova` (hold fire for
`NOVA.chargeTicks` 96 and release: 28x20, 480 px/s, 640 px, 3 damage, pierces through enemies it has
already damaged; the PRD's "AoE explosion" is realised as this pierce, which hits everything in a line
rather than a radius, a deliberate simplification until the effect is playtested) and `enemy` (20x10, 560 px
range, 1 damage, speed per enemy). A tap still fires plasma
at once; the charge only adds the nova on release, and `PlayerSnapshot.charge` (0..1) drives the muzzle
glow. Each tick a shot advances, ends on a solid, the level edge or its range (`shotEnd`), and then
either damages the player (enemy shots, knockback in the travel direction) or every hittable enemy it
overlaps (player shots; plasma stops at the first). Touching a hittable enemy costs
`ENEMY.contactDamage` with knockback away from its centre. Enemies never hurt each other.

### 4.6 Enemies (`src/game/enemies/`, tuning `ENEMY`, `BOSS`)

`Enemy` (`enemy.ts`) owns a `Body`, a `Health` without i-frames, facing, the hurt and death timers, the
shot cooldown and the hit rule: `hit(damage, dir, weakPoint)` returns the damage dealt (0 while not
`hittable`), sets `hurtTicks` and calls the subclass's `onHurt` (knockback), or starts the death countdown;
`gone` after `deathTicks` and the World drops it (also when it falls out of the level). Behaviour is a
`Fsm` (`src/core/sim/fsm.ts`: named states with `enter`/`update(ctx, ticks)`/`exit`, transitions by return
value) fed an `EnemyCtx` (collision world, read-only player, tick, level width, `fire`, `summon`,
`countAlive`). The base class provides the states every shooter shares: `shootState(t, next, aim)` (stop,
face, fire once `shotWindupTicks` in, hold as long again, arm the cooldown) and `hurtState(t, next)` (slide
with the knockback decaying by `ENEMY.knockbackDecay`, then resume with the cooldown restarted); a hit
interrupts any state into `hurt`. Ground enemies fall under `ENEMY.gravity`. Poses
(`idle | move | shoot | hurt | death | cloaked | windup | rush | stunned | shift`) are what the renderer maps
to clips; `alpha` and `flash` ride along in `EnemySnapshot`.

| Type | Sheet | Behaviour |
|---|---|---|
| `patroller` | patroller | 40x60, 3 hp. Walks its spawn +/- `patrolDistance` at 60 px/s, turning at bounds, walls and ledges. Seeing the player ahead within 320 px and 96 px of its height it stops, fires a horizontal shot (300 px/s from 34 px up) 36 ticks into the shoot pose, then patrols with a 150-tick cooldown. A hit knocks it back 120 px/s and restarts the cooldown. |
| `drone` | drone | 48x28, 2 hp. Hovers 88 px (centre) above its spawn's ground reference with a slow bob, between its patrol bounds. Within 300 px it dives to chest height (40 px above the player's feet, so a grounded shot connects), keeps a 120 px stand-off and fires aimed shots (260 px/s) every 120 ticks; it loses interest beyond `loseRange` 450 px. |
| `stealth` | patroller (no sigbin art yet) | 40x60, 3 hp. Cloaked (alpha 0.15, not hittable, no contact damage) until the player is within 200 px, decloaks over 40 ticks, then chases at 110 px/s to an 80 px stand-off and fires fast shots (340 px/s); re-cloaks beyond 420 px. |
| `aswang` | patroller at 1.6x, lilac tint | The Level 1 boss, 64x96, 24 hp; see below. |
| `tikbalang` | tikbalang | Spawn data only; drawn if placed, no behaviour yet. |

The boss (`boss.ts`) is dormant until the player is within 560 px (`BossSnapshot.engaged` shows the HUD
bar). Phases by hp: 1 (24-17) walks to a 200 px stand-off and fires bursts of three shots 12 ticks apart at
standing height every 120 ticks; 2 (16-9) adds a rush every 360 ticks: a 40-tick wind-up (`windup`), then
420 px/s toward the player with the collider lowered to 56 px so a jump timed 0.2 s ahead clears it, ending
`stunned` for 100 ticks against a wall, a ledge or after 90 ticks; 3 (8-1) fires every 70 ticks and summons
drones every 480 ticks, two at a time but never past two alive (`countAlive`). Crossing a threshold queues a
`shift`: 72 invulnerable ticks, and the new phase opens with its new move (a rush after the first shift, a
summon after the second). The World emits `bossPhase` when it sees `phase` change. The weak point
(`weakPointRect`, 24 px tall from 56 px up) doubles damage while stunned; `BossSnapshot.exposed` and
`weakPoint` let the renderer show the core only then. Its death fires `bossDefeated`, shakes the camera and
opens the exit; the bar hides once the death clip ends.

Numbers are a first pass chosen so a standing player wins a patroller duel engaged at sight range and the
route bot clears Level 1 undamaged; they live in `tuning.ts` and nowhere else.

### 4.4 Camera (`src/game/camera.ts`, tuning `CAMERA`)

The camera is simulated so replays frame identically. Per tick: look-ahead eases toward `lookAhead` px in
the facing direction while running (`lookAheadEase` of the remaining distance per tick); the target is the
player centre plus look-ahead, `focusAboveFeet` above the feet. A deadzone (`deadzoneX`, `deadzoneY`)
absorbs small motion; only the excess pulls the camera, by `followX`/`followY` of the remaining distance per
tick (fixed fractions, no `exp`, so replays are exact). While airborne the upward deadzone widens to
`airDeadzoneUp`, so jumps do not bob the view but falls are followed. The centre is clamped to the level
so the design view (`viewW x viewH`) never shows outside it; levels smaller than the view are centred.
`shake(amplitude, ticks)` draws per-tick offsets from the world RNG with linearly decaying amplitude; a
weaker shake never replaces a stronger one in progress. Hurt and death shake the camera; respawn snaps it.

### 4.5 Input (`src/core/sim/input.ts`, `src/app/keyboard.ts`)

`InputFrame` is seven booleans; `InputEdges` derives presses and releases from consecutive frames so a
replay needs only held state. `packInput` stores a frame as one bit per button. The keyboard layer latches
a key pressed and released inside one render frame so a quick tap still reaches one sim tick.

## 5. Renderer `[implemented: Phase 3-6]`

`Stage` (`src/render/stage.ts`) owns the `WebGLRenderer`, `Scene`, `PerspectiveCamera` (`LENS`: FOV 30,
distance 22, looking at Z=0), fog, ambient + key/rim lights, and the optional `PostStack`. `LAYER_Z` fixes
the Z depths for backdrop, gameplay, and foreground layers. `setCamera(x, y)` places the camera over a point
on the gameplay plane; `render(deltaSeconds)` draws through the post stack when one is installed.
`preserveDrawingBuffer` is on so tests can read pixels. The lights only affect the few lit meshes left (grey
boxes, crushers); art is drawn unlit.

Units: `src/render/units.ts`, 32 sim pixels per stage unit (`toUnits`). Atlas frames are packed at half
source scale, and one source pixel is one sim pixel, so `atlasToUnits` maps 1 atlas px to 0.5 sim px
(`SIM_PX_PER_ATLAS_PX`). At Z=0 the view is about 21 x 11.8 units (672 x 378 px); BatoMan's 120 px idle
frame is 60 sim px tall over a 48 px hitbox.

### 5.1 Assets and sprites

`loadAssets(level, source)` (`assets.ts`) fetches the `batoman` atlas and, when the level has an `art`
block, its prop atlas and backdrop textures, through an `AssetSource` (`HttpAssetSource` in production; tests
substitute their own). `main.ts` awaits it before constructing `App`; a failed fetch is pushed to
`hooks.errors` as `boot failed: ...`.

`SpriteQuad` (`sprite.ts`) is one `PlaneGeometry` quad with an unlit `MeshBasicMaterial` (`alphaTest 0.02`,
`depthWrite false`, no lighting). `setFrame` rewrites the UVs from `frameUv`; `place(x, y, z, { flip, size,
scale })` positions the quad so the frame's pivot lands on the sim point, using `placeFrame`
(`sprite-layout.ts`, pure). By default the quad is sized from the frame's pixel box through
`SIM_PX_PER_ATLAS_PX`; `size` stretches a frame to a target width or height (decor scaled to a span, a mover's
prop to its collider), keeping the aspect when one side is given.

`PlayerAnimator` (`animator.ts`) is tick-driven: `frameAt(pose, shooting, tick)` picks a clip with
`clipForPose` and a frame with `clipFrameIndex`, so playback is deterministic and survives replay. The atlas
has `idle run shoot shoot_run hurt jump orb`; poses without art borrow: `jump` = first five jump frames
(non-looping, 1.5x fps), `fall` = last three, `wallslide` = jump frame 6, `crouch`/`slide` = jump frame 0,
`dash` = run frame 3, `dead` = hurt frame 1. While `PlayerSnapshot.shooting` is true (36 ticks after a shot,
`PLAYER.shootPoseTicks`), idle/crouch use `shoot` and run uses `shoot_run`.

### 5.2 Level view and diorama

`LevelView(level, art)` (`level-view.ts`) builds the static scene. With art: two backdrop planes placed by
`backdropPlacement` (`diorama.ts`), decor quads from `art.decor` at `DECOR_Z` (`wall` -1.2, `prop` -0.4,
`front` 3), and additive glow planes for the zones that matter in play (checkpoint beams amber, exit beam
cyan, death zones teal, spikes magenta). Without art it draws the Phase 3 grey boxes. Collider outlines for
every static rectangle (`setOutlines`) are toggled with the debug overlay.

`diorama.ts` is pure geometry. `SLOT_Z` maps the `far` slot to `LAYER_Z.farStructures` (-60) and `mid` to
`LAYER_Z.nearStructures` (-8). `cameraRange` derives the camera's travel from the level size and
`CAMERA.viewW/viewH`; the far plane is sized so its projection covers that range with a 15% margin, wrapping
the texture (mirrored repeat) horizontally. The mid plane is sized to appear one screen tall and has its
bottom sunk 0.8 units below the ground line so the silhouettes sit behind the floor props; it repeats
horizontally with a 5% edge fade baked into the texture (section 7.3). Backdrop textures use linear
filtering without mipmaps (mipmap generation on two full-screen layers cost ~10 fps under software GL).

### 5.3 Entity view and post

`EntityView(assets)` (`entity-view.ts`) mirrors dynamic entities by id. The player is one `SpriteQuad` at
`PLAYER_Z` 0.3, flipped by facing, frame from `PlayerAnimator`, blinking while invulnerable and tinted
magenta while hurt; a muzzle glow (the `orb` frame) grows with `charge`. Enemies sit at `ENEMY_Z` 0.2 with
one quad and one material each (alpha for the cloak, magenta flash while `flash > 0`). How a type is drawn
is one table, `ENEMY_LOOK` in `assets.ts`: sheet, scale, tint, pivot (drones pivot at their centre), the
way the painted frames face (patroller and tikbalang right, drone left; the view mirrors to the sim's
facing) and the clip names for idle/move/shoot (the drone's idle is `hover`); the boss is the patroller look
at 1.6x with a lilac tint. `enemyClips(atlas, look)` (`animator.ts`) maps poses onto that (`rush` is the walk sped up,
`stunned` holds the second hurt frame, death clips never loop) for a `ClipAnimator<EnemyPose>`; views of
dropped enemies go to a per-type free list and are reused. The boss core is an additive magenta orb over
`BossSnapshot.weakPoint`, shown pulsing only while `exposed` (ART: visible during vulnerability windows).
Projectiles are keyed by kind: plasma is the `orb` frame at 0.4, nova at 0.9 tinted white-hot, enemy shots
the first loaded enemy sheet's `projectile` clip; their quads are pooled too. A moving solid with `prop`
set draws that frame stretched to the collider width (aspect kept) hanging from the collider's top edge;
without `prop` it is a lit box. `present(prev, cur, alpha)` lerps positions between snapshots; collider
outlines are separate `LineSegments` toggled by `setOutlines`. `loadAssets` fetches the enemy sheets a
level needs (`enemyAtlasNames`: the types placed, plus drones when a boss is placed) alongside `batoman`.

`Effects` (`effects.ts`) subscribes to a world's combat events and emits bursts from `ParticleSystem`
(`particles.ts`): one `Points` mesh of 2048 slots whose origin, velocity, birth time, life, colour, size and
drag are written once into a ring buffer; the vertex shader integrates position (drag, gravity) and fade
from a time uniform, and sizes points in CSS pixels at the gameplay plane. Presets in `BURSTS`: hit spark,
weak-point spark, solid spark, enemy death, nova fire, boss phase, boss death, coloured from `PALETTE`. The
app owns the `Effects` and re-attaches it to each new World; the renderer still only sees event payloads.
The app also freezes the sim for two frames on `bossPhase` (ART's phase-transition hit-stop; the ticks are
skipped, not replayed, so fixtures are unaffected). The grey-box HUD (`src/app/hud.ts`) shows a boss bar
with phase while `boss.engaged`.

`PostStack` (`post.ts`, `postprocessing`): bloom (luminance threshold 0.62, intensity 1.1, mipmap blur) so
only emissive planes and highlights glow, vignette (offset 0.32, darkness 0.55), soft-light film grain
(opacity 0.35), and optional depth of field focused at `LENS.distance` (range 6, bokeh 3). `POST_DEFAULTS`
enables bloom, vignette and grain; DOF is off (11 fps under SwiftShader). `?post=0` disables the stack
(and re-enables canvas MSAA, which the stack otherwise replaces); `?dof=1` turns DOF on
(`postOptionsFromQuery` in `app.ts`).

Camera framing comes from the sim (`CameraController`, section 4.4); the app lerps the centre between
snapshots and adds the current tick's shake offset unlerped.

## 6. App `[implemented: Phase 3-7]`

`installHooks()` (`src/app/app.ts`) publishes `window.__batoman` and global error capture before anything
else runs, so a WebGL boot failure is recorded in `errors`. Hooks carry `frames`, `simTicks`,
`droppedFrames`, `lastFrameMs`, `player {x, y, pose, hp}`, `camera {x, y}`, `enemies`, `boss`, `entities`,
`status`, `level` (id), `mode` (`play` | `paused` | `edit`), `screen` (shell screen kind), `score`, `music`
(track requested), `audio` (context running), `editor` (section 11, null unless the editor is attached), and
`replay(fixture)`, which restarts the level and feeds a recorded input sequence instead of the keyboard.

`main.ts` loads the first level's assets, builds the `App`, and wraps it in the `Shell` (section 6.1). `/`
opens the title over the frozen default level; `?level=<id>` (section 8) starts that level directly, for
deep links and tests; `?edit=1` also imports the editor chunk and attaches it. An unknown id is a boot
error, not a fallback to Level 1.

`App` runs the `requestAnimationFrame` loop: advance clock, step the world N times with the next input
(replay source if active, otherwise `Keyboard.frame()`), keep the last two snapshots, present with
interpolation, update the debug overlay and HUD. After `complete` or `gameover` the world freezes itself;
the shell decides what happens next. On a respawn the previous snapshot is replaced by the current one so
neither the camera nor the player lerps across the teleport. `Keyboard` (`keyboard.ts`) latches a key
pressed and released inside one frame so a tap still reaches one tick; `reset()` forgets held keys when a
screen changes.

`App.loadLevel(level)` swaps the level in place (new `LevelView`, fresh world) for the editor; the prop
atlas and backdrops stay the ones loaded at boot, so a level cannot change `art.props` at runtime.
`App.replaceLevel(level, assets)` is the shell's move between levels: it disposes the old views and
textures, builds new ones, and leaves the world frozen for the intro card. `restartLevel()` makes a fresh
world; `onWorld` is called with each one so the shell can subscribe. `setMode('edit')` stops ticking and
detaches the keyboard, `paused` stops ticking with the keyboard kept, `play` runs; leaving `edit` restarts
the world so the edited geometry is what plays. `setEditorCamera({x, y, distance})` overrides the sim
camera, including the lens distance (`Stage.setCamera` takes it as a third argument for zoom).
`Stage.pickPlane(px, py)` unprojects a canvas pixel onto Z=0 for the editor's hit-testing.

`DebugOverlay` (`debug.ts`, backtick): fps and ticks/s over 500 ms windows, frame time, dropped frames,
entity count, tick, status, player position/size/pose/facing/hp, camera centre and shake. Toggling it also
shows collider outlines on every collider, static and dynamic. `Hud` (`hud.ts`, PRD 6.2) draws hearts
top-left with lost ones greyed, lives, the six-digit score top-right, and the boss bar bottom-centre while
`boss.engaged`; it rebuilds its DOM only when one of those values changes.

Levels 3 and 6 stay grey-box (section 8) and the title, level select and game over cards are text
(ART.md's silhouettes, thumbnails and salakot need art that does not exist yet); the results card does not
yet dim or tally (Phase 8 polish).

### 6.1 Shell (`src/app/shell/`)

The shell is the game around the level: title, level select, intro card, pause, results, game over and
credits. `screens.ts` is a pure reducer: `reduce(screen, event, ctx)` takes a `Screen`
(`title | levelSelect | intro | playing | paused | complete | gameover | credits`, menus carry their cursor
`index`), a `ShellEvent` (`confirm | back | up | down | pause | levelComplete | gameOver | timeout`) and the
level list with what is unlocked, and returns the next screen plus `Effect`s (`startLevel {levelId, newRun}`,
`restartLevel`, `resume`, `freeze`, `quitToTitle`). Menus wrap; a locked level does not start; the last
level's clear leads to the credits; game over offers retry or quit. `tests/unit/app/screens.test.ts`
covers every transition.

`Shell` (`shell.ts`) interprets the effects against the `App`, `Overlay`, `GameAudio` and the save store.
Keys: Enter confirm, Esc back/pause, P pause, arrows or W/S move the cursor, M and N toggle music and sfx
(saved). While playing only Esc and P reach the shell, and nothing does while the editor is attached (its
playtest owns P and Esc). `startLevel` fetches the level and its assets and calls `replaceLevel` (or
`restartLevel` when it is the current level); the intro card advances on Enter or after `SHELL_TIMING.intro`
2.2 s (re-armed while the level is still loading). One timer slot holds the pending delayed event and every
screen change clears it, so a quit or restart cannot be followed by a stale card. Each new World is watched
for `enemyDeath` (score, `score.ts`: 100/150/200/500/1000 per type), `complete` (clear bonus 500 + 100 per
heart from the event's `hp`, result recorded, `levelComplete` after 0.9 s) and `gameover` (`gameOver` after
1.2 s); a completion or game over that lands while paused still shows its card. The run keeps the total
score and the current level's share: a restart or retry takes the level's points back, and the save records
the level's own score, not the run's. `Overlay` (`overlay.ts`) renders the current screen into `#overlay` as
a card (`data-screen` names it), dims the canvas on the title, level select, credits and game over, and
hides the HUD on screens without play; `CREDITS` holds the credits text.

`save.ts` keeps progress in `localStorage` under `batoman.v2.save`: `{ version: 1, unlocked, best, options }`.
`loadSave` validates and degrades to the defaults (first level unlocked, music and sfx on) on anything
unexpected; `recordClear` unlocks the next manifest level and keeps the fewer-tick result; `writeSave`
swallows storage failures. The store is an injected `KeyValueStore`, so tests use a Map.

### 6.2 Audio (`src/app/audio/`)

`AudioEngine` (`engine.ts`) owns one `AudioContext`, created by `unlock()` on the first key or pointer
(browsers refuse earlier), with master, music and sfx `GainNode` buses; before unlock every call is a
no-op. `duck(strength)` pulls the music bus to `AUDIO.duckTo` for `duckHold` and lets it recover over
`duckOut`; `setPaused` holds it at `pausedTo`. `Sfx` (`sfx.ts`) synthesises every cue on demand from a
recipe table (`RECIPES`: oscillators with pitch glides and envelopes, filtered deterministic noise, small
arpeggios), with a per-cue retrigger gap so a burst of hits does not stack; there are no sample files.
`MusicPlayer` (`music.ts`) streams `assets/audio/<track>.ogg` (section 7.5) through two `<audio>` elements
on the music bus and crossfades between them over `AUDIO.fade`; a track asked for before unlock starts on
`resume()`. `GameAudio` (`index.ts`) binds it all and maps `WorldEvents` to cues, the same channel the
particle effects use: jump/wallJump, land, dash, fire by kind, hit/weakHit, enemyDeath, hurt and death
(ducked), respawn, checkpoint chime, complete and gameover (ducked), bossPhase and bossDefeated (ducked).
Menu cues come from the shell. The manifest names each level's track and the title track (section 8).

## 7. Asset pipeline `[implemented: Phase 1]`

Raw sheets and recordings live in `art-source/` and never ship. Each sheet has a committed `*.recipe.json`
beside it; `npm run assets` (`tools/pack/index.ts`) wipes `public/assets/atlases/`,
`public/assets/backdrops/` and `public/assets/audio/` (all gitignored) and regenerates them from the recipes
and `art-source/audio/music.json`. `npm run build` runs `assets` before `validate`, so a clone builds
without a manual step.

### 7.1 Segmentation (`tools/recut`)

`segment()` (`segment.ts`) runs pure stages over an RGBA buffer; only `io.ts` touches `sharp`:

| Stage | Module | What it decides |
|---|---|---|
| Background | `background.ts` | Border-sampled colour palette, or the recipe's explicit `background` list for opaque sheets |
| Mask | `mask.ts` | Flood fill from the border with a hard and a soft tolerance; enclosed same-colour regions are kept (`enclosed: 'auto'` keys them only on saturated, pre-keyed sheets) |
| Erase | `segment.ts` | `overrides.erase` rectangles forced to background before labelling, to cut props that touch |
| Components | `components.ts` | 8-connected labelling; an optional `bridge` distance (default 0) joins near-touching blobs |
| Filter | `filter.ts` | Drops specks below `minArea` unless their centroid lies inside a larger component; drops the bottom-right watermark when small |
| Rows | `rows.ts` | Y-gap clustering using only substantial components; fragments join the nearest row |
| Grouping | `satellites.ts` | Sheets: small components near a frame become satellites (muzzle flash, debris). Catalogues: props never fuse; fragments attach to the prop whose box contains their centroid |
| Pivot | `pivot.ts` | `mass` (alpha-weighted centroid, default), `contact` (bottom-band centroid), or `center`, anchored at the bottom edge or the centre; `stabilize` replaces each frame's horizontal offset with the animation's median |

Frame ids are `r<row>f<index>` from the pre-override result, so `overrides.merge`, `drop`, `pivots`, and
`props` reference stable ids. Adding an `erase` rectangle can renumber a row; the review UI re-plans after
every edit so the reviewer sees the effect immediately.

The default is `mass`, not the contact band the plan proposed: on BatoMan's run row the contact-band pivot
moves between 0.43 and 0.57 of the frame width as the feet swing, while the mass centroid stays within
0.49 to 0.52 (measured with `computePivot` on `batoman.recipe.json`). Stabilisation then removes the
remaining jitter; shipped `run` pivots sit at 0.49 to 0.51 of frame width with `pivot.y` on the bottom edge
for every grounded frame.

Recipe schema: `recipe.ts` (`Recipe`, `parseRecipe`, `RecipeError`). Two kinds: `sheet` (rows of animation
frames, named by `animations[]`) and `catalogue` (independent props, named by `props`; unlisted frames are
reported as unused). `scale` in `(0, 1]` is applied when packing. The three enemy sheets and both prop
catalogues use `scale: 0.5`, which matches their 2816 px sources to the 1408 px BatoMan sheet.

Commands:

```
npm run recut <recipe.json>          # segment, print rows/frames/plan, write <name>.preview.png (gitignored)
npm run recut -- init <png> --name <n> --kind sheet|catalogue   # scaffold a recipe
npm run recut:review <recipe.json>   # browser review UI on 127.0.0.1:5177
```

### 7.2 Review UI (`tools/recut/review.ts`, `review.html`)

A local HTTP server that renders the keyed sheet with frame boxes and pivots, and writes the recipe on every
accepted edit. Edits: select, merge (`M`), drop (`Del`), erase-rectangle tool (`E`), pivot drag, prop
naming, animation rename/fps/loop, animation scrub with ghost overlay, and a raw JSON editor. `POST /api/recipe` re-parses, re-segments,
and re-plans; a `RecipeError` returns 400 and leaves the file untouched.

### 7.3 Packing (`tools/pack`)

`buildAtlas` (`atlas.ts`) crops each frame using the label map (so touching neighbours are excluded),
scales, extrudes edges by 1 px with a 1 px gutter, and packs with a skyline packer into the smallest
power-of-two texture up to `ATLAS_MAX_SIZE` (4096). Output is lossless WebP plus JSON in the `AtlasJson`
shape (`src/content/atlas.ts`, shared with the renderer): frame rects, per-frame pivots in atlas pixels,
and animations `{ fps, loop, frames }`. Frame names are `<animation>_<NN>` for sheets and the prop name for
catalogues.

`buildBackdrops` (`backdrops.ts`) reads `art-source/<level>/backdrops.json` and writes one WebP per layer,
lossy (default quality 82) unless the layer has transparency or sets `lossless: true`. Two per-layer fixes
run on the raw RGBA before encoding: `erase` rectangles (`mode: 'clear'` zeroes alpha; `mode: 'fill'`
recolours with the mean of the visible border pixels, keeping alpha) remove the generator's watermark, and
`edgeFade` (fraction of width) fades alpha to zero at the left and right edges so a layer can repeat
horizontally without a seam. Level 1 ships `sky` (opaque, from `background.png`) and `town` (alpha, from
`foreground.png`, lossy at quality 90, 5% edge fade); the source midground is not used.

Atlases are WebP only. KTX2/Basis output needs an encoder dependency and a runtime `KTX2Loader` path; it is
deferred until a measured GPU-memory or decode-time problem justifies it.

### 7.4 Outputs and payload

| Atlas | Frames | Texture | Size |
|---|---|---|---|
| `batoman` | 48 | 1024x1024 | 622 KB |
| `patroller` | 32 | 1024x1024 | 555 KB |
| `drone` | 34 | 1024x512 | 420 KB |
| `tikbalang` | 30 | 1024x1024 | 437 KB |
| `level-1-props` | 24 | 1024x1024 | 769 KB |
| `level-4-props` | 27 | 1024x1024 | 791 KB |

Sizes are as printed by `npm run assets` (KiB). Level 1 backdrops: `sky` 60 KB, `town` 225 KB.

The Level 1 set a player downloads today (BatoMan and props atlases with their JSON, two backdrops) is
1,729,694 bytes; with the patroller and drone atlases Phase 6 adds it is 2,741,238 bytes. v1 loaded
29,557,023 bytes of images for the same level (`git show v1-archive:src/scenes/PreloadScene.ts`: three
backdrops, tileset, batoman, drone, patroller PNGs). Ratio 9.3%, against the 10% ceiling; a quality or
scale increase on any Level 1 asset needs a matching saving elsewhere.

`npm run validate` (`tools/validate/assets.ts`) parses every recipe and backdrop spec, requires each output
file to exist, checks each atlas JSON with `atlasProblems()`, and confirms the WebP dimensions match the
JSON. A file under `public/assets/atlases/` with no recipe is an error. It then checks each level's `art`
block against the built outputs (`levelArtReferenceProblems`): the prop atlas exists, every decor and mover
prop names a frame in it, and every backdrop slot names a file under `public/assets/backdrops/<level>/`.

### 7.5 Music (`tools/pack/audio.ts`)

`art-source/audio/music.json` lists the tracks: `{ bitrateKbps, tracks: { <id>: { source, title } } }`.
Each source (mp3 as delivered) is transcoded to Opus in an Ogg container at the spec's bitrate with the
`ffmpeg` binary from `ffmpeg-static` (a dev dependency with a build per platform, so CI needs no system
install) and written to `public/assets/audio/<id>.ogg`. At 80 kbps the 191 s Level 1 track is 1.92 MB
(it shipped as a 4.6 MB mp3 in v1) and the 60 s Level 2 track 620 KB. Chromium, Firefox and Safari 17+
play Opus in Ogg; the single-audio budget stays 6 MB. The manifest's `music` and `titleMusic` fields must
name a track in the spec (`npm run validate` checks).

## 8. Content `[implemented: Phase 2-7]`

`src/content/level.ts` defines `LevelJson` (pixels, Y up): `solids`, `oneWay`, `movingSolids` (waypoint
path, speed, pause, optional `prop`), `hazards` (`spikes` | `crusher`), `deathZones`, `checkpoints`,
`enemies` (`type`, feet `x`/`y`, optional `patrolDistance`; types in section 4.6, `y` is the ground reference
for drones), `spawn`, `exit`, and an optional `art` block. `levelProblems()` rejects
overlapping blocking geometry, out-of-bounds rectangles, a spawn inside a solid, unknown enumerations and
duplicate checkpoint ids; `tools/validate` runs it on every level listed in `src/content/manifest.json`.

`src/content/manifest.json` lists the levels in play order, each with `id`, `file`, a display `name` and
its `music` track, plus `titleMusic` for the shell. `src/content/levels.ts` reads it at runtime:
`levelIdFromQuery(search)` resolves `?level=` (default: the first manifest entry), `manifestEntry(id)`
returns the entry, and `loadLevelById(id)` imports the level JSON through `import.meta.glob`, so each level
is its own chunk (Level 1 with its decor is 4 KB). Level files are
written in the layout of `src/content/format.ts` (`formatLevel`): two-space indent, primitive-only
objects and point arrays on one line, so rects and decor entries diff line by line.

| Level | Name | Size | Contents |
|---|---|---|---|
| `level-1` | Tondo Sublevel Docks | 6400x768 | Six floor segments split by a 96 px pit, a 256 px pit crossed on a mover, a 128 px dash gap, a 96 px pit and a second dash gap; a one-way to drop through, hop blocks, a plateau, two spike strips, two checkpoints, two upper ledges reached by one-way steps; fully dressed (58 decor quads). Enemies: patrollers at 700, 3400 and 5000, drones at 1500 and 4300, the `aswang` boss at 6150 on the last floor (the arena is the 672 px final segment; the exit stays shut until it dies) |
| `level-3` | Quiapo Underground Chapel | 3584x1024 | Grey-box: entrance ledge, drop to the nave, three stepping stones over a water death zone, a crusher pillar and spikes, a four-step one-way ladder up a shaft, upper gallery with a pillar and spikes. Enemies: a cloaked `stealth` at 800, a drone at 1900, a patroller at 3100 |
| `level-6` | Abandoned Rooftop Garden | 4480x896 | Grey-box: six rooftops at different heights with a hop, a 128 px dash gap, a vertical lift mover, a 128 px drop, planter one-way steps; spikes, a checkpoint. Enemies: a drone at 1000, a patroller at 2300, a `tikbalang` spawn at 4100 (no behaviour yet) |

Levels 3 and 6 have no `art` block and render as grey boxes with the zone glows until their art exists;
Phase 7 planned to dress them but no source art for either exists (Level 3 has one concept painting,
Level 6 nothing), so dressing waits on art rather than on code. Enemy placement follows one rule the routes rely on: a patroller must be
killable from a spot the player reaches before entering its sight range, with no solid between (a
patroller behind a hop block cannot be shot from the ground, and one that sees a pit jump lands a free hit).

`art` (`src/content/level-art.ts`, `LevelArtJson`) is presentation only; the sim never reads it.
`props` names the prop atlas, `backdrops` maps the `far` and `mid` slots to backdrop file stems, and `decor`
lists quads: `{ prop, x, y, w?, h?, flip?, layer? }` with `x, y` in sim pixels at the frame's pivot
(bottom centre), an optional `w` or `h` that scales keeping aspect, and `layer` in `wall | prop | front`
(default `prop`). `levelArtProblems()` checks shapes and keeps positions within one level width of the
level. Level 1's `art` uses `level-1-props` and the `sky`/`town` backdrops: floor boards
(`platform_long_a`/`_b`) scaled to fill each solid span, `platform_block_b` on the blocks,
`platform_low_a` hung from the one-ways and the mover, cans, and rust and concrete panels in the `wall`
layer. The spans were dressed with the editor's `dressSpan` operation (section 11).

`tools/level/from-tiled.ts` converts v1's Tiled map (`art-source/level-1/level-1.tiled.json`) into this
schema: tile runs are merged into rectangles, spawns carried over, Y flipped. The Phase 2-4 Level 1 started
from that output; the Phase 5 level replaced it with designed content and the tool is kept for importing
other Tiled maps.

### 8.1 Replays (`tests/replay/`)

A fixture is `{ level, seed, inputs, expect }` with inputs run-length encoded as `[bits, count]` pairs
(`src/core/sim/replay.ts` decodes them for both the harness and the browser hook). Fixtures are recorded by
scripted routes (`bots.ts`) that read the live world; only the inputs are saved, and `expect` pins status,
tick count, lives, hp and final x. `npm run replay:record` re-records all of them; commit the diff with the
tuning or level change that caused it.

Routes are written in the step language of `route.ts`: a list of steps, each producing input every tick
until its `done` condition holds, then handing over to the next (`run(dir, untilX)`, `jump(dir)`,
`dashJump(dir)` dashes at the apex, `dropThrough()`, `waitMover(index, {x?, y?})`, `ride(dir, untilX)`,
`waitUntil(pred)`, `fire()`, and the combat steps). `fight(untilX)` stands still, taps fire every 12 ticks
while a visible enemy between here and `untilX` is in the plasma line, jumps enemy shots 0.16 s before they
arrive (late enough that a three-shot burst passes under one jump) and finishes when nothing is left ahead
and no enemy shot is in flight. `bossFight()` adds: jump a rush 0.2 s before contact, back off while the
boss winds up within 150 px, hold fire for a nova while it is stunned, stop when it dies. Steps keep state,
so `ROUTES[id]` is a factory and `clearRoute(id)` builds a fresh policy per recording.
`npm run replay:trace -- <level-id>` prints where each step finished, every hurt and death, and the
outcome, for authoring. Fixtures: `level-1-clear` 5567 ticks (through the boss kill), `level-3-clear` 2642,
`level-6-clear` 3954, all without damage. `world.replay.test.ts` runs the same four checks (route completes
undamaged, fixture replays to its pinned outcome, determinism snapshot for snapshot, RLE round trip) for
each manifest level; its World-rules block uses Level 1 without enemies.

Physics facts the routes and levels are built on (tuning as of Phase 5): a full jump rises 81 px and covers
120 px of run; the body must be at least 64 px above the floor for 0.27 s, which spans 55 px, so a 32 px
high obstacle is hopped and a 64 px one is landed on; a 96 px gap is jumpable at the same height, 128 px
needs a dash at the apex (about 185 px of reach), and a +64 rise is reachable only with no gap (a 64 px gap
with a +64 rise falls a few pixels short).

## 9. Validation and budgets `[implemented: Phase 0]`

`npm run build` = typecheck, `assets`, `validate`, `vite build`, `budget`.

`npm run validate` (`tools/validate/index.ts`) walks `public/` and fails on any path
`forbiddenServedPathReason` (`tools/config.ts`) rejects: raw-art name patterns (`concept-art`,
`-sprites.png`, `art-source`, `.psd`) and any raster image outside `assets/atlases/`, `assets/backdrops/`, or `assets/ui/`. It also
parses `src/content/manifest.json` and runs the asset checks in section 7.4. `npm run budget` (`tools/validate/budget.ts`) applies the same path rule
to `dist/` and fails on any breach of `BUDGET`:

| Budget | Ceiling |
|---|---|
| Total served (excluding source maps) | 12 MB |
| JS + CSS | 900 KB |
| Single image | 1.5 MB |
| Single audio | 6 MB |

## 10. Testing `[implemented: Phase 0-7]`

| Layer | Tool | Location | Runs against |
|---|---|---|---|
| Unit | Vitest project `unit` | `tests/unit/**`, `tools/**/*.test.ts` | `core`, `game`, `tools` (segmenter stages run on synthetic sheets from `tools/recut/__tests__/fixtures.ts`; `tests/unit/game/enemies.test.ts` drives each enemy FSM, the boss phases, the pool, the charge shot and the respawn reset in a synthetic arena level) |
| Replay | Vitest project `replay` | `tests/replay/**` | headless `World` on real level JSON |
| E2E | Playwright | `tests/e2e/**` | `vite preview` of `dist/` with SwiftShader WebGL |

E2E specs: `smoke.spec.ts` (boot to the title with the sim frozen, Enter starts it, pixels drawn, keyboard
drives the sim through `?level=`), `editor.spec.ts` (section 11), `shell.spec.ts` (title menu and locked
level select, credits, intro card, pause freezing the tick count and resuming, quit; music element playing
after the first key and M saving the mute; the full loop title to credits by replaying all three fixtures
in sequence, then a reload showing every level unlocked with best times), and `level.spec.ts` (loading
`?level=level-1` directly): a check that
the art requests (atlases, backdrops) all succeed, a frame-time budget (at least 20 fps and 110 ticks/s over
3 s of running, at most 6 dropped frames, under software GL; the measured value is logged), screenshots
written to `e2e-screenshots/` (gitignored; CI uploads them on every run) with the debug overlay and HUD
asserted, and a scripted traversal that feeds `level-1-clear.json` through `window.__batoman.replay`,
checks six enemies and the dormant boss are live sprites from the first frame, screenshots the first
fight, one-way, mover and first dash-gap sections, checks the first patroller is gone, waits for the boss
to engage (HUD bar), reach phase 3 and die (bar gone), and requires the browser build to finish on the same
tick, hp and x as the headless replay (`hooks.enemies`, `hooks.boss`, `hooks.entities` publish the
snapshot's enemy list, boss bar state and sprite count), then the results card and Enter moving on to
Level 3; the same load-and-replay check runs for `level-3` and `level-6` through
`?level=`, plus a check that an unknown id is a boot error. Screenshots are artefacts for eyes, not pixel-compared baselines: software GL
output is not stable enough across machines to gate on. Playwright runs one worker: two SwiftShader pages
halve each other's frame rate.

Measured under SwiftShader at 1280x720: grey-box 60 fps; art with the post stack 37-41 fps; `?post=0` about
38 fps (the two full-screen backdrop layers are the fill cost, not the post stack); `?dof=1` 11 fps.

CI (`.github/workflows/ci.yml`): lint, unit, replay, build (typecheck + assets + validate + budget), then e2e on the
uploaded `dist/` artefact. E2E does not rebuild; run `npm run build` before `npm run test:e2e` locally.

## 11. Level editor `[implemented: Phase 5]`

`?edit=1` opens the current level in the editor (`src/editor/`, loaded as a separate chunk). The sim is
frozen; every edit rebuilds the level view and world through `App.loadLevel`, so what is drawn is what the
sim will collide with. `P` playtests from the spawn with the game's own keyboard and camera; `P` again
returns to the editor camera.

`doc.ts` is the pure model, unit-tested without DOM or Three.js. Objects are addressed by `Ref`
(`{ kind, index }`, kinds `solid | oneWay | mover | hazard | deathZone | checkpoint | enemy | decor | spawn |
exit`; spawn and exit are singletons). A `KIND` table maps each kind to the `LevelJson` array holding it
and its shape (`rect`, `point`, or `decor`), so storage, hit-testing and deletion are generic and only the
shapes branch. `bounds()` gives every kind a rectangle (point kinds get a 24x48
standing body at the feet; decor its rendered size placed by the frame's pivot fraction, mirrored when
flipped), `setBounds()`/`move()` write it back (a mover's path shifts with it; resizing decor pins `w` and
drops `h` so the aspect holds), `add()` creates with defaults (a mover shuttles 128 px right at 60 px/s
with a 30-tick pause, a checkpoint takes the next id, an enemy is a patroller with 120 px patrol),
`remove()`, `duplicate()` (one tile right; a checkpoint copy takes a fresh id), `fieldsFor(kind)` lists the
editable fields per kind with enumerations taken from the content schema (`HAZARD_KINDS`, `ENEMY_TYPES`,
`DECOR_LAYERS`) and `setField()` writes one (`undefined` deletes an optional field; a mover's typed `x`/`y`
shift its path like a drag), `refsAt()` hit-tests smallest first,
`snapRect()` keeps at least one grid cell, `dressSpan(ref, prop)` covers a solid or one-way with copies of a
prop (scaled to its height for thick colliders; natural aspect hung from the top edge for thin ones).
`EditorDoc` holds the level, the selection and an undo/redo stack of whole levels (they are a few KB):
`commit(next)` records a step, `preview(level)` shows a transient state without touching history, and
`commitFrom(base, next)` records a whole drag as one step whatever previews happened in between. Every
operation returns a new level; the same functions dressed Level 1 from a script.

`editor.ts` is the controller: pointer tools (select/move/resize with eight handles, drag-to-create for the
armed kind, click-to-place for spawn/enemy/decor; shift-click cycles overlapping objects), pan with the
right or middle button or Alt-drag, wheel zoom about the cursor (lens distance 6..160), arrow keys nudge the
selection by the grid (Shift: 1 px) or pan when nothing is selected. Keys: `V`/`Esc` select, `1`-`9`,`0`
arm a kind in palette order, `G` cycles the grid (32/16/8/1), `Delete`/`Backspace`,
`Ctrl+Z`/`Ctrl+Shift+Z`/`Ctrl+Y`, `Ctrl+D`, `B` dress the selected span with the current prop, `F` flip
decor, `L` cycle the decor layer, `Home` fit the level, `Ctrl+S` save; keys are ignored while a drag is in
progress. Every shown state is validated first: the world is rebuilt through `App.loadLevel` only when
`levelProblems` is empty, so the sim never sees an invalid level while the overlay and problem list keep
showing it for fixing. The document is dirty when its level is not the object last saved or opened, so
undoing back to the saved state clears it. `overlay.ts` draws outlines per kind (`KIND_COLORS`), mover paths, the level bounds,
the grid, the selection with handles kept 8 CSS px wide, and the drag ghost, all above the front decor with
depth testing off. `panel.ts` is the DOM: kind and action buttons, grid and level fields on the left with
the prop palette (thumbnails cut from the atlas WebP by CSS background offsets), the selection's fields and
the live `levelProblems` + prop reference list on the right.

Saving: `Ctrl+S` runs the validators; with problems nothing is sent. Otherwise the level is formatted
(`formatLevel`) and `PUT /__editor/levels/<id>` goes to the dev server. `tools/dev/editor-plugin.ts`
(registered in `vite.config.ts`, serve only) loads `tools/dev/editor-save.ts` through Vite's SSR loader so
it shares `src/content` with the app, and `saveLevel()` checks the id is in the manifest (404 otherwise: add
it by hand first), the body parses, `levelProblems` and the on-disk art references
(`tools/validate/level-refs.ts`, shared with `npm run validate`) pass, then writes
`src/content/levels/<id>.json`. The plugin remembers the text it wrote per file and, in `hotUpdate`, swallows
change events whose content matches (a save, including a double-fired watcher) so the page does not reload
over the editor's state; a later hand edit differs and reloads as usual. Without a dev server (production
build, `GET /__editor/ping` fails) the editor downloads `<id>.json` instead. `saveLevel` is unit-tested with
an injected filesystem, and `editor-plugin.test.ts` runs the endpoint on a real dev server (ping, 404, 422,
a no-op re-save of Level 3, and the hot-update rule).

Not in this phase: adding an `art` block or changing `art.props`/backdrops from the editor (requires an
asset reload), multi-selection, and editing enemies beyond spawn data. `hooks.editor` publishes `tool`,
`selection` (`kind#index`), `objects`, `revision`, `dirty`, `lastSave` and `playing` for `editor.spec.ts`,
which drags out a solid, selects it, undoes, playtests with `P`, and opens an art-less level.
