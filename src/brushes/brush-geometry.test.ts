import { describe, expect, it } from "vitest";

import referenceManifest from "./generated/exportManifest.json";
import generatedBrushAssets from "./generated/brush-assets.json";

import {
  buildBrushInventoryFromExportManifest,
  findBrushByGuid,
  type BrushAssetRecord,
  type OpenBrushExportManifest,
} from "./brush-inventory.js";
import {
  generateBrushGeometry,
  getGeneratedIndexCount,
  getGeneratedVertexCount,
} from "./brush-geometry.js";
import { createPhase1FixtureDocument } from "../sketch/fixtures.js";
import type { StrokeData } from "../types.js";

const inventory = buildBrushInventoryFromExportManifest(
  referenceManifest as unknown as OpenBrushExportManifest,
  generatedBrushAssets.brushes as unknown as Record<string, BrushAssetRecord>,
);
const fixtureStroke = createPhase1FixtureDocument().strokes[0];

describe("brush geometry generation", () => {
  it("generates stable ribbon geometry for marker strokes", () => {
    const geometry = generateBrushGeometry(fixtureStroke, "ribbon");

    expect(geometry.family).toBe("ribbon");
    expect(getGeneratedVertexCount(geometry)).toBe(6);
    expect(getGeneratedIndexCount(geometry)).toBe(12);
    expect(geometry.positions).toHaveLength(18);
    expect(geometry.normals).toHaveLength(18);
    expect(geometry.tangents).toHaveLength(24);
    expect(geometry.colors).toHaveLength(24);
    expect(geometry.uvs).toHaveLength(12);
    expect(geometry.bounds.min[0]).toBeLessThan(-0.2);
    expect(geometry.bounds.max[0]).toBeGreaterThan(0.2);
  });

  it("expands generated bounds by visible ribbon width", () => {
    const stroke: StrokeData = {
      guid: "wide-ribbon",
      brushGuid: "2241cd32-8ba2-48a5-9ee7-2caef7e9ed62",
      brushSize: 0.2,
      brushScale: 1,
      color: [1, 1, 1, 1],
      layerIndex: 0,
      flags: 0,
      seed: 1,
      groupId: 1,
      controlPoints: [
        {
          position: [0, 0, 0],
          orientation: [0, 0, 0, 1],
          pressure: 1,
          timestampMs: 0,
        },
        {
          position: [1, 0, 0],
          orientation: [0, 0, 0, 1],
          pressure: 1,
          timestampMs: 16,
        },
      ],
    };

    const geometry = generateBrushGeometry(stroke, "ribbon");

    // Identity pointer orientation (-Z forward) with an +X stroke widens the
    // ribbon along Y (ComputeSurfaceFrameNew: right = pointerForward x move).
    expect(geometry.bounds.min[0]).toBeCloseTo(0);
    expect(geometry.bounds.min[1]).toBeCloseTo(-0.1);
    expect(geometry.bounds.min[2]).toBeCloseTo(0);
    expect(geometry.bounds.max[0]).toBeCloseTo(1);
    expect(geometry.bounds.max[1]).toBeCloseTo(0.1);
    expect(geometry.bounds.max[2]).toBeCloseTo(0);
  });

  it.each(["ribbon", "emissive", "tube", "particle"] as const)(
    "applies serialized brushScale to %s geometry size",
    (family) => {
      const unscaledStroke = createTwoPointStroke({
        guid: `unscaled-${family}`,
        brushSize: 0.2,
        pressure: 1,
      });
      const scaledStroke = {
        ...unscaledStroke,
        guid: `scaled-${family}`,
        brushScale: 2,
      };

      const unscaled = generateBrushGeometry(unscaledStroke, family);
      const scaled = generateBrushGeometry(scaledStroke, family);
      const unscaledSpan = unscaled.bounds.max[1] - unscaled.bounds.min[1];
      const scaledSpan = scaled.bounds.max[1] - scaled.bounds.min[1];

      expect(scaledSpan).toBeCloseTo(unscaledSpan * 2);
    },
  );

  it("uses brush pressure-size minimum for low-pressure ribbon width", () => {
    const stroke = createTwoPointStroke({
      guid: "low-pressure-light",
      brushSize: 0.2,
      pressure: 0,
    });

    const geometry = generateBrushGeometry(stroke, "emissive", {
      pressureSizeRange: [0.15, 1],
    });

    expect(geometry.bounds.min[1]).toBeCloseTo(-0.015);
    expect(geometry.bounds.max[1]).toBeCloseTo(0.015);
  });

  it.each(["ribbon", "emissive", "tube", "particle"] as const)(
    "applies brush pressure-opacity range to %s vertex alpha",
    (family) => {
      const stroke = createTwoPointStroke({
        guid: `low-opacity-${family}`,
        brushSize: 0.2,
        pressure: 0.5,
      });

      const geometry = generateBrushGeometry(stroke, family, {
        pressureOpacityRange: [0.5, 1],
      });

      for (let index = 3; index < geometry.colors.length; index += 4) {
        expect(geometry.colors[index]).toBeCloseTo(0.75);
      }
    },
  );

  it("multiplies pressure opacity by descriptor opacity", () => {
    const stroke = createTwoPointStroke({
      guid: "descriptor-opacity",
      brushSize: 0.2,
      pressure: 0.5,
    });
    stroke.color[3] = 0.8;

    const geometry = generateBrushGeometry(stroke, "ribbon", {
      pressureOpacityRange: [0.5, 1],
      geometryParams: { opacity: 0.4 },
    });

    for (let index = 3; index < geometry.colors.length; index += 4) {
      expect(geometry.colors[index]).toBeCloseTo(0.24);
    }
  });

  it("uses Open Brush distance UV scaling for distance ribbons", () => {
    const stroke = createUnevenThreePointStroke();

    const geometry = generateBrushGeometry(stroke, "ribbon", {
      generatorClass: "QuadStripBrushDistanceUV",
      geometryParams: { tileRate: 2 },
    });

    const initialU = geometry.uvs[0];
    expect(geometry.uvs[4] - initialU).toBeCloseTo(2);
    expect(geometry.uvs[8] - initialU).toBeCloseTo(6);
  });

  it("applies brushScale to Open Brush distance UV density", () => {
    const stroke = createUnevenThreePointStroke();
    stroke.brushScale = 2;

    const geometry = generateBrushGeometry(stroke, "ribbon", {
      generatorClass: "QuadStripBrushDistanceUV",
      geometryParams: { tileRate: 2 },
    });

    const initialU = geometry.uvs[0];
    expect(geometry.uvs[4] - initialU).toBeCloseTo(1);
    expect(geometry.uvs[8] - initialU).toBeCloseTo(3);
  });

  it("normalizes stretch ribbon UVs by physical stroke length", () => {
    const geometry = generateBrushGeometry(
      createUnevenThreePointStroke(),
      "ribbon",
      { generatorClass: "QuadStripBrushStretchUV" },
    );

    expect(geometry.uvs[0]).toBeCloseTo(0);
    expect(geometry.uvs[4]).toBeCloseTo(1 / 3);
    expect(geometry.uvs[8]).toBeCloseTo(1);
  });

  it("breaks reversing ribbon strips and restarts stretch UVs", () => {
    const stroke = createUnevenThreePointStroke();
    stroke.controlPoints[2].position = [0, 0, 0];

    const geometry = generateBrushGeometry(stroke, "ribbon", {
      generatorClass: "QuadStripBrushStretchUV",
    });

    expect(getGeneratedIndexCount(geometry)).toBe(6);
    expect(Array.from(geometry.indices)).toEqual([0, 2, 1, 1, 2, 3]);
    expect(geometry.uvs[0]).toBeCloseTo(0);
    expect(geometry.uvs[4]).toBeCloseTo(1);
    expect(geometry.uvs[8]).toBeCloseTo(0);
  });

  it("omits sub-millimeter ribbon connections", () => {
    const stroke = createUnevenThreePointStroke();
    stroke.controlPoints[1].position = [0.0001, 0, 0];

    const geometry = generateBrushGeometry(stroke, "ribbon");

    expect(getGeneratedIndexCount(geometry)).toBe(6);
    expect(Array.from(geometry.indices)).toEqual([2, 4, 3, 3, 4, 5]);
  });

  it("selects a deterministic texture atlas row from the stroke seed", () => {
    const options = {
      generatorClass: "QuadStripBrushStretchUV",
      geometryParams: { textureAtlasV: 4 },
    } as const;
    const first = generateBrushGeometry(
      createUnevenThreePointStroke(),
      "ribbon",
      options,
    );
    const repeated = generateBrushGeometry(
      createUnevenThreePointStroke(),
      "ribbon",
      options,
    );

    expect(first.uvs).toEqual(repeated.uvs);
    expect(first.uvs[1]).toBeCloseTo(0.75);
    expect(first.uvs[3]).toBeCloseTo(0.5);
  });

  it("emits reversed hue-shifted backface geometry", () => {
    const stroke = createTwoPointStroke({
      guid: "hue-shifted-backface",
      brushSize: 0.2,
      pressure: 1,
    });
    stroke.color = [1, 0, 0, 0.75];

    const geometry = generateBrushGeometry(stroke, "ribbon", {
      geometryParams: {
        renderBackfaces: true,
        backfaceHueShift: 120,
      },
    });

    expect(getGeneratedVertexCount(geometry)).toBe(8);
    expect(getGeneratedIndexCount(geometry)).toBe(12);
    expect(Array.from(geometry.indices.slice(6))).toEqual([4, 5, 6, 5, 7, 6]);
    expect(geometry.normals[12]).toBeCloseTo(-geometry.normals[0]);
    expect(geometry.normals[13]).toBeCloseTo(-geometry.normals[1]);
    expect(geometry.normals[14]).toBeCloseTo(-geometry.normals[2]);
    expect(geometry.tangents[19]).toBeCloseTo(-geometry.tangents[3]);
    expect(geometry.colors[16]).toBeCloseTo(0);
    expect(geometry.colors[17]).toBeCloseTo(1);
    expect(geometry.colors[18]).toBeCloseTo(0);
    expect(geometry.colors[19]).toBeCloseTo(0.75);
  });

  it("emits longitudinal ribbon tangents with handedness", () => {
    const geometry = generateBrushGeometry(
      createTwoPointStroke({
        guid: "straight-ribbon-tangents",
        brushSize: 0.2,
        pressure: 1,
      }),
      "ribbon",
    );

    for (let vertex = 0; vertex < 4; vertex += 1) {
      const offset = vertex * 4;
      expect(geometry.tangents[offset]).toBeCloseTo(1);
      expect(geometry.tangents[offset + 1]).toBeCloseTo(0);
      expect(geometry.tangents[offset + 2]).toBeCloseTo(0);
      expect(geometry.tangents[offset + 3]).toBe(1);
    }
  });

  it("resets unitized ribbon UVs for every segment", () => {
    const geometry = generateBrushGeometry(
      createUnevenThreePointStroke(),
      "ribbon",
      { generatorClass: "QuadStripUnitizedUVBrush" },
    );

    expect(getGeneratedVertexCount(geometry)).toBe(8);
    expect(getGeneratedIndexCount(geometry)).toBe(12);
    expect(Array.from(geometry.uvs.slice(0, 8))).toEqual([
      0, 1, 0, 0, 1, 1, 1, 0,
    ]);
    expect(Array.from(geometry.uvs.slice(8, 16))).toEqual([
      0, 1, 0, 0, 1, 1, 1, 0,
    ]);
  });

  it("uses full width for brushes with fixed pressure size", () => {
    const stroke = createTwoPointStroke({
      guid: "fixed-pressure-flat",
      brushSize: 0.2,
      pressure: 0,
    });

    const geometry = generateBrushGeometry(stroke, "ribbon", {
      pressureSizeRange: [1, 1],
    });

    expect(geometry.bounds.min[1]).toBeCloseTo(-0.1);
    expect(geometry.bounds.max[1]).toBeCloseTo(0.1);
  });

  it("generates stable tube geometry", () => {
    const stroke = withBrushGuid(fixtureStroke, "8e58ceea-7830-49b4-aba9-6215104ab52a");
    const family = findBrushByGuid(inventory, stroke.brushGuid)?.geometryFamily;

    const geometry = generateBrushGeometry(stroke, family ?? "unsupported");

    expect(geometry.family).toBe("tube");
    // 3 control points x 9 ring verts plus 8 duplicated tip verts per cap.
    expect(getGeneratedVertexCount(geometry)).toBe(43);
    // 2 segments x 8 sides x 6 + 2 caps x 8 fan triangles x 3.
    expect(getGeneratedIndexCount(geometry)).toBe(144);
  });

  it("uses source-style tube cap tips instead of center vertices", () => {
    const geometry = generateBrushGeometry(
      createUnevenThreePointStroke(),
      "tube",
      { geometryParams: { tubeCapAspect: 0.8 } },
    );
    const firstCapPosition = 3 * 9 * 3;
    const secondCapPosition = (3 * 9 + 8) * 3;

    expect(geometry.positions[firstCapPosition]).toBeCloseTo(-0.4);
    expect(geometry.positions[secondCapPosition]).toBeCloseTo(3.4);
  });

  it("duplicates hard tube edges and omits disabled caps", () => {
    const geometry = generateBrushGeometry(
      createUnevenThreePointStroke(),
      "tube",
      {
        geometryParams: {
          tubeSideCount: 5,
          tubeHardEdges: true,
          tubeEndCaps: false,
          tubeUvStyle: "stretch",
        },
      },
    );

    expect(getGeneratedVertexCount(geometry)).toBe(30);
    expect(getGeneratedIndexCount(geometry)).toBe(60);
    expect(Array.from(geometry.positions.slice(0, 3))).toEqual(
      Array.from(geometry.positions.slice(3, 6)),
    );
    expect(Array.from(geometry.normals.slice(0, 3))).not.toEqual(
      Array.from(geometry.normals.slice(3, 6)),
    );
    expect(geometry.uvs[0]).toBeCloseTo(0);
    expect(geometry.uvs[40]).toBeCloseTo(1);
  });

  it("splits and caps tubes at Open Brush frame-angle breaks", () => {
    const stroke = createSharpTubeStroke();
    const geometry = generateBrushGeometry(stroke, "tube", {
      geometryParams: {
        tubeBreakAngleMultiplier: 0,
        tubeEndCaps: true,
      },
    });

    // Four 9-vertex rings plus two 8-vertex caps for each section.
    expect(getGeneratedVertexCount(geometry)).toBe(68);
    // No triangle may bridge the rings on opposite sides of the break.
    for (let index = 0; index < geometry.indices.length; index += 3) {
      const triangle = geometry.indices.slice(index, index + 3);
      const touchesBefore = triangle.some(
        (vertex) => vertex >= 9 && vertex < 18,
      );
      const touchesAfter = triangle.some(
        (vertex) => vertex >= 18 && vertex < 27,
      );
      expect(touchesBefore && touchesAfter).toBe(false);
    }
  });

  it("applies the TubeBrush sine silhouette over physical stroke progress", () => {
    const geometry = generateBrushGeometry(
      createUnevenThreePointStroke(),
      "tube",
      {
        geometryParams: {
          tubeEndCaps: false,
          tubeShapeModifier: 2,
        },
      },
    );

    expect(geometry.positions[1]).toBeCloseTo(0);
    expect(geometry.positions[28]).toBeCloseTo(-0.5 * Math.sin(Math.PI / 3));
    expect(geometry.positions[55]).toBeCloseTo(0);
  });

  it("applies taper and petal TubeBrush modifiers", () => {
    const stroke = createUnevenThreePointStroke();
    const tapered = generateBrushGeometry(stroke, "tube", {
      geometryParams: {
        tubeEndCaps: false,
        tubeShapeModifier: 4,
        tubeTaperScalar: 1.1,
      },
    });
    const petal = generateBrushGeometry(stroke, "tube", {
      geometryParams: {
        tubeEndCaps: false,
        tubeShapeModifier: 5,
        tubePetalDisplacementAmount: 1.5,
        tubePetalDisplacementExponent: 3,
      },
    });

    expect(tapered.positions[1]).toBeCloseTo(-0.55);
    expect(tapered.positions[55]).toBeCloseTo(0);
    expect(petal.positions[55]).toBeCloseTo(-1.5);
  });

  it("tiles tube UVs by circumference within a deterministic atlas row", () => {
    const geometry = generateBrushGeometry(
      createUnevenThreePointStroke(),
      "tube",
      { geometryParams: { tileRate: 2, textureAtlasV: 4 } },
    );

    const firstRingU = geometry.uvs[0];
    expect(geometry.uvs[18] - firstRingU).toBeCloseTo(2 / Math.PI);
    expect(geometry.uvs[36] - firstRingU).toBeCloseTo(6 / Math.PI);
    expect(geometry.uvs[1]).toBeCloseTo(1);
    expect(geometry.uvs[17]).toBeCloseTo(0.75);
    expect(geometry.tangents[3]).toBe(1);
  });

  it("packs tube radius into UV0.z when required by the descriptor", () => {
    const geometry = generateBrushGeometry(
      createUnevenThreePointStroke(),
      "tube",
      { geometryParams: { tubeStoreRadiusInTexcoord0Z: true } },
    );

    expect(geometry.uv0Size).toBe(3);
    expect(geometry.packedUvs).toHaveLength(getGeneratedVertexCount(geometry) * 3);
    expect(geometry.packedUvs?.[2]).toBeCloseTo(0.5);
    // TubeBrush packs zero at the duplicated cap-tip vertices.
    expect(geometry.packedUvs?.[3 * 27 + 2]).toBe(0);
  });

  it("generates emissive geometry with ribbon topology", () => {
    const stroke = withBrushGuid(fixtureStroke, "2241cd32-8ba2-48a5-9ee7-2caef7e9ed62");
    const family = findBrushByGuid(inventory, stroke.brushGuid)?.geometryFamily;

    const geometry = generateBrushGeometry(stroke, family ?? "unsupported");

    expect(geometry.family).toBe("emissive");
    expect(getGeneratedVertexCount(geometry)).toBe(6);
    expect(getGeneratedIndexCount(geometry)).toBe(12);
  });

  it("generates particle fallback quads per control point", () => {
    const stroke = withBrushGuid(fixtureStroke, "70d79cca-b159-4f35-990c-f02193947fe8");
    const family = findBrushByGuid(inventory, stroke.brushGuid)?.geometryFamily;

    const geometry = generateBrushGeometry(stroke, family ?? "unsupported");

    expect(geometry.family).toBe("particle");
    expect(getGeneratedVertexCount(geometry)).toBe(12);
    expect(getGeneratedIndexCount(geometry)).toBe(18);
  });

  it("spawns Genius particles at source distance intervals", () => {
    const stroke = createTwoPointStroke({
      guid: "genius-distance-particles",
      brushSize: 0.2,
      pressure: 1,
    });
    stroke.controlPoints[1].position = [0.1, 0, 0];
    const options = {
      generatorClass: "GeniusParticlesBrush",
      pressureSizeRange: [0.2, 1] as const,
      geometryParams: {
        brushSizeRange: [1, 2] as [number, number],
        particleRate: 0.1,
        particleSpeed: 0,
        particleInitialRotationRange: 180,
        particleSizeVariance: 0,
        textureAtlasV: 4,
      },
    };

    const geometry = generateBrushGeometry(stroke, "particle", options);
    const repeated = generateBrushGeometry(stroke, "particle", options);

    expect(getGeneratedVertexCount(geometry)).toBe(20);
    expect(getGeneratedIndexCount(geometry)).toBe(30);
    expect(geometry.positions).toEqual(repeated.positions);
    expect(geometry.uv0Size).toBe(4);
    expect(geometry.packedUvs).toHaveLength(80);
    expect(geometry.uv1).toHaveLength(80);
    expect(geometry.packedUvs).toEqual(repeated.packedUvs);
    expect(geometry.uv1).toEqual(repeated.uv1);
    for (let particle = 0; particle < 5; particle += 1) {
      let centerX = 0;
      for (let corner = 0; corner < 4; corner += 1) {
        centerX += geometry.positions[(particle * 4 + corner) * 3];
      }
      expect(centerX / 4).toBeCloseTo(particle * 0.025);
      const vertexOffset = particle * 4;
      for (let corner = 0; corner < 4; corner += 1) {
        expect(geometry.normals[(vertexOffset + corner) * 3]).toBeCloseTo(
          particle * 0.025,
        );
        expect(geometry.uv1?.[(vertexOffset + corner) * 4]).toBeCloseTo(
          particle * 0.025,
        );
        expect(geometry.uv1?.[(vertexOffset + corner) * 4 + 3]).toBe(
          vertexOffset + corner,
        );
      }
    }
  });

  it("spawns Spray quads at pressure-sized source intervals", () => {
    const stroke = createTwoPointStroke({
      guid: "spray-distance-particles",
      brushSize: 0.2,
      pressure: 1,
    });
    stroke.controlPoints[1].position = [0.5, 0, 0];
    const options = {
      generatorClass: "SprayBrush",
      pressureSizeRange: [0.2, 1] as const,
      pressureOpacityRange: [1, 1] as const,
      geometryParams: {
        particleRate: 1,
        particleSizeVariance: 0,
        particlePositionVariance: 0,
        particleRotationVariance: 0,
        particleSizeRatio: [1, 1] as [number, number],
        textureAtlasV: 4,
        renderBackfaces: true,
      },
    };

    const geometry = generateBrushGeometry(stroke, "particle", options);
    const repeated = generateBrushGeometry(stroke, "particle", options);

    expect(getGeneratedVertexCount(geometry)).toBe(16);
    expect(getGeneratedIndexCount(geometry)).toBe(24);
    expect(geometry.positions).toEqual(repeated.positions);
    expect(geometry.uvs).toEqual(repeated.uvs);
    for (let quad = 0; quad < 2; quad += 1) {
      let centerX = 0;
      for (let corner = 0; corner < 4; corner += 1) {
        centerX += geometry.positions[(quad * 4 + corner) * 3];
      }
      expect(centerX / 4).toBeCloseTo(quad * 0.2);
    }
    for (let vertex = 0; vertex < 8; vertex += 1) {
      expect(geometry.positions.slice(vertex * 3, vertex * 3 + 3)).toEqual(
        geometry.positions.slice((vertex + 8) * 3, (vertex + 8) * 3 + 3),
      );
      expect(geometry.normals[(vertex + 8) * 3]).toBeCloseTo(
        -geometry.normals[vertex * 3],
      );
    }
  });

  it("uses the Genius single-particle pressure floor", () => {
    const stroke = createTwoPointStroke({
      guid: "genius-single-particle",
      brushSize: 0.2,
      pressure: 0,
    });
    stroke.controlPoints[1].position = [0, 0, 0];

    const geometry = generateBrushGeometry(stroke, "particle", {
      generatorClass: "GeniusParticlesBrush",
      pressureSizeRange: [0.2, 1],
      geometryParams: {
        brushSizeRange: [1, 2],
        particleRate: 0.1,
        particleSpeed: 0,
      },
    });

    const edgeLength = Math.hypot(
      geometry.positions[3] - geometry.positions[0],
      geometry.positions[4] - geometry.positions[1],
      geometry.positions[5] - geometry.positions[2],
    );
    expect(getGeneratedVertexCount(geometry)).toBe(4);
    expect(edgeLength).toBeCloseTo(0.168);
  });

  it("creates fallback geometry and warning for unsupported brushes", () => {
    const stroke = withBrushGuid(fixtureStroke, "00000000-0000-0000-0000-000000000000");
    const geometry = generateBrushGeometry(stroke, "unsupported");

    expect(geometry.family).toBe("unsupported");
    expect(geometry.warning).toContain("fallback ribbon");
    expect(getGeneratedVertexCount(geometry)).toBe(6);
  });

  it("keeps ribbon frames continuous on a coil (no flips or snaps)", () => {
    const controlPoints = [];
    const turns = 2;
    const count = 60;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / (count - 1)) * turns * Math.PI * 2;
      controlPoints.push({
        position: [
          Math.cos(angle) * 0.2,
          1 + (i / (count - 1)) * 0.3,
          -0.5 + Math.sin(angle) * 0.2,
        ] as [number, number, number],
        orientation: [0, 0, 0, 1] as [number, number, number, number],
        pressure: 1,
        timestampMs: i * 16,
      });
    }
    const stroke: StrokeData = {
      guid: "coil",
      brushGuid: "2241cd32-8ba2-48a5-9ee7-2caef7e9ed62",
      brushSize: 0.02,
      brushScale: 1,
      color: [1, 1, 1, 1],
      layerIndex: 0,
      flags: 0,
      seed: 1,
      groupId: 1,
      controlPoints,
    };

    const geometry = generateBrushGeometry(stroke, "ribbon");
    // Width direction at each point = right vertex minus left vertex.
    let previous: [number, number, number] | undefined;
    for (let i = 0; i < count; i += 1) {
      const left = i * 2 * 3;
      const right = (i * 2 + 1) * 3;
      const dir: [number, number, number] = [
        geometry.positions[right] - geometry.positions[left],
        geometry.positions[right + 1] - geometry.positions[left + 1],
        geometry.positions[right + 2] - geometry.positions[left + 2],
      ];
      const length = Math.hypot(dir[0], dir[1], dir[2]);
      expect(length).toBeGreaterThan(0.02 * 0.5); // never collapses
      if (previous) {
        const dot =
          (dir[0] * previous[0] + dir[1] * previous[1] + dir[2] * previous[2]) /
          (length * Math.hypot(previous[0], previous[1], previous[2]));
        // Adjacent frames stay continuous — the old XZ-planar offset snapped
        // when the coil tangent went vertical.
        expect(dot).toBeGreaterThan(0.7);
      }
      previous = dir;
    }
  });

  it("transports tube ring frames without spinning on a coil", () => {
    const controlPoints = [];
    const count = 40;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / (count - 1)) * Math.PI * 2;
      controlPoints.push({
        position: [
          Math.cos(angle) * 0.2,
          1 + (i / (count - 1)) * 0.2,
          -0.5 + Math.sin(angle) * 0.2,
        ] as [number, number, number],
        orientation: [0, 0, 0, 1] as [number, number, number, number],
        pressure: 1,
        timestampMs: i * 16,
      });
    }
    const stroke: StrokeData = {
      guid: "tube-coil",
      brushGuid: "8e58ceea-7830-49b4-aba9-6215104ab52a",
      brushSize: 0.02,
      brushScale: 1,
      color: [1, 1, 1, 1],
      layerIndex: 0,
      flags: 0,
      seed: 1,
      groupId: 1,
      controlPoints,
    };

    const geometry = generateBrushGeometry(stroke, "tube");
    const ringVerts = 9;
    let previous: [number, number, number] | undefined;
    for (let i = 0; i < count; i += 1) {
      const center = stroke.controlPoints[i].position;
      const v0 = i * ringVerts * 3;
      const radial: [number, number, number] = [
        geometry.positions[v0] - center[0],
        geometry.positions[v0 + 1] - center[1],
        geometry.positions[v0 + 2] - center[2],
      ];
      const length = Math.hypot(radial[0], radial[1], radial[2]);
      expect(length).toBeCloseTo(0.01, 3); // radius = brushSize / 2
      if (previous) {
        const dot =
          (radial[0] * previous[0] +
            radial[1] * previous[1] +
            radial[2] * previous[2]) /
          (length * Math.hypot(previous[0], previous[1], previous[2]));
        expect(dot).toBeGreaterThan(0.9); // parallel transport: no ring spin
      }
      previous = radial;
    }
  });

});

