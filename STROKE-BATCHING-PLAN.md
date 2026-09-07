# Stroke Batching Delivery Plan

## 1. Current decision

1. The renderer and consumer routing are implemented on `claude/stroke-batching`. Remaining first-merge work is validation and fixes exposed by that validation; this is no longer an isolated data-structure foundation.
2. Keep batching disabled by default. `?strokeBatches=1` admits finalized Flat strokes (`2d35bcf0-e4d8-452c-97b1-3311be063130`) once their managed material is available. Other strokes retain explicit per-stroke fallbacks.
3. Keep logical stroke entities authoritative, live strokes on individual meshes, and selected batched strokes on temporary private geometry.
4. Keep the runtime allowlist restricted to Flat until its applicable visual, lifecycle and performance gates pass. Static compatibility alone does not justify enabling a brush.
5. This document owns decisions, outstanding work and gates. Attribute/material details belong in [the render contract](docs/stroke-batch-render-contract.md); measurements and artifacts belong in [the validation ledger](docs/stroke-batching-validation.md). Older phase labels in those documents are historical until refreshed.

## 2. Implementation and evidence status

Baseline: merge `1bd04d0`, incorporating `main` at `6b5a889` on 2026-09-07. Results describe that revision, not a permanent guarantee.

| Area | Implementation | Deterministic evidence | Runtime evidence outstanding |
| --- | --- | --- | --- |
| Storage and keys | Subsets, rebased indices, visibility backups, tail reclamation, pools and GUID lookup | Storage and compatibility tests | Capacity and fragmentation under real workloads |
| Flat renderer | Batch entities, uploads, aliases, groups, bounds, managed materials and fallback diagnostics | Geometry/upload tests; build passes | Matched GPU images, calls and culling |
| Loaded-sketch consumers | Reveal, layers, history, erase/picker and cleanup routing | Focused helper/lifecycle tests | Actual system/tool interactions and transition timing |
| Selection | Temporary extraction and translation recommit | Translation and visibility tests | Movement, deselection, save while selected, undo and deletion |
| Authoring and collaboration | Local/remote finalization and persistence routing | Relevant existing tests | Live transfers, asynchronous changes and round trips |
| Broader compatibility | Static classification exists; runtime is Flat-only | Existing audit tests pass | Audit refresh after dependency changes; family-specific evidence |
| Whole branch | Updated from current main | 74 test files passed; 518 tests passed, 4 todo; production build passed | Browser and immersive-XR gates open |

Helper tests do not establish that ECS consumers call those helpers correctly. Record direct system coverage separately.

## 3. Architecture and invariants

1. Retain one `BrushStroke` entity and stable GUID per logical stroke. Keep serialized data, visibility, selection, history and bounds on the existing ownership path. Do not duplicate mutable subset offsets in ECS fields or put batch storage in `Types.Object` fields.
2. `StrokeBatchRenderSystem` owns locations, batch entities, uploads and private geometry disposal. Consumers use its API rather than editing batch meshes. Create batch entities through `world.createTransformEntity` under the appropriate canvas/scene-pose entity.
3. Each visible stroke has exactly one rendering owner: its individual mesh, batch subset or extracted edit mesh. Hidden strokes have none. Transfers must not create gaps, duplicate geometry or reveal flashes.
4. Dispose private geometry separately from library-owned materials/textures. Clearing a sketch releases batch entities, locations, pending work and extraction records while preserving shared resources still in use.
5. Keys separate incompatible attributes, material instances, shader defines, render state and passes. Use authoritative state from the pinned material libraries. Encode stroke-varying values in vertex data only when shader semantics permit it; otherwise split or fall back.
6. Preserve attribute widths/aliases, supplemental attributes, conditional UV removal, index rebasing, draw ranges, groups and conservative bounds. Rebind attributes after storage growth. Clear dirty flags after updating render geometry successfully; that does not itself prove successful GPU rendering.
7. Successfully committed strokes release private geometry. Eraser and picker must retain geometry-level subset intersection behavior, using bounds only where the existing tool contract permits it.
8. Extraction currently follows selection/extraction state, not necessarily drag completion. Deselection recommits accumulated translation. Save/export can force recommit while selection remains active; later reconciliation may extract again. Validate this without duplicate transforms or idle-frame upload churn.
9. Rotation and scaling are not delivered by translation-only extraction. Preserve existing interaction scope; new transform tools require their own vertex, normal and bounds contract.

