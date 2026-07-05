export type OpenBrushToolId =
  | "free-paint"
  | "eraser"
  | "straightedge"
  | "mirror"
  | "grid-snap"
  | "lazy-input"
  | "tape"
  | "stencil"
  | "color-picker"
  | "brush-picker";

export type OpenBrushToolSamplingMode =
  | "none"
  | "freehand"
  | "straightedge"
  | "tape";
export type OpenBrushToolMirrorMode = "none" | "x";
export type OpenBrushToolSnapMode = "none" | "grid";
export type OpenBrushToolLazyMode = "none" | "position";
export type OpenBrushToolStencilMode = "none" | "front-plane";

export const OPEN_BRUSH_ERASER_SIZE_RANGE = [0.1, 0.3] as const;
export const OPEN_BRUSH_DEFAULT_ERASER_RADIUS =
  (OPEN_BRUSH_ERASER_SIZE_RANGE[0] + OPEN_BRUSH_ERASER_SIZE_RANGE[1]) * 0.5;
export const OPEN_BRUSH_ERASER_SIZE_BUTTON_STEP01 = 0.05;
export const OPEN_BRUSH_ERASER_FORWARD_OFFSET = 0.05;

export interface OpenBrushEraserSize {
  size01: number;
  radius: number;
}

export function normalizeOpenBrushEraserRadius(radius: number): number {
  if (!Number.isFinite(radius)) {
    return OPEN_BRUSH_DEFAULT_ERASER_RADIUS;
  }
  return Math.min(
    OPEN_BRUSH_ERASER_SIZE_RANGE[1],
    Math.max(OPEN_BRUSH_ERASER_SIZE_RANGE[0], radius),
  );
}

export function openBrushEraserSize01ToRadius(size01: number): number {
  const normalized = normalize01(size01);
  return (
    OPEN_BRUSH_ERASER_SIZE_RANGE[0] +
    (OPEN_BRUSH_ERASER_SIZE_RANGE[1] - OPEN_BRUSH_ERASER_SIZE_RANGE[0]) *
      normalized
  );
}

export function openBrushEraserRadiusToSize01(radius: number): number {
  const range =
    OPEN_BRUSH_ERASER_SIZE_RANGE[1] - OPEN_BRUSH_ERASER_SIZE_RANGE[0];
  if (range <= 0) {
    return 1;
  }
  return normalize01(
    (normalizeOpenBrushEraserRadius(radius) - OPEN_BRUSH_ERASER_SIZE_RANGE[0]) /
      range,
  );
}

export function resolveOpenBrushEraserSizeAdjustment(
  currentRadius: number,
  delta01: number,
): OpenBrushEraserSize {
  const size01 = normalize01(
    openBrushEraserRadiusToSize01(currentRadius) + delta01,
  );
  return {
    size01,
    radius: openBrushEraserSize01ToRadius(size01),
  };
}

export interface OpenBrushToolDescriptor {
  id: OpenBrushToolId;
  label: string;
  status: string;
  paints: boolean;
  erases: boolean;
  samplingMode: OpenBrushToolSamplingMode;
  mirrorMode: OpenBrushToolMirrorMode;
  snapMode: OpenBrushToolSnapMode;
  lazyMode: OpenBrushToolLazyMode;
  stencilMode: OpenBrushToolStencilMode;
}

export const openBrushTools: readonly OpenBrushToolDescriptor[] = [
  {
    id: "free-paint",
    label: "Draw",
    status: "draw-ready",
    paints: true,
    erases: false,
    samplingMode: "freehand",
    mirrorMode: "none",
    snapMode: "none",
    lazyMode: "none",
    stencilMode: "none",
  },
  {
    id: "eraser",
    label: "Eraser",
    status: "erase-ready",
    paints: false,
    erases: true,
    samplingMode: "none",
    mirrorMode: "none",
    snapMode: "none",
    lazyMode: "none",
    stencilMode: "none",
  },
  {
    id: "straightedge",
    label: "Straightedge",
    status: "line-ready",
    paints: true,
    erases: false,
    samplingMode: "straightedge",
    mirrorMode: "none",
    snapMode: "none",
    lazyMode: "none",
    stencilMode: "none",
  },
  {
    id: "mirror",
    label: "Mirror",
    status: "mirror-ready",
    paints: true,
    erases: false,
    samplingMode: "freehand",
    mirrorMode: "x",
    snapMode: "none",
    lazyMode: "none",
    stencilMode: "none",
  },
  {
    id: "grid-snap",
    label: "Grid Snap",
    status: "grid-ready",
    paints: true,
    erases: false,
    samplingMode: "freehand",
    mirrorMode: "none",
    snapMode: "grid",
    lazyMode: "none",
    stencilMode: "none",
  },
  {
    id: "lazy-input",
    label: "Lazy Input",
    status: "lazy-ready",
    paints: true,
    erases: false,
    samplingMode: "freehand",
    mirrorMode: "none",
    snapMode: "none",
    lazyMode: "position",
    stencilMode: "none",
  },
  {
    id: "tape",
    label: "Tape",
    status: "tape-ready",
    paints: true,
    erases: false,
    samplingMode: "tape",
    mirrorMode: "none",
    snapMode: "none",
    lazyMode: "none",
    stencilMode: "none",
  },
  {
    id: "stencil",
    label: "Stencil",
    status: "stencil-ready",
    paints: true,
    erases: false,
    samplingMode: "freehand",
    mirrorMode: "none",
    snapMode: "none",
    lazyMode: "none",
    stencilMode: "front-plane",
  },
  {
    id: "color-picker",
    label: "Color Pick",
    status: "picker-pending",
    paints: false,
    erases: false,
    samplingMode: "none",
    mirrorMode: "none",
    snapMode: "none",
    lazyMode: "none",
    stencilMode: "none",
  },
  {
    id: "brush-picker",
    label: "Brush Pick",
    status: "picker-pending",
    paints: false,
    erases: false,
    samplingMode: "none",
    mirrorMode: "none",
    snapMode: "none",
    lazyMode: "none",
    stencilMode: "none",
  },
];

export function resolveOpenBrushTool(toolId: string): OpenBrushToolDescriptor {
  return (
    openBrushTools.find((tool) => tool.id === toolId) ?? openBrushTools[0]
  );
}

export function isOpenBrushToolId(toolId: string): toolId is OpenBrushToolId {
  return openBrushTools.some((tool) => tool.id === toolId);
}

export function getNextOpenBrushTool(
  toolId: string,
  offset: number,
): OpenBrushToolDescriptor {
  const currentTool = resolveOpenBrushTool(toolId);
  const currentIndex = openBrushTools.findIndex(
    (tool) => tool.id === currentTool.id,
  );
  const nextIndex =
    (currentIndex + offset + openBrushTools.length) % openBrushTools.length;
  return openBrushTools[nextIndex];
}

function normalize01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}
