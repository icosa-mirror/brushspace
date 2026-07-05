# Open Brush to IWSDK Port Plan

Generated: 2026-07-04

This plan ports Open Brush from its Unity runtime into an IWSDK/WebXR application. It is based on the Open Brush source under `reference/`, the current IWSDK starter in `src/`, and IWSDK API/reference lookups for world setup, ECS, interaction, assets, PanelUI, rendering, and runtime test tooling.

## Source Grounding

Open Brush source areas inspected:

- App lifecycle and service locator: `reference/Assets/Scripts/App.cs`
- Scene, canvases, and layers: `reference/Assets/Scripts/SceneScript.cs`, `reference/Assets/Scripts/CanvasScript.cs`
- Input and command routing: `reference/Assets/Scripts/InputManager.cs`, `reference/Assets/Scripts/Input/VrInput.cs`, `reference/Assets/Scripts/Input/ControllerInfo.cs`
- Painting flow: `reference/Assets/Scripts/Tools/FreePaintTool.cs`, `reference/Assets/Scripts/PointerManager.cs`, `reference/Assets/Scripts/PointerScript.cs`
- Stroke memory and undo: `reference/Assets/Scripts/Stroke.cs`, `reference/Assets/Scripts/StrokeData.cs`, `reference/Assets/Scripts/SketchMemoryScript.cs`, `reference/Assets/Scripts/Commands/BaseCommand.cs`, `reference/Assets/Scripts/Commands/BrushStrokeCommand.cs`
- Brush rendering and batching: `reference/Assets/Scripts/Brushes/BaseBrushScript.cs`, `reference/Assets/Scripts/Brushes/GeometryBrush.cs`, `reference/Assets/Scripts/Brushes/TubeBrush.cs`, `reference/Assets/Scripts/Brushes/GeometryPool.cs`, `reference/Assets/Scripts/Batching/BatchManager.cs`, `reference/Assets/Scripts/Batching/Batch.cs`
- Brush catalog and shaders: `reference/Assets/Resources/Brushes/`, `reference/Support/exportManifest.json`, `reference/Support/GlTFShaders/`, `reference/Assets/Shaders/Include/Brush.cginc`
- Save/load/export/playback/catalogs: `reference/Assets/Scripts/Save/TiltFile.cs`, `reference/Assets/Scripts/Save/SketchWriter.cs`, `reference/Assets/Scripts/Save/SketchMetadata.cs`, `reference/Assets/Scripts/Save/SaveLoadScript.cs`, `reference/Assets/Scripts/Export/ExportGlTF.cs`, `reference/Assets/Scripts/UnityGLTF Plugins/OpenBrushExportPlugin.cs`, `reference/Assets/Scripts/Playback/`

IWSDK APIs and patterns confirmed through `iwsdk-reference`:

- Use `World.create`, `createSystem`, `createComponent`, ECS queries, `Transform`, and `world.createTransformEntity`.
- Import Three.js classes from `@iwsdk/core`; avoid direct app imports from `three`.
- Use `AssetManager` and `World.create({ assets })` for models, images, textures, and audio.
- Use `Interactable`, `RayInteractable`, `PokeInteractable`, `Hovered`, `Pressed`, and input actions/gamepads instead of raw raycasters.
- Enable feature flags only when matching components/systems are present: grabbing, physics, locomotion, scene understanding, spatial UI.
- Use `PanelUI`, `PanelDocument`, and `ScreenSpace` for UI, with CSS strings for screen-space dimensions.
- Use reusable typed arrays, geometry pools, and explicit resource disposal to meet VR frame budgets.

Planning-time runtime status:

- `xr_get_session_status` reported no running IWSDK runtime during planning, so live XR E2E could not be executed yet.
- Every implementation phase below includes IWSDK runtime E2E gates that must be run once the dev server and runtime are available.

## Port Principles

