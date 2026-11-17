import proxyAddr from 'proxy-addr';
import env from '#start/env';
import app from '@adonisjs/core/services/app';
import { defineConfig } from '@adonisjs/core/http';

/**
 * The app URL is used where absolute URLs to this application are needed.
 */
export const appUrl = env.get('APP_URL');

const trustProxySetting = env.get('TRUST_PROXY');

/**
 * Turns the TRUST_PROXY setting into the predicate AdonisJS uses to decide whether to
 * trust a request's `X-Forwarded-*` headers. `true`/`false` trust all or no proxies;
 * any other value is a proxy-addr trust list (validated in start/env.ts).
 */
const trustProxy =
  trustProxySetting === 'true'
    ? (): boolean => true
    : trustProxySetting === 'false'
      ? (): boolean => false
      : proxyAddr.compile(trustProxySetting);

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