## 4. Refresh the compatibility audit

1. Revalidate the audit after the merge: shader dependencies, particle inputs, culling and authoritative material state changed. Record application commit, lockfile, asset revision and exact library revisions with each audit and evidence run.
2. The merged pins are `three-icosa` at `25fe4ca1f7e52174e7d9dca90c811e307216ba1f` and `three-tiltloader` at `6c92f0035911e8e61755fec3270beb7604d5dc81`. Read current pins when running validation; do not silently reuse evidence from older dependencies.
3. Recheck keys, per-stroke/batch material creation, supplemental attributes, groups, upgrades and ownership. Invalidate affected audit/visual results when those contracts change; unrelated changes need not invalidate everything.
4. Distinguish statically compatible, runtime eligible and visually validated brushes. Publish eligible counts and categorized fallback reasons.
5. Broaden by actual render contracts: opaque single-pass, textured/cutout, additive, particle/animated, then multi-pass variants. Do not imply a supported alpha-blended brush family. Unsupported templates remain fallback; future alpha-blended support needs an explicit ordering contract.
6. Before enabling particles or animated shaders, establish bounds covering shader displacement and particle extent over time. CPU vertex bounds alone are insufficient. Test frustum edges and immersive views.

## 5. Reproducible evidence protocol

1. Compare batching off/on at the same application/dependency revision with identical assets, camera/scene pose, viewport, pixel ratio, render settings and workload state. Freeze animation time/random inputs where needed. Record browser, GPU, headset and refresh rate.
2. Use `sample1.imm` as the named benchmark. Add generically labelled controlled workloads: Flat-only, mixed compatibility, spatially dispersed, bulk selection, repeated editing and repeated load/clear. Record strokes, vertices, eligible/fallback counts, batches and passes. If a required fixture is missing, ask whether a suitable local resource exists before declaring a blocker.
3. Capture cold loading and first-use compilation separately. For steady state, warm assets/shaders, use a fixed 5-second settling period, then at least three 30-second runs per mode, alternating mode order. Replay identical interaction sequences for event workloads.
4. Record scene calls and stroke-only calls where available, triangles, batch/pass splits, CPU frame-time p50/p95/p99 and missed-frame rate. Record GPU time if supported; browser frame intervals are not GPU execution time. Use consistent XR eye/pass accounting.
5. Record upload bytes/counts per operation, load/reveal latency, selection/deselection stalls, finalization cost and retained geometry/resource counts. Verify upload-counter accounting before presenting requested buffer work as measured driver traffic.
6. Before judging results, put numeric image tolerances and performance budgets in the ledger. Calibrate image tolerance from repeat reference captures. Require no new silhouette, depth, cutout, culling or ordering defect, even if an aggregate image score passes.
7. Require eligible Flat workloads to reduce calls consistently with capacity splits and material passes. Require no repeatable frame-time, event-latency or memory regression beyond recorded baseline variability and agreed budgets. Fewer calls alone do not close the gate.
8. For default-on XR, specify refresh rate and frame budget (13.89 ms at 72 Hz; 11.11 ms at 90 Hz), acceptable missed-frame rate and event-stall limits before testing. Desktop averages do not establish headset performance.
9. Save commands, settings, raw results, matched images and interpretation in the ledger. SwiftShader remains useful for initialization/geometry diagnostics but cannot close GPU fidelity or hardware performance gates.

## 6. Performance investigations

1. Measure bulk append/finalization, reveal and selection transitions first. Individual commit/extraction paths flush batches, so repeated operations can revisit pools or upload growing buffers. If amplification is measured, coalesce work into bounded operation/frame flushes while preserving rendering ownership.
2. Evaluate the current 65,534-vertex cap against upload cost and culling granularity. Use dispersed geometry to measure extra submitted triangles as the camera moves. Add spatial grouping or change capacity only when results justify it.
3. Measure retained capacity after non-tail removal and repeated editing. Distinguish hidden strokes retained for undo from deleted storage. Define reclamation budgets before adding compaction; preserve GUID lookup, hidden index backups and extraction state.
4. Verify idle frames do not repeatedly extract/recommit, allocate visibility results per stroke or flush unchanged batches. Selection summaries still traverse strokes; profile actual ECS cost before a separate query/state-model redesign.
5. Broad selection can restore many individual draw calls and allocate temporary geometry. Measure and document that cost rather than assuming static batching performance during manipulation.

