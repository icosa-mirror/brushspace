const MAX_BYTES = 32 * 1024 * 1024;
const TIMEOUT_MS = 45_000;

/** Only archived Poly .tilt downloads, never an arbitrary URL relay. */
export function isAllowedTiltUrl(value: string): boolean {
  return /^https:\/\/web\.archive\.org\/web\/\d{14}id_\/https:\/\/poly\.googleusercontent\.com\/downloads\/[A-Za-z0-9_./-]+\.tilt$/.test(value)
    && !value.includes("/../") && !value.includes("/./");
}

export async function handleTiltProxy(
  request: Request,
  fetchUpstream: typeof fetch = fetch,
): Promise<Response> {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Expose-Headers": "Retry-After",
    "X-Content-Type-Options": "nosniff",
  };
  const fail = (message: string, status: number) =>
    new Response(message, { status, headers: { ...headers, "Cache-Control": "no-store" } });
  const url = new URL(request.url);
  if (url.pathname !== "/api/tilt-proxy") return fail("Not found", 404);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "GET") return fail("Only GET is supported", 405);
  let target = url.searchParams.get("url") ?? "";
  if (!isAllowedTiltUrl(target)) return fail("Unsupported archive download URL", 400);

  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  if (request.signal.aborted) abort();
  const timer = setTimeout(abort, TIMEOUT_MS);
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      const upstream = await fetchUpstream(target, {
        redirect: "manual", signal: controller.signal,
        // Never forward client cookies, authorization, or arbitrary headers.
        headers: { Accept: "application/octet-stream" },
      });
      if ([301, 302, 303, 307, 308].includes(upstream.status)) {
        await upstream.body?.cancel();
        const location = upstream.headers.get("Location");
        if (!location || redirects === 3) return fail("Archive redirect limit exceeded", 502);
        target = new URL(location, target).href;
        if (!isAllowedTiltUrl(target)) return fail("Unsupported archive redirect", 502);
        continue;
      }
      if (!upstream.ok) {
        const diagnosticReader = upstream.body?.getReader();
        const diagnostic = await diagnosticReader?.read();
        await diagnosticReader?.cancel();
        console.warn("[BrushspaceTiltProxy] upstream failure", JSON.stringify({
          status: upstream.status,
          retryAfter: upstream.headers.get("Retry-After"),
          server: upstream.headers.get("Server"),
          detail: diagnostic?.value ? new TextDecoder().decode(diagnostic.value.subarray(0, 1024)) : "",
        }));
        const response = fail(`Archive download failed: HTTP ${upstream.status}`, upstream.status === 429 ? 429 : 502);
        const retry = upstream.headers.get("Retry-After");
        if (retry || upstream.status === 429) response.headers.set("Retry-After", retry || "60");
        return response;
      }
      if (Number(upstream.headers.get("Content-Length")) > MAX_BYTES) {
        await upstream.body?.cancel();
        return fail("Archive file exceeds 32 MiB limit", 413);
      }
      const reader = upstream.body?.getReader();
      if (!reader) return fail("Empty archive response", 502);
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) {
          await reader.cancel();
          return fail("Archive file exceeds 32 MiB limit", 413);
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return new Response(bytes, { headers: {
        ...headers, "Content-Type": "application/octet-stream",
        "Cache-Control": "public, max-age=86400",
      } });
    }
    return fail("Archive redirect limit exceeded", 502);
  } catch {
    return fail(controller.signal.aborted ? "Archive download timed out or cancelled" : "Archive request failed", controller.signal.aborted ? 504 : 502);
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", abort);
  }
}
