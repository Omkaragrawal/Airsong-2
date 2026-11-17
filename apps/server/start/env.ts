import proxyAddr from 'proxy-addr';
import { Env } from '@adonisjs/core/env';

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),

  APP_KEY: Env.schema.secret(),
  APP_URL: Env.schema.string({ format: 'url', tld: false }),

  /**
   * Who to trust for `X-Forwarded-*` headers, so the real client IP is seen behind Caddy.
   * Accepts `true`, `false`, or a proxy-addr value: `loopback`, `linklocal`, `uniquelocal`,
   * a single IP, a CIDR, or a comma-separated list of those. Defaults to `false` (trust nobody).
   */
  TRUST_PROXY: (_name, value): string => {
    const raw = (value ?? 'false').trim();
    if (raw === 'true' || raw === 'false') {
      return raw;
    }
    // Throws a descriptive error if `raw` is not a valid proxy-addr trust value.
    proxyAddr.compile(raw);
    return raw;
  },

  /**
   * Origins allowed to call the sender endpoints cross-origin, comma-separated and trimmed.
   * Covers the Electron `app://airsong` origin and dev origins. Defaults to none.
   */
  ALLOWED_ORIGINS: (_name, value): string => (value ?? '').trim(),
});