1. Preserve the Open Brush data model first. A visually convincing demo is not enough if strokes cannot round-trip through `.tilt` and replay deterministically.
2. Treat the Unity source as behavior/specification, not as code to transliterate. Unity lifecycle, shaders, GameObjects, command buffers, and filesystem APIs need browser-native equivalents.
3. Separate domain data from render state. Strokes, commands, layers, brushes, and metadata should be testable as pure TypeScript modules before they touch IWSDK entities.
4. Preserve Open Brush update ordering: input/actions, active tool, pointer/stroke state machine, geometry generation, then batch/render flush.
5. Keep hot paths allocation-free. Allocate vectors, arrays, buffers, and temporary objects outside `update()`.
6. Use IWSDK ECS, interactions, and runtime inspection for user-facing behavior. Do not build parallel raw Three.js scene graphs or raycast systems.
7. Phase fidelity from simple to complete: unbatched marker strokes first, then geometry families, batching, shaders, persistence, tools, hand-attached UI, and local interchange.

## Target Architecture

Proposed source layout:

```text
src/
  index.ts
  app/
    BrushAppState.ts
    OpenBrushWorld.ts
  components/
    BrushPointer.ts
    BrushStroke.ts
    BrushBatch.ts
    BrushDescriptor.ts
    CanvasLayer.ts
    ActiveTool.ts
    Selection.ts
    Widget.ts
  systems/
    InputCommandSystem.ts
    ToolSystem.ts
    PaintPointerSystem.ts
    StrokeAuthoringSystem.ts
    BrushGeometrySystem.ts
    BrushBatchSystem.ts
    LayerCanvasSystem.ts
    SelectionSystem.ts
    WidgetSystem.ts
    UndoRedoSystem.ts
    PersistenceSystem.ts
    RuntimeDebugSystem.ts
  brush/
    descriptors/
    geometry/
    materials/
    batching/
  save/
    tilt/
    metadata/
    catalog/
  export/
    glb/
  ui/
```

Core data types:

- `ControlPoint`: position, orientation, pressure, timestamp, and optional pointer metadata.
- `StrokeData`: brush GUID, color, brush size, brush scale, control points, flags, seed, group id, layer id, and stable stroke GUID.
- `BrushDescriptor`: Open Brush GUID, durable name, generator family, material family, textures, shader parameters, export metadata, tags, audio metadata, and render policy.
- `CanvasLayer`: transform, visibility, lock state, layer index, parent canvas entity, and bounds.
- `BrushCommand`: undo/redo command tree with non-destructive hide/show or batch-subset enablement.
- `SketchDocument`: metadata, layers, strokes, media references, environment, palette, source ids, thumbnails, and capability flags.

Critical IWSDK systems:

- `InputCommandSystem`: maps IWSDK actions, XR gamepads, browser pointer, and keyboard shortcuts into Open Brush-style command edges and analog values.
- `ToolSystem`: owns current tool mode and preserves Open Brush ordering between active tool updates and pointer state.
- `PaintPointerSystem`: tracks brush/wand pointer transforms, pressure, lazy/bimanual state, straightedge/symmetry requests, and line request state.
- `StrokeAuthoringSystem`: creates, updates, finalizes, and cancels strokes.
- `BrushGeometrySystem`: converts stroke control points into `BufferGeometry` data through brush family generators.
- `BrushBatchSystem`: groups compatible strokes into batch meshes by brush/material/layer while preserving per-stroke undo visibility.
- `LayerCanvasSystem`: owns scene pose, active canvas, selection canvas, and layer transforms.
- `UndoRedoSystem`: records command trees and keeps redo/dirty state.
- `PersistenceSystem`: reads/writes `.tilt`, IndexedDB/OPFS catalog records, thumbnails, and imports/exports.
- `RuntimeDebugSystem`: exposes stable ECS names/components for `iwsdk-runtime` E2E inspection.

## Standard Test Gates

Every phase must pass the gates relevant to the phase before moving on.

