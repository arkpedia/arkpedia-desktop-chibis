// The furniture a resting chibi uses. Both pieces and their silhouette masks come from
// arkpedia-sd-assets at one immutable commit, the same files the website renders.
const ROOT = 'https://raw.githubusercontent.com/arkpedia/arkpedia-sd-assets/cfdcc05d9f7f96ecd8de45042e412b657aec21b0/furniture/';

export interface Furniture { name: string; image: string; mask: string; top: number }
/** `top` and the height below are fractions of the chibi box's width, matching the website's
 * 160x180 chibi box: a 160x118 image 56 px (chair) or 62 px (bed) from the top. */
export const FURNITURE: Record<'sit' | 'sleep', Furniture> = {
  sit: { name: 'Black Retro Chair', image: ROOT + 'furni_s2_chair_l_01.png', mask: ROOT + 'sit-mask.svg', top: 56 / 160 },
  sleep: { name: 'Porcelain Bed', image: ROOT + 'furni_s1_bed_01.png', mask: ROOT + 'sleep-mask.svg', top: 62 / 160 },
};
export const FURNITURE_HEIGHT = 118 / 160;

/** CSS box for the furniture that belongs under a chibi of this width. */
export function furnitureBox(size: number, activity: 'sit' | 'sleep'): { width: number; height: number; top: number } {
  const width = Math.max(1, size);
  return { width, height: width * FURNITURE_HEIGHT, top: width * FURNITURE[activity].top };
}
