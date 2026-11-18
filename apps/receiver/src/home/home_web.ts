import { NAME_MAX_LENGTH, type NearbySessionType, isCode, normalizeCode } from '@airsong/protocol';

import { getNearby } from '../api.js';
import { ReceiverErrorEnum, userMessageFor } from '../errors.js';
import { saveName } from '../name_store.js';
import { button, create, mount } from '../ui/dom.js';

export type WebHomeType = {
  element: HTMLElement;
  destroy: () => void;
};

export type WebHomeDepsType = {
  name: string;
  onJoin: (code: string) => void;
};

const NEARBY_POLL_MS = 3000;

/**
 * Web-mode home: a "Nearby" list polled every 3 s, plus a name field and manual code entry.
 * Polling stops when {@link WebHomeType.destroy} is called (on navigation away).
 */
export function createWebHome(deps: WebHomeDepsType): WebHomeType {
  const element = create('section', { className: 'home home--web' });
  const nameInput = create('input', {
    className: 'field',
    attrs: { type: 'text', placeholder: 'Your name (optional)', maxlength: String(NAME_MAX_LENGTH) },
  });
  nameInput.value = deps.name;

  const nearbyList = create('ul', { className: 'nearby' });
  const nearbyEmpty = create('p', { className: 'home__hint', text: 'Looking for sessions on your network…' });
  const codeInput = create('input', {
    className: 'field',
    attrs: { type: 'text', placeholder: 'Or enter a code', autocapitalize: 'characters', autocomplete: 'off' },
  });
  const errorLine = create('p', { className: 'error' });
  errorLine.hidden = true;

  const nameValue = (): string => nameInput.value.trim();

  const join = (rawCode: string): void => {
    const candidate = normalizeCode(rawCode);
    if (!isCode(candidate)) {
      errorLine.textContent = userMessageFor(ReceiverErrorEnum.INVALID_CODE);
      errorLine.hidden = false;
      return;
    }
    saveName(nameValue());
    deps.onJoin(candidate);
  };

  codeInput.addEventListener('keydown', (event: KeyboardEvent): void => {
    if (event.key === 'Enter') {
      join(codeInput.value);
    }
  });

  const renderNearby = (sessions: NearbySessionType[]): void => {
    nearbyList.replaceChildren();
    for (const session of sessions) {
      const item = create('li', { className: 'nearby__item' });
      item.append(
        button(`${session.name} · ${session.platform}`, 'btn btn--list', (): void => {
          join(session.code);
        }),
      );
      nearbyList.append(item);
    }
    nearbyEmpty.textContent = sessions.length === 0 ? 'No sessions found nearby yet.' : '';
    nearbyEmpty.hidden = sessions.length > 0;
  };

  let abort: AbortController | null = null;
  const poll = async (): Promise<void> => {
    abort?.abort();
    abort = new AbortController();
    try {
      renderNearby(await getNearby(abort.signal));
    } catch {
      // Keep polling; surface a quiet note only while nothing is listed.
      if (nearbyList.childElementCount === 0) {
        nearbyEmpty.textContent = userMessageFor(ReceiverErrorEnum.SERVER_UNREACHABLE);
        nearbyEmpty.hidden = false;
      }
    }
  };

  const timer = window.setInterval((): void => {
    void poll();
  }, NEARBY_POLL_MS);
  void poll();

  mount(
    element,
    create('h1', { className: 'home__title', text: 'Airsong' }),
    nameInput,
    create('h2', { className: 'home__subtitle', text: 'Nearby' }),
    nearbyEmpty,
    nearbyList,
    codeInput,
    button('Listen', 'btn btn--primary', (): void => {
      join(codeInput.value);
    }),
    errorLine,
  );

  const destroy = (): void => {
    window.clearInterval(timer);
    abort?.abort();
  };

  return { element, destroy };
}