Static and build gates:

- Run `npx tsc --noEmit` before browser or XR testing.
- Run unit tests for pure domain modules.
- Run `npm run build` before phase completion.
- Add a static check that app code imports Three.js types only from `@iwsdk/core`, except allowed loader/exporter type imports.
- Check feature flags match components: for example, `grabbing:true` only when grabbable behavior is intentionally active.

Browser smoke gates:

- If no runtime is connected, start the CLI-managed dev server with `npm run dev`.
- Verify the app loads, the canvas is nonblank, compiled UI is visible, and no startup errors are logged.
- Use `browser_screenshot`, `scene_get_hierarchy`, `ecs_find_entities`, and `ecs_query_entity` when runtime tools are connected.
- Use `browser_get_console_logs` when available, without filtering by level, so initialization errors are not missed.

XR E2E gates:

- Always begin with `xr_get_session_status`.
- If disconnected, start `npm run dev` or `npx iwsdk dev up`, then retry status.
- Reset the emulator with `xr_set_device_state({})`.
- Enter XR with `xr_accept_session`.
- Use `xr_set_device_state`, `xr_get_transform`, controller transforms, trigger/select input, and screenshots to drive deterministic interactions.
- Inspect results with `scene_get_hierarchy`, `ecs_find_entities`, `ecs_query_entity`, and, when exposed, `ecs_snapshot`/`ecs_diff`.
- End sessions with `xr_end_session` after test runs.

Quest/device gates:

- Reserve final phase checks for physical Quest hardware.
- Track headset frame rate, draw calls, buffer upload bytes per frame, transparent overdraw, memory, and thermal behavior.

## Phase 0: Baseline, Tooling, and Port Harness

Scope:

- Convert the starter into a disciplined port workspace without changing behavior yet.
- Add scripts for `typecheck`, `test`, `test:browser`, and `test:xr`.
- Add a basic Vitest or equivalent unit test harness for pure TypeScript modules.
- Add lint/static checks for direct `three` imports, allocation-prone update loops, and feature/component mismatches.
- Add runtime test documentation and a small script or checklist for IWSDK E2E startup.
- Add a `RuntimeDebugSystem` placeholder with stable app/version/status components.

Acceptance criteria:

- `npx tsc --noEmit` passes.
- `npm run build` passes.
- The starter scene still loads in browser mode and can enter XR.
- Runtime inspection can find a named root entity, app status entity, camera/player entities, and UI entity.
- Existing mismatches are either fixed or tracked explicitly, including the current starter pattern of adding `DistanceGrabbable` while `grabbing:false`.

Testing plan:

- Static: run typecheck, build, and the new static import/feature checks.
- Browser: run the app, capture `browser_screenshot`, and verify the canvas is nonblank.
- Runtime E2E: call `xr_get_session_status`; start dev only if disconnected; run `xr_accept_session`; inspect `scene_get_hierarchy`; query root/debug entities with `ecs_find_entities` and `ecs_query_entity`; exit with `xr_end_session`.

## Phase 1: Open Brush Domain Model and Fixtures

Scope:

- Implement pure TypeScript models for Open Brush strokes, control points, brush descriptors, layers, command trees, scene metadata, and sketch documents.
- Convert `reference/Support/exportManifest.json` into a runtime brush inventory source.
- Build fixture readers for known `.tilt` files and small hand-authored stroke JSON fixtures.
- Implement binary primitives needed by `.tilt`: little-endian numbers, packed arrays, .NET GUID byte ordering, extension masks, and forward-compatible skipping.
- Do not render strokes yet; focus on deterministic data.

Acceptance criteria:

- Open Brush control points, brush GUIDs, pressure, timestamps, group flags, seeds, layer ids, and color values can be represented without losing information.
- Known binary values match Unity/Open Brush byte ordering.
- Unknown stroke and control-point extensions can be skipped without corrupting subsequent records.
- Brush descriptor inventory has stable GUID-to-generator/material mappings for at least the MVP brushes and records unsupported brushes cleanly.

