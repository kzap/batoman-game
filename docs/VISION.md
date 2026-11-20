# BatoMan — Full-Game Vision

**Status:** Proposal for Andre (creative lead) to approve before the team builds on it.
**Scope of this document:** The ten districts as one game. It does not change code, levels, or art.
**Companions:** [STORY.md](STORY.md) (who and why), [PRD.md](PRD.md) (requirements and the v0.2 cut), [ART.md](ART.md) (look and palette, still the color canon), [TDD.md](TDD.md) (what the remake actually runs).

Words below are either **canon** (already in those docs or in the v2 build) or **proposal** (invented here to close a gap). A proposal is not approved. Where this file and an older sentence disagree, the older sentence stays canon until Andre picks; the disagreements are listed, not quietly overwritten.

---

## What v2 already is

Verified against `src/content`, `src/game/enemies`, and `art-source/` on `v2`:

| Level | In the build | Art | Enemies that actually run | Boss |
|---|---|---|---|---|
| 1 — Tondo Sublevel Docks | 6400×768, dressed (58 decor quads) | `art-source/level-1/` backdrops, tileset, props | Patrollers, drones | **ASWANG prototype**, playable. Three phases: shot bursts, a rush that ends stunned with a weak point, then faster bursts plus drone summons. HUD label: "ASWANG PROTOTYPE". |
| 3 — Quiapo Underground Chapel | 3584×1024, grey-box | One concept painting (`concept-art-quiapo-catacombs.png`). No `art` block | One stealth, one drone, one patroller. Crushers, spikes, a flooded death zone, a one-way shaft | None placed. PRD, ART, and the painting all name the **Sigbin Unit** for this district. |
| 4 — NSA Tower Exterior | 1600×1664, dressed (86 decor quads), vertical | `art-source/level-4/` backdrops and props | Patrollers, drones, one stealth on a balcony. Drones and stealths ignore the player on another storey (`sightHeight`) | None. PLAN and the sim agree: a level with no boss completes at the exit. |
| 6 — Abandoned Rooftop Garden | 4480×896, grey-box | No source art | One drone, one patroller. Height changes, a dash gap, a vertical lift, spikes | A `tikbalang` spawn sits at the end. The sheet exists (`idle`, `run`, `stomp`, `hurt`, `death`, `projectile`) and the renderer has a look for it, but `spawnEnemy` returns null, so the world never creates it. No AI, nothing drawn. The clear route walks past the spawn. |

Play order in `manifest.json` is 1 → 3 → 4 → 6, because those are the levels that exist. Story order is 1 through 10. Two music files exist: "Tondo Sublevel" (plays on Levels 1 and 6) and "Divisoria" (plays on Levels 3 and 4). The titles name districts 1 and 2. Sharing them across 3, 4, and 6 is a stand-in.

Shipped kit the rest of the game has to build on: variable jump (a full jump is about 81 px, so a 128 px gap needs a dash at the apex), coyote time, wall slide and wall kick, dash with i-frames (one per airtime), crouch-slide, one-way platforms, moving platforms, spikes (1 HP), crushers and pits (instant death), plasma (tap, 1 damage), nova (hold 0.8 s, a piercing shot, 3 damage). 3 hearts, 3 lives. Checkpoints. No powerups exist in the sim.

## Tensions worth Andre's eye

These are not mistakes to paper over. They are the seams between the v0.1 bible, the v1 concept sheets, and the remake.

1. **Who is the docks boss?** The build, the HUD, the README, and the TDD call it the ASWANG prototype, a heavy patroller in a lilac tint. STORY's "first ASWANG unit" fits that. The PRD's boss table skips Level 1. `art-source/level-1/concept-art-boss.png` is titled Manananggal-7, and PRD/ART place Manananggal-7 in the Arcology (Level 9). The painting's backdrop includes an NSA tower. This plan keeps the prototype on the docks and treats that sheet as the Level 9 design reference. Question 1 asks Andre to confirm.
2. **What is Level 4?** The shipped level is a bossless tower climb. PRD's row for it still says "sniper mechs," and the build has none. `art-source/level-4/concept-art-boss.png` (plus the airport and car sheets beside it) describes a hangar fight against an NSA stealth fighter. This plan keeps the tower and leaves the hangar sheet unused. Question 2 asks Andre to confirm.
3. **Nova.** STORY and the PRD describe a wide plasma explosion. The sim fires a piercing bolt. The TDD calls that a deliberate simplification until it is playtested. This plan writes later levels against the pierce.
4. **Salakot dash.** STORY describes Down+move, with the brim deflecting shots. The shipped dash is Shift / X / K, with i-frames and gravity off. Down is crouch and the crouch-slide. The brim-deflect line can stay as the fantasy those i-frames stand in for.
5. **Tikbalang, on paper vs in the world.** The TDD says the spawn is drawn and has no behaviour. The code drops it before it exists. The score table already awards 500 points for one.
6. **ART's pixel spec vs the remake's pictures.** ART.md's 320×180, 16 px tiles, and 32×48 sprites describe the v0.1 pixel target. v2 paints diorama layers and pivot-annotated billboards; the sim tile is 32 px and BatoMan's idle frame is 120 source px tall. Mood, palette, and silhouette notes in ART stay the look canon. The pixel grid does not describe the game we are making.
7. **"Beat the boss to win the level."** True for Level 1. False for Level 4, where the exit opens because there is no boss. Districts 2, 5, and 8 have no boss in the PRD at all.

## The arc in one paragraph

Ando is not drafted. An NSA machine erased three blocks of Tondo, including the rooftop garden his father rebuilt after the raid that took Ando's arm, and the machine is still on the docks. He puts it down. That is the whole motive at the start. What he finds, walking the city once, is that the machine has a name — Project ASWANG — and a method: Dr. Epal's laboratory dresses eviction weapons in folklore so the lower districts will beg the NSA for protection, and the Oligarch Council will get the footprints for arcologies. The walk goes inland from the bay, under Quiapo, up the outside of a tower that does not hold the lab, back across the skyway to the dead garden, down the garden's own pipes into Laboratoryo Zero, along the floodgates that are meant to drown the basin in one night, up into the sealed atrium where the city splits in half, and out onto those same three blocks, now at river level, where Bakunawa-Prime comes up the Pasig. He breaks the serpent. He does not restore old Manila, and he does not topple the NSA. He makes the garden findable again. A grow-light on a ruined roof is the last picture this plan asks for, and it is a proposal.

