import { assetUrl } from "../app/asset-url.js";

export const ICOSA_SKETCH_ASSETS_REVISION =
  "1bb64bc7de12f1821670e48714f9caa19a5718b0";
export const PINNED_ICOSA_BRUSH_ASSET_BASE_URL =
  `https://cdn.jsdelivr.net/gh/icosa-foundation/icosa-sketch-assets@${ICOSA_SKETCH_ASSETS_REVISION}/brushes/`;

interface BrushAssetEnvironment {
  MODE?: string;
  VITE_ICOSA_BRUSH_ASSET_BASE_URL?: string;
}

export function resolveBrushAssetBaseUrl(
  environment: BrushAssetEnvironment =
    (import.meta as unknown as { env?: BrushAssetEnvironment }).env ?? {},
): string {
  const configured = environment.VITE_ICOSA_BRUSH_ASSET_BASE_URL?.trim();
  if (configured) {
    return withTrailingSlash(configured);
  }
  if (environment.MODE?.includes("mirror")) {
    return assetUrl("/openbrush/icosa-brushes/");
  }
  return PINNED_ICOSA_BRUSH_ASSET_BASE_URL;
}

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
