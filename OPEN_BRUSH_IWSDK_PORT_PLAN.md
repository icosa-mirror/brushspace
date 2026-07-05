# Open Brush to IWSDK Port Plan

Generated: 2026-07-04

This plan ports Open Brush from its Unity runtime into an IWSDK/WebXR application. It is based on the Open Brush source under `reference/`, the current IWSDK starter in `src/`, and IWSDK API/reference lookups for world setup, ECS, interaction, assets, PanelUI, rendering, and runtime test tooling.

## Source Grounding

Open Brush source areas inspected:

- App lifecycle and service locator: `reference/Assets/Scripts/App.cs`
- Scene, canvases, and layers: `reference/Assets/Scripts/SceneScript.cs`, `reference/Assets/Scripts/CanvasScript.cs`
- Input and command routing: `reference/Assets/Scripts/InputManager.cs`, `reference/Assets/Scripts/Input/VrInput.cs`, `reference/Assets/Scripts/Input/ControllerInfo.cs`
- Painting flow: `reference/Assets/Scripts/Tools/FreePaintTool.cs`, `reference/Assets/Scripts/PointerManager.cs`, `reference/Assets/Scripts/PointerScript.cs`
- Tool interaction parity: `reference/Assets/Scripts/Tools/StrokeModificationTool.cs`, `reference/Assets/Scripts/Tools/EraserTool.cs`, `reference/Assets/Scripts/Tools/BaseStrokeIntersectionTool.cs`, `reference/Assets/Scripts/Tools/ColorSelectionTool.cs`, `reference/Assets/Scripts/Tools/BrushSelectionTool.cs`, `reference/Assets/Scripts/Tools/BrushNColorTool.cs`, `reference/Assets/Scripts/Tools/DropperTool.cs`, `reference/Assets/Scripts/Tools/SelectionTool.cs`, `reference/Assets/Scripts/Tools/FreePaintTool.GridSnap.cs`, `reference/Assets/Scripts/Tools/FreePaintTool.LazyInput.cs`, `reference/Assets/Scripts/Tools/FreePaintTool.BimanualInput.cs`, `reference/Assets/Scripts/StraightEdgeGuideScript.cs`, `reference/Assets/Scripts/ParametricStrokeCreator.cs`, `reference/Assets/Scripts/WidgetManager.cs`, `reference/Assets/Scripts/Widgets/StencilWidget.cs`
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

Implementation-time runtime status:

