export type OpenBrushToolId =
  | "free-paint"
  | "eraser"
  | "straightedge"
  | "mirror"
  | "grid-snap"
  | "color-picker"
  | "brush-picker";

export type OpenBrushToolSamplingMode = "none" | "freehand" | "straightedge";
export type OpenBrushToolMirrorMode = "none" | "x";
export type OpenBrushToolSnapMode = "none" | "grid";

export interface OpenBrushToolDescriptor {
  id: OpenBrushToolId;
  label: string;
  status: string;
  paints: boolean;
  erases: boolean;
  samplingMode: OpenBrushToolSamplingMode;
  mirrorMode: OpenBrushToolMirrorMode;
  snapMode: OpenBrushToolSnapMode;
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
