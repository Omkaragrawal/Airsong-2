import { defineConfig } from '@adonisjs/core/app';

export default defineConfig({
  /**
   * Ace commands registered from packages. Application commands are scanned
   * from the "./commands" directory automatically.
   */
  commands: [(): Promise<typeof import('@adonisjs/core/commands')> => import('@adonisjs/core/commands')],

  /**
   * Service providers to register when booting the application. No database,
   * session or auth: this server keeps its state in memory.
   */
  providers: [
    (): Promise<typeof import('@adonisjs/core/providers/app_provider')> =>
      import('@adonisjs/core/providers/app_provider'),
    {
      file: (): Promise<typeof import('@adonisjs/core/providers/repl_provider')> =>
        import('@adonisjs/core/providers/repl_provider'),
      environment: ['repl', 'test'],
    },
    (): Promise<typeof import('@adonisjs/cors/cors_provider')> => import('@adonisjs/cors/cors_provider'),
  ],

  /**
   * Modules imported before the application starts.
   */
  preloads: [
    (): Promise<typeof import('#start/routes')> => import('#start/routes'),
    (): Promise<typeof import('#start/kernel')> => import('#start/kernel'),
  ],

  /**
   * Files copied to the build folder when creating the production build.
   * The public directory holds the receiver and sender-web builds in later phases.
   */
  metaFiles: [{ pattern: 'public/**', reloadServer: false }],
});
