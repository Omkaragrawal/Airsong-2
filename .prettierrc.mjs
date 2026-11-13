import adonisPrettierConfig from "@adonisjs/prettier-config";

/**
 * @type {import("prettier").Config}
 */
const config = {
  ...adonisPrettierConfig,
  "trailingComma": "all",
  "singleQuote": true,
  "printWidth": 120,
  "semi": true,
  "useTabs": false,
  "quoteProps": "consistent",
  "bracketSpacing": true,
  "arrowParens": "always",
}

export default config;