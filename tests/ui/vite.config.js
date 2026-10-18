import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
export default defineConfig({root:process.env.STARTUP_TEST==='1'?'tests/startup':'tests/ui',envDir:false,publicDir:false,plugins:[react(),legacy({targets:['Chrome >= 51'],modernPolyfills:true})],define:{__ANDROID_APP__:'true',__BUILD_ID__:'"isolated-flow-test"','import.meta.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','import.meta.env.VITE_SUPABASE_ANON_KEY':'"fixture-key"'},build:{outDir:'../../android/app/src/androidTest/assets/flows',emptyOutDir:true}});
