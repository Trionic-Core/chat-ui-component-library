import { resolve } from 'node:path'
import { defineConfig } from 'vite'

/**
 * Dev-only visual harness. Not published (package `files` lists dist + docs).
 *
 * The node-env unit tests cannot see pixels: recharts renders nothing during
 * server rendering, so every chart test asserts props rather than paint. This
 * page is where the layout policy is actually looked at — at the three real
 * chart widths, with the data shape that produced the 2026-08-29 defect.
 *
 * Run: npm run harness
 */
export default defineConfig({
  root: resolve(import.meta.dirname, '.'),
  resolve: {
    alias: {
      // Render the SOURCE, so a change shows up without a build step.
      '@cypherx/chat-ui': resolve(import.meta.dirname, '../src/index.ts'),
    },
  },
  // The root tsconfig only includes src/, so esbuild would fall back to the
  // classic JSX transform for these files. Say it explicitly.
  esbuild: { jsx: 'automatic' },
  server: { port: 5199, strictPort: true },
})
