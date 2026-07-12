import { ShaderMaterial } from "@iwsdk/core";
import { describe, expect, it, vi } from "vitest";
import { TiltShaderLoader } from "three-icosa";

import { createIwsdkTiltMaterial } from "./iwsdk-tilt-material.js";

vi.mock("@iwsdk/core", () => ({
  ShaderMaterial: class {
    type = "ShaderMaterial";
    index0AttributeName?: string;
    name: string;
    vertexShader: string;

    constructor(params: { name?: string; vertexShader?: string }) {
      this.name = params.name ?? "";
      this.vertexShader = params.vertexShader ?? "";
    }
  },
}));

describe("IWSDK three-icosa material adapter", () => {
  it("creates a non-raw XR-compatible material through the upstream loader", () => {
    const loader = new TiltShaderLoader(undefined, {
      materialFactory: createIwsdkTiltMaterial,
    });

    const material = loader.createMaterial(
      {
        vertexShader:
          "uniform mat4 modelViewMatrix; attribute vec4 a_position; void main() { gl_Position = modelViewMatrix * a_position; }",
        fragmentShader: "void main() { gl_FragColor = vec4(1.0); }",
      },
      "OilPaint",
    );

    expect(material).toBeInstanceOf(ShaderMaterial);
    expect(material.type).toBe("ShaderMaterial");
    expect(material.name).toBe("OpenBrushShader_OilPaint");
    expect((material as ShaderMaterial).index0AttributeName).toBe("a_position");
    expect((material as ShaderMaterial).vertexShader).not.toContain(
      "uniform mat4 modelViewMatrix",
    );
  });
});
