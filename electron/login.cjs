const fs = require('node:fs');
const path = require('node:path');

function loginSupported(app, platform, env) {
  return !!app.isPackaged && (platform === 'win32' || platform === 'darwin' || (platform === 'linux' && !!env.APPIMAGE));
}
function setLogin(app, enabled, platform = process.platform, env = process.env) {
  if (!loginSupported(app, platform, env)) throw Error('Launch at login is available in installed macOS/Windows builds and Linux AppImages.');
  if (platform !== 'linux') {
    app.setLoginItemSettings({ openAtLogin:enabled, ...(platform === 'win32' ? {path:process.execPath,args:[]} : {}) });
    if (app.getLoginItemSettings().openAtLogin !== enabled) throw Error('The operating system did not accept the login item. Check your system Login Items settings.');
  } else {
    const file = path.join(app.getPath('appData'), 'autostart', 'arkpedia-chibis.desktop');
    if (!enabled) { fs.rmSync(file,{force:true}); return; }
    const executable = env.APPIMAGE.replace(/%/g,'%%').replace(/[\\"`$]/g,'\\$&').replace(/[\r\n]/g,'');
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,`[Desktop Entry]\nType=Application\nName=Arkpedia Chibis\nExec="${executable}"\nTerminal=false\nX-GNOME-Autostart-enabled=true\n`);
  }
}
function getLogin(app,platform=process.platform,env=process.env) {
  if(!loginSupported(app,platform,env))return false;
  if(platform!=='linux')return app.getLoginItemSettings(platform==='win32'?{path:process.execPath,args:[]}:{}).openAtLogin;
  try{const text=fs.readFileSync(path.join(app.getPath('appData'),'autostart','arkpedia-chibis.desktop'),'utf8');return !/^Hidden=true\s*$/m.test(text)&&!/^X-GNOME-Autostart-enabled=false\s*$/m.test(text);}catch{return false;}
}
module.exports = { setLogin, getLogin, loginSupported };
