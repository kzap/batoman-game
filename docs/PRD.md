# BatoMan — Product Requirements Document

**Version:** 0.2 draft, revised to five levels after Andre's review
**Setting:** Neo-Maynila, 2147
**Genre:** 2.5D action side-scrolling platformer

Story is in [STORY.md](STORY.md). The plan — why these five, the folded mechanics, the cut appendix, the open questions — is in [VISION.md](VISION.md). Look stays in [ART.md](ART.md). The running game is in [TDD.md](TDD.md).

**Direction** is Andre's review: five levels, a boss on every one, a different challenge each. **Canon** is already built or already written. **Proposal** closes a gap and is not approved.

---

## Vision

Play as BatoMan — a Tondo street kid with a plasma-buster arm — through five districts, and stop Project ASWANG.

The order is the docks, the chapel, the tower, the garden, and the destroyed block. Four of those exist as content. The fifth is new. v0.2 does not automatically grow to build every missing boss; that choice is flagged below and left to Andre.

---

## Core loop

1. Enter the district.
2. Meet the hint: a silhouette, a sound, a warning, or an enemy that already behaves like the boss.
3. Play the district's one challenge.
4. The boss tests that same challenge.
5. The next district opens.

Story order is 1–5. The manifest today is `level-1`, `level-3`, `level-4`, `level-6`.

---

## The five levels

| Story | District | Content id now | Later id | Challenge | Boss | Early hint |
|---|---|---|---|---|---|---|
| 1 | Tondo Sublevel Docks | `level-1` | `level-1` | Combat | ASWANG prototype, shipped | **Proposal:** lilac silhouette on the far pier; one patroller that fires the boss's three-shot burst |
| 2 | Quiapo Underground Chapel | `level-3` | `level-2` | Stealth | Sigbin Unit, not placed | The cloaked scout already in the grey-box. **Proposal:** backward prints, a shimmer at the candle |
| 3 | NSA Tower Exterior | `level-4` | `level-3` | Vertical climb | Manananggal-7, confirmed by Andre, not built | **Proposal:** a wing shadow on the sunset tower face; the lower half's perch marked on a balcony he will have to return to |
| 4 | Abandoned Rooftop Garden | `level-6` | `level-4` | Traversal | Tikbalang-X, the mechanical horse, spawn only | **Proposal:** in the sun, a path that reads solid and is a pit; the horse's afterimage casts no shadow |
| 5 | Destroyed City Block | none | `level-5` | Gauntlet | Bakunawa-Prime, not built | **Proposal:** moon-glyph on a fallen wall; the tide mark already wet; a coil shifting under the street |

Do not rename content ids in the v0.2 work. A later content PR renames to `level-1` … `level-5` only once the finale exists, so `level-3` cannot mean both the chapel on disk and the tower in the story.

### How the boss tests the challenge

| Story | Test |
|---|---|
| 1 | Telegraph, jump the rush, punish the stun, then with drones up. Combat he already practiced on the street. |
| 2 | The sigbin lunges from behind. The dorsal core opens on the recovery. Stealth, not a new verb. |
| 3 | The manananggal splits. The flyer returns until the half planted on a lower balcony is dead. He has to go back down the climb. |
| 4 | The tikbalang leaves an afterimage. Only the solid landing takes damage, in the stumble. The floor is the lie. |
| 5 | A rising water line, then a long fight whose phase 3 uses only tells from the previous four bosses. |

### What the build contains today

