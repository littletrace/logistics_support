import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/gsheets': {
        target: 'https://docs.google.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/gsheets/, '/spreadsheets/d/1u6_lPc_snviUn0Yu3PeJiJV_spWoNeJp11AcxfbEF3c/export?format=xlsx')
      }
    }
  }
})
