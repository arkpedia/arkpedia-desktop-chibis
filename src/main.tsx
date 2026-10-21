import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChibiStage } from './components/operators/ChibiStage';
import catalogue from './catalogue.json';
import limits from '../electron/limits.json';
import type { ChibiModel } from './lib/operators/chibi';
import { chooseChibiTap } from './lib/operators/chibiRoutine';
import './style.css';

type Region = { x:number; y:number; width:number; height:number };
type Settings = { alwaysOnTop:boolean; followSpaces:boolean; clickChibis:boolean; walkHorizontal:boolean; walkVertical:boolean; lockToScreen:boolean };
type Area = Region & { primary?: boolean };
type Entry = { id:string; name:string; model:ChibiModel };
type Pet = { id:number; entry:Entry };
declare global { interface Window { companion?: {
  regions: (r: Region[]) => void; dragging: (value:boolean) => void; hover: (value:boolean) => void; minimize: () => void; quit: () => void;
  onSettings: (callback:(value:Settings)=>void) => ()=>void; requestSettings: () => void; setSetting: (key:keyof Settings, value:boolean) => void;
  onDisplays: (callback:(value:Area[])=>void) => ()=>void; requestDisplays: () => void;
  addChibi: (entry:Entry) => void; onAdded: (callback:(entry:Entry)=>void) => ()=>void; onClear: (callback:()=>void) => ()=>void;
  clearChibis: () => void; reportCount: (count:number) => void; onCount: (callback:(count:number)=>void) => ()=>void;
} } }
/** One shared WebGL stage draws every chibi, so this is a comfort limit, not a context limit. */
export const MAX_CHIBIS = limits.maxChibis;
const StageContext = createContext<ChibiStage | null>(null);
const role = new URLSearchParams(location.search).get('role') === 'panel' ? 'panel' : 'overlay';
document.body.classList.add(`role-${role}`);
/** The display whose work area holds this point, or the nearest one if it falls in a gap. */
const areaAt=(areas:Area[],x:number,y:number):Area=>{
  const inside=areas.find(a=>x>=a.x&&x<=a.x+a.width&&y>=a.y&&y<=a.y+a.height);
  if(inside)return inside;
  return areas.reduce((best,a)=>{const dx=Math.max(a.x-x,0,x-(a.x+a.width)),dy=Math.max(a.y-y,0,y-(a.y+a.height)),d=dx*dx+dy*dy;return d<best.d?{a,d}:best;},{a:areas[0],d:Infinity}).a;
};
/** Where to wander next: inside the current screen when locked, anywhere on any screen otherwise. */
const pickTarget=(areas:Area[],locked:Area|null,lock:boolean,width:number,height:number)=>{
  const area=lock&&locked?locked:areas[Math.floor(Math.random()*areas.length)];
  return {x:area.x+Math.random()*Math.max(0,area.width-width),y:area.y+Math.random()*Math.max(0,area.height-height)};
};

