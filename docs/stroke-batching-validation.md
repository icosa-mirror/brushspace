# Stroke batching validation ledger

## Revision checkpoint: 2026-09-07

1. Dependency/asset revisions and lockfile fingerprint are recorded in the render contract's revision audit. The review found and corrected a managed-versus-fallback batch-key transparency mismatch introduced during the merge.
2. `npm run check` passes: 74 test files, 519 tests passed, 4 todo. The new inventory-wide test checks managed batch keys against their actual descriptor-derived render state. Existing upload tests remain green.
3. This checkpoint establishes deterministic contract agreement only. It does not close GPU fidelity, material-upgrade, animated-bounds, browser interaction or XR performance gates. Historical results below retain their original scope.

### Runtime environment preflight: 2026-09-07

1. A fresh visible Chrome instance launched through Playwright with its temporary automation profile, without SwiftShader arguments, successfully created WebGL2. `WEBGL_debug_renderer_info` reported `ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 (0x00002684) Direct3D11 vs_5_0 ps_5_0, D3D11)`.
2. This is a hardware-availability check, not a rendered batching comparison. The existing `browser-material-smoke.mjs` explicitly forces SwiftShader and must not be used unchanged as hardware performance evidence.
3. Type checking passed before starting the CLI-managed HTTP runtime. No certificate setup was needed. Controlled Flat comparison, benchmark input location and matched capture settings are still pending; no runtime gate is closed by this preflight.

## 1. Current scope

### Save snapshot and reconstructed geometry: 2026-09-07

1. The browser driver now invokes `SketchLibrarySystem.collectVisibleStrokeData()` while selected, encodes/decodes a `.tilt` document, then spawns the decoded stroke through the production authoring path. This covers the snapshot used by save/collaboration and reconstructed geometry, but not the IndexedDB save UI or gallery load transition.
2. It exposed a reference-path defect: private stroke meshes retained movement only in their Object3D transform, while snapshots saved the original points. Snapshot collection now clones/translates those private stroke records. Batched records are already baked by extraction flushing and are not translated twice. Repeated private snapshots leave live data unchanged.
3. Both modes preserve the 0.10 + 0.05 movement in the snapshot, decoded points and regenerated bounds (within float tolerances). Existing visibility, extraction, idle-upload and bulk-scope checks pass. Evidence: [batched persistence](evidence/stroke-batching/flat-2026-09-07/batched-persistence.json), [reference persistence](evidence/stroke-batching/flat-2026-09-07/reference-persistence.json).
4. Full checks pass: 520 tests, 4 todo. Actual history commands, interactive save/load UI, remote synchronization and XR remain outstanding.

### Coalesced bulk commits: 2026-09-07

1. `withDeferredUploads` now groups synchronous loaded-sketch creation and pending-material commits. Nested scopes defer until the outermost boundary; a `finally` block flushes completed changes if the operation throws. Individual operations outside a scope retain immediate uploads. The scope must not span asynchronous work or rendering.
2. The identical 200-stroke workload requests 326,400 bytes initially, down from 32,803,200 (100.5-fold). These are requested upload bytes, not GPU timing or driver traffic measurements. The runner enforces a one-final-batch request ceiling for this fixed fixture.
3. Hardware smoke/lifecycle checks pass, including no flush inside a nested scope and flushing on intentional interruption. Calls remain 207 versus 8 with equal triangle counts; full-page captures retain only the small reference variability already observed. The full check passes (519 tests) and production build passes.
4. Evidence: [coalesced lifecycle](evidence/stroke-batching/flat-2026-09-07/bulk-lifecycle.json), [coalesced metrics](evidence/stroke-batching/flat-2026-09-07/bulk-results.json). Broad selection, reveal timing, real sketch loading and sustained frame-time effects still require separate measurements.

### Running-system lifecycle check: 2026-09-07

1. The hardware smoke runner now drives one fixture stroke through logical hide/show, selection, private-mesh translation, deselection, explicit `finishAllExtractions()` and subsequent selection reconciliation. It observes component state, private geometry, first-subset indices, serialized control points and the current upload counter directly. This tests running ECS/renderer integration; it does not simulate controller gestures or exercise actual file export/history commands.
2. Both renderer modes complete without page errors. In batching mode the hidden/selected subset indices are zeroed, shown/deselected indices are restored, extraction creates 24 private vertices, and recommit releases them. Translations of 0.10 then 0.05 are serialized exactly once across deselection and save-style flushing. Selected idle frames and idle frames after save request no additional uploads.
3. Observations: [batched lifecycle](evidence/stroke-batching/flat-2026-09-07/batched-lifecycle.json), [reference lifecycle](evidence/stroke-batching/flat-2026-09-07/reference-lifecycle.json). The pre-interaction image comparison again has zero changed RGB channels and scene calls remain 207 versus 8.
4. Initial batching upload requests total 32,803,200 bytes for 200 strokes; the final full vertex/index update is 326,400 bytes. This roughly 100-fold request amplification justifies investigating deferred bulk commits. These counters describe requested buffer work, not measured GPU driver transfers; no frame-time conclusion follows from them alone.
5. Still open: actual undo/redo and persistence round trips, eraser/picker tools, local/remote transfer timing, startup gaps, broad selection, XR and sustained performance budgets. These focused successes do not close the entire lifecycle gate.

