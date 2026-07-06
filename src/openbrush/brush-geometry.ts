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

  // Ribbon surface frames per Open Brush's ComputeSurfaceFrameNew
  // (BaseBrushScript.cs): the frame follows the pointer orientation and the
  // movement direction, disambiguated toward the previous right vector so the
  // strip never flips mid-stroke (the old XZ-planar offset twisted on coils).
  const previousRight: Vec3 = [0, 0, 0];
  const previousTangent: Vec3 = [0, 0, 0];
  const tangent: Vec3 = [0, 0, 0];
  const pointerForward: Vec3 = [0, 0, 0];
  const pointerUp: Vec3 = [0, 0, 0];
  const right: Vec3 = [0, 0, 0];
  const normal: Vec3 = [0, 0, 0];

  for (let index = 0; index < pointCount; index += 1) {
    const point = stroke.controlPoints[index];
    const width =
      stroke.brushSize *
      getPressureSizeMultiplier(point.pressure, pressureSizeMin) *
      0.5;

    writeCentralDifferenceTangent(stroke, index, previousTangent, tangent);
    rotateByQuaternion(point.orientation, VEC_FORWARD, pointerForward);
    rotateByQuaternion(point.orientation, VEC_UP, pointerUp);
    computeSurfaceFrame(
      previousRight,
      tangent,
      pointerForward,
      pointerUp,
      index === 0,
      right,
      normal,
    );
    previousRight[0] = right[0];
    previousRight[1] = right[1];
    previousRight[2] = right[2];
    previousTangent[0] = tangent[0];
    previousTangent[1] = tangent[1];
    previousTangent[2] = tangent[2];

    const leftVertex = index * 2;
    const rightVertex = leftVertex + 1;
    writePosition(positions, leftVertex, [
      point.position[0] - right[0] * width,
      point.position[1] - right[1] * width,
      point.position[2] - right[2] * width,
    ]);
    writePosition(positions, rightVertex, [
      point.position[0] + right[0] * width,
      point.position[1] + right[1] * width,
      point.position[2] + right[2] * width,
    ]);
    writeNormal(normals, leftVertex, normal);
    writeNormal(normals, rightVertex, normal);
    const opacity = getPressureOpacityMultiplier(
      point.pressure,
      pressureOpacityMin,
      pressureOpacityMax,
    );
    writeColor(colors, leftVertex, stroke.color, opacity);
    writeColor(colors, rightVertex, stroke.color, opacity);
    // Open Brush UV convention: u runs along the stroke length, v across the
    // ribbon width (QuadStripBrush; the exported brush textures assume this).
    const lengthFraction = pointCount <= 1 ? 0 : index / (pointCount - 1);
    writeUv(uvs, leftVertex, [lengthFraction, 0]);
    writeUv(uvs, rightVertex, [lengthFraction, 1]);
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

// Open Brush TubeBrush: m_PointsInClosedCircle = 8 ring points on a
// minimal-rotation (parallel transport) frame; one duplicated seam vertex per
// ring keeps the around-the-ring UV continuous.
const TUBE_RING_SIDES = 8;
const TUBE_RING_VERTS = TUBE_RING_SIDES + 1;

function generateTubeGeometry(
  stroke: StrokeData,
  options: BrushGeometryOptions,
): GeneratedBrushGeometry {
  const pointCount = stroke.controlPoints.length;
  const segmentCount = Math.max(0, pointCount - 1);
  const hasCaps = pointCount >= 2;
  const capVertexCount = hasCaps ? 2 : 0;
  const vertexCount = pointCount * TUBE_RING_VERTS + capVertexCount;
  const indexCount =
    segmentCount * TUBE_RING_SIDES * 6 + (hasCaps ? 2 * TUBE_RING_SIDES * 3 : 0);
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 4);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(indexCount);
  const bounds = createEmptyBounds();
  const pressureSizeMin = normalizePressureSizeMin(options.pressureSizeRange?.[0]);
  const pressureOpacityMin = normalizePressureOpacityMin(
    options.pressureOpacityRange,
  );
  const pressureOpacityMax = normalizePressureOpacityMax(
    options.pressureOpacityRange,
  );

  // Frame state: right/up transported along the stroke by the tangent-to-
  // tangent rotation (MathUtils.ComputeMinimalRotationFrame), bootstrapped
  // from the pointer orientation on the first knot.
  const tangent: Vec3 = [0, 0, 0];
  const previousTangent: Vec3 = [0, 0, 0];
  const frameRight: Vec3 = [0, 0, 0];
  const frameUp: Vec3 = [0, 0, 0];
  const bootstrapUp: Vec3 = [0, 0, 0];
  const radial: Vec3 = [0, 0, 0];

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

    writeCentralDifferenceTangent(stroke, pointIndex, previousTangent, tangent);
    if (pointIndex === 0) {
      // Bootstrap: pick the second axis from the pointer orientation, like
      // ComputeMinimalRotationFrame does when there is no previous frame.
      rotateByQuaternion(point.orientation, VEC_UP, bootstrapUp);
      if (Math.abs(dot(bootstrapUp, tangent)) > 0.99) {
        rotateByQuaternion(point.orientation, VEC_RIGHT, bootstrapUp);
      }
      cross(bootstrapUp, tangent, frameRight);
      if (!normalizeInPlace(frameRight)) {
        anyPerpendicular(tangent, frameRight);
      }
      cross(tangent, frameRight, frameUp);
      normalizeInPlace(frameUp);
    } else {
      rotateBetweenTangents(previousTangent, tangent, frameRight);
      rotateBetweenTangents(previousTangent, tangent, frameUp);
      // Re-orthonormalize against drift.
      const drift = dot(frameRight, tangent);
      frameRight[0] -= tangent[0] * drift;
      frameRight[1] -= tangent[1] * drift;
      frameRight[2] -= tangent[2] * drift;
      if (!normalizeInPlace(frameRight)) {
        anyPerpendicular(tangent, frameRight);
      }
      cross(tangent, frameRight, frameUp);
      normalizeInPlace(frameUp);
    }
    previousTangent[0] = tangent[0];
    previousTangent[1] = tangent[1];
    previousTangent[2] = tangent[2];

    const lengthFraction = pointCount <= 1 ? 0 : pointIndex / (pointCount - 1);
    for (let ringIndex = 0; ringIndex < TUBE_RING_VERTS; ringIndex += 1) {
      const vertex = pointIndex * TUBE_RING_VERTS + ringIndex;
      const angle = ((ringIndex % TUBE_RING_SIDES) / TUBE_RING_SIDES) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      radial[0] = frameRight[0] * cos + frameUp[0] * sin;
      radial[1] = frameRight[1] * cos + frameUp[1] * sin;
      radial[2] = frameRight[2] * cos + frameUp[2] * sin;
      writePosition(positions, vertex, [
        point.position[0] + radial[0] * radius,
        point.position[1] + radial[1] * radius,
        point.position[2] + radial[2] * radius,
      ]);
      writeNormal(normals, vertex, radial);
      writeColor(colors, vertex, stroke.color, opacity);
      // u along the stroke length, v around the ring (Open Brush TubeBrush).
      writeUv(uvs, vertex, [lengthFraction, ringIndex / TUBE_RING_SIDES]);
      includeBounds(bounds, positions, vertex);
    }
  }

  let indexOffset = 0;
  for (let segment = 0; segment < segmentCount; segment += 1) {
    const firstRing = segment * TUBE_RING_VERTS;
    const secondRing = firstRing + TUBE_RING_VERTS;
    for (let side = 0; side < TUBE_RING_SIDES; side += 1) {
      indices[indexOffset] = firstRing + side;
      indices[indexOffset + 1] = secondRing + side;
      indices[indexOffset + 2] = firstRing + side + 1;
      indices[indexOffset + 3] = firstRing + side + 1;
      indices[indexOffset + 4] = secondRing + side;
      indices[indexOffset + 5] = secondRing + side + 1;
      indexOffset += 6;
    }
  }

  if (hasCaps) {
    const startPoint = stroke.controlPoints[0];
    const endPoint = stroke.controlPoints[pointCount - 1];
    const startCenter = pointCount * TUBE_RING_VERTS;
    const endCenter = startCenter + 1;
    const startOpacity = getPressureOpacityMultiplier(
      startPoint.pressure,
      pressureOpacityMin,
      pressureOpacityMax,
    );
    const endOpacity = getPressureOpacityMultiplier(
      endPoint.pressure,
      pressureOpacityMin,
      pressureOpacityMax,
    );
    writePosition(positions, startCenter, [
      startPoint.position[0],
      startPoint.position[1],
      startPoint.position[2],
    ]);
    writePosition(positions, endCenter, [
      endPoint.position[0],
      endPoint.position[1],
      endPoint.position[2],
    ]);
    // Cap centers face outward along the stroke ends; tangent currently
    // holds the frame of the last point.
    writeNormal(normals, endCenter, tangent);
    writeCentralDifferenceTangent(stroke, 0, tangent, radial);
    writeNormal(normals, startCenter, [-radial[0], -radial[1], -radial[2]]);
    writeColor(colors, startCenter, stroke.color, startOpacity);
    writeColor(colors, endCenter, stroke.color, endOpacity);
    writeUv(uvs, startCenter, [0, 0.5]);
    writeUv(uvs, endCenter, [1, 0.5]);
    includeBounds(bounds, positions, startCenter);
    includeBounds(bounds, positions, endCenter);

    const lastRing = (pointCount - 1) * TUBE_RING_VERTS;
    for (let side = 0; side < TUBE_RING_SIDES; side += 1) {
      indices[indexOffset] = startCenter;
      indices[indexOffset + 1] = side + 1;
      indices[indexOffset + 2] = side;
      indices[indexOffset + 3] = endCenter;
      indices[indexOffset + 4] = lastRing + side;
      indices[indexOffset + 5] = lastRing + side + 1;
      indexOffset += 6;
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

// WebXR pointer conventions: -Z is the pointing direction, +Y is up.
const VEC_FORWARD: Vec3 = [0, 0, -1];
const VEC_UP: Vec3 = [0, 1, 0];
const VEC_RIGHT: Vec3 = [1, 0, 0];
const EPSILON = 1e-6;

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3, out: Vec3): void {
  const x = a[1] * b[2] - a[2] * b[1];
  const y = a[2] * b[0] - a[0] * b[2];
  const z = a[0] * b[1] - a[1] * b[0];
  out[0] = x;
  out[1] = y;
  out[2] = z;
}

function normalizeInPlace(v: Vec3): boolean {
  const length = Math.hypot(v[0], v[1], v[2]);
  if (length < EPSILON) {
    return false;
  }
  v[0] /= length;
  v[1] /= length;
  v[2] /= length;
  return true;
}

/** Writes some unit vector perpendicular to the given unit vector. */
function anyPerpendicular(v: Vec3, out: Vec3): void {
  if (Math.abs(v[1]) < 0.9) {
    cross(VEC_UP, v, out);
  } else {
    cross(VEC_RIGHT, v, out);
  }
  if (!normalizeInPlace(out)) {
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
  }
}

/** Rotates a vector by a unit quaternion [x, y, z, w]; zero quats act as identity. */
function rotateByQuaternion(
  q: readonly number[],
  v: Vec3,
  out: Vec3,
): void {
  const x = q[0];
  const y = q[1];
  const z = q[2];
  const w = q[3];
  const lengthSq = x * x + y * y + z * z + w * w;
  if (lengthSq < EPSILON) {
    out[0] = v[0];
    out[1] = v[1];
    out[2] = v[2];
    return;
  }
  // t = 2 q_vec × v; v' = v + w t + q_vec × t
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  out[0] = v[0] + w * tx + (y * tz - z * ty);
  out[1] = v[1] + w * ty + (z * tx - x * tz);
  out[2] = v[2] + w * tz + (x * ty - y * tx);
  const invLength = 1 / lengthSq;
  out[0] *= invLength;
  out[1] *= invLength;
  out[2] *= invLength;
}

/**
 * Writes the unit central-difference tangent at a control point, falling back
 * to the previous tangent (or the world forward) for degenerate segments.
 */
function writeCentralDifferenceTangent(
  stroke: StrokeData,
  index: number,
  previousTangent: Vec3,
  out: Vec3,
): void {
  const lastIndex = stroke.controlPoints.length - 1;
  const previous = stroke.controlPoints[Math.max(0, index - 1)].position;
  const next = stroke.controlPoints[Math.min(lastIndex, index + 1)].position;
  out[0] = next[0] - previous[0];
  out[1] = next[1] - previous[1];
  out[2] = next[2] - previous[2];
  if (!normalizeInPlace(out)) {
    out[0] = previousTangent[0];
    out[1] = previousTangent[1];
    out[2] = previousTangent[2];
    if (!normalizeInPlace(out)) {
      out[0] = VEC_FORWARD[0];
      out[1] = VEC_FORWARD[1];
      out[2] = VEC_FORWARD[2];
    }
  }
}

const surfaceFrameRight1: Vec3 = [0, 0, 0];
const surfaceFrameRight2: Vec3 = [0, 0, 0];

/**
 * Port of Open Brush's BaseBrushScript.ComputeSurfaceFrameNew: an orthogonal
 * ribbon frame from the movement direction and pointer orientation. The
 * pointer-up cross term takes over as pointer-forward approaches the movement
 * direction (pulling the brush), and both terms are flipped toward the
 * previous right vector so the strip never flips mid-stroke.
 */
function computeSurfaceFrame(
  preferredRight: Vec3,
  tangent: Vec3,
  pointerForward: Vec3,
  pointerUp: Vec3,
  isFirst: boolean,
  outRight: Vec3,
  outNormal: Vec3,
): void {
  cross(pointerForward, tangent, surfaceFrameRight1);
  cross(pointerUp, tangent, surfaceFrameRight2);

  let preferred = preferredRight;
  if (isFirst || Math.hypot(preferred[0], preferred[1], preferred[2]) < EPSILON) {
    preferred =
      Math.hypot(
        surfaceFrameRight1[0],
        surfaceFrameRight1[1],
        surfaceFrameRight1[2],
      ) >= EPSILON
        ? surfaceFrameRight1
        : surfaceFrameRight2;
  }

  const flip1 = dot(surfaceFrameRight1, preferred) < 0 ? -1 : 1;
  const upWeight =
    Math.abs(dot(pointerForward, tangent)) *
    (dot(surfaceFrameRight2, preferred) < 0 ? -1 : 1);
  outRight[0] = surfaceFrameRight1[0] * flip1 + surfaceFrameRight2[0] * upWeight;
  outRight[1] = surfaceFrameRight1[1] * flip1 + surfaceFrameRight2[1] * upWeight;
  outRight[2] = surfaceFrameRight1[2] * flip1 + surfaceFrameRight2[2] * upWeight;
  if (!normalizeInPlace(outRight)) {
    outRight[0] = preferred[0];
    outRight[1] = preferred[1];
    outRight[2] = preferred[2];
    if (!normalizeInPlace(outRight)) {
      anyPerpendicular(tangent, outRight);
    }
  }
  cross(tangent, outRight, outNormal);
  normalizeInPlace(outNormal);
}

/**
 * Rotates a vector in place by the minimal rotation taking the previous unit
 * tangent to the current one (parallel transport step).
 */
function rotateBetweenTangents(
  previousTangent: Vec3,
  tangent: Vec3,
  v: Vec3,
): void {
  const cx = previousTangent[1] * tangent[2] - previousTangent[2] * tangent[1];
  const cy = previousTangent[2] * tangent[0] - previousTangent[0] * tangent[2];
  const cz = previousTangent[0] * tangent[1] - previousTangent[1] * tangent[0];
  const d = dot(previousTangent, tangent);
  if (d < -0.999999) {
    // 180° reversal: rotate around any axis perpendicular to the tangent.
    const axis: Vec3 = [0, 0, 0];
    anyPerpendicular(previousTangent, axis);
    const projection = 2 * dot(axis, v);
    v[0] = axis[0] * projection - v[0];
    v[1] = axis[1] * projection - v[1];
    v[2] = axis[2] * projection - v[2];
    return;
  }
  // Rodrigues form of the from-to rotation applied to v.
  const cDotV = (cx * v[0] + cy * v[1] + cz * v[2]) / (1 + d);
  const x = v[0] * d + (cy * v[2] - cz * v[1]) + cx * cDotV;
  const y = v[1] * d + (cz * v[0] - cx * v[2]) + cy * cDotV;
  const z = v[2] * d + (cx * v[1] - cy * v[0]) + cz * cDotV;
  v[0] = x;
  v[1] = y;
  v[2] = z;
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
