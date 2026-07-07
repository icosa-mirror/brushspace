import {
  AssetManager,
  DoubleSide,
  FogExp2,
  Mesh,
  MeshBasicMaterial,
  createSystem,
} from "@iwsdk/core";

import type { Entity } from "@iwsdk/core";

import { OpenBrushScenePose } from "../components/OpenBrushCore.js";
import { assetUrl } from "../openbrush/asset-url.js";

// ENVIRONMENT_STANDARD render settings (fog color/density) and the flat
// material colors of the EnvironmentPrefabs/Standard geometry nodes.
const FOG_COLOR = 0x2a2a35;
// RenderSettings density 0.0025 with the environment's authored distances
// (fog x distance is unit-invariant): the ground stays essentially black,
// the near spike ring reads as dark silhouettes (~20% fog at ~100m), and the
// far side of the ring washes toward the fog color (~40% at ~200m).
// Tilt Brush uses Unity's plain Exponential fog; three's FogExp2 is squared,
// so the environment materials patch the fog chunk to the exponential form.
const FOG_DENSITY = 0.0025;
const EXPONENTIAL_FOG_CHUNK = `
#ifdef USE_FOG
  float fogFactor = 1.0 - exp( - fogDensity * vFogDepth );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`;
// Authored albedos render near-black under the app's lighting; these match
// the captured in-app appearance (ground reads as black).
const NODE_COLORS: Readonly<Record<string, number>> = {
  Geo_Spikes: 0x000000,
  Geo_FloorBackground: 0x000000,
  Geo_FloorForeground: 0x030304,
  Geo_StandardStage: 0x141414,
};

/**
 * Loads Open Brush's default "Standard" environment (the silhouette mountain
 * ring, floor disks, and stage) under the scene pose root, so the two-hand
 * world grab turns and scales it with the sketch — the landmark feedback the
 * original gives while grabbing.
 */
export class StandardEnvironmentSystem extends createSystem({
  scenePoses: { required: [OpenBrushScenePose] },
}) {
  private loaded = false;

  init() {
    this.world.scene.fog = new FogExp2(FOG_COLOR, FOG_DENSITY);
    this.cleanupFuncs.push(() => {
      this.world.scene.fog = null;
    });
  }

  update() {
    if (this.loaded) {
      return;
    }
    const next = this.queries.scenePoses.entities.values().next();
    const scenePose = next.done ? undefined : next.value;
    if (!scenePose) {
      return;
    }
    this.loaded = true;
    void this.loadEnvironment(scenePose);
  }

  private async loadEnvironment(scenePose: Entity): Promise<void> {
    try {
      const gltf = await AssetManager.loadGLTF(
        assetUrl("/openbrush/environment/standard.glb"),
        "openbrush-environment-standard",
      );
      const root = gltf.scene;
      root.name = "OpenBrushEnvironmentStandard";
      root.traverse((object) => {
        if (!(object instanceof Mesh)) {
          return;
        }
        const color = NODE_COLORS[object.name] ?? 0x000000;
        const material = new MeshBasicMaterial({ color, side: DoubleSide });
        material.onBeforeCompile = (shader) => {
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <fog_fragment>",
            EXPONENTIAL_FOG_CHUNK,
          );
        };
        object.material = material;
        object.raycast = () => {};
      });
      const entity = this.world.createTransformEntity(root, scenePose);
      entity.object3D!.name = "OpenBrushEnvironmentStandard";
    } catch (error) {
      console.warn("Standard environment failed to load:", error);
    }
  }
}
