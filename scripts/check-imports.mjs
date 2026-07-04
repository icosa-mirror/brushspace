import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const sourceRoot = join(root, "src");
const violations = [];

function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      walk(path);
      continue;
    }

    if (!path.endsWith(".ts")) {
      continue;
    }

    const source = readFileSync(path, "utf8");
    const directThreeImport =
      /(?:import|export)\s+(?:type\s+)?[^;]*\s+from\s+["']three["']/g;
    const directThreeRequire = /require\(["']three["']\)/g;
    if (directThreeImport.test(source) || directThreeRequire.test(source)) {
      violations.push(relative(root, path));
    }
  }
}

walk(sourceRoot);

if (violations.length > 0) {
  console.error("Direct imports from 'three' are not allowed in app code.");
  console.error("Import Three.js classes from '@iwsdk/core' instead.");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log("Import check passed: app code does not import directly from 'three'.");
