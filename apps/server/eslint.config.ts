import { sharedConfig } from '../../eslint.config.ts';

export default [
  {
    name: 'server ignores',
    // Build output and AdonisJS's generated route/entity types: neither is hand-written source.
    ignores: ['build/**', '.adonisjs/**'],
  },
  ...sharedConfig,
];
