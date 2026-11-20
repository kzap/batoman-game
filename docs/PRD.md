# BatoMan — Product Requirements Document

**Version:** 0.2 draft (full-game plan, pending Andre's approval)
**Setting:** Neo-Maynila, 2147
**Genre:** 2.5D action side-scrolling platformer

Narrative is in [STORY.md](STORY.md). The district-by-district vision — inspiration, beats, music, palette, and the open questions — is in [VISION.md](VISION.md). Look and color stay in [ART.md](ART.md). What the remake actually runs is in [TDD.md](TDD.md).

**Canon** means it is already written there or already in the v2 build. **Proposal** means this plan invented it to close a gap. Proposals are not approved.

---

## Vision

A Mega Man-style action platformer set in a cyberpunk Manila. Play as BatoMan — a
Tondo street kid with a plasma-buster prosthetic arm — fighting through NSA-controlled
districts to dismantle Project ASWANG and confront Dr. Epal.

The ten districts are one walk, from the docks back to the same three blocks. v0.2 finishes the four districts already in the game. The other six start only after Andre approves the vision.

---

## Core Loop

1. **Enter a district** — one level, themed, read left to right except the tower, which climbs
2. **Fight** — two or three enemy reads, reused and retuned from earlier districts
3. **Cross the district's one new obstacle** — taught in a quiet room, then armed
4. **Take the unlock, if the district has one** — after the lesson, not instead of it
5. **Face the exam** — the district's ASWANG unit, or, on the tower, the roof itself
6. **The next district opens** — story order 1 through 10; the build today is 1, 3, 4, 6

---

## Player

### Shipped movement

| Action | Input | Notes |
|--------|-------|-------|
| Move | Arrow keys or A/D | Accel and decel; shipped |
| Jump | Up / W / Space | Variable height. A full jump clears about 81 px (2.5 tiles). A 96 px gap is jumpable; a 128 px gap needs a dash at the apex |
| Coyote jump | — | 12 ticks at 120 Hz, the PRD's old 100 ms |
| Wall kick | Toward a wall, in the air | Slide, then kick off. Lockout so the kick cannot be steered away instantly |
| Dash | Shift / X / K | I-frames, gravity off, one per airtime, refilled on landing |
| Crouch / slide | Down | Halves the hitbox. At speed, a slide. Down + jump drops through a one-way |

The v0.1 line "Salakot dash = Down + move, brim deflects shots" is the fantasy. The shipped dash is the row above. Down is the crouch.

### Shipped combat

| Action | Input | Notes |
|--------|-------|-------|
| Plasma burst | Z or J, tap | 1 damage, short range, cooldown |
| Nova | Z or J, hold 0.8 s, release | 3 damage. **Shipped as a piercing bolt**, not the wide explosion the story describes. The TDD calls that a deliberate simplification |

### Stats

- **HP:** 3 hearts. The proposed ladder adds two permanent hearts across the whole game, cap 5
- **Lives:** 3. Death returns him to the last checkpoint; no lives returns him to the level start with 3

### Proposed growth

Assigned in [the ladder](#powerups). No boss drops a new weapon. Plasma and nova stay the guns.

---

## What is in the build today

| # | Level | State | Running enemies | Boss |
|---|---|---|---|---|
| 1 | Tondo Sublevel Docks | Dressed, 6400×768 | Patrollers, drones | ASWANG prototype, playable |
| 3 | Quiapo Underground Chapel | Grey-box, 3584×1024 | Stealth, drone, patroller | None placed. Sigbin Unit is the written boss |
| 4 | NSA Tower Exterior | Dressed, 1600×1664, vertical | Patrollers, drones, stealth | None. Exit opens with no boss alive |
| 6 | Abandoned Rooftop Garden | Grey-box, 4480×896 | Drone, patroller. Tikbalang spawn is data only | Tikbalang-X not created: `spawnEnemy` returns null |

Levels 2, 5, 7, 8, 9, and 10 are not started. Two music tracks exist ("Tondo Sublevel", "Divisoria") and are shared across the four levels as stand-ins.

---

## District requirements

The one-line plan. Prose, folklore, music, and palette are in VISION. Palettes themselves stay the ART.md rows.

| # | District | New mechanic | Enemy roster | Boss, and the skill it tests | Unlock |
|---|---|---|---|---|---|
| 1 | Tondo Sublevel Docks | Shipped kit: dash-gap, one-way, mover, stun window | Dock patrollers, drones | ASWANG prototype (canon, shipped). Jump the rush, punish the stun, then with drones up | Armor Shard, optional (proposal) |
| 2 | Divisoria Grid Market | Nova destroys stall-locks; slide under awnings. Restraint: some stalls are homes | Riot bots (shielded patroller, proposal), turrets (proposal), one drone | Nuno-0 (proposal). Aimed nova, after a level about crowding | Plasma Upgrade, 3-way, permanent (proposal) |
| 3 | Quiapo Underground Chapel | Crusher timing, flood pit, cloaked ambush (grey-box already) | Sigbin scout (stealth), drone, patroller | Sigbin Unit (canon, not built). Lunge from behind, hit the core on the recovery | One temporary Invincibility (proposal) |
| 4 | NSA Tower Exterior | Vertical shafts, lifts, enemies blind across storeys (shipped) | As placed. No sniper retrofit | None (canon). The roof is the exam | None |
| 5 | Skyway Traffic | Vehicle movers, wind on jumps only | Patrollers riding movers (proposal), drones | Wakwak-4 (proposal). The cry lies: quiet means the dive is here. Dash on purpose | Dash trail, permanent, after the fight (proposal) |
| 6 | Abandoned Rooftop Garden | Grey-box: heights, dash gap, lift. Warp is the boss. Crumbling planters are a later pass, not the v0.2 exit | Drone, patroller, the tikbalang slot. No scouts in v0.2 | Tikbalang-X (canon). The Level 1 punish, against a body that counterfeits itself | Double Jump on clear (proposal). Levels 7–10 then assume it |
| 7 | Laboratoryo Zero Entrance | Forcefield switches, then the switch hidden in smoke | Patrollers, stealths, a drone | Kapre-9 (canon, not built). Cross the room blind, then hit a still core | HP Up, permanent (proposal) |
| 8 | The Floodgates | Rising water and pistons on one learnable period. Climb, no swim, unless Andre asks | Syokoy waders (patrollers that stand in the water, proposal), drones | Berberoka-2 (proposal). The punish is the turn between drink and release | One temporary Speed Boost (proposal) |
| 9 | Arcology Atrium | Laser grids. Two bodies; the lower dies first | All three families, tighter ranges | Manananggal-7 (canon, not built). Priority, held for the whole fight | Second HP Up and a fresh Armor Shard (proposal) |
| 10 | Destroyed City Block | No new verb. Short reprises, then the arena | The catalogue, in old combinations | Bakunawa-Prime (canon, not built). Memory. Phase 3 debuts nothing | One temporary Nova Overcharge (proposal) |

A boss only tests a sentence the district already taught. A powerup is never the way the current boss is solved.

### Pacing

| Stretch | Harder | Still kind |
|---|---|---|
| 1 | First telegraphs | Flat, few types, the dash-gap is alone |
| 2 | Density and aiming the nova | Flat, pits are visible |
| 3 | Traps and invisibility | Short, three enemies |
| 4 | The climb, attrition | No boss. Shipped that way on purpose |
| 5 | Moving ground, wind, a flyer | Wind is telegraphed and only affects jumps |
| 6 | Trust: failing floors later, a lying boss now | The punish window is familiar |
| 7 | Smoke, patience | The core holds still |
| 8 | The clock. Highest execution | The period is audible |
| 9 | Priority and numbers | One stable rule: floor half first |
| 10 | Length | Generous checkpoints. The ending is finishable |

### One world

Story order is the order above. The proposed geography, so they connect: bay → Divisoria → under Quiapo → the tower's outside → the skyway looping back to Tondo's roofs → the garden → the shaft into the lab → the floodgates → the dry stair into the atrium → the three blocks at river level. Manifest order stays 1, 3, 4, 6 until the missing districts exist.

---

## Platforming Obstacles

| Obstacle | Behavior | Death? | Status |
|----------|----------|--------|--------|
| Static platform | Fixed surface | No | Shipped |
| One-way platform | Blocks a downward landing; Down+jump drops through | No | Shipped |
| Moving platform | Waypoints at constant speed; carries riders | No | Shipped |
| Spike trap | 1 HP and a knockback | No | Shipped |
| Death pit / river | Fall in, or below the level | Yes | Shipped |
| Crushing piston | Timed crusher | Yes | Shipped as `crusher`. Sequenced clocks are the Floodgates proposal |
| Crumbling platform | Collapses shortly after he lands | No | Proposal. Garden, a later pass, not v0.2 |
| Destroyable block | Breaks to a nova, not to a tap | No | Proposal. Divisoria stall-locks |
| Forcefield | A switch opens it. Nova does not | No | Proposal. The lab |
| Wind | Adds to a jump. Does not push him off a stand | No | Proposal. The skyway |
| Rising water | A line on a period; covering him kills | Yes | Proposal. Climb out. Swim is an open question |
| Laser grid | Timed lines | No (damage) or yes, per the room | Proposal. The atrium |

---

## Enemies

### Shipped behaviours

| Behaviour | What it does now |
|----------|------------------|
| Patrol | Walks a span, turns at walls and ledges, fires straight when he is in front |
| Drone | Hovers, dives to chest height, aimed shots. Ignores him when he is on another storey |
| Stealth | Cloaked and unhittable until he is close and on the same storey, then chases and fires |
| ASWANG prototype | The Level 1 boss. See below |

The tikbalang is a fifth type in the content schema, with a packed sheet and a render look, and with no actor.

### Remix rules

New districts reskin and retune the three behaviours before they add a state.

| Fiction | Basis | New? |
|---|---|---|
| Cyborg dockworker | Patroller | No. Level 1 |
| Patrol / flying drone | Drone | No |
| Sigbin scout | Stealth, on the patroller sheet until sigbin art exists | No |
| Riot bot | Patroller with a frontal shield: plasma fails, nova or a back-shot connects | Proposal. Divisoria |
| Security turret | Stationary, harmless while retracted | Proposal. Divisoria. First new behaviour |
| Sniper mech | Named for Level 4 in the old PRD. Not in the shipped tower | Parked. Do not retrofit Level 4 for it |
| Lab guardian | Patroller and stealth, new palette | Proposal. Reskin |
| Syokoy wader | Patroller that can stand in killing water | Proposal. Floodgates |
| Elite | All three, tighter numbers | Proposal. Atrium |
| Finale mixes | Old combinations only | Proposal |

Every enemy keeps a readable silhouette and a magenta weak point on the frame where it can be punished (ART).

### Bosses

Defeat means learning a pattern. One unit per district, except the tower.

| Boss | Level | Exam | Status |
|------|-------|------|--------|
| ASWANG prototype | 1 — Tondo | Telegraph, jump the rush, punish the exposed core, then while drones are up | Shipped. 24 HP, three phases |
| Nuno-0 | 2 — Divisoria | Precision. The nova aimed at the core, not at every stall | Proposal |
| Sigbin Unit | 3 — Quiapo | Back-awareness. Core only on the recovery after a rear lunge | Canon, not built. The "specific sequence" in the old PRD was never defined; VISION proposes the lunge-and-punish and asks Andre |
| — | 4 — Tower | The climb | No boss, shipped |
| Wakwak-4 | 5 — Skyway | A lying audio tell. Spend the dash on the quiet dive | Proposal |
| Tikbalang-X | 6 — Garden | The familiar stun window, on a body that leaves afterimages | Canon. v0.2 builds it on the existing `idle` / `run` / `stomp` / `hurt` / `death` / `projectile` clips |
| Kapre-9 | 7 — Lab | Move through smoke, then hit a still chest core | Canon, not built |
| Berberoka-2 | 8 — Floodgates | The period. The core opens between the drink and the release | Proposal |
| Manananggal-7 | 9 — Atrium | The lower half dies first; the flyer is the cleanup | Canon, not built. Design sheet currently filed under level 1 |
| Bakunawa-Prime | 10 — City block | Memory across three phases. Phase 3 introduces no new tell. The moon-glyph is the core | Canon, not built |

Dr. Epal is the confrontation the win condition names. ART gives him a portrait, not a playable boss. The proposal keeps it that way: he speaks from a gallery, and he has no HP bar. VISION question 7 asks Andre.

---

## Powerups

All placements are proposals. Names and effects are the old list.

### Permanent

| Powerup | Effect | When |
|---------|--------|------|
| Armor Shard | Blocks the next hit, once | Level 1, before the arena; again in Level 9 |
| Plasma Upgrade | Plasma fires a 3-way spread | Clear reward, Level 2 |
| Dash Upgrade | The dash leaves a damaging trail | Clear reward, Level 5 |
| Double Jump | A second jump in the air | Clear reward, Level 6. Levels 1–6 must stay completable without it |
| HP Up | +1 max heart, cap 5 | Level 7, and again in Level 9 |

### Temporary (~10 seconds)

| Powerup | Effect | When |
|---------|--------|------|
| Invincibility | No damage | One pickup in the Quiapo trap run |
| Speed Boost | Move faster | One pickup on the long Floodgates run |
| Nova Overcharge | Nova cooldown removed | The Level 10 antechamber only |
| Double Jump | — | Not used as a temporary. It is the Level 6 permanent, or it is cut |

Sari-sari dressing (a cooler, a cup, a hand from a stall) is the fiction for shards and hearts. No NPC AI.

---

## HUD

| Element | Position | Description |
|---------|----------|-------------|
| Health | Top-left | Heart icons, grey when lost. Shipped |
| Lives | Top-left, with the hearts | Shipped |
| Score | Top-right | 6-digit counter. Shipped. Kills: patroller 100, drone 150, stealth 200, tikbalang 500, prototype 1000 |
| Boss HP bar | Bottom-center | While the boss is engaged. The prototype's bar reads "ASWANG PROTOTYPE" plus the phase |
| Powerup timer | Bottom-left | For temporaries, once any exist. Not shipped |

---

## Win / Lose Conditions

**Win a level that has a boss:** the unit dies, and the exit opens. Shipped for Level 1.
**Win a level with no boss:** reach the exit. Shipped for Level 4, and it stays the rule.
**Win the game:** Bakunawa-Prime falls, and Dr. Epal is confronted. The proposed shape of that confrontation is a portrait in the gallery and the grow-light ending in STORY, not a second fight.
**Lose a life:** HP reaches 0. Respawn at the last checkpoint. Shipped.
**Game over:** no lives left. The level restarts with 3. Shipped.
**Instant death:** pit, river, void, crusher. Shipped. Rising water joins this list only if the Floodgates proposal is approved.

---

## v0.2 scope vs later

### v0.2 — the four districts already in the game

Already done, and in the cut:

- Level 1 dressed, prototype boss beaten under replay
- Level 4 dressed, bossless, beaten under replay
- Levels 3 and 6 grey-boxed, in the level select, beaten under replay
- Menus, HUD, pause, save, music, the three enemy behaviours, the editor

v0.2 still builds:

| Item | Done when |
|---|---|
| Tikbalang-X | The Level 6 spawn fights. Warp and stumble, on the existing sheet. The exit waits for the kill |
| Dress Level 3 | Source art exists and the chapel renders. The concept painting is the mood target. Grey-box geometry stays unless dressing forces a small edit |
| Dress Level 6 | Same. No source art exists yet. Blocked on art |
| Sigbin Unit | Recommended as part of finishing Level 3, because the PRD, ART, and the painting already promise it. Open: Andre can move it out of v0.2. See VISION question 4 |
| Phase 8 | Instancing, culling, compression, far-layer LOD, remappable input, reduce-motion, colourblind-safe weak points, docs matching the code |

v0.2 does not build powerups, Double Jump, crumbling floors, wind, forcefields, rising water, laser grids, swim, a nova explosion, or any district that is not already in the manifest.

### Later — only after this vision is approved

In story order: Divisoria, Skyway, Laboratoryo Zero, the Floodgates, the Arcology, the destroyed block. Each district's new verb ships with that district, not early. Kapre-9, Manananggal-7, and Bakunawa-Prime are this backlog even though their names are old canon. Nuno-0, Wakwak-4, and Berberoka-2 are backlog and still proposals.

Crumbling planters on the garden are a pass after v0.2 has dressed and bossed that level, so the pinned clear is not broken for an unapproved hazard.

---

## Out of scope

Until a later document says otherwise:

- Multiplayer
- Online leaderboards
- Procedural generation
- Boss-weapon copies
- A dialogue system or voice-over
- Animated cutscenes (portrait and text remain the story delivery)
- Swimming
- Retrofitting Level 4 with a boss or with sniper mechs
- Building districts 2, 5, 7, 8, 9, or 10 inside the v0.2 milestones