function Walker({ pet, remove, settings, displays }: {pet:Pet;remove:()=>void;settings:Settings|null;displays:Area[]}) {
  const stage = useContext(StageContext);
  const [size,setSize]=useState(150), [paused,setPaused]=useState(false), [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
  const [reaction,setReaction]=useState(''), [sequence,setSequence]=useState(0);
  const node=useRef<HTMLDivElement>(null), state=useRef({x:Math.random()*Math.max(1,innerWidth-220),y:Math.max(0,innerHeight-210),targetX:Math.random()*Math.max(1,innerWidth-220),targetY:Math.max(0,innerHeight-210),wait:0});
  const drag=useRef<{x:number;y:number;startX:number;startY:number;moved:boolean}|null>(null), config=useRef({size,paused,reaction,walkHorizontal:true,walkVertical:false,lockToScreen:true,displays:[] as Area[]}); config.current={size,paused,reaction,walkHorizontal:settings?.walkHorizontal??true,walkVertical:settings?.walkVertical??false,lockToScreen:settings?.lockToScreen!==false,displays};
  // Read by the stage every frame; mutated here without re-rendering.
  const control=useRef({moving:true,flipped:false,reaction:'',sequence:0}); control.current.reaction=reaction; control.current.sequence=sequence;
  const animations=useRef<{name:string;duration:number}[]>([]), firstTap=useRef(true), spawned=useRef(false);
  useEffect(()=>{
    if(spawned.current||!displays.length)return;
    spawned.current=true;
    const s=state.current,area=displays.find(a=>a.primary)??displays[0];
    s.x=area.x+Math.random()*Math.max(1,area.width-size); s.y=area.y+area.height-size*1.125;
    s.targetX=s.x; s.targetY=s.y;
  },[displays,size]);
  useEffect(()=> {
    if (!stage) return;
    return stage.add(pet.entry.model, {
      node: () => node.current, control: () => control.current,
      ready: (names, durations) => { animations.current=names.map(name=>({name,duration:durations[name]??0})); setStatus('ready'); },
      failed: () => setStatus('error'), complete: () => setReaction(''),
    });
  },[stage,pet.entry.model]);
  useEffect(()=> {
    let frame=0,last=performance.now();
    const step=(now:number)=> {
      const dt=Math.min(.06,(now-last)/1000);last=now;
      const c=config.current,s=state.current,m=control.current,width=c.size,height=c.size*1.125;
      const areas=c.displays.length?c.displays:[{x:0,y:0,width:innerWidth,height:innerHeight}];
      // Locked: the current screen is the world. Dragging ignores the lock so a chibi can be
      // carried to another screen; walking then stays on the screen it was dropped on.
      const home=c.lockToScreen?areaAt(areas,s.x+width/2,s.y+height/2):null;
      const minX=home?home.x:0, maxX=home?home.x+home.width-width:innerWidth-width;
      const minY=home?home.y:0, maxY=home?home.y+home.height-height:innerHeight-height;
      // A disabled axis holds its position, so the target collapses onto the chibi.
      s.targetX=c.walkHorizontal?Math.max(minX,Math.min(maxX,s.targetX)):s.x;
      s.targetY=c.walkVertical?Math.max(minY,Math.min(maxY,s.targetY)):s.y;
      if (!drag.current && !c.paused && !c.reaction && now>s.wait) {
        const dx=s.targetX-s.x, dy=s.targetY-s.y, distance=Math.hypot(dx,dy);
        if (distance<3) {
          const next=pickTarget(areas,home,c.lockToScreen,width,height);
          s.targetX=c.walkHorizontal?next.x:s.x;
          s.targetY=c.walkVertical?next.y:s.y;
          s.wait=now+1500+Math.random()*2000;m.moving=false;
        } else {
          // One speed along the path, so a diagonal walk is not faster than a straight one.
          const step=Math.min(distance,dt*38);
          s.x+=dx/distance*step; s.y+=dy/distance*step;
          m.moving=true; if (dx) m.flipped=dx<0;
        }
      } else m.moving=false;
      s.x=Math.max(0,Math.min(innerWidth-width,s.x));s.y=Math.max(0,Math.min(innerHeight-height,s.y));
      if(node.current){node.current.style.left=`${s.x}px`;node.current.style.top=`${s.y}px`;}
      frame=requestAnimationFrame(step);
    };
    // A drag released outside the window never reaches the element's pointerup.
    const endDrag=()=>{if(drag.current){drag.current=null;window.companion?.dragging(false);}};
    window.addEventListener('pointerup',endDrag);window.addEventListener('pointercancel',endDrag);window.addEventListener('blur',endDrag);
    frame=requestAnimationFrame(step);return()=>{cancelAnimationFrame(frame);endDrag();window.removeEventListener('pointerup',endDrag);window.removeEventListener('pointercancel',endDrag);window.removeEventListener('blur',endDrag);};
  },[]);
  function tap(){const next=chooseChibiTap(animations.current,firstTap.current);firstTap.current=false;if(next){setReaction(next.clip);setSequence(n=>n+1);}}
  // When clicks pass through chibis they stop being interactive, so main never takes the mouse.
  return <div className={`pet${settings?.clickChibis?'':' interactive'}`} ref={node} style={{width:size,height:size*1.125}} role="group" aria-label={`${pet.entry.name} desktop chibi`} tabIndex={0} title="Tap to interact · Drag to move"
    onPointerDown={e=>{if(e.button!==0||(e.target as Element).closest('button'))return;e.preventDefault();const parent=node.current!;parent.focus();parent.setPointerCapture(e.pointerId);drag.current={x:e.clientX-state.current.x,y:e.clientY-state.current.y,startX:e.clientX,startY:e.clientY,moved:false};window.companion?.dragging(true);}}
    onPointerMove={e=>{const d=drag.current;if(!d)return;d.moved ||= Math.hypot(e.clientX-d.startX,e.clientY-d.startY)>5;state.current.x=e.clientX-d.x;state.current.y=e.clientY-d.y;}}
    onPointerUp={e=>{const d=drag.current;drag.current=null;window.companion?.dragging(false);if(d&&!d.moved)tap();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
    onPointerCancel={()=>{drag.current=null;window.companion?.dragging(false);}}
    onKeyDown={e=>{if(e.target!==e.currentTarget)return;if(e.key==='Escape')remove();if(e.key==='Enter'||e.key===' '){e.preventDefault();tap();}if(e.key.startsWith('Arrow')){e.preventDefault();setPaused(true);state.current.x+=e.key==='ArrowLeft'?-20:e.key==='ArrowRight'?20:0;state.current.y+=e.key==='ArrowUp'?-20:e.key==='ArrowDown'?20:0;}}}>
    {status==='error'?<p role="status">This chibi could not load. Remove it and try again.</p>:status==='loading'?<p role="status">Loading chibi…</p>:null}
    <div className="pet-controls"><button aria-label="Smaller" disabled={size<=80} onClick={()=>setSize(n=>Math.max(80,n-20))}>−</button><button aria-label={paused?'Resume':'Pause'} onClick={()=>setPaused(v=>!v)}>{paused?'▶':'Ⅱ'}</button><button aria-label="Larger" disabled={size>=300} onClick={()=>setSize(n=>Math.min(300,n+20))}>+</button><button aria-label="Remove chibi" onClick={remove}>×</button></div>
  </div>;
}

function Modes({settings}:{settings:Settings|null}){
  if(!settings||!window.companion)return null;
  const toggle=(key:keyof Settings)=>window.companion?.setSetting(key,!settings[key]);
  return <>
  <fieldset className="modes"><legend>Overlay</legend>
    <label><input type="checkbox" checked={settings.alwaysOnTop} onChange={()=>toggle('alwaysOnTop')}/><span>Always on top<small>Chibis stay above every window</small></span></label>
    <label><input type="checkbox" checked={settings.followSpaces} onChange={()=>toggle('followSpaces')}/><span>Follow across desktops<small>Keeps the chibis on every Space, full-screen apps included</small></span></label>
    <label><input type="checkbox" checked={settings.clickChibis} onChange={()=>toggle('clickChibis')}/><span>Clicks pass through chibis<small>Empty space always does. On: chibis are decoration</small></span></label>
  </fieldset>
  <fieldset className="modes"><legend>Walking</legend>
    <label><input type="checkbox" checked={settings.walkHorizontal} onChange={()=>toggle('walkHorizontal')}/><span>Side to side<small>Wander left and right</small></span></label>
    <label><input type="checkbox" checked={settings.walkVertical} onChange={()=>toggle('walkVertical')}/><span>Up and down<small>Both on: they wander diagonally</small></span></label>
    <label><input type="checkbox" checked={settings.lockToScreen} onChange={()=>toggle('lockToScreen')}/><span>Stay on one screen<small>Off: may wander to another display. Dragging always works</small></span></label>
  </fieldset>
  </>;
}

/** The transparent, click-through window the chibis live in. No picker, no launcher. */
function Overlay(){
  const [pets,setPets]=useState<Pet[]>([]),[settings,setSettings]=useState<Settings|null>(null),[displays,setDisplays]=useState<Area[]>([]),[stage,setStage]=useState<ChibiStage|null>(null);
  const next=useRef(0),canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{const created=new ChibiStage(canvas.current!);setStage(created);return()=>created.dispose();},[]);
  useEffect(()=>{const off=window.companion?.onSettings(setSettings);window.companion?.requestSettings();return off;},[]);
  useEffect(()=>{const off=window.companion?.onDisplays(setDisplays);window.companion?.requestDisplays();return off;},[]);
  useEffect(()=>{const off=window.companion?.onAdded(entry=>setPets(rows=>rows.length>=MAX_CHIBIS?rows:[...rows,{id:++next.current,entry}]));return off;},[]);
  useEffect(()=>{const off=window.companion?.onClear(()=>setPets([]));return off;},[]);
  useEffect(()=>{window.companion?.reportCount(pets.length);},[pets.length]);
  useEffect(()=>{
    // Only .interactive boxes: a chibi's controls sit inside its own box and stop being
    // interactive altogether when clicks pass through chibis.
    const publish=()=>window.companion?.regions(Array.from(document.querySelectorAll('.interactive')).map(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};}));
    // Forwarded mousemove (setIgnoreMouseEvents forward) reports a chibi under the cursor at once.
    let over=false;
    const move=(e:MouseEvent)=>{const hit=!!document.elementFromPoint(e.clientX,e.clientY)?.closest('.interactive');if(hit!==over){over=hit;publish();window.companion?.hover(hit);}};
    publish();const id=setInterval(publish,80);document.addEventListener('mousemove',move);
    return()=>{clearInterval(id);document.removeEventListener('mousemove',move);};
  },[]);
  return <><canvas className="stage" ref={canvas} aria-hidden="true"/>
  <StageContext.Provider value={stage}>{pets.map(pet=><Walker key={pet.id} pet={pet} settings={settings} displays={displays} remove={()=>setPets(rows=>rows.filter(row=>row.id!==pet.id))}/>)}</StageContext.Provider></>;
}

