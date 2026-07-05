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
- Phase 7 live checks previously confirmed Draw creates finalized strokes, live Color Picker copies stroke color, Brush Picker copies stroke brush and size, and live Eraser hides intersected visible strokes with undo history. A later tool-spec audit plus user testing reopened eraser as a parity risk: fixed-radius AABB intersection can still make erasing feel broken compared with the upstream physical eraser tool. Translated-stroke misses and centerline-only bounds have now been fixed for live authored strokes, and eraser hit tests now use rendered generated triangle geometry in world space when a stroke mesh is available. Remaining parity gaps include widget intersection, non-triangle stroke representations, picker/selection geometry parity, full layer/canvas semantics, audio, haptics, and performance hardening for large sketches.
- Default Draw/Line thickness was re-audited against upstream Open Brush. The app must start on the upstream Light brush (`2241cd32-8ba2-48a5-9ee7-2caef7e9ed62`, range `[0.05, 0.2]`) at `BrushSize01=0.5`; upstream sqrt-radius interpolation gives raw Open Brush room-space size `0.1125`, and the current IWSDK live-scale calibration maps that to an initial live stroke size of about `0.002353` (`2.4 mm` in the panel readout). The previous Marker fixture startup brush made Draw and Line about 8.5x thicker than that target.
- A later per-tool audit found one remaining thickness fallback risk: `BrushSettings.size` still defaulted to the old IWSDK calibration size (`0.02`) even though the shell path overrides it to the Light-derived `0.002353...`. The component fallback now uses the Light startup range `[0.05, 0.2]` at `BrushSize01=0.5`, so secondary settings entities do not accidentally start Draw/Line at the old thick size.
- Eraser sizing has been corrected for the current interaction surface: the IWSDK eraser uses the upstream `StrokeModificationTool` range (`[0.1, 0.3]`, default midpoint `0.2`) instead of the previous `0.08` radius. The runtime creates an `OpenBrushEraserCursor` entity, applies the Open Brush scene's eraser `m_PointerForwardOffset=0.05`, and routes Brush panel `Size -/+` buttons to eraser radius changes while Eraser is active. Remaining eraser parity still requires hot/cold material polish, audio/haptics, and tighter geometry/widget intersection.
- Managed runtime checks on 2026-07-05 confirmed the current live app starts on the upstream Light brush with `BrushSettings.size01=0.5` and `BrushSettings.size=0.002353189...`; Draw and Straightedge-created strokes record that same `BrushStroke.brushSize` when the active brush ray is not over a panel. Eraser also hides an intersected visible stroke and records undo history when aimed at the stroke bounds. A false-blocking bug was found at the same time: XR panel-focus suppression considered the hidden fallback panel and could block Draw/Eraser/Picker even when the visible wand UI was not the intended target. The port now skips `OpenBrushPanelAttachment.visible=false`, object-hidden, and zero-size panels for panel focus checks.
- Managed runtime checks on 2026-07-05 also confirmed transformed-stroke erasing for translated strokes: a controller-drawn stroke was moved through `Transform.position=[0.6,0,0]`, the app was switched to Eraser, and erasing at the translated world-space stroke center changed `BrushStroke.visible/renderVisible` to `false`, reduced visible stroke counts to zero, and added the erase operation to undo history. The implementation now offsets stroke bounds by each stroke object's world position for eraser and picker checks.
- Managed runtime checks on 2026-07-05 confirmed live authored stroke bounds now mirror generated mesh bounds instead of only control-point centerlines. A controller-drawn Light stroke centered at `z=-1.7000` reported `BrushStroke.minBounds.z=-1.7011766` and `maxBounds.z=-1.6988234`, matching the generated half-width. Eraser/picker intersection now treats these generated bounds as already including brush width to avoid double inflation.
- Per-brush pressure-size behavior is now source-grounded for the mapped MVP brushes. Inventory entries carry Open Brush `m_PressureSizeRange` values for Marker `[0.1,1]`, Flat `[1,1]`, Light `[0.15,1]`, MylarTube `[0.25,1]`, and Smoke `[0.2,1]`; runtime and GLB generation pass that range into geometry generation instead of using a global hard-coded pressure floor. Managed runtime checks on 2026-07-05 drew a Light stroke with XR trigger pressure `0.2`; `BrushStroke` bounds showed width/brushSize ~= `0.32`, matching `0.15 + 0.85 * 0.2`.
- Managed runtime checks on 2026-07-05 confirmed eraser cursor/offset behavior after hot reload without restarting the server: `OpenBrushEraserCursor` appears only when `activeTool=eraser`, reports `radius=0.2`, `forwardOffset=0.05`, right-hand parentage, and `hot=true` while the Brush-hand trigger is held. An offset-specific erase regression drew a stroke at `z=-1.24`, erased from a raw sample center at `z=-1.0`, and hid the stroke only because the eraser center used the reference forward offset.
- XR brush-size controls are now implemented on the hand-attached Brush panel, with matching browser fallback controls. The buttons nudge normalized `BrushSettings.size01` by a clamped `0.05`, immediately recompute absolute `BrushSettings.size` through the active brush's Open Brush size range, and update the panel readout. Managed runtime checks on 2026-07-05 used the actual XR `Size +` button to change the Light brush from `size01=0.5` / `size=0.002353189...` to `size01=0.55` / `size=0.002512683...`; a Draw stroke and a Straightedge stroke then both recorded `BrushStroke.brushSize=0.002512683...`, with the Straightedge stroke still reporting `toolId=straightedge` and `controlPointCount=31`.
- XR eraser-size controls now reuse the hand-attached Brush panel while Eraser is active. Managed runtime checks on 2026-07-05 used the actual XR `Size +` button after setting `activeTool=eraser`; `OpenBrushEraserCursor.radius` and transform scale changed from `0.2` to `0.21`, the wand readout changed to `Eraser 55% (0.210)`, and fresh post-reload console warn/error logs remained empty. A boundary erase regression placed a Light stroke about `0.2038m` from the eraser center, outside the old fixed `0.2` hit radius but inside the resized `0.21` radius, and the stroke changed to `visible=false/renderVisible=false`.
- Eraser intersection now has a generated-geometry path before the legacy AABB fallback. Live stroke meshes are tested as indexed triangles in world space, honoring `BufferGeometry.drawRange.start/count` and the object's `matrixWorld`; malformed or non-mesh strokes still fall back to existing bounds checks. Unit coverage now exercises indexed triangle hit/miss, draw starts/counts, and matrix-transformed geometry.
- Managed runtime checks on 2026-07-05 confirmed the generated-geometry eraser path after hot reload without restarting the dev server. A controller-authored Light stroke with 4 control points and 18 generated indices was moved to `Transform.position=[0.6,0,0]` and `Transform.orientation=[0,0.7071,0,0.7071]`; erasing at the transformed mesh surface around `[-0.5,1.15,-0.11]`, far from the legacy translated AABB around `[0.65..0.77,1.15,-1.10]`, changed `BrushStroke.visible/renderVisible` to `false`, advanced undo history, and produced no fresh warn/error console logs.
- A follow-up tool-spec audit found that Open Brush `FreePaintTool` and `EraserTool` operate from the Brush controller attach/tool attach pose, while UI focus and panel selection use ray-like pointing separately. The IWSDK port now samples Draw, Straightedge/Line, Picker, Tape anchor, and Eraser contact from `world.player.gripSpaces`, keeps panel-focus suppression on `world.player.raySpaces`, and parents the visible eraser cursor to the Brush-hand grip-space entity. Managed runtime checks on 2026-07-05 after a clean hot reload confirmed startup `BrushSettings.size=0.002353189...`, a Draw stroke and Straightedge stroke both recorded that size, Eraser hid both grip-contacted strokes, visible stroke count dropped from 2 to 0, undo depth advanced from 2 to 3, and fresh warn/error logs were empty.
- A second managed runtime check on browser generation 338 re-ran the user-reported Draw/Line/Eraser paths after the straightedge-pressure regression landed. Draw created a finalized Light stroke at `BrushStroke.brushSize=0.002353189...`; Straightedge created a 31-control-point stroke at the same size while the trigger value was only `0.2`; Eraser then hid both generated strokes, changed `PerformanceState.visibleStrokeCount` from `2` to `0`, advanced undo depth from `2` to `3`, kept the cursor grip-parented with `radius=0.2` and `forwardOffset=0.05`, and produced no fresh warning/error console logs.
- A later managed runtime spot-check on browser generation 346 investigated the renewed user report that Draw/Line defaults feel too thick and Eraser does not seem to work. Source inspection confirmed upstream `PointerScript.BrushSize01` uses sqrt-radius interpolation, `PointerScript.SetBrush` resets new brushes to `BrushSize01=0.5`, the default Light brush's raw Open Brush size at that setting is `0.1125`, `FreePaintTool` writes trigger ratio into pressure, and `LineCreator` forces every straightedge control point to `m_Pressure=1f`; therefore Line can visually appear thicker than a lightly pressed Draw stroke even when both share the same active brush size. The same spot-check switched the live app from the previously tested Brush Picker state to Eraser via ECS, pressed the Brush-hand trigger at an overlapping controller pose, and verified the existing `BrushStroke` changed to `visible=false/renderVisible=false`. Core stroke erasing is still working; the remaining queue item is to test the full user-visible route: wand Tools Eraser activation, cursor feedback, active Brush-panel size state, and panel-focus conditions that can make erasing look inactive.
- Managed runtime checks on browser generation 348 after the unit-labeled Brush panel readout kept the dev server alive and exercised the renewed Draw/Line/Eraser report through the user-visible route. Fresh startup still reported Light `BrushSettings.size01=0.5` and `size=0.002353189...`. A first Draw attempt with the Brush-hand ray through the wand panel area created no stroke, confirming panel focus can legitimately make drawing/erasing appear inactive; moving the Brush hand clear of the panel ring created a finalized 8-control-point Light stroke at `BrushStroke.brushSize=0.002353189...`. Selecting Erase by ray-selecting the hand-attached Tools panel changed `OpenBrushAppState.activeTool` to `eraser`, made `OpenBrushEraserCursor.visible=true` with `radius=0.2` and `forwardOffset=0.05`, and pressing the Brush-hand trigger over the stroke set `hot=true`, changed the stroke to `visible=false/renderVisible=false`, advanced undo depth to `2`, and produced no fresh warn/error console logs.
- Straight Edge semantics have been corrected at the state-model level: the fallback and wand Line buttons now toggle `OpenBrushAppState.straightEdgeEnabled` while the selected `activeTool` remains `free-paint`, and stroke authoring resolves the effective tool to Straightedge only while that mode is active. Line strokes now regenerate the upstream-style `LineCreator` sample count of 31 control points (`n=30`, inclusive endpoints) with pressure `1` and flat-line orientation as the endpoint moves. Full parity still requires upstream orientation-adjustment/slerp behavior, the reference guide/meter UI, and circle/sphere creator modes.
- Phase 10 foundation has progressed: the consolidated `welcome` panel is now explicitly the browser/debug fallback. In browser/non-immersive mode it remains the fallback `ScreenSpace` panel; in XR it is hidden by `PanelAttachmentSystem`, while lightweight `Color`, `Brush`, and `Tools` `PanelUI` entities form a fixed off-hand/wand ring. The ring consumes `SettingsState` (`dominantHand`, `panelAnchor`, `panelDistance`, `panelHeight`, `panelScale`, `wandPanelRotationSteps`), attaches to the requested hand ray or XR-origin anchor, applies panel sizing through `PanelUI.maxWidth/maxHeight`, exposes `OpenBrushPanelAttachment` role/mode/slot/visibility fields for runtime inspection, mirrors across handedness swaps, and rotates by cached slot steps. First-pass ring interactions are now wired for Tools Draw/Line/Erase/Dropper, Color Picker, Brush Picker, stroke undo/redo requests, Brush Prev/Next/Size, and Color swatches through the existing PanelDocument/BrushSettings/OpenBrushAppState paths. The configured Wand hand can also rotate the fixed ring with horizontal thumbstick deflections; the edge detector only applies one rotation per deflection and respects `xrRayEnabled`. This is still a foundation: panel content is not yet the full Open Brush palette system, direct touch/paging/popups are not complete, and floating/alternate panels remain pending.
- Phase 10 role routing has begun: `InputCommandSystem` now derives Brush/Wand hands from `SettingsState.dominantHand`; only the Brush hand maps trigger/squeeze into paint/alternate, only the Wand hand maps controller undo/redo, idle XR input prioritizes the Brush hand, and both left/right `BrushPointer` entities exist for pointer ownership/debug state. This is not full controller parity yet; panel rotation, controller hints/materials, bimanual visibility, and direct-touch panel affordances remain pending.
- Phase 10 settings consumption has begun: `InputCommandSystem` now consumes `SettingsState.browserPointerEnabled` and `SettingsState.xrRayEnabled`. Disabled browser pointer input is cleared and ignored as a command source; disabled XR rays/controllers keep connection state visible for diagnostics while suppressing paint/alternate/undo/redo command activity.
- Managed runtime checks on 2026-07-05 confirmed the expanded hand-attached Tools panel after hot reload without restarting the dev server. Ray-selecting the new `tool-color-picker` and `tool-brush-picker` button Object3Ds changed `OpenBrushAppState.activeTool` to `color-picker` and `brush-picker`. A controller-authored Light stroke was then finalized with `StrokeHistoryState.undoDepth=1`; selecting the new stroke Undo button incremented `OpenBrushAppState.strokeUndoRequestRevision` to `1`, moved history to `undoDepth=0/redoDepth=1`, and hid the stroke, while selecting Redo incremented `strokeRedoRequestRevision` to `1`, restored `undoDepth=1/redoDepth=0`, and made the stroke visible again. Fresh warn/error console logs remained empty.

