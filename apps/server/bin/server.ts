/*
|--------------------------------------------------------------------------
| HTTP server entrypoint
|--------------------------------------------------------------------------
|
| The "server.ts" file is the entrypoint for starting the AdonisJS HTTP server.
| Either run this file directly or use the "serve" command to run it and watch
| for file changes.
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
  .httpServer()
  .start()
  .catch((error: unknown) => {
    process.exitCode = 1;
    void prettyPrintError(error);
  });