- Managed `iwsdk-runtime` E2E has since been used against the live app. Do not use direct Playwright for IWSDK UI/XR checks; the runtime-managed browser owns scene, console, screenshot, XR, and ECS inspection.
- Phase 7 live checks previously confirmed Draw creates finalized strokes, live Color Picker copies stroke color, Brush Picker copies stroke brush and size, and live Eraser hides intersected visible strokes with undo history. A later tool-spec audit plus user testing reopened eraser as a parity risk: fixed-radius AABB intersection can still make erasing feel broken compared with the upstream physical eraser tool. Translated-stroke misses and centerline-only bounds have now been fixed for live authored strokes, but rotation/scale, layer/canvas transforms, widgets, and generated-triangle intersection remain parity gaps.
- Default Draw/Line thickness was re-audited against upstream Open Brush. The app must start on the upstream Light brush (`2241cd32-8ba2-48a5-9ee7-2caef7e9ed62`, range `[0.05, 0.2]`) at `BrushSize01=0.5`; with the current IWSDK live-scale calibration this produces an initial live stroke size of about `0.002353`. The previous Marker fixture startup brush made Draw and Line about 8.5x thicker than that target.
- Eraser sizing has been partially corrected: the IWSDK eraser uses the upstream `StrokeModificationTool` range midpoint (`[0.1, 0.3]` -> `0.2`) instead of the previous `0.08` radius. Remaining eraser parity still requires visible/resizable tool feedback and tighter geometry/widget intersection.
- Managed runtime checks on 2026-07-05 confirmed the current live app starts on the upstream Light brush with `BrushSettings.size01=0.5` and `BrushSettings.size=0.002353189...`; Draw and Straightedge-created strokes record that same `BrushStroke.brushSize` when the active brush ray is not over a panel. Eraser also hides an intersected visible stroke and records undo history when aimed at the stroke bounds. A false-blocking bug was found at the same time: XR panel-focus suppression considered the hidden fallback panel and could block Draw/Eraser/Picker even when the visible wand UI was not the intended target. The port now skips `OpenBrushPanelAttachment.visible=false`, object-hidden, and zero-size panels for panel focus checks.
- Managed runtime checks on 2026-07-05 also confirmed transformed-stroke erasing for translated strokes: a controller-drawn stroke was moved through `Transform.position=[0.6,0,0]`, the app was switched to Eraser, and erasing at the translated world-space stroke center changed `BrushStroke.visible/renderVisible` to `false`, reduced visible stroke counts to zero, and added the erase operation to undo history. The implementation now offsets stroke bounds by each stroke object's world position for eraser and picker checks.
- Managed runtime checks on 2026-07-05 confirmed live authored stroke bounds now mirror generated mesh bounds instead of only control-point centerlines. A controller-drawn Light stroke centered at `z=-1.7000` reported `BrushStroke.minBounds.z=-1.7011766` and `maxBounds.z=-1.6988234`, matching the generated half-width. Eraser/picker intersection now treats these generated bounds as already including brush width to avoid double inflation.
- Straight Edge semantics have been corrected at the state-model level: the fallback and wand Line buttons now toggle `OpenBrushAppState.straightEdgeEnabled` while the selected `activeTool` remains `free-paint`, and stroke authoring resolves the effective tool to Straightedge only while that mode is active. Line strokes now regenerate the upstream-style `LineCreator` sample count of 31 control points (`n=30`, inclusive endpoints) with pressure `1` and flat-line orientation as the endpoint moves. Full parity still requires upstream orientation-adjustment/slerp behavior, the reference guide/meter UI, and circle/sphere creator modes.
- Phase 10 foundation has progressed: the consolidated `welcome` panel is now explicitly the browser/debug fallback. In browser/non-immersive mode it remains the fallback `ScreenSpace` panel; in XR it is hidden by `PanelAttachmentSystem`, while lightweight `Color`, `Brush`, and `Tools` `PanelUI` entities form a fixed off-hand/wand ring. The ring consumes `SettingsState` (`dominantHand`, `panelAnchor`, `panelDistance`, `panelHeight`, `panelScale`, `wandPanelRotationSteps`), attaches to the requested hand ray or XR-origin anchor, applies panel sizing through `PanelUI.maxWidth/maxHeight`, exposes `OpenBrushPanelAttachment` role/mode/slot/visibility fields for runtime inspection, mirrors across handedness swaps, and rotates by cached slot steps. First-pass ring interactions are now wired for Tools Draw/Line/Erase, Brush Prev/Next, and Color swatches through the existing PanelDocument/BrushSettings/OpenBrushAppState paths. The configured Wand hand can also rotate the fixed ring with horizontal thumbstick deflections; the edge detector only applies one rotation per deflection and respects `xrRayEnabled`. This is still a foundation: panel content is not yet the full Open Brush palette system, direct touch/paging/popups are not complete, and floating/alternate panels remain pending.
- Phase 10 role routing has begun: `InputCommandSystem` now derives Brush/Wand hands from `SettingsState.dominantHand`; only the Brush hand maps trigger/squeeze into paint/alternate, only the Wand hand maps controller undo/redo, idle XR input prioritizes the Brush hand, and both left/right `BrushPointer` entities exist for pointer ownership/debug state. This is not full controller parity yet; panel rotation, controller hints/materials, bimanual visibility, and direct-touch panel affordances remain pending.
- Phase 10 settings consumption has begun: `InputCommandSystem` now consumes `SettingsState.browserPointerEnabled` and `SettingsState.xrRayEnabled`. Disabled browser pointer input is cleared and ignored as a command source; disabled XR rays/controllers keep connection state visible for diagnostics while suppressing paint/alternate/undo/redo command activity.

