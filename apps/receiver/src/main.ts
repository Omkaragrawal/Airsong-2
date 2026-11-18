import { type InfoResponseType, SessionModeEnum } from '@airsong/protocol';

import './styles.css';
import { getInfo } from './api.js';
import { ReceiverErrorEnum, userMessageFor } from './errors.js';
import { createLocalHome } from './home/home_local.js';
import { createWebHome, type WebHomeType } from './home/home_web.js';
import { loadName } from './name_store.js';
import { createPlayer, type PlayerControllerType } from './player/player.js';
import { codeFromHash, navigate, onNavigate, parseRoute } from './router.js';
import { installTestHook } from './test_hook.js';
import { button, create, mount } from './ui/dom.js';

function renderFatal(root: HTMLElement, message: string): void {
  const box = create('section', { className: 'fatal' });
  box.append(
    create('p', { className: 'error', text: message }),
    button('Retry', 'btn btn--primary', (): void => {
      window.location.reload();
    }),
  );
  mount(root, box);
}

async function bootstrap(): Promise<void> {
  const root = document.getElementById('app');
  if (root === null) {
    return;
  }

  // The receiver code is identical in both modes; GET /api/info decides the endpoints and home UI.
  let info: InfoResponseType;
  try {
    info = await getInfo();
  } catch {
    renderFatal(root, userMessageFor(ReceiverErrorEnum.SERVER_UNREACHABLE));
    return;
  }

  let player: PlayerControllerType | null = null;
  let webHome: WebHomeType | null = null;

  const cleanup = (): void => {
    if (player !== null) {
      player.dispose();
      player = null;
    }
    if (webHome !== null) {
      webHome.destroy();
      webHome = null;
    }
  };

  const toPlayer = (code: string): void => {
    navigate(`/r/${encodeURIComponent(code)}`);
  };

  const renderRoute = (): void => {
    cleanup();
    const route = parseRoute(window.location.pathname);
    if (route.name === 'player') {
      player = createPlayer({
        mode: info.mode,
        code: route.code,
        name: loadName(),
        onLeave: (): void => {
          navigate('/');
        },
      });
      installTestHook(player);
      mount(root, player.element);
      return;
    }
    if (info.mode === SessionModeEnum.LOCAL) {
      mount(root, createLocalHome({ code: codeFromHash(), onJoin: toPlayer }));
    } else {
      webHome = createWebHome({ name: loadName(), onJoin: toPlayer });
      mount(root, webHome.element);
    }
  };

  onNavigate(renderRoute);
  renderRoute();
}

void bootstrap();
