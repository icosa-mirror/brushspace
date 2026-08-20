# Stroke batching validation ledger

## 1. Current scope

1. Branch: `claude/stroke-batching`.
2. Runtime switch: `?strokeBatches=1`; batching remains disabled by default.
3. Runtime allowlist: Flat (`2d35bcf0-e4d8-452c-97b1-3311be063130`) only.
4. Reference renderer: the unchanged per-stroke path when the switch is absent.

## 2. Deterministic evidence

1. `npx tsc --noEmit` passes.
2. `npm run check` passes: 75 test files, 553 passing tests, and 4 pre-existing TODO tests.
3. `npm run build` passes with 2,245 transformed modules.
4. Batch storage tests cover subset ranges, index rebasing, visibility index backup/restore, middle and tail removal, translation, bounds, pool splitting, and the 500-stroke collapse case.
5. Geometry upload tests cover standard/shader attributes, supplemental attributes, UV channel removal, draw ranges, active bounds, storage growth, topology-only visibility updates, hidden-subset extraction, local-origin correction, and multi-pass render groups.
6. Editing lifecycle tests cover mixed brushes and layers, selection move/undo, selected deletion, and visibility restoration.
7. The feature-flagged renderer routes loaded, authored, mirrored, and remote-finalized Flat strokes through one batch API while preserving per-stroke logical entities and explicit fallback behavior.

## 3. Runtime instrumentation

1. The document root publishes batching mode, active batch count, compatible/fallback stroke counts, categorized fallback reasons, cumulative upload bytes, renderer calls, triangles, and average/max frame time.
2. The same draw, triangle, and frame-time counters update with batching disabled so a reference run and batching run use identical instrumentation.
3. Successful batch commits dispose private stroke geometry. Selection recreates one private subset mesh on demand and disposes it after recommit.

## 4. Evidence not yet recorded

1. A GPU-backed matched image for Flat versus the per-stroke renderer.
2. Measured draw-call reduction for the same loaded sketch in both modes.
3. Browser interaction checks for reveal, layers, undo/redo, erase, selection, save/load, and local/remote finalization.
4. Immersive-XR interaction and frame-budget evidence.
5. Representative cutout, transparent/additive, particle/animated, and multi-pass brush images.
6. “The Upside Down” before/after calls, frame time, triangles, batch count, and fallback count.

## 5. Gate status

1. Gate A (foundation): passed by deterministic tests, but this is not a merge recommendation by itself.
2. Gate B (first feature-flagged merge): open because GPU-backed Flat fidelity and draw-call evidence are missing.
3. Gate C (loaded-sketch enablement): implementation and deterministic coverage are present; runtime interaction evidence is missing.
4. Gate D (authored/collaborative strokes): implementation is present; runtime transfer evidence is missing.
5. Gate E (default-on): open. The allowlist must not widen and batching must not become default until the required family, browser, XR, and performance evidence exists.