Testing plan:

- Unit: byte-level tests for little-endian read/write, GUID ordering, packed arrays, and extension masks.
- Unit: round-trip `StrokeData` and `SketchDocument` fixtures with float tolerances.
- Browser: load the app and expose fixture summary counts in a debug component.
- Runtime E2E: use `ecs_find_entities` and `ecs_query_entity` to verify fixture counts, active brush GUID, layer count, and parse status after loading a fixture through the app shell.

## Phase 2: IWSDK World Shell and ECS Contracts

Scope:

- Replace the starter scene with an Open Brush app shell.
- Configure `World.create` for immersive VR, browser fallback, PanelUI, and only the IWSDK features actually used.
- Implement canvas/layer transform entities, an active canvas, a selection canvas, app state, command state, and debug/status components.
- Create stable ECS components for brush pointers, active tool, brush settings, layer state, and stroke metadata.
- Implement `InputCommandSystem` with IWSDK input actions/gamepads, keyboard shortcuts, and browser pointer fallback.

Acceptance criteria:

- The app initializes into a clean Open Brush workspace with one main canvas and one selection canvas.
- Active brush, color, size, active tool, command edges, and layer state are visible through ECS.
- Browser pointer and XR controller input map to the same abstract command state.
- No direct `scene.add()` use for app entities; object creation goes through `world.createTransformEntity`.
- Feature flags match actual use: spatial UI enabled when UI is present, grabbing/physics/locomotion disabled until needed.

Testing plan:

- Static: typecheck/build and direct-import checks.
- Unit: command mapper tests for button edge/held/analog states.
- Browser: verify UI and workspace load, and no console errors.
- Runtime E2E: `xr_get_session_status`, `xr_accept_session`, `xr_set_device_state({})`; use `ecs_query_entity` to verify app state; use `xr_get_transform` and controller/head states to confirm command mapper sees expected devices.

## Phase 3: Paint MVP With One Brush

Scope:

- Implement the minimal Open Brush paint loop: `FreePaintTool` equivalent, one active canvas, one marker-style brush, one controller pointer, and unbatched stroke meshes.
- Preserve Open Brush ordering: command state, active tool update, pointer state machine, stroke creation/update/finalization.
- Record `ControlPoint` samples with position, orientation, pressure, and timestamp.
- Implement undo/redo for stroke visibility without destroying geometry.
- Use `BufferGeometry` and `BufferAttribute` from `@iwsdk/core`.

Acceptance criteria:

- Pulling the trigger starts exactly one stroke; moving the controller appends ordered control points; releasing finalizes the stroke.
- The finalized stroke persists as a stroke entity with geometry, metadata, and command history.
- Undo hides the stroke or disables its geometry subset; redo restores it without changing stroke ids or control points.
- No per-frame object allocations in the hot paint path beyond intentional typed-array growth.
- A deterministic scripted controller path produces stable sample counts and bounds.

Testing plan:

- Unit: pointer state machine tests for start/update/cancel/finalize.
- Unit: control-point sampling tests for pressure, timestamps, and bounds.
- Browser: draw with mouse/pointer fallback and verify one visible stroke.
- Runtime E2E: use `xr_set_device_state` or controller transform tools to position the brush controller; press trigger/select; move through a known path; release; inspect `ecs_find_entities` for stroke count and `ecs_query_entity` for control-point count, bounds, finalized state, and undo state.

## Phase 4: Brush Geometry and Batching Core

Scope:

- Port the core brush geometry pipeline: `BrushDescriptor`, `GeometryPool`, generator interfaces, stroke replay, and batch manager.
- Implement MVP brush families: marker/flat ribbon, tube, light/emissive, and one textured quad/particle-style brush.
- Add geometry golden tests for vertex counts, index counts, bounds, UVs, normals, color, and deterministic seeds.
- Implement batch grouping by layer, brush GUID, material family, transparency policy, and shader variant.
- Add explicit disposal for geometry/material resources.

