// Instrumentation-only fixtures; no production API access or release artifacts.
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
process.chdir(join(dirname(fileURLToPath(import.meta.url)),'..'));
const legacy=process.argv.includes('--android7');
const serial=legacy?'emulator-5554':'emulator-5556';
const expected=legacy?'Cartlyft_Android_7':'Cartlyft_Push_Test';
const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT||join(homedir(),'Library/Android/sdk');
const adb=join(sdk,'platform-tools/adb');
const run=(cmd,args,options={})=>execFileSync(cmd,args,{stdio:'inherit',...options});
const identity=execFileSync(adb,['-s',serial,'emu','avd','name'],{encoding:'utf8',timeout:5000});
if(!identity.split(/\r?\n/).includes(expected))throw Error(`Start ${expected} first with npm run simulator${legacy?':android7':''}`);
if(!process.argv.includes('--no-build')){
 run('npx',['vite','build','--config','tests/ui/vite.config.js']);
 run('./gradlew',['assembleDebug','assembleDebugAndroidTest','-PflowTests'],{cwd:'android'});
}
for(const apk of ['debug/app-debug.apk','androidTest/debug/app-debug-androidTest.apk'])run(adb,['-s',serial,'install','-r',`android/app/build/outputs/apk/${apk}`]);
const output=execFileSync(adb,['-s',serial,'shell','am','instrument','-w','com.cartlyft.momowala.test/com.cartlyft.momowala.TabFlowTest'],{encoding:'utf8',timeout:180000});
const dir=`.local-simulator/flows-${legacy?'android7':'android15'}`;mkdirSync(dir,{recursive:true});
writeFileSync(join(dir,'results.json'),output);
console.log(output);
const files=execFileSync(adb,['-s',serial,'shell','run-as','com.cartlyft.momowala','ls','files'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(s=>/^(owner|staff)-[a-z-]+\.png$/.test(s));
for(const file of files)writeFileSync(join(dir,file),execFileSync(adb,['-s',serial,'exec-out','run-as','com.cartlyft.momowala','cat',`files/${file}`]));
if(!output.includes('"done": true')||output.includes('"FAIL"')||output.includes('FAIL:'))throw Error(`Simulator test failed. See ${dir}/results.json`);
console.log(`Passed. Evidence: ${dir}`);