## 7. Lifecycle acceptance cases

1. Load hidden strokes, reveal progressively, hide/show layers, undo/redo visibility and clear/replace the sketch. Inspect transition frames and verify resource counts settle across repeated cycles.
2. Erase and pick batched, fallback and extracted strokes, including thin geometry and hidden subsets. Match reference hit decisions and history behavior.
3. Select across brushes/layers; move, deselect, undo/redo, delete, restore and save while selected. Confirm serialized points, entity transforms and bounds apply each translation exactly once. Check idle selection and repeated saves for churn.
4. Finalize local, mirrored and remote strokes; discard empty strokes; delay managed-material availability and exercise upgrades. Preserve hidden state and exactly one visible representation throughout transfer.
5. Exercise remote visibility/removal/replacement while strokes are selected or pending material resolution. Stale pending work must not recreate deleted strokes or leak geometry.
6. Save/load and export identical edited states in both modes. Compare logical/serialized results as well as images. Verify cleanup and subsequent loading after active extractions.
7. Run relevant cases in a GPU-backed browser and immersive XR, including transformed canvas/scene pose and frustum-edge views. Mark untested cases explicitly instead of inferring them from helper tests.

## 8. Gates

| Gate | Required evidence | Current status |
| --- | --- | --- |
| A: deterministic foundation | Storage/key/upload tests, type check and build | Passed at recorded merge revision |
| B: first default-off merge | Refreshed audit, GPU Flat comparison, measured calls and runtime smoke coverage of already-enabled lifecycle paths | Open |
| C: loaded-sketch readiness | Reveal, layers, history, erase/picker, persistence, cleanup/fallback cases; load and steady-state budgets | Open; routing implemented |
| D: authoring/collaboration readiness | Local/remote transfer, asynchronous material/remote lifecycle cases; interaction budgets | Open; routing implemented |
| E: broader/default-on rollout | Family visual/bounds evidence, selection coverage, browser/XR performance/memory budgets and understood fallback behavior | Open |

1. Gate B permits consideration of an opt-in merge. It does not permit default-on activation or waive tests of paths already enabled by the flag.
2. C and D describe validated capabilities, not separate runtime switches that currently exist. Add separate switches only if staged rollout requires them.
3. Expand the allowlist one documented contract at a time after Flat passes its applicable gates. Retain the per-stroke mode for diagnostics and fallback.
4. Type-check before runtime tests; run focused checks after relevant changes and `npm run check` plus production build before proposing merge. Check for an existing dev server and do not implicitly enable HTTPS during validation.

## 9. Next executable work

1. Refresh the render-contract audit and ledger against merged dependency/asset revisions; identify regressions before changing the allowlist.
2. Prepare controlled Flat and `sample1.imm` comparisons with reproducible settings, verified counters and declared acceptance budgets.
3. Capture GPU Flat fidelity and static draw/culling results, then load/reveal and bulk-selection costs. Fix measured failures and repeat affected checks.
4. Execute lifecycle cases through running systems in browser and XR; record evidence and gaps by gate.
5. Consider the default-off merge when B closes. Continue capability validation and widen support only according to the gates.

## 10. Completed integration and non-goals

1. The two previously reviewed upstream fixes were ported onto `main` and integrated. Old divergence counts and journal-commit instructions are historical, not pending work.
2. Merge `1bd04d0` incorporated subsequent shader/material changes from `main` and corrected the compatible-brush test fixture. The follow-up audit corrected batch-key transparency to match the actual managed descriptor; authoritative fallback state remains separate. See the render contract's revision audit.
3. Removing per-stroke ECS entities, batching live strokes, adding transform tools and supporting every brush are outside the first delivery. Revisit separately after validated rendering and measured costs justify the work.