Acceptance criteria:

- Each MVP brush generates stable geometry from fixture control points.
- Strokes can be replayed from saved `StrokeData` into equivalent render geometry.
- Batch meshes reduce draw calls for compatible strokes while preserving per-stroke undo/redo visibility.
- Dirty geometry updates use typed-array pools and update ranges rather than recreating buffers every frame.
- Unsupported brush descriptors show a fallback material and warning state without crashing.

Testing plan:

- Unit: golden geometry tests per brush family.
- Unit: replay tests from `StrokeData` to geometry and back to metadata.
- Browser: load a scene with many fixture strokes and verify nonblank rendering and entity counts.
- Runtime E2E: after loading fixtures, use `scene_get_hierarchy` to count batch mesh objects; use `ecs_query_entity` to verify batch subset counts, vertex/index counts, and visible/hidden stroke state after undo/redo.

## Phase 5: Brush Catalog, Materials, and Shader Conversion

Scope:

- Build an asset conversion pipeline from Unity descriptors/materials/textures/shader metadata into browser JSON and static assets.
- Use `AssetManager` for texture/audio/model loading.
- Replace Unity CG/surface shaders with a maintainable GLSL/Three material library by semantic family: unlit, diffuse, standard, additive bloom-style, particle quad, wireframe, and selection highlight.
- Add brush palette data, brush icons, tags, favorites, and unsupported/fallback metadata.
- Add shader warmup/material precreation for common variants.

Acceptance criteria:

- The full brush catalog is visible in data, with clear supported/fallback/unsupported status for every descriptor.
- MVP brushes render with correct color, alpha, double-sided/culling, emissive/additive behavior, and texture use.
- Brush changes through UI or commands update active brush state and subsequent strokes.
- Materials are shared safely and disposed when no longer used.
- No Unity shader file is treated as directly portable without an explicit semantic rewrite decision.

Testing plan:

- Unit: descriptor conversion tests for representative marker, tube, light, smoke/particle, and fallback brushes.
- Unit: material parameter tests for blend mode, culling, texture slots, emissive values, and color space conversions.
- Browser: open palette, switch brushes, draw sample strokes, and inspect screenshots.
- Runtime E2E: use ray/select input to choose brushes; use `ecs_snapshot`/`ecs_diff` when available to verify active brush changes; draw one stroke per MVP brush and query stroke metadata/material family.

## Phase 6: Layers, Canvas Transforms, Selection, and Widgets

Scope:

- Port Open Brush scene/canvas semantics: global scene pose, active canvas, layer canvases, visibility, locking, clearing, reordering, and selection canvas.
- Implement basic selection of strokes and widgets.
- Implement grabbable transform widgets for selected content, reference images/models, stencils, and lights using IWSDK interactions.
- Use IWSDK `Interactable`/`RayInteractable`/grabbable patterns rather than raw raycasters.
- Add layer and selection UI.

Acceptance criteria:

- Multiple layers can be created, hidden, locked, reordered, cleared, and selected.
- New strokes are assigned to the active layer and transform correctly with that layer.
- Selection moves selected strokes/widgets into selection state without losing original layer metadata.
- Grabbing/transforming selected entities works in XR and browser fallback.
- Undo/redo covers layer and selection commands.

Testing plan:

- Unit: layer ordering, visibility, lock, and command tests.
- Unit: transform conversion tests across world, scene, canvas, layer, pointer, and local spaces.
- Browser: create layers, draw on each, toggle visibility, and validate screenshots.
- Runtime E2E: aim/select layer UI; use `xr_select` for selection; use grab/controller movement or `xr_set_device_state` to transform selected content; inspect `ecs_query_entity` for layer ids, visibility flags, selection state, and transforms.

