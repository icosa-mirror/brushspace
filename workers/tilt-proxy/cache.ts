import { handleTiltProxy, isAllowedTiltUrl } from "./handler";

/** Cache immutable files at the edge; cache rate limits briefly to avoid hammering Archive.org. */
export async function handleCachedTiltProxy(
  request: Request,
  cache: Pick<Cache, "match" | "put">,
  waitUntil: (promise: Promise<unknown>) => void,
  download = handleTiltProxy,
): Promise<Response> {
  const url = new URL(request.url);
  const target = url.searchParams.get("url") ?? "";
  if (request.method !== "GET" || url.pathname !== "/api/tilt-proxy" || !isAllowedTiltUrl(target)) {
    return download(request);
  }
  // Canonical key ignores extraneous parameters and client headers.
  url.search = "";
  url.searchParams.set("url", target);
  const key = new Request(url);
  let hit: Response | undefined;
  try { hit = await cache.match(key); } catch { /* Cache failure must not break downloads. */ }
  if (hit) {
    const response = new Response(hit.body, hit);
    const retryAt = response.headers.get("X-Brushspace-Retry-At");
    if (!retryAt || Number(retryAt) > Date.now()) {
      if (retryAt) {
        response.headers.set("Retry-After", String(Math.max(1, Math.ceil((Number(retryAt) - Date.now()) / 1000))));
        response.headers.set("Cache-Control", "no-store");
        response.headers.delete("X-Brushspace-Retry-At");
      }
      response.headers.set("X-Brushspace-Cache", "HIT");
      return response;
    }
    await response.body?.cancel();
  }
  const response = await download(request);
  if (response.status === 200 || response.status === 429) {
    const cached = response.clone();
    if (response.status === 429) {
      const value = response.headers.get("Retry-After") ?? "60";
      const seconds = /^\d+$/.test(value) ? Number(value) : (Date.parse(value) - Date.now()) / 1000;
      const cooldown = Math.max(15, Math.min(600, Number.isFinite(seconds) ? seconds : 60));
      cached.headers.set("Cache-Control", `public, max-age=${Math.ceil(cooldown)}`);
      cached.headers.set("X-Brushspace-Retry-At", String(Date.now() + cooldown * 1000));
    }
    waitUntil(cache.put(key, cached).catch(() => {
      console.warn("[BrushspaceTiltProxy] cache write failed");
    }));
  }
  response.headers.set("X-Brushspace-Cache", "MISS");
  return response;
}