The tone canon does not move: hopeful and grounded, funny in the vendors and the jeepneys, heavy about corruption, never joyless. *Makulay. Madilim. Matapang.*

## Rules for the whole game

**The myth is stolen, not evil.** Civilians still practice the real courtesies: *tabi-tabi po* at a mound, candles for the chapel, noise when the moon goes dark so a bakunawa will spit it out. An ASWANG unit is the NSA's industrial copy. Saints, the Black Nazarene, and the santos in the alcoves are set dressing and people's devotion. They are never enemies. Question 8 asks Andre to hold or move that line.

**A district teaches one new thing, and the boss is the exam.** The thing appears in a safe room, then as a threat, then inside the boss. A boss that introduces its own idea is a draft, not a level.

**The three behaviours we have are the roster.** Patroller (walks, shoots straight), drone (hovers, dives, aims), stealth (cloaked until close and on the same storey). New districts reskin and retune them first. A new behaviour ships only when those three cannot say the district's sentence. Shields, turrets, riders, and waders are proposals, and they are not in v0.2. Tikbalang-X is the exception that v0.2 does owe: the spawn is already in the garden, and the behaviour sketch in district 6 is how this plan suggests filling it.

**Powerups arrive after the level that had to be won without them.** Levels 1 through 6 are completable with the shipped kit, which they already are. If Andre approves Double Jump as the garden's clear reward, Levels 7 through 10 are designed assuming it, and nothing earlier is redesigned to need it.

**No boss-weapon copies.** The heart of the combat stays plasma and nova. Growth is the PRD's existing list (spread shot, dash trail, hearts, a one-hit shard, and the temporary boosts). This plan assigns that list to districts. It does not add a weapon dropped by each boss.

**Story is the level, plus a portrait and text.** ART already defers animated cutscenes and gives Dr. Epal a portrait only. Beats below are for intro cards, environmental dressing, and a few portrait lines. No dialogue system, no voice-over in v0.2.

---

## The ten districts

| # | Name | Inspiration | New mechanic | Boss |
|---|---|---|---|---|
| 1 | Tondo Sublevel Docks | Tondo waterfront; the aswang as a class, before it has a species | The shipped kit: dash-gaps, one-ways, movers, the stun window | ASWANG prototype (canon, shipped) |
| 2 | Divisoria Grid Market | Divisoria trade; the nuno whose mound you greet | Nova opens a path; slide under stall-lines | Nuno-0 (proposal) |
| 3 | Quiapo Underground Chapel | Quiapo devotion and anting-anting; the sigbin | Crushers, flood-gaps, a threat that is not in front of you | Sigbin Unit (canon, not built) |
| 4 | NSA Tower Exterior | The institution, wearing no myth | Vertical shafts, lifts, enemies blind across storeys | None (canon, shipped) |
| 5 | Skyway Traffic | The skyway as a class line; the wakwak whose cry lies | Vehicle platforms and wind | Wakwak-4 (proposal) |
| 6 | Abandoned Rooftop Garden | The father's garden; the tikbalang that hides the way home | Path-warp. Crumbling planters come in a later pass | Tikbalang-X (canon, spawn only) |
| 7 | Laboratoryo Zero Entrance | Folklore catalogued and industrialized; the kapre | Switches behind smoke | Kapre-9 (canon, not built) |
| 8 | The Floodgates | The Pasig as infrastructure; the berberoka that drinks a channel and vomits it back | Rising water on a piston clock | Berberoka-2 (proposal) |
| 9 | Arcology Atrium | The city split into those who leave and those who stay; the manananggal | Laser grids; two bodies, and the floor one dies first | Manananggal-7 (canon, not built) |
| 10 | Destroyed City Block | The eclipse noise; Bakunawa; the three blocks from the opening | No new verb. Every earlier tell, in rubble | Bakunawa-Prime (canon, not built) |

---

## One city, walked once

The district list is canon. The route that stitches them into a single neighbourhood is a **proposal**, using real Manila as the skeleton so the fictional tower and the fictional lab have somewhere to stand.

| Step | Where he is | Height | Why the next door is this one |
|---|---|---|---|
| 1 | Tondo, at the mouth of the Pasig, on the bay | Waterline | The prototype is still on the piers. Survivors point inland. Divisoria is the next district east, as it is on a real map. |
| 2 | Divisoria Grid | Street | A vendor still writes on paper. The rest of the list is under Quiapo, because the NSA does not index candles. |
| 3 | Quiapo chapel | Below the street | The paper list names every site. The tower is the eye. The lab is not in the tower. |
| 4 | NSA Tower exterior | A climb up the glass | He is not invited in. The roof is a hatch onto the skyway. |
| 5 | Skyway | Above the streets, under the smog line | The road loops back toward Tondo's roofs. From the top lane the dead grow-lights of the garden are visible, and so is the arcology, still too high. |
| 6 | His father's garden | Rooftops | Other farmers' salakot are still in the planters (ART). Under a collapsed one, the irrigation shaft is concrete. |
| 7 | Laboratoryo Zero | Under the streets | The shaft is the lab. The files name Bakunawa-Prime as the one-night finish, triggered from the floodgates. |
| 8 | The floodgates | The river works | He jams the gates and does not fully stop them. The only stair that stays dry climbs into the arcology. |
| 9 | Arcology atrium | Above the smog | The split. Past the manananggal, a planning table has already written off the block below. |
| 10 | The destroyed block | River level again | The three blocks from the opening, with debris from every district in the rubble (ART). The Pasig comes in electric blue. Bakunawa rises there. |

The Pasig is the thread: under the docks, gone while he is under the church and on the tower, raining on the garden, held at the gates, reflected in the atrium, and the mouth of the last boss. Level 6 is a return, not the raid. The raid already happened before Level 1. Level 10 is that same neighbourhood seen from the water.

```
bay ──east──► market ──under──► chapel ──up the glass──► tower roof
  ▲                                                           │
  │                         skyway loops back toward Tondo    │
  │                                                           ▼
ruins ◄── foundation fails ── atrium ◄── the dry stair ── floodgates
  ▲                                                           ▲
  │                     lab under the garden                  │
  └──────── three blocks of Tondo ◄── garden shaft ───────────┘
```

## Difficulty

