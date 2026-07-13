import { assetUrl } from "../app/asset-url.js";

export const ICOSA_SKETCH_ASSETS_REVISION =
  "ba885b119d435fa591d2fe1c90feb14e39c432d5";
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
