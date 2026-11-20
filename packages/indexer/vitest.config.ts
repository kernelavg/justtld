import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../..');

export default defineConfig({
  root: directory,
  resolve: {
    alias: {
      '@justtld/shared/generated/registry': path.join(
        root,
        'packages/shared/src/generated/registry.ts',
      ),
      '@justtld/shared/env': path.join(root, 'packages/shared/src/env.ts'),
      '@justtld/shared/deployment': path.join(root, 'packages/shared/src/deployment.ts'),
      '@justtld/shared/tld': path.join(root, 'packages/shared/src/tld.ts'),
      '@justtld/shared': path.join(root, 'packages/shared/src/index.ts'),
      '@justtld/db': path.join(root, 'packages/db/src/index.ts'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
