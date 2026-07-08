import {
  AudioSource,
  AudioUtils,
  PlaybackMode,
  createSystem,
} from "@iwsdk/core";
import type { Entity } from "@iwsdk/core";

import {
  AudioFeedbackState,
  InputCommandState,
  OpenBrushAppState,
  OpenBrushEraserCursor,
  SettingsState,
} from "../components/OpenBrushCore.js";
import { assetUrl } from "../openbrush/asset-url.js";

/**
 * One-shot sound effects, all lifted from Open Brush's Assets/Audio (see
 * public/audio/openbrush/NOTICE). Paint start/end deliberately have NO
 * sound: the original plays looping per-brush audio while drawing (a later
 * feature), and a beep per stroke gets old immediately.
 */
const OPEN_BRUSH_SOUNDS = {
  "ui-click": { file: "ui-click.wav", volume: 0.5 },
  "ui-hover": { file: "ui-hover.wav", volume: 0.22 },
  "panel-rotate": { file: "panel-rotate.wav", volume: 0.5 },
  "undo-1": { file: "undo-1.wav", volume: 0.45 },
  "undo-2": { file: "undo-2.wav", volume: 0.45 },
  "undo-3": { file: "undo-3.wav", volume: 0.45 },
  "redo-1": { file: "redo-1.wav", volume: 0.45 },
  "redo-2": { file: "redo-2.wav", volume: 0.45 },
  "redo-3": { file: "redo-3.wav", volume: 0.45 },
  "erase-1": { file: "erase-1.wav", volume: 0.5 },
  "erase-2": { file: "erase-2.wav", volume: 0.5 },
  "camera-shutter": { file: "camera-shutter.wav", volume: 0.6 },
  save: { file: "save.wav", volume: 0.5 },
  "world-grab": { file: "world-grab.wav", volume: 0.45 },
  "color-picked": { file: "color-picked.wav", volume: 0.6 },
  connect: { file: "connect.wav", volume: 0.4 },
  "peer-left": { file: "peer-left.wav", volume: 0.45 },
  "load-sketch": { file: "load-sketch.wav", volume: 0.4 },
  "stroke-end": { file: "stroke-end.wav", volume: 0.25 },
} as const;

export type OpenBrushSoundId = keyof typeof OPEN_BRUSH_SOUNDS;
export type OpenBrushSoundVariant = "undo" | "redo" | "erase";

const VARIANTS: Record<OpenBrushSoundVariant, OpenBrushSoundId[]> = {
  undo: ["undo-1", "undo-2", "undo-3"],
  redo: ["redo-1", "redo-2", "redo-3"],
  erase: ["erase-1", "erase-2"],
};

export class AudioFeedbackSystem extends createSystem({
  feedback: {
    required: [OpenBrushAppState, InputCommandState, AudioFeedbackState],
  },
  eraserCursors: { required: [OpenBrushEraserCursor] },
}) {
  private readonly soundEntities = new Map<OpenBrushSoundId, Entity>();
  private lastHoverValid = false;
  private lastRotationSteps = Number.NaN;

  init(): void {
    for (const [id, spec] of Object.entries(OPEN_BRUSH_SOUNDS)) {
      const entity = this.world.createTransformEntity();
      entity.object3D!.name = `OpenBrushSound_${id}`;
      entity.addComponent(AudioSource, {
        src: assetUrl(`/audio/openbrush/${spec.file}`),
        positional: false,
        volume: spec.volume,
        loop: false,
        autoplay: false,
        playbackMode: PlaybackMode.Overlap,
        maxInstances: 3,
      });
      this.soundEntities.set(id as OpenBrushSoundId, entity);
    }
  }

  /** Plays a one-shot (no-op while feedback is disabled). */
  playSound(sound: OpenBrushSoundId): void {
    if (!this.feedbackEnabled()) {
      return;
    }
    const entity = this.soundEntities.get(sound);
    if (entity) {
      AudioUtils.play(entity);
    }
    this.recordEvent(sound);
  }

  /** Plays a random variant, like the original's Undo_1..3 rotation. */
  playSoundVariant(variant: OpenBrushSoundVariant): void {
    const options = VARIANTS[variant];
    this.playSound(options[Math.floor(Math.random() * options.length)]);
  }

  update(): void {
    const appState = this.getFeedbackEntity();
    if (!appState) {
      return;
    }

    // Tool changes are tracked for state/debugging; panel clicks already
    // provide the audible feedback.
    const activeTool = String(appState.getValue(OpenBrushAppState, "activeTool"));
    const lastTool = String(appState.getValue(AudioFeedbackState, "lastTool"));
    if (activeTool !== lastTool) {
      appState.setValue(AudioFeedbackState, "lastTool", activeTool);
      this.bumpCounter(appState, "toolChangeCount", "tool-change");
    }
    if (Boolean(appState.getValue(InputCommandState, "paintDown"))) {
      this.bumpCounter(appState, "paintStartCount", "paint-start");
    }
    if (Boolean(appState.getValue(InputCommandState, "paintUp"))) {
      this.bumpCounter(appState, "paintEndCount", "paint-end");
    }

    // Prism ring rotation swipe.
    if (appState.hasComponent(SettingsState)) {
      const steps = Number(
        appState.getValue(SettingsState, "wandPanelRotationSteps"),
      );
      if (!Number.isNaN(this.lastRotationSteps) && steps !== this.lastRotationSteps) {
        this.playSound("panel-rotate");
      }
      this.lastRotationSteps = steps;
    }

    // Dropper hover acquiring / losing a target.
    const cursorNext = this.queries.eraserCursors.entities.values().next();
    const cursor = cursorNext.done ? undefined : cursorNext.value;
    if (cursor) {
      const hoverValid = Boolean(
        cursor.getValue(OpenBrushEraserCursor, "hoverValid"),
      );
      if (hoverValid !== this.lastHoverValid) {
        this.lastHoverValid = hoverValid;
        if (hoverValid) {
          this.playSound("ui-hover");
        }
      }
    }
  }

  private feedbackEnabled(): boolean {
    const appState = this.getFeedbackEntity();
    return appState
      ? Boolean(appState.getValue(AudioFeedbackState, "enabled"))
      : false;
  }

  private recordEvent(eventName: string): void {
    const appState = this.getFeedbackEntity();
    if (!appState) {
      return;
    }
    appState.setValue(
      AudioFeedbackState,
      "eventCount",
      Number(appState.getValue(AudioFeedbackState, "eventCount")) + 1,
    );
    appState.setValue(AudioFeedbackState, "lastEvent", eventName);
  }

  private bumpCounter(
    appState: Entity,
    counter: "toolChangeCount" | "paintStartCount" | "paintEndCount",
    eventName: string,
  ): void {
    appState.setValue(
      AudioFeedbackState,
      counter,
      Number(appState.getValue(AudioFeedbackState, counter)) + 1,
    );
    appState.setValue(AudioFeedbackState, "lastEvent", eventName);
  }

  private getFeedbackEntity(): Entity | undefined {
    const next = this.queries.feedback.entities.values().next();
    return next.done ? undefined : next.value;
  }
}
