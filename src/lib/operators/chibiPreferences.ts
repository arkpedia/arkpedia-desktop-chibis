export interface ChibiPreferences {
  pose: string; loop: boolean; furniture: boolean; props: boolean;
  fixed: boolean; flipped: boolean; size: number; offset: number;
  position?: { x: number; y: number };
}
export const DEFAULT_CHIBI_PREFERENCES: ChibiPreferences = {
  pose: '', loop: true, furniture: true, props: true, fixed: false, flipped: false, size: 150, offset: 0,
};
/** Unknown animation names are resolved against the loaded model, never another outfit. */
export function selectedPose(pose: string, names: readonly string[]): string {
  return names.includes(pose) ? pose : '';
}
export function manualActivity(pose: string): 'sit' | 'sleep' | null {
  return /^sit(?:[_\d].*)?$/i.test(pose) ? 'sit' : /^sleep(?:[_\d].*)?$/i.test(pose) ? 'sleep' : null;
}
/** A manual clip or fixed placement must survive wandering, gravity and timed breaks. */
export function holdsPosition(pose: string, fixed: boolean): boolean { return !!pose || fixed; }
