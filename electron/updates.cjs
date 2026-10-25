const RELEASES = 'https://github.com/arkpedia/arkpedia-desktop-chibis/releases/latest';
function createUpdates({app, net, shell, makeUpdater, platform=process.platform, env=process.env, windowsInstalled=true, changed=()=>{}}) {
  const installable = !!app.isPackaged && ((platform==='win32'&&windowsInstalled) || (platform==='linux' && !!env.APPIMAGE));
  let state = {status:'idle',current:app.getVersion?.()??'0.0.0',installable,message:installable?'Updates download only when you choose.':platform==='darwin'?'This development build uses manual updates on macOS.':'Use the download page to update this build.'};
  let updater;
  const publish = patch => { state={...state,...patch}; changed(state); };
  const getUpdater = () => {
    if (updater) return updater;
    updater=makeUpdater(); updater.autoDownload=false; updater.autoInstallOnAppQuit=false; updater.allowPrerelease=false; updater.allowDowngrade=false;
    updater.setFeedURL({provider:'github',owner:'arkpedia',repo:'arkpedia-desktop-chibis'});
    updater.on('update-available',info=>publish({status:'available',version:info.version,message:`Version ${info.version} is available.`}));
    updater.on('update-not-available',()=>publish({status:'current',message:'You have the latest version.'}));
    updater.on('download-progress',p=>publish({status:'downloading',percent:Number.isFinite(p.percent)?Math.max(0,Math.min(100,Math.round(p.percent))):0,message:'Downloading update…'}));
    updater.on('update-downloaded',()=>publish({status:'ready',message:'Update downloaded. Restart when you are ready to install.'}));
    updater.on('error',()=>publish({status:'error',message:'Update failed. Try again or use the download page.'}));
    return updater;
  };
  return {
    get:()=>({...state}),
    async check() {
      if (['checking','downloading','ready','installing'].includes(state.status)) return;
      publish({status:'checking',message:'Checking for updates…'});
      try {
        if (installable) await getUpdater().checkForUpdates();
        else {
          const response=await net.fetch('https://api.github.com/repos/arkpedia/arkpedia-desktop-chibis/releases/latest',{headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(20000)});
          if (!response.ok) throw Error('Update service unavailable');
          const info=await response.json(), version=String(info.tag_name??'').replace(/^v/,'');
          if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('Invalid version');
          const current=state.current.split('.').map(Number), next=version.split('.').map(Number);
          const newer=next.some((part,i)=>part>current[i] && next.slice(0,i).every((p,j)=>p===current[j]));
          publish({status:newer?'available':'current',version,message:newer?`Version ${version} is available. Use the download page to install it.`:'You have the latest version.'});
        }
      } catch { publish({status:'error',message:'Could not check for updates. Check your connection and try again.'}); }
    },
    async download() {
      if (!installable||state.status!=='available') return;
      publish({status:'downloading',percent:0,message:'Downloading update…'});
      try { await getUpdater().downloadUpdate(); } catch { publish({status:'error',message:'Download failed. Try checking again or use the download page.'}); }
    },
    install() { if(installable&&state.status==='ready'){ publish({status:'installing',message:'Restarting to install…'}); try{getUpdater().quitAndInstall(false,true);}catch{publish({status:'error',message:'Could not start the installer. Use the download page to update.'});} } },
    open:()=>shell.openExternal(RELEASES).catch(()=>publish({status:'error',message:'Could not open the browser. Visit the project releases page on GitHub.'})),
  };
}
module.exports = { createUpdates };
