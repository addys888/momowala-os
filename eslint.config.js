import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'dist-android', 'android/**/build', 'android/app/src/main/assets/web']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: { ...globals.browser, __BUILD_ID__: 'readonly', __ANDROID_APP__: 'readonly' },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  { files: ['api/**/*.js', 'server/**/*.js', 'tests/**/*.js', 'scripts/**/*.js'], languageOptions: { globals: globals.node } },
])
