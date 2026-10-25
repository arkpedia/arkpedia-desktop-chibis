export type Surface = { x:number; y:number; width:number; height:number };
export const frameDue = (now:number, previous:number, fps:number) => now - previous >= 1000 / fps - .5;

/** Land only on a surface crossed from above; dragging never snaps a pet upward. */
export function fall(y:number, velocity:number, dt:number, x:number, width:number, height:number, floor:number, surfaces:Surface[]) {
  const speed = Math.min(1200, velocity + 1300 * dt);
  const next = y + speed * dt, feet = y + height;
  const tops = surfaces.filter(r => x + width * .7 > r.x && x + width * .3 < r.x + r.width && feet <= r.y + 2 && next + height >= r.y).map(r=>r.y);
  const ground = Math.min(floor, ...tops);
  return next + height >= ground ? {y:ground-height,velocity:0,grounded:true} : {y:next,velocity:speed,grounded:false};
}
