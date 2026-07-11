import { Mesh, createSystem } from "@iwsdk/core";
import type { Material, ShaderMaterial } from "@iwsdk/core";

import { BrushStroke } from "../components/core.js";
import { openBrushShaderLibrary } from "../brushes/brush-shader-library.js";
import { planBrushMaterialUpgrades } from "../brushes/brush-material-upgrade.js";

const LOG_PREFIX = "[BrushMaterialUpgrade]";

interface StrokeMaterialTarget {
  brushGuid: string;
  material: Material;
  mesh: Mesh;
}

export class BrushMaterialUpgradeSystem extends createSystem({
  strokes: { required: [BrushStroke] },
}) {
  init(): void {
    this.cleanupFuncs.push(
      openBrushShaderLibrary.subscribeMaterialLoaded((guid, material) => {
        this.upgradeGuid(guid, material);
      }),
    );
    this.queries.strokes.subscribe("qualify", (entity) => {
      const guid = String(entity.getValue(BrushStroke, "brushGuid"));
      const material = openBrushShaderLibrary.get(guid);
      if (material) {
        this.upgradeGuid(guid, material);
      }
    });
  }

  private upgradeGuid(guid: string, loadedMaterial: ShaderMaterial): void {
    const targets: StrokeMaterialTarget[] = [];
    for (const entity of this.queries.strokes.entities) {
      const object = entity.object3D;
      if (!(object instanceof Mesh) || Array.isArray(object.material)) {
        continue;
      }
      targets.push({
        brushGuid: String(entity.getValue(BrushStroke, "brushGuid")),
        material: object.material,
        mesh: object,
      });
    }
    const upgrades = planBrushMaterialUpgrades<StrokeMaterialTarget, Material>(
      targets,
      guid,
      loadedMaterial,
    );
    for (const { target, previous, next } of upgrades) {
      target.mesh.material = next;
      if (!openBrushShaderLibrary.isManaged(previous)) {
        previous.dispose();
      }
    }
    if (upgrades.length > 0) {
      console.log(`${LOG_PREFIX} upgraded ${upgrades.length} stroke(s) for ${guid}.`);
    }
  }
}
