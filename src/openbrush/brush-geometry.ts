import type {
  BrushGeometryFamily,
  BrushPressureOpacityRange,
  BrushPressureSizeRange,
} from "./brush-inventory.js";
import type { Rgba, StrokeData, Vec3 } from "./types.js";

export interface BrushGeometryBounds {
  min: Vec3;
  max: Vec3;
}

export interface GeneratedBrushGeometry {
  family: BrushGeometryFamily;
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  bounds: BrushGeometryBounds;
  warning?: string;
}

export interface BrushGeometryOptions {
  pressureSizeRange?: BrushPressureSizeRange;
  pressureOpacityRange?: BrushPressureOpacityRange;
}

const DEFAULT_PRESSURE_SIZE_MIN = 0.1;

export function generateBrushGeometry(
  stroke: StrokeData,
  family: BrushGeometryFamily,
  options: BrushGeometryOptions = {},
): GeneratedBrushGeometry {
  switch (family) {
    case "ribbon":
      return generateRibbonGeometry(stroke, "ribbon", options);
    case "emissive":
      return generateRibbonGeometry(stroke, "emissive", options);
    case "tube":
      return generateTubeGeometry(stroke, options);
    case "particle":
      return generateParticleGeometry(stroke, options);
    case "unsupported": {
      const fallback = generateRibbonGeometry(stroke, "unsupported", options);
      fallback.warning = "Unsupported brush geometry family; generated fallback ribbon.";
      return fallback;
    }
  }
}

export function getGeneratedVertexCount(geometry: GeneratedBrushGeometry): number {
  return geometry.positions.length / 3;
}

export function getGeneratedIndexCount(geometry: GeneratedBrushGeometry): number {
  return geometry.indices.length;
}

function generateRibbonGeometry(
  stroke: StrokeData,
  family: BrushGeometryFamily,
  options: BrushGeometryOptions,
): GeneratedBrushGeometry {
  const pointCount = stroke.controlPoints.length;
  const vertexCount = pointCount * 2;
  const segmentCount = Math.max(0, pointCount - 1);
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 4);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(segmentCount * 6);
  const bounds = createEmptyBounds();
  const pressureSizeMin = normalizePressureSizeMin(options.pressureSizeRange?.[0]);
  const pressureOpacityMin = normalizePressureOpacityMin(
    options.pressureOpacityRange,
  );
  const pressureOpacityMax = normalizePressureOpacityMax(
    options.pressureOpacityRange,
  );

  for (let index = 0; index < pointCount; index += 1) {
    const point = stroke.controlPoints[index];
    const width =
      stroke.brushSize *
      getPressureSizeMultiplier(point.pressure, pressureSizeMin) *
      0.5;
    const offset = getRibbonOffset(stroke, index, width);
    const leftVertex = index * 2;
    const rightVertex = leftVertex + 1;

    writePosition(positions, leftVertex, [
      point.position[0] - offset[0],
      point.position[1] - offset[1],
      point.position[2] - offset[2],
    ]);
    writePosition(positions, rightVertex, [
      point.position[0] + offset[0],
      point.position[1] + offset[1],
      point.position[2] + offset[2],
    ]);
    writeNormal(normals, leftVertex, [0, 1, 0]);
    writeNormal(normals, rightVertex, [0, 1, 0]);
    const opacity = getPressureOpacityMultiplier(
      point.pressure,
      pressureOpacityMin,
      pressureOpacityMax,
    );
    writeColor(colors, leftVertex, stroke.color, opacity);
    writeColor(colors, rightVertex, stroke.color, opacity);
    writeUv(uvs, leftVertex, [0, pointCount <= 1 ? 0 : index / (pointCount - 1)]);
    writeUv(uvs, rightVertex, [1, pointCount <= 1 ? 0 : index / (pointCount - 1)]);
    includeBounds(bounds, positions, leftVertex);
    includeBounds(bounds, positions, rightVertex);
  }

  for (let segment = 0; segment < segmentCount; segment += 1) {
    const vertex = segment * 2;
    const offset = segment * 6;
    indices[offset] = vertex;
    indices[offset + 1] = vertex + 2;
    indices[offset + 2] = vertex + 1;
    indices[offset + 3] = vertex + 1;
    indices[offset + 4] = vertex + 2;
    indices[offset + 5] = vertex + 3;
  }

  return { family, positions, normals, colors, uvs, indices, bounds };
}