function withBrushGuid(stroke: StrokeData, brushGuid: string): StrokeData {
  return {
    ...stroke,
    brushGuid,
    guid: `${stroke.guid}-${brushGuid.slice(0, 8)}`,
  };
}

function createTwoPointStroke({
  guid,
  brushSize,
  pressure,
}: {
  guid: string;
  brushSize: number;
  pressure: number;
}): StrokeData {
  return {
    guid,
    brushGuid: "2241cd32-8ba2-48a5-9ee7-2caef7e9ed62",
    brushSize,
    brushScale: 1,
    color: [1, 1, 1, 1],
    layerIndex: 0,
    flags: 0,
    seed: 1,
    groupId: 1,
    controlPoints: [
      {
        position: [0, 0, 0],
        orientation: [0, 0, 0, 1],
        pressure,
        timestampMs: 0,
      },
      {
        position: [1, 0, 0],
        orientation: [0, 0, 0, 1],
        pressure,
        timestampMs: 16,
      },
    ],
  };
}

function createUnevenThreePointStroke(): StrokeData {
  const stroke = createTwoPointStroke({
    guid: "uneven-three-point",
    brushSize: 1,
    pressure: 1,
  });
  stroke.controlPoints.push({
    position: [3, 0, 0],
    orientation: [0, 0, 0, 1],
    pressure: 1,
    timestampMs: 32,
  });
  return stroke;
}

function createSharpTubeStroke(): StrokeData {
  const stroke = createTwoPointStroke({
    guid: "sharp-tube",
    brushSize: 0.2,
    pressure: 1,
  });
  stroke.controlPoints.push(
    {
      position: [1, 1, 0],
      orientation: [0, 0, 0, 1],
      pressure: 1,
      timestampMs: 32,
    },
    {
      position: [2, 1, 0],
      orientation: [0, 0, 0, 1],
      pressure: 1,
      timestampMs: 48,
    },
  );
  return stroke;
}
