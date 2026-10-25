const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createUpdates}=require('../electron/updates.cjs');
function setup(options={}){
  const updater=new EventEmitter();let checks=0,downloads=0,installs=0;
  Object.assign(updater,{setFeedURL(){},async checkForUpdates(){checks++;},async downloadUpdate(){downloads++;},quitAndInstall(){installs++;}});
  const updates=createUpdates({app:{isPackaged:true,getVersion:()=> '0.6.1'},platform:'win32',makeUpdater:()=>updater,shell:{openExternal(){}},net:{},...options});
  return {updates,updater,counts:()=>({checks,downloads,installs})};
}
test('checking never downloads or installs without explicit user actions',async()=>{
  const {updates,updater,counts}=setup();updates.install();await updates.download();assert.equal(counts().installs,0);
  await updates.check();assert.equal(updater.autoDownload,false);assert.equal(updater.autoInstallOnAppQuit,false);
  updater.emit('update-available',{version:'0.7.0'});assert.equal(updates.get().status,'available');assert.equal(counts().downloads,0);
  await updates.download();updater.emit('download-progress',{percent:50.6});assert.equal(updates.get().percent,51);
  updates.install();assert.equal(counts().installs,0);
  updater.emit('update-downloaded');updates.install();assert.equal(counts().installs,1);
});
test('errors permit retry and concurrent checks are ignored',async()=>{
  const {updates,updater,counts}=setup();await updates.check();await updates.check();assert.equal(counts().checks,1);
  updater.emit('error',Error('network'));assert.equal(updates.get().status,'error');await updates.check();assert.equal(counts().checks,2);
});
test('macOS development builds check releases but do not offer automatic installation',async()=>{
  const {updates,counts}=setup({platform:'darwin',net:{fetch:async()=>({ok:true,json:async()=>({tag_name:'v0.7.0'})})}});
  await updates.check();assert.equal(updates.get().status,'available');assert.equal(updates.get().installable,false);
  await updates.download();updates.install();assert.equal(counts().downloads,0);assert.equal(counts().installs,0);
});
