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
} from "../components/OpenBrushCore.js";
import { createFeedbackWavUrl } from "../openbrush/audio-feedback.js";

export class AudioFeedbackSystem extends createSystem({
  feedback: {
    required: [OpenBrushAppState, InputCommandState, AudioFeedbackState],
  },
}) {
  private feedbackUrl = "";

  init(): void {
    this.feedbackUrl = createFeedbackWavUrl();
    this.cleanupFuncs.push(() => {
      URL.revokeObjectURL(this.feedbackUrl);
    });

    this.queries.feedback.subscribe("qualify", (entity) => {
      this.ensureAudioSource(entity);
      entity.setValue(
        AudioFeedbackState,
        "lastTool",
        String(entity.getValue(OpenBrushAppState, "activeTool")),
      );
    });
    for (const entity of this.queries.feedback.entities) {
      this.ensureAudioSource(entity);
      entity.setValue(
        AudioFeedbackState,
        "lastTool",
        String(entity.getValue(OpenBrushAppState, "activeTool")),
      );
    }
  }

  update(): void {
    for (const entity of this.queries.feedback.entities) {
      this.updateFeedback(entity);
    }
  }

  private updateFeedback(entity: Entity): void {
    if (!Boolean(entity.getValue(AudioFeedbackState, "enabled"))) {
      return;
    }

    const activeTool = String(entity.getValue(OpenBrushAppState, "activeTool"));
    const lastTool = String(entity.getValue(AudioFeedbackState, "lastTool"));
    if (activeTool !== lastTool) {
      entity.setValue(AudioFeedbackState, "lastTool", activeTool);
      this.recordFeedback(entity, "tool-change", "toolChangeCount");
    }

    if (Boolean(entity.getValue(InputCommandState, "paintDown"))) {
      this.recordFeedback(entity, "paint-start", "paintStartCount");
    }
    if (Boolean(entity.getValue(InputCommandState, "paintUp"))) {
      this.recordFeedback(entity, "paint-end", "paintEndCount");
    }
  }

  private ensureAudioSource(entity: Entity): void {
    if (entity.hasComponent(AudioSource)) {
      return;
    }
    entity.addComponent(AudioSource, {
      src: this.feedbackUrl,
      positional: false,
      volume: 0.25,
      loop: false,
      autoplay: false,
      playbackMode: PlaybackMode.Overlap,
      maxInstances: 4,
    });
  }

  private recordFeedback(
    entity: Entity,
    eventName: string,
    counter: "toolChangeCount" | "paintStartCount" | "paintEndCount",
  ): void {
    this.ensureAudioSource(entity);
    entity.setValue(
      AudioFeedbackState,
      "eventCount",
      Number(entity.getValue(AudioFeedbackState, "eventCount")) + 1,
    );
    entity.setValue(
      AudioFeedbackState,
      counter,
      Number(entity.getValue(AudioFeedbackState, counter)) + 1,
    );
    entity.setValue(AudioFeedbackState, "lastEvent", eventName);
    AudioUtils.play(entity);
  }
}
