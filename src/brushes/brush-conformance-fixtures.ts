import {
  StrokeFlags,
  createEmptyStrokeData,
  type ControlPoint,
  type Quat,
  type StrokeData,
  type Vec3,
} from "../types.js";

export type BrushConformanceFixtureName =
  | "line"
  | "arc"
  | "helix"
  | "sharp-corner"
  | "reversal"
  | "pressure-ramp"
  | "twist"
  | "dot"
  | "long-stroke"
  | "segment-break";

export interface BrushConformanceFixture {
  name: BrushConformanceFixtureName;
  strokes: StrokeData[];
}

const FIXTURE_BRUSH_GUID = "429ed64a-4e97-4466-84d3-145a861ef684";
const POINT_INTERVAL_MS = 10;

/** Deterministic inputs shared by mesh dumps and fixed-camera render tests. */
export function createBrushConformanceFixtures(): BrushConformanceFixture[] {
  return [
    fixture("line", [makeStroke("line", sample(17, (t) => [t * 2 - 1, 0, 0]))]),
    fixture("arc", [
      makeStroke("arc", sample(25, (t) => [Math.cos(Math.PI * t), Math.sin(Math.PI * t), 0])),
    ]),
    fixture("helix", [
      makeStroke(
        "helix",
        sample(49, (t) => [Math.cos(Math.PI * 4 * t), t * 2 - 1, Math.sin(Math.PI * 4 * t)]),
      ),
    ]),
    fixture("sharp-corner", [
      makeStroke("sharp-corner", [
        point([-1, 0, 0], 0),
        point([-0.5, 0, 0], 1),
        point([0, 0, 0], 2),
        point([0, 0.5, 0], 3),
        point([0, 1, 0], 4),
      ]),
    ]),
    fixture("reversal", [
      makeStroke("reversal", [
        point([-1, 0, 0], 0),
        point([-0.5, 0, 0], 1),
        point([0, 0, 0], 2),
        point([-0.5, 0, 0], 3),
        point([-1, 0, 0], 4),
      ]),
    ]),
    fixture("pressure-ramp", [
      makeStroke(
        "pressure-ramp",
        sample(17, (t) => [t * 2 - 1, 0, 0], (t) => t),
      ),
    ]),
    fixture("twist", [
      makeStroke(
        "twist",
        sample(17, (t) => [t * 2 - 1, 0, 0], undefined, (t) =>
          axisAngle([1, 0, 0], Math.PI * 2 * t),
        ),
      ),
    ]),
    fixture("dot", [makeStroke("dot", [point([0, 0, 0], 0)])]),
    fixture("long-stroke", [
      makeStroke(
        "long-stroke",
        sample(257, (t) => [t * 20 - 10, Math.sin(t * Math.PI * 8) * 0.2, 0]),
      ),
    ]),
    fixture("segment-break", [
      makeStroke("segment-break-a", sample(9, (t) => [t - 1, 0, 0]), {
        groupId: 7,
      }),
      makeStroke("segment-break-b", sample(9, (t) => [t, 0.5, 0]), {
        groupId: 7,
        flags: StrokeFlags.IsGroupContinue,
      }),
    ]),
  ];
}

function fixture(
  name: BrushConformanceFixtureName,
  strokes: StrokeData[],
): BrushConformanceFixture {
  return { name, strokes };
}

function makeStroke(
  id: string,
  controlPoints: ControlPoint[],
  overrides: Partial<StrokeData> = {},
): StrokeData {
  return createEmptyStrokeData({
    brushGuid: FIXTURE_BRUSH_GUID,
    brushSize: 0.1,
    brushScale: 1,
    color: [0.25, 0.5, 0.75, 1],
    controlPoints,
    seed: 0x5eed,
    guid: `conformance-${id}`,
    ...overrides,
  });
}

function sample(
  count: number,
  positionAt: (t: number) => Vec3,
  pressureAt: (t: number) => number = () => 1,
  orientationAt: (t: number) => Quat = () => [0, 0, 0, 1],
): ControlPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 0 : index / (count - 1);
    return point(positionAt(t), index, pressureAt(t), orientationAt(t));
  });
}

function point(
  position: Vec3,
  index: number,
  pressure = 1,
  orientation: Quat = [0, 0, 0, 1],
): ControlPoint {
  return {
    position,
    orientation,
    pressure,
    timestampMs: index * POINT_INTERVAL_MS,
  };
}

function axisAngle(axis: Vec3, angle: number): Quat {
  const halfAngle = angle * 0.5;
  const scale = Math.sin(halfAngle);
  return [axis[0] * scale, axis[1] * scale, axis[2] * scale, Math.cos(halfAngle)];
}
