import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChibiStage } from './components/operators/ChibiStage';
import catalogue from './catalogue.json';
import limits from '../electron/limits.json';
import type { ChibiModel } from './lib/operators/chibi';
import { chooseChibiTap } from './lib/operators/chibiRoutine';
import './style.css';

type Region = { x:number; y:number; width:number; height:number };
type Settings = { alwaysOnTop:boolean; clickThrough:boolean };
declare global { interface Window { companion?: {
  regions: (r: Region[]) => void; dragging: (value:boolean) => void; hover: (value:boolean) => void; minimize: () => void; quit: () => void;
  onShow: (callback:()=>void) => ()=>void; onSettings: (callback:(value:Settings)=>void) => ()=>void; requestSettings: () => void; setSetting: (key:keyof Settings, value:boolean) => void;
} } }
type Entry = { id:string; name:string; model:ChibiModel };
type Pet = { id:number; entry:Entry };
/** One shared WebGL stage draws every chibi, so this is a comfort limit, not a context limit. */
export const MAX_CHIBIS = limits.maxChibis;
const StageContext = createContext<ChibiStage | null>(null);

function Walker({ pet, remove }: {pet:Pet;remove:()=>void}) {
  const stage = useContext(StageContext);
  const [size,setSize]=useState(150), [paused,setPaused]=useState(false), [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
  const [reaction,setReaction]=useState(''), [sequence,setSequence]=useState(0);
  const node=useRef<HTMLDivElement>(null), state=useRef({x:Math.random()*Math.max(1,innerWidth-220),y:Math.max(0,innerHeight-210),target:Math.random()*innerWidth,wait:0});
  const drag=useRef<{x:number;y:number;startX:number;startY:number;moved:boolean}|null>(null), config=useRef({size,paused,reaction}); config.current={size,paused,reaction};
  // Read by the stage every frame; mutated here without re-rendering.
  const control=useRef({moving:true,flipped:false,reaction:'',sequence:0}); control.current.reaction=reaction; control.current.sequence=sequence;
  const animations=useRef<{name:string;duration:number}[]>([]), firstTap=useRef(true);
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
      s.target=Math.max(0,Math.min(innerWidth-width,s.target));
      if (!drag.current && !c.paused && !c.reaction && now>s.wait) {
        const dx=s.target-s.x;
        if (Math.abs(dx)<3) {s.target=Math.random()*Math.max(1,innerWidth-width);s.wait=now+1500+Math.random()*2000;m.moving=false;}
        else {s.x+=Math.sign(dx)*Math.min(Math.abs(dx),dt*38);m.moving=true;m.flipped=dx<0;}
      } else m.moving=false;
      s.x=Math.max(0,Math.min(innerWidth-width,s.x));s.y=Math.max(0,Math.min(innerHeight-height,s.y));
      if(node.current){node.current.style.left=`${s.x}px`;node.current.style.top=`${s.y}px`;}
      frame=requestAnimationFrame(step);
    };
    frame=requestAnimationFrame(step);return()=>{cancelAnimationFrame(frame);if(drag.current)window.companion?.dragging(false);};
  },[]);
  function tap(){const next=chooseChibiTap(animations.current,firstTap.current);firstTap.current=false;if(next){setReaction(next.clip);setSequence(n=>n+1);}}
  return <div className="pet interactive" ref={node} style={{width:size,height:size*1.125}} role="group" aria-label={`${pet.entry.name} desktop chibi`} tabIndex={0} title="Tap to interact · Drag to move"
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
  return <fieldset className="modes"><legend>Overlay</legend>
    <label><input type="checkbox" checked={settings.alwaysOnTop} onChange={()=>toggle('alwaysOnTop')}/><span>Always on top<small>Chibis stay above every window</small></span></label>
    <label><input type="checkbox" checked={settings.clickThrough} onChange={()=>toggle('clickThrough')}/><span>Click-through<small>Clicks pass to apps below, except on a chibi</small></span></label>
  </fieldset>;
}
function App(){
 const [open,setOpen]=useState(true),[query,setQuery]=useState(''),[pets,setPets]=useState<Pet[]>([]),[settings,setSettings]=useState<Settings|null>(null),[stage,setStage]=useState<ChibiStage|null>(null),next=useRef(0),canvas=useRef<HTMLCanvasElement>(null);
 const entries=catalogue as Entry[]; const matches=entries.filter(row=>row.name.toLowerCase().includes(query.toLowerCase())).slice(0,40);
 const full=pets.length>=MAX_CHIBIS;
 useEffect(()=>{const created=new ChibiStage(canvas.current!);setStage(created);return()=>created.dispose();},[]);
 useEffect(()=>window.companion?.onShow(()=>setOpen(true)),[]);
 useEffect(()=>{const off=window.companion?.onSettings(setSettings);window.companion?.requestSettings();return off;},[]);
 useEffect(()=>{
  // Only .interactive boxes: a chibi's controls sit inside its own box.
  const publish=()=>window.companion?.regions(Array.from(document.querySelectorAll('.interactive')).map(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};}));
  // Forwarded mousemove (setIgnoreMouseEvents forward) reports a chibi under the cursor at once.
  let over=false;
  const move=(e:MouseEvent)=>{const hit=!!document.elementFromPoint(e.clientX,e.clientY)?.closest('.interactive');if(hit!==over){over=hit;publish();window.companion?.hover(hit);}};
  publish();const id=setInterval(publish,80);document.addEventListener('mousemove',move);
  return()=>{clearInterval(id);document.removeEventListener('mousemove',move);};
 },[]);
 return <><canvas className="stage" ref={canvas} aria-hidden="true"/>
 {open?<aside className="panel interactive"><header><div><small>ARKPEDIA · DEV PREVIEW</small><h1>Desktop chibis</h1></div><button className="minimize" aria-label="Minimize companions" title="Minimize companions" onClick={()=>window.companion?.minimize()}>−</button></header><p>Add a companion. Drag to move, tap to interact.</p><input aria-label="Search chibis" placeholder="Search operator or outfit…" value={query} onChange={e=>setQuery(e.target.value)} />
 <div className="choices" aria-label="Available chibis">{matches.map(entry=><button key={entry.id} disabled={full} onClick={()=>setPets(p=>p.length>=MAX_CHIBIS?p:[...p,{id:++next.current,entry}])}><span>{entry.name}</span><b>+</b></button>)}</div>
 <Modes settings={settings}/>
 <footer><span>{pets.length?`${pets.length} of ${MAX_CHIBIS} on your desktop`:'Your desktop is ready'}{full?' · Limit reached':''}</span><div className="footer-actions"><button onClick={()=>setOpen(false)}>Hide picker</button><button onClick={()=>window.companion?.quit()}>Quit</button></div></footer></aside>:<div className="launcher interactive"><button onClick={()=>setOpen(true)}>Chibis +</button><button className="minimize" aria-label="Minimize companions" title="Minimize companions" onClick={()=>window.companion?.minimize()}>−</button></div>}
 <StageContext.Provider value={stage}>{pets.map(pet=><Walker key={pet.id} pet={pet} remove={()=>setPets(p=>p.filter(row=>row.id!==pet.id))}/>)}</StageContext.Provider>
 </>;
}
createRoot(document.getElementById('root')!).render(<App/>);