function generateTubeGeometry(
  stroke: StrokeData,
  options: BrushGeometryOptions,
): GeneratedBrushGeometry {
  const pointCount = stroke.controlPoints.length;
  const ringSize = 4;
  const vertexCount = pointCount * ringSize;
  const segmentCount = Math.max(0, pointCount - 1);
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 4);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(segmentCount * ringSize * 6);
  const bounds = createEmptyBounds();
  const pressureSizeMin = normalizePressureSizeMin(options.pressureSizeRange?.[0]);
  const pressureOpacityMin = normalizePressureOpacityMin(
    options.pressureOpacityRange,
  );
  const pressureOpacityMax = normalizePressureOpacityMax(
    options.pressureOpacityRange,
  );

  for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
    const point = stroke.controlPoints[pointIndex];
    const radius =
      stroke.brushSize *
      getPressureSizeMultiplier(point.pressure, pressureSizeMin) *
      0.5;
    const opacity = getPressureOpacityMultiplier(
      point.pressure,
      pressureOpacityMin,
      pressureOpacityMax,
    );
    for (let ringIndex = 0; ringIndex < ringSize; ringIndex += 1) {
      const vertex = pointIndex * ringSize + ringIndex;
      const normal = getTubeNormal(ringIndex);
      writePosition(positions, vertex, [
        point.position[0] + normal[0] * radius,
        point.position[1] + normal[1] * radius,
        point.position[2] + normal[2] * radius,
      ]);
      writeNormal(normals, vertex, normal);
      writeColor(colors, vertex, stroke.color, opacity);
      writeUv(uvs, vertex, [
        ringIndex / ringSize,
        pointCount <= 1 ? 0 : pointIndex / (pointCount - 1),
      ]);
      includeBounds(bounds, positions, vertex);
    }
  }

  for (let segment = 0; segment < segmentCount; segment += 1) {
    const firstRing = segment * ringSize;
    const secondRing = firstRing + ringSize;
    for (let side = 0; side < ringSize; side += 1) {
      const nextSide = (side + 1) % ringSize;
      const offset = (segment * ringSize + side) * 6;
      indices[offset] = firstRing + side;
      indices[offset + 1] = secondRing + side;
      indices[offset + 2] = firstRing + nextSide;
      indices[offset + 3] = firstRing + nextSide;
      indices[offset + 4] = secondRing + side;
      indices[offset + 5] = secondRing + nextSide;
    }
  }

  return { family: "tube", positions, normals, colors, uvs, indices, bounds };
}

function generateParticleGeometry(
  stroke: StrokeData,
  options: BrushGeometryOptions,
): GeneratedBrushGeometry {
  const pointCount = stroke.controlPoints.length;
  const vertexCount = pointCount * 4;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 4);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(pointCount * 6);
  const bounds = createEmptyBounds();
  const pressureSizeMin = normalizePressureSizeMin(options.pressureSizeRange?.[0]);
  const pressureOpacityMin = normalizePressureOpacityMin(
    options.pressureOpacityRange,
  );
  const pressureOpacityMax = normalizePressureOpacityMax(
    options.pressureOpacityRange,
  );

  for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
    const point = stroke.controlPoints[pointIndex];
    const radius =
      stroke.brushSize *
      getPressureSizeMultiplier(point.pressure, pressureSizeMin) *
      0.5;
    const vertex = pointIndex * 4;
    const opacity = getPressureOpacityMultiplier(
      point.pressure,
      pressureOpacityMin,
      pressureOpacityMax,
    );
    writeParticleVertex(
      positions,
      normals,
      colors,
      uvs,
      bounds,
      vertex,
      point.position,
      stroke.color,
      opacity,
      -radius,
      -radius,
      0,
      0,
    );
    writeParticleVertex(
      positions,
      normals,
      colors,
      uvs,
      bounds,
      vertex + 1,
      point.position,
      stroke.color,
      opacity,
      radius,
      -radius,
      1,
      0,
    );
    writeParticleVertex(
      positions,
      normals,
      colors,
      uvs,
      bounds,
      vertex + 2,
      point.position,
      stroke.color,
      opacity,
      radius,
      radius,
      1,
      1,
    );
    writeParticleVertex(
      positions,
      normals,
      colors,
      uvs,
      bounds,
      vertex + 3,
      point.position,
      stroke.color,
      opacity,
      -radius,
      radius,
      0,
      1,
    );

    const indexOffset = pointIndex * 6;
    indices[indexOffset] = vertex;
    indices[indexOffset + 1] = vertex + 1;
    indices[indexOffset + 2] = vertex + 2;
    indices[indexOffset + 3] = vertex;
    indices[indexOffset + 4] = vertex + 2;
    indices[indexOffset + 5] = vertex + 3;
  }

  return { family: "particle", positions, normals, colors, uvs, indices, bounds };
}

