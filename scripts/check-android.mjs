// Internal verification only. Does not bump versions, sign a release, or publish downloads.
import { spawnSync } from 'node:child_process';
const run=(command,args,opts={})=>{const r=spawnSync(command,args,{stdio:'inherit',...opts});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status || 1);};
run('npm',['run','build'],{env:{...process.env,BUILD_ANDROID:'1'}});
run('node',['scripts/prepare-android.mjs']);
run('./gradlew',['assembleDebug','assembleDebugAndroidTest','lintDebug','--no-daemon'],{cwd:'android'});

// Java-only clock regression checks run without an emulator.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'cartlyft-clock-'));
try { run('javac',['-encoding','UTF-8','-d',dir,'android/app/src/main/java/com/cartlyft/momowala/OpeningSchedule.java','tests/OpeningScheduleTest.java']); run('java',['-cp',dir,'OpeningScheduleTest']); } finally { rmSync(dir,{recursive:true,force:true}); }
