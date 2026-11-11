import { type Config } from "prettier";

const config: Config = {
  trailingComma: "all",
  singleQuote: true,
  printWidth: 80,
  semi: true,
  useTabs: true,
  tabWidth: 2,
  quoteProps: "consistent",
  bracketSpacing: true,
  arrowParens: "always",
  plugins: ["prettier-plugin-edgejs"],
  endOfLine: "auto",
  experimentalTernaries: true,
  filepath: './src',
  objectWrap: "collapse",
};

export default config;