/** The picker: a normal window that can be minimized without touching the chibis. */
function Panel(){
  const [query,setQuery]=useState(''),[settings,setSettings]=useState<Settings|null>(null),[count,setCount]=useState(0);
  useEffect(()=>{const off=window.companion?.onSettings(setSettings);window.companion?.requestSettings();return off;},[]);
  useEffect(()=>{const off=window.companion?.onCount(setCount);return off;},[]);
  const entries=catalogue as unknown as Entry[];
  const matches=entries.filter(row=>row.name.toLowerCase().includes(query.toLowerCase())).slice(0,60);
  const full=count>=MAX_CHIBIS;
  return <main className="panel">
    <header><div><small>ARKPEDIA · DEV PREVIEW</small><h1>Desktop chibis</h1></div><button className="minimize" aria-label="Minimize the picker" title="Minimize the picker" onClick={()=>window.companion?.minimize()}>−</button></header>
    <p>The chibis live in their own window and keep walking when this one is minimized. Drag them anywhere; tap for a reaction.</p>
    <input aria-label="Search chibis" placeholder="Search operator or outfit…" value={query} onChange={e=>setQuery(e.target.value)} />
    <div className="choices" aria-label="Available chibis">{matches.map(entry=><button key={entry.id} disabled={full} onClick={()=>window.companion?.addChibi(entry)}><span>{entry.name}</span><b>+</b></button>)}</div>
    <Modes settings={settings}/>
    <footer><span>{count?`${count} of ${MAX_CHIBIS} on your desktop`:'No chibis yet'}{full?' · Limit reached':''}</span><div className="footer-actions"><button onClick={()=>window.companion?.clearChibis()}>Clear all</button><button onClick={()=>window.companion?.quit()}>Quit</button></div></footer>
  </main>;
}

createRoot(document.getElementById('root')!).render(role==='panel'?<Panel/>:<Overlay/>);