The curve is a proposal. It treats the four built levels as the feel we already signed.

| Levels | What gets harder | What stays kind |
|---|---|---|
| 1 | Teaches. Long boss telegraphs. The stun window is obvious. | Full heal of attention: few enemy types, flat ground, the dash-gap is alone in its room. |
| 2 | Density. Several bodies, stalls in the way, nova aimed at a block instead of a crowd. | Still flat. No instant-death except a pit he can see. |
| 3 | Knowledge. A crusher, a flood, a thing that is invisible until it is close. The level is already the shortest (3584 px). | Combat count stays low, as in the grey-box (three enemies). |
| 4 | Execution. The whole level is the climb. Attrition from pits and cross-storey shots. | No boss. A breather in pattern-learning, on purpose. Shipped. |
| 5 | The kit under stress. Ground that moves, wind on the jump, a flying boss. | Lanes are readable. Wind is a telegraph, not a shove from off-screen. |
| 6 | Trust. Platforms that fail, then a boss that counterfeits its own position. Midpoint, and the hardest *read*. | The punish window is the same idea as Level 1's stun. He has seen it before. |
| 7 | Patience. Slow tank, smoke, a switch he cannot see. Pace drops, threat rises. | The core, when the smoke clears, is a still target. |
| 8 | The clock. Highest execution in the game. Water and pistons share a period he can learn. | The period is audible (see music). Dying teaches the rhythm rather than a new pattern. |
| 9 | Priority. Elites of all three families, then two bodies at once. | The rule is stable: the floor half dies first. Spectacle with one sentence. |
| 10 | Length and memory. Every prior tell, in short rooms, then a long multi-phase fight. | Checkpoints are generous. The ending is meant to be finished. No new trick in phase 3. |

A boss never demands a powerup. Powerups change the texture of the next district, not the fairness of the current fight.

## Powerups and abilities

Everything in this table is a **proposal**, using only the powerups the PRD already names. Temporaries last about ten seconds, as the PRD says. Permanents persist for the rest of the run.

| District | Unlock | Why it is here, and not earlier |
|---|---|---|
| 1 Tondo | Armor Shard, one pickup on the way to the arena | The first real damage check. Optional. The fight is winnable without it, and the replay already proves a no-hit clear. |
| 2 Divisoria | Plasma Upgrade, permanent (3-way spread) | The market is the first place a single bolt is the wrong shape. Level 1 has already taught the single bolt. |
| 3 Quiapo | Invincibility, one temporary, inside the trap run | Some rooms are crossings. A permanent weapon here would bury the sigbin's lesson. |
| 4 Tower | Nothing | The climb is the wall kick and the dash as already learned. |
| 5 Skyway | Dash Upgrade, permanent (the dash leaves a damaging trail) | The dash becomes an attack only after a whole district has asked him to commit to it in traffic. |
| 6 Garden | Double Jump, permanent, granted when Tikbalang-X falls | The fight and the crumbling roofs are won without it. Later districts assume it. Earlier ones must not need it. |
| 7 Lab | HP Up, permanent (+1 heart, cap proposed at 5) | Smoke and a tank. Survivability, not a new verb. |
| 8 Floodgates | Speed Boost, one temporary near the longest piston run | A relief valve on the clock. The rhythm is still the solution. |
| 9 Atrium | A second HP Up, and a fresh Armor Shard | The split-boss spike. Two extra hearts across the whole game, not a heart every level. |
| 10 Ruins | Nova Overcharge, one temporary in the antechamber | The only place a cooldown-free nova cannot rewrite earlier levels. |

Sari-sari pickups, which the tone section already promises, are the fiction for the shards and the hearts: a cooler, a paper cup, a vendor's hand from a stall. They are dressing on the existing pickup, not NPCs.

## Enemies, reused

| Fiction (PRD / ART name) | Behaviour | Where |
|---|---|---|
| Cyborg dockworker | Shipped patroller | Level 1, and the generic ground soldier afterward |
| Patrol drone, flying drone | Shipped drone | Levels 1, 3, 4, 6, and any later air pressure |
| Sigbin scout | Shipped stealth, still on the patroller sheet until sigbin art exists | Level 3; the balcony stealth on Level 4 is the same behaviour in tower colours |
| Riot bot | Patroller remix. **Proposal:** a frontal shield, plasma fails, nova or a shot from behind connects | Level 2 |
| Security turret | **Proposal,** and the first small new behaviour: a drone that does not move, retracted and harmless until it sees him (ART already says this) | Level 2 |
| Sniper mech | Designed in ART for Level 4. Not in the shipped tower. **Proposal:** leave Level 4's roster as shipped; if the sniper is wanted later, it is a drone that does not dive and fires a slow telegraphed shot | Parked |
| Tikbalang scouts | The PRD names scouts on Level 6. The only spawn is the boss slot. **Proposal:** no scouts in v0.2. Adds, if a later pass wants them, are the same sheet smaller | Level 6, later |
| Lab guardians | Patroller and stealth, lab palette | Level 7 |
| Syokoy waders | **Proposal:** patrollers that stand in water which kills Ando | Level 8 |
| Elite NSA | All three families, tighter ranges, no new states | Level 9 |
| The whole catalogue | Short rooms of old combinations | Level 10 |

Contact damage, telegraphs, and a magenta weak point during a vulnerable frame stay the global rules from ART.

---

## 1 — Tondo Sublevel Docks

**Status:** Canon. Dressed. Boss shipped.

**Setting.** Pre-dawn on the piers. Salt concrete, patched wood, fishing boats, the Pasig running electric blue under the boards. Jeepneys on magnetic rails are a distant upper layer; down here the work is still wet. Three blocks inland are already rubble. The garden is already gone. Ando starts in what is left of his own waterfront.

**Inspiration.** Tondo as a real port district and as the old polity on this bay: fishing, barangay tags, bilao baskets, the salakot his father wore in the rooftop plots. The folklore is the word *aswang* itself, the class name, before the NSA has specialized it into a sigbin or a tikbalang. The prototype is unfinished on purpose. It does not deserve a species yet.

**Story beat.** He fights the unit that leveled his neighbourhood and is still hunting the docks. Beating it is the proof that a unit can fall. It does not bring the garden back. People at the sari-sari shacks — the humor the tone section already asked for — tell him the clearance is moving east into Divisoria, and that anyone who still writes on paper is under Quiapo. He goes inland.

