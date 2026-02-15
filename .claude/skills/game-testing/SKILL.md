---
name: game-testing
description: Use this skill to test the BatoMan game running in the browser using Playwright MCP. Use when asked to verify gameplay, check for visual bugs, test controls, or validate that a feature works correctly in the browser.
---

# BatoMan Game Testing — Playwright MCP

## Prerequisites

The Playwright MCP server must be installed globally:
```bash
claude mcp add playwright -s user -- npx -y @playwright/mcp@latest
```

The game dev server must be running before testing:
```bash
npm run dev   # starts at http://localhost:5173
```

## Testing Workflow

### 1. Launch and verify game loads
```
- Navigate to http://localhost:5173
- Wait for the Phaser canvas to appear
- Take a screenshot to verify initial state
```

### 2. Test player movement
```
- Press ArrowRight / D — player should move right and play run animation
- Press ArrowLeft / A — player should move left (sprite flips)
- Press ArrowUp / W / Space — player should jump
- Release jump early — player should fall faster (variable jump height)
- Walk off platform edge — coyote time should allow jump for ~100ms
```

### 3. Test plasma buster
```
- Press and release Z quickly — fires a plasma burst projectile
- Hold Z for 800ms+ then release — fires a nova blast (larger, slower)
- Verify projectiles travel horizontally in the direction player faces
- Verify projectiles destroy on contact with walls/enemies
```

### 4. Test scene transitions
```
- On MenuScene: press Start / Enter — should transition to GameScene
- On death: should show game over state
- Verify UIScene HUD (health, score) appears over GameScene
```

## Playwright MCP Patterns

### Navigate to game
```
Use playwright to navigate to http://localhost:5173 and wait for network idle
```

### Take a screenshot for visual verification
```
Use playwright to take a screenshot
```

### Simulate keyboard input
```
Use playwright to press ArrowRight
Use playwright to hold ArrowRight for 2 seconds
Use playwright to press KeyZ  (fire)
```

### Check browser console for errors
```
Use playwright to get browser console logs and check for Phaser errors
```

### Check canvas is rendering
```
Use playwright to check that a canvas element exists on the page
Use playwright to verify the canvas has non-zero dimensions
```

## Common Issues to Check

| Symptom | Likely Cause |
|---------|-------------|
| Black screen | Asset failed to load — check network tab / console |
| Player falls through floor | Collider not set or tilemap collision property missing |
| Player floats | Gravity not set in gameConfig or body not enabled |
| Animations not playing | Wrong frame range or animation key mismatch |
| Camera not following | `startFollow` not called or bounds not set |
| HUD not visible | UIScene not launched as parallel scene |
| Plasma burst fires backward | `flipX` not applied to projectile velocity |

## Reporting Results

After each test session, report:
1. What was tested
2. Any visual screenshots captured
3. Console errors found
4. Pass/fail for each feature tested
5. Suggested fixes for any failures
