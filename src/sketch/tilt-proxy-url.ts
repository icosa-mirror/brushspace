export function tiltProxyUrl(url: string): string {
  if (new URL(url).hostname !== "web.archive.org") return url;
  const endpoint = import.meta.env.VITE_TILT_PROXY_URL || (import.meta.env.DEV
    ? "/api/tilt-proxy"
    : "https://brushspace-tilt-proxy.icosa-gallery-ltd.workers.dev/api/tilt-proxy");
  return `${endpoint}?url=${encodeURIComponent(url)}`;
}
