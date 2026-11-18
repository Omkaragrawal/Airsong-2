import { sharedConfig } from '../../eslint.config.ts';

export default [
  {
    name: 'receiver ignores',
    // Build output; the dev-only spike page; and the service worker, which is typed by
    // tsconfig.sw.json (WebWorker lib) and so cannot join the project-service-based lint.
    ignores: ['dist/**', 'dev/**', 'src/sw.ts'],
  },
  ...sharedConfig,
  {
    name: 'receiver pwa-assets config filename',
    // @vite-pwa/assets-generator's CLI resolves this exact (hyphenated) filename by default.
    files: ['pwa-assets.config.ts'],
    rules: { '@unicorn/filename-case': 'off' },
  },
];
