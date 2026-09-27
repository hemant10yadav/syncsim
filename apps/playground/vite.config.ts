import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Served from https://hemant10yadav.github.io/syncsim/ (the playground)
// and https://hemant10yadav.github.io/syncsim/approach/ (the design write-up).
export default defineConfig({
  base: '/syncsim/',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        approach: resolve(import.meta.dirname, 'approach/index.html'),
      },
    },
  },
})
