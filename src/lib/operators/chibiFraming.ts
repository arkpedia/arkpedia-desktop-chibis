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

/** Which clip a desktop chibi plays: walking while it moves, a requested reaction once, a resting
 * pose (sit, sleep, special) while it rests, otherwise idle. */
export function chibiClip(names: readonly string[], idle: string, walk: string | undefined, moving: boolean, reaction: string, pose = '', poseLoop = true): { clip: string; loop: boolean } {
  if (moving && walk) return { clip: walk, loop: true };
  if (reaction && names.includes(reaction)) return { clip: reaction, loop: false };
  if (pose && names.includes(pose)) return { clip: pose, loop: poseLoop };
  return { clip: idle, loop: !/die|retreat|start|begin|end/i.test(idle) };
}

/** Slot indices in the main connected body; detached scenery remains optional artwork. */
export function chibiBodyFrame(parts: { index: number; bounds: ChibiBounds }[]): { bounds: ChibiBounds; props: number[] } | undefined {
  const valid = parts.filter(({bounds:b}) => [b.x,b.y,b.width,b.height].every(Number.isFinite) && b.width>0 && b.height>0);
  const remaining=[...valid];
  let best:typeof valid=[];
  while(remaining.length){
    const group=[remaining.pop()!];
    for(let i=0;i<group.length;i++)for(let j=remaining.length-1;j>=0;j--){
      const a=group[i].bounds,b=remaining[j].bounds;
      if(a.x<=b.x+b.width&&a.x+a.width>=b.x&&a.y<=b.y+b.height&&a.y+a.height>=b.y)group.push(remaining.splice(j,1)[0]);
    }
    if(group.length>best.length)best=group;
  }
  if(!best.length)return undefined;
  const union=(rows:typeof valid):ChibiBounds=>{
    const x=Math.min(...rows.map(p=>p.bounds.x)), y=Math.min(...rows.map(p=>p.bounds.y));
    return {x,y,width:Math.max(...rows.map(p=>p.bounds.x+p.bounds.width))-x,height:Math.max(...rows.map(p=>p.bounds.y+p.bounds.height))-y};
  };
  const body=union(best), full=union(valid), keep=new Set(best.map(p=>p.index));
  return {bounds:Math.max(full.width/body.width,full.height/body.height)>1.5?body:full,props:valid.filter(p=>!keep.has(p.index)).map(p=>p.index)};
}

/** Other clips may put the character itself in a prop attachment; retain their authored art. */
export function hideDetachedScenery(show: boolean, clip: string, idle: string, walk?: string): boolean {
  return !show && (clip === idle || clip === walk);
}
