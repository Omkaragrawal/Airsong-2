import eslint from '@eslint/js';
import { configPkg } from '@adonisjs/eslint-config';
import { defineConfig } from 'eslint/config';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import { createNodeResolver, importX } from 'eslint-plugin-import-x';
import tseslint from 'typescript-eslint';

/** Every rule below applies to TypeScript files only. The kept JavaScript configs get no rules. */
const TS_FILES = ['**/*.ts', '**/*.tsx'];

/**
 * The presets and rules shared by the root and every workspace.
 * Workspace configs import this array and spread it.
 *
 * Order matters, because a later entry wins:
 * 1. the presets carried over from the old config
 * 2. the AdonisJS preset, which also switches off formatting rules in favour of Prettier
 * 3. the rules carried over from the old config, plus Airsong's own
 */
export const sharedConfig = [
  ...defineConfig({
    name: 'Airsong: presets carried over from the old config',
    files: TS_FILES,
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.strict,
      tseslint.configs.stylistic,
      tseslint.configs.recommendedTypeChecked,
    ],
    languageOptions: {
      // Type-aware rules need the TypeScript project of each linted file.
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  }),
  ...configPkg(
    {
      name: 'Airsong shared ignores',
      // Generated or static assets, such as `apps/server/public`.
      ignores: ['**/public/**'],
    },
    {
      name: 'Airsong rules',
      files: TS_FILES,
      plugins: { 'import-x': importX },
      settings: {
        'import-x/resolver-next': [createTypeScriptImportResolver({ alwaysTryTypes: true }), createNodeResolver()],
        // Without this, the plugin parses only .js dependencies and `import-x/no-cycle` finds nothing.
        'import-x/extensions': ['.ts', '.tsx'],
      },
      rules: {
        'no-console': ['error', { allow: ['error', 'warn'] }],
        'no-duplicate-imports': 'error',

        'import-x/newline-after-import': 'error',
        'import-x/no-unresolved': 'error',
        'import-x/no-cycle': ['error'],

        '@stylistic/lines-between-class-members': ['error', 'always'],

        // Object shapes are `type` aliases, never `interface`: one way to declare a shape, and no silent
        // declaration merging between same-named interfaces. Adding fields to a library's existing
        // interface still needs `interface`; disable this rule on that line with a reason.
        // This overrides the `stylistic` preset above, which prefers `interface`.
        '@typescript-eslint/consistent-type-definitions': ['error', 'type'],

        '@typescript-eslint/explicit-function-return-type': 'error',
        '@typescript-eslint/prefer-optional-chain': 'error',
        '@typescript-eslint/adjacent-overload-signatures': 'warn',
        '@typescript-eslint/array-type': ['warn', { default: 'array', readonly: 'array' }],
        '@typescript-eslint/ban-ts-comment': [
          'error',
          {
            'minimumDescriptionLength': 3,
            'ts-check': 'allow-with-description',
            'ts-expect-error': 'allow-with-description',
            'ts-ignore': 'allow-with-description',
            'ts-nocheck': 'allow-with-description',
          },
        ],
        '@typescript-eslint/class-literal-property-style': ['warn', 'getters'],
        '@typescript-eslint/consistent-type-exports': 'warn',
        // The base rule must be off, or it reports wrongly on TypeScript code.
        'default-param-last': 'off',
        '@typescript-eslint/default-param-last': 'error',
        '@typescript-eslint/explicit-member-accessibility': [
          'error',
          {
            overrides: {
              accessors: 'explicit',
              constructors: 'explicit',
              methods: 'explicit',
              properties: 'explicit',
              parameterProperties: 'off',
            },
          },
        ],
        '@typescript-eslint/explicit-module-boundary-types': [
          'error',
          {
            allowHigherOrderFunctions: false,
            allowTypedFunctionExpressions: false,
            allowOverloadFunctions: true,
          },
        ],
        // The base rule must be off, or it reports wrongly on TypeScript code.
        'max-params': 'off',
        '@typescript-eslint/max-params': 'warn',
        '@typescript-eslint/no-base-to-string': 'error',
        '@typescript-eslint/no-confusing-non-null-assertion': 'warn',
        '@typescript-eslint/prefer-nullish-coalescing': 'error',
        '@typescript-eslint/prefer-includes': 'warn',
        '@typescript-eslint/prefer-function-type': 'warn',
        '@typescript-eslint/prefer-for-of': 'warn',
        '@typescript-eslint/prefer-find': 'error',
        '@typescript-eslint/no-wrapper-object-types': 'error',
        '@typescript-eslint/no-require-imports': ['error', { allow: [], allowAsImport: true }],
        '@typescript-eslint/no-useless-empty-export': 'error',
        // The base rule must be off, or it reports wrongly on TypeScript code.
        'no-unused-expressions': 'off',
        '@typescript-eslint/no-unused-expressions': 'error',
        '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
        '@typescript-eslint/no-unnecessary-condition': 'warn',

        '@typescript-eslint/no-deprecated': 'error',
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-unsafe-argument': 'error',
        '@typescript-eslint/no-unsafe-assignment': 'error',
        '@typescript-eslint/no-unsafe-call': 'error',
        '@typescript-eslint/no-unsafe-declaration-merging': 'error',
        '@typescript-eslint/no-unsafe-member-access': 'error',
        '@typescript-eslint/no-unsafe-return': 'error',
        '@typescript-eslint/no-unsafe-unary-minus': 'error',
        '@typescript-eslint/no-unnecessary-qualifier': 'error',

        // Kept last on purpose: the Prettier entries in the AdonisJS preset switch `curly` off,
        // and this switches it back on. The "all" option doesn't conflict with Prettier.
        'curly': ['error', 'all'],
      },
    },
  ),
];

/**
 * Root ESLint config: the shared config plus ignores that only make sense at the repo root.
 */
export default [
  {
    name: 'Airsong root ignores',
    ignores: [
      // The user's own files. Never lint them.
      'scratchpad/**',
      // Turbo lints each workspace with that workspace's own config (ESLint 10 looks up the config per file).
      'apps/**',
      'packages/**',
      // Kept and unused by the user's decision, so it isn't linted.
      '.prettierrc.config.ts',
      // Tool output that the preset's own ignore list doesn't cover.
      '.turbo/**',
      'logs/**',
      '.data/**',
    ],
  },
  ...sharedConfig,
];
