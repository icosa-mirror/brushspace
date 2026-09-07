import { handleTiltProxy } from "./handler";
import { handleCachedTiltProxy } from "./cache";

export default {
  async fetch(request: Request, _env: unknown, context: { waitUntil(promise: Promise<unknown>): void }) {
    let cache: Cache;
    try { cache = await caches.open("brushspace-tilt-downloads-v1"); }
    catch { return handleTiltProxy(request); }
    return handleCachedTiltProxy(request, cache, (promise) => context.waitUntil(promise));
  },
};
