import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../..');

export default defineConfig({
  root: directory,
  plugins: [react()],
  resolve: {
    alias: {
      '@/': `${directory}/`,
      '@justtld/shared/generated/registry': path.join(
        root,
        'packages/shared/src/generated/registry.ts',
      ),
      '@justtld/shared/generated/subdomains': path.join(
        root,
        'packages/shared/src/generated/subdomains.ts',
      ),
      '@justtld/shared/env': path.join(root, 'packages/shared/src/env.ts'),
      '@justtld/shared/deployment': path.join(root, 'packages/shared/src/deployment.ts'),
      '@justtld/shared/tld': path.join(root, 'packages/shared/src/tld.ts'),
      '@justtld/shared': path.join(root, 'packages/shared/src/index.ts'),
      '@justtld/db': path.join(root, 'packages/db/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
