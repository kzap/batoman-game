# BatoMan — Art Design Document

**Version:** 0.1
**Setting:** Neo-Maynila, 2147
**Genre:** Action Side-Scrolling Platformer

---

## Visual Identity

BatoMan lives at the intersection of **Filipino street culture** and **cyberpunk dystopia**. Every visual choice should feel simultaneously familiar and futuristic — like Manila you recognize, drenched in neon and smog, with the soul still intact underneath.

**Three words to keep in mind:** *Makulay. Madilim. Matapang.*
(Colorful. Dark. Bold.)

### Core References
| Pillar | Reference |
|--------|-----------|
| World aesthetic | Blade Runner 2049 palette + jeepney maximalism |
| Sprite style | Mega Man X pixel art — tight, readable, expressive |
| Environment density | Contra: Hard Corps background layering |
| Color mood | Neon-soaked rain-slicked streets; warm amber from street food carts vs. cold blue-green NSA infrastructure |
| Typography | Stenciled graffiti glyphs + clean tech readouts |

---

## Art Style

### Pixel Art Spec
- **Resolution:** 320×180 base (16:9), scaled up with nearest-neighbor
- **Tile size:** 16×16 px base tile grid
- **Sprite scale:** Player and standard enemies fit within 32×48 px bounding box
- **Boss scale:** Bosses occupy 96×96 px to 192×192 px depending on unit
- **Palette discipline:** Max 16 colors per sprite sheet (not counting transparency); environments may use up to 32 per layer

