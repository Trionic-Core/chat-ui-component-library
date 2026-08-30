import { defineConfig } from 'vitest/config'

// Test-only config, separate from the tsup build so the published bundle is
// untouched. Nearly everything under test is pure (the markdown renderer
// returns an HTML string; formatters, geometry, layout and type-guards are
// pure), so the lighter 'node' environment is the default.
//
// The exception is the ResizeObserver/matchMedia hooks, whose whole behaviour
// lives in an effect that node never runs. Those opt in per file with
// `// @vitest-environment jsdom` (see src/aui/hooks/use-element-size.test.ts)
// rather than slowing every other file down.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
