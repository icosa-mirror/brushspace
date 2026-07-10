import type {
  BrushGeometryParams,
  BrushGeometryFamily,
  BrushPressureOpacityRange,
  BrushPressureSizeRange,
} from "./brush-inventory.js";
import type { Rgba, StrokeData, Vec3 } from "../types.js";

export interface BrushGeometryBounds {
  min: Vec3;
  max: Vec3;
}

export interface GeneratedBrushGeometry {
  family: BrushGeometryFamily;
  positions: Float32Array;
  normals: Float32Array;
  tangents: Float32Array;
  colors: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  bounds: BrushGeometryBounds;
  warning?: string;
}

export interface BrushGeometryOptions {
  pressureSizeRange?: BrushPressureSizeRange;
  pressureOpacityRange?: BrushPressureOpacityRange;
  geometryParams?: BrushGeometryParams;
  generatorClass?: string;
}

/**
 * Reusable geometry storage: stroke meshes rebuild every sampled frame while
 * drawing, so the arrays grow geometrically and are written in place instead
 * of being reallocated per sample (only vertexCount/indexCount entries are
 * meaningful; renderers bound drawing with setDrawRange).
 */
export interface BrushGeometryArrays {
  family: BrushGeometryFamily;
  positions: Float32Array;
  normals: Float32Array;
  tangents: Float32Array;
  colors: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
  indexCount: number;
  bounds: BrushGeometryBounds;
  warning?: string;
}

const DEFAULT_PRESSURE_SIZE_MIN = 0.1;
const INITIAL_VERTEX_CAPACITY = 256;
const INITIAL_INDEX_CAPACITY = 1024;

export function createBrushGeometryArrays(): BrushGeometryArrays {
  return {
    family: "ribbon",
    positions: new Float32Array(INITIAL_VERTEX_CAPACITY * 3),
    normals: new Float32Array(INITIAL_VERTEX_CAPACITY * 3),
    tangents: new Float32Array(INITIAL_VERTEX_CAPACITY * 4),
    colors: new Float32Array(INITIAL_VERTEX_CAPACITY * 4),
    uvs: new Float32Array(INITIAL_VERTEX_CAPACITY * 2),
    indices: new Uint32Array(INITIAL_INDEX_CAPACITY),
    vertexCount: 0,
    indexCount: 0,
    bounds: createEmptyBounds(),
  };
}

/** Grows storage to fit the given counts; returns true when reallocated. */
function ensureGeometryCapacity(
  out: BrushGeometryArrays,
  vertexCount: number,
  indexCount: number,
): boolean {
  const currentVertexCapacity = out.positions.length / 3;
  const currentIndexCapacity = out.indices.length;
  if (vertexCount <= currentVertexCapacity && indexCount <= currentIndexCapacity) {
    return false;
  }
  let vertexCapacity = Math.max(currentVertexCapacity, INITIAL_VERTEX_CAPACITY);
  while (vertexCapacity < vertexCount) {
    vertexCapacity *= 2;
  }
  let indexCapacity = Math.max(currentIndexCapacity, INITIAL_INDEX_CAPACITY);
  while (indexCapacity < indexCount) {
    indexCapacity *= 2;
  }
  out.positions = new Float32Array(vertexCapacity * 3);
  out.normals = new Float32Array(vertexCapacity * 3);
  out.tangents = new Float32Array(vertexCapacity * 4);
  out.colors = new Float32Array(vertexCapacity * 4);
  out.uvs = new Float32Array(vertexCapacity * 2);
  out.indices = new Uint32Array(indexCapacity);
  return true;
}

function resetBounds(bounds: BrushGeometryBounds): void {
  bounds.min[0] = Number.POSITIVE_INFINITY;
  bounds.min[1] = Number.POSITIVE_INFINITY;
  bounds.min[2] = Number.POSITIVE_INFINITY;
  bounds.max[0] = Number.NEGATIVE_INFINITY;
  bounds.max[1] = Number.NEGATIVE_INFINITY;
  bounds.max[2] = Number.NEGATIVE_INFINITY;
}

/**
 * Writes stroke geometry into reusable storage; returns true when the
 * backing arrays were reallocated (callers must rebind GPU attributes).
 */
export function generateBrushGeometryInto(
  stroke: StrokeData,
  family: BrushGeometryFamily,
  options: BrushGeometryOptions,
  out: BrushGeometryArrays,
): boolean {
  out.warning = undefined;
  resetBounds(out.bounds);
  switch (family) {
    case "ribbon":
      return generateRibbonGeometry(stroke, "ribbon", options, out);
    case "emissive":
      return generateRibbonGeometry(stroke, "emissive", options, out);
    case "tube":
      return generateTubeGeometry(stroke, options, out);
    case "particle":
      return generateParticleGeometry(stroke, options, out);
    case "unsupported": {
      const reallocated = generateRibbonGeometry(stroke, "unsupported", options, out);
      out.warning = "Unsupported brush geometry family; generated fallback ribbon.";
      return reallocated;
    }
  }
}

