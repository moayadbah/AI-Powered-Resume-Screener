import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    alias: {
      // Chart.js cannot render in jsdom (no canvas, no real layout), and the
      // rendered canvas is not what we assert on anyway - see the stub.
      'react-chartjs-2': new URL('./src/test/mocks/react-chartjs-2.tsx', import.meta.url)
        .pathname,
    },
  },
})
