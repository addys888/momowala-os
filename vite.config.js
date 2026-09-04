import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Build id baked into the bundle AND emitted as /version.json. Deployed
// clients compare the two to detect that a newer build shipped and reload
// themselves — devices that keep the app open for weeks otherwise run old
// code forever (the root cause of the July 2026 menu-clobber incidents).
const BUILD_ID = Date.now().toString()

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'emit-version-json',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ v: BUILD_ID }) })
      },
    },
  ],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
})
