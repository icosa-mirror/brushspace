# Stroke Batching Delivery Plan

## 1. Decision summary

1. Do not merge `claude/stroke-batching` into `main` in its current state. The data structures are isolated and tested, but no production path renders through them.
2. Continue on `claude/stroke-batching` until one feature-flagged, end-to-end static batching path renders real finalized strokes and demonstrates fewer draw calls without changing the default renderer.
3. Keep `BrushStroke` entities as the authoritative identity and editing state during the migration. A finalized batched stroke may have an empty transform entity rather than its own mesh, while `StrokeBatchManager` maps its GUID to a batch subset.
4. Keep the live/in-progress local and remote stroke on its existing individual mesh. Commit its generated arrays into a batch only when the stroke is finalized.
5. Treat unsupported or incompatible brushes as an explicit per-stroke fallback. Partial batching is preferable to breaking brush fidelity.
6. Do not merge the separate `upstream/main` branch into either local branch. Its merge base with `origin/main` is old and the histories have diverged by 235 origin-only commits versus two upstream-only commits. Port the useful commits onto `main` as focused changes, then bring the updated `main` into the batching branch.

## 2. Current state

1. Commit `087fca3` adds `StrokeBatch`, `StrokeBatchPool`, and `StrokeBatchManager`.
2. Commit `81303ef` records the pre-batching render baseline.
3. The core supports subset ranges, index rebasing, index-zeroing hide/show, tail reclamation, pool selection by `BrushBatchKey`, and GUID-to-subset lookup.
4. Twelve unit tests exercise the bookkeeping, including 500 strokes sharing one batch.
5. No application code calls the batching core. There is no `BufferGeometry`, `Mesh`, ECS batch entity, material integration, upload loop, or rendered pixel using it.
6. The current renderer creates one transform entity and one mesh per stroke. `BrushStroke` queries drive save/load, collaboration, layers, selection, undo/redo, erasing, reveal, material upgrades, diagnostics, and export.
7. `LayerCanvasSystem` writes `stroke.object3D.visible`. `SelectionSystem` moves `stroke.object3D.position`. Those behaviors cannot be redirected to a shared mesh by changing only stroke creation.
8. The local branch is two commits behind `origin/claude/stroke-batching`, but those two commits modify only `.claude/journal` artifacts. They contain no batching implementation and should not be promoted to `main` as product changes.

## 3. Success criteria

1. A representative loaded sketch renders through batch meshes with no known brush-fidelity regression relative to the per-stroke path.
2. The in-progress stroke remains responsive and visually unchanged, then transfers to a batch on finalization without a visible gap or duplicate frame.
3. Layer visibility, reveal, undo/redo, erase, selection, save/load, collaboration, and export preserve their current behavior.
4. Draw calls scale primarily with compatible batch keys and required material passes rather than stroke count.
5. Unsupported brushes continue rendering through the existing per-stroke path.
6. The default path remains per-stroke until the batched path passes GPU-backed browser or headset validation.
7. `npx tsc --noEmit` runs before every browser or XR validation, followed by the relevant focused tests and then the full project check before merge.

## 4. Non-goals for the first merge

1. Do not remove `BrushStroke` entities in the first delivery. That would combine a rendering optimization with a wholesale ECS/data-model rewrite.
2. Do not batch the actively drawn stroke.
3. Do not require every brush to be batchable before useful compatible brushes can opt in.
4. Do not treat SwiftShader screenshots as authoritative visual proof. They remain useful for geometry and initialization failures, but final fidelity and performance evidence require a GPU-backed browser or headset.
5. Do not add caches or incremental-update machinery unless measured call frequency or upload volume justifies it. Large sketches and per-frame paths should be measured first.

## 5. Architecture

### 5.1 Authoritative stroke state

1. Retain one `BrushStroke` entity per logical stroke during migration so existing ECS queries remain valid.
2. Keep GUID, brush, color, layer, visibility, selection, bounds, command index, control points, and serialized stroke data on the existing entity/component path.
3. Add a tag component such as `BatchedBrushStroke` only when useful for queries. Do not put `StrokeBatch`, `BatchSubset`, materials, or typed-array storage into `Types.Object` component fields.
4. Use `BrushStroke.guid` as the stable lookup key into `StrokeBatchManager`. Avoid duplicating mutable subset offsets into ECS fields because tail removal or future compaction can invalidate them.
5. After commit, replace the individual stroke mesh with an empty transform object or otherwise detach and dispose only its private geometry. Preserve the entity transform and `openBrushStrokeData` ownership until selection semantics have migrated.

### 5.2 Batch render ownership

1. Introduce a `StrokeBatchRenderSystem` as the owner of the manager, batch-mesh entities, geometry uploads, and GPU-resource cleanup.
2. Create each batch mesh through `world.createTransformEntity(mesh, scenePoseEntity)` so it participates in the ECS/level lifecycle and remains in canvas space.
3. Give each rendered batch an ECS tag/component containing stable scalar identity only, such as a batch ID and serialized key. Let the render system retain the data-layer association between that ID and `StrokeBatch`.
4. Expose a narrow public API for other systems: `commitStroke`, `setStrokeVisible`, `removeStroke`, `translateStroke` or `rewriteStroke`, `getLocation`, and `clear`.
5. Do not let consumers manipulate batch `Mesh` or `BufferGeometry` instances directly.
6. Treat material ownership separately from geometry ownership. If brush materials are shared or library-owned, destroy the batch entity and dispose its private geometry without disposing the shared material.

