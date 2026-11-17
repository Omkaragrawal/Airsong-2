import { sharedConfig } from '../../eslint.config.ts';

export default [
  {
    name: 'protocol ignores',
    // Build output: compiled JavaScript and declaration files.
    ignores: ['dist/**'],
  },
  ...sharedConfig,
];