export function generateBrushGeometry(
  stroke: StrokeData,
  family: BrushGeometryFamily,
  options: BrushGeometryOptions = {},
): GeneratedBrushGeometry {
  const arrays = createBrushGeometryArrays();
  generateBrushGeometryInto(stroke, family, options, arrays);
  return {
    family: arrays.family,
    positions: arrays.positions.subarray(0, arrays.vertexCount * 3),
    normals: arrays.normals.subarray(0, arrays.vertexCount * 3),
    tangents: arrays.tangents.subarray(0, arrays.vertexCount * 4),
    colors: arrays.colors.subarray(0, arrays.vertexCount * 4),
    uvs: arrays.uvs.subarray(0, arrays.vertexCount * 2),
    indices: arrays.indices.subarray(0, arrays.indexCount),
    bounds: arrays.bounds,
    warning: arrays.warning,
  };
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
  out: BrushGeometryArrays,
): boolean {
  if (options.generatorClass === "QuadStripUnitizedUVBrush") {
    return generateUnitizedRibbonGeometry(stroke, family, options, out);
  }
  const pointCount = stroke.controlPoints.length;
  const frontVertexCount = pointCount * 2;
  const segmentCount = Math.max(0, pointCount - 1);
  const frontIndexCount = segmentCount * 6;
  const hasBackfaces = options.geometryParams?.renderBackfaces === true;
  const vertexCount = frontVertexCount * (hasBackfaces ? 2 : 1);
  const indexCount = frontIndexCount * (hasBackfaces ? 2 : 1);
  const reallocated = ensureGeometryCapacity(out, vertexCount, indexCount);
  const { positions, normals, tangents, colors, uvs, indices, bounds } = out;
  const pressureSizeMin = normalizePressureSizeMin(options.pressureSizeRange?.[0]);
  const pressureOpacityMin = normalizePressureOpacityMin(
    options.pressureOpacityRange,
  );
  const pressureOpacityMax = normalizePressureOpacityMax(
    options.pressureOpacityRange,
  );
  const descriptorOpacity = normalizeDescriptorOpacity(
    options.geometryParams?.opacity,
  );
  const tileRate = normalizeTileRate(options.geometryParams?.tileRate);
  const usesDistanceUvs =
    options.generatorClass === "QuadStripBrushDistanceUV";
  const usesUnitizedUvs =
    options.generatorClass === "QuadStripUnitizedUVBrush";
  const totalStrokeLength = usesDistanceUvs
    ? 0
    : measureStrokeLength(stroke);
  const random01 = statelessRandom01(stroke.seed, 0);
  const atlasRows = normalizeAtlasRows(options.geometryParams?.textureAtlasV);
  const atlasRow = usesUnitizedUvs
    ? 0
    : usesDistanceUvs
      ? Math.floor(random01 * 3331) % atlasRows
      : Math.floor(random01 * atlasRows);
  const v0 = atlasRow / atlasRows;
  const v1 = (atlasRow + 1) / atlasRows;
  const initialU = usesDistanceUvs ? random01 : 0;
  let runningLength = 0;

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
    writeTangent(tangents, leftVertex, tangent, 1);
    writeTangent(tangents, rightVertex, tangent, 1);
    const opacity = getPressureOpacityMultiplier(
      point.pressure,
      pressureOpacityMin,
      pressureOpacityMax,
    ) * descriptorOpacity;
    writeColor(colors, leftVertex, stroke.color, opacity);
    writeColor(colors, rightVertex, stroke.color, opacity);
    // Open Brush distance ribbons advance by tileRate * segmentLength / size;
    // stretch ribbons normalize accumulated physical length across the stroke.
    if (index > 0) {
      runningLength += distanceBetweenControlPoints(
        stroke.controlPoints[index - 1],
        point,
      );
    }
    const u = usesDistanceUvs
      ? initialU +
        (runningLength / Math.max(stroke.brushSize, EPSILON)) * tileRate
      : totalStrokeLength > EPSILON
        ? runningLength / totalStrokeLength
        : 0;
    writeUv(uvs, leftVertex, [u, v0]);
    writeUv(uvs, rightVertex, [u, v1]);
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

  if (hasBackfaces) {
    const hueShift = normalizeHueShift(
      options.geometryParams?.backfaceHueShift,
    );
    const backfaceColor = shiftHue(stroke.color, hueShift);
    for (let vertex = 0; vertex < frontVertexCount; vertex += 1) {
      const backVertex = frontVertexCount + vertex;
      copyPosition(positions, vertex, backVertex);
      copyNegatedNormal(normals, vertex, backVertex);
      copyTangent(tangents, vertex, backVertex, true);
      copyUv(uvs, vertex, backVertex);
      writeColorFromAlpha(
        colors,
        backVertex,
        backfaceColor,
        colors[vertex * 4 + 3],
      );
    }

    for (let segment = 0; segment < segmentCount; segment += 1) {
      const vertex = frontVertexCount + segment * 2;
      const offset = frontIndexCount + segment * 6;
      indices[offset] = vertex;
      indices[offset + 1] = vertex + 1;
      indices[offset + 2] = vertex + 2;
      indices[offset + 3] = vertex + 1;
      indices[offset + 4] = vertex + 3;
      indices[offset + 5] = vertex + 2;
    }
  }

  out.family = family;
  out.vertexCount = vertexCount;
  out.indexCount = indexCount;
  return reallocated;
}

