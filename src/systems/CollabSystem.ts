import {
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  PanelDocument,
  PanelUI,
  Quaternion,
  RayInteractable,
  UIKitDocument,
  Vector3,
  createSystem,
} from "@iwsdk/core";
import type { Entity, Object3D } from "@iwsdk/core";
import { Peer } from "peerjs";
import type { DataConnection } from "peerjs";

import {
  CollabState,
  OpenBrushAppState,
  OpenBrushScenePose,
  PersistenceState,
  SettingsState,
} from "../components/OpenBrushCore.js";
import {
  COLLAB_PROTOCOL_VERSION,
  collabPeerId,
  generateCollabCode,
  isValidCollabCode,
  parseCollabMessage,
  type CollabMessage,
} from "../openbrush/collab.js";
import type { Quat, Vec3 } from "../openbrush/types.js";
import { clearUIKitInteractionStateExcept } from "../openbrush/uikit-interaction.js";
import { SketchLibrarySystem } from "./SketchLibrarySystem.js";
import { StrokeAuthoringSystem } from "./StrokeAuthoringSystem.js";

type CollabPhase = "idle" | "hosting" | "joining" | "connected";

// Whole-stroke progress + tip beacons, both self-healing, so modest rates
// read smoothly without stressing the data channel.
const PROGRESS_INTERVAL_SECONDS = 0.1;
const TIP_INTERVAL_SECONDS = 0.12;
const TIP_STALE_SECONDS = 2;
// Tips flow ~8Hz from a live peer, so silence this long means the peer is
// gone (abrupt drops take WebRTC 30s+ to notice via ICE consent expiry).
// Side effect: a backgrounded 2D tab stops its loop and will read as gone.
const PEER_SILENCE_TIMEOUT_SECONDS = 10;
const HOST_ID_RETRIES = 3;

/**
 * Two-user peer-to-peer collaboration, scoped to a sketch session. The host
 * claims brushspace-<code> at the PeerJS cloud broker; the guest dials the
 * code. Stroke data travels as a custom protocol (see openbrush/collab.ts)
 * over one reliable JSON data channel. Leaving the sketch (Home / New /
 * Load) tears the connection down; a peer dropping never removes strokes —
 * the survivor keeps the whole sketch and can save it.
 */