## UI and Interaction Audit Addendum

The port must preserve Open Brush interaction semantics, not just expose equivalent command names.

- Draw/freehand: painting is the brush-controller Activate action. Trigger ratio feeds pressure every frame; generated stroke width uses each brush descriptor's pressure-size minimum, while pointer pose comes from the Brush controller attach/tool pose before stencil magnetization, bimanual/lazy input, then grid snap. The IWSDK port now uses Brush-hand grip space for stroke contact and reserves ray space for panel focus. Default brush selection is upstream Light at `BrushSize01=0.5` unless a brush-specific last size exists.
- Straightedge/line: straightedge is an Open Brush global command/toggle layered onto FreePaint, with guide/meter feedback and parametric line/circle/sphere creators, not a standalone active tool or merely a separate flat UI button. It must use the same active brush, color, size, and stroke metadata as freehand. The IWSDK line helper now matches upstream `LineCreator`'s 31 sampled control points and pressure `1`; remaining parity work is upstream normal/orientation adjustment, guide/meter behavior, and circle/sphere modes.
- Eraser: eraser is a live brush-controller stroke-modification tool. It is hot only while Activate is held, has its own visible/resizable tool radius, intersects actual visible stroke/widget geometry, deletes whole strokes/widgets, and participates in undo/redo. Current IWSDK eraser behavior accounts for brush-hand controller routing, Brush-hand grip/tool pose, ray-only panel focus, the reference radius range/default midpoint, radius resizing through Brush panel size controls, the reference forward offset, stroke object world translation, generated mesh bounds in AABB fallback tests, and rendered generated triangle intersection for mesh strokes. It still needs widget intersection, non-triangle stroke representation coverage, picker/selection parity on the same geometry path, audio/haptic feedback, and Quest-scale broad-phase performance hardening.
- Color/brush/dropper tools: reference one-shot pickers copy color, brush, or both. The port now distinguishes Color Picker as color-only, Brush Picker as brush-only, and Dropper as stroke color+brush+size, with Dropper using the reference stroke pick radius/forward offset. The VR Dropper still needs image-widget sampling before strokes and full room/canvas-scale size parity.
- Brush color: reference color changes are not raw color assignment only; `BrushColorController` clamps luminance/saturation and routes updates through `PointerManager.PointerColor`. The port's simple color swatches are useful but still need reference-style color controller semantics before color parity.
- Selection: selection is an active tool with add/remove selection state, active-layer rules, pinned-widget exclusions, duplicate-on-hold behavior, selection canvas movement, and controller UI affordances. A "select last stroke" fallback is not parity.
- Mirror/symmetry: symmetry is pointer duplication with mode-dependent active pointer counts and transforms. It is not just post-finalize mirroring.
- Grid/snap: snap is canvas-aware, can preserve degrees of freedom through stickiness, and should have separate selection/widget transform helpers.
- Lazy input: lazy mode is toggled by undo, changes behavior while painting, is disabled when grid snap is active, depends on pressure/delta time, and needs guide/ghost feedback.
- Tape/measure: tape is a bimanual mode that hides panels, uses wand/brush controller roles, pulls the lazy cursor along the controller line, and blocks incompatible transforms while active.
- Stencils: stencils magnetize free-paint before lazy/grid processing, maintain previous active stencil while painting, use attract/hysteresis, and need visible stencil widget state.
- Hand-attached UI: core brush/color/tool controls belong on off-hand/wand-attached spatial panels with brush/wand role semantics. The consolidated panel remains a browser/debug fallback, not the target XR UX. The current XR wand panels are not parity yet: they cover Draw/Line/Erase, Color Picker, Brush Picker, Dropper, stroke undo/redo requests, brush prev/next/size, and a few color swatches. Missing XR controls include dropper image-widget sampling, mirror/grid/lazy/tape/stencil, layers, selection, settings, save/load/export/playback, paging/popups, direct touch, and richer palette controls.
- Panel attachment: reference panels include wand pane snapping, grab/attach priming, room availability checks, audio/haptics, and tool/pointer suppression while UI has focus. The IWSDK ring currently parents panels directly to ray spaces or XR origin; it does not yet implement reference panel grab, attach/detach transitions, pane collision/availability, or controller-material equivalents.
- Tool-spec audit queue: recheck every implemented tool's source spec before declaring parity, including the user-reported Draw/Line startup thickness and Eraser-not-working paths. Draw and Straightedge/Line startup thickness now has a concrete target and managed-runtime evidence via the upstream Light brush: `BrushSize01=0.5` means raw Open Brush size `0.1125` before IWSDK scaling and about `0.002353` live render size after scaling. Per-brush pressure-size minimums are wired for mapped brushes; normalized brush-size controls are available on the hand-attached Brush panel and verified against Draw plus Straightedge strokes; Draw/Line/Eraser now use Brush-hand grip/tool contact pose while panel blocking remains ray-based; Line control-point generation now has a `LineCreator`-grounded unit test and is exposed on the hand-attached Tools panel; translated-stroke eraser hits, generated mesh bounds, generated triangle intersection, eraser forward offset, a visible grip-parented eraser cursor, eraser activation through the hand-attached Tools panel, and eraser radius resizing through the same hand-attached Brush panel are covered. Color Picker, Brush Picker, and Dropper are now separated at the tool-spec level, with Dropper copying stroke color+brush+size and using the reference `0.22m` forward offset plus `0.1m` stroke pick radius. The renewed user report adds a continuing route-level check: compare clean-start Draw and Line apparent width under equivalent pressure assumptions, keep the Brush panel readout unit-labeled, and make panel-focus blocked states visible enough that a ray-over-panel condition is not confused with a broken tool. Remaining priority checks are pressure smoothing/opacity behavior, line orientation/normal adjustment, eraser widget/non-triangle intersection, eraser audio/haptics, dropper image-widget sampling and description visuals, straightedge guide/meter behavior, circle/sphere modes, brush-hand versus wand-hand affordances, and any panel-focus conditions that can make eraser appear broken. The next audit pass must inspect each implemented tool against its upstream source spec before additional parity checkoffs are accepted.
- Tool inventory gap: upstream `BaseTool.ToolType` includes SketchSurface, Selection, ColorPicker, BrushPicker, BrushAndColorPicker, SketchOrigin, AutoGif, CanvasTool, TransformTool, StampTool, FreePaintTool, EraserTool, ScreenshotTool, DropperTool, SaveIconTool, ThreeDofViewingTool, MultiCamTool, TeleportTool, RepaintTool, RecolorTool, RebrushTool, SelectionTool, PinTool, EmptyTool, CameraPathTool, FlyTool, ScriptedTool, SnipTool, and JoinTool. The IWSDK port currently exposes only a creation-focused subset; parity phases must explicitly decide which non-cloud/non-multiplayer tools are in scope, then port each accepted tool's attach pose, input, visual, size/radius, undo, and E2E behavior.

