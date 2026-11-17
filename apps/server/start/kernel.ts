import router from '@adonisjs/core/services/router';
import server from '@adonisjs/core/services/server';

/**
 * The error handler converts an exception into an HTTP response.
 */
server.errorHandler((): Promise<typeof import('#exceptions/handler')> => import('#exceptions/handler'));

/**
 * Middleware that runs on every HTTP request, even without a matched route.
 */
server.use([
  (): Promise<typeof import('#middleware/container_bindings_middleware')> =>
    import('#middleware/container_bindings_middleware'),
]);

/**
 * Middleware that runs on every request with a matched route.
 */
router.use([
  (): Promise<typeof import('@adonisjs/core/bodyparser_middleware')> => import('@adonisjs/core/bodyparser_middleware'),
]);

/**
 * Named middleware, assigned explicitly to routes or route groups. `cors` is applied to the
 * sender endpoints (sessions, ice-servers) in later tasks; receivers are same-origin.
 */
export const middleware = router.named({
  cors: (): Promise<typeof import('@adonisjs/cors/cors_middleware')> => import('@adonisjs/cors/cors_middleware'),
});
