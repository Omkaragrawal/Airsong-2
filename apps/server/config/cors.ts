import env from '#start/env';
import { defineConfig } from '@adonisjs/cors';

/**
 * The origins the sender endpoints accept cross-origin, from ALLOWED_ORIGINS.
 * Empty means no cross-origin browser access is allowed.
 */
const allowedOrigins = env
  .get('ALLOWED_ORIGINS')
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

/**
 * CORS is applied as named middleware on the sender endpoints only (sessions and
 * ice-servers). Receivers are same-origin and don't need it.
 */
const corsConfig = defineConfig({
  enabled: true,
  origin: allowedOrigins,
  methods: ['GET', 'HEAD', 'POST', 'DELETE'],
  headers: true,
  exposeHeaders: ['Location'],
  credentials: false,
  maxAge: 90,
});

export default corsConfig;
