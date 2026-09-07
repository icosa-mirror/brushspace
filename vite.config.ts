import { iwsdkDev } from "@iwsdk/vite-plugin-dev";

import { compileUIKit } from "@iwsdk/vite-plugin-uikitml";
import { defineConfig } from "vite";
import mkcert from "vite-plugin-mkcert";
import { tiltProxyDev } from "./scripts/tilt-proxy-vite";

export default defineConfig(({ mode }) => ({
  plugins: [
    tiltProxyDev(),
    ...(mode.endsWith("https") ? [mkcert()] : []),
    iwsdkDev({
      emulator: {
        device: "metaQuest3",
      },
      ai: { mode: "collaborate" },
      verbose: true,
    }),

    compileUIKit({ sourceDir: "ui", outputDir: "public/ui", verbose: true }),
  ],
  server: { host: "0.0.0.0", port: 8081, open: true },
  build: {
    outDir: "dist",
    sourcemap: process.env.NODE_ENV !== "production",
    target: "esnext",
    rollupOptions: { input: "./index.html" },
  },
  esbuild: { target: "esnext" },
  optimizeDeps: {
    exclude: ["@babylonjs/havok"],
    esbuildOptions: { target: "esnext" },
  },
  publicDir: "public",
  base: "./",
}));
