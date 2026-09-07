import type { Mesh, World } from "@iwsdk/core";
import { BatchedBrushStroke, BrushStroke, ExtractedBatchedBrushStroke } from "../components/core.js";
import { createPhase1FixtureDocument } from "../sketch/fixtures.js";
import { FLAT_BATCH_BRUSH_GUID } from "../brushes/stroke-batch-feature.js";
import { StrokeAuthoringSystem } from "../systems/stroke-authoring-system.js";
import { StrokeBatchRenderSystem } from "../systems/stroke-batch-render-system.js";

/** Test the production receiver API; transport/chunk assembly is not simulated. */
export async function exerciseStrokeBatchRemoteLifecycle(world: World) {
  const authoring = world.getSystem(StrokeAuthoringSystem)!;
  const renderer = world.getSystem(StrokeBatchRenderSystem)!;
  const enabled = renderer.getMetrics().enabled;
  const prefix = "batch-validation-remote-";
  const data = structuredClone(createPhase1FixtureDocument().strokes[0]);
  data.guid = `${prefix}final`;
  data.brushGuid = FLAT_BATCH_BRUSH_GUID;
  data.brushSize = 0.04;
  const progress = { ...data, controlPoints: data.controlPoints.slice(0, 2) };
  const loadedReference = authoring.spawnStrokeFromData({ ...data, guid: "batch-validation-loaded-remote-reference" }, false);
  const expectedIndices = Number(loadedReference.getValue(BrushStroke, "indexCount"));
  const find = (guid: string) => [...authoring.queries.strokes.entities]
    .find((entity) => entity.getValue(BrushStroke, "guid") === guid);
  const tick = async () => {
    for (let frame = 0; frame < 3; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  };
  const requireState = (condition: unknown, message: string) => {
    if (!condition) throw new Error(`[StrokeBatchRemoteValidation] ${message}: ${JSON.stringify(observations[observations.length - 1])}`);
  };
  const countBatchTriangles = () => {
    let count = 0;
    world.scene.traverse((object) => {
      if (!object.name.startsWith("OpenBrushStrokeBatch_")) return;
      const indices = (object as Mesh).geometry.index?.array;
      if (!indices) return;
      for (let index = 0; index < indices.length; index += 3) {
        if (indices[index] !== indices[index + 1] && indices[index + 1] !== indices[index + 2]
          && indices[index] !== indices[index + 2]) count += 1;
      }
    });
    return count;
  };
  const snapshot = (stage: string) => ({
    stage,
    batchTriangles: countBatchTriangles(),
    compatible: renderer.getMetrics().compatibleStrokeCount,
    logicalBatched: [...authoring.queries.strokes.entities].filter((entity) => entity.hasComponent(BatchedBrushStroke)).length,
    strokes: [...authoring.queries.strokes.entities]
      .filter((entity) => String(entity.getValue(BrushStroke, "guid")).startsWith(prefix))
      .map((entity) => ({
        guid: String(entity.getValue(BrushStroke, "guid")),
        finalized: Boolean(entity.getValue(BrushStroke, "finalized")),
        indexCount: Number(entity.getValue(BrushStroke, "indexCount")),
        visible: Boolean(entity.getValue(BrushStroke, "renderVisible")),
        selected: Boolean(entity.getValue(BrushStroke, "selected")),
        batched: entity.hasComponent(BatchedBrushStroke),
        extracted: entity.hasComponent(ExtractedBatchedBrushStroke),
        privateVisible: entity.object3D?.visible,
        privateVertices: (entity.object3D as Mesh).geometry.getAttribute("position")?.count ?? 0,
      })),
  });
  const observations = [snapshot("baseline")];
  requireState(expectedIndices > 0, "loaded reference has no geometry");
  const localSource = [...authoring.queries.strokes.entities].find((entity) =>
    !String(entity.getValue(BrushStroke, "guid")).startsWith("batch-validation-")
    && Boolean(entity.getValue(BrushStroke, "finalized"))
    && entity.object3D?.userData.openBrushStrokeData?.lastControlPointIsKeeper === false);
  requireState(localSource, "browser-authored source unavailable");
  const localData = structuredClone(localSource!.object3D!.userData.openBrushStrokeData);
  requireState(typeof localData.lastControlPointIsKeeper === "boolean", "local commit lost sampler tail state");
  localData.guid = "batch-validation-local-receiver-reference";
  authoring.finalizeRemoteStroke(localData);
  await tick();
  requireState(find(localData.guid)!.getValue(BrushStroke, "indexCount") === localSource!.getValue(BrushStroke, "indexCount"),
    "remote live-commit replay changed generated index count");
  const localReplay = {
    lastControlPointIsKeeper: localData.lastControlPointIsKeeper as boolean,
    sourceIndexCount: Number(localSource!.getValue(BrushStroke, "indexCount")),
    remoteIndexCount: Number(find(localData.guid)!.getValue(BrushStroke, "indexCount")),
  };
  authoring.applyRemoteVisibility([localData.guid], false);
  await tick();
  authoring.upsertRemoteStroke(progress);
  await tick();
  const active = snapshot("progress");
  observations.push(active);
  const activeStroke = active.strokes.find((stroke) => stroke.guid === data.guid)!;
  requireState(!activeStroke.finalized && !activeStroke.batched && activeStroke.privateVisible, "progress has wrong rendering owner");
  requireState(authoring.applyRemoteVisibility([data.guid], false) === 1, "progress hide missed entity");
  authoring.finalizeRemoteStroke(data);
  await tick();
  const hidden = snapshot("finalized-hidden");
  observations.push(hidden);
  requireState(hidden.strokes.length === 1 && hidden.strokes[0].finalized
    && !hidden.strokes[0].visible && !hidden.strokes[0].privateVisible, "finalization revealed hidden progress");
  requireState(hidden.strokes[0].batched === enabled, "final remote stroke has wrong batch eligibility");
  requireState(hidden.strokes[0].indexCount === expectedIndices, "remote finalization differs from loaded authoritative points");
  if (enabled) requireState(hidden.strokes[0].privateVertices === 0 && hidden.batchTriangles === observations[0].batchTriangles, "hidden final retains visible geometry");
  authoring.upsertRemoteStroke(progress);
  authoring.finalizeRemoteStroke(data);
  await tick();
  const replay = snapshot("replayed-final");
  observations.push(replay);
  requireState(replay.strokes.length === 1 && !replay.strokes[0].visible, "replay duplicated or revealed final stroke");
  authoring.applyRemoteVisibility([data.guid], true);
  await tick();
  const shown = snapshot("shown");
  observations.push(shown);
  requireState(shown.strokes[0].visible, "remote show failed");
  if (enabled) requireState(shown.batchTriangles > observations[0].batchTriangles && !shown.strokes[0].privateVisible, "shown batch missing or duplicated");
  find(data.guid)!.setValue(BrushStroke, "selected", true);
  await tick();
  const selected = snapshot("selected");
  observations.push(selected);
  requireState(selected.strokes[0].privateVisible && selected.strokes[0].privateVertices > 0, "selection has no private geometry");
  if (enabled) requireState(selected.strokes[0].extracted && selected.batchTriangles === observations[0].batchTriangles, "selected stroke has overlapping batch geometry");
  authoring.applyRemoteVisibility([data.guid], false);
  await tick();
  const hiddenSelected = snapshot("remote-hide-selected");
  observations.push(hiddenSelected);
  requireState(!hiddenSelected.strokes[0].selected && !hiddenSelected.strokes[0].visible
    && !hiddenSelected.strokes[0].privateVisible && !hiddenSelected.strokes[0].extracted, "remote hide did not end selection");
  if (enabled) requireState(hiddenSelected.strokes[0].privateVertices === 0 && hiddenSelected.batchTriangles === observations[0].batchTriangles, "remote hide leaked extracted geometry");
  authoring.applyRemoteVisibility([data.guid], true);
  await tick();
  observations.push(snapshot("remote-show-after-selection"));
  const selectedData = { ...data, guid: `${prefix}selected-final` };
  authoring.upsertRemoteStroke({ ...selectedData, controlPoints: progress.controlPoints });
  await tick();
  find(selectedData.guid)!.setValue(BrushStroke, "selected", true);
  await tick();
  authoring.finalizeRemoteStroke(selectedData);
  await tick();
  const selectedFinal = snapshot("finalized-while-selected");
  observations.push(selectedFinal);
  const selectedFinalStroke = selectedFinal.strokes.find((stroke) => stroke.guid === selectedData.guid)!;
  requireState(selectedFinalStroke.finalized && selectedFinalStroke.selected && selectedFinalStroke.privateVisible
    && selectedFinalStroke.privateVertices > 0, "selected finalization lost private representation");
  if (enabled) requireState(selectedFinalStroke.batched && selectedFinalStroke.extracted && selectedFinal.batchTriangles === shown.batchTriangles,
    "selected finalization left overlapping batch representation");
  find(selectedData.guid)!.setValue(BrushStroke, "selected", false);
  await tick();
  const deselectedFinal = snapshot("deselected-remote-final");
  observations.push(deselectedFinal);
  const deselectedStroke = deselectedFinal.strokes.find((stroke) => stroke.guid === selectedData.guid)!;
  if (enabled) requireState(!deselectedStroke.extracted && deselectedFinal.batchTriangles > selectedFinal.batchTriangles && deselectedStroke.privateVertices === 0,
    "remote deselection did not return rendering ownership");
  const dropped = { ...progress, guid: `${prefix}drop` };
  authoring.upsertRemoteStroke(dropped);
  await tick();
  const droppedEntity = find(dropped.guid)!;
  droppedEntity.setValue(BrushStroke, "selected", true);
  await tick();
  let disposed = 0;
  (droppedEntity.object3D as Mesh).geometry.addEventListener("dispose", () => { disposed += 1; });
  authoring.dropRemoteStroke(dropped.guid);
  await tick();
  requireState(!find(dropped.guid) && disposed === 1, "drop did not remove active entity and dispose geometry once");
  // The renderer's public metrics are sampled once per second, not per commit.
  await new Promise((resolve) => setTimeout(resolve, 1200));
  observations.push(snapshot("dropped-selected-progress"));
  const final = observations[observations.length - 1];
  requireState(final.logicalBatched === observations[0].logicalBatched + (enabled ? 3 : 0), "remote lifecycle retained unexpected logical batch entries");
  requireState(final.compatible === final.logicalBatched, "remote lifecycle batch manager and logical entities disagree");
  return { enabled, expectedIndices, localReplay, disposed, observations };
}
