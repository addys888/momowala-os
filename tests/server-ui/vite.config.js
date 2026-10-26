import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({root:'tests/server-ui',envDir:false,publicDir:false,plugins:[react()],define:{__ANDROID_APP__:'true',__BUILD_ID__:'"server-fixture"','import.meta.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','import.meta.env.VITE_SUPABASE_ANON_KEY':'"fixture-key"'},server:{host:'127.0.0.1',port:5184,fs:{allow:['../..']}},build:{outDir:'../../.local-simulator/server-ui'}});
