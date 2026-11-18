import { sharedConfig } from '../../eslint.config.ts';

export default [
  {
    name: 'sender-web ignores',
    ignores: ['dist/**'],
  },
  ...sharedConfig,
];