function generateUnitizedRibbonGeometry(
  stroke: StrokeData,
  family: BrushGeometryFamily,
  options: BrushGeometryOptions,
  out: BrushGeometryArrays,
): boolean {
  const pointCount = stroke.controlPoints.length;
  const segmentCount = Math.max(0, pointCount - 1);
  const frontVertexCount = segmentCount * 4;
  const frontIndexCount = segmentCount * 6;
  const hasBackfaces = options.geometryParams?.renderBackfaces === true;
  const vertexCount = frontVertexCount * (hasBackfaces ? 2 : 1);
  const indexCount = frontIndexCount * (hasBackfaces ? 2 : 1);
  const reallocated = ensureGeometryCapacity(out, vertexCount, indexCount);
  const { positions, normals, tangents, colors, uvs, indices, bounds } = out;
  const pressureSizeMin = normalizePressureSizeMin(options.pressureSizeRange?.[0]);
  const pressureOpacityMin = normalizePressureOpacityMin(
    options.pressureOpacityRange,
  );
  const pressureOpacityMax = normalizePressureOpacityMax(
    options.pressureOpacityRange,
  );
  const descriptorOpacity = normalizeDescriptorOpacity(
    options.geometryParams?.opacity,
  );

  const previousFrameRight: Vec3 = [0, 0, 0];
  const previousFallbackTangent: Vec3 = [0, 0, 0];
  const tangent: Vec3 = [0, 0, 0];
  const pointerForward: Vec3 = [0, 0, 0];
  const pointerUp: Vec3 = [0, 0, 0];
  const right: Vec3 = [0, 0, 0];
  const normal: Vec3 = [0, 0, 0];
  const leftPosition: Vec3 = [0, 0, 0];
  const rightPosition: Vec3 = [0, 0, 0];
  const previousLeftPosition: Vec3 = [0, 0, 0];
  const previousRightPosition: Vec3 = [0, 0, 0];
  const previousNormal: Vec3 = [0, 0, 0];
  const previousVertexTangent: Vec3 = [0, 0, 0];
  let previousOpacity = 1;

  for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
    const point = stroke.controlPoints[pointIndex];
    const width =
      stroke.brushSize *
      getPressureSizeMultiplier(point.pressure, pressureSizeMin) *
      0.5;
    const opacity =
      getPressureOpacityMultiplier(
        point.pressure,
        pressureOpacityMin,
        pressureOpacityMax,
      ) * descriptorOpacity;

    writeCentralDifferenceTangent(
      stroke,
      pointIndex,
      previousFallbackTangent,
      tangent,
    );
    rotateByQuaternion(point.orientation, VEC_FORWARD, pointerForward);
    rotateByQuaternion(point.orientation, VEC_UP, pointerUp);
    computeSurfaceFrame(
      previousFrameRight,
      tangent,
      pointerForward,
      pointerUp,
      pointIndex === 0,
      right,
      normal,
    );
    leftPosition[0] = point.position[0] - right[0] * width;
    leftPosition[1] = point.position[1] - right[1] * width;
    leftPosition[2] = point.position[2] - right[2] * width;
    rightPosition[0] = point.position[0] + right[0] * width;
    rightPosition[1] = point.position[1] + right[1] * width;
    rightPosition[2] = point.position[2] + right[2] * width;

    if (pointIndex > 0) {
      const vertex = (pointIndex - 1) * 4;
      writePosition(positions, vertex, previousLeftPosition);
      writePosition(positions, vertex + 1, previousRightPosition);
      writePosition(positions, vertex + 2, leftPosition);
      writePosition(positions, vertex + 3, rightPosition);
      writeNormal(normals, vertex, previousNormal);
      writeNormal(normals, vertex + 1, previousNormal);
      writeNormal(normals, vertex + 2, normal);
      writeNormal(normals, vertex + 3, normal);
      writeTangent(tangents, vertex, previousVertexTangent, 1);
      writeTangent(tangents, vertex + 1, previousVertexTangent, 1);
      writeTangent(tangents, vertex + 2, tangent, 1);
      writeTangent(tangents, vertex + 3, tangent, 1);
      writeColor(colors, vertex, stroke.color, previousOpacity);
      writeColor(colors, vertex + 1, stroke.color, previousOpacity);
      writeColor(colors, vertex + 2, stroke.color, opacity);
      writeColor(colors, vertex + 3, stroke.color, opacity);
      writeUv(uvs, vertex, [0, 0]);
      writeUv(uvs, vertex + 1, [0, 1]);
      writeUv(uvs, vertex + 2, [1, 0]);
      writeUv(uvs, vertex + 3, [1, 1]);
      for (let offset = 0; offset < 4; offset += 1) {
        includeBounds(bounds, positions, vertex + offset);
      }
      const indexOffset = (pointIndex - 1) * 6;
      indices[indexOffset] = vertex;
      indices[indexOffset + 1] = vertex + 2;
      indices[indexOffset + 2] = vertex + 1;
      indices[indexOffset + 3] = vertex + 1;
      indices[indexOffset + 4] = vertex + 2;
      indices[indexOffset + 5] = vertex + 3;
    }

    copyVec3(leftPosition, previousLeftPosition);
    copyVec3(rightPosition, previousRightPosition);
    copyVec3(normal, previousNormal);
    copyVec3(tangent, previousVertexTangent);
    copyVec3(right, previousFrameRight);
    copyVec3(tangent, previousFallbackTangent);
    previousOpacity = opacity;
  }

  if (hasBackfaces) {
    const backfaceColor = shiftHue(
      stroke.color,
      normalizeHueShift(options.geometryParams?.backfaceHueShift),
    );
    for (let vertex = 0; vertex < frontVertexCount; vertex += 1) {
      const backVertex = frontVertexCount + vertex;
      copyPosition(positions, vertex, backVertex);
      copyNegatedNormal(normals, vertex, backVertex);
      copyTangent(tangents, vertex, backVertex, true);
      copyUv(uvs, vertex, backVertex);
      writeColorFromAlpha(
        colors,
        backVertex,
        backfaceColor,
        colors[vertex * 4 + 3],
      );
    }
    for (let segment = 0; segment < segmentCount; segment += 1) {
      const vertex = frontVertexCount + segment * 4;
      const indexOffset = frontIndexCount + segment * 6;
      indices[indexOffset] = vertex;
      indices[indexOffset + 1] = vertex + 1;
      indices[indexOffset + 2] = vertex + 2;
      indices[indexOffset + 3] = vertex + 1;
      indices[indexOffset + 4] = vertex + 3;
      indices[indexOffset + 5] = vertex + 2;
    }
  }

  out.family = family;
  out.vertexCount = vertexCount;
  out.indexCount = indexCount;
  return reallocated;
}

