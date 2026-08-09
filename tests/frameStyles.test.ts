import { describe, it, expect } from 'vitest';
import {
  FRAME_OPTIONS,
  FRAME_LABELS,
  FRAME_STYLES,
  ACTIVE_FRAME_STYLE,
  getFrameStyle,
  isFrameStyleId,
  computePlayerPhotoMetrics,
  FrameStyleId,
} from '../src/constants/frameStyles';

describe('frame styles', () => {
  it('covers all options and labels', () => {
    expect(FRAME_OPTIONS).toEqual(['none', 'simple', 'rounded', 'premium']);
    for (const id of FRAME_OPTIONS) {
      expect(FRAME_LABELS[id]).toBeTruthy();
      expect(FRAME_STYLES[id]).toBeTruthy();
    }
    expect(ACTIVE_FRAME_STYLE).toBe('rounded');
  });

  it('never crops or deforms the photo (contain, no stretch/cover)', () => {
    for (const id of FRAME_OPTIONS) {
      expect(FRAME_STYLES[id].image.resizeMode).toBe('contain');
      expect(getFrameStyle(id).image.resizeMode).toBe('contain');
    }
  });

  it('validates frame ids', () => {
    expect(isFrameStyleId('rounded')).toBe(true);
    expect(isFrameStyleId('none')).toBe(true);
    expect(isFrameStyleId('circular')).toBe(false);
    expect(isFrameStyleId(null)).toBe(false);
    expect(isFrameStyleId(undefined)).toBe(false);
    expect(isFrameStyleId(42)).toBe(false);
    expect(isFrameStyleId('')).toBe(false);
  });

  it('unknown frame ids fall back to "none" without crashing', () => {
    const fs = getFrameStyle('nope' as FrameStyleId);
    expect(fs.image.resizeMode).toBe('contain');
    expect(fs.image.borderWidth).toBe(0);
  });

  describe('computePlayerPhotoMetrics — the photo must always fit the frame', () => {
    const sizes = [48, 56, 90, 140, 240, 320];

    it('inner image never exceeds the frame and always has pixels', () => {
      for (const id of FRAME_OPTIONS) {
        for (const size of sizes) {
          const m = computePlayerPhotoMetrics(size, id);
          expect(m.innerSize).toBeGreaterThanOrEqual(1);
          expect(m.innerSize).toBeLessThanOrEqual(size);
        }
      }
    });

    it('the circle (rounded) radius is exactly half the inner size', () => {
      for (const size of sizes) {
        const m = computePlayerPhotoMetrics(size, 'rounded');
        expect(m.radius).toBe(m.innerSize / 2);
      }
    });

    it('wrapper padding and border are subtracted from the photo area (no clipping)', () => {
      for (const size of [140, 240]) {
        const plain = computePlayerPhotoMetrics(size, 'none');
        expect(plain.innerSize).toBe(size); // no wrapper, no border

        const premium = computePlayerPhotoMetrics(size, 'premium');
        // 6px wrapper padding * 2 sides
        expect(premium.wrapperPadding).toBe(12);
        expect(premium.innerSize).toBe(size - 12);

        const simple = computePlayerPhotoMetrics(size, 'simple');
        expect(simple.frameBorder).toBe(4);
        expect(simple.innerSize).toBe(size - 4);
      }
    });

    it('tiny sizes never collapse to zero or negative', () => {
      for (const id of FRAME_OPTIONS) {
        const m = computePlayerPhotoMetrics(1, id);
        expect(m.innerSize).toBeGreaterThanOrEqual(1);
      }
    });
  });
});