function getPressureSizeMultiplier(
  pressure: number,
  pressureSizeMin: number,
): number {
  const clampedPressure = clamp01(pressure);
  return pressureSizeMin + (1 - pressureSizeMin) * clampedPressure;
}

function getPressureOpacityMultiplier(
  pressure: number,
  pressureOpacityMin: number,
  pressureOpacityMax: number,
): number {
  return (
    pressureOpacityMin +
    (pressureOpacityMax - pressureOpacityMin) * clamp01(pressure)
  );
}

function normalizePressureSizeMin(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_PRESSURE_SIZE_MIN;
  }
  return clamp01(value);
}

function normalizePressureOpacityMin(
  range: BrushPressureOpacityRange | undefined,
): number {
  return range && Number.isFinite(range[0]) ? clamp01(range[0]) : 1;
}

function normalizePressureOpacityMax(
  range: BrushPressureOpacityRange | undefined,
): number {
  return range && Number.isFinite(range[1]) ? clamp01(range[1]) : 1;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function writeParticleVertex(
  positions: Float32Array,
  normals: Float32Array,
  colors: Float32Array,
  uvs: Float32Array,
  bounds: BrushGeometryBounds,
  vertex: number,
  center: Vec3,
  color: Rgba,
  opacityMultiplier: number,
  offsetX: number,
  offsetY: number,
  u: number,
  v: number,
): void {
  writePosition(positions, vertex, [
    center[0] + offsetX,
    center[1] + offsetY,
    center[2],
  ]);
  writeNormal(normals, vertex, [0, 0, 1]);
  writeColor(colors, vertex, color, opacityMultiplier);
  writeUv(uvs, vertex, [u, v]);
  includeBounds(bounds, positions, vertex);
}

function getRibbonOffset(stroke: StrokeData, index: number, width: number): Vec3 {
  const point = stroke.controlPoints[index].position;
  const previous = stroke.controlPoints[Math.max(0, index - 1)].position;
  const next = stroke.controlPoints[Math.min(stroke.controlPoints.length - 1, index + 1)].position;
  let tx = next[0] - previous[0];
  let tz = next[2] - previous[2];
  if (tx === 0 && tz === 0) {
    tx = point[0] - previous[0];
    tz = point[2] - previous[2];
  }
  let ox = -tz;
  let oz = tx;
  const length = Math.hypot(ox, oz);
  if (length === 0) {
    return [width, 0, 0];
  }
  ox = (ox / length) * width;
  oz = (oz / length) * width;
  return [ox, 0, oz];
}

function getTubeNormal(index: number): Vec3 {
  switch (index) {
    case 0:
      return [1, 0, 0];
    case 1:
      return [0, 1, 0];
    case 2:
      return [-1, 0, 0];
    default:
      return [0, -1, 0];
  }
}

function writePosition(target: Float32Array, vertex: number, value: Vec3): void {
  const offset = vertex * 3;
  target[offset] = value[0];
  target[offset + 1] = value[1];
  target[offset + 2] = value[2];
}

function writeNormal(target: Float32Array, vertex: number, value: Vec3): void {
  writePosition(target, vertex, value);
}

function writeColor(
  target: Float32Array,
  vertex: number,
  value: Rgba,
  opacityMultiplier = 1,
): void {
  const offset = vertex * 4;
  target[offset] = value[0];
  target[offset + 1] = value[1];
  target[offset + 2] = value[2];
  target[offset + 3] = clamp01(value[3] * opacityMultiplier);
}

function writeUv(target: Float32Array, vertex: number, value: [number, number]): void {
  const offset = vertex * 2;
  target[offset] = value[0];
  target[offset + 1] = value[1];
}

function createEmptyBounds(): BrushGeometryBounds {
  return {
    min: [
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    ],
    max: [
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ],
  };
}

function includeBounds(
  bounds: BrushGeometryBounds,
  positions: Float32Array,
  vertex: number,
): void {
  const offset = vertex * 3;
  const x = positions[offset];
  const y = positions[offset + 1];
  const z = positions[offset + 2];
  if (x < bounds.min[0]) {
    bounds.min[0] = x;
  }
  if (y < bounds.min[1]) {
    bounds.min[1] = y;
  }
  if (z < bounds.min[2]) {
    bounds.min[2] = z;
  }
  if (x > bounds.max[0]) {
    bounds.max[0] = x;
  }
  if (y > bounds.max[1]) {
    bounds.max[1] = y;
  }
  if (z > bounds.max[2]) {
    bounds.max[2] = z;
  }
}
