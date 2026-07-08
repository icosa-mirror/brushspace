import {
  AudioSource,
  AudioUtils,
  PlaybackMode,
  Vector3,
  createSystem,
} from "@iwsdk/core";
import type { Entity } from "@iwsdk/core";

import {
  AudioFeedbackState,
  BrushSettings,
  OpenBrushAppState,
  SettingsState,
} from "../components/OpenBrushCore.js";
import { assetUrl } from "../openbrush/asset-url.js";
import brushAudioManifest from "../openbrush/generated/brush-audio.json";
import { StrokeAuthoringSystem } from "./StrokeAuthoringSystem.js";

interface BrushAudioSpec {
  layers: string[];
  basePitch: number;
  maxPitchShift: number;
  maxVolume: number;
  volumeUpSpeed: number;
  volumeDownSpeed: number;
  velocityRangeMultiplier: number;
}

const BRUSH_AUDIO = brushAudioManifest as Record<string, BrushAudioSpec>;

// PointerScript's volume-velocity range is (0.5, 10 * multiplier) in Tilt
// Brush units (decimeters/second) of room-space pointer speed.
const VELOCITY_MIN_DM_PER_S = 0.5;
const VELOCITY_MAX_BASE_DM_PER_S = 10;
// Original layer windows: each layer fades in as total volume passes its
// starting threshold (LayerVolume in PointerScript).
const LAYER_BEGINNINGS = [0, 1 / 3, 1 / 2, 2 / 3, 5 / 6];
// Sit the loops under the one-shot effects.
const MASTER_VOLUME = 0.55;

/**
 * Open Brush's per-brush draw audio: each brush loops its own sound layers
 * while drawing, with volume driven by tip speed and smoothed with the
 * brush's own up/down ramps. (The original also pitch-shifts with speed;
 * IWSDK's audio API has no playback-rate control, so that part is skipped.)
 */
export class BrushAudioSystem extends createSystem({
  appState: {
    required: [OpenBrushAppState, BrushSettings, SettingsState, AudioFeedbackState],
  },
}) {
  private readonly layerEntities = new Map<string, Entity>();
  private activeLayers: Entity[] = [];
  private activeSpec: BrushAudioSpec | undefined;
  private activeBrushGuid = "";
  private playing = false;
  private totalVolume = 0;
  private readonly tipPosition = new Vector3();
  private readonly previousTipPosition = new Vector3();
  private hasPreviousTip = false;

  update(delta: number) {
    const appState = this.getAppState();
    if (!appState || delta <= 0) {
      return;
    }
    const enabled = Boolean(appState.getValue(AudioFeedbackState, "enabled"));
    const authoring = this.world.getSystem(StrokeAuthoringSystem);
    const drawing = enabled && !!authoring?.getActiveLocalStrokeData();
    const brushGuid = String(
      appState.getValue(BrushSettings, "brushGuid"),
    ).toLowerCase();
    const spec = BRUSH_AUDIO[brushGuid];

    // Tip speed in room space (meters/second -> decimeters for TB ranges).
    const dominant = String(appState.getValue(SettingsState, "dominantHand"));
    const tip = this.world.scene.getObjectByName(
      `OpenBrushTipAnchor_${dominant === "left" ? "left" : "right"}`,
    );
    let speedDm = 0;
    if (tip) {
      tip.getWorldPosition(this.tipPosition);
      if (this.hasPreviousTip) {
        speedDm =
          (this.tipPosition.distanceTo(this.previousTipPosition) / delta) * 10;
      }
      this.previousTipPosition.copy(this.tipPosition);
      this.hasPreviousTip = true;
    }

    if (drawing && spec) {
      if (!this.playing || this.activeBrushGuid !== brushGuid) {
        this.startLoops(brushGuid, spec);
      }
    }

    const active = this.activeSpec;
    if (!active) {
      return;
    }

    let desired = 0;
    if (drawing && this.activeBrushGuid === brushGuid && spec) {
      const range =
        VELOCITY_MAX_BASE_DM_PER_S * active.velocityRangeMultiplier -
        VELOCITY_MIN_DM_PER_S;
      desired = Math.min(
        1,
        Math.max(0, (speedDm - VELOCITY_MIN_DM_PER_S) / range),
      );
    }
    const step = desired - this.totalVolume;
    const up = active.volumeUpSpeed * delta;
    const down = active.volumeDownSpeed * delta;
    this.totalVolume += Math.min(up, Math.max(-down, step));

    for (let i = 0; i < this.activeLayers.length; i += 1) {
      const begin = LAYER_BEGINNINGS[Math.min(i, LAYER_BEGINNINGS.length - 1)];
      const layer01 = Math.min(
        1,
        Math.max(0, (this.totalVolume - begin) / (1 - begin)),
      );
      const entity = this.activeLayers[i];
      AudioUtils.setVolume(entity, layer01 * active.maxVolume * MASTER_VOLUME);
      // Keep the loop positional at the drawing tip.
      if (tip && entity.object3D) {
        entity.object3D.position.copy(this.tipPosition);
      }
    }

    if (!drawing && this.playing && this.totalVolume <= 0.004) {
      this.stopLoops();
    }
  }

  private startLoops(brushGuid: string, spec: BrushAudioSpec): void {
    this.stopLoops();
    this.activeBrushGuid = brushGuid;
    this.activeSpec = spec;
    this.activeLayers = spec.layers
      .slice(0, LAYER_BEGINNINGS.length)
      .map((clip) => this.ensureLayerEntity(clip));
    this.totalVolume = 0;
    for (const entity of this.activeLayers) {
      AudioUtils.setVolume(entity, 0);
      AudioUtils.play(entity);
    }
    this.playing = true;
  }

  private stopLoops(): void {
    for (const entity of this.activeLayers) {
      AudioUtils.stop(entity);
    }
    this.playing = false;
    this.totalVolume = 0;
  }

  private ensureLayerEntity(clip: string): Entity {
    const existing = this.layerEntities.get(clip);
    if (existing) {
      return existing;
    }
    const entity = this.world.createTransformEntity();
    entity.object3D!.name = `OpenBrushBrushAudio_${clip}`;
    entity.addComponent(AudioSource, {
      src: assetUrl(`/audio/brushes/${clip}`),
      positional: true,
      loop: true,
      autoplay: false,
      volume: 0,
      playbackMode: PlaybackMode.Restart,
      maxInstances: 1,
    });
    this.layerEntities.set(clip, entity);
    return entity;
  }

  private getAppState(): Entity | undefined {
    const next = this.queries.appState.entities.values().next();
    return next.done ? undefined : next.value;
  }
}
