# Brush Stroke Shader Parity Report — Open Brush → IWSDK

Generated: 2026-07-06

> **Status update (2026-07-06, post-audit): SH0 + SH1 landed.**
>
> - **SH0 done** — `scripts/extract-brush-assets.mjs` (run via `npm run extract:brush-assets`) emits include-resolved GLSL for **all 123 brushes** (74 handcrafted + 49 template-generated), 112/112 textures (Unity `.mat`→`.meta` GUID resolution), and descriptor geometry params into `public/openbrush/` + `src/openbrush/generated/`. The app no longer imports from `reference/` at build time.
> - **Key correction to §2/§7-G:** the 50 "missing-GLSL" community brushes are *not* blocked on `three-icosa` — the official `Support/bin/gltf_export_shaders.py` auto-generates their shaders from the shared templates (VertDefault + FragAdditive/FragUnlit/FragDiffuse/FragStandard selected by blendMode/params), and the extraction script ports that exact logic. MylarTube now renders via its template FragStandard shader. Hand-tuned vertex effects (e.g. MylarTube `SqueezeAmount`) remain future work.
> - **SH1 done** — `src/openbrush/brush-shader-materials.ts` (pure descriptor layer, unit-tested) + `brush-shader-library.ts` (material cache shared per GUID, textures via `AssetManager` with glTF sampling conventions, `u_time`/scene-light/fog uniforms shared by reference, `compileAsync` warmup). `StrokeAuthoringSystem` uses shader materials when eligible (`vertexIsDefault` + ribbon/emissive/tube geometry) and falls back to `MeshBasicMaterial` otherwise (Smoke/particles stay fallback until SH5). Scene light rig uses the ground-truth matrices/colors from the official viewer's ExampleSketch glTF; matrices are recomputed as view×lightWorld per frame (MODELVIEW semantic).
> - **Risk #4 resolved the hard way:** `RawShaderMaterial` broke in-headset — super-three only applies its GLSL3 conversion and **OVR_multiview** patching (per-view matrix arrays, `gl_ViewID_OVR`, multiview-aware program cache keys) to *non-raw* programs, so raw GLSL1 programs draw into the multiview framebuffer as `INVALID_OPERATION` (invisible strokes + GL error spam). Fix: compile the exports as non-raw `ShaderMaterial` with `prepareBrushShaderSource()` stripping the built-in matrix uniform declarations (three's prefix provides them) and the ES3-core derivatives `#extension` line. Verified against all 246 extracted shaders.
> - **Partial SH2** — UVs corrected to u-along-length / v-across-width (G-5 partially closed; tile-rate and atlas rows still pending). Ribbon orientation frames (G-4), canvas-units migration (G-13), tangents/texcoord1 (G-15) remain open.
> - **Verified E2E:** Light renders its bloom-boosted white-hot core with falloff-texture glow; Marker renders as a hard-edged cutout; MylarTube renders lit with specular (tube geometry kept double-sided until the SH6 tube rewrite validates winding against `enableCull`); Smoke still renders via fallback. No shader compile errors; 45 test files / 231 tests pass.
> - **SH3-equivalent rollout landed (2026-07-06, later same day):** brush support is now fully data-driven. The extraction script resolves each brush's geometry generator class (descriptor `m_BrushPrefab` → prefab `m_Script` GUID → class) and `m_Supersedes` links; the inventory derives family/support from that (60 ribbon + 25 tube classified). **66 extrusion brushes are picker-visible** with their real shaders; particle/spray brushes (Smoke, Snow, Splatter, DotMarker, …) render via fallback but are hidden from the picker until a particle system exists; superseded brush versions are hidden like in Open Brush.
> - **Size semantics corrected (closes most of G-13 for sizes):** descriptor `m_BrushSizeRange` values are Tilt Brush units = decimeters (`App.UNITS_TO_METERS = 0.1`); the old live-scale factor (~0.021, derived from an arbitrary "2 cm default") made every stroke ~5× too thin. `OPEN_BRUSH_IWSDK_BRUSH_SIZE_SCALE` is now exactly 0.1, per-brush size/pressure ranges come from the extracted descriptors, the pointer ring previews the true stroke diameter (ring diameter == brush size, no 8× fudge), and brush switches preserve the absolute size clamped into the new brush's range (PointerScript `m_LastUsedBrushSize_CS` semantics) instead of re-deriving from the normalized slider.
> - **Stroke sampling matched to reference (2026-07-06):** replaced the port's fixed 15 mm control-point gate with Open Brush's model — a "keeper" point spawns every `solidMinLength + pressuredSize × 0.2` of travel (QuadStrip constant 1.5 mm; tube uses descriptor `m_SolidMinLengthMeters_PS`), sub-0.5 mm movement is ignored, and the trailing non-keeper point is overwritten every frame so the stroke tip tracks the pointer exactly (PointerScript `SetControlPoint` semantics). Light-default strokes now sample every ~3.75 mm instead of 15 mm (~4× denser, pressure- and size-adaptive).
> - **G-4 + G-9 geometry closed (2026-07-06):** ribbon frames now port `ComputeSurfaceFrameNew` (pointer-orientation + movement frame with previous-right continuity — coils no longer flip/collapse; ribbons face the pointer like a knife blade, and lit brushes get real surface normals); tubes are 8-sided rings (+UV seam vertex) on minimal-rotation/parallel-transport frames per `TubeBrush`/`ComputeMinimalRotationFrame`, bootstrapped from the pointer orientation, with end caps. Coil-continuity regression tests pin both (no adjacent-frame flips on a helix).
> - **Next:** canvas-units for positions (rest of G-13), tile-rate/atlas UVs, tube strip-breaks on sharp bends, then particles (SH5) and batching (SH6). Denser sampling raises the value of SH6 batching/incremental geometry (full-stroke rebuild per frame is O(n) per sample).

