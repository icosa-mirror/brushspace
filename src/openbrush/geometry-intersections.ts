import type { Vec3 } from "./types.js";

export interface IndexedTriangleGeometry {
  positions: ArrayLike<number>;
  indices?: ArrayLike<number>;
  drawStart?: number;
  drawCount?: number;
  matrixElements?: ArrayLike<number>;
}

export function indexedTriangleGeometryIntersectsSphere(
  geometry: IndexedTriangleGeometry,
  center: Vec3,
  radius: number,
): boolean {
  const radiusSq = Math.max(0, radius) * Math.max(0, radius);
  const indexCount = geometry.indices
    ? geometry.indices.length
    : Math.floor(geometry.positions.length / 3);
  const drawStart = Number.isFinite(geometry.drawStart)
    ? Math.min(Math.max(0, Math.floor(geometry.drawStart ?? 0)), indexCount)
    : 0;
  const drawCount = Number.isFinite(geometry.drawCount)
    ? Math.min(Math.max(0, Math.floor(geometry.drawCount ?? indexCount)), indexCount - drawStart)
    : indexCount - drawStart;
  const triangleIndexEnd = drawStart + Math.floor(drawCount / 3) * 3;

  for (let offset = drawStart; offset < triangleIndexEnd; offset += 3) {
    const aIndex = getVertexIndex(geometry, offset);
    const bIndex = getVertexIndex(geometry, offset + 1);
    const cIndex = getVertexIndex(geometry, offset + 2);

    const ax = readX(geometry, aIndex);
    const ay = readY(geometry, aIndex);
    const az = readZ(geometry, aIndex);
    const bx = readX(geometry, bIndex);
    const by = readY(geometry, bIndex);
    const bz = readZ(geometry, bIndex);
    const cx = readX(geometry, cIndex);
    const cy = readY(geometry, cIndex);
    const cz = readZ(geometry, cIndex);

    if (
      distanceSqPointTriangle(
        center[0],
        center[1],
        center[2],
        ax,
        ay,
        az,
        bx,
        by,
        bz,
        cx,
        cy,
        cz,
      ) <= radiusSq
    ) {
      return true;
    }
  }

  return false;
}

function getVertexIndex(geometry: IndexedTriangleGeometry, offset: number): number {
  return geometry.indices ? geometry.indices[offset] : offset;
}

function readX(geometry: IndexedTriangleGeometry, vertexIndex: number): number {
  const x = geometry.positions[vertexIndex * 3];
  const y = geometry.positions[vertexIndex * 3 + 1];
  const z = geometry.positions[vertexIndex * 3 + 2];
  const elements = geometry.matrixElements;
  return elements
    ? elements[0] * x + elements[4] * y + elements[8] * z + elements[12]
    : x;
}

function readY(geometry: IndexedTriangleGeometry, vertexIndex: number): number {
  const x = geometry.positions[vertexIndex * 3];
  const y = geometry.positions[vertexIndex * 3 + 1];
  const z = geometry.positions[vertexIndex * 3 + 2];
  const elements = geometry.matrixElements;
  return elements
    ? elements[1] * x + elements[5] * y + elements[9] * z + elements[13]
    : y;
}

function readZ(geometry: IndexedTriangleGeometry, vertexIndex: number): number {
  const x = geometry.positions[vertexIndex * 3];
  const y = geometry.positions[vertexIndex * 3 + 1];
  const z = geometry.positions[vertexIndex * 3 + 2];
  const elements = geometry.matrixElements;
  return elements
    ? elements[2] * x + elements[6] * y + elements[10] * z + elements[14]
    : z;
}

function distanceSqPointTriangle(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;

  const d1 = dot(abx, aby, abz, apx, apy, apz);
  const d2 = dot(acx, acy, acz, apx, apy, apz);
  if (d1 <= 0 && d2 <= 0) {
    return distanceSq(px, py, pz, ax, ay, az);
  }

  const bpx = px - bx;
  const bpy = py - by;
  const bpz = pz - bz;
  const d3 = dot(abx, aby, abz, bpx, bpy, bpz);
  const d4 = dot(acx, acy, acz, bpx, bpy, bpz);
  if (d3 >= 0 && d4 <= d3) {
    return distanceSq(px, py, pz, bx, by, bz);
  }

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return distanceSq(px, py, pz, ax + v * abx, ay + v * aby, az + v * abz);
  }

  const cpx = px - cx;
  const cpy = py - cy;
  const cpz = pz - cz;
  const d5 = dot(abx, aby, abz, cpx, cpy, cpz);
  const d6 = dot(acx, acy, acz, cpx, cpy, cpz);
  if (d6 >= 0 && d5 <= d6) {
    return distanceSq(px, py, pz, cx, cy, cz);
  }

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return distanceSq(px, py, pz, ax + w * acx, ay + w * acy, az + w * acz);
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + d5 - d6);
    return distanceSq(
      px,
      py,
      pz,
      bx + w * (cx - bx),
      by + w * (cy - by),
      bz + w * (cz - bz),
    );
  }

  const denominator = 1 / (va + vb + vc);
  const v = vb * denominator;
  const w = vc * denominator;
  return distanceSq(
    px,
    py,
    pz,
    ax + abx * v + acx * w,
    ay + aby * v + acy * w,
    az + abz * v + acz * w,
  );
}

function dot(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): number {
  return ax * bx + ay * by + az * bz;
}

function distanceSq(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): number {
  const dx = ax - bx;
  const dy = ay - by;
  const dz = az - bz;
  return dx * dx + dy * dy + dz * dz;
}
