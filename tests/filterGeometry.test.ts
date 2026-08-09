import { describe, it, expect } from 'vitest';
import {
  clampFaceRect,
  smoothValue,
  smoothFaceRect,
  layoutFromFace,
  fallbackLayout,
} from '../src/utils/filterGeometry';

describe('clampFaceRect', () => {
  it('rejects empty rects', () => {
    expect(clampFaceRect({ x: 0, y: 0, width: 0, height: 10 }, 360, 800)).toBeNull();
    expect(clampFaceRect(null, 360, 800)).toBeNull();
  });

  it('clamps into screen bounds', () => {
    const r = clampFaceRect({ x: -50, y: -20, width: 100, height: 100 }, 360, 800)!;
    expect(r).toEqual({ x: 0, y: 0, width: 100, height: 100 });

    const r2 = clampFaceRect({ x: 350, y: 780, width: 100, height: 100 }, 360, 800)!;
    expect(r2).toEqual({ x: 260, y: 700, width: 100, height: 100 });
  });

  it('shrinks oversized rects', () => {
    const r = clampFaceRect({ x: 0, y: 0, width: 500, height: 900 }, 360, 800)!;
    expect(r.width).toBe(360);
    expect(r.height).toBe(800);
  });
});

describe('smoothValue / smoothFaceRect', () => {
  it('interpolates linearly', () => {
    expect(smoothValue(0, 100, 0.5)).toBe(50);
    expect(smoothValue(100, 100, 0.3)).toBe(100);
  });

  it('returns target when current is not finite', () => {
    expect(smoothValue(NaN, 50, 0.5)).toBe(50);
    expect(smoothValue(Infinity, 50, 0.5)).toBe(50);
  });

  it('drops tracking when target disappears', () => {
    expect(smoothFaceRect({ x: 1, y: 1, width: 10, height: 10 }, null, 0.4)).toBeNull();
    expect(smoothFaceRect(null, null, 0.4)).toBeNull();
  });

  it('starts fresh when there is no current', () => {
    const target = { x: 10, y: 20, width: 30, height: 40 };
    expect(smoothFaceRect(null, target, 0.4)).toEqual(target);
  });

  it('smooths both rects', () => {
    const cur = { x: 0, y: 0, width: 100, height: 100 };
    const tgt = { x: 100, y: 50, width: 120, height: 80 };
    const out = smoothFaceRect(cur, tgt, 0.5);
    expect(out).toEqual({ x: 50, y: 25, width: 110, height: 90 });
  });
});

describe('layoutFromFace', () => {
  const screenW = 360;
  const screenH = 800;

  it('centers the photo horizontally on the face', () => {
    const face = { x: 130, y: 300, width: 100, height: 130 };
    const layout = layoutFromFace(face, screenW, screenH, 140);

    const faceCenterX = 130 + 50;
    expect(layout.playerZone.x + layout.playerZone.width / 2).toBeCloseTo(faceCenterX, 5);
  });

  it('places the photo ABOVE the head, not on the face', () => {
    const face = { x: 130, y: 300, width: 100, height: 130 };
    const layout = layoutFromFace(face, screenW, screenH, 140);

    // Bottom of photo must sit above the top of the face
    expect(layout.playerZone.y + layout.playerZone.height).toBeLessThan(face.y);
    // Photo should not overlap the face vertically
    expect(layout.playerZone.y + layout.playerZone.height).toBeLessThanOrEqual(face.y);
  });

  it('keeps the photo above the head when face moves', () => {
    const faceLow = { x: 130, y: 500, width: 100, height: 130 };
    const faceHigh = { x: 130, y: 150, width: 100, height: 130 };
    const layoutLow = layoutFromFace(faceLow, screenW, screenH, 140);
    const layoutHigh = layoutFromFace(faceHigh, screenW, screenH, 140);

    expect(layoutLow.playerZone.y + layoutLow.playerZone.height).toBeLessThan(faceLow.y);
    expect(layoutHigh.playerZone.y + layoutHigh.playerZone.height).toBeLessThanOrEqual(faceHigh.y);
    // Photo moves with face (not fixed)
    expect(layoutLow.playerZone.y).not.toBe(layoutHigh.playerZone.y);
  });

  it('photo size grows with face size but respects bounds', () => {
    const small = layoutFromFace({ x: 150, y: 350, width: 60, height: 80 }, screenW, screenH, 140);
    expect(small.playerSize).toBeGreaterThanOrEqual(90);

    const big = layoutFromFace({ x: 50, y: 200, width: 260, height: 400 }, screenW, screenH, 140);
    expect(big.playerZone.x).toBeGreaterThanOrEqual(0);
    expect(big.playerZone.x + big.playerSize).toBeLessThanOrEqual(screenW);
  });

  it('places multiplier strip beside the photo', () => {
    const face = { x: 130, y: 300, width: 100, height: 130 };
    const layout = layoutFromFace(face, screenW, screenH, 140);

    const photoRight = layout.playerZone.x + layout.playerSize;
    expect(layout.multiplierZone.x).toBeGreaterThanOrEqual(photoRight);

    expect(layout.multiplierZone.y).toBeGreaterThanOrEqual(0);
    expect(layout.multiplierZone.y + layout.multiplierZone.height).toBeLessThanOrEqual(screenH);
    expect(layout.multiplierZone.width).toBe(70);
  });

  it('flips multiplier to the left when face is near the right edge', () => {
    const face = { x: 250, y: 300, width: 100, height: 130 };
    const layout = layoutFromFace(face, screenW, screenH, 140);

    expect(layout.multiplierZone.x + layout.multiplierZone.width).toBeLessThanOrEqual(
      layout.playerZone.x
    );
  });

  it('keeps multiplier on screen at extreme positions', () => {
    const face = { x: 0, y: 0, width: 100, height: 130 };
    const layout = layoutFromFace(face, screenW, screenH, 140);
    expect(layout.multiplierZone.x).toBeGreaterThanOrEqual(0);
    expect(layout.multiplierZone.y).toBeGreaterThanOrEqual(0);
  });
});

describe('fallbackLayout', () => {
  it('produces a centered layout inside screen bounds', () => {
    const l = fallbackLayout(360, 800);
    expect(l.playerZone.x).toBeGreaterThanOrEqual(0);
    expect(l.playerZone.x + l.playerSize).toBeLessThanOrEqual(360);
    expect(l.multiplierZone.x).toBeGreaterThanOrEqual(0);
  });
});
