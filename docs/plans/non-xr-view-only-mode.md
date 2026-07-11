# Non-XR View-Only Mode — Plan

Port of Open Brush's no-headset sketch viewer ("Flatscreen View Mode" /
ViewOnly) to Brushspace. Based on reading the Open Brush source
(`icosa-foundation/open-brush`, `main` as of 2026-07), not the docs.

## How Open Brush does it

### Entry and detection

- `App.Start()` (`Assets/Scripts/App.cs`): if
  `!VrSdk.IsHmdInitialized() && !UserConfig.Flags.EnableMonoscopicMode`, the
  app calls `CreateFailedToDetectVrDialog()`, which instantiates the
  `InitNoHeadsetMode` prefab — the 2D sketch-picker canvas. So "no headset"
  falls back to a *viewer*, not an error.
- Config flags (`UserConfig.Flags`): `ForceViewOnly` (also forced at compile
  time by the `OPEN_BRUSH_VIEWER` define — that's the dedicated viewer build),
  `EnableMonoscopicMode` (full mouse/keyboard *editing*), `DisableXrMode`.
  `ForceViewOnly` sets `SketchControlsScript.m_ViewOnly` at startup.

### The sketch picker (`InitNoHeadsetMode.cs`)

- A screen-space grid with category tabs: **Your Sketches** (local files),
  **Featured Sketches** (Icosa Gallery, downloaded in the background in
  batches of 2 up to 20), **Liked Sketches** (when logged in). Thumbnails come
  from `.tilt` files locally or from Icosa metadata remotely; scroll position
  per tab is preserved across visits.
- Clicking a tile: raise the camera to y=12, enable **FlyTool**, then issue
  `GlobalCommands.Load` — deliberately bypassing the editor's unsaved-work
  confirmation ("selecting another sketch is viewer navigation"). A
  "Loading sketch…" message replaces the grid until
  `SketchMemoryScript.IsPlayingBack` (stroke playback started), then the
  picker destroys itself so the user watches the sketch draw in.
- In view-only mode the "new blank sketch" button and help link are hidden
  (`RefreshViewOnlyUi`).

### The view-only state (`SketchControlsScript.ViewOnly(bool)`)

Toggled by `GlobalCommands.ViewOnly` (advanced keyboard shortcut `H`) or
forced by `ForceViewOnly`; re-asserted after every sketch load. It:

1. forces the current tool to FlyTool (TeleportTool also allowed),
2. switches `PanelManager` to `PanelAvailabilityMode.ViewOnly` — only panels
   whose `PanelMapKey.m_ViewOnly` flag is set survive (essentially just a
   minimal admin panel),
3. disables pointer rendering (`PointerManager.RequestPointerRendering(false)`),
4. hides scene decor.

Editing state is untouched — it's a UI/tool gate, not a data mode.

### Navigation (`Tools/FlyTool.cs`, non-VR branch)

- **Look** (applied to the *camera* rotation, pitch clamped ±85°):
  - mouse: LMB-drag deltas;
  - touch: first-finger drag, delta normalized by screen size × 300;
  - gamepad: right stick with a squared response curve; R3 toggles invert.
- **Move** (applied to the *scene pose* inversely —
  `App.Scene.Pose.translation -= cameraRotation * input * speed`, validated
  by `MakeValidScenePose` against the hard bounds radius):
  - keyboard: the `CameraMove*` shortcuts (WASD-style + up/down);
  - gamepad: left stick, up/down on the triggers; L3 or Shift = sprint ×5;
  - touch: an on-screen virtual joystick + Up/Down buttons
    (`m_NonVRFlyingUi`), shown only when
    `!IsHmdInitialized && IsMobileHardware`. While a touch control is held it
    takes priority so the drag doesn't double as a look-drag.
  - base speed 0.05/frame, sprint ×5.
- In VR the same tool flies along the controller forward with lerped
  velocity/damping — irrelevant here but explains the tool's shape.

### Chrome (`GUI/ViewModeUI.cs`)

Active whenever no HMD (or monoscopic SDK mode). Three buttons: **close**
(new blank sketch + drop the nav tool + reopen the picker — or quit if the
picker is already up), **menu**, and **skip playback** (shown only while
`SketchMemoryScript.IsPlayingBack`; calls `App.RequestQuickLoad()`).

## What Brushspace already has

- The browser session already renders non-immersively (`offer:"always"`,
  fixed camera at `(0, 1.3, 1)` in `src/index.ts`), with the intro sketch,
  an HTML Enter-VR button, and a landing footer — but **no camera navigation
  at all**.
- Desktop mouse-drag currently *paints* (`InputCommandSystem`
  "browser-pointer" input; keyboard `Space`/`B` paint, `Z`/`Y` undo/redo,
  `[`/`]` brush cycling). Browser mode today is a limited editor, not a
  viewer.
- `SketchLibrarySystem` already owns exactly the catalog the picker needs:
  local IndexedDB records with PNG thumbnails **plus** curated Icosa Gallery
  entries (`createDefaultSketchLister`, `.tilt` download via
  `downloadRemoteTiltBytes`) — but its gallery panel is wand-mounted and
  explicitly hidden in `NonImmersive`.
- Stroke load already has a "playback" analog: the staggered
  transition-out/in (`TRANSITION_IN_SECONDS`), plus a `PlaybackState`
  component with a quickload/timeline mode used by the panel system.
- `WorldGrabSystem` (scene-pose transform) is disabled in `NonImmersive`, so
  the scene pose is free for other uses — but see the navigation note below.
- URL-param precedent: `?join=CODE` in `src/index.ts`.

## Plan

Goal: with no headset (or when asked), the browser is a sketch viewer —
sketch grid → load with staggered reveal → fly navigation via
mouse/keyboard/touch/gamepad — with all editing input suppressed. Same
division of labor as Open Brush: a mode flag, a nav tool, a picker, a gate.

### 1. Mode state

New fields on the existing app-state entity (new component
`ViewerModeState` in `src/components/core.ts`):

- `viewOnly: boolean` — editing suppressed, viewer chrome shown;
- `navEnabled: boolean` — fly navigation active (only meaningful in
  `NonImmersive`).

Sources, in priority order (resolved in `src/index.ts`):

1. `?view` / `?viewonly` URL param — force viewer mode (Open Brush's
   `ForceViewOnly`). Needed regardless of auto-detection because the IWSDK
   dev emulator always reports XR support.
2. XR support probe: `navigator.xr` missing or
   `isSessionSupported('immersive-vr')` false → default into viewer mode
   (Open Brush's `IsHmdInitialized()` fallback). Keep the Enter-VR button
   hidden in this case.
3. Otherwise: current behavior (browser editing landing + Enter VR).

Entering an XR session always drops `viewOnly` (Brushspace's viewer is a
browser-mode concept; a kiosk-style in-XR view-only is out of scope).

### 2. `ViewerNavigationSystem` (port of FlyTool's non-VR branch)

New `src/systems/viewer-navigation-system.ts`, active only when
`visibilityState === NonImmersive` and `navEnabled`.

- **Look → `world.camera`** (IWSDK sanctions driving the camera for
  editor/orbit-style browser views; player stays at origin): yaw + pitch
  with the ±85° clamp, from
  - canvas pointer-drag (pointer capture, same pattern as
    `InputCommandSystem.bindBrowserPointer`), which covers mouse and touch
    with one code path;
  - gamepad right stick (`world.input.browserGamepads`), squared response,
    R3 toggles invert-look.
- **Move → the scene pose**, exactly like Open Brush: translation is applied
  inversely to the `OpenBrushScenePose` object
  (`pose.position -= cameraRotation * input * speed`). WASD + `Q`/`E`
  up/down on `world.input.keyboard`, gamepad left stick + triggers, Shift/L3
  sprint ×5. Frame-rate-independent (`delta`-scaled), no allocations in
  `update()` (scratch `Vector3`s allocated in `init()`).
- Why the scene pose and not the camera: `OpenBrushScenePose` is Brushspace's
  `App.Scene.Pose` — a *local* view transform. Canvases/strokes live under it
  in canvas space, collab publishes tips and strokes in canvas space
  precisely so each side's grab pose stays local, and save/load never touches
  it. Navigating through it keeps one source of truth for "where the world
  is" (world grab, eraser radius scaling, brush-size-vs-scale, and collab
  conversion all read it) and means flying in the browser then entering VR
  leaves you where you flew, matching Open Brush's flatscreen→VR behavior.
  Arbitration with `WorldGrabSystem` is free: grab runs only in XR,
  viewer nav only in `NonImmersive`.
- Clamp the resulting pose to a generous bounds radius (analog of
  `MakeValidScenePose`) so users can't fly to infinity.

Key conflict resolution: in `viewOnly`, LMB-drag = look (paint input is
gated off, see §4), matching Open Brush. When *not* view-only (browser
editing), phase 1 leaves mouse-drag as paint; an RMB-drag look for the
editing landing can come later.

### 3. Sketch picker (port of `InitNoHeadsetMode` + `ViewModeUI`)

DOM overlay, not UIKit — consistent with the existing landing chrome and
loading screen in `index.html`, and free on a 2D screen (scrolling,
responsive layout, text rendering).

- Extract the entry-listing logic out of `SketchLibrarySystem`
  (`refreshEntries` / local + remote `GalleryEntry` building, thumbnail blob
  URLs) into a shared module, e.g. `src/sketch/gallery-entries.ts`, consumed
  by both the wand gallery and the DOM grid.
- Make the open path callable from outside: promote `openSketch(entry)` (or
  a thin `openGalleryEntry`) to public on `SketchLibrarySystem`. The
  staggered transition already gives the "watch it draw in" beat; the
  existing `busy` flag prevents double-loads.
- New `src/app/viewer-shell.ts` (DOM, like `setup-shell.ts`) + markup/CSS in
  `index.html`: two tabs (**Your Sketches** / **Featured**), thumbnail grid,
  "Loading sketch…" state on click, and a persistent minimal chrome while
  viewing: a **Browse** button to reopen the grid (ViewModeUI's close
  button) and the controls hint ("drag to look · WASD to move"), hidden on
  touch devices in favor of the joystick.
- On load, frame the sketch: fit the camera to the spawned strokes' bounding
  sphere, falling back to the landing pose for empty/huge sketches (nicer
  than Open Brush's fixed y=12 hop, and cheap since stroke bounds exist for
  the thumbnail path).

### 4. View-only gating (port of `SketchControlsScript.ViewOnly`)

When `viewOnly`:

- `InputCommandSystem`: suppress the browser-pointer paint path and the
  paint/undo/brush-cycle keyboard bindings (single check where the command
  snapshot is built; `Z`/`Y` etc. stay off so nav keys can't mutate the
  sketch).
- `BrushPointerVisualSystem`: hide pointer visuals (the
  `RequestPointerRendering(false)` analog) — they're already XR-anchored,
  so this may just be a safety check.
- Wand panels need nothing: they're already invisible in `NonImmersive`.
- Collab: `?join=` keeps requiring the editing path; if both `?view` and
  `?join` are present, `?join` wins (documented, not enforced UI).

### 5. Touch + gamepad extras (phase 3)

- On-screen virtual joystick + Up/Down buttons (DOM, pointer events), shown
  when `matchMedia('(pointer: coarse)')` and in viewer mode — port of
  `m_NonVRFlyingUi`/`TouchJoystick`. While held, it takes input priority so
  the drag doesn't double as look (same guard as FlyTool).
- Gamepad polish: invert-look persistence in `SettingsState`.

### Phasing

1. **Nav**: `ViewerModeState` + `ViewerNavigationSystem` behind `?view`
   (look + keyboard/gamepad move, editing gate from §4). Smallest testable
   slice.
2. **Picker**: gallery-entry extraction, DOM grid + viewer chrome, XR-probe
   auto-entry, camera framing.
3. **Touch UI** + gamepad polish.
4. **Parity extras** (optional): `H` toggle for view-only in browser editing
   mode, skip button if timeline playback ever runs in browser, RMB-look in
   editing mode.

### Testing

- Unit (vitest, matching `src/app/*.test.ts` style): mode resolution from
  URL params + XR probe; look math (pitch clamp, wraparound, invert);
  move vector composition + sprint; gating table (viewOnly × input kind).
- Manual/emulator: `npx tsc --noEmit`, then dev server — `?view` on desktop
  (drag-look, WASD, load from both tabs, Browse back), Enter VR from viewer
  drops view-only, `?join` unaffected. Emulator always claims XR support, so
  auto-entry is verified by stubbing `navigator.xr` in a unit test.

### Tool-architecture alignment

View-only gating should reuse the existing tool-policy pattern instead of
ad-hoc checks. Brushspace's analog of `BaseTool`/`SketchSurfacePanel` is the
`OpenBrushToolDescriptor` table (`src/tools/tools.ts`) plus
`resolveEffectiveOpenBrushTool` (`src/tools/tool-modes.ts`); Open Brush's
`EnsureViewOnlyNavigationTool`/`IsViewOnlyNavigationTool` maps onto:

- a capability field on the descriptor (e.g. `allowedInViewOnly` or a
  `kind: "editing" | "navigation" | "picker"` discriminant), the analog of
  `BaseTool` virtuals like `AvailableDuringLoading()`;
- `resolveEffectiveOpenBrushTool` growing a mode argument so
  `(activeTool, { straightEdge, viewOnly })` resolves to the effective tool —
  view-only resolves every editing tool away, which is how the input gate in
  §4 should be implemented rather than as scattered `viewOnly` checks.

This keeps the door open for centralizing tool switching later (one
`switchTool()` owner for `previousTool`/`toolRevision`/status side effects)
without porting Open Brush's class hierarchy into ECS.

### Risks / notes

- Viewer nav writes the same scene-pose object as `WorldGrabSystem`; they are
  mutually exclusive by visibility state (XR vs `NonImmersive`), but any
  future in-VR fly tool should go through a shared pose-write helper with the
  bounds clamp.
- Canvas pointer events are also consumed by IWSDK's
  `input.canvasPointerEvents`; the paint path already coexists with it, and
  viewer mode has no `ScreenSpace` UI, so no ray-vs-drag conflict is
  expected — verify hover state doesn't flicker during look-drags.
- Remote (Icosa) thumbnails/tilts are plain CORS URLs (already relied on by
  the wand gallery), so the DOM grid adds no new network requirements.