## UI and Interaction Audit Addendum

The port must preserve Open Brush interaction semantics, not just expose equivalent command names.

- Draw/freehand: painting is the brush-controller Activate action. Trigger ratio feeds pressure every frame; pointer pose is processed through stencil magnetization, bimanual/lazy input, then grid snap. Default brush selection is upstream Light at `BrushSize01=0.5` unless a brush-specific last size exists.
- Straightedge/line: straightedge is an Open Brush global command/toggle layered onto FreePaint, with guide/meter feedback and parametric line/circle/sphere creators, not a standalone active tool or merely a separate flat UI button. It must use the same active brush, color, size, and stroke metadata as freehand. The IWSDK line helper now matches upstream `LineCreator`'s 31 sampled control points and pressure `1`; remaining parity work is upstream normal/orientation adjustment, guide/meter behavior, and circle/sphere modes.
- Eraser: eraser is a live brush-controller stroke-modification tool. It is hot only while Activate is held, has its own visible/resizable tool radius, intersects actual visible stroke/widget geometry, deletes whole strokes/widgets, and participates in undo/redo. Current IWSDK eraser behavior accounts for stroke object world translation and generated mesh bounds in AABB tests, but still needs rotation/scale and layer/canvas transform coverage, generated triangle/segment intersection beyond AABB bounds, widget intersection, and visible/audio/haptic feedback.
- Color/brush/dropper tools: reference one-shot pickers copy color, brush, or both. The VR Dropper samples image widgets first, then strokes, and copied stroke size is room/canvas-scale aware.
- Selection: selection is an active tool with add/remove selection state, active-layer rules, pinned-widget exclusions, duplicate-on-hold behavior, selection canvas movement, and controller UI affordances. A "select last stroke" fallback is not parity.
- Mirror/symmetry: symmetry is pointer duplication with mode-dependent active pointer counts and transforms. It is not just post-finalize mirroring.
- Grid/snap: snap is canvas-aware, can preserve degrees of freedom through stickiness, and should have separate selection/widget transform helpers.
- Lazy input: lazy mode is toggled by undo, changes behavior while painting, is disabled when grid snap is active, depends on pressure/delta time, and needs guide/ghost feedback.
- Tape/measure: tape is a bimanual mode that hides panels, uses wand/brush controller roles, pulls the lazy cursor along the controller line, and blocks incompatible transforms while active.
- Stencils: stencils magnetize free-paint before lazy/grid processing, maintain previous active stencil while painting, use attract/hysteresis, and need visible stencil widget state.
- Hand-attached UI: core brush/color/tool controls belong on off-hand/wand-attached spatial panels with brush/wand role semantics. The consolidated panel remains a browser/debug fallback, not the target XR UX.
- Tool-spec audit queue: recheck every implemented tool's source spec before declaring parity, including the user-reported Draw/Line startup thickness and Eraser-not-working paths. Draw and Straightedge/Line startup thickness now has a concrete target and managed-runtime evidence via the upstream Light brush; Line control-point generation now has a `LineCreator`-grounded unit test and is exposed on the hand-attached Tools panel; translated-stroke eraser hits and generated mesh bounds are covered. Remaining priority checks are brush-size controls, per-brush pressure-size behavior, line orientation/normal adjustment, eraser rotation/scale/layer-transform and triangle/segment/widget intersection, eraser visual radius/audio/haptic feedback, picker/dropper size copying, straightedge guide/meter behavior, circle/sphere modes, and any panel-focus conditions that can make eraser appear broken.

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

