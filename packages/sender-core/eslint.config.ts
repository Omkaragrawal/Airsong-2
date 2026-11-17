import { sharedConfig } from '../../eslint.config.ts';

export default [
  {
    name: 'sender-core ignores',
    // Build output: compiled JavaScript and declaration files.
    ignores: ['dist/**'],
  },
  ...sharedConfig,
  {
    name: 'sender-core runtime-neutral globals',
    files: ['src/**/*.ts'],
    rules: {
      // This package also runs in browsers and React Native, where these Node globals don't exist.
      // The Node type preset makes them compile, so only this rule catches them.
      'no-restricted-globals': ['error', 'process', 'Buffer', '__dirname', '__filename', 'require'],
    },
  },
];
