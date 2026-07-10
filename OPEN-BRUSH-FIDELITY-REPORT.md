# Open Brush brush fidelity review

Date: 2026-07-10  
Brushspace: `367594ac4c21ce23c78a388986d8a7194ad3fa74`  
Open Brush: [`4786d55ad398bfc957d8e8eb26438920026aeaf6`](https://github.com/icosa-foundation/open-brush/tree/4786d55ad398bfc957d8e8eb26438920026aeaf6)

## Executive assessment

Brushspace is a functional WebXR painting application derived from Open Brush concepts and assets. It is not currently a faithful port of Open Brush's brush runtime.

The strongest mapping is the data layer: all 123 current manifest GUIDs are present, shader and texture assets have been extracted, and the main `.tilt` stroke fields are represented. The weakest mapping is mesh generation. More than twenty Unity brush-generator classes are reduced to two general extruders plus incomplete fallback particle quads. Exported fragment shaders can make those approximations recognizable, but cannot restore topology, UVs, packed attributes, smoothing, stochastic placement, or brush-specific silhouette behavior that was never generated.

Current inventory classifications measure shader eligibility, not visual equivalence:

| Classification | Count | Actual meaning |
| --- | ---: | --- |
| `supported` | 79 | Ribbon/tube family with the shared default exported vertex shader |
| `fallback` | 23 | 17 particle brushes and 6 custom-vertex ribbon/tube brushes |
| `unsupported` | 21 | Hull, stamp, thick-strip, special, or unresolved generator |
| Default picker | 29 | Supported, non-superseded entries tagged `default` |

The 123 asset records contain 74 handcrafted and 49 template shaders, and report 112 resolved texture bindings with none missing. Those are asset-pipeline coverage figures, not fidelity figures.

Estimated current fidelity:

- Catalog and static assets: high, about 90%+.
- Ordinary `.tilt` stroke fields: moderate to high, about 65-80%.
- Live mesh generation across the catalog: low to moderate, about 25-40%.
- Materials: moderate for default-vertex ribbons/tubes, low catalog-wide.
- Overall Open Brush product parity: about 15-25%.

These are engineering estimates, not conformance scores. Brushspace is best described as a purpose-built web reimplementation with partial asset and format compatibility.

## What maps well

1. Brush GUIDs, manifest values, shader parameters, textures, descriptor tags, pressure ranges, and several geometry settings are data-driven.
2. Original Open Brush glTF-export shaders are used instead of replacing everything with generic Three.js materials.
3. Color, brush GUID, size, scale, flags, seed, group, layer, pose, pressure, and timestamp are represented.
4. Authoring includes keeper/trailing-point sampling and a pressure-dependent spawn interval.
5. Non-raw `ShaderMaterial` is a sensible WebXR adaptation because it permits super-three's GLSL3 and multiview rewriting.
6. Generated production assets do not require a Unity checkout at runtime.

## Mesh-generation gaps

### Generator coverage

Open Brush has 32 C# files under `Assets/Scripts/Brushes`. Brushspace maps only:

- Four quad-strip/flat classes to one `ribbon` generator.
- `TubeBrush` to one fixed `tube` generator.
- Three particle classes to an ineligible placeholder.
- Everything else to unsupported or unmapped.

Missing families include hull/concave hull, square and thick geometry, blocks, CandyCane, HolidayTree, Plait/Braid, Snowflake, 3D print, SVG, PBR/environment, and other special generators.

### Knot and sampling semantics

Open Brush generators consume knots containing raw and smoothed pose/pressure, frame state, length, breaks, geometry ranges, and deterministic RNG state. The web generators consume stored control points directly. Missing behavior includes:

- Position and pressure smoothing.
- All generator-specific spawn formulas.
- Minimum-motion and sharp-turn strip breaks.
- Adjacent-knot rebuild and segment restart rules.
- Generator discard, finalization, and vertex-limit splitting.
- Full use of `brushScale` in generated geometry.

### Ribbons

The local ribbon is two indexed vertices per control point. Important differences are:

- Distance, stretch, and unitized UV brushes are not distinct.
- U is point-index fraction, not accumulated distance times `m_TileRate`.
- `m_TextureAtlasV` and deterministic atlas selection are ignored.
- Explicit backface geometry and `m_BackfaceHueShift` are replaced by `DoubleSide`.
- Tangents are absent, so normal-mapped lighting cannot match.
- Several extracted descriptor fields do not affect generation.
- Custom vertex layouts for DoubleTapered, Electricity, and Waveform are absent.

### Tubes

The eight-sided parallel-transport tube captures the broad shape, but not upstream `TubeBrush` behavior:

- Fixed side count instead of prefab `m_PointsInClosedCircle`.
- Center-fan caps instead of source cap topology and `m_CapAspect` extension.
- No `m_EndCaps`, `m_HardEdges`, distance/stretch mode, random U, or V atlas.
- No circumference-dependent UV rate.
- No radius in UV0.z.
- No double-taper, sine, comet, taper, or petal modifiers.
- No break-angle logic or exact tangents/normals.

The material code still describes an interim four-sided tube although generation now uses eight sides, so culling policy should be revalidated.

### Particles

The placeholder creates one static world-XY quad per control point. Open Brush instead:

- Spawns at distance intervals, possibly multiple times between knots.
- Uses seeded salted RNG for size, alpha, position, rotation, roll, and atlas.
- Packs center, birth time, rotation, and other data into normals, 4D UV0, UV1, and vertex IDs.
- Billboards and animates in the vertex shader.
- Applies rate, speed, lifetime, preview decay, and finalization rules.

Fire, Smoke, Snow, Sparks, Embers, Bubbles, and similar brushes cannot be called faithful until these vertex contracts exist.

### Performance

Finalized strokes remain separate meshes and draw calls, frustum culling is disabled, and active geometry marks full-capacity attributes dirty. `brush-batching.ts` has tests but no production caller. Large Open Brush sketches need pooled material batches, separate dynamic active-stroke buffers, dirty-range uploads, valid culling bounds, and erase/undo compaction.

## Material and shader gaps

### Export shaders are not Unity runtime shader parity

`Support/GlTFShaders` contains Open Brush's export/viewer shaders. They are primary-source approximations, but not translations of every Unity runtime pass, keyword, or render state. Forty-nine local shaders are produced from official templates. UI and reports should distinguish handcrafted export shaders, export templates, web fallbacks, and validated Unity-runtime ports rather than calling all of them the "real shader."

### Vertex data is the limiting contract

The current gate checks `vertexIsDefault` and a broad geometry family. Even default shaders only match if attribute values have the correct semantics. The six excluded custom-vertex ribbon/tube brushes are DoubleTaperedFlat, DoubleTaperedMarker, Electricity, Waveform, Disco, and LightWire. Particles and special brushes also require UV1, 4D UV0, vertex IDs, or packed deformation data. The runtime buffer supplies only position, normal, color, 2D UV, and index.

### Descriptor data is extracted but unused

Records contain tile rate, atlas count, backface settings, radius packing, opacity, audio-reactive flags, color constraints, pressure ranges, and solid minimum length. Much of this is metadata only. Thirty-two records are marked audio-reactive, but brush materials have no beat/FFT/waveform input pipeline; draw sounds are a separate feature.

### Texture semantics are flattened

Every texture is loaded with no color-space conversion, repeat wrapping, and default filtering. Extraction does not preserve Unity sRGB/linear intent, normal-map treatment, per-axis wrap, filtering, mipmaps, anisotropy, alpha handling, scale/offset, or compression policy. These differences matter for masks, normal maps, displacement, and atlases.

### Render state and environment are partial

The runtime maps broad blend mode, culling, transparency, and depth write. It does not validate render queue, arbitrary blend factors, ZTest/ZWrite variants, color masks, alpha-to-coverage, polygon offset, explicit backface passes, premultiplied alpha, or transparent ordering. Lighting/fog is fixed to one Standard viewer rig rather than loaded sketch/environment state.

### Diagnostics and extraction regression

Shader failures fall back after a generic warning, without a durable per-GUID compatibility result or device compile matrix. Existing fallback meshes are not explicitly upgraded when a shader loads later.

There is also a concrete extraction bug: the script header and runtime imports use `src/brushes/generated`, but `outGeneratedDir` is `src/openbrush/generated`. Running the documented extractor would write an unused second catalog and leave runtime data stale.

## Required fidelity harness

Current unit tests validate array shapes, simple frames, pressure multipliers, inventory decisions, and material descriptors; they do not establish visual parity. Build a conformance harness that:

1. Feeds identical deterministic strokes into Unity and the browser: line, arc, helix, sharp corner, reversal, pressure ramp, twist, dot, long stroke, and segment break.
2. Dumps finalized Unity positions, indices, normals, tangents, colors, UV0-UVn, bounds, and material state for every GUID.
3. Compares topology exactly where the algorithm is ported; otherwise compares surfaces and semantic attributes with declared tolerances.
4. Renders fixed camera/environment fixtures and compares linear images before and after post-processing.
5. Compiles and screenshots on desktop WebGL and immersive XR/Quest.
6. Publishes per-GUID results for mesh contract, browser/XR compile, image error, animation, ordering, and performance.

Suggested gates:

- Do not label a brush `supported` without mesh-contract and browser/XR compile passes.
- Default-picker brushes: SSIM >= 0.97 under two fixed views, with manual alpha/additive review.
- Animated brushes: compare at 0, 0.5, 1, and 2 seconds.
- Quest target: 72 Hz at a documented vertex/stroke budget with bounded draw calls and no first-use shader hitch.

## Improvement plan

### Phase 0: trustworthy baseline (1-2 engineer-weeks)

1. Pin the upstream commit in a machine-readable file.
2. Fix extraction output and regenerate through a temporary-directory byte comparison in CI.
3. Extract every required prefab field, vertex layout, texture importer setting, render state, keyword, and environment dependency.
4. Replace broad support labels with evidence states: asset-ready, mesh-contract-passing, browser compile, XR compile, and visually validated.
5. Build Unity mesh-dump and browser reference-render fixtures.

Exit: CI explains exactly why every GUID passes or fails.

### Phase 1: exact ribbons (3-5 engineer-weeks)

1. Port knot smoothing, frame, breaks, and incremental rebuild rules.
2. Split distance, stretch, and unitized UV algorithms.
3. Add physical-length UVs, tile rate, atlas rows, deterministic offsets, and segment restart.
4. Emit explicit backfaces/hue shift, normals, tangents, and source vertex layouts.
5. Apply opacity and color constraints.
6. Port DoubleTapered, Electricity, and Waveform layouts.

Exit: default ribbon fixtures pass mesh and image gates.

### Phase 2: exact tubes (3-5 engineer-weeks)

1. Honor side count, caps, hard edges, UV style, break sensitivity, and modifiers per prefab.
2. Port source cap/ring topology and circumference-based UVs.
3. Add radius packing and tangents.
4. Port Disco and LightWire layouts.
5. Validate culling rather than forcing tubes double-sided.

Exit: tube topology/attributes match Unity and default tubes pass images.

### Phase 3: materials and shader context (3-6 engineer-weeks, overlaps 1-2)

1. Define a typed vertex-layout registry shared by geometry and shaders.
2. Preserve texture color/sampler metadata.
3. Complete render-state mapping and transparent ordering.
4. Drive lights, fog, time origin, canvas transform, and other globals from the loaded sketch/environment.
5. Implement real audio-analysis inputs or classify those variants as non-reactive.
6. Add per-GUID diagnostics and late material upgrades.
7. Validate bloom/tone mapping on desktop and Quest.

### Phase 4: particles (5-8 engineer-weeks)

1. Port deterministic stateless RNG and Open Brush salts.
2. Port distance-based spawning and generator-specific placement.
3. Add 4D UV0, UV1/UV2, center, birth, rotation, velocity, and vertex ID attributes.
4. Port preview decay and finalization.
5. Validate phase after `.tilt` load, collaboration, and undo/redo.

Exit: all 17 particle-family brushes have tested behavior; no static-quad placeholder remains.

### Phase 5: hull, stamp, thick, and special generators (6-10 engineer-weeks)

Port in real-sketch usage order: hull/concave hull; square/stamp and thick geometry; then Blocks, Plait/Braid, CandyCane, HolidayTree, Snowflake, 3D print, SVG, PBR, and environment cases. Explicitly decide which environment/non-stroke brushes are import-only.

### Phase 6: batching and hardening (4-8 engineer-weeks)

1. Pool finalized geometry by brush/material/layer.
2. Keep small dynamic buffers for active local and remote strokes.
3. Add culling, compaction, erase/undo bookkeeping, and transparent buckets.
4. Test thousands of strokes, collaboration, context loss, and Quest memory pressure.

## Recommended sequence

Do not begin by porting all 123 shaders. The highest-yield order is: conformance tooling; exact geometry for the 29 default-picker brushes; material/texture semantics for those brushes; batching sufficient for real sketches; particles; then long-tail and experimental generators. A shader should not be declared complete against an approximate vertex contract.

## Effort and full-port appraisal

Assumptions: senior WebGL/TypeScript and Open Brush/Unity expertise, Quest-capable WebXR, existing application features retained, and automated tests included.

| Goal | Estimated work |
| --- | ---: |
| Harness and extraction metadata | 1-2 engineer-weeks |
| High-fidelity 29-brush default set | 10-18 engineer-weeks |
| All stock brush mesh/material families | 24-42 engineer-weeks total |
| Batching/performance hardening | 4-8 additional engineer-weeks |
| Broad Open Brush application parity | 18-36 engineer-months total program |

A two-person graphics-focused team could plausibly deliver a validated default set in 2-4 calendar months and broad stock-brush coverage in 6-10 months, assuming no major browser/driver blocker.

"Fully working port" is much larger. The reviewed Open Brush tree has about 786 C# files under `Assets/Scripts` (about 7.35 MB); Brushspace has 84 non-test TypeScript files (about 23,400 lines). This is not a productivity comparison, but shows the product-surface difference. Open Brush includes mature selection/modification, media, camera/video, environments, guides/snapping, layers/groups, import/export, platform integrations, scripting/plugins, and extensive UI/settings beyond this brush review.

Brushspace already implements a credible subset—painting, straightedge/tape, erasing, brush/color UI, undo/redo, local persistence, partial `.tilt`, GLB export, collaboration, snapshots, and world grab—but these are adaptations rather than close Unity translations. Upstream changes generally require manual reinterpretation.

Broad parity is therefore a multi-year solo effort or roughly a 9-18 month program for a focused 3-5 person team, depending on which platform-specific features are intentionally omitted.

## Immediate backlog

1. Fix the extraction output directory.
2. Qualify the README's "real brushes" claim until conformance exists.
3. Stop presenting default-vertex eligibility as fidelity support.
4. Fail loudly when extracted required geometry parameters are unimplemented.
5. Implement distance/tile-rate ribbon UVs and tangents.
6. Port exact tube caps, hard edges, UVs, and modifiers.
7. Build the Unity reference corpus before particle work.
8. Connect batching to production rendering.
9. Record shader compile results for browser and immersive XR.
10. Preserve texture importer and render-state metadata.

## Primary references

- [Open Brush brush sources](https://github.com/icosa-foundation/open-brush/tree/4786d55ad398bfc957d8e8eb26438920026aeaf6/Assets/Scripts/Brushes)
- [`BaseBrushScript.cs`](https://github.com/icosa-foundation/open-brush/blob/4786d55ad398bfc957d8e8eb26438920026aeaf6/Assets/Scripts/Brushes/BaseBrushScript.cs)
- [`QuadStripBrush.cs`](https://github.com/icosa-foundation/open-brush/blob/4786d55ad398bfc957d8e8eb26438920026aeaf6/Assets/Scripts/Brushes/QuadStripBrush.cs)
- [`TubeBrush.cs`](https://github.com/icosa-foundation/open-brush/blob/4786d55ad398bfc957d8e8eb26438920026aeaf6/Assets/Scripts/Brushes/TubeBrush.cs)
- [`GeniusParticlesBrush.cs`](https://github.com/icosa-foundation/open-brush/blob/4786d55ad398bfc957d8e8eb26438920026aeaf6/Assets/Scripts/Brushes/GeniusParticlesBrush.cs)
- [Export shader sources](https://github.com/icosa-foundation/open-brush/tree/4786d55ad398bfc957d8e8eb26438920026aeaf6/Support/GlTFShaders)
- [Export manifest](https://github.com/icosa-foundation/open-brush/blob/4786d55ad398bfc957d8e8eb26438920026aeaf6/Support/exportManifest.json)

## Verification note

This was a source and asset audit; runtime code was not changed. Type checking could not run meaningfully because dependencies are not installed (`@iwsdk/core`, `vitest`, and related modules are absent). No installation was performed for this review. Runtime images and device shader compilation remain to be validated by the proposed harness.