### Line and Form
- Hard outlines on all characters and interactive objects (1 px, darkest shade of the sprite's dominant hue)
- Backgrounds use **no hard outlines** — shapes blend through color and value contrast only
- Enemy silhouettes must be instantly readable against any level background

---

## Color Palettes

### Global Mood Palette
Used as anchors across all levels — specific levels deviate within these constraints.

| Role | Hex | Usage |
|------|-----|-------|
| Deep shadow | `#0d0d1a` | Darkest background depths, void pits |
| Smog purple | `#2a1f3d` | Mid-background sky, distant structures |
| Concrete grey | `#4a4a5a` | Building faces, ground surfaces |
| Rust orange | `#b85c2a` | Corroded metal, old district structures |
| Neon cyan | `#00e5ff` | NSA signage, electric hazards, plasma effects |
| Neon magenta | `#ff2d78` | Danger indicators, enemy weak-point fill, blood. A weak point also needs a non-colour channel; the boss core pairs this with a white `#ffffff` diamond outline |
| Warm amber | `#ffaa33` | Street food light, community spaces, checkpoints |
| Bioluminescent teal | `#00ffcc` | Pasig River glow, underground water |
| White-hot plasma | `#fffde0` | Plasma burst core, Nova Blast center |

---

## Character Art

### BatoMan (Ando Batumbakal)

**Silhouette read:** Wide salakot brim, asymmetric arms (left normal, right mechanical), crouching street fighter stance.

| Feature | Design |
|---------|--------|
| Salakot | Wide woven brim, worn brown — key visual anchor; tip glows faintly amber when dashing |
| Plasma arm | Right arm; dull gunmetal with cyan energy vents; forearm splits open to reveal cannon barrel |
| Clothing | Torn sleeveless barong over dark compression shirt; patched cargo shorts; worn rubber sandals with improvised ankle guards |
| Color read | Warm earthy tones (browns, ochres) vs. cold mechanical cyan on the arm — humanizes him against the NSA's all-cold-metal aesthetic |
| Idle animation | Subtle breathing cycle; arm vents pulse faintly; salakot bobs slightly |

#### Animation States
| State | Frames | Notes |
|-------|--------|-------|
| Idle | 4 | Gentle sway, arm vent flicker |
| Walk | 8 | Slight forward lean, salakot stable |
| Run | 6 | Salakot tilts back, footfalls kick dust |
| Jump (rise) | 3 | Arm extends for balance |
| Jump (fall) | 3 | Knees tuck slightly |
| Land | 2 | Crouch impact, salakot dips |
| Shoot | 3 | Arm locks forward, muzzle flash |
| Charge | 6 | Arm glows brighter per frame, veins of light crawl up forearm |
| Nova Blast | 8 | Full arm explosion outward; screen flash frame; smoke settle |
| Dash | 4 | Horizontal blur streak, salakot brim deflects small particles |
| Wall kick | 3 | Foot plant, spring-off |
| Hurt | 3 | Recoil, flicker white |
| Death | 8 | Stumble, collapse, salakot falls last |

---

### Dr. Epal (Boss — cutscenes only in v0.1)

**Silhouette read:** Crisp NSA lab coat over an expensive suit, angular glasses, slightly too-wide smile.

| Feature | Design |
|---------|--------|
| Colors | Clinical white coat over deep navy; gold NSA insignia pin |
| Face | Perfectly groomed silver hair; smile that doesn't reach the eyes |
| Props | Holographic tablet he never puts down; NSA security badge with his own face on it |
| Tells | Adjusts glasses before giving an order; the smile widens when things go wrong for others |

---

## Enemy Art

### Visual Language Rules
1. **NSA machines = cold palette** — blues, teals, greys, sharp angles
2. **Organic/myth-inspired enemies = warmer but corrupted** — rust, bile-green, cracked bone tones
3. All enemies have a **glowing weak point** visible during vulnerable frames. Colour is neon magenta `#ff2d78`. A second channel is required so the window is not colour-only: the shipped boss core is a **diamond** with a **white `#ffffff` outline** around the magenta fill. The outline is what stays readable in protanopia, deuteranopia, and tritanopia (magenta shifts toward blue or brown and can merge with a lilac body; the white diamond does not). Do not communicate a weak point with hue alone
4. Enemy eyes/sensors are always the brightest element on their sprite

### Standard Enemy Types

| Enemy | Design | Color Key |
|-------|--------|-----------|
| Patrol Drone | Squat hovering unit, two rotors, single camera eye, NSA decal on chassis | Grey body, cyan rotor glow, red threat-mode eye |
| Cyborg Dockworker | Stocky human silhouette, one arm replaced with a crushing claw, cracked visor | Rust orange suit, gunmetal arm, dead-white eye behind visor |
| Riot Bot | Riot shield fused to left arm, baton in right, squat legs, wide stance | Dark blue-grey, yellow caution stripes, red lens |
| Security Turret | Wall-mounted box, barrel extends on detect, swivels 90°; retracted = harmless | Flat grey, extends with cyan targeting laser |
| Stealth Sigbin | Hunched four-legged shape, too many joints, nearly invisible until close; shimmer effect | Near-black with oily iridescent sheen; glows magenta on attack |
| Tikbalang Scout | Bipedal, horse-skull head, digitigrade legs, moves in erratic bursts | Bone-white skull, dark carbon-fiber body, magenta mane of wires |
| Flying Drone | Compact diamond chassis, two guns below, LED strip along edge | Black and red, cyan thrust exhaust |
| Sniper Mech | Tall, thin, tripod-legged, long barrel arm; kneels to fire | Olive drab, red laser dot |

---

## Boss Art

### ASWANG Unit Design Principles
- Each boss is **large enough to feel threatening** — at least half the screen height
- **Three visible phases:** idle/patrol stance, attack stance, stagger/vulnerable state
- Every boss uses the **same colour-blind-safe weak point** (PR #39): a magenta `#ff2d78` diamond fill with a white `#ffffff` diamond outline, drawn as a renderer overlay on the exposed core rect, only during the vulnerability window. The outline does not pulse. With reduce-motion on, the fill holds steady instead of breathing. Do not paint a unique core colour or gem on the sprite — leave the opening (hatch, visor, conduit) clear for the overlay
- Boss designs should feel like NSA engineers studied the mythology and built the worst possible version of it

---

### Sigbin Unit (Level 3 — Quiapo Underground Chapel)
**Mythological basis:** Sigbin — backward-walking shadow creature that sucks blood through shadow. Dr. Epal's Project ASWANG unit: a cyber-mechanical hunter.

The shipped sheet is `art-source/characters/sigbin-sprites.png` (atlas `sigbin`), painted in Level 1's inked painterly look, readable against the dark flooded chapel nave. Frames face right. Clips: idle, backward walk (`move`; also sped up for the lunge), snarl (`shoot`, unused in the fight), telegraph/windup and recover (`hurt`), death. The body is 192×188 (half the 378 px camera, within a pixel). Packed at scale 0.5 from 2× cells; drawn at look-scale 2 so it matches the sim body (`SIM_PX_PER_ATLAS_PX` is 0.5).

| Aspect | Design |
|--------|--------|
| Form | Quadruped, backward-jointed mechanical legs; the head hangs low on the facing side, pointing opposite the walk, with a single violet sensor eye |
| Size | 192×188 px (Andre: about half the 378 px camera height). The old 64×48 cell is retired |
| Materials | Matte black rubber composite over titanium armature, oily iridescent violet-teal sheen, gunmetal hydraulics, closed dorsal spines |
| Signature effect | Cloak shimmer (alpha 0.08–0.28). The player tracks it by painted backward footprints (`footprint_back` in the Level 3 props atlas, toes pointing the wrong way) and by a reversed tambol / hand-drum telegraph cue (`sigbin-telegraph`, key `sigbinTelegraph`) |
| Vulnerable state | Camo drops, the dorsal hatch opens onto a dark empty cavity (no painted diamond or gem). The shared magenta diamond with a white outline is drawn on the dropping core rect (`BossSnapshot.exposed` / `weakPoint`) |
| Environment blend | Designed to hide in the candlelit chapel shadows; warm candlelight and cool metal rim light keep the silhouette readable when it decloaks |

---

### Tikbalang-X (Level 6 — Abandoned Rooftop Garden)
**Mythological basis:** Tikbalang — horse-headed giant trickster that makes travelers lose their way

| Aspect | Design |
|--------|--------|
| Form | Tall bipedal, disproportionately long legs, horse skull with exposed titanium teeth, mane of frayed fiber optic cables |
| Size | 80×96 px |
| Materials | Carbon fiber bones visible through torn synthetic muscle; neon wire mane flickers |
| Signature effect | Afterimage decoys — leaves ghost images when it warps; player must hit the solid one |
| Vulnerable state | Stumbles on landing, mane goes dark, skull visor cracks open |
| Environment blend | Moves across overgrown rooftop; vines and rain partially obscure it |

---

### Kapre-9 (Level 7 — Laboratoryo Zero Entrance)
**Mythological basis:** Kapre — massive cigar-smoking tree spirit that sits in large trees

| Aspect | Design |
|--------|--------|
| Form | Enormous hunched giant, thick torso, stubby powerful arms; exhaust stacks on shoulders emit smoke clouds |
| Size | 144×160 px |
| Materials | Reinforced tank plating, weathered and scorched; looks like it was built to last centuries |
| Signature effect | Smoke cloud deployment — fills 30% of screen with semi-opaque smog; player must navigate blind |
| Vulnerable state | Smoke clears, chest plate blows open. The shared weak-point diamond (see design principles) is drawn on the exposed reactor |
| Environment blend | Nearly fills the corridor width; debris falls when it moves |

---

### Manananggal-7 (Level 9 — Arcology Atrium)
**Mythological basis:** Manananggal — winged vampire that separates its upper body to fly

| Aspect | Design |
|--------|--------|
| Form | Phase 1 — full humanoid, elegant and almost beautiful; Phase 2 — upper torso tears free and flies, trailing severed cable/viscera; lower half remains standing and attacks separately |
| Size | 64×128 px (full); 64×72 px (upper); 48×64 px (lower) |
| Materials | Sleek white NSA-grade chassis with gold trim — designed to look authoritative, not monstrous, until it splits |
| Signature effect | Split event — dramatic screen flash, upper half levitates; lower half sprouts blade legs |
| Vulnerable state | Lower half: expose the power conduit between the split. Upper half: cracked chest panel. The shared weak-point diamond is drawn on the exposed conduit |
| Environment blend | Atrium setting — flies between elegant columns; light plays off white chassis |

---

### Bakunawa-Prime (Level 10 — Destroyed City Block)
**Mythological basis:** Bakunawa — enormous sea serpent that swallows the moon

| Aspect | Design |
|--------|--------|
| Form | Colossal serpent emerging from flooded ruins; only head and neck visible in Phase 1; full body visible in Phase 3 |
| Size | Head: 192×128 px; visible body segments: tiled 96×96 px |
| Materials | Submarine-grade hull plating in deep ocean black; bioluminescent blue markings (echoing the Pasig River); jaws hydraulic, can shear through concrete |
| Phases | Phase 1: head attacks from water below; Phase 2: coils around platforms, constricts arena; Phase 3: full emergence, screen-filling, multi-hit core pattern |
| Vulnerable state | Moon-glyph embossed on the forehead; the shared weak-point diamond is drawn there when the hit window opens (thematic: the moon it tried to swallow) |
| Environment blend | Rises from flooded street; electric-blue Pasig water illuminates it from below |

---

## Level Environment Art

### Layered Parallax System
Each level uses 4 background layers at different scroll speeds:

| Layer | Scroll Rate | Content |
|-------|-------------|---------|
| Sky/far bg | 0.1× | Distant arcology towers, smoggy sky, moon |
| Mid structures | 0.3× | Building faces, signage, distant activity |
| Near structures | 0.6× | Close building walls, vegetation, pipes |
| Foreground dressing | 1.0× | Same speed as player — barrels, crates, cables |

---

### Level-by-Level Palette & Mood

#### Level 1 — Tondo Sublevel Docks
| Element | Detail |
|---------|--------|
| Sky | Pre-dawn amber haze; smog diffuses any light |
| Water | Electric-blue Pasig bioluminescence below docks; reflections distorted by boat wake |
| Structures | Salt-corroded concrete pylons, wooden fishing platforms patched with metal sheeting |
| Lighting sources | Hanging incandescent bulbs, boat lanterns, NSA patrol drone spotlights |
| Dominant colors | Rust brown, warm amber, electric blue accents |
| Ambient detail | Hanging fish, old bilao baskets, corroded chain-link, graffiti tags of old Manila barangays |

#### Level 2 — Divisoria Grid Market
| Element | Detail |
|---------|--------|
| Sky | Perpetual artificial noon — stadium lights above the covered market |
| Structures | Market stalls stacked three levels high; fabric awnings in every color; neon pricing displays |
| Lighting sources | Hundreds of competing vendor signs, overhead halogens, holographic ads |
| Dominant colors | Every color, deliberately overwhelming — then punctuated by NSA cold-blue of security infrastructure |
| Ambient detail | Hanging sampaguita garlands, synthetic meat on hooks, broken credit scanners, crowd shadows |

#### Level 3 — Quiapo Underground Chapel
| Element | Detail |
|---------|--------|
| Sky | No sky — cave ceiling, crumbling vaulted arches |
| Structures | Baroque colonial church bones filled with slum additions; candles everywhere; flooded lower sections |
| Lighting sources | Candles, bioluminescent fungi, faint light through cracked ceiling |
| Dominant colors | Deep indigo, warm candlelight gold, teal water glow |
| Ambient detail | Old santo niño figures with cracked faces, prayer candles half-submerged, religious iconography mixed with circuit boards |

#### Level 4 — NSA Tower Exterior
| Element | Detail |
|---------|--------|
| Sky | Night; searchlights sweep across the level from above |
| Structures | Glass-and-steel tower face; clean, inhuman geometry |
| Lighting sources | Searchlights, status LEDs, window-light from inside the tower |
| Dominant colors | Cold grey-blue, hard white light, stark black shadow |
| Ambient detail | NSA logo on every surface, security cameras, air conditioning units, window-washing drone rigs |

#### Level 5 — Skyway Traffic
| Element | Detail |
|---------|--------|
| Sky | Dusk-lit smoggy orange; city sprawl visible below |
| Structures | Multi-lane elevated highway; moving vehicles as moving platforms |
| Lighting sources | Vehicle headlights, lane markers, traffic management drones |
| Dominant colors | Amber and red (taillights), concrete grey, vehicle color variety |
| Ambient detail | Stalled jeepneys as platforms, wind-blown litter, cracked guardrails, lane marker lights |

#### Level 6 — Abandoned Rooftop Garden
| Element | Detail |
|---------|--------|
| Sky | Bright day, soft clouds, hazy Neo-Maynila skyline. An earlier night-rain direction was dropped for the approved brightness rule: paint this level sunny, in the Level 1 inked-painterly style |
| Structures | Lush rooftop farm: greenhouses, water tanks, shacks, planter beds, bunting. The mid layer is one 2560-wide row followed by its mirror so the repeat has no seam |
| Lighting sources | Open daylight. The paintings carry their own light, the same rule as Level 1 |
| Dominant colors | Sunlit green, warm cream and yellow walls, sky blue, terracotta and teal |
| Ambient detail | Sunflowers, salakot, laundry, flags. A wrong-way scarecrow and a horseshoe on the spawn roof are the way-finding hints |

#### Level 7 — Laboratoryo Zero Entrance
| Element | Detail |
|---------|--------|
| Sky | No sky — industrial underground |
| Structures | Massive chemical tanks, catwalks, heavy blast doors, cable runs |
| Lighting sources | Harsh fluorescent overheads, red emergency lighting, indicator LEDs |
| Dominant colors | Industrial grey-green, red warning, chemical yellow caution stripes |
| Ambient detail | Hazmat barrels, specimen tanks with things inside, NSA project files scattered, broken lab equipment |

#### Level 8 — The Floodgates
| Element | Detail |
|---------|--------|
| Sky | No sky — sealed tunnel infrastructure |
| Structures | Massive water management architecture; enormous pistons and gates; catwalks over churning water |
| Lighting sources | Underwater lighting, pressure indicator panels, turbine glow |
| Dominant colors | Deep blue-black water, orange caution, metallic silver machinery |
| Ambient detail | Water spray, rising tide line markers, warning klaxon lights, pressure gauges at critical levels |

#### Level 9 — Arcology Atrium
| Element | Detail |
|---------|--------|
| Sky | Interior atrium — visible sky dome far above, but layers of elite living spaces between |
| Structures | Pristine white marble, living walls of real plants, luxury retail now turned fortified positions |
| Lighting sources | Warm designer lighting, laser grid security systems, emergency red |
| Dominant colors | White, gold, deep green (plants), red (NSA security state) |
| Ambient detail | Abandoned luxury goods, overturned high-end displays, defensive barricades made of expensive furniture |

#### Level 10 — Destroyed City Block
| Element | Detail |
|---------|--------|
| Sky | Exposed pre-dawn sky; dust and smoke in the air; the Pasig River visible at low street level |
| Structures | Complete urban destruction; building cross-sections exposed; infrastructure hanging loose |
| Lighting sources | Fires, NSA emergency floodlights, Bakunawa's own bioluminescent markings |
| Dominant colors | Ash grey, fire orange, electric Pasig blue-green, blood magenta |
| Ambient detail | Remnants of all previous levels visible in rubble — market stalls, church stone, dock planks; everything Ando fought through |

---

## UI & HUD Art

### Philosophy
The HUD should feel like it's **Ando's own cobbled-together tech**, not NSA-clean. Slightly imperfect, warm-tinted, readable.

| Element | Style |
|---------|-------|
| Health hearts | Pixel hearts in warm amber; grey silhouette when lost; slight wobble animation when gained |
| Score counter | Monospaced pixel font, zero-padded to 6 digits; amber on dark panel with subtle scanline |
| Boss HP bar | Appears sliding in from bottom-center; red-orange fill, drain animation on hit; bar frame has mechanical bolt texture |
| Powerup timer | Horizontal bar, bottom-left; color matches the powerup (cyan for speed, white for invincibility etc.); ticks urgently when < 3s remain |
| Checkpoint flash | Screen-edge vignette pulse in amber when checkpoint activated |

### Font
- **HUD numbers/text:** Custom pixel font — chunky, all-caps, slight Filipino lettering influence in the curves
- **Menus/titles:** Stencil-style heavy caps with slight spray-paint bleed on edges

### Menu Art
- Title screen: BatoMan in silhouette against a lit-up Neo-Maynila skyline at night; salakot brim catches light; plasma arm charges as the logo pulses
- Level select: Thumbnail vignettes per level — small diorama of the district, slightly desaturated until unlocked
- Game over screen: Ando's salakot on the ground, lit by a single street lamp

---

## VFX & Animation Guidelines

### Plasma Effects
| Effect | Description |
|--------|-------------|
| Plasma burst projectile | Small bright cyan-white oval; trailing heat distortion; slight wobble on travel |
| Plasma burst impact | 4-frame starburst; white core, cyan outer ring, grey smoke dissipate |
| Nova Blast charge | Arm vents glow progressively brighter; particle drift toward the arm; screen slight color shift toward cyan at full charge |
| Nova Blast release | White flash frame; expanding plasma ring with particle debris; shockwave distortion ripple; smoke settle |

### Environment VFX
| Effect | Description |
|--------|-------------|
| Rain (levels 5, 6) | Angled streaks; splash sprites on ground impact; puddle ripple loops |
| Water (levels 3, 8) | Animated teal surface with bioluminescent glow cycle; bubble particles rising |
| Fire/explosion | Orange-red-white 8-frame loop; black smoke rising; embers drift up |
| Dust/debris | Platform crumble particles; grey dust puffs on land impact |
| NSA forcefield | Hexagonal grid shimmer; ripple distortion on contact |

### Hit and Damage VFX
| Effect | Description |
|--------|-------------|
| Enemy hit | White flash on sprite; small impact star; health chunk removed |
| Boss vulnerable | Magenta diamond core with a steady white diamond outline; the fill pulses unless reduce-motion is on. Hit sparks stay magenta |
| Player hurt | Red screen-edge vignette flash; Ando sprite flickers white; brief invincibility frames |
| Death | Screen desaturates; Ando collapse animation; vignette closes |

---

## Audio-Visual Pairing Notes
*(For coordination with audio design — not in-scope for art to deliver, but informs timing)*

- Nova Blast screen flash should sync to audio boom peak
- Boss phase transitions paired with a brief screen freeze (2 frames) + color shift
- Checkpoint activation: amber pulse + distinct chime
- Level complete: background dims, spotlight on Ando, score tally
- Each ASWANG boss intro: full-screen title card with unit designation + mythological name, pixel art portrait, brief screen shake

---

## Out of Scope (v0.1)
- Animated cutscene art (story beats use static portrait + text)
- Dr. Epal playable sprite (cutscene portrait only)
- Full controller UI iconography
- Localization font variants
