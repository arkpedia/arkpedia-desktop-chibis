import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChibiStage } from './components/operators/ChibiStage';
import catalogue from './catalogue.json';
import limits from '../electron/limits.json';
import type { ChibiModel } from './lib/operators/chibi';
import { chibiActivities, chooseChibiTap } from './lib/operators/chibiRoutine';
import { FURNITURE, furnitureBox } from './lib/operators/furniture';
import './style.css';
import ownershipNotice from '../public/NOTICE.txt?raw';
import appLicense from '../public/LICENSE.txt?raw';
import thirdPartyNotices from '../public/THIRD-PARTY-NOTICES.txt?raw';

type Region = { x:number; y:number; width:number; height:number };
type Settings = { alwaysOnTop:boolean; followSpaces:boolean; clickChibis:boolean; walkHorizontal:boolean; walkVertical:boolean; lockToScreen:boolean; rememberChibis:boolean };
type Area = Region & { primary?: boolean };
type Entry = { id:string; name:string; model:ChibiModel };
type Pet = { id:number; entry:Entry };
declare global { interface Window { companion?: {
  regions: (r: Region[]) => void; dragging: (value:boolean) => void; hover: (value:boolean) => void; minimize: () => void; quit: () => void;
  onSettings: (callback:(value:Settings)=>void) => ()=>void; requestSettings: () => void; setSetting: (key:keyof Settings, value:boolean) => void;
  onDisplays: (callback:(value:Area[])=>void) => ()=>void; requestDisplays: () => void;
  addChibi: (entry:Entry) => void; onAdded: (callback:(entry:Entry)=>void) => ()=>void; onClear: (callback:()=>void) => ()=>void;
  clearChibis: () => void; reportCount: (count:number) => void; onCount: (callback:(count:number)=>void) => ()=>void; requestCount: () => void;
  saveChibis: (ids:string[]) => void; getChibis: () => void; onChibis: (callback:(ids:string[])=>void) => ()=>void;
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

/** What a chibi does while it stands still: sit or sleep most of the time, a special once in a
 * while, otherwise plain idle. */
const chooseRest=(animations:{name:string;duration:number}[])=>{
  const acts=chibiActivities(animations);
  const pick=<T,>(list:T[])=>list[Math.floor(Math.random()*list.length)];
  const roll=Math.random();
  if (roll<.35&&acts.sit.length){const p=pick(acts.sit);return {activity:'sit' as const,clip:p.name,loop:true,duration:6000+Math.random()*9000};}
  if (roll<.55&&acts.sleep.length){const p=pick(acts.sleep);return {activity:'sleep' as const,clip:p.name,loop:true,duration:12000+Math.random()*12000};}
  if (roll<.72&&acts.special.length){const p=pick(acts.special);return {activity:'special' as const,clip:p.name,loop:false,duration:Math.max(900,p.duration*1000)};}
  return {activity:'idle' as const,clip:'',loop:true,duration:2200+Math.random()*2600};
};

function Walker({ pet, remove, settings, displays }: {pet:Pet;remove:()=>void;settings:Settings|null;displays:Area[]}) {
  const stage = useContext(StageContext);
  const [size,setSize]=useState(150), [paused,setPaused]=useState(false), [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
  const [reaction,setReaction]=useState(''), [sequence,setSequence]=useState(0), [rest,setRest]=useState<'sit'|'sleep'|null>(null);
  const node=useRef<HTMLDivElement>(null), state=useRef({x:Math.random()*Math.max(1,innerWidth-220),y:Math.max(0,innerHeight-210),targetX:Math.random()*Math.max(1,innerWidth-220),targetY:Math.max(0,innerHeight-210),wait:0,resting:false});
  const drag=useRef<{x:number;y:number;startX:number;startY:number;moved:boolean}|null>(null), config=useRef({size,paused,reaction,walkHorizontal:true,walkVertical:false,lockToScreen:true,displays:[] as Area[]}); config.current={size,paused,reaction,walkHorizontal:settings?.walkHorizontal??true,walkVertical:settings?.walkVertical??false,lockToScreen:settings?.lockToScreen!==false,displays};
  // Read by the stage every frame; mutated here without re-rendering.
  const control=useRef({moving:true,flipped:false,reaction:'',sequence:0,pose:'',poseLoop:true}); control.current.reaction=reaction; control.current.sequence=sequence;
  const animations=useRef<{name:string;duration:number}[]>([]), firstTap=useRef(true), spawned=useRef(false), furniture=useRef<HTMLImageElement>(null), restKind=useRef<'sit'|'sleep'|null>(null); restKind.current=rest;
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
        if (s.resting) {
          // The rest is over: stand up, then pick somewhere new to walk to.
          s.resting=false; m.pose=''; setRest(null);
          const next=pickTarget(areas,home,c.lockToScreen,width,height);
          s.targetX=c.walkHorizontal?next.x:s.x;
          s.targetY=c.walkVertical?next.y:s.y;
          m.moving=false;
        } else if (distance<3) {
          const chosen=chooseRest(animations.current);
          s.resting=true; m.pose=chosen.clip; m.poseLoop=chosen.loop;
          setRest(chosen.activity==='sit'||chosen.activity==='sleep'?chosen.activity:null);
          s.wait=now+chosen.duration; m.moving=false;
        } else {
          // One speed along the path, so a diagonal walk is not faster than a straight one.
          const step=Math.min(distance,dt*38);
          s.x+=dx/distance*step; s.y+=dy/distance*step;
          m.moving=true; if (dx) m.flipped=dx<0;
        }
      } else m.moving=false;
      s.x=Math.max(0,Math.min(innerWidth-width,s.x));s.y=Math.max(0,Math.min(innerHeight-height,s.y));
      if(node.current){node.current.style.left=`${s.x}px`;node.current.style.top=`${s.y}px`;}
      const kind=restKind.current, seat=furniture.current;
      if(kind&&seat){const box=furnitureBox(width,kind);seat.style.left=`${s.x}px`;seat.style.top=`${s.y+box.top}px`;seat.style.width=`${box.width}px`;seat.style.height=`${box.height}px`;seat.style.transform=m.flipped?'scaleX(-1)':'';}
      frame=requestAnimationFrame(step);
    };
    // A drag released outside the window never reaches the element's pointerup.
    const endDrag=()=>{if(drag.current){drag.current=null;window.companion?.dragging(false);}};
    window.addEventListener('pointerup',endDrag);window.addEventListener('pointercancel',endDrag);window.addEventListener('blur',endDrag);
    frame=requestAnimationFrame(step);return()=>{cancelAnimationFrame(frame);endDrag();window.removeEventListener('pointerup',endDrag);window.removeEventListener('pointercancel',endDrag);window.removeEventListener('blur',endDrag);};
  },[]);
  function tap(){const next=chooseChibiTap(animations.current,firstTap.current);firstTap.current=false;if(next){setReaction(next.clip);setSequence(n=>n+1);}}
  // When clicks pass through chibis they stop being interactive, so main never takes the mouse.
  return <>
    {rest&&<img className="furniture" ref={furniture} src={FURNITURE[rest].image} alt="" aria-hidden="true" draggable={false}
      style={{maskImage:`url(${FURNITURE[rest].mask})`,WebkitMaskImage:`url(${FURNITURE[rest].mask})`}}/>}
    <div className={`pet${settings?.clickChibis?'':' interactive'}`} ref={node} style={{width:size,height:size*1.125}} role="group" aria-label={`${pet.entry.name} desktop chibi`} tabIndex={0} title="Tap to interact · Drag to move"
    onPointerDown={e=>{if(e.button!==0||(e.target as Element).closest('button'))return;e.preventDefault();setRest(null);restKind.current=null;control.current.pose='';const parent=node.current!;parent.focus();parent.setPointerCapture(e.pointerId);drag.current={x:e.clientX-state.current.x,y:e.clientY-state.current.y,startX:e.clientX,startY:e.clientY,moved:false};window.companion?.dragging(true);}}
    onPointerMove={e=>{const d=drag.current;if(!d)return;d.moved ||= Math.hypot(e.clientX-d.startX,e.clientY-d.startY)>5;state.current.x=e.clientX-d.x;state.current.y=e.clientY-d.y;}}
    onPointerUp={e=>{const d=drag.current;drag.current=null;window.companion?.dragging(false);if(d&&!d.moved)tap();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
    onPointerCancel={()=>{drag.current=null;window.companion?.dragging(false);}}
    onKeyDown={e=>{if(e.target!==e.currentTarget)return;if(e.key==='Escape')remove();if(e.key==='Enter'||e.key===' '){e.preventDefault();tap();}if(e.key.startsWith('Arrow')){e.preventDefault();setPaused(true);state.current.x+=e.key==='ArrowLeft'?-20:e.key==='ArrowRight'?20:0;state.current.y+=e.key==='ArrowUp'?-20:e.key==='ArrowDown'?20:0;}}}>
    {status==='error'?<p role="status">This chibi could not load. Remove it and try again.</p>:status==='loading'?<p role="status">Loading chibi…</p>:null}
    <div className="pet-controls"><button aria-label="Smaller" disabled={size<=80} onClick={()=>setSize(n=>Math.max(80,n-20))}>−</button><button aria-label={paused?'Resume':'Pause'} onClick={()=>setPaused(v=>!v)}>{paused?'▶':'Ⅱ'}</button><button aria-label="Larger" disabled={size>=300} onClick={()=>setSize(n=>Math.min(300,n+20))}>+</button><button aria-label="Remove chibi" onClick={remove}>×</button></div>
    </div>
  </>;
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
  <fieldset className="modes"><legend>Desktop</legend>
    <label><input type="checkbox" checked={settings.rememberChibis} onChange={()=>toggle('rememberChibis')}/><span>Remember my chibis<small>They come back the next time you open the app</small></span></label>
  </fieldset>
  </>;
}

function Credits(){
  return <section className="credits" aria-label="About and credits">
    <h2>About & credits</h2>
    <p>Arkpedia Chibis is an unofficial, noncommercial Arknights fan project, made for fun. Free to use, with no paid features.</p>
    <p>Arknights characters, artwork and animations belong to Hypergryph, Yostar and their respective rights holders. This app is not affiliated with or endorsed by them.</p>
    <details><summary>Ownership, credits & rights contact</summary><pre>{ownershipNotice}</pre></details>
    <details><summary>Application license</summary><pre>{appLicense}</pre></details>
    <details><summary>Third-party software licenses</summary><pre>{thirdPartyNotices}</pre></details>
  </section>;
}

/** The transparent, click-through window the chibis live in. No picker, no launcher. */
function Overlay(){
  const [pets,setPets]=useState<Pet[]>([]),[settings,setSettings]=useState<Settings|null>(null),[displays,setDisplays]=useState<Area[]>([]),[stage,setStage]=useState<ChibiStage|null>(null);
  const next=useRef(0),canvas=useRef<HTMLCanvasElement>(null),hydrated=useRef(false);
  useEffect(()=>{const created=new ChibiStage(canvas.current!);setStage(created);return()=>created.dispose();},[]);
  useEffect(()=>{const off=window.companion?.onSettings(setSettings);window.companion?.requestSettings();return off;},[]);
  useEffect(()=>{const off=window.companion?.onDisplays(setDisplays);window.companion?.requestDisplays();return off;},[]);
  useEffect(()=>{const off=window.companion?.onAdded(entry=>setPets(rows=>rows.length>=MAX_CHIBIS?rows:[...rows,{id:++next.current,entry}]));return off;},[]);
  useEffect(()=>{const off=window.companion?.onClear(()=>setPets([]));return off;},[]);
  useEffect(()=>{
    const off=window.companion?.onChibis(ids=>{
      hydrated.current=true;
      const restored=ids.map(id=>[...catalogue as unknown as Entry[]].find(row=>row.id===id)).filter((row):row is Entry=>!!row);
      setPets(rows=>{
        const seen=new Set(rows.map(row=>row.entry.id));
        const extra=restored.filter(row=>!seen.has(row.id)).slice(0,Math.max(0,MAX_CHIBIS-rows.length));
        return [...rows,...extra.map(entry=>({id:++next.current,entry}))];
      });
    });
    window.companion?.getChibis();
    return off;
  },[]);
  useEffect(()=>{if(hydrated.current)window.companion?.saveChibis(pets.map(pet=>pet.entry.id));},[pets]);
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
  const [query,setQuery]=useState(''),[settings,setSettings]=useState<Settings|null>(null),[count,setCount]=useState(0),[view,setView]=useState<'list'|'settings'>('list');
  useEffect(()=>{const off=window.companion?.onSettings(setSettings);window.companion?.requestSettings();return off;},[]);
  useEffect(()=>{const off=window.companion?.onCount(setCount);window.companion?.requestCount();return off;},[]);
  const entries=catalogue as unknown as Entry[];
  const matches=entries.filter(row=>row.name.toLowerCase().includes(query.toLowerCase())).slice(0,60);
  const full=count>=MAX_CHIBIS;
  const settingsView=view==='settings';
  return <main className="panel">
    <header>
      <div><small>ARKPEDIA · DEV PREVIEW</small><h1>{settingsView?'Settings':'Desktop chibis'}</h1></div>
      <button className="icon" aria-label={settingsView?'Back to the chibi list':'Settings'} title={settingsView?'Back to the chibi list':'Settings'} onClick={()=>setView(settingsView?'list':'settings')}>{settingsView?'←':'⚙'}</button>
    </header>
    {settingsView
      ? <section className="settings">
          <Modes settings={settings}/>
          <button className="danger" onClick={()=>window.companion?.clearChibis()}>Remove every chibi from the desktop</button>
          <Credits/>
        </section>
      : <>
          <input aria-label="Search chibis" placeholder="Search operator or outfit…" value={query} onChange={e=>setQuery(e.target.value)} />
          <div className="choices" aria-label="Available chibis">{matches.map(entry=><button key={entry.id} disabled={full} onClick={()=>window.companion?.addChibi(entry)}><span>{entry.name}</span><b>+</b></button>)}</div>
        </>}
    <footer><span>{count?`${count} of ${MAX_CHIBIS} on your desktop`:'No chibis yet'}{full?' · Limit reached':''}</span><span>Unofficial fan project</span></footer>
  </main>;
}

createRoot(document.getElementById('root')!).render(role==='panel'?<Panel/>:<Overlay/>);
