const {test}=require('node:test'),assert=require('node:assert/strict');
const {setLogin,getLogin,loginSupported}=require('../electron/login.cjs');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
test('login launch is disabled in development and only changes when requested',()=>{
  let calls=0,enabled=false;
  const app={isPackaged:true,setLoginItemSettings(value){calls++;enabled=value.openAtLogin;},getLoginItemSettings:()=>({openAtLogin:enabled})};
  assert.equal(loginSupported({...app,isPackaged:false},'win32',{}),false);assert.equal(calls,0);
  setLogin(app,true,'win32',{});assert.equal(enabled,true);setLogin(app,false,'win32',{});assert.equal(enabled,false);assert.equal(calls,2);
});
test('rejected OS login settings are surfaced rather than reported as successful',()=>{
  assert.throws(()=>setLogin({isPackaged:true,setLoginItemSettings(){},getLoginItemSettings:()=>({openAtLogin:false})},true,'darwin',{}),/did not accept/);
});
test('Linux AppImage login files quote paths and are removed on opt-out',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'login-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const app={isPackaged:true,getPath:()=>root},env={APPIMAGE:'/home/user/My App 100%.AppImage'};
  setLogin(app,true,'linux',env);const file=path.join(root,'autostart/arkpedia-chibis.desktop');assert.match(fs.readFileSync(file,'utf8'),/Exec="\/home\/user\/My App 100%%\.AppImage"/);
  assert.equal(getLogin(app,'linux',env),true);
  setLogin(app,false,'linux',env);assert.equal(fs.existsSync(file),false);
  assert.equal(getLogin(app,'linux',env),false);
});
