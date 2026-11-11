/* eslint-disable @typescript-eslint/explicit-function-return-type */
const config = {
  "package.json": "sort-package-json",
  "*.{ts,tsx}": 'eslint --max-warnings=0 "src/**" --ext=.ts,.tsx --fix',
  "**/*.ts?(x)": () => "tsc -p tsconfig.json",
};

export default config;