import env from '#start/env';
import app from '@adonisjs/core/services/app';
import { defineConfig } from '@adonisjs/core/http';
import { compileTrustProxy } from '#start/trust_proxy';

/**
 * The app URL is used where absolute URLs to this application are needed.
 */
export const appUrl = env.get('APP_URL');

/**
 * The predicate AdonisJS uses to decide whether to trust a request's `X-Forwarded-*` headers,
 * built from TRUST_PROXY by the shared helper (also used to validate the value in start/env.ts).
 */
const trustProxy = compileTrustProxy(env.get('TRUST_PROXY'));

/**
 * The configuration settings used by the HTTP server.
 */
export const http = defineConfig({
  generateRequestId: true,
  allowMethodSpoofing: false,
  useAsyncLocalStorage: false,

  /**
   * Trust proxies according to TRUST_PROXY, so discovery and rate limiting see the real
   * client IP behind a reverse proxy.
   */
  trustProxy,

  cookie: {
    domain: '',
    path: '/',
    maxAge: '2h',
    httpOnly: true,
    secure: app.inProduction,
    sameSite: 'lax',
  },
});