### 5.3 Batchability contract

1. Replace the assumption that `BrushBatchKey` is complete with a documented, tested contract derived from the real render path.
2. Audit every supported brush/material pass for geometry family, attribute widths, supplemental attributes, shader defines, textures, material instance identity, blending, depth state, culling, render order, material groups, and uniforms.
3. Classify values that vary per stroke:
   1. Add discrete render-state or material variants to the batch key.
   2. Encode continuous per-stroke values as per-vertex attributes when shader semantics allow it.
   3. Bake compatible transforms into vertices when geometry is committed in canvas space.
   4. Use the per-stroke fallback when a value cannot be represented safely in one shared draw.
4. Confirm whether color and all other stroke-varying values are already vertex data. A per-object uniform does not automatically prohibit batching, but it must be split, encoded, or declared incompatible.
5. Include multi-pass behavior in expected draw-call counts. One batch mesh with two material passes legitimately produces two draw calls.

### 5.4 Geometry upload contract

1. Build standard `position`, `normal`, `tangent`, `color`, `uv`, optional `uv1`, and index attributes from the active ranges in `StrokeBatch`.
2. Apply `applyBrushShaderAttributeAliases` and `applyBrushShaderSupplementalAttributes` at batch scale.
3. Reproduce the current conditional `uv1` and `a_texcoord1` removal behavior exactly.
4. Apply `setDrawRange(0, batch.indexCount)` and `applyBrushRenderGroups` for the batch material/pass layout.
5. When `vertexDataDirty` is set, replace or update every changed vertex attribute and the index buffer, then update the draw range and bounds.
6. When only `topologyDirty` is set, update the live index range without rebuilding vertex attributes.
7. Recreate a `BufferAttribute` when the backing typed array grows; otherwise mark the existing attribute update range and `needsUpdate` appropriately.
8. Compute aggregate bounds from active subset bounds. Recompute after hide, show, remove, rewrite, or translation so frustum culling cannot hide visible subsets or retain enormous stale bounds.
9. Clear dirty flags only after all corresponding GPU-side objects have been updated successfully.

## 6. Delivery phases

### 6.1 Phase 0: integrate unrelated upstream fixes correctly

1. Port `df26bda` onto `main` first. It removes the shipped `TipAnchorTuningSystem`, which currently competes with the A-button undo binding. Preserve the tuned constants and remove only the debug import, registration, file, and stale comment references.
2. Port `66c5d4d` onto `main` as a reviewed adaptation rather than blindly merging `upstream/main`. The network preflight and join-timeout behavior are unrelated to batching and belong in the shared product baseline.
3. Revalidate the network probe against the current `CollabSystem`, current PeerJS configuration, and current join-panel layout. Keep the probe advisory; it must never block hosting or joining.
4. Run the network-probe unit tests, collaboration tests, UI compilation/build, type check, and relevant runtime checks on `main`.
5. After those changes are accepted on `main`, merge or rebase the batching branch onto the updated `main` according to the repository's chosen branch policy. Do not land the upstream fixes only on the batching branch.
6. Fast-forward the local batching branch over the two origin journal commits only if preserving that shared branch history is desired. They do not affect the technical plan or product integration order.

### 6.2 Phase 1: shader and material audit

1. Produce a checked-in compatibility table covering every currently supported brush, its passes, required attributes, relevant uniforms, and the resulting batchability decision.
2. Compare `createBrushMaterialSpec`, `createBrushRenderMaterial`, `applyBrushRenderGroups`, shader-library material ownership, supplemental attributes, and material-upgrade behavior.
3. Add unit tests proving `BrushBatchKey` changes whenever two strokes cannot safely share a material/draw.
4. Define an explicit fallback reason for incompatible brushes and expose it to diagnostics.
5. Treat completion of this audit as the gate for stabilizing the existing `StrokeBatchManager` API.

### 6.3 Phase 2: static renderer vertical slice

1. Add a disabled-by-default runtime switch such as `?strokeBatches=1` or a development configuration flag.
2. Start with loaded, finalized strokes using one known opaque, single-pass brush.
3. Create one batch entity and mesh, upload its arrays, apply aliases/supplemental attributes/groups, and render it under the scene-pose entity.
4. Keep the original per-stroke meshes available as the reference path, but ensure only one path is visible at a time.
5. Add geometry-level equivalence tests comparing concatenated per-stroke arrays with the batch attributes, rebased indices, draw range, groups, and aggregate bounds.
6. Record `renderer.info.render.calls`, triangles, active batch count, compatible/fallback stroke counts, and upload bytes or counts.
7. Validate at least one real brush through a GPU-backed browser or headset. The first merge threshold is a real rendered batch with a measurable draw-call reduction, not bookkeeping tests alone.

