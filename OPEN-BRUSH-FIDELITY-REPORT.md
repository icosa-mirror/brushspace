# Open Brush brush fidelity review

Date: 2026-07-11

Brushspace: `295a8ba`

Open Brush: [`4786d55ad398bfc957d8e8eb26438920026aeaf6`](https://github.com/icosa-foundation/open-brush/tree/4786d55ad398bfc957d8e8eb26438920026aeaf6)

## Executive assessment

Brushspace is a functional WebXR painting application derived from Open Brush concepts and assets. It is not currently a faithful port of Open Brush's brush runtime.

The strongest mapping is the data layer: all 123 extracted GUIDs are present, shader and texture assets have been extracted, and the main `.tilt` stroke fields are represented. The required fidelity target matches Open Brush's authored picker catalogs: 48 standard brushes plus 47 experimental brushes. Four additional experimental entries are tagged `broken`, and 24 uncatalogued compatibility records remain loadable for old sketches but are not port requirements. Ribbon, tube, thick-strip, convex/concave-hull, and all three particle-generator families now have dedicated geometry paths, but mesh generation remains the largest gap for stamp, special, and several custom-deformation brushes. Export shaders cannot restore topology, smoothing, or brush-specific silhouette behavior that was never generated.

Catalog scope and runtime visibility are independent of fidelity classification:

| Set | Count | Actual meaning |
| --- | ---: | --- |
| Standard catalog | 48 | Shown in manifest order, 12 per page |
| Experimental catalog | 47 | The 51 extracted experimental records minus four entries tagged `broken` |
| Required total | 95 | The only brushes required for fidelity work |
| Compatibility/non-catalog | 24 | Retained for old sketches, excluded from the port backlog |
| Broken experimental | 4 | CandyCane, HolidayTree, Snowflake, and Braid3; excluded by Open Brush's tag filter |

All 95 required buttons are visible. Brushes classified as **Likely mostly
correct** remain selectable; brushes classified as **Unverified or likely
substantially wrong** are visibly marked and disabled rather than silently routed
through generic fallback rendering. All 95 required catalog entries now have an
implemented mesh/material contract and are enabled; the disabled distinction
continues to apply to unsupported compatibility-only records.

The 123 asset records contain 74 handcrafted and 49 template shaders, and report 112 resolved texture bindings with none missing. Those are asset-pipeline coverage figures, not fidelity figures.

Estimated current fidelity:

- Catalog and static assets: high, about 90%+.
- Ordinary `.tilt` stroke fields: moderate to high, about 65-80%.
- Live mesh generation across the catalog: moderate, about 45-60%.
- Materials: moderate across supported ribbon, tube, and particle families; low for Unity-only effects.
- Overall Open Brush product parity: about 20-30%.

These are engineering estimates, not conformance scores. Brushspace is best described as a purpose-built web reimplementation with partial asset and format compatibility.

## What maps well

1. Brush GUIDs, manifest values, shader parameters, textures, descriptor tags, pressure ranges, and several geometry settings are data-driven.
2. All 95 required brushes now resolve materials through pinned `icosa-sketch-assets` and `three-icosa` revisions instead of Brushspace-owned shader bindings. `three-tiltloader` supplies the reusable mesh generators. The local material adapter is limited to IWSDK-compatible `ShaderMaterial` construction, frame uniforms, diagnostics, and compatibility-only fallbacks.
3. Color, brush GUID, size, scale, flags, seed, group, layer, pose, pressure, and timestamp are represented.
4. Authoring includes keeper/trailing-point sampling and a pressure-dependent spawn interval.
5. Non-raw `ShaderMaterial` is a sensible WebXR adaptation because it permits super-three's GLSL3 and multiview rewriting.
6. Generated production assets do not require a Unity checkout at runtime.

## Mesh-generation gaps

### Generator coverage

Open Brush has 32 C# files under `Assets/Scripts/Brushes`. Brushspace currently maps:

- Four quad-strip/flat classes to one `ribbon` generator.
- `TubeBrush` and several derived contracts to a parameterized `tube` generator.
- Three particle classes to dedicated deterministic particle generators.
- `SquareBrush` to a hard-edged rectangular-prism specialization of the tube builder.
- `ThickGeometryBrush` to its six-vertex belly-strip topology.
- `HullBrush` to tetrahedron inputs followed by convex-hull generation, with
  source faceted and angle-weighted smooth-normal output modes.
- `ConcaveHullBrush` to overlapping five-knot hulls built from its
  pressure-sized, controller-oriented quill segments.
- `Square3DPrintBrush` to capped manifold rounded-square rings with its source
  bevel, cap fan, orientation validity, and section-break rules.
- Everything else to unsupported or unmapped.

No required catalog generator remains unmapped. SquarePaper now emits SquareBrush's four hard-edged sides, 0.375 cross-section aspect, caps, and constant center UVs. ThickGeometry now emits the source six-vertex ring, eight-triangle segment, endpoint belly pinch, distance UV, normals, and tangents. ShinyHull, MatteHull, UnlitHull, DiamondHull, and SmoothHull now use the source tetrahedron knot conversion, convex envelope, 3D UV contract, and faceted/smooth vertex modes. ConcaveHull uses the source five-knot sliding window and QuillPen conversion. 3D Printing Brush emits capped, manifold eight-vertex rounded-square rings. Compatibility-only blocks, holiday, braid, SVG, PBR/environment, and other special generators are retained for old sketches but are outside the 95-brush target.

### Knot and sampling semantics

Open Brush generators consume knots containing raw and smoothed pose/pressure, frame state, length, breaks, geometry ranges, and deterministic RNG state. The web generators consume stored control points directly. Missing behavior includes:

- Position and pressure smoothing.
- All generator-specific spawn formulas.
- Minimum-motion and sharp-turn strip breaks.
- Adjacent-knot rebuild and segment restart rules.
- Generator discard, finalization, and vertex-limit splitting.

Serialized `brushScale` is now applied to local ribbon width, tube radius and
modifiers, particle size, bounds, and distance-UV density. This matches Open
Brush's `brushSize * brushScale` conversion from pointer to canvas space.

### Ribbons

The local ribbon now distinguishes distance, stretch, and unitized UV modes; uses
physical length and tile rate where required; selects atlas rows deterministically;
emits explicit hue-shifted backfaces; and supplies normals and tangents. Generated
Unity UVs are converted to the glTF convention consumed by the exported shaders.
Sub-millimetre moves and direction reversals now split the indexed strip, with
distance/stretch UVs restarted per section. Important remaining differences are:

- Open Brush knot smoothing, self-intersection width shrinking, discard, and
  adjacent-knot rebuild rules are incomplete. Non-M11 `FlatGeometryBrush`
  strokes now clip self-intersections and cap width growth by travel distance.
- The shared indexed strip does not reproduce every source generator's triangle-soup topology and seams.
- Head/tail simplification and per-generator minimum-length rules are incomplete.
- DoubleTapered and Electricity now consume the emitted edge-vector layout.
  Electricity also recreates the Unity shader's three displacement passes;
  exact `FlatGeometryBrush` smoothing/topology remains open.
- Toon now recreates its radius-packed, front-culled black outline pass. Its
  blue surface remains too narrow against the Unity reference, so exact tube
  radius/topology is still required.
- TubeToonInverted now recreates its black base and inflated, front-culled
  color pass. Exact inflation still depends on matching Unity's canvas-space
  transform and tube normals.

### Tubes

The parallel-transport tube now consumes extracted side count, end-cap, hard-edge,
UV-style, cap-aspect, atlas, radius-packing, taper, and petal settings. It uses
circumference-dependent distance UVs, emits tangents, and splits/caps sections
using Open Brush's minimum-motion and width-relative frame-angle tests. Remaining
differences are:

- Cap/ring topology has not been byte-compared against each upstream `TubeBrush` variant.
- Knot smoothing and incremental adjacent-knot rebuild semantics are absent.
- Modifier behavior is approximate rather than validated against Unity mesh dumps.
- Disco and LightWire consume the radius-packed 3D UV0 tube contract; exact Unity deformation still needs fixture comparison.
- Culling and seam behavior need per-brush visual validation.

### Particles

The seven `GeniusParticlesBrush` entries now create deterministic finalized
particles at the source `0.0025 / particleRate` distance interval. Placement
uses the source salt layout, pressure sizing/floor, size variance, spherical
spread, random orientation/alpha, and atlas selection. They pack center,
rotation, birth time, source position, and vertex ID into the Open Brush
normal/UV contract and render through their handcrafted export shaders, which
restore camera billboarding and texture animation. A browser pixel gate renders
generated Smoke geometry through that shader and rejects empty or black output.

The seven `SprayBrush` entries now spawn segment-oriented quads at the source
pressure-sized interval, including the 500-quad segment cap, source salt
layout, size/position/rotation/alpha variance, size ratio, atlas selection,
explicit backfaces, and real default-vertex export shaders. A Splatter pixel
gate rejects empty or black generated output. Preview decay and incremental
knot rebuild behavior remain approximate.

The three `MidpointPlusLifetimeSprayBrush` entries now use the same authored
distance spawning and segment frame, plus their distinct five-quad salt layout
and 4D UV1 corner-offset/birth-time contract. DanceFloor and WaveformParticles
render with their default export vertex shaders; a DanceFloor pixel gate
rejects empty or black output. HyperGrid renders its non-audio export behavior;
its additional audio-reactive behavior remains absent. The export shaders do
not reproduce Unity's lifetime motion, so runtime animation, preview decay,
finalization, and exact sketch-time-to-level-time conversion remain open.
Genius particles share the latter lifecycle/time-conversion gap.

### Performance

Finalized strokes remain separate meshes and draw calls, frustum culling is disabled, and active geometry marks full-capacity attributes dirty. `brush-batching.ts` has tests but no production caller. Large Open Brush sketches need pooled material batches, separate dynamic active-stroke buffers, dirty-range uploads, valid culling bounds, and erase/undo compaction.

## Shared dependency architecture

Brushspace should not own private copies of reusable Open Brush parsing, geometry, shader assets, or material bindings. The intended source-of-truth split is:

- [`three-tiltloader`](https://github.com/icosa-foundation/three-tiltloader) owns `.tilt` archive/binary parsing, the stroke and control-point data model, brush-manifest interpretation, and reusable static and incremental mesh generators. Its lowest geometry layer should return typed arrays plus attribute/index descriptions without depending on Three.js; an optional adapter can construct `BufferGeometry`.
- [`icosa-sketch-assets`](https://github.com/icosa-foundation/icosa-sketch-assets) supplies the maintained Three.js-compatible GLSL and brush textures. Consume those assets without Brushspace-specific shader edits and pin the repository revision used by production and CI.
- [`three-icosa`](https://github.com/icosa-foundation/three-icosa) supplies brush GUID/name lookup, texture and uniform setup, vertex-attribute binding, render-state selection, and per-frame camera, lighting, fog, and time integration. Use its glTF extension directly for imported glTF sketches.
- Brushspace owns IWSDK entities/systems, controller sampling, interactive painting, sketch lifecycle, UI, undo/erase, collaboration, and a thin IWSDK/XR adapter. That adapter may select `ShaderMaterial` instead of `RawShaderMaterial` and connect IWSDK/super-three XR multiview state, but it should not duplicate parsing, generators, brush bindings, or shader logic.
- Binding changes that are generally useful should be contributed to `three-icosa`. In particular, material construction needs to be configurable so IWSDK can use a non-raw material while existing consumers retain the current behavior.
- Parser and generator changes that are generally useful should be contributed to `three-tiltloader`. Its existing incomplete generic-ribbon implementation is prior art, not a compatibility constraint; replace it behind a new API rather than preserving incorrect behavior.
- Dependency updates must be deliberate: record pinned revisions, build distributable assets reproducibly, and run the representative mesh and browser/XR image gates before advancing any pin.

This migration does not make the shaders equivalent to the Unity runtime shaders. The maintained web shaders remain ports of Open Brush behavior, and exact fidelity still depends on correct generated vertex contracts, render context, animation inputs, and brush-specific multipass behavior.

Move the implementation upstream incrementally: establish the neutral stroke/geometry result interfaces; move one generator family and its tests; switch Brushspace to the package; repeat for the remaining families; then move `.tilt` parsing once the shared output model is stable. Delete each Brushspace copy only after its upstream replacement passes the existing fixtures.

## Material and shader gaps

### Export shaders are not Unity runtime shader parity

`Support/GlTFShaders` contains Open Brush's export/viewer shaders. They are primary-source approximations, but not translations of every Unity runtime pass, keyword, or render state. Forty-nine local shaders are produced from official templates. UI and reports should distinguish handcrafted export shaders, export templates, web fallbacks, and validated Unity-runtime ports rather than calling all of them the "real shader."

All required material lookups now use the maintained dependency path. The pinned
revisions at this milestone are `icosa-sketch-assets@f2d7185`,
`three-icosa@d2f79a4`, and `three-tiltloader@d61ac51`. This establishes source
ownership and browser-render eligibility; it does not establish Unity image parity.
Known brush placeholders now preserve the source opaque/cutout or additive render
state even when stroke color alpha is below one; ordinary alpha blending remains
limited to unknown compatibility fallbacks.
The extracted local corpus remains only for compatibility records and extraction
diagnostics and should be pruned once those uses are separated.

### Vertex data is the limiting contract

The current gate checks `vertexIsDefault` plus explicit Genius, Spray, Midpoint, HyperGrid, Waveform, DoubleTapered, Electricity, Disco, LightWire, Hull, and 3D-print contracts. Even default shaders only match if attribute values have the correct semantics. No extracted brush remains in the `fallback` classification; 12 compatibility-only special generator records remain `unsupported`, all outside the 95-brush target. HyperGrid renders its non-audio export behavior, but real audio-reactive inputs remain absent. The runtime now supplies position, normal, tangent, color, 2D/3D/4D UV0, 3D/4D UV1, vertex IDs, and index where the selected generator defines those semantics.

### Descriptor data is extracted but unused

Records contain tile rate, atlas count, backface settings, radius packing, opacity, audio-reactive flags, color constraints, pressure ranges, and solid minimum length. Ribbon and tube generation now consumes many of these fields, but head/tail rules and several special-generator settings remain metadata only. Thirty-two records are marked audio-reactive, but brush materials have no beat/FFT/waveform input pipeline; draw sounds are a separate feature.

### Texture semantics are flattened

Extraction and loading preserve sRGB/linear intent, per-axis wrapping, filter mode,
mipmap generation, and anisotropy, and runtime `_TexelSize` uniforms now use the
actual loaded image dimensions. Texture scale/offset, compression/transcoding,
platform overrides, and full Unity alpha/import semantics remain unported.
The exported derivative bump branch made lit brushes render entirely black on
physical Quest hardware. A guarded replacement is now the default: it clamps
degenerate gradients and falls back per fragment, passes the Oil Paint pixel A/B
check with a material difference, and renders a real generated Oil Paint stroke
in desktop Chrome without black output. `?bump-mapping=fallback` retains an
explicit flat-normal escape hatch. Physical-Quest verification is still required
before this can be classified as fully validated rather than likely mostly correct.

### Render state and environment are partial

The runtime maps broad blend mode, culling, transparency, and depth write. It does not validate render queue, arbitrary blend factors, ZTest/ZWrite variants, color masks, alpha-to-coverage, polygon offset, explicit backface passes, premultiplied alpha, or transparent ordering. Lighting/fog is fixed to one Standard viewer rig rather than loaded sketch/environment state.

### Diagnostics and extraction regression

Shader loads and warmups record durable per-GUID compatibility results, and existing
fallback meshes are upgraded when their shader material becomes available. The
visual conformance routes now also persist per-GUID pass/fail results with coverage,
timestamp, and runtime identity. The remaining diagnostic gap is a complete
browser/Quest compile and image-comparison matrix tied to the visual reference
corpus. Extraction now writes the catalog consumed by the runtime and checks
generated additive shaders for unresolved emission macros.

## Required fidelity harness

Current unit tests validate array shapes, simple frames, pressure multipliers, inventory decisions, and material descriptors; they do not establish visual parity. Build a conformance harness that:

1. Feeds identical deterministic strokes into Unity and the browser: line, arc, helix, sharp corner, reversal, pressure ramp, twist, dot, long stroke, and segment break.
2. Dumps finalized Unity positions, indices, normals, tangents, colors, UV0-UVn, bounds, and material state for every GUID.
3. Compares topology exactly where the algorithm is ported; otherwise compares surfaces and semantic attributes with declared tolerances.
4. Renders fixed camera/environment fixtures and compares linear images before and after post-processing.
5. Compiles and screenshots on desktop WebGL and immersive XR/Quest.
6. Publishes per-GUID results for mesh contract, browser/XR compile, image error, animation, ordering, and performance.

Do not create a second synthetic visual baseline. The pinned Open Brush checkout
already contains the authoritative brush fixture generator at
`Assets/Editor/UiScreenshotter.cs` and material reference images under
`Support/Screenshots/postfx-disabled/` (for example `brush-OilPaint.png` and
`brush-DuctTape.png`). `Generate Brush Screenshots` draws the same deterministic
path for every catalog brush, uses the black environment
`580b4529-ac50-4fe9-b8d2-635765a14893`, fixes shader time at 0.5 seconds, disables
post-processing, renders at 2x supersampling with 4x MSAA, and downsamples to
1024x1024. Browser reference renders should reproduce that path, framing,
environment, time, resolution, and post-processing state before image comparison.

Use IWSDK's live runtime inspection for browser verification. Locate the actual
`BrushStroke` entity by brush GUID, inspect its ECS fields, scene transform,
generated geometry, assigned material, shader uniforms, and compatibility result,
then capture the real application render. A synthetic quad may be used only as a
coarse shader-compilation/effect smoke check; it is not evidence that a generated
brush stroke looks correct. The minimum debugging sequence is typecheck, connect
to the existing IWSDK runtime, inspect the real stroke entity/material, check all
browser logs, and screenshot the live scene.

Suggested gates:

- Do not label a brush `supported` without mesh-contract and browser/XR compile passes.
- Default-picker brushes: SSIM >= 0.97 under two fixed views, with manual alpha/additive review.
- Animated brushes: compare at 0, 0.5, 1, and 2 seconds.
- Quest target: 72 Hz at a documented vertex/stroke budget with bounded draw calls and no first-use shader hitch.

## Improvement plan

### Phase 0: trustworthy baseline (1-2 engineer-weeks)

1. Implemented: `open-brush-reference.json` pins the audited upstream commit,
   and asset extraction rejects a checkout at any other revision.
2. Fix extraction output and regenerate through a temporary-directory byte comparison in CI.
3. Extract every required prefab field, vertex layout, texture importer setting, render state, keyword, and environment dependency.
4. Partially implemented: evidence states distinguish asset readiness, renderer
   eligibility, mesh contract, browser compile, XR compile, and persisted visual
   results. Mesh/image fixture automation and a complete XR matrix remain open.
5. Partially implemented: the browser route now reproduces the existing Open
   Brush `UiScreenshotter` path, perspective framing, fixed shader time, and
   stroke seed without generator-specific control-point mutations. Unity mesh
   dumping and automated image comparison remain open;
   do not replace the existing screenshot corpus with a new visual target.

Exit: CI explains exactly why every GUID passes or fails.

### Phase 1: exact ribbons (3-5 engineer-weeks)

1. Establish the typed-array stroke/geometry API in `three-tiltloader`, move the ribbon generators and tests there, and consume them from Brushspace.
2. Port knot smoothing, frame, breaks, and incremental rebuild rules.
3. Split distance, stretch, and unitized UV algorithms.
4. Add physical-length UVs, tile rate, atlas rows, deterministic offsets, and segment restart.
5. Emit explicit backfaces/hue shift, normals, tangents, and source vertex layouts.
6. Apply opacity and color constraints.
7. Validate DoubleTapered and Electricity against Unity mesh/image fixtures.

Exit: default ribbon fixtures pass mesh and image gates.

### Phase 2: exact tubes (3-5 engineer-weeks)

1. Move the tube generators and tests into `three-tiltloader` and switch Brushspace to the shared API.
2. Honor side count, caps, hard edges, UV style, break sensitivity, and modifiers per prefab.
3. Port source cap/ring topology and circumference-based UVs.
4. Add radius packing and tangents.
5. Validate Disco and LightWire deformation against Unity mesh/image fixtures.
6. Validate culling rather than forcing tubes double-sided.

Exit: tube topology/attributes match Unity and default tubes pass images.

### Phase 3: materials and shader context (3-6 engineer-weeks, overlaps 1-2)

1. Implemented for the 95 required brushes: pin `icosa-sketch-assets` and `three-icosa`, then replace the locally extracted shader/binding pipeline brush family by brush family.
2. Implemented: `three-icosa` accepts a configurable material factory so generated IWSDK strokes use non-raw `ShaderMaterial` with XR multiview support.
3. Define a typed vertex-layout registry shared by `three-tiltloader` geometry and the `three-icosa` binding adapter.
4. Preserve the authoritative texture color/sampler metadata.
5. Complete render-state mapping without introducing transparency behavior absent from Open Brush.
6. Drive lights, fog, time origin, canvas transform, and other globals from the loaded sketch/environment.
7. Implement real audio-analysis inputs or classify those variants as non-reactive.
8. Remove the obsolete extracted shader corpus and duplicated binding tables only after all required brushes resolve through the pinned dependencies.
9. Add per-GUID diagnostics and late material upgrades.
10. Validate bloom/tone mapping on desktop and Quest.

### Phase 4: particles (5-8 engineer-weeks)

1. Move the particle generators and tests into `three-tiltloader` and switch Brushspace to the shared API.
2. Port deterministic stateless RNG and Open Brush salts.
3. Port distance-based spawning and generator-specific placement.
4. Add 4D UV0, UV1/UV2, center, birth, rotation, velocity, and vertex ID attributes.
5. Port preview decay and finalization.
6. Validate phase after `.tilt` load, collaboration, and undo/redo.

Exit: all 17 particle-family brushes have tested behavior; no static-quad placeholder remains.

### Phase 5: required special generators (implemented)

The required hull, ConcaveHull, ThickGeometry, SquarePaper, and 3D Printing
Brush paths are implemented. Remaining work is fixture-level parity and
hardening rather than an unmapped required generator.
Compatibility-only Blocks, Plait/Braid, holiday, SVG, PBR, and environment
cases are explicitly outside the 95-brush target and remain import-only until
their scope is reconsidered.

### Phase 6: batching and hardening (4-8 engineer-weeks)

1. Pool finalized geometry by brush/material/layer.
2. Keep small dynamic buffers for active local and remote strokes.
3. Add culling, compaction, erase/undo bookkeeping, and transparent buckets.
4. Test thousands of strokes, collaboration, context loss, and Quest memory pressure.

## Recommended sequence

Do not treat all 123 extracted records as the fidelity target. The highest-yield order is: conformance tooling; exact geometry for the 48 standard brushes; material/texture semantics for those brushes; batching sufficient for real sketches; then the 47 non-broken experimental brushes. A shader should not be declared complete against an approximate vertex contract.

## Effort and full-port appraisal

Assumptions: senior WebGL/TypeScript and Open Brush/Unity expertise, Quest-capable WebXR, existing application features retained, and automated tests included.

| Goal | Estimated work |
| --- | ---: |
| Harness and extraction metadata | 1-2 engineer-weeks |
| High-fidelity 48-brush standard set | 12-22 engineer-weeks |
| All 95 required brush mesh/material families | 24-42 engineer-weeks total |
| Batching/performance hardening | 4-8 additional engineer-weeks |
| Broad Open Brush application parity | 18-36 engineer-months total program |

A two-person graphics-focused team could plausibly deliver a validated default set in 2-4 calendar months and broad stock-brush coverage in 6-10 months, assuming no major browser/driver blocker.

"Fully working port" is much larger. The reviewed Open Brush tree has about 786 C# files under `Assets/Scripts` (about 7.35 MB); Brushspace has 84 non-test TypeScript files (about 23,400 lines). This is not a productivity comparison, but shows the product-surface difference. Open Brush includes mature selection/modification, media, camera/video, environments, guides/snapping, layers/groups, import/export, platform integrations, scripting/plugins, and extensive UI/settings beyond this brush review.

Brushspace already implements a credible subset—painting, straightedge/tape, erasing, brush/color UI, undo/redo, local persistence, partial `.tilt`, GLB export, collaboration, snapshots, and world grab—but these are adaptations rather than close Unity translations. Upstream changes generally require manual reinterpretation.

Broad parity is therefore a multi-year solo effort or roughly a 9-18 month program for a focused 3-5 person team, depending on which platform-specific features are intentionally omitted.

## Immediate backlog

1. Add Unity mesh dumps to the existing deterministic screenshot fixture.
2. Implemented: reproduce that fixture path, camera, seed, and fixed shader time
   in the browser for per-GUID comparison.
3. Replace renderer-eligibility labels with persisted mesh/browser/XR/image evidence.
4. Fail loudly when an extracted required vertex contract is unimplemented.
5. Port ribbon smoothing and self-intersection width shrinking.
6. Byte-compare tube caps/rings and port Disco and LightWire layouts.
7. Port preview decay, lifetime motion, and exact time conversion for particle brushes.
8. Connect batching to production rendering.
9. Persist the browser/Quest shader compile matrix.
10. Complete texture transforms and render states; verify guarded normal mapping on physical Quest.
11. Implemented for all 95 required brushes: shader assets come from pinned `icosa-sketch-assets`, material bindings come from pinned `three-icosa`, and reusable geometry comes from pinned `three-tiltloader`.
12. Move reusable `.tilt` parsing and mesh generators into `three-tiltloader` family by family, switching Brushspace to each upstream implementation before deleting its local copy.

## Primary references

- [Open Brush brush sources](https://github.com/icosa-foundation/open-brush/tree/4786d55ad398bfc957d8e8eb26438920026aeaf6/Assets/Scripts/Brushes)
- [`BaseBrushScript.cs`](https://github.com/icosa-foundation/open-brush/blob/4786d55ad398bfc957d8e8eb26438920026aeaf6/Assets/Scripts/Brushes/BaseBrushScript.cs)
- [`QuadStripBrush.cs`](https://github.com/icosa-foundation/open-brush/blob/4786d55ad398bfc957d8e8eb26438920026aeaf6/Assets/Scripts/Brushes/QuadStripBrush.cs)
- [`TubeBrush.cs`](https://github.com/icosa-foundation/open-brush/blob/4786d55ad398bfc957d8e8eb26438920026aeaf6/Assets/Scripts/Brushes/TubeBrush.cs)
- [`GeniusParticlesBrush.cs`](https://github.com/icosa-foundation/open-brush/blob/4786d55ad398bfc957d8e8eb26438920026aeaf6/Assets/Scripts/Brushes/GeniusParticlesBrush.cs)
- [Export shader sources](https://github.com/icosa-foundation/open-brush/tree/4786d55ad398bfc957d8e8eb26438920026aeaf6/Support/GlTFShaders)
- [Export manifest](https://github.com/icosa-foundation/open-brush/blob/4786d55ad398bfc957d8e8eb26438920026aeaf6/Support/exportManifest.json)
- [Brush screenshot generator](https://github.com/icosa-foundation/open-brush/blob/4786d55ad398bfc957d8e8eb26438920026aeaf6/Assets/Editor/UiScreenshotter.cs)
- Open Brush reference corpus path: `Support/Screenshots/postfx-disabled/`
- [IWSDK](https://iwsdk.dev/) live scene/ECS inspection and browser/XR runtime tools
- [`icosa-sketch-assets`](https://github.com/icosa-foundation/icosa-sketch-assets) maintained web shader and texture assets
- [`three-icosa`](https://github.com/icosa-foundation/three-icosa) Three.js Open Brush material extension and bindings
- [`three-tiltloader`](https://github.com/icosa-foundation/three-tiltloader) intended shared `.tilt` parsing and brush-geometry package

## Verification note

The initial report was a source and asset audit. Subsequent implementation commits
are gated by TypeScript checking, the full Vitest suite, a production Vite build,
live Chrome rendering when the browser connection is available, and the GitHub
Pages workflow. Those checks catch compilation and gross rendering failures but
do not constitute Unity image or mesh conformance. Physical Quest verification
is still required for shader changes; guarded normal mapping is enabled by default
after desktop A/B and real-stroke gates, but the prior headset black-output failure
means on-device evidence remains mandatory.
