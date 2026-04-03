import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    'react',
    'react-dom',
    'lucide-react',
  ],
  esbuildOptions(options) {
    options.jsx = 'automatic'
  },
  treeshake: true,
  splitting: true,
  minify: false,
})
