import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { requiredOpenBrushes } from "../src/brushes/brush-catalog.js";
import brushAssets from "../src/brushes/generated/brush-assets.json" with {
  type: "json",
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const authoritativeRoot = path.join(
  root,
  "vendor",
  "icosa-sketch-assets",
  "brushes",
);

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

function declarations(source, qualifier) {
  const result = new Map();
  const pattern = new RegExp(
    `^\\s*${qualifier}\\s+(?:(?:lowp|mediump|highp)\\s+)?(\\w+)\\s+(\\w+)\\s*;`,
    "gm",
  );
  for (const match of stripComments(source).matchAll(pattern)) {
    result.set(match[2], match[1]);
  }
  return result;
}

function isUsed(source, name) {
  const uncommented = stripComments(source).replace(
    /^\s*in\s+(?:(?:lowp|mediump|highp)\s+)?\w+\s+\w+\s*;/gm,
    "",
  );
  return new RegExp(`\\b${name}\\b`).test(uncommented);
}

const authoritativeFolders = fs
  .readdirSync(authoritativeRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "legacy")
  .map((entry) => entry.name);

const requiredBrushes = requiredOpenBrushes.map((entry) => [
  entry,
  brushAssets.brushes[entry.guid],
]);

function resolveShaderPair(name) {
  const prefix = `${name}-`.toLowerCase();
  const folderName = authoritativeFolders.find((candidate) =>
    candidate.toLowerCase().startsWith(prefix),
  );
  if (!folderName) {
    return undefined;
  }
  const folder = path.join(authoritativeRoot, folderName);
  const files = fs.readdirSync(folder);
  return {
    folder,
    vertex: files.find((file) => file.endsWith("-vertex.glsl")),
    fragment: files.find((file) => file.endsWith("-fragment.glsl")),
  };
}

describe("authoritative required-brush shader interfaces", () => {
  it("covers the 48 standard and 47 experimental brush target", () => {
    const standard = requiredBrushes.filter(
      ([entry]) => entry.catalogSection === "standard",
    );
    const experimental = requiredBrushes.filter(
      ([entry]) => entry.catalogSection === "experimental",
    );
    expect(standard).toHaveLength(48);
    expect(experimental).toHaveLength(47);
  });

  it.each(requiredBrushes)(
    "$0.name links active fragment varyings to its vertex stage",
    (entry, record) => {
      expect(record, `missing asset record for ${entry.guid}`).toBeDefined();
      const pair = resolveShaderPair(entry.name);
      expect(pair, `missing authoritative shader folder for ${entry.name}`).toBeDefined();
      const vertexPath = path.join(pair.folder, pair.vertex ?? "");
      const fragmentPath = path.join(pair.folder, pair.fragment ?? "");
      expect(fs.existsSync(vertexPath), vertexPath).toBe(true);
      expect(fs.existsSync(fragmentPath), fragmentPath).toBe(true);

      const vertexSource = fs.readFileSync(vertexPath, "utf8");
      const fragmentSource = fs.readFileSync(fragmentPath, "utf8");
      const vertexOutputs = declarations(vertexSource, "out");
      const fragmentInputs = declarations(fragmentSource, "in");
      const mismatches = [];

      for (const [name, fragmentType] of fragmentInputs) {
        if (!isUsed(fragmentSource, name)) {
          continue;
        }
        const vertexType = vertexOutputs.get(name);
        if (vertexType !== fragmentType) {
          mismatches.push(
            `${name}: fragment ${fragmentType}, vertex ${vertexType ?? "missing"}`,
          );
        }
      }

      expect(mismatches, entry.name).toEqual([]);
    },
  );
});
