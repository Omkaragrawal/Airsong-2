import { ReceiverError, ReceiverErrorEnum } from './errors.js';

/** The default per-request timeout. WHEP exchanges get a longer one (see {@link WHEP_TIMEOUT_MS}). */
export const DEFAULT_TIMEOUT_MS = 8000;
export const WHEP_TIMEOUT_MS = 15000;

export type RequestOptionsType = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  /** When this fires (e.g. the user leaves), the request is aborted without surfacing an error. */
  signal?: AbortSignal;
};

export type RawResponseType = {
  status: number;
  body: string;
  location: string | null;
};

/**
 * A single `fetch`, wrapped so that every network path is bounded: a built-in timeout aborts a
 * slow request (surfaced as {@link ReceiverErrorEnum.TIMEOUT}), a dropped connection becomes
 * {@link ReceiverErrorEnum.SERVER_UNREACHABLE}, and a caller-supplied abort propagates as-is.
 * It never throws on an HTTP error status; the caller inspects {@link RawResponseType.status}.
 */
export async function request(url: string, options: RequestOptionsType = {}): Promise<RawResponseType> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout((): void => {
    controller.abort();
  }, timeoutMs);

  const external = options.signal;
  const onExternalAbort = (): void => {
    controller.abort();
  };
  if (external) {
    if (external.aborted) {
      controller.abort();
    } else {
      external.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
    });
    const body = await response.text();
    return { status: response.status, body, location: response.headers.get('location') };
  } catch (error) {
    // A caller-initiated abort should surface as the original AbortError, not a server error.
    if (external?.aborted ?? false) {
      throw error;
    }
    if (controller.signal.aborted) {
      throw new ReceiverError(ReceiverErrorEnum.TIMEOUT, 'The request timed out.');
    }
    throw new ReceiverError(ReceiverErrorEnum.SERVER_UNREACHABLE, 'Could not reach the server.');
  } finally {
    clearTimeout(timer);
    if (external) {
      external.removeEventListener('abort', onExternalAbort);
    }
  }
}
