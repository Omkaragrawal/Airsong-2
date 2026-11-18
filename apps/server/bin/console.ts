/*
|--------------------------------------------------------------------------
| Ace entrypoint
|--------------------------------------------------------------------------
|
| The "console.ts" file is the entrypoint for booting the AdonisJS command-line
| framework and executing commands.
|
| Commands do not boot the application, unless the currently running command has
| the "options.startApp" flag set to true.
|
*/

await import('reflect-metadata');
const { Ignitor, prettyPrintError } = await import('@adonisjs/core/ignitor');

/**
 * URL to the application root. AdonisJS needs it to resolve paths to files and
 * directories for scaffolding commands.
 */
const APP_ROOT = new URL('../', import.meta.url);

/**
 * The importer imports files in the context of the application.
 */
const IMPORTER = (filePath: string): Promise<unknown> => {
  if (filePath.startsWith('./') || filePath.startsWith('../')) {
    return import(new URL(filePath, APP_ROOT).href);
  }
  return import(filePath);
};

void new Ignitor(APP_ROOT, { importer: IMPORTER })
  .tap((app) => {
    app.booting(async () => {
      await import('#start/env');
    });
    app.listen('SIGTERM', () => {
      void app.terminate();
    });
    app.listenIf(app.managedByPm2, 'SIGINT', () => {
      void app.terminate();
    });
  })
  .ace()
  .handle(process.argv.splice(2))
  .catch((error: unknown) => {
    process.exitCode = 1;
    void prettyPrintError(error);
  });
