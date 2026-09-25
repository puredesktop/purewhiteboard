import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite'

import { appDevServerFromManifest } from '../../scripts/vite/app-server.mjs'

export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  define: { 'process.env.IS_PREACT': JSON.stringify('false') },
  server: appDevServerFromManifest(import.meta.url),
})