| Content id | State | Boss |
|---|---|---|
| `level-1` | Dressed, 6400×768. Patrollers, drones | Prototype, playable, three phases |
| `level-3` | Grey-box, 3584×1024. Stealth, drone, patroller, crusher, a flood pit. The flooded nave is the main space ([issue #21](https://github.com/kzap/batoman-game/issues/21)); a drier altar is a side chamber | None |
| `level-4` | Dressed vertical, 1600×1664. Patrollers, drones, stealth. No boss slot. Exit opens with no boss | None. Direction: it gets one |
| `level-6` | Grey-box, 4480×896. Drone, patroller, tikbalang spawn. `spawnEnemy` returns null | None alive |

### Folded from the cut districts

| From | Lands in |
|---|---|
| Divisoria's shielded enemy | One patroller on the docks approach: plasma fails, nova breaks the shield |
| Divisoria's nova-lock | One sealed niche in the chapel, holding the list |
| Skyway wind | The tower's top shaft only. Shoves jumps, telegraphed, standing is safe |
| Arcology's split-body rule | The tower boss |
| Lab files and Epal's first line | One room under the garden, after Tikbalang-X. Portrait and text |
| Kapre smoke | One fogged greenhouse roof in the garden. A crossing, not a stealth game |
| Floodgates' rising water | The finale. Climb out. No swim |

The cut list itself is the appendix in VISION. Nuno-0, Wakwak-4, Kapre-9, and Berberoka-2 are not bosses in this game.

---

## Player

### Shipped

| Action | Input | Notes |
|---|---|---|
| Move | Arrows or A/D | Shipped |
| Jump | Up / W / Space | Variable height. Full jump about 81 px. A 128 px gap needs a dash at the apex |
| Coyote | — | 12 ticks at 120 Hz |
| Wall kick | Into a wall, airborne | Shipped |
| Dash | Shift / X / K | I-frames, one per airtime |
| Crouch / slide | Down | Down + jump drops through a one-way |
| Plasma | Z or J, tap | 1 damage |
| Nova | Z or J, hold 0.8 s, release | 3 damage, piercing bolt. The wide explosion is the fantasy |

HP 3. Lives 3. Death returns to the checkpoint. No lives restarts the level.

### Proposed unlocks

| When | What |
|---|---|
| Docks, before the arena | One Armor Shard. Not required |
| Chapel trap run | One temporary Invincibility |
| Tower | Nothing |
| Garden clear | Double Jump, permanent. Only the finale is designed for it |
| Garden shaft, and the finale antechamber | One HP Up with the files. One temporary Nova Overcharge before Bakunawa |

No boss drops a weapon.

---

## Obstacles

| Obstacle | Status |
|---|---|
| Static, one-way, moving platform | Shipped |
| Spikes (1 HP), crusher (death), pit (death) | Shipped |
| Wind on jumps | Proposal. Tower top shaft |
| One nova-locked niche | Proposal. Chapel |
| Rising water, climb out | Proposal. Finale. Swim is not in this plan |
| Crumbling planters | Not required. Possible later on the garden |

---

## Enemies

Shipped behaviours: patroller (walks, shoots straight), drone (hovers, dives, ignores other storeys), stealth (cloaked until close and on the same storey), the prototype boss.

The tikbalang type is in the schema, with a sheet and a render look, and with no actor.

| Fiction | Basis | Where |
|---|---|---|
| Dock cyborg | Patroller | `level-1` |
| Shielded patroller | Patroller; plasma fails, nova breaks it | Proposal, docks approach |
| Drone | Shipped drone | Docks, chapel, tower, garden |
| Sigbin scout | Stealth, patroller sheet until sigbin art exists | Chapel, already placed. The balcony stealth on the tower is the same behaviour |
| Sigbin Unit | New boss behaviour: rear lunge, core on recovery. About half the 378 px screen height ([issue #21](https://github.com/kzap/batoman-game/issues/21)); 64×48 is retired | Chapel |
| Manananggal-7 | Confirmed by Andre as the tower boss. Not built. Split body, lower half first, vertical | Tower |
| Tikbalang-X | The shipped mechanical horse ([issue #21](https://github.com/kzap/batoman-game/issues/21)). New behaviour on its clips: run, shot, stomp-warp, stumble | Garden |
| Bakunawa-Prime | New boss. Three phases, no new tell in the last | Finale |

---

## Win / lose

**Win a level:** the boss dies and the exit opens. True today only on `level-1`. On `level-4` the exit already opens because there is no boss. Once the tower boss exists, that exception goes away.

**Win the game:** Bakunawa-Prime falls, and Dr. Epal is confronted. The proposal is a portrait behind glass and the grow-light, not a second health bar.

**Lose a life:** HP 0, respawn at the checkpoint. **Game over:** no lives, level restarts with 3. **Instant death:** pit, crusher, and, if the finale is approved, the rising line.

---

## v0.2 — the scope change, flagged

**Already on `v2`.** `level-1` dressed and bossed. `level-4` dressed, still no boss. `level-6` dressed as the sunny farm: the tikbalang spawn still has no behaviour, the painted lying path is not a collider, and the music is still the Tondo track. `level-3` has source art in `art-source/level-3/` and still plays grey-box, because the level JSON has no `art` block. Phase 8.1 (instancing, culling, KTX2, far LOD), 8.2 (remappable keyboard), and 8.3 (reduce-motion, colourblind-safe weak points) have landed.

**Andre confirmed Manananggal-7 as the `level-4` boss.** It is not built. The hangar fighter stays unused. `level-3` and `level-6` still have no boss.

This page does not decide whether v0.2 grows to include those fights.

- **Stay.** Wire Level 3's art into the level, build the tikbalang fight, and finish whatever Phase 8 still has open. The Sigbin and Manananggal-7 are the next milestone. The finale waits until the four existing levels each end on a boss.
- **Grow.** Those same tasks, plus the Sigbin Unit and Manananggal-7, before anyone starts the fifth level.

The finale is in neither option. Powerups, wind, the water line, and the nova-lock are not v0.2 either way.

---

## Out of scope

- A sixth story level. Cut districts are the VISION appendix, not a backlog for this arc
- Multiplayer, leaderboards, procedural generation
- Boss-weapon copies, dialogue, voice-over, animated cutscenes
- Swimming
- Renaming content ids inside v0.2
- The hangar stealth-fighter as the tower boss
- Building the finale inside v0.2
- Gamepad mapping and controller iconography

Keyboard remapping shipped in Phase 8.2. The title and pause menus open a Controls screen where every gameplay action can be rebound. The table is saved with progress and can be reset to the defaults in the Player section above.

---

## Open questions

1. Does the rest of v0.2 stay "wire Level 3's art into the level, tikbalang behaviour, and the remainder of Phase 8," with the Sigbin and Manananggal-7 as the next milestone, or does v0.2 grow to include those two bosses before the finale?