Scope: audit of the brush **stroke rendering** pipeline (shaders, materials, textures, and the geometry contract those shaders depend on), comparing the Open Brush Unity source under `reference/` against the current IWSDK port under `src/`. Companion to `OPEN_BRUSH_IWSDK_PORT_PLAN.md` (this report supersedes the shader assumptions in its Phase 5).

Source grounding: `reference/Assets/Resources/Brushes/**`, `reference/Assets/Shaders/Include/*.cginc`, `reference/Assets/Scripts/Brushes/*.cs`, `reference/Support/GlTFShaders/**`, `reference/Support/exportManifest.json`, and the port's `src/openbrush/brush-{inventory,materials,geometry,batching,material-warmup}.ts` plus `src/systems/StrokeAuthoringSystem.ts`.

---

## 1. Executive summary

**The single most important finding:** Open Brush already ships a web-targeted GLSL export of its brush shaders. `reference/Support/GlTFShaders/Generators/` contains 152 GLSL files (76 vertex/fragment pairs) plus 9 shared includes, written for a WebGL glTF viewer. They use **three.js uniform naming** (`modelViewMatrix`, `projectionMatrix`, `normalMatrix`) on purpose — the renderer can bind them with near-zero adaptation. `reference/Support/exportManifest.json` (123 brush entries) is the machine-readable index tying each brush GUID to its shader pair, textures, blend mode, and material parameters. The port already parses this manifest (`src/openbrush/brush-inventory.ts`) but only uses its metadata, not its shaders or textures.

**Where the port is today:** every stroke renders as a vertex-colored `MeshBasicMaterial` with either normal or additive blending (`StrokeAuthoringSystem.ts:434`, `brush-materials.ts`). No textures are loaded, no custom shaders exist, no HDR/bloom color boost, no lighting, no animation. Only 5 of 123 brushes are mapped at all (Marker, Flat, Light, MylarTube, Smoke), and even those 5 are visually far from reference — e.g. Light is missing its falloff texture and the `bloomColor()` emission curve that gives it its glow.

**The gap is two-sided.** Half the problem is materials (load the real shaders/textures); the other half is the **geometry contract**: the reference shaders consume per-vertex data the port doesn't generate — orientation-driven ribbon frames, length-wise UVs with atlas rows, packed particle data (center/rotation/birth-time), tangents, and `texcoord1` payloads. Loading the real shaders without upgrading geometry would fix color/blend but still look wrong.

**Coverage reality check:** only the ~73 standard Tilt Brush-era brushes have GLSL pairs on disk. The 50 newer Open Brush community brushes (Gouache, MylarTube, Rain, Sparks, Charcoal, …) are listed in the manifest with shader filenames that were never generated into this repo; their Unity shaders live in `reference/Assets/Resources/X/Brushes/`. Note that **MylarTube — one of the port's 5 "supported" brushes — has no GLSL export**. The Icosa Foundation's `three-icosa` project (Apache-2.0) maintains three.js ports of these brush shaders, including many of the newer ones, and is worth evaluating as a source for the missing 50 or as prior art for the whole runtime.

**Recommended strategy (detailed in §6):** build a small brush-shader runtime around the shipped GLSL + manifest — an asset extraction script, a `RawShaderMaterial` factory keyed by brush GUID, a per-frame uniform system (`u_time`, scene lights, fog), and staged geometry upgrades — then roll brushes out in tiers ordered by shader/geometry complexity. This converts "rewrite ~100 Unity shaders" into "bind ~76 existing GLSL programs and port 4 geometry generators."

---

## 2. Reference architecture: how Open Brush strokes get their look

### 2.1 Two-layer shader system

**Layer 1 — Unity runtime shaders.** Each brush's `BrushDescriptor` (`Assets/Scripts/Brushes/BrushDescriptor.cs`) references a material. Simple brushes share library shaders in `Assets/Resources/Brushes/Shared/Shaders/` (`Bloom`, `Unlit`, `Additive`, `DiffuseOpaque*`, `Standard*`); special brushes have their own shader in their brush folder (Fire, Smoke, Electricity, DiamondHull, Rainbow, …). Common machinery lives in `Assets/Shaders/Include/Brush.cginc`:

- `bloomColor(color, gain)` — the signature emissive-brush look: floor all 3 channels, `pow(2.2)`, then `rgb *= 2 * exp(gain * 10)`. Light's `EmissionGain=0.45` means a ~180× brightness boost feeding the bloom pass.
- `encodeHdr`/`decodeHdr` (`Hdr.cginc`) — packs HDR magnitude into framebuffer alpha for the bloom post-pass (PC) or emulates it with `BlendOp Max` tricks (mobile/Quest).
- `GetTime()` (`TimeOverride.cginc`) — all animation goes through this wrapper around Unity `_Time` (a vec4 `(t/20, t, 2t, 3t)`).
- Audio-reactive keyword `AUDIO_REACTIVE` — 27 brushes sample `_WaveFormTex`/`_FFTTex`/`_BeatOutput` when music mode is live.
- Runtime-only features: selection tint (`SELECTION_ON`), stroke-scripting clip/dissolve (`_ClipStart/_ClipEnd/_Dissolve` + Bayer dither), ODS capture.

