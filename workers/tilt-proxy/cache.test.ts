import { expect, it, vi } from "vitest";
import { handleCachedTiltProxy } from "./cache";

const target = "https://web.archive.org/web/20250101010101id_/https://poly.googleusercontent.com/downloads/c/example/file.tilt";
const request = () => new Request(`https://proxy.example/api/tilt-proxy?url=${encodeURIComponent(target)}`);

it("serves successful downloads from cache without hitting the archive", async () => {
  const cache = { match: vi.fn().mockResolvedValue(new Response("tilt")), put: vi.fn() };
  const download = vi.fn();
  const response = await handleCachedTiltProxy(request(), cache, () => {}, download);
  expect(await response.text()).toBe("tilt");
  expect(response.headers.get("X-Brushspace-Cache")).toBe("HIT");
  expect(download).not.toHaveBeenCalled();
});
it("stores successful files under a canonical key", async () => {
  const cache = { match: vi.fn(), put: vi.fn().mockResolvedValue(undefined) };
  const download = vi.fn().mockResolvedValue(new Response("tilt", { headers: { "Cache-Control": "public, max-age=86400" } }));
  const input = new Request(`${request().url}&unused=1`);
  await handleCachedTiltProxy(input, cache, () => {}, download);
  expect(cache.put.mock.calls[0][0].url).toBe(request().url);
  expect(cache.put.mock.calls[0][1].headers.get("Cache-Control")).toBe("public, max-age=86400");
});
it("honors a cached rate-limit cooldown without another upstream request", async () => {
  const cache = { match: vi.fn().mockResolvedValue(new Response("rate limited", { status: 429, headers: {
    "X-Brushspace-Retry-At": String(Date.now() + 60_000), "Cache-Control": "public, max-age=60",
  } })), put: vi.fn() };
  const download = vi.fn();
  const response = await handleCachedTiltProxy(request(), cache, () => {}, download);
  expect(response.status).toBe(429);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
  expect(response.headers.has("X-Brushspace-Retry-At")).toBe(false);
  expect(download).not.toHaveBeenCalled();
});
it("caches upstream 429 responses briefly, not as successful downloads", async () => {
  const cache = { match: vi.fn(), put: vi.fn().mockResolvedValue(undefined) };
  const download = vi.fn().mockResolvedValue(new Response("rate limited", { status: 429, headers: { "Retry-After": "60" } }));
  expect((await handleCachedTiltProxy(request(), cache, () => {}, download)).status).toBe(429);
  expect(cache.put.mock.calls[0][1].status).toBe(429);
  expect(cache.put.mock.calls[0][1].headers.get("Cache-Control")).toBe("public, max-age=60");
});
it("does not cache other errors", async () => {
  const cache = { match: vi.fn(), put: vi.fn() };
  await handleCachedTiltProxy(request(), cache, () => {}, vi.fn().mockResolvedValue(new Response(null, { status: 502 })));
  expect(cache.put).not.toHaveBeenCalled();
});

it("retries upstream after a cached cooldown expires", async () => {
  const cache = { match: vi.fn().mockResolvedValue(new Response("rate limited", { status: 429, headers: {
    "X-Brushspace-Retry-At": String(Date.now() - 1000),
  } })), put: vi.fn().mockResolvedValue(undefined) };
  const download = vi.fn().mockResolvedValue(new Response("tilt"));
  expect((await handleCachedTiltProxy(request(), cache, () => {}, download)).status).toBe(200);
  expect(download).toHaveBeenCalledTimes(1);
});

it("still downloads if cache lookup fails", async () => {
  const cache = { match: vi.fn().mockRejectedValue(new Error("unavailable")), put: vi.fn().mockResolvedValue(undefined) };
  const download = vi.fn().mockResolvedValue(new Response("tilt"));
  expect((await handleCachedTiltProxy(request(), cache, () => {}, download)).status).toBe(200);
});
