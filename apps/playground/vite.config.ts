import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Served from https://hemant10yadav.github.io/syncsim/
export default defineConfig({
  base: '/syncsim/',
  plugins: [react()],
})