**Mechanic.** No new system. The level teaches the kit every later district cites: a 128 px gap that needs a dash at the apex, one-way platforms, a mover over a pit, spikes, and the boss language. Phase 1 is a standing duel. Phase 2 is a telegraphed rush he jumps, then a stun where the weak point doubles damage. Phase 3 adds drones, which he has already killed in the level. The exam is the lesson.

**Enemies.** Dock cyborgs (patrollers) and NSA drones. The occupation, not the myth.

**Boss.** ASWANG prototype. Tests: read a telegraph, jump a rush, punish a stun, then do it while drones are in the air. Skill already taught in the level.

**Unlock.** Proposal: one Armor Shard before the arena. The no-hit clear already in the replay fixture stays the standard the shard must not be required for.

**Music.** The existing cue "Tondo Sublevel" stays this district's music. This plan does not pretend to describe the recording. Its job in the series: the bass the finale will bring back, thinner, at the end.

**Look.** ART's Level 1 row is canon: rust brown, warm amber, electric-blue water, incandescent bulbs against NSA spotlights. Hanging fish, bilao, barangay graffiti. Painted diorama, the way Level 1 already ships.

## 2 — Divisoria Grid Market

**Status:** Not started. Setting, palette, and enemy names are canon. Mechanic, boss, and unlock are proposals.

**Setting.** The covered market, three storeys of stalls, stadium light that never quite becomes daylight. Ukay-ukay, sampaguita garlands, synthetic meat, holographic prices, and the cold blue of NSA easement barriers cutting aisles in half. The city's stomach, being told to close.

**Inspiration.** Divisoria as it is actually walked: wholesale, bargaining, *tawad*, a density that is itself a culture. The proposed myth is the nuno sa punso, the dweller of the mound. People say *tabi-tabi po* so they do not step on his house. The NSA's copy, Nuno-0, has turned the courtesy into a clearance tool: the stalls are the mounds, and the unit under the floor answers anyone who demolishes one.

**Story beat.** Riot bots are emptying aisles for an "easement." Ando crosses the market and learns the clearances are a list, not a riot. A vendor he knows puts one paper page in his hand. The rest is under the chapel. Quiapo is next because the chapel still keeps what the NSA would not digitize. He leaves Divisoria knowing the project has sites.

**Mechanic.** Nova becomes a key. The PRD's destroyable block appears here as stall-fronts and easement locks: the piercing nova breaks them, a tap of plasma does not. That is the first time the charged shot opens a path, after Level 1 used it only to hurt. Crouch-slide, already shipped, is how he passes under awning lines while a turret is extended. The new sentence is restraint: some stalls are doors, and some stalls are someone's place. Nuno-0 punishes the player who novas every box.

**Enemies.** Riot bots (shielded patrollers, proposal) and security turrets (stationary, retracted until they see him, proposal). A drone over the central aisle reuses the shipped flyer so the district is not entirely new tells.

**Boss.** **Nuno-0 (proposal).** Small, under the floor, not a spectacle-giant. It surfaces when a stall-mound is broken, and it is quiet if he leaves the marked homes alone. The fight asks for the nova aimed at the core the unit exposes, and asks him not to have spent that nova on the room. Skill tested: precision after a level about crowding. If mechanizing a spirit people still greet is the wrong call, this is the boss to replace (Question 3, Question 8).

**Unlock.** Plasma Upgrade, the 3-way spread, as the clear reward. The level itself is cleared with the single bolt plus aimed novas, so the spread is how the next district feels, not how this boss is solved.

**Music.** The existing cue titled "Divisoria" is this district's track. It currently stands in on the chapel and the tower; those districts get their own cues when they are real, and this track comes home. Direction, as a proposal for arrangement notes on top of a recording that already exists: too many radios, a sweet vendor motif against a klaxon.

**Look.** ART's Level 2 row is canon: every color, on purpose, then the NSA's cold blue as the only quiet note. Sampaguita, hanging goods, crowd shadows. The nuno's mound-light, if the boss is approved, is a small warm amber under the stalls, the same amber as a checkpoint, so it reads as a home and not as a muzzle.

## 3 — Quiapo Underground Chapel

**Status:** Grey-box shipped. Boss canon, not placed. Palette and the sigbin are canon.

**Setting.** No sky. Colonial vaults with slum additions, candles on every ledge, a flooded nave, santos with cracked faces, circuit boards wired into votive niches. The concept painting is the target: Ando on a bridge of stone, the sigbin in the water below, fungi glowing in the same teal as the Pasig.

**Inspiration.** Quiapo's real devotional life: the church, the vendors of anting-anting and herbs, candles, the procession. The myth is the sigbin, the backward shadow-creature, which the PRD and ART already assign here. The saints are the neighbourhood's, not the NSA's. They stay in the alcoves.

**Story beat.** The Sigbin Unit was sent because the herbolarios and the record-keepers were mapping disappearances on paper. Ando comes for the rest of the list. He reads it by candle: Project ASWANG, sites by district. His father's garden is already marked cleared. The tower is the eye, and the lab is not inside it. The way onward is up the outside of that tower, then home by the high road. The sigbin is the price of leaving with the pages.

**Mechanic.** Already in the grey-box, and it is the district's sentence: a crusher with a timing, water that kills, a cloaked enemy that does not exist until he is close, and a one-way shaft. Level 1's threats were in front of him. This district's threats are beside him, above him, or not visible yet. The boss, when it is built, should be that sentence and not a new one: it lunges from behind, and the dorsal core (ART) opens on the recovery. The PRD's "specific sequence" is not defined anywhere; the proposal is that the sequence is the lunge and the punish, repeated, the same grammar as the prototype's rush and stun. A fancier sequence is Question 4.

**Enemies.** The grey-box roster is the right one and should survive dressing: a sigbin scout (stealth), a drone in the shaft, a patroller in the upper gallery. Scout art remains the patroller sheet until a sigbin sheet exists (TDD).

**Boss.** Sigbin Unit (canon). Tests: stay aware of his back, wait out camouflage, hit the core only when the camo drops. It does not warp the room and it does not fly. Those are later bosses.

**Unlock.** One temporary Invincibility in the trap corridor. No permanent. The chapel is a place of attention, and a new gun would talk over it.

