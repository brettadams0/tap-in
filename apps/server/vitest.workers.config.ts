import { defineConfig } from 'vitest/config';
import { createRequire } from 'node:module';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

// obscenity's ESM entry re-exports a CJS default that workerd's test loader can't unwrap;
// point tests at the CJS entry instead (wrangler's esbuild bundle handles either).
const obscenityCjs = createRequire(import.meta.url).resolve('obscenity', {
  paths: ['../../packages/shared'],
});

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: { bindings: { ALLOWED_ORIGINS: '*' } },
    }),
  ],
  resolve: { alias: { obscenity: obscenityCjs } },
  test: {
    include: ['test/worker/**/*.test.ts'],
    testTimeout: 20_000,
  },
});
