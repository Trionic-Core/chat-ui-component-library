import { defineConfig } from 'vitest/config'

// Test-only config, separate from the tsup build so the published bundle is
// untouched. The functions under test are pure (the markdown renderer returns
// an HTML string; formatters/CSV/type-guards are pure), so the lighter 'node'
// environment is enough — no jsdom dependency needed.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
