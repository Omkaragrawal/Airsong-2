/* eslint-disable @typescript-eslint/naming-convention */
import { globalIgnores } from "eslint/config";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import stylisticTs from "@stylistic/eslint-plugin-ts";
import stylisticJsx from "@stylistic/eslint-plugin-jsx";
import _import from "eslint-plugin-import";
import { fixupPluginRules } from "@eslint/compat";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

// const config = defineConfig([
const config = tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  tseslint.configs.strict,
  tseslint.configs.stylistic,
  globalIgnores([
    "**/*.scss",
    "**/*.css",
    "**/*.ico",
    "**/*.jsx",
    "**/public",
    "**/build",
    "**/.git",
    "**/node_modules",
    "**/.next",
    "**/next-env.d.ts",
    "**/globals.d.ts",
    "**/*.cjs",
    "**/*.xml",
    //TODO: start of "fix frontend ts issue and remove below ignores"
    //TODO: end of "fix frontend ts issue and remove below ignores"
  ]),
  {
    extends: compat.extends(
      //   "plugin:@typescript-eslint/eslint-recommended",
      "plugin:@typescript-eslint/recommended-type-checked",
      "prettier",
      "plugin:prettier/recommended",
      "plugin:@next/next/recommended",
    ),

    plugins: {
      "@typescript-eslint": typescriptEslint,
      "@stylistic/ts": stylisticTs,
      "@stylistic/jsx": stylisticJsx,
      import: fixupPluginRules(_import),
    },

    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",

      parserOptions: {
        project: "./tsconfig.json",
        parser: "@typescript-eslint/parser",
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
      },
    },

    settings: {
      "import/parsers": {
        "@typescript-eslint/parser": [".ts", ".tsx"],
      },

      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: ["./src/"],
        },
      },
    },

    rules: {
      curly: ["error", "all"],
      "no-console": ["error", { allow: ["error", "warn"] }],
      "max-len": [
        "error",
        {
          code: 120,
        },
      ],
      "import/newline-after-import": "error",
      "import/no-unresolved": "error",
      "import/no-cycle": ['error'],

      "@stylistic/ts/lines-between-class-members": ["error", "always"],
      "@stylistic/ts/semi": ["error", "always"],
      "@stylistic/semi": ["error", "always"],

      "@typescript-eslint/explicit-function-return-type": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      "@typescript-eslint/adjacent-overload-signatures": "warn",
      "@typescript-eslint/array-type": [
        "warn",
        { default: "array", readonly: "array" },
      ],
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          minimumDescriptionLength: 3,
          "ts-check": "allow-with-description",
          "ts-expect-error": "allow-with-description",
          "ts-ignore": "allow-with-description",
          "ts-nocheck": "allow-with-description",
        },
      ],
      "@typescript-eslint/class-literal-property-style": ["warn", "getters"],
      // Note: you must disable the base rule as it can report incorrect errors
      // "class-methods-use-this": "off",
      // "@typescript-eslint/class-methods-use-this": "error",
      "@typescript-eslint/consistent-type-exports": "warn",
      "@typescript-eslint/consistent-type-imports": "error",
      // Note: you must disable the base rule as it can report incorrect errors
      "default-param-last": "off",
      "@typescript-eslint/default-param-last": "error",
      "@typescript-eslint/explicit-member-accessibility": [
        "error",
        {
          overrides: {
            accessors: "explicit",
            constructors: "explicit",
            methods: "explicit",
            properties: "explicit",
            parameterProperties: "off",
          },
        },
      ],
      "@typescript-eslint/explicit-module-boundary-types": [
        "error",
        {
          allowHigherOrderFunctions: false,
          allowTypedFunctionExpressions: false,
          allowOverloadFunctions: true,
        },
      ],
      // Note: you must disable the base rule as it can report incorrect errors
      "max-params": "off",
      "@typescript-eslint/max-params": "warn",
      "@typescript-eslint/naming-convention": "warn",
      "@typescript-eslint/no-base-to-string": "error",
      "@typescript-eslint/no-confusing-non-null-assertion": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-includes": "warn",
      "@typescript-eslint/prefer-function-type": "warn",
      "@typescript-eslint/prefer-for-of": "warn",
      "@typescript-eslint/prefer-find": "error",
      "@typescript-eslint/no-wrapper-object-types": "error",
      "@typescript-eslint/no-require-imports": [
        "error",
        { allow: [], allowAsImport: true },
      ],
      "@typescript-eslint/no-useless-empty-export": "error",
      // Note: you must disable the base rule as it can report incorrect errors
      "no-unused-expressions": "off",
      "@typescript-eslint/no-unused-expressions": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      "@typescript-eslint/no-unnecessary-condition": "warn",

      "@typescript-eslint/no-deprecated": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-declaration-merging": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-unary-minus": "error",
      "@typescript-eslint/no-unnecessary-qualifier": "error",
    },
  },
  eslintPluginPrettierRecommended,
  eslintConfigPrettier,
);
// ]);

export default config;