import { LayoutConfig, TextBlock, ZoneConfig } from '../types';

export interface FaceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function clampFaceRect(face: FaceRect | null, screenW: number, screenH: number): FaceRect | null {
  if (!face || face.width <= 0 || face.height <= 0) return null;
  const w = Math.min(face.width, screenW);
  const h = Math.min(face.height, screenH);
  const x = Math.max(0, Math.min(face.x, screenW - w));
  const y = Math.max(0, Math.min(face.y, screenH - h));
  return { x, y, width: w, height: h };
}

export function smoothValue(current: number, target: number, alpha: number): number {
  if (!Number.isFinite(current)) return target;
  return current + (target - current) * alpha;
}

export function smoothFaceRect(current: FaceRect | null, target: FaceRect | null, alpha: number): FaceRect | null {
  if (!target) return null;
  if (!current) return target;
  return {
    x: smoothValue(current.x, target.x, alpha),
    y: smoothValue(current.y, target.y, alpha),
    width: smoothValue(current.width, target.width, alpha),
    height: smoothValue(current.height, target.height, alpha),
  };
}

/**
 * Computes the layout zones that follow a detected face (screen coordinates).
 * The player photo is positioned ABOVE the head (offset from the top of the face),
 * the multiplier strip sits beside the player photo.
 */
export function layoutFromFace(
  face: FaceRect,
  screenW: number,
  screenH: number,
  configuredPlayerSize: number,
  multiplierWidth = 70
): LayoutConfig {
  const faceCenterX = face.x + face.width / 2;
  const faceTopY = face.y;

  let photoSize = Math.round(Math.min(Math.max(face.width * 1.7, 90), Math.max(configuredPlayerSize * 1.2, 150)));

  // Small gap above the head so the photo sits close to the head without covering it.
  const gapAboveHead = Math.round(face.height * 0.05);
  const availableSpaceAbove = faceTopY - gapAboveHead - 8;
  if (photoSize > availableSpaceAbove) {
    photoSize = Math.max(60, Math.round(availableSpaceAbove));
  }

  const photoBottom = faceTopY - gapAboveHead;
  const playerZoneY = clamp(photoBottom - photoSize, 8, Math.max(8, photoBottom - 8));

  const playerZone: ZoneConfig = {
    x: clamp(faceCenterX - photoSize / 2, 0, screenW - photoSize),
    y: playerZoneY,
    width: photoSize,
    height: photoSize,
  };

  const stripHeight = Math.round(Math.min(photoSize * 1.6, screenH * 0.7));
  const photoRight = playerZone.x + photoSize;
  const stripOnRight = photoRight + 12 + multiplierWidth <= screenW;
  const stripX = stripOnRight
    ? photoRight + 12
    : Math.max(8, playerZone.x - multiplierWidth - 12);

  const stripCenterY = playerZoneY + photoSize / 2;
  const multiplierZone: ZoneConfig = {
    x: clamp(stripX, 8, screenW - multiplierWidth),
    y: clamp(stripCenterY - stripHeight / 2, 8, screenH - stripHeight),
    width: multiplierWidth,
    height: stripHeight,
  };

  return { playerZone, multiplierZone, playerSize: photoSize };
}

export function fallbackLayout(screenW: number, screenH: number): LayoutConfig {
  return {
    playerZone: { x: screenW / 2 - 75, y: 80, width: 150, height: 150 },
    multiplierZone: { x: 10, y: Math.round(screenH * 0.35), width: 70, height: Math.round(screenH * 0.45) },
    playerSize: 140,
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
