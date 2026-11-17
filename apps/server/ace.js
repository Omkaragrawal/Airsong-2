/*
|--------------------------------------------------------------------------
| JavaScript entrypoint for running ace commands
|--------------------------------------------------------------------------
|
| DO NOT MODIFY THIS FILE AS IT WILL BE OVERRIDDEN DURING THE BUILD PROCESS.
|
| Since we cannot run TypeScript source code using the "node" binary, this
| JavaScript entrypoint registers the TypeScript loader and then imports the
| "bin/console.ts" file.
|
*/

/**
 * Register the TypeScript loader hook.
 */
import '@poppinss/ts-exec';

/**
 * Import ace console entrypoint
 */
await import('./bin/console.js');
