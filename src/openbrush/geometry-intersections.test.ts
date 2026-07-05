import { describe, expect, it } from "vitest";

import { indexedTriangleGeometryIntersectsSphere } from "./geometry-intersections.js";

const unitTriangle = {
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  indices: new Uint32Array([0, 1, 2]),
};

describe("geometry intersections", () => {
  it("detects sphere intersections with indexed triangle surfaces", () => {
    expect(
      indexedTriangleGeometryIntersectsSphere(unitTriangle, [0.25, 0.25, 0.05], 0.06),
    ).toBe(true);
    expect(
      indexedTriangleGeometryIntersectsSphere(unitTriangle, [0.25, 0.25, 0.2], 0.06),
    ).toBe(false);
  });

  it("honors draw counts", () => {
    const twoTriangles = {
      positions: new Float32Array([
        0, 0, 0, 1, 0, 0, 0, 1, 0,
        10, 0, 0, 11, 0, 0, 10, 1, 0,
      ]),
      indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
      drawCount: 3,
    };

    expect(
      indexedTriangleGeometryIntersectsSphere(twoTriangles, [10.25, 0.25, 0], 0.1),
    ).toBe(false);
  });

  it("honors draw starts", () => {
    const secondTriangleOnly = {
      positions: new Float32Array([
        0, 0, 0, 1, 0, 0, 0, 1, 0,
        10, 0, 0, 11, 0, 0, 10, 1, 0,
      ]),
      indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
      drawStart: 3,
      drawCount: 3,
    };

    expect(
      indexedTriangleGeometryIntersectsSphere(secondTriangleOnly, [0.25, 0.25, 0], 0.1),
    ).toBe(false);
    expect(
      indexedTriangleGeometryIntersectsSphere(
        secondTriangleOnly,
        [10.25, 0.25, 0],
        0.1,
      ),
    ).toBe(true);
  });

  it("applies world transform matrix elements before testing", () => {
    const translated = {
      ...unitTriangle,
      matrixElements: [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        2, 3, 4, 1,
      ],
    };

    expect(
      indexedTriangleGeometryIntersectsSphere(translated, [2.25, 3.25, 4.05], 0.06),
    ).toBe(true);
    expect(
      indexedTriangleGeometryIntersectsSphere(unitTriangle, [2.25, 3.25, 4.05], 0.06),
    ).toBe(false);
  });
});
