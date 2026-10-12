import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ChibiCanvas from './components/operators/ChibiCanvas';
import catalogue from './catalogue.json';
import type { ChibiModel } from './lib/operators/chibi';
import { chooseChibiTap } from './lib/operators/chibiRoutine';
import './style.css';

declare global { interface Window { companion?: { regions: (r: {x:number;y:number;width:number;height:number}[]) => void; dragging: (value:boolean) => void; quit: () => void; onShow: (callback:()=>void) => ()=>void } } }
type Entry = { id:string; name:string; model:ChibiModel };
type Pet = { id:number; entry:Entry };
const noop = () => {};
function Walker({ pet, remove }: {pet:Pet;remove:()=>void}) {
  const [size,setSize]=useState(150), [paused,setPaused]=useState(false), [moving,setMoving]=useState(true), [flipped,setFlipped]=useState(false);
  const [reaction,setReaction]=useState(''), [sequence,setSequence]=useState(0);
  const node=useRef<HTMLDivElement>(null), state=useRef({x:Math.random()*Math.max(1,innerWidth-220),y:Math.max(0,innerHeight-210),target:Math.random()*innerWidth,wait:0});
  const drag=useRef<{x:number;y:number;startX:number;startY:number;moved:boolean}|null>(null), config=useRef({size,paused,reaction}); config.current={size,paused,reaction};
  const animations=useRef<{name:string;duration:number}[]>([]), firstTap=useRef(true);
  const animReady=useRef((names:string[],durations:Record<string,number>={})=> {animations.current=names.map(name=>({name,duration:durations[name]??0}));}).current;
  useEffect(()=> {
    let frame=0,last=performance.now();
    const step=(now:number)=> {
      const dt=Math.min(.06,(now-last)/1000);last=now;
      const c=config.current,s=state.current,width=c.size,height=c.size*1.125;
      s.target=Math.max(0,Math.min(innerWidth-width,s.target));
      if (!drag.current && !c.paused && !c.reaction && now>s.wait) {
        const dx=s.target-s.x;
        if (Math.abs(dx)<3) {s.target=Math.random()*Math.max(1,innerWidth-width);s.wait=now+1500+Math.random()*2000;setMoving(false);}
        else {s.x+=Math.sign(dx)*Math.min(Math.abs(dx),dt*38);setMoving(true);setFlipped(dx<0);}
      } else setMoving(false);
      s.x=Math.max(0,Math.min(innerWidth-width,s.x));s.y=Math.max(0,Math.min(innerHeight-height,s.y));
      if(node.current){node.current.style.left=`${s.x}px`;node.current.style.top=`${s.y}px`;}
      frame=requestAnimationFrame(step);
    };
    frame=requestAnimationFrame(step);return()=>{cancelAnimationFrame(frame);if(drag.current)window.companion?.dragging(false);};
  },[]);
  function tap(){const next=chooseChibiTap(animations.current,firstTap.current);firstTap.current=false;if(next){setReaction(next.clip);setSequence(n=>n+1);}}
  return <div className="pet interactive" ref={node} style={{width:size,height:size*1.125}} role="group" aria-label={`${pet.entry.name} desktop chibi`} tabIndex={0}
    onPointerMove={e=>{const d=drag.current;if(!d)return;d.moved ||= Math.hypot(e.clientX-d.startX,e.clientY-d.startY)>5;state.current.x=e.clientX-d.x;state.current.y=e.clientY-d.y;}}
    onPointerUp={e=>{const d=drag.current;drag.current=null;window.companion?.dragging(false);if(d&&!d.moved)tap();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
    onPointerCancel={()=>{drag.current=null;window.companion?.dragging(false);}}
    onKeyDown={e=>{if(e.target!==e.currentTarget)return;if(e.key==='Escape')remove();if(e.key==='Enter'||e.key===' '){e.preventDefault();tap();}if(e.key.startsWith('Arrow')){e.preventDefault();setPaused(true);state.current.x+=e.key==='ArrowLeft'?-20:e.key==='ArrowRight'?20:0;state.current.y+=e.key==='ArrowUp'?-20:e.key==='ArrowDown'?20:0;}}}>
    <ChibiCanvas model={pet.entry.model} label={pet.entry.name} animation={reaction} animationSequence={sequence} once={!!reaction} onAnimationChange={noop} onAnimationsChange={animReady} onAnimationComplete={()=>setReaction('')} paused={false} moving={moving} flipped={flipped} roaming
      onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();const parent=node.current!;parent.focus();parent.setPointerCapture(e.pointerId);drag.current={x:e.clientX-state.current.x,y:e.clientY-state.current.y,startX:e.clientX,startY:e.clientY,moved:false};window.companion?.dragging(true);}} />
    <div className="pet-controls"><button aria-label="Smaller" disabled={size<=80} onClick={()=>setSize(n=>Math.max(80,n-20))}>−</button><button aria-label={paused?'Resume':'Pause'} onClick={()=>setPaused(v=>!v)}>{paused?'▶':'Ⅱ'}</button><button aria-label="Larger" disabled={size>=300} onClick={()=>setSize(n=>Math.min(300,n+20))}>+</button><button aria-label="Remove chibi" onClick={remove}>×</button></div>
  </div>;
}
function App(){
 const [open,setOpen]=useState(true),[query,setQuery]=useState(''),[pets,setPets]=useState<Pet[]>([]),next=useRef(0);
 const entries=catalogue as Entry[]; const matches=entries.filter(row=>row.name.toLowerCase().includes(query.toLowerCase())).slice(0,40);
 useEffect(()=>window.companion?.onShow(()=>setOpen(true)),[]);
 useEffect(()=>{const publish=()=>window.companion?.regions(Array.from(document.querySelectorAll('.interactive, .pet-controls')).filter(el=>!el.classList.contains('pet-controls')||Number(getComputedStyle(el).opacity)>.1).map(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};}));publish();const id=setInterval(publish,80);return()=>clearInterval(id);},[]);
 return <>{open?<aside className="panel interactive"><header><div><small>ARKPEDIA · DEV PREVIEW</small><h1>Desktop chibis</h1></div><button aria-label="Hide controls" onClick={()=>setOpen(false)}>−</button></header><p>Add a companion. Drag to move, tap to interact.</p><input aria-label="Search chibis" placeholder="Search operator or outfit…" value={query} onChange={e=>setQuery(e.target.value)} />
 <div className="choices" aria-label="Available chibis">{matches.map(entry=><button key={entry.id} disabled={pets.length>=8} onClick={()=>setPets(p=>[...p,{id:++next.current,entry}])}><span>{entry.name}</span><b>+</b></button>)}</div>
 <footer><span>{pets.length?`${pets.length} on your desktop`:'Your desktop is ready'}{pets.length>=8?' · Limit reached':''}</span><button onClick={()=>window.companion?.quit()}>Quit</button></footer></aside>:<button className="launcher interactive" onClick={()=>setOpen(true)}>Chibis +</button>}
 {pets.map(pet=><Walker key={pet.id} pet={pet} remove={()=>setPets(p=>p.filter(row=>row.id!==pet.id))}/>)}
 </>;
}
createRoot(document.getElementById('root')!).render(<App/>);
