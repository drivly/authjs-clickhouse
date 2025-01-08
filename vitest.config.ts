/// <reference types="vitest" />

import preact from '@preact/preset-vite'
import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

// https://vitejs.dev/config/
export default defineConfig({
  test: {
    // NOTE: `.spec` is reserved for Playwright tests
    include: ['**/*.test.?(c|m)[jt]s?(x)'],
    setupFiles: ['./vitest-setup.ts'],
  },
})