Representative brush shaders:

| Brush | Shader | Blend | Animation |
|---|---|---|---|
| Light | shared `Bloom.shader` | `One One` additive | vertex `bloomColor`; static otherwise |
| Flat | shared `DiffuseOpaqueSingleSided` | opaque | none |
| Marker | shared `Unlit.shader` | alpha-tested cutout (`_Cutoff`) | none |
| Fire | own shader | `One One` | fragment: 2 scrolling-UV samples via `GetTime().x` |
| Rainbow | own shader | `One One` | fragment: hue cycling via `GetTime().z` |
| Electricity | own shader, **3 passes** | `One One` | vertex: curl-noise displacement from `texcoord1` edge offsets |
| Smoke | own shader | `SrcAlpha One` | vertex: curl-noise + camera billboarding (`Particles.cginc`) |
| DiamondHull | own shader (lit surface) | `One One` | fragment: time-scrolled thin-film iridescence |

**Layer 2 — GLSL web exports** (`Support/GlTFShaders/`): per-brush `<Name>-<GUID>-v10.0-{vertex,fragment}.glsl` pairs assembled from `include/` building blocks (`VertDefault`, `FragAdditive`, `FragUnlit`, `FragDiffuse`, `FragStandard`, `SurfaceShader`, `NormalMap`, `Fog`, `Particles`). These are the shaders tiltbrush.com's viewer used. Key properties:

- Runtime-only Unity features are stripped: no audio reactivity (time-based animation approximates it — e.g. ChromaticWave phases its waveforms with `u_time.w`), no selection, no ODS, no HDR framebuffer encoding (emission relies on `bloomColor()` boost + additive blending alone).
- Trivial brushes' vertex stage is literally `#include "VertDefault.glsl"`; ~20 have real vertex logic (particles, tapered ribbons, Electricity, Disco, …). 19 shaders reference `u_time`.
- A build step must resolve `#include` directives (plain textual inclusion) — the files are otherwise self-contained GLSL 1.00.

### 2.2 The vertex-data contract

From `GeometryPool.cs` (`VertexLayout`, `Semantic` enum) and the brush generator classes — this is what the shaders expect per geometry family:

| Family (generator) | Example brushes | uv0 | uv1 | Normals/tangents | Notes |
|---|---|---|---|---|---|
| Flat quad-strip (`QuadStripBrush*`, `FlatGeometryBrush`) | Flat, Marker, Light, OilPaint, Ink | size 2: **u along length** (distance × `m_TileRate`, or stretch 0→1), v = atlas row of `m_TextureAtlasV` | optional size-3 edge-offset vector (`m_bOffsetInTexcoord1`, used by Electricity) | yes; tangents for lit | ribbon frame from **pointer orientation + movement** (`ComputeSurfaceFrameNew`); backfaces = doubled geometry with optional `m_BackfaceHueShift` |
| Tube (`TubeBrush`) | Toon, Wire, Spikes, Lofted, Disco, LightWire | size 2 or 3 (`XyIsUvZIsDistance`: radius in uv0.z when `m_TubeStoreRadiusInTexcoord0Z`) | — | yes | N-sided ring (prefab `m_PointsInClosedCircle`, default 8) on a **minimal-rotation frame**; end caps; sin/comet/taper silhouette modifiers |
| Particle (`GeniusParticlesBrush`) | Smoke, Embers, Snow, Stars, Bubbles, Dots | **size 4**: `(atlasU, atlasV, rotation, birthTime)` | size 3 = particle **center** (`Semantic.Position`) | normal = particle **center** | quad corners in mesh; **billboarding happens in the shader** (`Particles.glsl`: `PARTICLE_CENTER=a_normal`, `PARTICLE_ROTATION=a_texcoord0.z`) |
| Spray (`SprayBrush`, `MidpointPlusLifetimeSpray`) | Splatter-style sprays | size 2, 2×2 atlas cells | size 4 spread+lifetime (midpoint variant) | yes | randomized quads, deterministic per-stroke RNG salt |
| Hull (`HullBrush`) | ShinyHull, MatteHull, UnlitHull, DiamondHull | size 3 | — | yes | convex-hull mesh from control points |

Cross-cutting: vertex color is **sRGB Color32** with alpha = `m_Opacity × lerp(pressureOpacityRange, pressure)`; no HDR is baked into vertex colors (bloom is shader-side via `EmissionGain`). Width = `baseSize × lerp(pressureSizeMin, 1, pressure)`. Batching (`BatchManager`/`Batch`) pools strokes **per brush GUID** into shared meshes with one material each, hiding erased strokes by zeroing their index ranges (`m_TriangleBackup`).

### 2.3 `exportManifest.json` — the machine-readable contract