## Phase 7: Advanced Creation Tools

Scope:

- Port high-value Open Brush creation tools: eraser, color picker, brush picker, straightedge, lazy input, bimanual/tape mode, mirror/symmetry modes, grid snap, stencils, and basic transform tools.
- Preserve deterministic brush seeds and group-continuation flags for multi-stroke tools.
- Add audio feedback for drawing and tool actions through IWSDK audio components.
- Keep tool logic separate from rendering and persistence.

Acceptance criteria:

- Tools operate through a common `ActiveTool` lifecycle with enable/disable/update/late-update equivalents.
- Symmetry and straightedge generate expected grouped strokes with correct metadata.
- Eraser and selection operations are undoable and do not leak geometry.
- Color/brush picker update app state and UI state consistently.
- Tool transitions leave no stuck trigger, `Pressed`, grabbed, or recording state.

Testing plan:

- Unit: tool state machine tests and deterministic symmetry/straightedge fixtures.
- Unit: command merge/group continuation tests.
- Browser: exercise each tool through UI controls and pointer fallback.
- Runtime E2E: use controller path scripts for straightedge, symmetry, eraser, and picker flows; compare `ecs_snapshot`/`ecs_diff` before/after each operation; query for no active recording state after release.

## Phase 8: `.tilt` Save/Load, Catalog, and Playback

Scope:

- Implement `.tilt` reading/writing as a custom-header zip container with `metadata.json`, `data.sketch`, `thumbnail.png`, and optional `hires.png`.
- Preserve Open Brush `data.sketch` binary details: sentinel, version, brush index, extension masks, control-point masks, little-endian values, and .NET GUID ordering.
- Implement browser storage using IndexedDB or OPFS, with atomic transaction/temp-record semantics.
- Implement local sketch catalog: import, save, save-as, rename, duplicate, delete, thumbnails, and metadata search.
- Implement quickload playback first, then timestamp and distance playback.

Acceptance criteria:

- Known Open Brush `.tilt` fixtures load into the IWSDK app with correct stroke, brush, layer, color, pressure, timestamp, group, and seed data.
- Saving a sketch produces a valid `.tilt` with the Open Brush header and required entries.
- Save/load round trips are semantically stable within float tolerances.
- Failed saves leave the previous catalog entry readable.
- Playback renders all strokes once, can scrub or rewind without duplicate geometry, and handles missing brushes gracefully.

Testing plan:

- Unit: binary byte-level tests, invalid-header tests, forward-extension skip tests, and metadata schema tests.
- Unit: round-trip fixtures with multiple brushes, layers, groups, seeds, images/models, and thumbnails.
- Browser: import a `.tilt`, save it, reload the page, and reopen from catalog.
- Runtime E2E: use `ecs_find_entities` and `ecs_query_entity` after import and reload to compare stroke/layer/catalog counts; use screenshots to verify the scene is restored; use playback controls and inspect stroke visibility over time.

## Phase 9: GLB Export, Import Media, and Interop

Scope:

- Implement downloadable GLB export from live IWSDK/Three geometry.
- Preserve Open Brush concepts in GLB extras: brush GUID/name, layer roots, material names, triangle counts, stroke metadata, and `TB_*`-style scene metadata where practical.
- Implement reference image/model import as browser-managed assets with logical relative paths.
- Add basic self-contained export mode for local media where feasible.
- Keep advanced exports such as FBX, OBJ, USD, STL, LATK, WRL, camera path export, and full shader-generation parity as later work unless required for launch.

Acceptance criteria:

- Exported GLB validates with standard GLB validators.
- Exported GLB has nonzero geometry, expected mesh/material counts, layer structure, and metadata extras.
- Imported reference images/models appear in the scene, can be transformed, saved, loaded, and exported where supported.
- Media paths cannot escape managed storage roots.
- Missing external media shows recoverable warnings, not crashes.

Testing plan:

