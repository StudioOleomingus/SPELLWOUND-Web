# Spellwound

A crossword played by sliding letter-trains, not typing. Drag a train's head
or tail (the blocks with a triangular notch) to pull the whole chain, snake-
style, one cell at a time — pull only, never push. Park every train so the
crossword reads correctly across and down.

## Structure

```
packages/core     pure rules engine + shared types, share codec, word
                  detection, BFS solvability checker (fully unit-tested)
packages/board    shared Canvas renderer + pull-gesture input module
packages/player   the game: menus, level select, progression, mobile layout
packages/editor   the level maker: paint slots, draw trains, place hints,
                  clues, validation, solver check, test play, export/share
levels/           bundled puzzles as JSON, validated against the core schema
```

## Commands (from the repo root)

```
npm install          # once
npm run dev          # play  -> printed localhost URL
npm run dev:editor   # edit  -> printed localhost URL
npm test             # core engine unit tests (vitest)
npm run build        # production builds -> packages/{player,editor}/dist
```

Both `dist/index.html` files also open directly from disk (double-click).

## Puzzle JSON

See `packages/core/src/types.ts` (`Puzzle`) and `packages/core/src/validate.ts`
for the schema and its rules. Key ideas:

- `playCells` are the crossword slots with their solution letters.
- `trains` are ordered head→tail: `letters` + `start` cells.
- `hints` are the colored corner triangles (head = top-left, tail =
  bottom-right), listed in ADD/REMOVE reveal order.
- Movement track: trains may only occupy play cells, their own starting
  footprints, and optional `trackCells` corridors — the rest of the grid is
  scenery. Vacated track cells render as gray dotted squares.
- Win = every play cell covered by a block carrying its solution letter.
  A head/tail that rests on its hint cell "docks": its notch fills in.

## Sharing (zero-backend)

The editor's SHARE button gzips the puzzle JSON into a URL-safe code; the
player loads any puzzle from `index.html#p=<code>`. EXPORT/IMPORT moves raw
JSON. A hosted backend with short codes and a community browse page can
replace the codec later without touching the format (`core/src/share.ts`).

## Progress & levels

Player progress (unlocked levels, best move counts, resume point) persists in
localStorage. Bundled levels: three COLD/CUT tutorials, then STAR/SUN and
MOON/MAT. Add levels by dropping a JSON into `levels/` and listing it in
`packages/player/src/levels.ts` — tests in `packages/core/test/levels.test.ts`
prove every bundled level solvable (scripted walkthrough + BFS solver).

## Roadmap

Phase 6 remains: animation/easing pass, sound (Howler), haptics, color-blind
palette audit, art direction. Plus optional: hosted sharing backend with
browse/moderation, and Playwright end-to-end tests.
