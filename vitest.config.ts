import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  esbuild: {
    target: 'node20',
  },
  resolve: {
    extensions: ['.ts', '.js', '.json'],
  },
});