### 6.4 Phase 3: loaded-sketch visibility and lifecycle

1. Route staggered load reveal through `setStrokeVisible(guid, visible)` for batched strokes while retaining the existing entity fields as authoritative state.
2. Adapt layer visibility, undo/redo, and deletion to call the render-system API after changing `BrushStroke` state.
3. Replace per-frame direct writes to `stroke.object3D.visible` with state-change-driven batch operations where practical. Preserve current behavior before attempting broader optimization.
4. Ensure clearing or replacing a sketch releases private batch geometries, batch entities, manager locations, and dead pools without disposing shared brush materials.
5. Verify save/load and collaboration snapshots still enumerate `BrushStroke` entities and serialize the same `StrokeData`.

### 6.5 Phase 4: eraser and selection

1. Keep eraser hit testing against per-stroke ECS bounds initially. On erase, redirect visual removal to the subset, then update the existing logical state/history.
2. Preserve eraser preview semantics with temporary subset visibility changes only if the current tool requires them.
3. Selection is the higher-risk consumer because it currently moves each stroke Object3D. Choose and test one canvas-space strategy:
   1. Translate the subset's position data in place and update its bounds.
   2. Regenerate and recommit the moved stroke from authoritative control points.
   3. Temporarily extract selected strokes to individual meshes and recommit them when the manipulation ends.
4. Prefer extraction during manipulation if it keeps interactive movement cheap and avoids re-uploading a large batch every frame. Recommit once at the end of the gesture.
5. Add regression tests for selecting mixed brushes/layers, moving selections, undoing the move, deleting selected strokes, and restoring visibility.

### 6.6 Phase 5: authoring and collaboration finalization

1. Leave the active local stroke on its current dynamic mesh and `DynamicDrawUsage` path.
2. On successful finalization, commit its final `BrushGeometryArrays` to the batch renderer, then remove its private mesh geometry without disposing shared material resources.
3. Keep empty or discarded strokes out of the manager.
4. Apply the same transition to finalized remote strokes. Keep remote in-progress strokes on individual meshes until their final message arrives.
5. Handle material-upgrade events by updating or rebuilding affected batch materials/pools without duplicating stroke geometry or losing visibility state.
6. Verify there is no frame with both the individual mesh and batch subset visible, and no frame where both are absent during finalization.

### 6.7 Phase 6: broaden compatibility and retire the default path

1. Add brush families in increasing complexity: opaque single-pass, textured/cutout, transparent/additive, particle/animated, and multi-pass brushes.
2. Keep an explicit compatibility allowlist until each family has visual evidence.
3. Make batching the default only after representative sketches pass browser and XR validation and fallback coverage is understood.
4. Retain the per-stroke renderer as a diagnostic/fallback mode until the batch path has survived normal authoring, collaboration, selection, and load/save use.
5. Reconsider replacing per-stroke ECS entities with plain stroke records only as a separate project after rendering is stable. Measure entity-capacity and ECS-iteration costs first.

## 7. Test and evidence matrix

1. Run `npx tsc --noEmit` before any runtime test.
2. Run focused unit tests for batch storage, key compatibility, renderer upload behavior, bounds, visibility, removal, and translation/extraction.
3. Run the existing brush geometry, shader material, render group, visual conformance, import/export, collaboration, layer, selection, undo/redo, and sketch-library tests affected by each phase.
4. Run the full `npm run check` before proposing merge.
5. Compare per-stroke and batched geometry deterministically before relying on screenshots.
6. Capture matched GPU-backed images for representative opaque, cutout, transparent, particle, and multi-pass brushes.
7. Test both browser and immersive XR because material compilation, frame budget, and controller-driven lifecycle differ.
8. Use the saved “The Upside Down” baseline for the scale test and record before/after draw calls, frame time, triangles, batch count, and fallback count.
9. Treat the target as a reduction from approximately one call per stroke to approximately one call per compatible batch material/pass. Do not claim a specific final count until the shader audit establishes the required key/pass splits.

## 8. Merge gates

1. Gate A, foundation only: current state; do not merge to `main` yet.
2. Gate B, first acceptable merge: completed compatibility audit, one real feature-flagged rendered batch, deterministic geometry tests, GPU-backed visual evidence for the chosen brush, and measured draw-call reduction.
3. Gate C, enable for loaded sketches: reveal, layers, undo/redo, erase, save/load, cleanup, and fallback paths pass.
4. Gate D, enable for authored/collaborative strokes: local and remote finalization transfer cleanly into batches.
5. Gate E, default-on: representative brush families, selection manipulation, browser/XR evidence, and performance measurements pass with no known fidelity regression.

## 9. Immediate next work

1. Integrate the two useful `upstream/main` changes through `main`, not directly through this branch.
2. Bring the resulting `main` baseline into `claude/stroke-batching` without dropping the batching commits.
3. Perform the batchability audit and turn its findings into `BrushBatchKey` and fallback tests.
4. Implement the one-brush static renderer behind a disabled-by-default flag.
5. Stop and reassess the core API if the audit discovers per-stroke state that cannot be split, encoded, baked, or safely routed through fallback.
