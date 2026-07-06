export function formatOpenBrushSizeMeters(sizeMeters: number): string {
  if (!Number.isFinite(sizeMeters) || sizeMeters <= 0) {
    return "0.0 mm";
  }
  if (sizeMeters < 0.01) {
    return `${(sizeMeters * 1000).toFixed(1)} mm`;
  }
  if (sizeMeters < 1) {
    return `${(sizeMeters * 100).toFixed(1)} cm`;
  }
  return `${sizeMeters.toFixed(2)} m`;
}