### Tool Spec Audit Snapshot

Confirmed source-grounded findings from `reference/Assets/Scripts` and current IWSDK code:

- Tool inventory: the current IWSDK descriptor list covers Draw, Eraser, Straightedge, Mirror, Grid Snap, Lazy Input, Tape, Stencil, Color Pick, Brush Pick, and Dropper. Missing or placeholder upstream tools that affect UI/interaction parity include Selection, image-widget Dropper sampling, Sketch Origin/Canvas/Transform/Stamp, Teleport/Fly/3DoF view, Repaint/Recolor/Rebrush, Pin, Snip, Join, CameraPath/MultiCam/Screenshot/SaveIcon, and ScriptedTool. Cloud or cloud-powered sharing is out of scope.
- Draw/FreePaint: upstream `FreePaintTool` paints from the Brush controller Activate path, writes trigger ratio into pointer pressure, samples the Brush controller attach pose, magnetizes to stencils before bimanual/lazy/grid processing, and adjusts all pointers through normalized `BrushSize01`. The IWSDK port now starts on upstream Light at `BrushSize01=0.5`; source-default raw size is `0.1125` in Open Brush room-space and `0.002353...` after the IWSDK live-scale calibration. It uses per-brush pressure-size ranges and samples XR grip space for tool contact while keeping ray space for panel focus, but still lacks pointer attach-angle calibration, brush preview/audio, pointer script hooks, and the full ordering of stencil/bimanual/lazy/grid processing.
- Line/Straightedge: upstream Straight Edge is a global PointerManager mode layered on FreePaint, not an ordinary selected paint tool. The port now treats Line as `straightEdgeEnabled` over `activeTool=free-paint` and matches `LineCreator`'s 31 pressure-1 samples. Because `LineCreator` forces pressure to `1f`, apparent Line width must be compared against a full-pressure Draw stroke or called out in UI/testing; it should not be judged against a lightly pressed Draw stroke. Remaining gaps are orientation convergence/slerp, guide/meter UI, snap hints, circle/sphere creators, and line finalization semantics across all active symmetry pointers.
- Eraser: upstream `EraserTool` is a hot/cold `StrokeModificationTool` on the Brush controller tool attach point, with size range `[0.1, 0.3]`, forward offset `0.05`, spinner/audio/haptics, GPU/triangle intersection, media-widget hiding, alt-select batch filtering, and undo. The port now matches range/default/offset, has a visible grip-parented resizable cursor, samples Brush-hand grip/tool pose, and uses generated mesh triangle intersection before AABB fallback. A generation-346 ECS shortcut check confirmed an overlapping Eraser trigger hides a visible stroke, so the next Eraser risk is the user-facing route rather than the core delete primitive: wand Tools activation, cursor hot/cold feedback, panel-focus suppression, and visible size/radius affordance. Parity still requires broad-phase acceleration/BVH, non-triangle stroke representation coverage, widget/media deletion, audio, haptics, and alt-select behavior.
- Color Picker / Brush Picker / Dropper: upstream Color Picker commits color only, Brush Picker commits brush only, and Dropper samples image widgets first before strokes and commits brush, color, and absolute room-space stroke size. Reference Dropper/Snip/Join scene data uses a Brush tool attach pose plus forward offset `0.22` and `m_DropperBrushSelectRadius=0.1`; the port now has separate picker specs and panels for Color, Brush, and Dropper, keeps Color/Brush stroke picking on the existing simple picker radius, and routes live Dropper stroke picking through Brush-hand grip/tool pose plus the reference forward offset/radius. Remaining parity gaps are image-widget sampling, Dropper description visuals, audio/haptics, and exact room/canvas-scale size handling across transformed canvases.
- Repaint/Recolor/Rebrush: upstream `RepaintTool` is a `StrokeModificationTool` with hot/cold visuals, audio, haptics, Brush tool attach pose, `m_PointerForwardOffset=0`, size range `[0.1,0.3]`, and batch filtering. The port has no equivalent live repaint/recolor/rebrush stroke-modification tool yet.
- Snip/Join/Pin/Selection: Snip and Join use Dropper-style brush attach pose, forward offset `0.22`, radius `0.1`, closest-control-point logic, and undoable split/join commands. Selection/Pin have distinct add/remove/toggle state, widget interaction, selection canvas behavior, duplicate-on-hold, and controller affordances. Current selection behavior is only a fallback and is not parity.
- Mirror/Symmetry: upstream symmetry changes PointerManager mode, active pointer count, mirrored pointer transforms, color shifts, brush-size scaling for multi-mirror, widget visibility, and undoable symmetry commands. The port's current `mirror` descriptor mirrors finalized stroke data across world X only; it is a placeholder, not pointer-level symmetry parity.
- Grid Snap: upstream snap is main-canvas-space, respects enabled axes and grid size, and has stickiness that preserves one degree of freedom when far from a grid point. The port's current `grid-snap` descriptor uses fixed `0.1m` world rounding; it is a placeholder until canvas-aware snap settings and selection/widget snap paths exist.
- Lazy Input: upstream lazy input toggles through the Brush Undo/tap gesture, is disabled while grid snap is active, derives interpolation from trigger pressure and delta time, interpolates rotation and size, supports tangent mode, and shows guide/ghost feedback. The port's `lazy-input` is a fixed positional lag; it needs reference mode state, rate math, tangent mode, visuals, and input affordances.
- Tape/Bimanual: upstream tape is a bimanual FreePaint mode started from the Wand trigger in advanced mode, hides/restores panels, draws guide/intersection visuals, and pulls the brush cursor along the wand/brush line with lazy-rate behavior. The port's `tape` creates two-endpoint strokes from left/right ray spaces; it needs bimanual state, panel visibility gates, guide visuals, and Brush/Wand role semantics.
- Stencil: upstream stencils are widgets with attract distance, active-stencil hysteresis, pinned/disabled layers, surface normal magnetization, and interaction shaders. The port's `stencil` descriptor projects onto a fixed front z-plane; it needs real stencil widget creation, active stencil tracking, surface projection, visibility controls, and selection/widget interactions.

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
- Default draw and straightedge strokes start from the upstream Light brush at `BrushSize01=0.5` and derive absolute stroke size plus pressure-size width from that brush's descriptor ranges; they must not inherit Marker fixture size, Marker pressure behavior, or raw Open Brush meter-like values.
- Brush size controls persist normalized size and derive absolute stroke size from the active brush range; saved strokes still store absolute `brushSize` and `brushScale`.
- Component-level `BrushSettings` fallbacks use the upstream Light brush startup range at `BrushSize01=0.5`, so default or recovered settings entities do not create Marker-thick Draw/Line strokes.
- Eraser deletes only intersected visible/unlocked strokes or widgets through live brush-controller interaction from the configured Brush hand; Brush-hand grip/tool pose, separate ray-space panel focus, translated stroke-object offsets, generated mesh bounds, rendered generated triangle geometry, the reference radius range/default midpoint, resizable radius controls, and the reference forward tool offset are honored during hit tests; it has visible/resizable tool radius behavior equivalent to Open Brush `StrokeModificationTool`; and screen-space or hand-attached panel hover cannot globally block XR erasing unless the active pointer ray is actually over the panel. Full parity still requires widget and non-triangle intersection coverage, audio, haptics, and large-sketch acceleration. Eraser and selection operations are undoable and do not leak geometry.
- Color Picker, Brush Picker, and Dropper update app state and UI state consistently: Color Picker copies stroke color only, Brush Picker copies brush only while preserving current size intent, and Dropper copies stroke color, brush, and size.
- Live Color/Brush Picker/Dropper paths work from controller pose, not only from fallback panel buttons, and copy color/brush/size through IWSDK vector/component APIs without runtime errors.
- Tool transitions leave no stuck trigger, `Pressed`, grabbed, or recording state.

