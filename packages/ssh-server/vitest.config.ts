import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/tools/**/*.ts'],
      thresholds: {
        lines: 20,
        functions: 50,
        branches: 50,
        statements: 20,
      },
    },
  },
});
