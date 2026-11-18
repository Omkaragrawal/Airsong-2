import router from '@adonisjs/core/services/router';
import { SessionModeEnum, type InfoResponseType } from '@airsong/protocol';

import { servePublic } from '#static/serve_public';

/** This server's version, reported by `GET /api/info`. */
const SERVER_VERSION = '0.0.0';

/** Liveness check for load balancers and uptime monitors. */
router.get('/api/health', (ctx): void => {
  ctx.response.send({ status: 'ok' });
});

/** Tells a client this is a web-mode server and which build it's talking to. */
router.get('/api/info', (ctx): void => {
  const info: InfoResponseType = { mode: SessionModeEnum.WEB, version: SERVER_VERSION };
  ctx.response.send(info);
});

/** Everything else is the built front-end from public/, with a single-page fallback. */
router.get('*', servePublic);
