// One uniform camera keeps bricks square and touch input aligned on every screen.
// Physics and saved positions remain in the same 416 × 660 world on all devices.
export function fitViewport(width, height, pixelRatio = 1) {
  width = Math.max(1, Number(width) || 1);
  height = Math.max(1, Number(height) || 1);
  const scale = Math.min(width / 416, height / 660);
  const ratio = Math.max(1, Math.min(3, Number(pixelRatio) || 1));
  return {width, height, scale, ratio, x: Math.max(0, (width - 416 * scale) / 2), y: Math.max(0, (height - 660 * scale) / 2),
    pixelsWide: Math.round(width * ratio), pixelsHigh: Math.round(height * ratio)};
}
export function worldX(clientX, left, viewport) {
  return Math.max(0, Math.min(416, (clientX - left - viewport.x) / viewport.scale));
}