- Port high-value Open Brush creation tools: eraser, color picker, brush picker, straightedge mode, lazy input, bimanual/tape mode, mirror/symmetry modes, grid snap, stencils, and basic transform tools.
- Port each tool's Open Brush spec, not only its label: brush size uses normalized `BrushSize01` mapped through brush-specific size ranges, straightedge/line uses the active pointer brush size, brush/color pickers copy the picked stroke's brush, color, and size where Open Brush does, and eraser is a live brush-controller intersection tool.
- Preserve deterministic brush seeds and group-continuation flags for multi-stroke tools.
- Add audio feedback for drawing and tool actions through IWSDK audio components.
- Keep tool logic separate from rendering and persistence.

Acceptance criteria:

- Tools operate through a common lifecycle with enable/disable/update/late-update equivalents, while preserving Open Brush distinctions between active tools and global/pointer modes such as Straight Edge.
- Symmetry and straightedge generate expected grouped strokes with correct metadata; Straight Edge must behave as a FreePaint mode/toggle and line mode must keep the reference-compatible 31-point parametric sample set instead of only two endpoints.
- Default draw and straightedge strokes start from the upstream Light brush at `BrushSize01=0.5` and derive absolute stroke size from that brush's range; they must not inherit Marker fixture size or raw Open Brush meter-like values.
- Brush size controls persist normalized size and derive absolute stroke size from the active brush range; saved strokes still store absolute `brushSize` and `brushScale`.
- Eraser deletes only intersected visible/unlocked strokes or widgets through live brush-controller interaction; translated stroke-object offsets and generated mesh bounds are honored during hit tests; it has visible/resizable tool radius behavior equivalent to Open Brush `StrokeModificationTool`; and screen-space or hand-attached panel hover cannot globally block XR erasing unless the active pointer ray is actually over the panel. Full parity still requires rotation/scale, layer/canvas transform, triangle/segment, and widget intersection coverage. Eraser and selection operations are undoable and do not leak geometry.
- Color/brush picker update app state and UI state consistently, including picked stroke size when the reference tool does.
- Live Color/Brush Picker paths work from controller pose, not only from fallback panel buttons, and copy color/brush/size through IWSDK vector/component APIs without runtime errors.
- Tool transitions leave no stuck trigger, `Pressed`, grabbed, or recording state.

Testing plan:

- Unit: tool state machine tests and deterministic symmetry/straightedge fixtures.
- Unit: brush-size range conversion, upstream Light default size, picked-size propagation, straightedge thickness parity, eraser hit/miss tests, and transformed-stroke eraser regressions.
- Unit: generated brush bounds include visible ribbon/tube/particle width, and eraser/picker intersection does not double-inflate bounds that already include brush width.
- Unit: command merge/group continuation tests.
- Browser: exercise each tool through UI controls and pointer fallback.
- Runtime E2E: use controller path scripts for draw, straightedge, symmetry, eraser, and picker flows; compare `ecs_snapshot`/`ecs_diff` before/after each operation when available; query for expected Light brush GUID/default stroke size, picked color/brush/size, hidden/deleted stroke counts, undo/redo state, and no active recording state after release.
- Runtime E2E: include transformed-stroke eraser coverage by drawing through the normal controller path, moving the stroke entity via `Transform.position` after that route is proven, erasing at the translated world-space stroke center, and verifying `BrushStroke.visible/renderVisible=false`, visible stroke counts drop, and undo history increments.
- Runtime E2E: draw a controller-authored stroke and verify `BrushStroke.minBounds/maxBounds` include generated mesh width rather than only control-point centerline bounds.
- Runtime E2E: include a regression where a screen-space or hand-attached panel is hidden or hovered by some pointer while the active XR brush ray is not over a visible focusable panel; Draw, Eraser, and Picker must still work from the active brush controller.

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

