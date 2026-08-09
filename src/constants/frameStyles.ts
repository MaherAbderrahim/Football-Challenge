import { COLORS } from './theme';

export type FrameStyleId = 'none' | 'simple' | 'rounded' | 'premium';

export const ACTIVE_FRAME_STYLE: FrameStyleId = 'rounded';
export const FRAME_OPTIONS: FrameStyleId[] = ['none', 'simple', 'rounded', 'premium'];
export const FRAME_LABELS: Record<FrameStyleId, string> = {
  none: 'Aucun',
  simple: 'Simple',
  rounded: 'Rond',
  premium: 'Premium',
};
export const FRAME_STORAGE_KEY = 'filter_frame_style';

export interface FrameImageStyle {
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  resizeMode?: 'cover' | 'contain' | 'stretch';
  backgroundColor?: string;
}

export interface FrameWrapperStyle {
  padding?: number;
  backgroundColor?: string;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  shadowColor?: string;
  shadowOffset?: { width: number; height: number };
  shadowOpacity?: number;
  shadowRadius?: number;
  elevation?: number;
}

export interface FrameStyle {
  image: FrameImageStyle;
  wrapper?: FrameWrapperStyle;
}

// Transparent backdrop: the camera preview shows around the photo instead
// of a dark panel (no black background on/around the player photos).
const FRAME_PHOTO_BG = 'transparent';

export const FRAME_STYLES: Record<FrameStyleId, FrameStyle> = {
  // No border, clean and modern — the photo is contained (never cropped).
  none: {
    image: {
      borderRadius: 0,
      borderWidth: 0,
      resizeMode: 'contain',
      backgroundColor: FRAME_PHOTO_BG,
    },
  },
  // Thin simple border.
  simple: {
    image: {
      borderRadius: 8,
      borderWidth: 2,
      borderColor: COLORS.white,
      resizeMode: 'contain',
      backgroundColor: FRAME_PHOTO_BG,
    },
  },
  // Fully rounded (circle) frame.
  rounded: {
    image: {
      borderRadius: 999,
      borderWidth: 3,
      borderColor: COLORS.white,
      resizeMode: 'contain',
      backgroundColor: FRAME_PHOTO_BG,
    },
  },
  // More worked frame, sober for IG/TikTok.
  premium: {
    wrapper: {
      padding: 6,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderRadius: 16,
      borderWidth: 2,
      borderColor: COLORS.primary,
      shadowColor: COLORS.black,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.5,
      shadowRadius: 8,
      elevation: 8,
    },
    image: {
      borderRadius: 12,
      borderWidth: 0,
      resizeMode: 'contain',
      backgroundColor: FRAME_PHOTO_BG,
    },
  },
};

export function getFrameStyle(id: FrameStyleId): FrameStyle {
  return FRAME_STYLES[id] ?? FRAME_STYLES.none;
}

export function isFrameStyleId(value: unknown): value is FrameStyleId {
  return typeof value === 'string' && (FRAME_OPTIONS as string[]).includes(value);
}

export interface PlayerPhotoMetrics {
  wrapperPadding: number;
  frameBorder: number;
  innerSize: number;
  radius: number | undefined;
}

/**
 * Computes the exact on-screen size of the image inside a frame.
 * The photo stays fully visible (contain), keeps its proportions and is
 * never cropped: innerSize accounts for the wrapper padding and the frame
 * border, and the circle radius is derived from innerSize.
 */
export function computePlayerPhotoMetrics(
  size: number,
  frameStyleId: FrameStyleId
): PlayerPhotoMetrics {
  const fs = getFrameStyle(frameStyleId);
  const wrapperPadding = (fs.wrapper?.padding ?? 0) * 2;
  const frameBorder = (fs.image.borderWidth ?? 0) * 2;
  const innerSize = Math.max(1, size - wrapperPadding - frameBorder);
  const radius =
    (fs.image.borderRadius ?? 0) >= 999 ? innerSize / 2 : fs.image.borderRadius;
  return { wrapperPadding, frameBorder, innerSize, radius };
}