# BatoMan — Product Requirements Document

**Version:** 0.1
**Setting:** Neo-Maynila, 2147
**Genre:** Action Side-Scrolling Platformer

---

## Vision

A Mega Man-style action platformer set in a cyberpunk Manila. Play as BatoMan — a
Tondo street kid with a plasma-buster prosthetic arm — fighting through NSA-controlled
districts to dismantle Project ASWANG and confront Dr. Epal.

---

## Core Loop

1. **Enter level** — scrolls left to right through a themed district
2. **Fight enemies** — themed to each district, patrol and attack the player
3. **Navigate obstacles** — platforms, hazards, and environmental traps
4. **Collect powerups** — scattered along the route
5. **Defeat boss** — ASWANG mechanical unit at the end of each level
6. **Unlock next level** — advance to the next district

---

## Player

### Movement
| Action | Input | Notes |
|--------|-------|-------|
| Move left/right | Arrow keys or A/D | Smooth deceleration |
| Jump | Up / W / Space | Variable height (release early = shorter jump) |
| Coyote jump | — | 100ms grace window after walking off edge |
| Wall kick | — | Kick off vertical surfaces to reach higher areas |
| Salakot dash | Down + move | Low-profile slide under obstacles |

### Combat
| Action | Input | Notes |
|--------|-------|-------|
| Plasma burst | Z (tap) | Rapid-fire short-range shot, 1 damage |
| Nova blast | Z (hold 0.8s) | Charged AoE explosion, 3 damage |

### Stats
- **HP:** 3 hearts (upgradeable via powerups)
- **Lives:** 3 (return to level start on death)

---

## Levels

Each level is one district of Neo-Maynila. Enemies and environmental hazards are
themed to match the visual setting.

| # | Level Name | Setting | Theme |
|---|-----------|---------|-------|
| 1 | Tondo Sublevel Docks | Waterfront slum, fishing boats, smog | Patrol drones, dock workers turned cyborg |
| 2 | Divisoria Grid Market | Dense market stalls, neon signs, crowds | Riot bots, automated security turrets |
| 3 | Quiapo Underground Chapel | Dark tunnels, candles, flooded passages | Stealth sigbin units, trap mechanisms |
| 4 | NSA Tower Exterior | Vertical climb, glass walls, searchlights | Flying drones, sniper mechs |
| 5 | Skyway Traffic | Moving vehicles, wind gusts, collapsing lanes | Vehicle-mounted gunners, debris hazards |
| 6 | Abandoned Rooftop Garden | Overgrown, unstable floors, rain | Tikbalang scouts, environmental hazards |
| 7 | Laboratoryo Zero Entrance | Industrial lab, chemical tanks, forcefields | Lab guardian mechs, electric hazards |
| 8 | The Floodgates | Water pressure, rising tides, machinery | Amphibious units, crushing pistons |
| 9 | Arcology Atrium | Elite tower interior, luxury turned fortress | Elite NSA soldiers, laser grids |
| 10 | Destroyed City Block | Rubble, exposed pipes, final confrontation | All enemy types, crumbling terrain |

---

## Platforming Obstacles

| Obstacle | Behavior | Death? |
|----------|----------|--------|
| Static platform | Fixed surface to jump on | No |
| Moving platform | Slides horizontally or vertically | No |
| Crumbling platform | Collapses 1s after player lands | No |
| Spike trap | Instant damage on contact | No (1 HP damage) |
| Death pit / river | Fall into Pasig River or open void | Yes — instant death |
| Destroyable block | Break with Nova Blast; may hide items | No |
| Forcefield | Blocks passage; needs switch to deactivate | No |
| Crushing piston | Timed hazard; squishes player | Yes — instant death |
| Rising water | Slowly floods area; swim or drown | Yes — drowning death |

---

## Enemies

### Standard Enemies (per level)
Each level has 2–3 enemy types themed to its district. Base behaviors:

| Behavior | Description |
|----------|-------------|
| Patrol | Walk back and forth on a platform |
| Chase | Runs toward player when in range |
| Ranged | Shoots projectiles at a fixed interval |
| Flying | Airborne patrol; dives at player |
| Stealth | Invisible until close; ambush attack |

### Boss: ASWANG Units
One mechanical boss per level. Defeat requires learning its attack pattern.

| Boss | Level | Mechanic |
|------|-------|----------|
| Sigbin Unit | 3 — Quiapo | Stealth attacks from behind; must be hit in specific sequence |
| Tikbalang-X | 6 — Rooftop | Fast quadruped, warps position; hit during stumble window |
| Kapre-9 | 7 — Laboratoryo | Massive tank, summons smoke clouds; hit exposed core |
| Manananggal-7 | 9 — Arcology | Upper body detaches and flies; destroy lower half first |
| Bakunawa-Prime | 10 — City Block | Final boss; emerges from flooded ruins; multi-phase fight |

---

## Powerups

### Permanent (collected once, persist through level)
| Powerup | Effect |
|---------|--------|
| HP Up | +1 max heart |
| Plasma Upgrade | Plasma burst fires 3-way spread |
| Dash Upgrade | Salakot dash leaves damaging trail |
| Armor Shard | Blocks next hit (one-time shield) |

### Temporary (timed, ~10 seconds)
| Powerup | Effect |
|---------|--------|
| Speed Boost | Movement speed +50% |
| Invincibility | Flash state, no damage taken |
| Nova Overcharge | Nova blast cooldown removed |
| Double Jump | Extra jump while airborne |

---

## HUD

| Element | Position | Description |
|---------|----------|-------------|
| Health | Top-left | Heart icons (♥), grey when lost |
| Score | Top-right | 6-digit zero-padded counter |
| Boss HP bar | Bottom-center | Appears only during boss fights |
| Powerup timer | Bottom-left | Countdown bar for active temp power |

---

## Win / Lose Conditions

**Win a level:** Defeat the ASWANG boss at the end.
**Win the game:** Defeat Bakunawa-Prime and confront Dr. Epal.
**Lose a life:** HP reaches 0 — respawn at last checkpoint.
**Game over:** All lives lost — return to level start with 3 lives.
**Instant death:** Fall into river, void, or hit by crusher/piston.

---

## Out of Scope (v0.1)
- Multiplayer
- Online leaderboards
- Procedural generation
- Controller remapping UI
