import {useEffect,useState} from 'react';
import type { LibraryState } from './lib/operators/library';
export type UpdateState = {status:string;current:string;version?:string;installable:boolean;message:string;percent?:number};
export type Services = {loginSupported:boolean;windowEdgesSupported?:boolean;error?:string};
export function DesktopTools({library,selected}:{library:LibraryState;selected:string[]}){
  const [updates,setUpdates]=useState<UpdateState>();
  useEffect(()=>{const api=window.companion;if(!api)return;const off=api.onUpdates(setUpdates);api.requestUpdates();return off;},[]);
  return <>
    <fieldset className="modes"><legend>Offline model library</legend>
      <p>{library.downloaded.length} models downloaded · {(library.bytes/1024/1024).toFixed(1)} MB of 1 GB</p>
      <p>Choose models using the checkboxes in the catalogue. Downloaded models are available without internet. Import a folder containing a model-pack manifest, or export your downloads.</p>
      <div className="tool-actions">
        <button disabled={library.busy||!selected.length} onClick={()=>window.companion?.downloadModels(selected)}>Download selected ({selected.length})</button>
        <button disabled={library.busy} onClick={()=>window.companion?.importModels()}>Import model pack</button>
        <button disabled={library.busy||!library.downloaded.length} onClick={()=>window.companion?.exportModels()}>Export downloaded pack</button>
        <button disabled={library.busy} onClick={()=>{if(confirm('Clear downloaded cache? Imported packs and your active chibis will remain. Other models will need internet to load again.'))window.companion?.clearDownloads();}}>Clear downloaded cache</button>
      </div>
      {library.busy&&<p role="status">Working… {library.total>0?`${library.completed} / ${library.total} files`:''}</p>}
      {library.error&&<p role="alert">{library.error}</p>}
      {library.entries.length>0&&<details><summary>Imported packs ({new Set(library.entries.map(row=>row.id.split(':')[1])).size})</summary>{library.entries.filter((row,i,rows)=>rows.findIndex(other=>other.id.split(':')[1]===row.id.split(':')[1])===i).map(row=><div className="library-shortcut" key={row.id}><span>{row.name}</span><button disabled={library.busy} onClick={()=>{if(confirm('Remove this entire imported pack from the library? Active companions remain until you remove them.'))window.companion?.removePack(row.id);}}>Remove pack</button></div>)}</details>}
    </fieldset>
    <fieldset className="modes"><legend>App updates</legend>
      <p>Installed version: {updates?.current??'…'}</p>
      <p role="status">{updates?.message??'Connecting to the app…'}</p>
      {updates?.status==='downloading'&&<progress aria-label="Update download" max={100} value={updates.percent??0}/>}
      <div className="tool-actions">
        <button disabled={!updates||['checking','downloading','ready','installing'].includes(updates.status)} onClick={()=>window.companion?.updateAction('check')}>Check for updates</button>
        {updates?.installable&&updates.status==='available'&&<button onClick={()=>window.companion?.updateAction('download')}>Download {updates.version}</button>}
        {updates?.status==='ready'&&<button onClick={()=>window.companion?.updateAction('install')}>Restart and install</button>}
        <button onClick={()=>window.companion?.updateAction('open')}>Open download page</button>
      </div>
    </fieldset>
  </>;
}
