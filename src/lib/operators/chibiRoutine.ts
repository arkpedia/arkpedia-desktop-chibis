export interface ChibiAnimation { name: string; duration: number }
export type ChibiActivity = 'sit' | 'sleep' | 'idle' | 'special' | 'tap' | 'trust-tap' | 'animation' | 'walking';
export interface ChibiBreak { activity: ChibiActivity; clip: string; duration: number; once?: boolean }

/** Building models use Relax/Interact; battle-only fallbacks may have Idle/Special. */
export function chibiActivities(animations: readonly ChibiAnimation[]) {
  const find = (pattern: RegExp) => animations.filter(pose => pose.duration > 0 && pattern.test(pose.name));
  return {
    sit: find(/^sit(?:[_\d].*)?$/i),
    sleep: find(/^sleep(?:[_\d].*)?$/i),
    idle: find(/^(?:relax|idle)(?:[_\d].*)?$/i),
    special: find(/^(?:interact|special)(?:[_\d].*)?$/i),
  };
}

/** Default is a static setup pose in base models; Relax is their normal idle loop. */
export function chibiIdleAnimation(animations: readonly ChibiAnimation[]): string | undefined {
  const idle = chibiActivities(animations).idle;
  return (idle.find(pose => /^idle$/i.test(pose.name))
    ?? idle.find(pose => /^relax$/i.test(pose.name)) ?? idle[0]
    // Some enemy skeletons prefix their native tracks with a form/facing letter.
    ?? animations.find(pose => /^(?:[a-z]_)?idle(?:[_\d].*)?$/i.test(pose.name)))?.name;
}

/** Native base models use Interact for a tap and Special for an outfit's trust reaction.
 * Models with only one reaction share it; never substitute a static or battle pose. */
export function chooseChibiTap(animations: readonly ChibiAnimation[], firstTap: boolean, random = Math.random): ChibiBreak | null {
  const find = (name: string) => animations.find(pose => pose.duration > 0 && pose.name.toLowerCase() === name.toLowerCase())
    ?? animations.find(pose => pose.duration > 0 && new RegExp(`^${name}[_\\d]`, 'i').test(pose.name));
  const normal = find('Interact'), trust = find('Special');
  if (!normal && !trust) return null;
  const trustTap = firstTap || random() < .5;
  const chosen = (trustTap ? trust ?? normal : normal ?? trust)!;
  return { activity: trustTap ? 'trust-tap' : 'tap', clip: chosen.name, duration: chosen.duration * 1000 };
}

export const isChibiTap = (activity?: ChibiActivity) => activity === 'tap' || activity === 'trust-tap';
