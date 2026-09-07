import { expect, it } from "vitest";
import { tiltProxyUrl } from "./tilt-proxy-url";

it("routes archive URLs through the local development proxy", () => {
  const url = "https://web.archive.org/web/20250101010101id_/https://poly.googleusercontent.com/downloads/test.tilt";
  expect(tiltProxyUrl(url)).toBe(`/api/tilt-proxy?url=${encodeURIComponent(url)}`);
});
it("leaves CORS-enabled download hosts untouched", () => {
  const url = "https://s3.us-east-005.backblazeb2.com/icosa-gallery/test.tilt";
  expect(tiltProxyUrl(url)).toBe(url);
});
