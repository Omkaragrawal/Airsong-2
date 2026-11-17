import env from '#start/env';
import app from '@adonisjs/core/services/app';
import { defineConfig, syncDestination, targets } from '@adonisjs/core/logger';

const loggerConfig = defineConfig({
  default: 'app',

  loggers: {
    app: {
      enabled: true,
      name: 'airsong-server',
      level: env.get('LOG_LEVEL'),
      destination: !app.inProduction ? await syncDestination() : undefined,
      transport: {
        targets: [targets.file({ destination: 1 })],
      },
    },
  },
});

export default loggerConfig;

/**
 * Inferring types for the list of loggers configured in this application.
 */
declare module '@adonisjs/core/types' {
  // AdonisJS augments its own `LoggersList`, which TypeScript only allows with an `interface`.
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions, @typescript-eslint/no-empty-object-type
  export interface LoggersList extends InferLoggers<typeof loggerConfig> {}
}
