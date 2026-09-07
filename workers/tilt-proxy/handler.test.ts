import { describe, expect, it, vi } from "vitest";
import { handleTiltProxy, isAllowedTiltUrl } from "./handler";

const target = "https://web.archive.org/web/20250101010101id_/https://poly.googleusercontent.com/downloads/c/example/file.tilt";
const request = (url = target, method = "GET") => new Request(
  `https://proxy.example/api/tilt-proxy?url=${encodeURIComponent(url)}`, { method },
);

describe("restricted archive proxy", () => {
  it.each([
    "http://localhost/file.tilt", "https://web.archive.org.evil.test/file.tilt",
    target.replace("https://poly", "http://poly"), target + "?redirect=evil",
    target.replace("/file.tilt", "/../file.tilt"), target.replace("file.tilt", "%2e%2e/file.tilt"),
    target.replace("poly.googleusercontent.com", "localhost"),
  ])("rejects unsupported target %s", async (url) => {
    expect(isAllowedTiltUrl(url)).toBe(false);
    const fetcher = vi.fn();
    expect((await handleTiltProxy(request(url), fetcher)).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("returns bytes with cross-origin access without forwarding credentials", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { headers: { "Set-Cookie": "secret" } }));
    const response = await handleTiltProxy(request(), fetcher);
    expect(response.status).toBe(200);
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.has("Set-Cookie")).toBe(false);
    expect(fetcher.mock.calls[0][1].redirect).toBe("manual");
    expect(fetcher.mock.calls[0][1].headers).toEqual({ Accept: "application/octet-stream" });
  });
  it("rejects redirects to other hosts", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { Location: "https://localhost/private" } }));
    expect((await handleTiltProxy(request(), fetcher)).status).toBe(502);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("bounds redirect loops", async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response(null, { status: 302, headers: { Location: target } })));
    expect((await handleTiltProxy(request(), fetcher)).status).toBe(502);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("preserves rate limit information without caching failures", async () => {
    const response = await handleTiltProxy(request(), vi.fn().mockResolvedValue(new Response(null, { status: 429, headers: { "Retry-After": "60" } })));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("rejects oversized bodies even without Content-Length", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(new Uint8Array(32 * 1024 * 1024 + 1)));
    expect((await handleTiltProxy(request(), fetcher)).status).toBe(413);
  });
  it("supports preflight but refuses writes", async () => {
    const fetcher = vi.fn();
    expect((await handleTiltProxy(request(target, "OPTIONS"), fetcher)).status).toBe(204);
    expect((await handleTiltProxy(request(target, "POST"), fetcher)).status).toBe(405);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