### Controlled Flat GPU reproduction: 2026-09-07

Follow-up: after explicitly awaiting the full shader-ready event before the settling interval, two further runs displayed all strokes. The first matched reference and batch images byte-for-byte at decoded RGB level. The second differed in 126 pixels (378 channels), but its batched image was identical to the first reference; the same difference occurred between the two reference captures. Thus the observed repeat difference is reference-run variability, not demonstrated batching error. The earlier blank capture is not explained conclusively and remains a startup/transfer investigation; do not claim a geometry fix from these results.

1. Captures and raw metrics: [reference](evidence/stroke-batching/flat-2026-09-07/reference.png), [batched](evidence/stroke-batching/flat-2026-09-07/batched.png), [first results](evidence/stroke-batching/flat-2026-09-07/results.json), [repeat reference](evidence/stroke-batching/flat-2026-09-07/repeat-reference.png), [repeat results](evidence/stroke-batching/flat-2026-09-07/repeat-results.json).
2. Both runs: 207 reference calls versus 8 batched calls, 13,374 triangles, 200 batched strokes in one batch. First comparison: 138,878 blue pixels in each image, zero changed RGB channels. Repeat: 138,910 reference blue pixels versus 138,878 batched, RMS 2.067 on the full page, matching the measured reference-to-reference variation.
3. These observations establish a successful steady-state Flat GPU comparison on this camera/workload. They do not establish startup atomicity, general culling, lifecycle behavior, XR behavior or multi-run frame-time budgets. Gate B remains open for its remaining requirements.

Initial findings, retained for traceability:

1. Development URL: `?batch-validation=flat&strokeBatches=0` or `1`. It loads 200 deterministic Flat strokes through `spawnStrokeFromData`, hides the intro sketch and fixes the camera. Run against an existing HTTP development server with `node scripts/browser-batching-smoke.mjs http://localhost:8081/ .iwsdk/batching-smoke`.
2. The runner owns a fresh temporary visible Chrome profile and rejects software rendering. It saves screenshots, metrics and diagnostics locally. Its blue-pixel coverage check detects gross missing geometry; it is not the planned calibrated fidelity comparison or multi-run performance benchmark.
3. Initial browser execution exposed an unregistered `ExtractedBatchedBrushStroke` check that crashed selection even with batching disabled. Registering that component during batch-renderer initialization removed the observed page error in both modes.
4. RTX 4090 results: reference 207 scene calls; batching 8 calls, one batch and 200 compatible strokes. Both report 13,374 triangles. However, inspection of matched captures found the blue strokes absent in batching mode. This is a failed visual result, not a successful optimization gate. CPU-side batch positions, aliases and indices are populated; the render failure still requires diagnosis.
5. Local captures are diagnostic artifacts under `.iwsdk/batching-smoke`; they are not checked-in conformance evidence. Do not close Gate B until missing geometry is fixed and the reproducible visual test passes.

1. Branch: `claude/stroke-batching`.
2. Runtime switch: `?strokeBatches=1`; batching remains disabled by default.
3. Runtime allowlist: Flat (`2d35bcf0-e4d8-452c-97b1-3311be063130`) only.
4. Reference renderer: the unchanged per-stroke path when the switch is absent.

## 2. Deterministic evidence

1. `npx tsc --noEmit` passes.
2. `npm run check` passes: 75 test files, 561 passing tests, and 4 pre-existing TODO tests.
3. `npm run build` passes with 2,245 transformed modules.
4. Batch storage tests cover subset ranges, index rebasing, visibility index backup/restore, middle and tail removal, translation, bounds, pool splitting, and the 500-stroke collapse case.
5. Geometry upload tests cover standard/shader attributes, supplemental attributes, UV channel removal, draw ranges, active bounds, storage growth, topology-only visibility updates, hidden-subset extraction, local-origin correction, and multi-pass render groups.
6. Editing lifecycle tests cover mixed brushes and layers, selection move/undo, selected deletion, and visibility restoration.
7. The feature-flagged renderer routes loaded, authored, mirrored, and remote-finalized Flat strokes through one batch API while preserving per-stroke logical entities and explicit fallback behavior.
8. Review regression coverage verifies width-three and width-four UV1 sources, hidden-state preservation across recommit, initial and layer-composed visibility transitions, and precise active/hidden subset hit testing with batch transforms.

## 3. Runtime instrumentation

1. The document root publishes batching mode, active batch count, compatible/fallback stroke counts, categorized fallback reasons, cumulative upload bytes, renderer calls, triangles, and average/max frame time.
2. The same draw, triangle, and frame-time counters update with batching disabled so a reference run and batching run use identical instrumentation.
3. Successful batch commits dispose private stroke geometry. Selection recreates one private subset mesh on demand and disposes it after recommit.
4. Eraser and picker geometry tests route through the logical batch subset after private geometry disposal. Layer visibility changes are state-driven and coalesced into at most one batch upload per layer-system update.

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
