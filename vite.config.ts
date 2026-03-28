import path from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(async () => ({
  plugins: [
    react(),
    ...(await electron({
      main: {
        entry: 'src/main/index.ts',
        vite: {
          build: {
            rollupOptions: {
              external: [
                '@playwright/test',
                'playwright',
                'playwright-core',
                'chromium-bidi/lib/cjs/bidiMapper/BidiMapper',
              ],
            },
          },
        },
      },
      preload: {
        input: path.join(__dirname, 'src/preload/index.ts'),
      },
    })),
  ],
  resolve: {
    alias: {
      '@main': path.resolve(__dirname, 'src/main'),
      '@preload': path.resolve(__dirname, 'src/preload'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
}))