function generateTubeGeometry(
  stroke: StrokeData,
  options: BrushGeometryOptions,
  out: BrushGeometryArrays,
): boolean {
  const pointCount = stroke.controlPoints.length;
  const segmentCount = Math.max(0, pointCount - 1);
  const sideCount = normalizeTubeSideCount(options.geometryParams?.tubeSideCount);
  const hardEdges = options.geometryParams?.tubeHardEdges === true;
  const ringVertexCount = hardEdges ? sideCount * 2 : sideCount + 1;
  const hasCaps =
    pointCount >= 2 && options.geometryParams?.tubeEndCaps !== false;
  const capVertexCount = hasCaps ? sideCount * 2 : 0;
  const vertexCount = pointCount * ringVertexCount + capVertexCount;
  const indexCount =
    segmentCount * sideCount * 6 + (hasCaps ? 2 * sideCount * 3 : 0);
  const reallocated = ensureGeometryCapacity(out, vertexCount, indexCount);
  const { positions, normals, tangents, colors, uvs, indices, bounds } = out;
  const pressureSizeMin = normalizePressureSizeMin(options.pressureSizeRange?.[0]);
  const pressureOpacityMin = normalizePressureOpacityMin(
    options.pressureOpacityRange,
  );
  const pressureOpacityMax = normalizePressureOpacityMax(
    options.pressureOpacityRange,
  );
  const descriptorOpacity = normalizeDescriptorOpacity(
    options.geometryParams?.opacity,
  );
  const tileRate = normalizeTileRate(options.geometryParams?.tileRate);
  const random01 = statelessRandom01(stroke.seed, 0);
  const atlasRows = normalizeAtlasRows(options.geometryParams?.textureAtlasV);
  const atlasRow = Math.floor(random01 * 3331) % atlasRows;
  const v0 = atlasRow / atlasRows;
  const v1 = (atlasRow + 1) / atlasRows;
  const usesStretchUvs = options.geometryParams?.tubeUvStyle === "stretch";
  const capAspect = normalizeTubeCapAspect(options.geometryParams?.tubeCapAspect);
  const shapeModifier = normalizeTubeShapeModifier(
    options.geometryParams?.tubeShapeModifier,
  );
  const totalStrokeLength = measureStrokeLength(stroke);
  let runningDistance = 0;
  let u = random01;

  // Frame state: right/up transported along the stroke by the tangent-to-
  // tangent rotation (MathUtils.ComputeMinimalRotationFrame), bootstrapped
  // from the pointer orientation on the first knot.
  const tangent: Vec3 = [0, 0, 0];
  const previousTangent: Vec3 = [0, 0, 0];
  const frameRight: Vec3 = [0, 0, 0];
  const frameUp: Vec3 = [0, 0, 0];
  const bootstrapUp: Vec3 = [0, 0, 0];
  const radial: Vec3 = [0, 0, 0];
  const displacement: Vec3 = [0, 0, 0];
  const startTangent: Vec3 = [0, 0, 0];
  const startFrameRight: Vec3 = [0, 0, 0];
  const startFrameUp: Vec3 = [0, 0, 0];
  const endTangent: Vec3 = [0, 0, 0];
  const endFrameRight: Vec3 = [0, 0, 0];
  const endFrameUp: Vec3 = [0, 0, 0];
  let startRadius = 0;
  let endRadius = 0;
  let startU = random01;
  let endU = random01;

  for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
    const point = stroke.controlPoints[pointIndex];
    const radius =
      stroke.brushSize *
      getPressureSizeMultiplier(point.pressure, pressureSizeMin) *
      0.5;
    if (pointIndex > 0) {
      const segmentLength = distanceBetweenControlPoints(
        stroke.controlPoints[pointIndex - 1],
        point,
      );
      runningDistance += segmentLength;
      const circumference = Math.max(2 * Math.PI * radius, EPSILON);
      u += (segmentLength * tileRate) / circumference;
    }
    const progress =
      totalStrokeLength > EPSILON ? runningDistance / totalStrokeLength : 0;
    const shapeScale = getTubeShapeScale(
      shapeModifier,
      progress,
      pointIndex,
      pointCount,
      options.geometryParams?.tubeTaperScalar,
    );
    const petalOffset =
      shapeModifier === 5
        ? Math.pow(
            progress,
            normalizeTubePetalExponent(
              options.geometryParams?.tubePetalDisplacementExponent,
            ),
          ) *
          normalizeTubePetalAmount(
            options.geometryParams?.tubePetalDisplacementAmount,
          ) *
          stroke.brushSize *
          clamp01(point.pressure)
        : 0;
    const opacity = getPressureOpacityMultiplier(
      point.pressure,
      pressureOpacityMin,
      pressureOpacityMax,
    ) * descriptorOpacity;

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

    const ringU = usesStretchUvs
      ? pointIndex / Math.max(pointCount - 1, 1)
      : u;
    if (pointIndex === 0) {
      copyVec3(tangent, startTangent);
      copyVec3(frameRight, startFrameRight);
      copyVec3(frameUp, startFrameUp);
      startRadius = radius;
      startU = ringU;
    }
    copyVec3(tangent, endTangent);
    copyVec3(frameRight, endFrameRight);
    copyVec3(frameUp, endFrameUp);
    endRadius = radius;
    endU = ringU;

    const ringBase = pointIndex * ringVertexCount;
    if (hardEdges) {
      const halfStep = Math.PI / sideCount;
      for (let side = 0; side < sideCount; side += 1) {
        const angle = (side / sideCount) * Math.PI * 2;
        setTubeRadial(frameRight, frameUp, angle, radial);
        copyVec3(radial, displacement);
        for (let duplicate = 0; duplicate < 2; duplicate += 1) {
          const vertex = ringBase + side * 2 + duplicate;
          setTubeRadial(
            frameRight,
            frameUp,
            angle + (duplicate === 0 ? -halfStep : halfStep),
            radial,
          );
          writePosition(positions, vertex, [
            point.position[0] +
              displacement[0] * radius * shapeScale +
              radial[0] * petalOffset,
            point.position[1] +
              displacement[1] * radius * shapeScale +
              radial[1] * petalOffset,
            point.position[2] +
              displacement[2] * radius * shapeScale +
              radial[2] * petalOffset,
          ]);
          writeNormal(normals, vertex, radial);
          writeTangent(tangents, vertex, tangent, 1);
          writeColor(colors, vertex, stroke.color, opacity);
          const vFraction = side === 0 && duplicate === 0 ? 1 : side / sideCount;
          writeUv(uvs, vertex, [ringU, v0 + (v1 - v0) * vFraction]);
          includeBounds(bounds, positions, vertex);
          setTubeRadial(frameRight, frameUp, angle, radial);
        }
      }
    } else {
      for (let ringIndex = 0; ringIndex < ringVertexCount; ringIndex += 1) {
        const vertex = ringBase + ringIndex;
        const fraction = ringIndex / sideCount;
        const angle = (ringIndex === sideCount ? 0 : fraction * Math.PI * 2);
        setTubeRadial(frameRight, frameUp, angle, radial);
        writePosition(positions, vertex, [
          point.position[0] + radial[0] * (radius * shapeScale + petalOffset),
          point.position[1] + radial[1] * (radius * shapeScale + petalOffset),
          point.position[2] + radial[2] * (radius * shapeScale + petalOffset),
        ]);
        writeNormal(normals, vertex, radial);
        writeTangent(tangents, vertex, tangent, 1);
        writeColor(colors, vertex, stroke.color, opacity);
        writeUv(uvs, vertex, [ringU, v0 + (v1 - v0) * fraction]);
        includeBounds(bounds, positions, vertex);
      }
    }
  }

  let indexOffset = 0;
  for (let segment = 0; segment < segmentCount; segment += 1) {
    const firstRing = segment * ringVertexCount;
    const secondRing = firstRing + ringVertexCount;
    for (let side = 0; side < sideCount; side += 1) {
      const first = hardEdges ? side * 2 + 1 : side;
      const next = hardEdges ? (first + 1) % ringVertexCount : side + 1;
      indices[indexOffset] = firstRing + first;
      indices[indexOffset + 1] = secondRing + first;
      indices[indexOffset + 2] = firstRing + next;
      indices[indexOffset + 3] = firstRing + next;
      indices[indexOffset + 4] = secondRing + first;
      indices[indexOffset + 5] = secondRing + next;
      indexOffset += 6;
    }
  }

  if (hasCaps) {
    const startPoint = stroke.controlPoints[0];
    const endPoint = stroke.controlPoints[pointCount - 1];
    const firstCap = pointCount * ringVertexCount;
    const secondCap = firstCap + sideCount;
    const startOpacity = getPressureOpacityMultiplier(
      startPoint.pressure,
      pressureOpacityMin,
      pressureOpacityMax,
    ) * descriptorOpacity;
    const endOpacity = getPressureOpacityMultiplier(
      endPoint.pressure,
      pressureOpacityMin,
      pressureOpacityMax,
    ) * descriptorOpacity;
    const capRadial: Vec3 = [0, 0, 0];
    const capTip: Vec3 = [0, 0, 0];
    for (let capIndex = 0; capIndex < 2; capIndex += 1) {
      const isStart = capIndex === 0;
      const point = isStart ? startPoint : endPoint;
      const capBase = isStart ? firstCap : secondCap;
      const ringBase = isStart ? 0 : (pointCount - 1) * ringVertexCount;
      const capTangent = isStart ? startTangent : endTangent;
      const capRight = isStart ? startFrameRight : endFrameRight;
      const capUp = isStart ? startFrameUp : endFrameUp;
      const radius = isStart ? startRadius : endRadius;
      const ringU = isStart ? startU : endU;
      const opacity = isStart ? startOpacity : endOpacity;
      const direction = isStart ? -1 : 1;
      capTip[0] = point.position[0] + capTangent[0] * radius * capAspect * direction;
      capTip[1] = point.position[1] + capTangent[1] * radius * capAspect * direction;
      capTip[2] = point.position[2] + capTangent[2] * radius * capAspect * direction;
      const diagonal = radius * Math.hypot(1, capAspect);
      const uRate = tileRate / Math.max(2 * Math.PI * radius, EPSILON);
      const capU = usesStretchUvs ? ringU : ringU + direction * uRate * diagonal;

      for (let side = 0; side < sideCount; side += 1) {
        const vertex = capBase + side;
        const fraction = (side + 0.5) / sideCount;
        setTubeRadial(capRight, capUp, fraction * Math.PI * 2, capRadial);
        writePosition(positions, vertex, capTip);
        writeNormal(
          normals,
          vertex,
          hardEdges
            ? capRadial
            : [
                capTangent[0] * direction,
                capTangent[1] * direction,
                capTangent[2] * direction,
              ],
        );
        writeTangent(tangents, vertex, capRadial, 1);
        writeColor(colors, vertex, stroke.color, opacity);
        writeUv(uvs, vertex, [capU, v0 + (v1 - v0) * fraction]);
        includeBounds(bounds, positions, vertex);

        const first = hardEdges ? side * 2 + 1 : side;
        const next = hardEdges ? (first + 1) % ringVertexCount : side + 1;
        indices[indexOffset] = vertex;
        indices[indexOffset + 1] = ringBase + (isStart ? first : next);
        indices[indexOffset + 2] = ringBase + (isStart ? next : first);
        indexOffset += 3;
      }
    }
  }

  out.family = "tube";
  out.vertexCount = vertexCount;
  out.indexCount = indexCount;
  return reallocated;
}

