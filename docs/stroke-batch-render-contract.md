# Stroke batch render compatibility contract

## 1. Scope

1. This audit covers every brush whose current inventory status is `supported`. The executable source of truth is `auditBrushBatchCompatibility`; its test iterates the complete supported inventory so a newly supported brush cannot silently fall outside the contract.
2. A brush is statically batchable only when it has an eligible generated-geometry shader descriptor. A stroke is runtime-eligible only after that managed shader material has loaded.
3. Brushes marked `fallback` or `unsupported`, missing inventory brushes, and strokes still using the temporary `MeshBasicMaterial` remain on the per-stroke renderer.
4. This contract establishes safe batch keys. It does not yet prove GPU output; that requires the feature-flagged renderer and GPU-backed comparison in Phase 2.

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

Every currently supported inventory brush is covered by exactly one row below. Render state such as blending, transparency, depth write, and sidedness comes from its shader descriptor and remains part of the batch key.

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

1. Transparent and additive brushes are statically compatible by material identity, but ordering across subsets still needs GPU-backed visual validation.
2. Multi-pass brushes are represented in the key and expected-call contract but should enter only after the single-pass renderer is correct.
3. Logical state remains per stroke. Reveal, layers, erasing, and undo/redo route visibility through subset operations; selection temporarily extracts the private mesh and recommits one translation when manipulation ends.
4. Material upgrades must not move a stroke into a batch until the shared managed material exists; the temporary fallback is never a batch material.