**Music.** **Proposal,** a new cue. The "Divisoria" track on this level today is the stand-in. Direction: slow, a procession drum, a small choir texture cut into pieces, candle-crackle as the noise floor. The sigbin's tell is the drum phrase played quietly and backwards, not a new sting family.

**Look.** ART's Level 3 row is canon: deep indigo, candle gold, teal water. No hard daylight. The painting's crumbled baroque and the fungi are the dressing target once someone paints the layers the pipeline wants (`background.png`, `foreground.png`, `backdrops.json`, a tileset, a props recipe — the same list PLAN gives for a dressing PR).

## 4 — NSA Tower Exterior

**Status:** Canon. Dressed. Bossless, on purpose.

**Setting.** Night on the glass. Searchlights, the logo repeating, cameras, a scaffold of rungs and hanging lifts up a tower that does not want a human scale. The interior, seen through glass, is empty of anything he needs: clean geometry, status LEDs, no monster.

**Inspiration.** The institution itself. Epal's NSA presents as science, so this district wears no folklore. That absence is the point, and it is why a boss here would blur the line the other nine districts draw between a myth-weapon and a building. The cultural texture is the one people on the scaffolds still have: cable, corrugated sheet, barrels, a gantry. The shipped dressing already says this, in 86 quads.

**Story beat.** He climbs because the chapel's list told him the lab is not here, and because no door on the ground floor would have opened. From the glass he confirms it: Laboratoryo access is under the garden, not behind these windows. The roof hatch drops him onto the skyway. The beat is negative space. He leaves the tower having been refused, which is the information.

**Mechanic.** Shipped, and it is the new sentence after three mostly horizontal districts: a vertical level. One-way rungs, a hanging lift, a wall-jump shaft between a column and the tower face, and enemies that do not react when he climbs past on another storey. It builds on the wall kick from Level 1, which was an option, and makes it the path. It builds on the drone, which was a ground duel, and makes him shoot while holding a wall. No new combat verb.

**Enemies.** As placed: patrollers on the street and the roof, drones on the rungs, a stealth on the second balcony. The PRD's sniper mechs are not in this level. This plan does not add them. Reopening a finished climb to insert a new enemy type waits on Andre, and it is not required for anything downstream.

**Boss.** None. The exam is the roof. The older hangar sheet (a stealth fighter, strafing runs, missiles, an airport) is a v1 concept filed with this number. It is a different level: horizontal, indoor, a vehicle boss with no folklore. This plan does not adopt it. Question 2 is the confirmation.

**Unlock.** Nothing.

**Music.** **Proposal,** a new cue. Today's playback is the Divisoria stand-in, which is the wrong temperature. Direction: sparse, a searchlight pulse, almost no melody, no folk instrument in front. Radio numerals. The quietest track in the game, so the skyway can feel loud after it.

**Look.** ART's Level 4 row is canon, and the shipped backdrops already follow it: cold grey-blue, hard white, stark black, the logo, the rigs. Foreground chroma-keyed off magenta, as the pipeline notes for this level.

## 5 — Skyway Traffic

**Status:** Not started. Setting and palette are canon. Mechanic, boss, and unlock are proposals.

**Setting.** Dusk smog, the elevated highway, the sprawl below, stalled jeepneys used as platforms (ART). Lanes collapse. Headlights are the local sun. This is how the sealed city crosses above everyone else, and in this plan it is also the road home: it bends back toward Tondo's roofs rather than carrying him to a new map.

**Inspiration.** The Skyway as a real class line over Metro Manila, and the jeepney as the vehicle that was not invited up and is here anyway, stalled, still carrying people. The proposed myth is the wakwak, the Visayan night-bird whose cry is louder when it is far and softer when it is close. The NSA unit keeps the lie as a targeting tell: the obvious cue is the wrong one. Bakunawa is already a Visayan serpent in this Manila story, so the regional stretch matches an existing canon choice. Andre can swap the figure (Question 3). An ekek was considered and set aside here because tellings fold the ekek into the manananggal, and Level 9 needs that silhouette alone.

**Story beat.** He is trying to get back to the garden, and the high road is the only bridge from the tower roof to those blocks. From the top lane he sees two things at once: the dead grow-lights of his father's roofs, close, and the arcology above the smog, not yet reachable. The wakwak hunts anyone on the lanes who is not in a sealed vehicle. He crosses.

**Mechanic.** Unreliable ground, built from Level 1's movers and Level 4's demand that he commit to a jump. Vehicles are movers with longer paths and less mercy. Wind is a new force during a jump, telegraphed by litter and by the lane-lights bending, so a dash he already knows either lands or does not. The wind never pushes him off a platform he is standing on. Standing is safe; jumping is a decision. That keeps the new mechanic inside the verb he has.

**Enemies.** Vehicle gunners are patrollers riding movers (proposal: the rider is the same FSM, the solid under him moves). Drones in the open air, reused. No stealth; the skyway is about being seen.

**Boss.** **Wakwak-4 (proposal).** It strafes the lanes. The cry is the tell, and the tell is inverted: loud means it is lining up from far away (he has time), quiet means the dive is already here (dash i-frames, the Level 1 rush lesson in the air). The punish is the recovery after the dive, on the sheet of a flying body, not a new weak-point rule. Skill tested: trust the quiet, spend the dash on purpose.

**Unlock.** Dash Upgrade, the damaging trail, after the fight. During the fight the dash is still only movement and i-frames, so the trail cannot become the way he skips learning the lanes.

**Music.** **Proposal,** a new cue, and the loudest in the first half. Jeepney-stereo energy, horn Doppler, city-pop tempo. The wakwak cry is mixed to masquerade as traffic, which is the same lie as the boss tell. If the cry cannot be both music and a readable gameplay cue, gameplay wins and the motif stays in the stinger only.

**Look.** ART's Level 5 row is canon: amber and red taillights, concrete grey, many vehicle colors, dusk-orange smog. Wind-blown litter, cracked guardrails. Rain is listed in ART's VFX notes for this level and for the garden.

## 6 — Abandoned Rooftop Garden

**Status:** Grey-box shipped. Boss canon, not alive. Personal center of the story.

**Setting.** Night rain on overgrown planters, collapsed greenhouse frames, rusted irrigation, a few grow-lights still warm and most of them dead. Other farmers' salakot lie where they were set down (ART). This is the plot Ando's father rebuilt, and it is empty because a tikbalang's job is to make travelers lose the path. The people who lived here could not find their way back.

