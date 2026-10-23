import { describe, expect, it } from 'vitest';
import { drawingPinPositionFromClient, getDraggedPinPosition } from '../src/data/drawing-pin';

describe('drawing pin geometry uses the rendered image bounds', () => {
  const bounds = { left: 100, top: 80, width: 1000, height: 600 };

  it('keeps the pointer grab offset so grabbing the label does not jump the pin', () => {
    const position = getDraggedPinPosition({ x: .25, y: .4 }, { x: 390, y: 300 }, { x: 490, y: 360 }, bounds, bounds);
    expect(position.x).toBeCloseTo(.35);
    expect(position.y).toBeCloseTo(.5);
  });

  it('normalizes movement against actual zoomed dimensions', () => {
    const zoomed = { ...bounds, width: 2000, height: 1200 };
    const position = getDraggedPinPosition({ x: .25, y: .4 }, { x: 630, y: 530 }, { x: 730, y: 590 }, zoomed, zoomed);
    expect(position.x).toBeCloseTo(.3);
    expect(position.y).toBeCloseTo(.45);
  });

  it('accounts for a scrolled drawing when the pointer stays still', () => {
    const scrolled = { ...bounds, left: 0, top: 20 };
    const position = getDraggedPinPosition({ x: .25, y: .4 }, { x: 390, y: 300 }, { x: 390, y: 300 }, bounds, scrolled);
    expect(position.x).toBeCloseTo(.35);
    expect(position.y).toBeCloseTo(.5);
  });

  it('clamps to image edges and rejects unavailable image geometry', () => {
    expect(drawingPinPositionFromClient({ x: -100, y: 900 }, bounds)).toEqual({ x: 0, y: 1 });
    expect(getDraggedPinPosition({ x: .25, y: .4 }, { x: 350, y: 320 }, { x: 5000, y: -5000 }, bounds, bounds)).toEqual({ x: 1, y: 0 });
    expect(drawingPinPositionFromClient({ x: 300, y: 200 }, { ...bounds, width: 0 })).toBeNull();
    expect(getDraggedPinPosition({ x: .25, y: .4 }, { x: 350, y: 320 }, { x: 400, y: 380 }, bounds, { ...bounds, height: 0 })).toBeNull();
  });
});
