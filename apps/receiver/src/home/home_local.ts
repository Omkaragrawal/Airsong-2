import { isCode, normalizeCode } from '@airsong/protocol';

import { ReceiverErrorEnum, userMessageFor } from '../errors.js';
import { button, create, mount } from '../ui/dom.js';

export type LocalHomeDepsType = {
  /** The code from `#k=`, if the app opened the page with one. */
  code: string | null;
  onJoin: (code: string) => void;
};

/**
 * Local-mode home: a single "Start listening" button when the code is already in the URL,
 * otherwise a short explanation plus a manual code entry as a fallback.
 */
export function createLocalHome(deps: LocalHomeDepsType): HTMLElement {
  const element = create('section', { className: 'home home--local' });
  const children: Node[] = [create('h1', { className: 'home__title', text: 'Airsong' })];

  const normalized = deps.code !== null ? normalizeCode(deps.code) : null;
  if (normalized !== null && isCode(normalized)) {
    children.push(create('p', { className: 'home__hint', text: 'Ready to listen on this device.' }));
    children.push(
      button('Start listening', 'btn btn--primary', (): void => {
        deps.onJoin(normalized);
      }),
    );
  } else {
    children.push(
      create('p', {
        className: 'home__hint',
        text: 'Open Airsong from the app on this device, or enter a code below.',
      }),
    );
    const input = create('input', {
      className: 'field',
      attrs: { type: 'text', placeholder: 'Enter code', autocapitalize: 'characters', autocomplete: 'off' },
    });
    const errorLine = create('p', { className: 'error' });
    errorLine.hidden = true;
    const submit = (): void => {
      const candidate = normalizeCode(input.value);
      if (!isCode(candidate)) {
        errorLine.textContent = userMessageFor(ReceiverErrorEnum.INVALID_CODE);
        errorLine.hidden = false;
        return;
      }
      deps.onJoin(candidate);
    };
    input.addEventListener('keydown', (event: KeyboardEvent): void => {
      if (event.key === 'Enter') {
        submit();
      }
    });
    children.push(input, button('Listen', 'btn btn--primary', submit), errorLine);
  }

  mount(element, ...children);
  return element;
}