Testing plan:

- Unit: tool state machine tests and deterministic symmetry/straightedge fixtures.
- Unit: brush-size range conversion, mapped brush pressure-size ranges, upstream Light default size, picked-size propagation, straightedge thickness parity, eraser hit/miss tests, and transformed-stroke eraser regressions.
- Unit: default/fallback `BrushSettings` size uses the upstream Light startup range, while the IWSDK calibration constant remains stable for active range conversion.
- Unit: generated brush bounds include visible ribbon/tube/particle width, and eraser/picker intersection does not double-inflate bounds that already include brush width.
- Unit: eraser generated-geometry intersection covers indexed triangle hit/miss cases, draw range start/count, and object matrix transforms before falling back to AABB bounds.
- Unit: command merge/group continuation tests.
- Browser: exercise each tool through UI controls and pointer fallback.
- Runtime E2E: use controller path scripts for draw, straightedge, symmetry, eraser, and picker flows; compare `ecs_snapshot`/`ecs_diff` before/after each operation when available; query for expected Light brush GUID/default stroke size, picked color/brush/size, hidden/deleted stroke counts, undo/redo state, and no active recording state after release.
- Runtime E2E: include a low-pressure Light stroke check; hold XR trigger at a known value, verify `InputCommandState.pressure`, and query `BrushStroke.minBounds/maxBounds` to confirm generated width follows `PressureSizeMin + (1 - PressureSizeMin) * pressure`.
- Runtime E2E: include transformed-stroke eraser coverage by drawing through the normal controller path, moving the stroke entity via `Transform.position` after that route is proven, erasing at the translated world-space stroke center, and verifying `BrushStroke.visible/renderVisible=false`, visible stroke counts drop, and undo history increments.
- Runtime E2E: activate Eraser from the wand Tools panel, verify an `OpenBrushEraserCursor` entity becomes visible on the configured Brush hand with `radius=0.2`, `forwardOffset=0.05`, and `hot=true` only while Activate is held, then verify erasing uses that offset center.
- Runtime E2E: while Eraser is active, use the hand-attached Brush panel `Size -/+` controls to adjust `OpenBrushEraserCursor.radius` through the `[0.1, 0.3]` range, verify the cursor scale/readout updates, and erase a boundary stroke that would miss at the previous radius but hits at the adjusted radius.
- Runtime E2E: draw a controller-authored stroke and verify `BrushStroke.minBounds/maxBounds` include generated mesh width rather than only control-point centerline bounds.
- Runtime E2E: draw a controller-authored stroke, move/rotate/scale the stroke entity through the proven ECS shortcut, erase against the transformed visible mesh surface, and verify `BrushStroke.visible/renderVisible=false` plus undo history changes without relying solely on centerline AABB overlap.
- Runtime E2E: include a regression where a screen-space or hand-attached panel is hidden or hovered by some pointer while the active XR brush ray is not over a visible focusable panel; Draw, Eraser, and Picker must still work from the active brush controller.
- Runtime E2E: include a brush-tool-pose regression where Draw, Straightedge/Line, Picker, Tape anchor, and Eraser contact use Brush/Wand grip spaces while panel blocking still uses ray spaces; verify Draw/Line `BrushStroke.brushSize` remains the Light default after clean reload and Eraser hides grip-contacted strokes without current console warnings.
- Runtime E2E: include a partial-trigger Line regression that presses Activate below full value, verifies the visible Straightedge stroke still records the active brush size and expected 31 control points, and pairs it with unit coverage that every generated Straightedge control point uses pressure `1`.
- Runtime E2E: activate Dropper from the wand Tools panel or the proven ECS shortcut, aim with Brush-hand grip pose plus the reference `0.22m` forward offset, and verify picked `BrushSettings.color`, `brushGuid`, `size01`, and `size` match the target stroke while Brush Picker alone does not copy target stroke size.

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
- Brush size/thickness controls exist on the XR brush panel, mutate `BrushSettings.size01`, resync absolute `BrushSettings.size` from the active brush range, and provide controller affordances comparable to Open Brush brush sizing.
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
- Runtime E2E brush-size regression: use the XR brush panel size controls after the UI route is proven, then shortcut via ECS for repeated cases; verify `BrushSettings.size01` changes, `BrushSettings.size` follows the active brush range, Draw and Line strokes match the new size, and the value persists across brush/tool changes.
- Runtime E2E eraser-size regression: set `OpenBrushAppState.activeTool=eraser` after the tool-selection UI route is proven, use the same XR Brush panel size controls, and verify `OpenBrushEraserCursor.radius`, cursor transform scale, panel label, and boundary erase behavior all follow the adjusted radius without console warnings.
- Runtime E2E wand Tools regression: ray-select Color Picker and Brush Picker on the hand-attached Tools panel and verify `OpenBrushAppState.activeTool`; draw a stroke, press the hand-attached stroke Undo/Redo buttons, and verify `OpenBrushAppState.strokeUndoRequestRevision`/`strokeRedoRequestRevision`, `StrokeHistoryState.undoDepth/redoDepth`, and `BrushStroke.visible/renderVisible` change through `StrokeAuthoringSystem` rather than through the fallback UI command history.
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
- Continuous drawing, erasing, and panel updates currently have known hot-path allocation risk; mesh rebuilds, control-point objects, erased-stroke scratch arrays, and per-frame UI label updates need profiling and reuse/caching before Quest-scale sketches.
- `.tilt` compatibility requires exact binary behavior, including .NET GUID byte order and extension skipping.
- Transparent and additive brushes can overload mobile stereo rendering.
- Selection and intersection behavior may need different algorithms; Unity GPU ID readback can stall badly in WebXR.
- Hand-attached UI fidelity is a product risk as much as a technical one: panel placement, brush/wand roles, direct touch, ray targeting, paging, haptics, and bimanual visibility need to feel like Open Brush, not just expose the same commands.
- Browser persistence and atomic save behavior differ from Unity filesystem rename semantics.
- Emulator E2E is necessary but insufficient; Quest hardware testing remains mandatory.
