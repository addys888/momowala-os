import { cpSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
const destination = 'android/app/src/main/assets/web';
if (!existsSync('dist-android/index.html')) throw new Error('Run the Android web build first.');
// Build output must contain the native mode guard; never copy server environment files.
const html = readFileSync('dist-android/index.html', 'utf8');
if (!html.includes('legacy')) throw new Error('The Android compatibility bundle is missing.');
rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
for (const name of ['index.html', 'assets', 'version.json']) cpSync(`dist-android/${name}`, `${destination}/${name}`, { recursive: true });
cpSync('public/momowala-logo.png', `${destination}/momowala-logo.png`);
console.log('Bundled Android screens prepared. No API secrets or APK downloads copied.');
