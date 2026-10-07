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
export default defineConfig(({ mode }) => ({
  root: resolve(import.meta.dirname, '.'),
  resolve: {
    alias: [
      { find: /^@cypherx\/chat-ui$/, replacement: resolve(import.meta.dirname, mode === 'distribution' ? '../dist/index.js' : '../src/index.ts') },
      { find: '@cypherx/chat-ui/styles.css', replacement: resolve(import.meta.dirname, mode === 'distribution' ? '../dist/styles.css' : '../src/styles/globals.css') },
      { find: '@cypherx/chat-ui/markdown.css', replacement: resolve(import.meta.dirname, mode === 'distribution' ? '../dist/markdown.css' : '../src/styles/markdown.css') },
    ],
  },
  // The root tsconfig only includes src/, so esbuild would fall back to the
  // classic JSX transform for these files. Say it explicitly.
  esbuild: { jsx: 'automatic' },
  server: { port: 5199, strictPort: true },
}))
