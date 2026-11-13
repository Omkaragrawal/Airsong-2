import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Fails when a JavaScript file exists outside the allow-list, because all code in this repo is TypeScript.
 * The allow-list holds the few existing JavaScript config files that are kept as they are.
 *
 * It checks tracked and untracked files, leaves out gitignored ones, and skips
 * paths that are still in git's index but are no longer on disk.
 *
 * Usage: `node scripts/check_no_js.ts` (or `npm run check:no-js`)
 */

const JS_FILE_PATTERN = /\.(?:c|m)?js$/i;

/** JavaScript files the user decided to keep. Ask before adding to this list. */
const ALLOWED_JS_FILES: ReadonlySet<string> = new Set([
  '.husky/install.mjs',
  '.prettierrc.mjs',
  'commitlint.config.js',
  'ecosystem.config.js',
  'lint-staged.config.js',
]);

/** The repo root, worked out from this file's location so the script runs from any folder. */
const REPO_ROOT = resolve(import.meta.dirname, '..');

function fail(message: string): never {
  console.error(`check-no-js: ${message}`);
  process.exit(1);
}

function describeFailure(error: unknown): string {
  if (typeof error !== 'object' || error === null) {
    return String(error);
  }
  if ('code' in error && error.code === 'ENOENT') {
    return 'git was not found on PATH';
  }
  if ('stderr' in error && typeof error.stderr === 'string' && error.stderr.trim().length > 0) {
    return error.stderr.trim();
  }
  if ('message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'unknown error';
}

/** Lists tracked and untracked files that aren't gitignored, relative to the repo root. */
function listRepoFiles(): string[] {
  try {
    const output = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return output.split('\0').filter((file) => file.length > 0);
  } catch (error) {
    return fail(`could not list the repo's files with git: ${describeFailure(error)}`);
  }
}

const files = listRepoFiles();
const offenders = files.filter(
  (file) => JS_FILE_PATTERN.test(file) && !ALLOWED_JS_FILES.has(file) && existsSync(join(REPO_ROOT, file)),
);

if (offenders.length > 0) {
  console.error(`check-no-js: found ${offenders.length} JavaScript file(s) outside the allow-list:`);
  for (const file of offenders) {
    console.error(`  ${file}`);
  }
  fail('convert them to TypeScript, or ask before adding them to the allow-list in scripts/check_no_js.ts.');
}

process.stdout.write(`check-no-js: OK, no JavaScript files outside the allow-list (${files.length} files checked).\n`);
