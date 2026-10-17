// Visible, local debug simulator. Never builds or publishes a release APK.
import {spawn, spawnSync, execFileSync} from 'node:child_process';
import {existsSync, openSync, mkdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
process.chdir(join(dirname(fileURLToPath(import.meta.url)), '..'));
const sdk=process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(homedir(),'Library/Android/sdk');
const adb=join(sdk,'platform-tools/adb'), emulator=join(sdk,'emulator/emulator');
if(!existsSync(adb)||!existsSync(emulator))throw Error('Android SDK/emulator missing. Set ANDROID_HOME to your SDK directory.');
const legacy=process.argv.includes('--android7');
const avd=legacy?'Cartlyft_Android_7':'Cartlyft_Push_Test';
const port=legacy?5554:5556, serial=`emulator-${port}`;
const avds=execFileSync(emulator,['-list-avds'],{encoding:'utf8'}).trim().split(/\r?\n/);
if(!avds.includes(avd))throw Error(`Create the ${avd} virtual device in Android Studio first. See docs/simulator.md.`);
const run=(command,args,options={})=>{const r=spawnSync(command,args,{stdio:'inherit',...options});if(r.error)throw r.error;if(r.status!==0)throw Error(`${command} failed (${r.status})`);};
const query=args=>{try{return execFileSync(adb,['-s',serial,...args],{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:5000}).trim();}catch{return '';}};
const existing=query(['emu','avd','name']);
if(existing && !existing.split(/\r?\n/).includes(avd))throw Error(`Port ${port} belongs to another emulator. Close it or choose another simulator.`);
if(!existing){
  mkdirSync('.local-simulator',{recursive:true});
  const log=openSync('.local-simulator/emulator.log','a');
  const child=spawn(emulator,['-avd',avd,'-port',String(port),'-no-boot-anim','-no-metrics','-crash-report-mode','disabled',...(legacy?['-no-snapshot-load','-no-snapshot-save','-gpu','software','-no-audio']:[])],{detached:true,stdio:['ignore',log,log]});child.unref();
}
if(!process.argv.includes('--no-build')) {
  run('npm',['run','build'],{env:{...process.env,BUILD_ANDROID:'1'}});
  run('node',['scripts/prepare-android.mjs']);
  run('./gradlew',['assembleDebug','--no-daemon'],{cwd:'android'});
}
const deadline=Date.now()+180000;
while(query(['shell','getprop','sys.boot_completed'])!=='1'){
  if(Date.now()>deadline)throw Error('Emulator boot timed out. See .local-simulator/emulator.log.');
  await new Promise(resolve=>setTimeout(resolve,2000));
}
if(!query(['emu','avd','name']).split(/\r?\n/).includes(avd))throw Error('Simulator identity changed; refusing installation.');
run(adb,['-s',serial,'install','-r','android/app/build/outputs/apk/debug/app-debug.apk']);
run(adb,['-s',serial,'shell','am','force-stop','com.cartlyft.momowala']);
run(adb,['-s',serial,'shell','am','start','-n','com.cartlyft.momowala/.MainActivity']);
console.log(`Cartlyft is open in ${avd} (${serial}). This debug app uses the configured backend; orders/stock edits after sign-in are real. No production data was created by this launcher.`);
