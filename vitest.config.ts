import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const at = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@ii00ii/kit': at('./packages/kit/src/index.ts'),
      '@ii00ii/look': at('./games/look/src/index.ts'),
    },
  },
  test: {
    include: ['{packages,games,workers}/*/src/**/*.test.ts'],
  },
});