export class CollabSystem extends createSystem({
  appState: { required: [OpenBrushAppState, CollabState, SettingsState] },
  scenePoses: { required: [OpenBrushScenePose] },
}) {
  private phase: CollabPhase = "idle";
  private role: "none" | "host" | "guest" = "none";
  private peer?: Peer;
  private conn?: DataConnection;
  private code = "";
  private hostRetriesLeft = HOST_ID_RETRIES;
  /** Set by index.ts when the page loads with ?join=<code>. */
  autoJoinCode = "";

  // Progress-broadcast bookkeeping for the local in-progress stroke.
  private progressTimer = 0;
  private lastProgressGuid = "";
  private lastProgressPointCount = 0;
  private committedGuids = new Set<string>();

  // Remote peer tip presence.
  private tipTimer = 0;
  private tipEntity?: Entity;
  private tipTargetPosition = new Vector3();
  private tipTargetQuaternion = new Quaternion();
  private tipLastSeen = -Infinity;
  private clock = 0;

  // Snapshot streaming (guest side).
  private snapshotStrokesPending = 0;
  private recvCount = 0;
  private lastRecvClock = 0;
  private readonly recentOps: string[] = [];

  // Join keypad panel.
  private keypadEntity?: Entity;
  private keypadDocument?: UIKitDocument;
  private appliedKeypadEntry: string | undefined;

  private readonly tempMatrix = new Matrix4();
  private readonly tempVector = new Vector3();
  private readonly tempQuaternion = new Quaternion();
  private readonly tempPoseQuaternion = new Quaternion();

  init() {
    // Localhost-only handle so a plain 2D browser tab (no XR input) can
    // exercise the collab path end to end in tests.
    if (globalThis.location?.hostname === "localhost") {
      (globalThis as Record<string, unknown>).__brushspaceCollab = this;
    }
    const authoring = this.world.getSystem(StrokeAuthoringSystem);
    if (authoring) {
      authoring.onLocalStrokesCommitted = (strokes) => {
        for (const stroke of strokes) {
          this.committedGuids.add(stroke.guid);
          this.send({ t: "stroke-end", stroke });
        }
      };
      authoring.onLocalStrokeVisibility = (guids, visible) => {
        this.send({ t: "visibility", guids: [...guids], visible });
      };
    }
  }

  update(delta: number) {
    this.clock += delta;
    const appState = this.getAppState();
    if (!appState) {
      return;
    }

    this.consumeAutoJoin(appState);

    // The connection lives inside a sketch session: leaving it disconnects.
    const mode = String(appState.getValue(OpenBrushAppState, "mode"));
    if (mode !== "ready" && this.phase !== "idle") {
      this.teardown("Left the sketch", "ended");
    }
    if (mode !== "ready" && this.isJoinPanelOpen(appState)) {
      this.closeJoinPanel();
    }

    this.syncKeypad(appState);
    this.updateRemoteTip(delta);

    if (this.phase !== "connected") {
      return;
    }
    if (this.clock - this.lastRecvClock > PEER_SILENCE_TIMEOUT_SECONDS) {
      console.log("[Collab] peer silent too long - treating as gone");
      this.onPeerGone();
      return;
    }
    this.broadcastStrokeProgress(delta);
    this.broadcastTip(delta);
  }

  // -------------------------------------------------------------------------
  // Public entry points (tools panel / URL)
  // -------------------------------------------------------------------------

  /** Share button: toggles hosting. */
  toggleHosting(): void {
    if (this.phase === "hosting") {
      this.teardown("Sharing stopped", "idle");
      return;
    }
    if (this.phase !== "idle") {
      return;
    }
    this.hostRetriesLeft = HOST_ID_RETRIES;
    this.startHosting(generateCollabCode());
  }

  /** Join button: opens the keypad. */
  openJoinPanel(): void {
    if (this.phase !== "idle") {
      return;
    }
    const appState = this.getAppState();
    appState?.setValue(CollabState, "joinPanelOpen", true);
    appState?.setValue(CollabState, "joinEntry", "");
    this.touch(appState);
  }

  closeJoinPanel(): void {
    const appState = this.getAppState();
    appState?.setValue(CollabState, "joinPanelOpen", false);
    appState?.setValue(CollabState, "joinEntry", "");
    this.touch(appState);
    this.disposeKeypad();
  }

  joinWithCode(code: string): void {
    if (!isValidCollabCode(code)) {
      this.setStatus("error", `Invalid code ${code}`);
      return;
    }
    if (this.phase !== "idle") {
      return;
    }
    this.closeJoinPanel();
    this.phase = "joining";
    this.role = "guest";
    this.code = code;
    this.setStatus("joining", `Joining ${code}...`);

    const peer = new Peer();
    this.peer = peer;
    peer.on("open", () => {
      if (this.peer !== peer) {
        return;
      }
      const conn = peer.connect(collabPeerId(code), {
        reliable: true,
        serialization: "json",
      });
      this.adoptConnection(conn);
    });
    peer.on("error", (error) => this.onPeerError(peer, error));
  }

  // -------------------------------------------------------------------------
  // Hosting / joining internals
  // -------------------------------------------------------------------------

  private startHosting(code: string): void {
    this.phase = "hosting";
    this.role = "host";
    this.code = code;
    this.setStatus("hosting", `Code ${code} - waiting for a friend`);

    const peer = new Peer(collabPeerId(code));
    this.peer = peer;
    peer.on("open", () => {
      if (this.peer === peer) {
        this.setStatus("hosting", `Code ${code} - share it!`);
      }
    });
    peer.on("connection", (conn) => {
      if (this.peer !== peer) {
        return;
      }
      if (this.conn) {
        // One guest only; politely refuse extras.
        conn.on("open", () => conn.close());
        return;
      }
      this.adoptConnection(conn);
    });
    peer.on("error", (error) => this.onPeerError(peer, error));
  }

  private adoptConnection(conn: DataConnection): void {
    this.conn = conn;
    conn.on("open", () => {
      console.log("[Collab] connection open, role:", this.role);
      if (this.conn !== conn) {
        return;
      }
      this.phase = "connected";
      this.lastRecvClock = this.clock;
      if (this.role === "guest") {
        conn.send({ t: "hello", version: COLLAB_PROTOCOL_VERSION });
        this.setStatus("connected", "Connected - syncing sketch");
      } else {
        this.sendSnapshot();
        this.setStatus("connected", `Connected - code ${this.code}`);
      }
    });
    conn.on("data", (data) => {
      if (this.conn === conn) {
        this.onMessage(data);
      }
    });
    conn.on("close", () => {
      console.log("[Collab] connection closed");
      if (this.conn === conn) {
        this.onPeerGone();
      }
    });
    conn.on("error", (error) => {
      console.warn("[Collab] connection error", error);
      if (this.conn === conn) {
        this.onPeerGone();
      }
    });
  }

  private onPeerError(peer: Peer, error: Error & { type?: string }): void {
    if (this.peer !== peer) {
      return;
    }
    if (error.type === "unavailable-id" && this.role === "host") {
      // Someone else holds this code at the broker — roll a new one.
      peer.destroy();
      this.peer = undefined;
      if (this.hostRetriesLeft > 0) {
        this.hostRetriesLeft -= 1;
        this.startHosting(generateCollabCode());
      } else {
        this.teardown("Could not get a share code - try again", "error");
      }
      return;
    }
    if (error.type === "peer-unavailable") {
      this.teardown(`No sketch found for code ${this.code}`, "error");
      return;
    }
    if (this.phase === "connected") {
      // Signaling hiccups don't matter once the data channel is up.
      return;
    }
    this.teardown("Connection failed - try again", "error");
  }

  /** The other side vanished: keep every stroke, just go solo. */
  private onPeerGone(): void {
    const wasGuest = this.role === "guest";
    this.conn = undefined;
    if (this.role === "host" && this.peer && !this.peer.destroyed) {
      // Keep the room open for a new guest on the same code.
      this.phase = "hosting";
      this.setStatus(
        "hosting",
        `Guest left - code ${this.code} still active`,
      );
      this.world.getSystem(StrokeAuthoringSystem)?.clearRemoteActiveStrokes();
      return;
    }
    this.teardown(
      wasGuest ? "Host left - the sketch is yours to keep" : "Peer left",
      "ended",
    );
  }

  private teardown(message: string, status: string): void {
    const conn = this.conn;
    this.conn = undefined;
    if (conn?.open) {
      try {
        conn.send({ t: "bye" });
        conn.close();
      } catch {
        // Best-effort goodbye.
      }
    }
    this.peer?.destroy();
    this.peer = undefined;
    this.phase = "idle";
    this.role = "none";
    this.code = "";
    this.snapshotStrokesPending = 0;
    this.lastProgressGuid = "";
    this.committedGuids.clear();
    this.world.getSystem(StrokeAuthoringSystem)?.clearRemoteActiveStrokes();
    this.hideRemoteTip();
    this.setStatus(status, message);
  }

  // -------------------------------------------------------------------------
  // Wire protocol
  // -------------------------------------------------------------------------

  private send(message: CollabMessage): void {
    if (this.phase === "connected" && this.conn?.open) {
      this.conn.send(message);
    }
  }

  private sendSnapshot(): void {
    const library = this.world.getSystem(SketchLibrarySystem);
    const appState = this.getAppState();
    if (!library || !this.conn?.open) {
      return;
    }
    const strokes = library.collectVisibleStrokeData();
    const sketchName = appState
      ? String(appState.getValue(PersistenceState, "activeSketchName"))
      : "Shared Sketch";
    this.conn.send({
      t: "snapshot",
      version: COLLAB_PROTOCOL_VERSION,
      sketchName,
      strokeCount: strokes.length,
    });
    for (const stroke of strokes) {
      this.conn.send({ t: "stroke-end", stroke });
    }
  }

  private onMessage(raw: unknown): void {
    this.recvCount += 1;
    this.lastRecvClock = this.clock;
    const message = parseCollabMessage(raw);
    if (!message) {
      console.warn("[Collab] dropped malformed message", raw);
      this.recentOps.push("malformed");
      return;
    }
    if (message.t !== "tip") {
      this.recentOps.push(message.t);
      if (this.recentOps.length > 20) {
        this.recentOps.shift();
      }
    }
    const authoring = this.world.getSystem(StrokeAuthoringSystem);
    switch (message.t) {
      case "hello":
        if (message.version !== COLLAB_PROTOCOL_VERSION) {
          this.teardown("Peer runs an incompatible version", "error");
        }
        break;
      case "snapshot": {
        if (message.version !== COLLAB_PROTOCOL_VERSION) {
          this.teardown("Host runs an incompatible version", "error");
          break;
        }
        this.snapshotStrokesPending = message.strokeCount;
        this.world
          .getSystem(SketchLibrarySystem)
          ?.adoptCollabSketchName(message.sketchName);
        this.setStatus("connected", `Connected - code ${this.code}`);
        break;
      }
      case "stroke-progress":
        authoring?.upsertRemoteStroke(message.stroke);
        break;
      case "stroke-end":
        authoring?.finalizeRemoteStroke(message.stroke);
        if (this.snapshotStrokesPending > 0) {
          this.snapshotStrokesPending -= 1;
        }
        break;
      case "stroke-drop":
        authoring?.dropRemoteStroke(message.guid);
        break;
      case "visibility": {
        const applied = authoring?.applyRemoteVisibility(
          message.guids,
          message.visible,
        );
        console.log(
          `[Collab] visibility(${message.visible}) for ${message.guids.length} guids applied to ${applied ?? "?"} strokes`,
        );
        break;
      }
      case "tip":
        this.tipTargetPosition.set(...message.position);
        this.tipTargetQuaternion.set(...message.orientation);
        this.tipLastSeen = this.clock;
        this.showRemoteTip();
        break;
      case "bye":
        this.onPeerGone();
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Live broadcast
  // -------------------------------------------------------------------------

  private broadcastStrokeProgress(delta: number): void {
    this.progressTimer += delta;
    if (this.progressTimer < PROGRESS_INTERVAL_SECONDS) {
      return;
    }
    this.progressTimer = 0;
    const authoring = this.world.getSystem(StrokeAuthoringSystem);
    const active = authoring?.getActiveLocalStrokeData();

    if (!active) {
      // A stroke we broadcast progress for ended: if it never committed,
      // it was discarded — tell the peer to drop it.
      if (this.lastProgressGuid && !this.committedGuids.has(this.lastProgressGuid)) {
        this.send({ t: "stroke-drop", guid: this.lastProgressGuid });
      }
      this.lastProgressGuid = "";
      this.lastProgressPointCount = 0;
      if (this.committedGuids.size > 64) {
        this.committedGuids.clear();
      }
      return;
    }
    if (active.controlPoints.length < 2) {
      return;
    }
    if (
      active.guid === this.lastProgressGuid &&
      active.controlPoints.length === this.lastProgressPointCount
    ) {
      return;
    }
    this.lastProgressGuid = active.guid;
    this.lastProgressPointCount = active.controlPoints.length;
    this.send({ t: "stroke-progress", stroke: active });
  }

  private broadcastTip(delta: number): void {
    this.tipTimer += delta;
    if (this.tipTimer < TIP_INTERVAL_SECONDS) {
      return;
    }
    this.tipTimer = 0;
    const tip = this.getLocalTipObject();
    const poseObject = this.getScenePoseObject();
    if (!tip || !poseObject) {
      return;
    }
    // Publish in canvas space so each side's world-grab pose stays local.
    tip.getWorldPosition(this.tempVector);
    tip.getWorldQuaternion(this.tempQuaternion);
    this.tempMatrix.copy(poseObject.matrixWorld).invert();
    this.tempVector.applyMatrix4(this.tempMatrix);
    poseObject.getWorldQuaternion(this.tempPoseQuaternion).invert();
    this.tempQuaternion.premultiply(this.tempPoseQuaternion);
    this.send({
      t: "tip",
      position: this.tempVector.toArray() as Vec3,
      orientation: [
        this.tempQuaternion.x,
        this.tempQuaternion.y,
        this.tempQuaternion.z,
        this.tempQuaternion.w,
      ] as Quat,
      drawing: Boolean(this.lastProgressGuid),
    });
  }

  private getLocalTipObject(): Object3D | undefined {
    const appState = this.getAppState();
    const dominant = appState
      ? String(appState.getValue(SettingsState, "dominantHand"))
      : "right";
    return (
      this.world.scene.getObjectByName(`OpenBrushTipAnchor_${dominant}`) ??
      undefined
    );
  }

  private getScenePoseObject(): Object3D | undefined {
    for (const entity of this.queries.scenePoses.entities) {
      return entity.object3D ?? undefined;
    }
    return undefined;
  }

  // -------------------------------------------------------------------------
  // Remote tip visual
  // -------------------------------------------------------------------------

  private showRemoteTip(): void {
    if (this.tipEntity) {
      return;
    }
    for (const entity of this.queries.scenePoses.entities) {
      const mesh = new Mesh(
        new OctahedronGeometry(0.012),
        new MeshBasicMaterial({ color: 0x63d0ff }),
      );
      mesh.name = "BrushspacePeerTip";
      mesh.raycast = () => {};
      const tipEntity = this.world.createTransformEntity(mesh, entity);
      tipEntity.object3D!.name = "BrushspacePeerTipEntity";
      this.tipEntity = tipEntity;
      return;
    }
  }

  private hideRemoteTip(): void {
    this.tipEntity?.dispose();
    this.tipEntity = undefined;
    this.tipLastSeen = -Infinity;
  }

  private updateRemoteTip(delta: number): void {
    const tip = this.tipEntity?.object3D;
    if (!tip) {
      return;
    }
    if (this.clock - this.tipLastSeen > TIP_STALE_SECONDS) {
      tip.visible = false;
      return;
    }
    tip.visible = true;
    const alpha = Math.min(1, delta * 12);
    tip.position.lerp(this.tipTargetPosition, alpha);
    tip.quaternion.slerp(this.tipTargetQuaternion, alpha);
  }

  // -------------------------------------------------------------------------
  // Join keypad panel
  // -------------------------------------------------------------------------

  private syncKeypad(appState: Entity): void {
    const open = this.isJoinPanelOpen(appState);
    if (open && !this.keypadEntity) {
      this.createKeypad(appState);
    }
    if (!open && this.keypadEntity) {
      this.disposeKeypad();
    }
    const entity = this.keypadEntity;
    if (!entity || !entity.hasComponent(PanelDocument)) {
      return;
    }
    const document = PanelDocument.data.document[entity.index] as UIKitDocument;
    if (!document) {
      return;
    }
    if (this.keypadDocument !== document) {
      this.keypadDocument = document;
      this.appliedKeypadEntry = undefined;
      this.bindKeypad(document, appState);
    }
    const entry = String(appState.getValue(CollabState, "joinEntry"));
    if (entry !== this.appliedKeypadEntry) {
      this.appliedKeypadEntry = entry;
      const display = document.getElementById("join-entry") as {
        setProperties(properties: Record<string, unknown>): void;
      } | null;
      display?.setProperties({
        text: entry.padEnd(6, "·").split("").join(" "),
      });
    }
  }

  private createKeypad(appState: Entity): void {
    const dominant = String(appState.getValue(SettingsState, "dominantHand"));
    const hand = dominant === "left" ? "right" : "left";
    const grip =
      hand === "left"
        ? this.world.playerSpaceEntities.gripSpaces.left
        : this.world.playerSpaceEntities.gripSpaces.right;
    const entity = this.world
      .createTransformEntity(undefined, grip)
      .addComponent(PanelUI, {
        config: "./ui/collab-join.json",
        maxWidth: 0.2,
        maxHeight: 0.3,
      })
      .addComponent(RayInteractable);
    entity.object3D!.name = "BrushspaceJoinKeypad";
    entity.object3D!.position.set(0, 0.035, -0.13);
    entity.object3D!.quaternion.set(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);
    this.keypadEntity = entity;
    this.keypadDocument = undefined;
  }

  private disposeKeypad(): void {
    this.keypadEntity?.dispose();
    this.keypadEntity = undefined;
    this.keypadDocument = undefined;
    this.appliedKeypadEntry = undefined;
  }

  private bindKeypad(document: UIKitDocument, appState: Entity): void {
    const on = (id: string, handler: () => void) => {
      const element = document.getElementById(id) as {
        addEventListener(type: string, listener: () => void): void;
      } | null;
      element?.addEventListener("click", () => {
        clearUIKitInteractionStateExcept(document, element);
        handler();
      });
    };
    for (let digit = 0; digit <= 9; digit += 1) {
      on(`key-${digit}`, () => {
        const entry = String(appState.getValue(CollabState, "joinEntry"));
        if (entry.length < 6) {
          appState.setValue(CollabState, "joinEntry", entry + String(digit));
          this.touch(appState);
        }
      });
    }
    on("key-back", () => {
      const entry = String(appState.getValue(CollabState, "joinEntry"));
      appState.setValue(CollabState, "joinEntry", entry.slice(0, -1));
      this.touch(appState);
    });
    on("key-cancel", () => this.closeJoinPanel());
    on("key-join", () => {
      const entry = String(appState.getValue(CollabState, "joinEntry"));
      if (isValidCollabCode(entry)) {
        this.joinWithCode(entry);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Misc
  // -------------------------------------------------------------------------

  /** Dev/test helper: author a small local stroke and share it, as a real
   * finalized stroke would be. */
  debugCommitTestStroke(): string {
    const guid = `debug-${Math.random().toString(36).slice(2, 10)}`;
    const points = [];
    for (let index = 0; index < 12; index += 1) {
      points.push({
        position: [0.4 + index * 0.03, 1.2 + Math.sin(index * 0.6) * 0.08, -0.8] as Vec3,
        orientation: [0, 0, 0, 1] as Quat,
        pressure: 1,
        timestampMs: index * 16,
      });
    }
    const stroke = {
      color: [1, 0.6, 0.1, 1] as [number, number, number, number],
      brushGuid: "429ed64a-4e97-4466-84d3-145a861ef684",
      brushSize: 0.02,
      brushScale: 1,
      controlPoints: points,
      flags: 0,
      seed: 1,
      groupId: 0,
      guid,
      layerIndex: 0,
    };
    this.world.getSystem(StrokeAuthoringSystem)?.spawnStrokeFromData(stroke, true);
    this.send({ t: "stroke-end", stroke });
    return guid;
  }

  /** Dev/test helper: current collab state summary. */
  debugState(): Record<string, unknown> {
    return {
      phase: this.phase,
      role: this.role,
      code: this.code,
      connected: Boolean(this.conn?.open),
      snapshotStrokesPending: this.snapshotStrokesPending,
      recvCount: this.recvCount,
      recentOps: [...this.recentOps],
    };
  }

  /** Dev/test helper: save the active sketch (2D tabs have no tools panel). */
  debugSaveActiveSketch(): void {
    this.world.getSystem(SketchLibrarySystem)?.saveActiveSketch();
  }

  /** Dev/test helper: enter a blank ready-mode sketch (2D tabs can then host). */
  debugEnterSketch(): void {
    this.world.getSystem(SketchLibrarySystem)?.prepareForCollabJoin();
  }

  private consumeAutoJoin(appState: Entity): void {
    if (!this.autoJoinCode) {
      return;
    }
    const code = this.autoJoinCode;
    this.autoJoinCode = "";
    if (!isValidCollabCode(code)) {
      return;
    }
    this.world.getSystem(SketchLibrarySystem)?.prepareForCollabJoin();
    this.joinWithCode(code);
  }

  private isJoinPanelOpen(appState: Entity): boolean {
    return Boolean(appState.getValue(CollabState, "joinPanelOpen"));
  }

  private setStatus(status: string, message: string): void {
    const appState = this.getAppState();
    if (!appState) {
      return;
    }
    appState.setValue(CollabState, "status", status);
    appState.setValue(CollabState, "role", this.role);
    appState.setValue(CollabState, "code", this.code);
    appState.setValue(CollabState, "message", message);
    this.touch(appState);
  }

  private touch(appState: Entity | undefined): void {
    if (!appState) {
      return;
    }
    appState.setValue(
      CollabState,
      "revision",
      Number(appState.getValue(CollabState, "revision")) + 1,
    );
  }

  private getAppState(): Entity | undefined {
    const next = this.queries.appState.entities.values().next();
    return next.done ? undefined : next.value;
  }
}

