export interface DrawingPinPosition {
  x: number;
  y: number;
}

export interface DrawingPinBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

const finitePoint = (point: DrawingPinPosition | null | undefined): point is DrawingPinPosition =>
  Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y));

const usableBounds = (bounds: DrawingPinBounds | null | undefined): bounds is DrawingPinBounds =>
  Boolean(bounds && [bounds.left, bounds.top, bounds.width, bounds.height].every(Number.isFinite)
    && bounds.width > 0 && bounds.height > 0);

export function clampDrawingPinPosition(position: DrawingPinPosition | null | undefined): DrawingPinPosition | null {
  if (!finitePoint(position)) return null;
  return { x: Math.max(0, Math.min(1, position.x)), y: Math.max(0, Math.min(1, position.y)) };
}

export function drawingPinPositionFromClient(point: DrawingPinPosition, bounds: DrawingPinBounds): DrawingPinPosition | null {
  if (!finitePoint(point) || !usableBounds(bounds)) return null;
  return clampDrawingPinPosition({ x: (point.x - bounds.left) / bounds.width, y: (point.y - bounds.top) / bounds.height });
}

// Keep the grab offset instead of snapping the pin centre to the pointer. Read
// the live image bounds so zoom, responsive layout and scrolling stay accurate.
export function getDraggedPinPosition(
  startPosition: DrawingPinPosition,
  initialPoint: DrawingPinPosition,
  currentPoint: DrawingPinPosition,
  initialBounds: DrawingPinBounds,
  currentBounds: DrawingPinBounds,
): DrawingPinPosition | null {
  if (!finitePoint(startPosition) || !finitePoint(initialPoint) || !finitePoint(currentPoint)
    || !usableBounds(initialBounds) || !usableBounds(currentBounds)) return null;
  return drawingPinPositionFromClient({
    x: initialBounds.left + startPosition.x * initialBounds.width + currentPoint.x - initialPoint.x,
    y: initialBounds.top + startPosition.y * initialBounds.height + currentPoint.y - initialPoint.y,
  }, currentBounds);
}