123 entries keyed by GUID. Per entry: `name`, `folderName`, `shaderVersion`, `vertexShader`, `fragmentShader`, `blendMode`, `enableCull`, `textures` (param → PNG filename), `textureSizes`, `floatParams` (e.g. `EmissionGain`, `Cutoff`, `Shininess`, `Scroll1/2`, `DisplacementIntensity`), `vectorParams` (e.g. `ScrollDistance`), `colorParams` (e.g. `SpecColor`, `TintColor`).

`blendMode` (from `IExportableMaterial.cs:22`): **0 = None (opaque), 1 = AlphaMask (cutout), 2 = AdditiveBlend, 3 = AlphaBlend**. Distribution: 35 / 51 / 36 / 1. Note that **51 of 123 brushes are alpha-cutout** — their entire silhouette comes from the `MainTex` mask, so texture loading is not polish, it is the brush.

Coverage of on-disk assets:

| Asset | Status |
|---|---|
| GLSL pairs | 76 pairs on disk covering the 73 standard brushes (some have single/double-sided GUID variants). **50 manifest entries (all Open Brush community brushes, incl. MylarTube) reference GLSL files that don't exist in this repo.** Their Unity shaders are in `Assets/Resources/X/Brushes/`. |
| Textures | Manifest-named PNGs (`<folder>-v10.0-MainTex.png`) exist only for one example sketch (`Support/bin/gltfViewer/geom/ExampleSketch/`). The canonical bitmaps are the per-brush Unity folder textures (120 PNGs under `Assets/Resources/Brushes/**` + more under `X/Brushes/**`); an extraction step must resolve Unity `.mat` → texture GUID → file. |
| Geometry params | **Not in the manifest.** `m_TileRate`, `m_TextureAtlasV`, `m_RenderBackfaces`, `m_TubeStoreRadiusInTexcoord0Z`, tube side counts, taper modifiers etc. live in Unity `.asset`/prefab YAML and need their own extraction. |

### 2.4 What the GLSL shaders need at runtime

- **Attributes:** `a_position` (vec4), `a_normal`, `a_color`, `a_texcoord0` (vec2–4), `a_texcoord1` (vec3–4 where used).
- **Matrices:** `modelMatrix`, `viewMatrix`, `modelViewMatrix`, `projectionMatrix`, `normalMatrix` — three.js supplies all of these to any material that declares them (this naming is deliberate).
- **Per-frame:** `u_time` = vec4 `(t/20, t, 2t, 3t)` (Unity `_Time` convention); fog (`Fog.glsl`); for lit brushes `u_SceneLight_0_matrix`/`u_SceneLight_1_matrix` (light direction = `mat3(m) * (0,0,1)`), `u_SceneLight_0/1_color`, `u_ambient_light_color`.
- **Per-material (from manifest):** `u_MainTex`, `u_BumpMap`, `u_EmissionGain`, `u_Cutoff`, `u_Shininess`, `u_SpecColor`, `u_ScrollRate`/`u_ScrollDistance`/`u_ScrollJitterIntensity`/`u_ScrollJitterFrequency`, etc.
- **Scale assumption:** shader constants are authored in scene units (e.g. Electricity divides edge-offset length by `.02`, displaces by `0.05`). They assume Open Brush world scale — see gap G-13.

---

## 3. Current port state (shader-relevant)

What exists and works:

- `brush-inventory.ts` parses the real `exportManifest.json` (all 123 entries) and layers a hand-maintained support map: 4 brushes `supported` (Marker → ribbon/standard, Flat → ribbon/unlit, Light → ribbon("emissive")/additive, MylarTube → tube/standard), Smoke `fallback`, the other 118 `unsupported`.
- `brush-materials.ts` maps each brush to a semantic `BrushMaterialSpec` (blend mode, transparency, depth write, double-sided, cutoff, emissive intensity, texture slot **names**). Sound logic, but it feeds…
- …a plain `MeshBasicMaterial` (`StrokeAuthoringSystem.ts:434`, and again at `:1146`): vertex colors, `DoubleSide`, `AdditiveBlending` or `NormalBlending`, `alphaTest`. `emissiveIntensity` and `textureSlots` are computed and then **dropped** — nothing loads textures, nothing is emissive, nothing is lit, nothing animates.
- `brush-geometry.ts` generates per-stroke ribbons (2 verts/point), 4-sided tubes, and static quads with position/normal/rgba-color/uv, pressure-driven width and opacity (both source-grounded).
- `brush-material-warmup.ts` and `brush-batching.ts` are **planning modules only** — nothing at runtime warms materials or batches strokes; every stroke is its own `Mesh` + material instance.
- GLB export writes basic PBR materials with Open Brush metadata in `extras`.

Geometry deviations that shaders cannot compensate for:

- **Ribbon frames ignore controller orientation** — `getRibbonOffset` (`brush-geometry.ts:383`) projects the tangent into the XZ plane and always yields a horizontal ribbon with normal `[0,1,0]`. Reference ribbons twist with the pointer (`ComputeSurfaceFrameNew`). This is likely a contributor to the recurring "thickness feels wrong" reports: a horizontal ribbon seen edge-on is a hairline regardless of width.
- **UVs are transposed vs reference** — port writes u across width / v along length; reference is u along length (× tile rate or stretched), v across width (+ atlas row). Harmless while untextured; visibly wrong the moment `MainTex` loads.
- **Tube is a 4-sided axis-aligned prism** — ring normals are fixed world-axis vectors (`getTubeNormal`), so tubes don't follow stroke direction; reference uses 8-sided minimal-rotation frames with caps.
- **Particle quads are static XY squares** — no center/rotation/birth-time packing, no billboarding.
- No `texcoord1`, no tangents, no timestamps, no backface doubling / hue shift, no atlas support.
- **Live-scale baking:** stroke geometry is authored directly at "live" scale (~×0.021 of Open Brush room-space units, per the port plan's Light calibration). Reference shaders' absolute constants (displacement amplitudes, edge-offset normalization) assume canvas units.

---

## 4. Parity gap matrix

Severity: ☠ = defining feature of the product look, ● = high, ◐ = medium, ○ = low/deferred.

| # | Dimension | Reference | Port today | Sev |
|---|---|---|---|---|
| G-1 | Shader programs | Per-brush GLSL (76 pairs shipped) | One `MeshBasicMaterial` for everything | ☠ |
| G-2 | Textures | `MainTex`/`BumpMap` per brush; 51 brushes are cutout masks | None loaded (slot names computed, unused) | ☠ |
| G-3 | Emissive/bloom look | `bloomColor()` ≈ `2·exp(10·gain)` boost + additive; HDR bloom pass on PC | Flat vertex color + additive blend | ☠ |
| G-4 | Ribbon orientation | Pointer-orientation surface frames, twist, self-intersection fixes, smoothing | XZ-planar, normal always +Y | ☠ |
| G-5 | UV semantics | u along length (tile-rate/stretch), v across + atlas rows; particle packing in uv0.zw | Transposed, no atlas, no packing | ● |
| G-6 | Animated brushes | 19 exported shaders animate via `u_time` (scroll, hue-cycle, noise, thin-film) | Static | ● |
| G-7 | Lit brushes | 2 directional scene lights + ambient + `BumpMap` (OilPaint, Ink, ThickPaint, …) | Unlit | ● |
| G-8 | Particles | Shader-billboarded quads w/ rotation + birth-time; curl-noise motion | Static world-space quads | ● |
| G-9 | Tube geometry | 8-sided min-rotation rings, caps, taper/comet/petal modifiers | 4-sided axis-aligned prism | ● |
| G-10 | Blend modes | None/AlphaMask/Additive/AlphaBlend + queue/depth rules | Additive vs normal only (AlphaBlend=3 unmapped — affects only `PbrTransparentTemplate`) | ◐ |
| G-11 | Backfaces | Doubled geometry per `m_RenderBackfaces`, optional backface hue shift | `DoubleSide` material flag | ◐ |
| G-12 | Batching/material sharing | Per-GUID pools, shared material, subset hide/restore | Mesh+material per stroke; planner unused at runtime | ◐ |
| G-13 | Units/scale | Geometry in canvas units; shader constants assume that scale | Live scale (~×0.021) baked into vertex positions | ● |
| G-14 | Color space | TB vertex colors are sRGB; toolkit/GLSL path expects linear ("TBT") convention; shaders self-manage via `pow(2.2)` in bloom paths | Raw 0–1 floats, no explicit policy | ◐ |
| G-15 | Vertex payloads | `texcoord1` (edge offsets, particle centers), tangents, timestamps, width/radius in uv0.z | None | ● |
| G-16 | Audio-reactive mode | 27 brushes react to live audio (runtime keyword) | n/a — **also absent from the GLSL exports**; time-based approximations instead | ○ (defer) |
| G-17 | Selection/dissolve shader FX | `SELECTION_ON`, `_Dissolve` dither | Port has its own selection path | ○ (defer) |
| G-18 | Bloom post-process | PC: HDR encode + bloom pass; Quest: BlendOp Max emulation | None (IWSDK default pipeline) | ○ (optional polish) |
| G-19 | Brush coverage | 123 manifest brushes | 5 mapped (1 of them fallback); MylarTube "supported" but has no GLSL export | ● |
| G-20 | Shader warmup | Material pre-warm at load | Warmup plan computed, never executed; ShaderMaterial compile hitches will matter more | ◐ |

---

## 5. Recommended strategy

1. **Adopt the shipped GLSL exports as the brush shader library.** They are the exact shaders the official web viewer used, keyed by the same GUIDs the port already tracks, with three.js-compatible uniform naming. This is dramatically cheaper and more faithful than semantic-family rewrites (the current `brush-materials.ts` approach becomes the *fallback* tier, not the target).
2. **Fix the geometry contract in lockstep, brush family by family.** A shader tier only ships together with the geometry features it consumes (frames → flat brushes; packing → particles; rings → tubes).
3. **Author stroke geometry in Open Brush canvas units under a scaled canvas root** instead of baking live scale into vertices. This keeps shader constants, eraser radii, and `.tilt` round-trip in one coordinate convention and matches reference `CanvasScript` semantics. (One-time migration touching stroke authoring, eraser/picker math, and GLB export.)
4. **Evaluate `three-icosa` (Icosa Foundation, Apache-2.0)** before writing the loader: it already implements a Tilt Brush shader loader + per-frame uniform updates for three.js and covers newer Open Brush brushes missing GLSL here. Even if not taken as a dependency (IWSDK pins `super-three`), it is the best reference for edge cases and the source for the 50 missing shader pairs.
5. **Keep the fallback path.** Unsupported brushes keep rendering via the current semantic material so the app never breaks while coverage grows; `supportStatus` in the inventory already models this.

---

## 6. Implementation plan

Phases are sequential but each ships user-visible value. Testing follows repo conventions: `npx tsc --noEmit` → targeted Vitest → `npm run build` → managed `iwsdk-runtime` E2E (check `xr_get_session_status` first, unfiltered console logs, XR screenshots).

### SH0 — Brush asset extraction pipeline

Scope:
- `scripts/extract-brush-assets.mjs`: from `reference/`, emit into `public/openbrush/`:
  - `exportManifest.json` (copied; stop importing it from `reference/` at build time so the app no longer depends on the reference checkout at runtime),
  - resolved GLSL (inline the `#include` directives; 76 pairs + note which GUIDs resolved),
  - textures: parse Unity `.mat` YAML (`m_TexEnvs` → texture GUID) + `.meta` GUID index → copy/rename PNGs to the manifest's `<folder>-v10.0-<Param>.png` names, covering both `Brushes/**` and `X/Brushes/**`,
  - `brush-geometry-params.json`: parse brush `.asset` YAML for the descriptor fields the manifest lacks — `m_TileRate`, `m_TextureAtlasV`, `m_RenderBackfaces`, `m_BackfaceHueShift`, `m_TubeStoreRadiusInTexcoord0Z`, `m_SolidMinLengthMeters_PS`, `m_Opacity`, pressure ranges, `m_AudioReactive` — plus a `hasGlsl` flag.
- Extend `BrushInventoryEntry` with the extracted geometry params and `hasGlsl`.

Acceptance: extraction is idempotent and reports coverage (expect 73 GUIDs with shaders / 50 without); all manifest texture references for shader-backed brushes resolve to real files; inventory unit tests updated.

### SH1 — Brush shader material runtime

Scope:
- `src/openbrush/brush-shader-materials.ts`: async factory `getBrushShaderMaterial(guid)` returning a cached `RawShaderMaterial` per GUID —
  - shaders fetched from `public/openbrush/`, textures via `AssetManager` (`loadTexture`), `flipY`/color-space set to match reference sampling,
  - uniforms from manifest `floatParams`/`vectorParams`/`colorParams` (`u_EmissionGain`, `u_Cutoff`, `u_Shininess`, `u_SpecColor`, `u_ScrollRate`, …),
  - blending from `blendMode`: 0 → opaque/depthWrite, 1 → cutout (`u_Cutoff` in-shader; keep depthWrite), 2 → `AdditiveBlending`/no depthWrite, 3 → normal blending/no depthWrite,
  - `side` from `enableCull`,
  - shared per-frame uniform objects (same JS object references across materials) for `u_time`, lights, fog.
- Attribute binding: keep standard names (`position`, `normal`, `color`, `uv`) for three.js/raycast/eraser compatibility and **additionally register the same `BufferAttribute` objects under the GLSL names** (`a_position`, `a_normal`, `a_color`, `a_texcoord0`, `a_texcoord1`) — one GPU buffer, two bind points; `a_position` declared vec4 against an itemSize-3 buffer is legal GL (w defaults to 1).
- Per-frame update (in `StrokeAuthoringSystem.update()` or a tiny `BrushUniformSystem`): `u_time.set(t/20, t, 2t, 3t)`; derive `u_SceneLight_0/1_matrix` + colors from two designated scene lights (add two directional lights matching a default Open Brush environment if none exist); `u_ambient_light_color`; fog uniforms (density 0 initially).
- `StrokeAuthoringSystem` requests the shader material when `hasGlsl`, falls back to the existing `MeshBasicMaterial` path otherwise (keep `renderWarning` visible in ECS).
- Execute the warmup plan for real: pre-create + `renderer.compile` shader materials for the picker's brush set at load.

Acceptance: Light renders with its falloff texture and bloom boost (visibly glowing vs today); Marker's cutout mask shapes the ribbon edge; Flat unchanged-or-better; unsupported brushes still work via fallback. Managed XR screenshots + empty fresh warn/error logs. Unit tests: uniform construction from manifest entries, blend-mode table (incl. mode 3), attribute aliasing on generated geometry.

### SH2 — Geometry contract upgrade (flat family + canvas units)

Scope:
- Port `ComputeSurfaceFrameNew` semantics into the ribbon generator: frame from control-point orientation + movement, previous-right continuity, knot smoothing (0.3/0.4/0.3), degenerate-segment handling. Control points already store orientation quaternions — currently unused.
- Correct UVs: u along length (distance × `m_TileRate` and stretch variants per descriptor), v across width with `m_TextureAtlasV` row selection (seeded by stroke `seed` for determinism like reference `(rand*3331)%numV`).
- Optional `texcoord1` edge-offset payload (`m_bOffsetInTexcoord1`-style) so Electricity-class shaders work later; width-in-uv0.z for Hypercolor.
- **Canvas-units migration:** generate geometry in Open Brush canvas units; put strokes under a canvas root entity carrying the live-scale transform. Update eraser/picker world-space math (already `matrixWorld`-aware via the generated-triangle path) and GLB export scaling. Recalibrate nothing visually — the on-screen result must be identical for existing brushes; add a regression comparing stroke world bounds before/after.
- Backfaces: keep `DoubleSide` for unlit brushes; add doubled-geometry emission (with flipped normals/winding) for lit double-sided brushes when SH3 lands.

Acceptance: ribbons twist with controller roll (screenshot: rolled-wrist stroke shows a twisted band, not a flat horizontal ribbon); Marker texture stripes run along the stroke; stroke bounds/eraser/undo regressions pass; `.tilt`/GLB round-trip unaffected in unit tests.

### SH3 — Brush rollout, Tier A + B (static quad-strip brushes)

- **Tier A (unlit/cutout/additive, VertDefault + simple fragment):** Light, Flat (×2 GUIDs), Marker, Highlighter, SoftHighlighter, VelvetInk, DotMarker, CelVinyl, Taffy, Ink(unlit variants), TaperedMarker/TaperedFlat (needs taper geometry from pressure — already pressure-driven, verify against reference taper), DoubleTapered* (vertex-taper shaders).
- **Tier B (lit standard/diffuse + BumpMap):** OilPaint, Ink, ThickPaint, WetPaint, DuctTape, Paper, CoarseBristles, Splatter, Leaves, Icing, Petal. Requires: tangent generation in the ribbon generator, `NormalMap.glsl` path, the two scene lights wired.
- Update `MVP_BRUSH_SUPPORT` → data-driven support derived from `hasGlsl` + geometry-family readiness instead of a hand map; picker UI grows accordingly.

Acceptance: per-brush managed-runtime gallery — programmatically author one standardized stroke per enabled brush (extend `stress-fixtures.ts`), screenshot grid, compare against the same strokes in the reference viewer (`Support/bin/gltfViewer`) or Icosa viewer; blend/depth spot-checks (additive brushes don't occlude, cutouts do).

### SH4 — Animated brushes (fragment-time tier)

- Enable `u_time`-driven fragment brushes: Fire, Rainbow, ChromaticWave, NeonPulse, Plasma, Hypercolor (needs width-in-uv0.z), Streamers, Comet, WigglyGraphite.
- Verify time origin/pause semantics (visibility-blur should pause `u_time` accumulation to mirror `GetTime()` behavior and save battery).

Acceptance: two screenshots ≥0.5 s apart differ for each animated brush (automatable via managed runtime); no per-frame allocation in the uniform update (reuse vec4/matrices).

### SH5 — Particles and sprays

- Particle geometry packing per `Particles.glsl` contract: quad corners as positions, **center in `a_normal`**, rotation + birth time in `a_texcoord0.zw`, center/origin in `a_texcoord1`; deterministic per-stroke RNG (seed already exists on `StrokeData`).
- Enable Smoke (real), Embers, Snow, Stars, Bubbles, Dots. Spray-family brushes (Splatter already in Tier B geometry-wise) get randomized quad placement parity.
- Timestamps: control points already carry `timestampMs` — feed birth-time from there.

Acceptance: particles billboard toward the camera in XR (head-move screenshot pair); Smoke drifts with curl noise; Embers rise and fade over stroke lifetime.

### SH6 — Tubes, hulls, batching, and the long tail

- Tube rewrite: minimal-rotation frames, 8-sided rings, end caps, radius-in-uv0.z; enable Toon, Wire, Spikes, Lofted, Disco, LightWire (Disco/LightWire vertex animation comes free with SH4 uniforms).
- Hull family: real convex-hull generation is significant work — decide between porting `HullBrush` or deferring; DiamondHull's shader can be previewed on tube/ribbon geometry but won't match.
- Runtime batching: activate `planBrushBatches` semantics — per-GUID batch meshes sharing one shader material, subset index-range hide/restore for erase/undo (replaces per-stroke mesh+material; also fixes material-instance churn from SH1).
- The 50 missing-GLSL brushes: port from `three-icosa` where it has them, else hand-port from `X/Brushes/*.shader`, else remain fallback. **Decide MylarTube's fate explicitly** (hand-port its small shader — it has `SqueezeAmount` — or drop it from the supported five in favor of a GLSL-backed tube like Toon).
- Optional polish: backface hue shift, bloom post-pass feasibility on Quest (likely skip; the `bloomColor` boost is the accepted web look), fog wiring to environment presets.

---

## 7. Brush rollout tiers (summary table)

| Tier | Prereqs | Brushes (indicative) | Count |
|---|---|---|---|
| A: static unlit/cutout/additive quad-strip | SH1+SH2 | Light, Flat×2, Marker, Highlighter, SoftHighlighter, VelvetInk, DotMarker, CelVinyl, Taffy, Tapered* | ~14 |
| B: lit standard quad-strip | + tangents, lights | OilPaint×2, Ink×2, ThickPaint×2, WetPaint×2, DuctTape×2, Paper×2, CoarseBristles×2, Splatter×2, Leaves, Icing, Petal | ~19 |
| C: animated fragment | + u_time | Fire, Rainbow, ChromaticWave, NeonPulse, Plasma, Hypercolor×2, Streamers, WigglyGraphite×2 | ~10 |
| D: particles/sprays | + particle packing | Smoke, Embers, Snow, Stars, Bubbles, Dots, Comet | ~7 |
| E: tubes | + tube rewrite | Toon, Wire, Spikes, Lofted, Disco, LightWire | ~6 |
| F: hulls / special / templates | hull generator etc. | ShinyHull, MatteHull, UnlitHull, DiamondHull, HyperGrid, Electricity (3-pass→single), Waveform, Blocks*, Pbr*, Environment* | ~15 |
| G: missing-GLSL community brushes | three-icosa or hand ports | Gouache, MylarTube, Rain, DryBrush, Sparks, Charcoal, Fairy, Space, … | 50 |

Audio-reactive behavior (27 brushes) is explicitly out of scope: the web exports never had it; time-based approximations are the parity target.

---

## 8. Risks and open questions

1. **Color space calibration** (G-14). Three r150+ color management + `super-three@0.181` vs the shaders' self-managed sRGB math (`pow(2.2)` inside `bloomColor`, "TB mesh colors are sRGB / TBT mesh colors are linear" in `Brush.cginc`). Decide once in SH1 with an A/B against the reference viewer rendering of the example sketch, then lock it in a unit-tested conversion policy (texture `colorSpace`, vertex-color convention, `outputColorSpace`).
2. **Canvas-units migration** (G-13) touches eraser/picker/size calibration that Phase A just stabilized. Mitigation: land it behind regression tests that pin current world-space bounds and eraser hit results; the visible result must be pixel-identical for existing brushes.
3. **Quest performance:** ~76 shader programs, transparent overdraw from additive ribbons, per-stroke draw calls until SH6 batching. Mitigations: compile-on-load warmup for the picker set only, lazy-compile the rest, prioritize batching right after the first two tiers if draw calls dominate.
4. **RawShaderMaterial + IWSDK renderer assumptions:** verify IWSDK's render pipeline (XR layers, multiview, foveation) is compatible with RawShaderMaterial GLSL1 programs early in SH1 — one Light stroke in-headset is the smoke test. `@iwsdk/core` re-exports all of three (`export * from 'three'`), so imports stay within project rules.
5. **Unity YAML parsing** for `.mat`/`.asset`/prefabs in SH0 is scrappy; keep it a dev-time script with checked-in JSON output so runtime never parses YAML, and hand-patch exceptional brushes if the parser chokes.
6. **Licensing/attribution:** GLSL files are Apache-2.0 (Tilt Brush Authors); keep headers, add NOTICE. `three-icosa` is Apache-2.0 if vendored.
7. **Eraser/raycast interplay:** eraser triangle tests read `geometry.attributes.position` and `drawRange` — the dual-name attribute aliasing keeps this intact, but batching (SH6) will move erase to subset index-range bookkeeping; plan the transition test coverage then.

---

## 9. Verification strategy

- **Unit (Vitest):** manifest→material uniform/blend construction; geometry frame math (orientation quats → expected ribbon frames); UV monotonicity + atlas row determinism; particle packing layout; canvas-unit scale round-trips; extraction-script coverage counts (73/50).
- **Ground truth:** `reference/Support/bin/gltfViewer` + `ExampleSketch` (has baked textures + these exact shaders) and/or the Icosa web viewer for side-by-side stills of the same brush.
- **Managed runtime (per repo rules — `xr_get_session_status` first, no duplicate dev server, unfiltered console logs):** per-tier brush gallery scene from stress fixtures, XR screenshots (static look), screenshot pairs over time (animation), head-move pairs (billboarding), draw/erase/undo regression on shader-material strokes, and `PerformanceState` counters before/after batching.
- **Performance gates:** first-draw hitch < 1 frame budget after warmup; no per-frame allocations in uniform updates; frame time tracked in the existing `PerformanceCounterSystem` while drawing a 50-stroke Light scene.

---

## Appendix A — key reference files

| Concern | Path |
|---|---|
| Web GLSL shaders | `reference/Support/GlTFShaders/Generators/*.glsl`, `include/*.glsl`, `README` |
| Manifest | `reference/Support/exportManifest.json` |
| Master brush include (bloom, srgb, audio) | `reference/Assets/Shaders/Include/Brush.cginc` |
| HDR encode / particle billboarding | `reference/Assets/Shaders/Include/{Hdr,Particles}.cginc` |
| Shared brush shaders | `reference/Assets/Resources/Brushes/Shared/Shaders/` |
| Standard brush assets (textures, .mat, .asset) | `reference/Assets/Resources/Brushes/Basic/<Name>/` |
| Community brush assets (no GLSL exports) | `reference/Assets/Resources/X/Brushes/<Name>/` |
| Vertex layout contract | `reference/Assets/Scripts/Brushes/GeometryPool.cs` (`VertexLayout`, `Semantic`) |
| Geometry generators | `reference/Assets/Scripts/Brushes/{QuadStripBrush,FlatGeometryBrush,TubeBrush,GeniusParticlesBrush,SprayBrush,HullBrush}.cs` |
| Descriptor fields | `reference/Assets/Scripts/Brushes/BrushDescriptor.cs` |
| Blend enum | `reference/Assets/Scripts/Export/IExportableMaterial.cs:22` |
| Batching | `reference/Assets/Scripts/Batching/{BatchManager,Batch,BatchSubset}.cs` |
| Reference web viewer (ground truth) | `reference/Support/bin/gltfViewer/` |
| Port: inventory / materials / geometry | `src/openbrush/brush-{inventory,materials,geometry}.ts` |
| Port: stroke rendering | `src/systems/StrokeAuthoringSystem.ts` |