**Inspiration.** Urban farming as the "provincial spirit" STORY already names, and the salakot as the heirloom Ando still wears. The myth is Tikbalang-X, canon in the PRD, ART, and the spawn list: horse-skull, too-long legs, a mane of fiber-optic cable, afterimages when it warps, a stumble when it lands. Folk practice for a tikbalang includes turning a shirt inside out to break the spell. The proposal does not literalize the shirt. The stumble *is* the spell breaking, for a moment, and the weak point shows.

**Story beat.** The midpoint. He comes home and the home does not recognize him: paths bend, planters fail, the rain hides the far edge. He kills the unit that kept the garden lost. The paths straighten. The plants are still dead. Under a collapsed planter the irrigation drops into a concrete shaft that is not a cistern. That is Laboratoryo Zero, and grief becomes a direction. He goes down.

**Mechanic.** Two layers, and they should not be confused with v0.2's exit. The grey-box already has the movement sentence: roofs at different heights, a hop, a 128 px dash gap, a vertical lift, a drop, one-way planter steps. **Proposal for a later pass, not for the v0.2 exit:** crumbling planters, the PRD's crumbling platform, so the district's "unstable floors" become real. They crumble after he lands, with enough warning to dash off, and they are taught in an early room with no enemy. The boss's lie is the second mechanic, and it is the one v0.2 owes this level: the room he is fighting in is not where it looks like it is.

**Enemies.** As placed: a drone, a patroller, and the tikbalang slot. No scouts in the first version of the fight (see the roster table).

**Boss.** Tikbalang-X (canon). **Proposal for the behaviour v0.2 builds, mapped to the clips the sheet already has:**

- `run` between points on the arena.
- `projectile` for a straight shot, so the duel starts in a language Level 1 taught.
- `stomp` as the warp tell: it stomps, an afterimage stays (ART), and the body is somewhere else. The afterimage takes no damage. The solid body does.
- On landing, `hurt` held as the stumble. Mane dark, visor open, in the dressing. The weak point doubles damage, the same rule as the prototype's stun.
- He has a short window to hit the solid one, then it runs again.

Skill tested: the Level 1 punish, against a target that has learned to counterfeit itself. The PRD's line is "hit during the stumble window." This sketch is that line and nothing extra.

**Unlock.** Double Jump, permanent, when the unit falls. Not before. The dash gaps and the boss are both designed for the kit he walked in with. Levels 7 through 10, if this reward is approved, assume the second jump and stop using raw height as their difficulty (Question 5).

**Music.** **Proposal,** a new cue. Today's playback is the Tondo track, which is the right *family* and the wrong arrangement: the garden should be that theme with the drums taken out, one instrument and the rain. When the tikbalang warps, the cue detunes; on the stumble it locks back to pitch, as a second tell for players who cannot read the afterimage cleanly (colourblind-safe, which Phase 8 already wants for weak points).

**Look.** ART's Level 6 row is canon: dark wet green, night blue, one amber grow-light, vines through cracks, dripping pipes, the abandoned hats. There is no source art yet. Dressing waits on that art, as PLAN says.

## 7 — Laboratoryo Zero Entrance

**Status:** Not started. Boss, palette, and the lab's existence are canon. Mechanic and unlock are proposals.

**Setting.** No sky. Chemical tanks, catwalks, blast doors, specimen tanks with things in them, project files spilled as if someone left in a hurry. Harsh fluorescents, red emergency light, yellow caution. The underground network STORY names, entered for the first time, and only the entrance: the deeper lab can stay unseen so the game does not owe a second dungeon.

