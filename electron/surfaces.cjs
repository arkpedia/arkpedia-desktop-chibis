const {spawn}=require('node:child_process');
const path=require('node:path');
function visibleSurfaces(rectangles) {
  const covers=[],result=[];
  for(const rect of rectangles.slice(0,256)){
    if(!rect||!['x','y','width','height'].every(k=>Number.isFinite(rect[k]))||rect.width<1||rect.height<1)continue;
    let spans=[[rect.x,rect.x+rect.width]];
    for(const cover of covers){
      if(cover.y>rect.y+3||cover.y+cover.height<rect.y+3)continue;
      spans=spans.flatMap(([left,right])=>cover.x>=right||cover.x+cover.width<=left?[[left,right]]:[[left,Math.max(left,cover.x)],[Math.min(right,cover.x+cover.width),right]].filter(([a,b])=>b-a>30));
    }
    for(const [left,right] of spans)if(right-left>30)result.push({x:left,y:rect.y,width:right-left,height:1});
    covers.push(rect);
  }
  return result.slice(0,512);
}
function createSurfaces({screen,changed,failed}){
  let child,buffer='';
  return {
    start(){
      if(child||process.platform!=='win32')return;
      const script=path.join(__dirname.replace('app.asar','app.asar.unpacked'),'helpers/window-surfaces.ps1');
      const running=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-File',script,String(process.pid)],{windowsHide:true,stdio:['ignore','pipe','ignore']});child=running;
      running.stdout.on('data',chunk=>{
        if(child!==running)return;
        buffer+=chunk.toString();if(buffer.length>1024*1024){buffer='';return;}
        let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{const value=JSON.parse(line);if(!Array.isArray(value))continue;const rects=value.map(r=>screen.screenToDipRect(null,r));changed(visibleSurfaces(rects));}catch{}}
      });
      running.on('error',()=>{if(child===running){child=undefined;failed();}});
      running.on('exit',()=>{if(child===running){child=undefined;failed();}});
    },
    stop(){const running=child;child=undefined;buffer='';running?.kill();changed([]);},
  };
}
module.exports={createSurfaces,visibleSurfaces};
