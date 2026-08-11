/**
 * Viewer (view-only) mode resolution — Open Brush's no-headset entry path.
 *
 * `App.Start()` falls back to the 2D sketch viewer when
 * `!VrSdk.IsHmdInitialized()`, and `UserConfig.Flags.ForceViewOnly` pins the
 * app to view-only regardless. These helpers are the browser equivalents:
 * a URL flag plus a WebXR support probe.
 */

export interface ViewerModeResolution {
  /** Editing input is suppressed and the viewer chrome owns the screen. */
  viewOnly: boolean;
  /** Why the mode was chosen, for logging and the runtime debug panel. */
  reason: "forced" | "no-xr-support" | "collab-join" | "editing";
}

export interface ViewerModeInputs {
  /** `?view` / `?viewonly` present on the URL (Open Brush's ForceViewOnly). */
  forced: boolean;
  /** `?join=CODE` present: collab needs the editing path, so it wins. */
  joining: boolean;
  /** Result of the immersive-vr support probe. */
  xrSupported: boolean;
}

/** Reads the viewer-related flags out of a query string. */
export function readViewerModeFlags(search: string): {
  forced: boolean;
  joining: boolean;
} {
  const params = new URLSearchParams(search);
  return {
    forced: params.has("view") || params.has("viewonly"),
    joining: Boolean(params.get("join")),
  };
}

/**
 * Resolves the startup mode. Collab joins outrank the viewer flag because a
 * joined session is inherently an editing session; otherwise an explicit
 * `?view` wins, and a browser with no immersive-vr support falls back to the
 * viewer the same way Open Brush does when no HMD initializes.
 */
export function resolveViewerMode(
  inputs: ViewerModeInputs,
): ViewerModeResolution {
  if (inputs.joining) {
    return { viewOnly: false, reason: "collab-join" };
  }
  if (inputs.forced) {
    return { viewOnly: true, reason: "forced" };
  }
  if (!inputs.xrSupported) {
    return { viewOnly: true, reason: "no-xr-support" };
  }
  return { viewOnly: false, reason: "editing" };
}

/**
 * Probes immersive-vr support. Treats a throwing or missing `navigator.xr` as
 * "no headset" — the same conservative reading as `IsHmdInitialized()`.
 */
export async function probeImmersiveVrSupport(): Promise<boolean> {
  const xr = (
    navigator as Navigator & {
      xr?: { isSessionSupported?(mode: string): Promise<boolean> };
    }
  ).xr;
  if (!xr?.isSessionSupported) {
    return false;
  }
  try {
    return await xr.isSessionSupported("immersive-vr");
  } catch {
    return false;
  }
}