**Inspiration.** The horror is bureaucratic. Epal catalogued the stories and built the worst usable version of each (ART's own boss principle). The myth assigned here is Kapre-9, the giant who sits in a tree and smokes. There is no tree in the room. The exhaust stacks on his shoulders are the cigar. He is what the garden smelled, from below, while it died.

**Story beat.** Ando lands in the files. His father's plot is a cleared site with a number. Epal's voice is on the PA for the first time, charming, explaining contamination. The files name the finisher: Bakunawa-Prime, up the Pasig, one night, and the lower districts are a basin. The trigger is the floodgates. The beat hands him the ending with three districts still to walk, so the last act is a choice to go and stop a thing he has now seen named.

**Mechanic.** The PRD's forcefield, opened by a switch. The switch is first in a clear room, then in a room where Kapre smoke hides it, then inside the boss. It builds on Quiapo's "you cannot see the threat" and on the weak-point window: the core only matters once the smoke is gone. The fields are not a new gun. They are doors. A nova does not break them; that privilege belonged to Divisoria's stalls, and it should not solve every lock in the game.

**Enemies.** Lab guardians: patrollers and stealths in the lab palette, plus a drone in the tank hall. The stealth is the right remix because smoke and cloak are the same sentence said twice.

**Boss.** Kapre-9 (canon). Slow, huge, fills the corridor (ART: 144×160 in the old pixel scale; in v2, half the screen height or more). Smoke covers a large part of the room; debris falls when he moves. The chest plate opens when the smoke clears. Skill tested: navigate blind along a path the level already taught, then hit a still core. He does not need to be fast. He needs to be unavoidable until the player understands the room.

**Unlock.** One permanent HP Up. The lab is where the run gets harder to survive, not where it gets a new trick.

**Music.** **Proposal.** A fluorescent hum as the tonic, dry, almost no reverb, the opposite of the chapel. Drips as the rhythm. Epal's PA, when it exists, sits in this mix as portrait-card text, not as voiced audio, unless a later production decides otherwise.

**Look.** ART's Level 7 row is canon: industrial grey-green, warning red, caution yellow. Hazmat barrels, tanks, scattered files.

## 8 — The Floodgates

**Status:** Not started. Setting and palette are canon. Mechanic and boss are proposals.

**Setting.** Sealed water-works under the river. Enormous pistons and gates, catwalks over a channel, gauges at the red line, klaxons. The Pasig, which has been scenery and a death pit, becomes a machine with a schedule.

**Inspiration.** Real flood control on this river, fictionalized as NSA infrastructure: the same authority that dyed the water with engineered algae also owns the gates. The proposed myth is the berberoka, the Ilokano swamp creature that drinks a body of water dry to pull victims in, then spews it back to drown them. As a unit, Berberoka-2 *is* the gate's heart. The enemy remix is the syokoy, a sea-creature shape for patrollers who can stand in water that kills Ando.

**Story beat.** He is racing the schedule in the files. If the gates open fully, the basin fills and Bakunawa has its flood. He jams them. He does not get a clean victory: the river still rises enough to cut off the way back, and the only dry stair climbs into the arcology, which is the address the gates were protecting. The last act starts because he did the right thing and it trapped him upstairs.

**Mechanic.** Rising water, from the PRD, on a clock he can learn, plus the crusher he already knows from Quiapo arranged as pistons on that same clock. The water is taught as a visible line with a safe landing above it, then as a line that forces a specific jump, then as the boss's drink-and-spit. **Swim is not in this proposal.** The PRD's "swim or drown" would be a new locomotion mode. This plan uses climb-out: the water kills if it covers him, the way a pit kills, and the level is a climb on a timer. Question 6 is the place to ask for a swim move instead.

**Enemies.** Syokoy waders (patrollers that ignore the water) and drones over the channel. The waders are what make the water feel occupied rather than empty-and-rising. Their shots are the shipped horizontal shot; the new fact is only that they can stand where he cannot.

**Boss.** **Berberoka-2 (proposal).** It drinks the arena down (the floor returns, the fight is a normal duel for a few seconds) and then releases the channel (the line rushes back to a mark the level has already used). The core is open at the turn, the moment between drink and release, which is the punish window again, this time on a clock instead of a stun animation. Skill tested: the Floodgates' own period. A player who learned the pistons knows when the turn is coming.

**Unlock.** One temporary Speed Boost beside the longest piston run. The boost is a comfort, not the key. The period is the key.

**Music.** **Proposal.** The piston period is the tempo. Sub-bass on the downbeat, kulintang hits that ring like wet metal, klaxon as a thin layer. A player should be able to time a jump with their eyes closed. Kulintang is already the series' named palette in STORY; using it here as flooded metal is a proposal for *this* cue, not a new identity for the whole score.

**Look.** ART's Level 8 row is canon: blue-black water, orange caution, silver machinery, spray, tide marks, gauges.

## 9 — Arcology Atrium

**Status:** Not started. Boss, palette, and the split-body fight are canon. Laser grids and the unlock are proposals.

**Setting.** Above the smog line. White, gold, real plants, luxury retail dragged into barricades. A sky dome far overhead and many floors of other people's lives between Ando and it. Warm designer light, then the red of a security state. The district that never smells the docks.

**Inspiration.** The class split, said with a Tagalog monster that already splits. The manananggal separates: the upper body flies, the lower body stays, and the folk defense is to destroy the lower half (salt, garlic, ash, a stingray tail in some tellings) so the flyer cannot return. ART and the PRD already require that order. The atrium is the right room because the architecture itself is a separation: the people up here have left the lower city behind, and their weapon does it with a body.

**Story beat.** He came up the dry stair and the doors locked behind him. The atrium is fortified against the city it feeds on. Manananggal-7 meets him looking like authority — sleek, white, gold — and then tears. After it falls he finds the planning table: the block below is already written off. Epal is not in the room. Epal is with the serpent. The beat points down, back to Tondo, for the last level.

**Mechanic.** Laser grids, named in the PRD's Level 9 theme. They are timed lines, taught with the same patience as Quiapo's crusher, then stacked with the elites. The boss builds on Level 4's vertical aiming and Level 5's anti-air: the flying half uses the atrium's height, and the standing half holds the floor. The rule, taught by a mural or a shrine-mark in the approach (salt on a threshold, a folk hint that is also a tutorial), is that the lower half dies first. Killing the flyer early does nothing lasting; it returns. That is the myth, and it is the mechanic.

**Enemies.** Elites: all three shipped families, slightly tighter ranges, in the white-and-gold materials until they bleed magenta at the weak point. No new states. The player should recognize every silhouette and still feel outnumbered.

**Boss.** Manananggal-7 (canon). Phase 1, the whole body, elegant, a duel. Phase 2, the split: upper half flies, lower half grows the blade-legs ART describes, and only the lower conduit is the real target. Phase 3, the flyer alone, once the lower half is gone, with the cracked chest panel as the core. The `art-source/level-1` sheet titled Manananggal-7 (wings, exposed plasma spine, the torso over a separate hydraulic lower body, an NSA tower in the backdrop) is the design reference for this fight. Skill tested: priority under fire. One sentence, held for the whole fight.

**Unlock.** A second HP Up and a fresh Armor Shard, found in the approach, not dropped by the boss. He is meant to walk into the hardest duo with the means to make a mistake.

**Music.** **Proposal.** A formal song at a polite tempo, too clean for this series, tearing into two layers at the split: one stays low with the floor body, one goes thin and high with the flyer. A kundiman as the source is the proposal on the table and the thing most likely to feel glib. Question 9 asks before anyone arranges it. A plain formal melody, with no named traditional source, is the fallback and would still do the job.

**Look.** ART's Level 9 row is canon: white, gold, deep green, security red. Abandoned luxury, barricades made of expensive furniture. The boss reads as official until the moment it separates.

## 10 — Destroyed City Block

**Status:** Not started. Boss, palette, and the "confront Dr. Epal" ending are canon. The form of that confrontation is a proposal.

**Setting.** The three blocks the prototype leveled, now at river level, pre-dawn again as in Level 1. Ash, fire, the Pasig in the street, infrastructure hanging out of cross-sections. The rubble contains the other nine districts (ART already asks for market stalls, church stone, dock planks). Bakunawa's own blue markings light it from below.

**Inspiration.** The bakunawa that swallows the moon, and the widespread practice of making noise — pans, drums, shouting — until it spits the moon back. The moon-glyph weak point is already ART canon. The proposal is only that the noise is how the glyph opens: the antechamber teaches a "make the city ring" beat (shoot the hanging metal, a kulintang bar, a jeepney panel), and the boss opens its forehead when that ring is going. It is the Level 2 lesson (a shot aimed at the room, not only at the body) at the scale of the ending.

**Story beat.** He drops from the atrium's foundation onto the block he started for. Every district is in the rubble because the project was always one project. Bakunawa-Prime rises. Epal is present the way ART allows: a portrait, a sealed gallery, the smile that widens when other people are losing. He still believes he is necessary. **Proposal:** he is not a health bar. When the serpent breaks, the gallery is a man behind glass, the PA goes quiet, and the NSA is still the government in the morning. The last image is one grow-light coming on in the ruined roofs, and Ando with the salakot he never put down. The garden is not restored. It is no longer hidden. Question 7 is this ending.

**Mechanic.** No new verb. Short rooms reprise a dash-gap, a cloak, a shielded riot bot or its absence if Nuno's district was retuned, a wind jump, a crumbling planter, a smoked switch, a water line, a laser. Each reprise is shorter than the original lesson. Then the arena. If a proposed district was cut, its reprise is cut with it; the finale should not depend on a mechanic Andre rejected.

**Enemies.** The catalogue, in combinations he has already survived. No new family, no elite-only surprise in the last corridor.

**Boss.** Bakunawa-Prime (canon), the exam of the whole game.

- Phase 1: the head from the water, below the platforms. Teaches the glyph and the noise.
- Phase 2: coils around the arena, constricts, the platforms he is using become the hazard. The Level 8 clock, without the water being new.
- Phase 3: the body emerges, screen-filling, and the glyph is the multi-hit core. Every attack in this phase uses a telegraph from an earlier boss: a rush, a warp-fake, a smoke, a split-priority (the coil and the head). Nothing in phase 3 is a debut.

Skill tested: memory, endurance, and the willingness to shoot the room. The moon it tried to swallow is the way it dies, which is the myth, used against the copy.

**Unlock.** One temporary Nova Overcharge in the antechamber, so the last fight can feel like the fantasy the PRD wrote down — a nova that keeps coming — without making that the permanent kit.

**Music.** **Proposal.** The eclipse noise: pans and the series' kulintang, with the Tondo bass under them. When the serpent falls, one chord for the grow-light, then the docks theme at half density under the last card. Hopeful, grounded, not a fanfare. Question 9 covers how literal the traditional material should be.

**Look.** ART's Level 10 row is canon: ash grey, fire orange, Pasig blue-green, blood magenta. Fires, floodlights, the serpent's markings. Pre-dawn, so the picture rhymes with Level 1's amber haze and is not the same hour: Level 1 was the start of a night's work; this is the morning after it.

---

## v0.2, and everything after

v0.2 closes the four districts already in the game. It does not start a fifth.

### Already done

- Level 1, dressed, with the ASWANG prototype.
- Level 4, dressed, bossless tower.
- Levels 3 and 6, grey-box, in the manifest, with clear replays.
- Shell, save, music playback, the three enemy behaviours, the editor, the art pipeline.

### v0.2 builds

| Work | What "done" means |
|---|---|
| Tikbalang-X | The Level 6 spawn becomes a fight. Behaviour along the sketch in district 6, using the clips on the existing sheet. The exit stays shut until it dies, the same rule as the prototype. |
| Dress Level 3 | When `art-source/level-3/` has the source set PLAN already lists. The concept painting is the mood target. Geometry of the grey-box stays unless a dressing problem forces a small edit. |
| Dress Level 6 | Same, and there is currently no source art at all. Blocked on art, not on code. |
| Sigbin Unit | **Recommended inside v0.2, and called out because PLAN's dressing exit did not name it.** PRD, ART, and the Quiapo painting all promise this boss on the level we are about to call finished. An empty exit at the end of a dressed chapel under-delivers the written district. Question 4 can pull it out of v0.2 without touching the rest. |
| Phase 8 | As PLAN writes it: instancing, culling, texture compression, far-layer LOD, remappable input, reduce-motion, colourblind-safe weak points, docs kept current with the code. |

v0.2 does not add powerups, Double Jump, crumbling floors, new districts, swim, wind, forcefields, or a nova explosion. Those wait for an approved vision and a district that teaches them. The garden's crumbling planters are a later pass over a level v0.2 will already have dressed and bossed, so the pinned clear replay is not thrown away for an unapproved hazard.

### After v0.2, in story order

Districts 2, 5, 7, 8, 9, 10, each its own phase once this document is approved. The proposed bosses (Nuno-0, Wakwak-4, Berberoka-2) and the proposed verbs (destroyable stalls, wind, forcefield switches, rising water, laser grids, crumbling planters) are scheduled with the district that teaches them. Manananggal-7, Kapre-9, and Bakunawa-Prime are that backlog too, even though their names are old canon: they have no levels yet.

Nothing in the backlog should be prototype-built "while we're in the area." The four-district game has to be a finished game first.

---

## Open questions for Andre

1. **Docks boss.** Confirm the shipped ASWANG prototype stays the Level 1 boss, and the Manananggal-7 sheet in `art-source/level-1/` becomes the Level 9 design reference. If the filename is the real intent, the arc above moves.
2. **Tower.** Confirm Level 4 stays a bossless exterior, and the hangar stealth-fighter sheet stays unused.
3. **Three proposed bosses.** Approve, replace, or drop Nuno-0 (Divisoria), Wakwak-4 (Skyway), and Berberoka-2 (Floodgates). Wakwak is Visayan and berberoka is Ilokano, in a Manila story that already includes Bakunawa. Nuno is the sensitive one: a spirit people still greet.
4. **Sigbin and v0.2.** Does "finish Level 3" include the Sigbin Unit fight, or only the dressing and the enemies the grey-box already has? If it includes the fight: is "lunge, then punish the dorsal core" enough of a sequence, or is there a specific sequence you already want?
5. **Powerup ladder.** In particular: 3-way plasma after Divisoria, dash trail after the Skyway, Double Jump only after Tikbalang-X falls (Levels 7–10 would then be designed for it). Anything in that list you do not want in the game at all?
6. **Floodgates water.** Climb out of a rising line that kills on contact, or a real swim? This plan climbs. The PRD currently says swim or drown.
7. **Ending.** Epal stays a portrait behind glass after Bakunawa falls, the NSA is still standing in the morning, and the last image is one grow-light on the ruined roofs. Or do you want him fought, and a louder victory?
8. **The line around the sacred.** Saints, the Black Nazarene, and the chapel santos stay set dressing and civilian devotion, never units. Confirm or move that line. Same question, sharper, for the nuno.
9. **Music sources.** A kundiman under the atrium, and kulintang-led eclipse noise under the finale: right spine, or too on-the-nose? The fallback is original melody in the same moods, with kulintang kept as the series texture STORY already names rather than as a narrative device.
