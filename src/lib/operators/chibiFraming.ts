// Pure framing math for the shared chibi stage. No imports, so node tests load it directly.

/** Skeleton-space rectangle (Spine's y axis points up). */
export interface ChibiBounds { x: number; y: number; width: number; height: number }
/** A hit box in CSS pixels, as getBoundingClientRect reports it. */
export interface ChibiBox { left: number; top: number; width: number; height: number }
export interface ChibiPlacement { x: number; y: number; scaleX: number; scaleY: number }

/** Room around the visible idle pose, as a multiple of its size. */
export const CHIBI_FRAME_MARGIN = 1.4;
const FALLBACK: ChibiBounds = { x: -100, y: 0, width: 200, height: 300 };

export function finiteBounds(bounds: ChibiBounds): ChibiBounds {
  return [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) && bounds.width > 0 && bounds.height > 0 ? bounds : FALLBACK;
}

/** CSS pixels per skeleton unit. It depends only on the idle pose's HEIGHT, measured once when
 * the model loads, and on the hit box's height, never on the clip playing or on how far a pose's
 * props reach sideways. Fitting the width as well made every chibi with a wide weapon, cape or
 * banner visibly smaller than the rest; art is allowed to overhang the hit box instead. */
export function chibiScale(_idle: ChibiBounds, _boxWidth: number, boxHeight: number): number {
  const { height } = finiteBounds(_idle);
  return Math.max(1, boxHeight) / Math.max(height * CHIBI_FRAME_MARGIN, 1);
}

/** Where to put the skeleton root so the idle pose's centre sits at the hit box's centre, in a
 * world whose units are CSS pixels with y up and whose origin is the viewport's bottom-left
 * corner. A flipped chibi mirrors around the same centre. */
export function chibiPlacement(idle: ChibiBounds, box: ChibiBox, viewportHeight: number, flipped: boolean): ChibiPlacement {
  const bounds = finiteBounds(idle), scale = chibiScale(bounds, box.width, box.height), facing = flipped ? -1 : 1;
  const centreX = bounds.x + bounds.width / 2, centreY = bounds.y + bounds.height / 2;
  const boxX = box.left + box.width / 2, boxY = viewportHeight - (box.top + box.height / 2);
  return { x: boxX - centreX * scale * facing, y: boxY - centreY * scale, scaleX: scale * facing, scaleY: scale };
}

/** Which clip a desktop chibi plays: walking while it moves, a requested reaction once, otherwise idle. */
export function chibiClip(names: readonly string[], idle: string, walk: string | undefined, moving: boolean, reaction: string): { clip: string; loop: boolean } {
  if (moving && walk) return { clip: walk, loop: true };
  if (reaction && names.includes(reaction)) return { clip: reaction, loop: false };
  return { clip: idle, loop: !/die|retreat|start|begin|end/i.test(idle) };
}
