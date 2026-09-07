import type { Plugin } from "vite";
import { handleTiltProxy } from "../workers/tilt-proxy/handler";

/** Run the same restricted proxy locally, with no Cloudflare login needed. */
export function tiltProxyDev(): Plugin {
  return {
    name: "brushspace-tilt-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname !== "/api/tilt-proxy") return next();
        const controller = new AbortController();
        const cancel = () => controller.abort();
        res.once("close", cancel);
        try {
          const response = await handleTiltProxy(new Request(url, {
            method: req.method, signal: controller.signal,
          }));
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch {
          res.statusCode = 502;
          res.end("Archive proxy failed");
        } finally {
          res.off("close", cancel);
        }
      });
    },
  };
}
