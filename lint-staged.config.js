const config = {
  "package.json": "sort-package-json",
  "*.{ts,tsx}": "eslint --max-warnings=0 --no-warn-ignored --fix",
  "**/*.ts?(x)": () => "tsc -p tsconfig.json",
};

export default config;