- Treat the current consolidated `welcome` panel as browser/debug fallback only. Phase 10 is incomplete until XR workflows use Open Brush-style spatial panels and controller-role interactions.
- Build a panel framework before replacing panel contents: `PanelType`, fixed/floating/alternate panel flags, availability modes, popup ownership, cached layout, show/hide transitions, respawn/revive behavior, and API-level open/close/position/attach/detach commands.
- Implement semantic controller roles. `Brush` and `Wand` roles must map onto physical left/right hands through handedness settings, preserve separate ray/grip/tool/pointer/panel attach points, support touch locator equivalents, and keep geometry stable across swaps.
- Implement the core off-hand wand ring as spatial UI, not a flat menu: fixed Color, Brush, and Tools panels at 0/120/240 degree slots, wand scroll/snap rotation, panel attach hysteresis, overlap avoidance, error tint, audio, and haptics.
- Implement floating and alternate panels after the core ring: Layers as floating/attachable, Sketchbook and Settings as wand-attached alternate modes, plus Reference/Camera/Guide/Environment-style surfaces as later panel types.
- Preserve panel input ownership and interaction semantics: brush ray/head gaze arbitration, direct poke targets, hover/press reticle behavior, component ownership, paging/popups, panel focus suppressing brush preview/painting, and controller material or equivalent affordances.
- Preserve tool-driven panel visibility. Bimanual/tape/world-grab/loading states request panels hidden, restore them afterward, and keep undo/redo or panel commands gated while drawing, grabbing, or blocked by panel focus.
- Add accessibility and comfort options: scale, handedness, controller mapping, panel placement, locomotion decision, snap/continuous turn if locomotion is later enabled, and session visibility handling.
- Add robust error/reporting surfaces for unsupported brushes, invalid files, failed saves, asset load failures, and runtime state.

Acceptance criteria:

- A user can complete the main workflow entirely in XR using hand-attached Open Brush-style controls: choose brush/color, draw, undo/redo, use layers, save, reload, and export without opening one oversized panel.
- The fixed wand ring has three reachable core panels, rotates by wand scroll/snap controls, and survives `xr_end_session`/re-enter with the same cached layout.
- Floating panels can open, close, respawn, attach to wand slots, detach into world space, and reject invalid attach positions without losing state.
- Sketchbook and Settings use alternate wand-attached panel modes with expected dismissal/return behavior; browser/debug fallback remains separate.
- Handedness swaps preserve brush/wand roles, panel attachment points, haptics, and controller command routing.
- Controller command routing is role-based: brush trigger paints/selects, wand commands handle panel rotation/undo/redo, and keyboard/browser fallbacks preserve core workflows.
- Bimanual tools and panel visibility behave like Open Brush references: panels can hide during two-hand operations, return afterward, and respawn to a reachable controller-relative position.
- Panel focus, direct touch, and ray hover suppress painting/preview when appropriate and restore pointer/tool visuals after leaving the panel.
- The same core workflow works with browser pointer/keyboard fallback.
- UI state and ECS state remain synchronized after reloads and XR session transitions.
- No visible UI text overlaps or overflows at supported desktop and Quest browser resolutions.
- App handles `VisibilityState` changes without losing active stroke or corrupting saves.

Testing plan:

