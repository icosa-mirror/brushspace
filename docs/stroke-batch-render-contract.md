# Stroke batch render compatibility contract

## 1. Scope

1. This audit covers every brush whose current inventory status is `supported`. The executable source of truth is `auditBrushBatchCompatibility`; its test iterates the complete supported inventory so a newly supported brush cannot silently fall outside the contract.
2. A brush is statically batchable only when it has an eligible generated-geometry shader descriptor. A stroke is runtime-eligible only after that managed shader material has loaded.
3. Brushes marked `fallback` or `unsupported`, missing inventory brushes, and strokes still using the temporary `MeshBasicMaterial` remain on the per-stroke renderer.
4. This contract classifies static batch compatibility. It does not prove GPU output or shader-displacement bounds; those require the delivery plan's runtime gates.

### Revision audit: 2026-09-07

1. Reviewed the implementation after merge `1bd04d0`: `three-icosa` revision `25fe4ca1f7e52174e7d9dca90c811e307216ba1f`, `three-tiltloader` revision `6c92f0035911e8e61755fec3270beb7604d5dc81`, and asset submodule `df593c972751f7f28bc8d47bc4f4fd8cfad45fe5`.
2. Lockfile SHA-256: `DA798AE6AAD2632C6BFF94089DE586E6FD3AB66E01283E32716C622C833FA1A7`.
3. Managed shaders still obtain transparency, depth write and sidedness from `createBrushShaderMaterialDescriptor`. Temporary fallback materials obtain authoritative render state through `createBrushMaterialSpec`. These are not interchangeable: CoarseBristles, for example, has different transparency flags between the two paths.
4. Batch keys now retain the managed descriptor's transparency when a managed shader is eligible, using the material spec for fallback state. An inventory-wide regression test checks that managed keys agree with the audit. This corrects the merge's use of fallback transparency for both paths.
5. Descriptor eligibility, key agreement and geometry-upload tests pass. This is not a fresh shader-by-shader GPU audit. Managed/fallback upgrade fidelity, particle bounds, runtime lifecycle and measured performance remain open.

## 2. State ownership

| State | Scope | Batch treatment |
| --- | --- | --- |
| Manifest floats, vectors, colors, and textures | Brush GUID | Shared through the `BrushShaderLibrary` managed material |
| Time and scene-light holders | Frame | Shared by managed materials and updated centrally |
| Stroke color and opacity | Vertex | Already baked into generated vertex color/alpha |
| Position, normal, tangent, UV, UV1, and indices | Vertex/subset | Concatenated into `StrokeBatch` storage |
| Temporary fallback opacity and render state | Stroke material instance | Not shared; the stroke remains per-stroke |
| Stroke transform while authoring or editing | Stroke | Not part of the first static renderer slice |

## 3. Supported-brush matrix

Every currently supported inventory brush is covered by exactly one row below. For managed materials, render state comes from the shader descriptor. Transparency is explicit in the key; other fixed per-brush state is separated by brush/material identity. Mutable material variants would require additional key fields. The runtime uses this contract directly; there is no per-brush allowlist or transparency-order eligibility gate.

### Upstream batching audit: 2026-09-07

1. Open Brush's `BatchManager.GetPool` groups by brush GUID within its canvas; `GetBatch` appends subsets until vertex capacity is exhausted. It does not disqualify brushes by transparency sorting. Brushspace separates layers in its key because layers share one scene-pose parent here.
2. Open Brush's `Batch.Create` assigns the brush material and optional overlay. Brushspace uses the same managed shader/material factory and multi-pass render groups for batched and per-stroke rendering. Blend/depth state is reproduced, not used as a speculative exclusion.
3. The exported catalog's only alpha-blend entry is an unsupported transparent material template. Supported brushes use opaque, cutout, or additive contracts. A regression test guards against accidentally introducing alpha-sorted rendering into that supported catalog.
4. The previous Flat-only runtime gate was a local validation restriction, not an upstream requirement. It is removed. Missing geometry/shader support remains an explicit fallback; pending shaders are retried when material loading completes. Batching is enabled by default; use `?strokeBatches=0` or `?strokeBatches=false` to opt out.

| Population | Pass contract | Draw calls per batch | Supplemental attributes | Decision |
| --- | --- | ---: | --- | --- |
| All supported brushes except the named exceptions below | Single | 1 | Standard aliases only | Batchable after managed material load |
| Electricity (`f6e85de3-6dcc-4e7f-87fd-cee8c3d25d51`) | Electricity | 3 | Standard aliases only | Batchable after managed material load; preserve three render groups/material passes |
| Toon (`4391385a-df73-4396-9e33-31e4e4930b27`) | Toon | 2 | Standard aliases only | Batchable after managed material load; preserve two render groups/material passes |
| TubeToonInverted (`9871385a-df73-4396-9e33-31e4e4930b27`) | Tube Toon Inverted | 2 | Standard aliases only | Batchable after managed material load; preserve two render groups/material passes |
| LeakyPen (`ddda8745-4bb5-ac54-88b6-d1480370583e`) | Single | 1 | Reuse `a_texcoord0` as `a_texcoord1` | Batchable after managed material load |
| DanceFloor (`6a1cf9f9-032c-45ec-311e-a6680bee32e9`) | Single | 1 | Copy `uv1.w` into `a_timestamp` | Batchable after managed material load |

## 4. Batch-key requirements

1. Two strokes may share a batch only when brush GUID, geometry family, material family, blending, transparency, render-pass contract, and supplemental-attribute contract match.
2. Managed shader batches use the normalized brush GUID as their material instance key because `BrushShaderLibrary` caches one material per brush GUID.
3. A per-stroke fallback uses the stroke GUID as its material instance key. This intentionally prevents fallback strokes from grouping even if their other fields match.
4. Multi-pass brushes retain one batch geometry but count the required material passes when measuring draw-call reduction.
5. Batch geometry upload must reproduce attribute aliases, supplemental attributes, conditional UV1 removal, draw range, render groups, and aggregate bounds before clearing dirty flags.

## 5. First renderer slice

1. Use Flat (`2d35bcf0-e4d8-452c-97b1-3311be063130`) for the initial disabled-by-default vertical slice.
2. Flat is opaque, single-pass, double-sided, and requires no brush-specific supplemental attribute. It isolates batch geometry upload and material sharing from transparency ordering and multi-pass behavior.
3. Keep the per-stroke mesh until the managed Flat material is loaded and the batch upload completes. Switch visibility so the reference and batch paths are never visible simultaneously.
4. Record renderer calls, triangles, average/max frame time, active batches, compatible strokes, fallback strokes, categorized fallback reasons, and uploaded bytes for the same loaded sketch in both modes. The system publishes these counters even when batching is disabled so the reference path uses the same instrumentation.
5. The slice is enabled with `?strokeBatches=1`. Runtime counters and categorized fallback reasons are published through the `data-stroke-batch-*` fields on the document root for browser validation.

## 6. Deferred risks

1. Cutout and additive contracts require GPU validation before runtime admission. Do not infer a supported alpha-blended family from a transparent queue flag; unsupported templates remain fallback.
2. Multi-pass brushes are represented in the key and expected-call contract but should enter only after the single-pass renderer is correct.
3. Logical state remains per stroke. Reveal, layers, erasing, and undo/redo route visibility through subsets. Selection extracts private geometry and recommits on deselection or an explicit save/export flush, not necessarily at drag end. Saving while selected and subsequent re-extraction need runtime validation.
4. Material upgrades must not move a stroke into a batch until the shared managed material exists; the temporary fallback is never a batch material.