function generateParticleGeometry(
  stroke: StrokeData,
  options: BrushGeometryOptions,
  out: BrushGeometryArrays,
): boolean {
  const pointCount = stroke.controlPoints.length;
  const vertexCount = pointCount * 4;
  const indexCount = pointCount * 6;
  const reallocated = ensureGeometryCapacity(out, vertexCount, indexCount);
  const { positions, normals, tangents, colors, uvs, indices, bounds } = out;
  const pressureSizeMin = normalizePressureSizeMin(options.pressureSizeRange?.[0]);
  const pressureOpacityMin = normalizePressureOpacityMin(
    options.pressureOpacityRange,
  );
  const pressureOpacityMax = normalizePressureOpacityMax(
    options.pressureOpacityRange,
  );
  const descriptorOpacity = normalizeDescriptorOpacity(
    options.geometryParams?.opacity,
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
    ) * descriptorOpacity;
    writeParticleVertex(
      positions,
      normals,
      tangents,
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
      tangents,
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
      tangents,
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
      tangents,
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

  out.family = "particle";
  out.vertexCount = vertexCount;
  out.indexCount = indexCount;
  return reallocated;
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

function normalizeDescriptorOpacity(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? clamp01(value)
    : 1;
}

function normalizeTileRate(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 1;
}

function normalizeAtlasRows(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1
    ? Math.max(1, Math.floor(value))
    : 1;
}

function normalizeTubeSideCount(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(12, Math.max(3, Math.floor(value)))
    : 8;
}

function normalizeTubeCapAspect(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0.8;
}

function normalizeTubeShapeModifier(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(5, Math.max(0, Math.floor(value)))
    : 0;
}

function normalizeTubePetalAmount(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0.5;
}

function normalizeTubePetalExponent(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 3;
}

function getTubeShapeScale(
  modifier: number,
  progress: number,
  pointIndex: number,
  pointCount: number,
  taperScalar: number | undefined,
): number {
  switch (modifier) {
    case 1:
      return getLoftedTubeScale(pointIndex, pointCount);
    case 2:
    case 5:
      return Math.abs(Math.sin(progress * Math.PI));
    case 3:
      return Math.sin(progress * 1.5 + 1.55);
    case 4:
      return (Number.isFinite(taperScalar) ? (taperScalar as number) : 1) *
        (1 - progress);
    default:
      return 1;
  }
}

function getLoftedTubeScale(pointIndex: number, pointCount: number): number {
  if (pointCount < 3) {
    return 0;
  }
  const halfCount = Math.ceil(Math.min(5, pointCount / 2));
  const nextHalfCount = Math.ceil(Math.min(5, (pointCount + 1) / 2));
  const reverseIndex = pointCount - pointIndex - 1;
  const nextReverseIndex = pointCount + 1 - pointIndex - 1;
  let current = 1;
  let next = 1;
  if (pointIndex < halfCount) {
    current = pointIndex / Math.max(1, halfCount - 1);
  } else if (reverseIndex < halfCount) {
    current = Math.max(0, reverseIndex - 1) / Math.max(1, halfCount - 1);
  }
  if (pointIndex < nextHalfCount) {
    next = pointIndex / Math.max(1, nextHalfCount - 1);
  } else if (nextReverseIndex < nextHalfCount) {
    next = Math.max(0, nextReverseIndex - 1) /
      Math.max(1, nextHalfCount - 1);
  }
  current += (next - current) * 0.185;
  const attenuation = clamp01((pointCount - 3) / 7);
  return clamp01(current * attenuation);
}

function normalizeHueShift(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function statelessRandom01(seed: number, salt: number): number {
  let value = (seed ^ salt) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b) >>> 0;
  value = (value ^ (value >>> 16)) >>> 0;
  return Math.min(Math.fround(value) / 0x1_0000_0000, 1 - 2 ** -24);
}

function shiftHue(color: Rgba, hueDegrees: number): Rgba {
  if (hueDegrees === 0) {
    return [color[0], color[1], color[2], color[3]];
  }
  const max = Math.max(color[0], color[1], color[2]);
  const min = Math.min(color[0], color[1], color[2]);
  const lightness = (max + min) * 0.5;
  const delta = max - min;
  if (delta <= EPSILON) {
    return [color[0], color[1], color[2], color[3]];
  }

  const saturation =
    delta / (1 - Math.abs(2 * lightness - 1));
  let hue: number;
  if (max === color[0]) {
    hue = 60 * (((color[1] - color[2]) / delta) % 6);
  } else if (max === color[1]) {
    hue = 60 * ((color[2] - color[0]) / delta + 2);
  } else {
    hue = 60 * ((color[0] - color[1]) / delta + 4);
  }
  hue = ((hue + hueDegrees) % 360 + 360) % 360;

  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = lightness - chroma * 0.5;
  let red = 0;
  let green = 0;
  let blue = 0;
  if (hue < 60) {
    red = chroma;
    green = x;
  } else if (hue < 120) {
    red = x;
    green = chroma;
  } else if (hue < 180) {
    green = chroma;
    blue = x;
  } else if (hue < 240) {
    green = x;
    blue = chroma;
  } else if (hue < 300) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }
  return [red + match, green + match, blue + match, color[3]];
}

function measureStrokeLength(stroke: StrokeData): number {
  let length = 0;
  for (let index = 1; index < stroke.controlPoints.length; index += 1) {
    length += distanceBetweenControlPoints(
      stroke.controlPoints[index - 1],
      stroke.controlPoints[index],
    );
  }
  return length;
}

function distanceBetweenControlPoints(
  left: StrokeData["controlPoints"][number],
  right: StrokeData["controlPoints"][number],
): number {
  return Math.hypot(
    right.position[0] - left.position[0],
    right.position[1] - left.position[1],
    right.position[2] - left.position[2],
  );
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
  tangents: Float32Array,
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
  writeTangent(tangents, vertex, [1, 0, 0], 1);
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

function setTubeRadial(
  right: Vec3,
  up: Vec3,
  angle: number,
  out: Vec3,
): void {
  const rightScale = -Math.sin(angle);
  const upScale = -Math.cos(angle);
  out[0] = right[0] * rightScale + up[0] * upScale;
  out[1] = right[1] * rightScale + up[1] * upScale;
  out[2] = right[2] * rightScale + up[2] * upScale;
}

function copyVec3(source: Vec3, target: Vec3): void {
  target[0] = source[0];
  target[1] = source[1];
  target[2] = source[2];
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

function copyPosition(
  target: Float32Array,
  sourceVertex: number,
  targetVertex: number,
): void {
  const sourceOffset = sourceVertex * 3;
  const targetOffset = targetVertex * 3;
  target[targetOffset] = target[sourceOffset];
  target[targetOffset + 1] = target[sourceOffset + 1];
  target[targetOffset + 2] = target[sourceOffset + 2];
}

function copyNegatedNormal(
  target: Float32Array,
  sourceVertex: number,
  targetVertex: number,
): void {
  const sourceOffset = sourceVertex * 3;
  const targetOffset = targetVertex * 3;
  target[targetOffset] = -target[sourceOffset];
  target[targetOffset + 1] = -target[sourceOffset + 1];
  target[targetOffset + 2] = -target[sourceOffset + 2];
}

function writeTangent(
  target: Float32Array,
  vertex: number,
  value: Vec3,
  handedness: number,
): void {
  const offset = vertex * 4;
  target[offset] = value[0];
  target[offset + 1] = value[1];
  target[offset + 2] = value[2];
  target[offset + 3] = handedness;
}

function copyTangent(
  target: Float32Array,
  sourceVertex: number,
  targetVertex: number,
  flipHandedness: boolean,
): void {
  const sourceOffset = sourceVertex * 4;
  const targetOffset = targetVertex * 4;
  target[targetOffset] = target[sourceOffset];
  target[targetOffset + 1] = target[sourceOffset + 1];
  target[targetOffset + 2] = target[sourceOffset + 2];
  target[targetOffset + 3] =
    target[sourceOffset + 3] * (flipHandedness ? -1 : 1);
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

function writeColorFromAlpha(
  target: Float32Array,
  vertex: number,
  value: Rgba,
  alpha: number,
): void {
  const offset = vertex * 4;
  target[offset] = value[0];
  target[offset + 1] = value[1];
  target[offset + 2] = value[2];
  target[offset + 3] = clamp01(alpha);
}

function writeUv(target: Float32Array, vertex: number, value: [number, number]): void {
  const offset = vertex * 2;
  target[offset] = value[0];
  target[offset + 1] = value[1];
}

function copyUv(
  target: Float32Array,
  sourceVertex: number,
  targetVertex: number,
): void {
  const sourceOffset = sourceVertex * 2;
  const targetOffset = targetVertex * 2;
  target[targetOffset] = target[sourceOffset];
  target[targetOffset + 1] = target[sourceOffset + 1];
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
