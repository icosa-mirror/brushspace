// GitHub Pages serves the app from a subpath (e.g. /brushspace/), so
// runtime-fetched assets can't hardcode a leading slash. Vite injects the
// deploy base as import.meta.env.BASE_URL ("/" in dev).
const BASE_URL = (
  (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ??
  "/"
).replace(/\/$/, "");

/** Resolves a root-relative public asset path against the deploy base. */
export function assetUrl(path: string): string {
  return `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