- Unit: GLB metadata/extras and path-safety tests.
- Browser: export a sketch, re-import or load it in a validator/viewer, and compare mesh/material counts.
- Runtime E2E: create strokes and imported media, export, reload app, import saved sketch, and query entities for media/stroke/layer counts; capture screenshots before and after.

## Phase 10: Full UI, Settings, Comfort, and Browser/XR Parity

Scope:

- Replace placeholder UI with Open Brush/Tilt Brush-style hand-attached controls, not a single large XR panel. Split brush palette, color picker, layers, tools, sketch catalog, settings, save/load/export, and help/status into workflow-specific panels that can attach to the wand/off-hand, detach, respawn, page, scroll, and hide/show like the original interaction model.
- Preserve controller role behavior: brush hand paints, wand/off-hand manages panels and tool state, handedness swaps controller roles, and bimanual tools can temporarily hide panels or reserve both controller attach points when needed.
- Port interaction semantics as well as functionality: controller rays, direct panel touch targets, thumbstick/trackpad paging, panel show/hide, wand rotation/placement, hover/press feedback, haptics, and XR visibility/session transitions.
- Keep browser and desktop parity for core workflows with a consolidated fallback/debug surface where useful, but do not treat that fallback panel as XR UI parity.
- Add accessibility and comfort options: scale, handedness, controller mapping, panel placement, locomotion decision, snap/continuous turn if locomotion is later enabled, and session visibility handling.
- Add robust error/reporting surfaces for unsupported brushes, invalid files, failed saves, asset load failures, and runtime state.

Acceptance criteria:

- A user can complete the main workflow entirely in XR using hand-attached Open Brush-style controls: choose brush/color, draw, undo/redo, use layers, save, reload, and export without opening one oversized panel.
- Handedness swaps preserve brush/wand roles, panel attachment points, haptics, and controller command routing.
- Bimanual tools and panel visibility behave like Open Brush references: panels can hide during two-hand operations, return afterward, and respawn to a reachable controller-relative position.
- The same core workflow works with browser pointer/keyboard fallback.
- UI state and ECS state remain synchronized after reloads and XR session transitions.
- No visible UI text overlaps or overflows at supported desktop and Quest browser resolutions.
- App handles `VisibilityState` changes without losing active stroke or corrupting saves.

Testing plan:

- Unit: settings persistence, command routing, handedness swaps, panel attachment state, panel show/hide state, and bimanual tool visibility tests.
- Browser: visual regression screenshots for the consolidated fallback/debug surface and individual panel layouts at desktop and mobile-like sizes.
- Runtime E2E: run the complete user journey using `xr_accept_session`, controller transforms/selects, direct panel touch/ray interactions, ECS queries, screenshots, and console log checks; repeat after `xr_end_session` and re-enter.
- Runtime E2E shortcuts: after each interaction route is proven once, use ECS state injection for repeated permutations such as handedness, panel placement, and tool state, then verify rendered/UI state with screenshots and scene/ECS inspection.

## Phase 11: Performance, Memory, and Quest Hardening

Scope:

- Profile and optimize stroke generation, buffer uploads, batching, material variants, transparent overdraw, texture memory, save/load memory peaks, and startup time.
- Add stress scenes: many strokes, many transparent strokes, large imported `.tilt`, many layers, heavy symmetry, and repeated undo/redo.
- Add explicit disposal paths for strokes, batches, materials, textures, audio, imported media, and failed loads.
- Add performance counters to ECS/debug UI.
- Validate on physical Quest hardware, not just emulator.

Acceptance criteria:

- Target VR frame budgets are met on Quest-class hardware for representative scenes.
- Repeated draw/undo/delete/save/load cycles do not produce unbounded entity, geometry, texture, or memory growth.
- Large scenes degrade gracefully with warnings or progressive loading rather than hard failure.
- Startup shader/material warmup does not cause unacceptable hitches during first draw.
- Runtime debug counters expose draw calls, vertices, batches, strokes, buffer upload bytes, and memory estimates.