- Unit: settings persistence, role-based command routing, handedness swaps, attach point resolution, panel lifecycle state, fixed/floating/alternate mode transitions, paging ownership, panel show/hide gates, haptic event routing, and bimanual tool visibility tests.
- Browser: visual regression screenshots for the consolidated fallback/debug surface and individual panel layouts at desktop and mobile-like sizes.
- Runtime E2E: run the complete user journey using `xr_accept_session`, controller transforms/selects, direct panel touch/ray interactions, `xr_set_gamepad_state` for wand scroll/paging, ECS queries, screenshots, and console log checks; repeat after `xr_end_session` and re-enter.
- Runtime E2E: verify the fixed wand ring, attach/detach, respawn, handedness swap, panel focus suppression, and bimanual hide/restore with `ecs_snapshot`/`ecs_diff`.
- Runtime E2E panel-focus regression: in XR, force the browser fallback panel to remain hidden with `OpenBrushPanelAttachment.visible=false` and `object3D.visible=false`; aim the brush ray through its old plane and verify Draw/Eraser/Picker are not blocked. Then aim at a visible wand panel and verify painting/erasing is blocked only for the active brush ray intersecting that visible panel.
- Runtime E2E Line-on-wand regression: activate the wand Tools Line button and verify it toggles `OpenBrushAppState.straightEdgeEnabled` without changing `activeTool` away from `free-paint`; draw from the Brush hand and query `BrushStroke.toolId=straightedge`, active Light `brushSize`, and `controlPointCount=31`.
- Runtime E2E foundation check: query `OpenBrushPanelAttachment`, `SettingsState`, `PanelUI`, and `Transform`; change `dominantHand`/`panelAnchor` through ECS shortcuts after the UI route is proven; verify the panel reattaches to left ray, right ray, or XR origin and remains visible in screenshots without restarting the managed server.
- Runtime E2E role-routing check: query `InputCommandState` and both `BrushPointer` entities; set `SettingsState.dominantHand` through ECS shortcuts, drive physical controller triggers/buttons with managed XR tools, and verify Brush-hand trigger paints while Wand-hand trigger does not paint, Wand-hand undo/redo remains available, and `primaryHand`/pointer drawing state follows the configured Brush hand.
- Runtime E2E settings-gating check: toggle `browserPointerEnabled` and `xrRayEnabled` through the proven UI route or ECS shortcuts; verify browser pointer input is ignored when disabled, XR command activity is suppressed while controller connection fields remain true, and re-enabling restores normal Draw/Eraser behavior without reload.
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
- Keep all interchange workflows account-free and network-independent. Multiplayer, cloud storage, cloud-powered sharing, provider-backed storage, service catalogs, and multi-user/networked editing are out of scope for this port.
- Add advanced exports and Open Brush parity features: full shader generation, legacy glTF compatibility, FBX/OBJ/USD/STL/LATK/WRL, camera paths, video/GIF tooling, text-to-strokes, tutorials, APIs, and scripting.

Acceptance criteria:

- Local sketch import/export workflows remain fully functional without network access or accounts.
- Exported packages include strokes, layers, metadata, managed media references, thumbnails, remix/source metadata, and warnings needed for an offline round trip.
- Import/export progress, cancellation, cache invalidation, and recoverable error behavior are explicit and testable.
- Advanced export formats are validated independently and do not regress GLB or `.tilt`.
- No multiplayer, cloud, cloud-powered sharing, networked, account-backed, or multi-user behavior is required for complete status.

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
- Brush size, straightedge thickness, eraser, picker, undo/redo, selection, layers, core tools, palette, settings, and catalog workflows work end to end through hand-attached XR controls, with browser fallback kept separate.
- GLB export produces valid files with expected geometry, materials, layers, and metadata.
- IWSDK runtime E2E tests cover drawing, brush switching, tools, layers, save/load, import/export, and session transitions.
- Quest hardware performance is acceptable for representative real sketches.
- Resource disposal and long-run stress tests show stable entity/resource counts.

## Major Risks

- Brush fidelity is the largest technical risk. Unity CG/surface shaders, command buffers, bloom behavior, geometry shaders, and shader keyword systems do not map directly to WebGL/WebXR.
- Open Brush coordinate spaces are subtle: scene, canvas, room, pointer, local stroke space, and brush scale all affect density and replay.
- Tool spec parity is easy to fake accidentally: normalized brush size, per-brush ranges, pressure, eraser radius/intersection, picker size copying, and line/straightedge behavior need source-grounded tests.
- `.tilt` compatibility requires exact binary behavior, including .NET GUID byte order and extension skipping.
- Transparent and additive brushes can overload mobile stereo rendering.
- Selection and intersection behavior may need different algorithms; Unity GPU ID readback can stall badly in WebXR.
- Hand-attached UI fidelity is a product risk as much as a technical one: panel placement, brush/wand roles, direct touch, ray targeting, paging, haptics, and bimanual visibility need to feel like Open Brush, not just expose the same commands.
- Browser persistence and atomic save behavior differ from Unity filesystem rename semantics.
- Emulator E2E is necessary but insufficient; Quest hardware testing remains mandatory.
