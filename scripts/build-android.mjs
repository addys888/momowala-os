import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const run = (cmd,args,options={}) => { const r=spawnSync(cmd,args,{stdio:'inherit',...options}); if(r.error)throw r.error; if(r.status!==0)process.exit(r.status||1); };
run('npm',['run','build'],{env:{...process.env,BUILD_ANDROID:'1'}});
run('node',['scripts/prepare-android.mjs']);
run(process.platform==='win32'?'gradlew.bat':'./gradlew',['assembleRelease','bundleRelease','lintRelease','--no-daemon'],{cwd:'android'});
const gradle=readFileSync('android/app/build.gradle','utf8');
const versionName=gradle.match(/versionName '([^']+)'/)[1];
const versionCode=Number(gradle.match(/versionCode (\d+)/)[1]);
const filename=`cartlyft-${versionName}.apk`;
const apk=`public/downloads/${filename}`;
mkdirSync('public/downloads',{recursive:true});
cpSync('android/app/build/outputs/apk/release/app-release.apk',apk);
const data=readFileSync(apk);
writeFileSync(apk+'.sha256',createHash('sha256').update(data).digest('hex')+`  ${filename}\n`);
console.log(`Signed APK: ${apk} (${(data.length/1024/1024).toFixed(2)} MB)`);

writeFileSync('public/downloads/latest.json',JSON.stringify({versionCode,versionName,path:`/downloads/${filename}`,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex'),notes:'Manager badges, a daily opening-stock popup, and server-managed fresh stock rollover with preserved history.'},null,2)+'\n');