Testing plan:

- Unit: resource lifecycle tests for dispose paths.
- Browser: long-run stress test with repeated scripted drawing and deletion.
- Runtime E2E: automated draw loops via controller transforms; query entity counts and debug counters before/after; capture screenshots for visual corruption; use Quest device/perf tooling for final FPS, memory, and thermal validation.

## Phase 12: Local Interchange, Advanced Export, and Extended Feature Parity

Scope:

- Complete local/offline interchange after the local app is stable: local sketch sets, browser file picker/download workflows, packaged media references, cached thumbnails, remix/source metadata, source sketch IDs, import/export progress, cancellation, and recoverable error handling.
- Keep all interchange workflows account-free and network-independent. Provider-backed storage, service catalogs, and multi-user/networked editing are out of scope for this port.
- Add advanced exports and Open Brush parity features: full shader generation, legacy glTF compatibility, FBX/OBJ/USD/STL/LATK/WRL, camera paths, video/GIF tooling, text-to-strokes, tutorials, APIs, and scripting.

Acceptance criteria:

- Local sketch import/export workflows remain fully functional without network access or accounts.
- Exported packages include strokes, layers, metadata, managed media references, thumbnails, remix/source metadata, and warnings needed for an offline round trip.
- Import/export progress, cancellation, cache invalidation, and recoverable error behavior are explicit and testable.
- Advanced export formats are validated independently and do not regress GLB or `.tilt`.
- No networked, account-backed, or multi-user behavior is required for complete status.

Testing plan:

- Unit: local package manifests, remix/source metadata, export adapters, progress/cancel behavior, cache invalidation, and offline error paths.
- Browser: offline import/export/download/upload-file round trips and catalog thumbnail cache invalidation.
- Runtime E2E: verify locally imported sketches render, save, reload, and export in XR; inspect ECS state after local loads; use screenshots and console logs for regressions.
- External: file-format validators and desktop viewers for advanced export formats.

## Definition of Complete

The port is complete when:

- The IWSDK app can create, edit, save, load, and export Open Brush sketches in XR and browser fallback.
- `.tilt` compatibility is proven against known Open Brush fixtures, including strokes, layers, metadata, thumbnails, pressure, timestamps, groups, seeds, and core media references.
- The brush catalog has explicit supported/fallback/unsupported status, and launch-target brushes render with acceptable visual fidelity.
- Undo/redo, selection, layers, core tools, palette, settings, and catalog workflows work end to end through hand-attached XR controls, with browser fallback kept separate.
- GLB export produces valid files with expected geometry, materials, layers, and metadata.
- IWSDK runtime E2E tests cover drawing, brush switching, tools, layers, save/load, import/export, and session transitions.
- Quest hardware performance is acceptable for representative real sketches.
- Resource disposal and long-run stress tests show stable entity/resource counts.

## Major Risks

- Brush fidelity is the largest technical risk. Unity CG/surface shaders, command buffers, bloom behavior, geometry shaders, and shader keyword systems do not map directly to WebGL/WebXR.
- Open Brush coordinate spaces are subtle: scene, canvas, room, pointer, local stroke space, and brush scale all affect density and replay.
- `.tilt` compatibility requires exact binary behavior, including .NET GUID byte order and extension skipping.
- Transparent and additive brushes can overload mobile stereo rendering.
- Selection and intersection behavior may need different algorithms; Unity GPU ID readback can stall badly in WebXR.
- Hand-attached UI fidelity is a product risk as much as a technical one: panel placement, brush/wand roles, direct touch, ray targeting, paging, haptics, and bimanual visibility need to feel like Open Brush, not just expose the same commands.
- Browser persistence and atomic save behavior differ from Unity filesystem rename semantics.
- Emulator E2E is necessary but insufficient; Quest hardware testing remains mandatory.
