import {
  type EventStreamFactoryType,
  type EventStreamMessageType,
  type EventStreamOptionsType,
  type EventStreamType,
} from '@airsong/sender-core';

/** Parses one SSE frame (its `event:` and joined `data:` lines) or returns null if it has no data. */
function parseFrame(frame: string): EventStreamMessageType | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.length === 0 || line.startsWith(':')) {
      continue;
    }
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const rawValue = colon === -1 ? '' : line.slice(colon + 1);
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;
    if (field === 'event') {
      event = value;
    } else if (field === 'data') {
      dataLines.push(value);
    }
  }
  if (dataLines.length === 0) {
    return null;
  }
  return { event, data: dataLines.join('\n') };
}

/**
 * A browser {@link EventStreamFactoryType} built on fetch streaming. It parses `event:`/`data:`
 * frames, sends the Bearer header, calls `onError` once with the HTTP status when the server
 * refuses, and never reconnects by itself — the transport owns reconnection.
 */
export const createEventStream: EventStreamFactoryType = (options: EventStreamOptionsType): EventStreamType => {
  const controller = new AbortController();
  let closed = false;

  const run = async (): Promise<void> => {
    let response: Response;
    try {
      response = await fetch(options.url, {
        headers: { ...options.headers, accept: 'text/event-stream' },
        signal: controller.signal,
        cache: 'no-store',
      });
    } catch (cause) {
      if (!closed) {
        options.onError({ cause });
      }
      return;
    }
    if (!response.ok) {
      // Release the unread body so the connection is not held open (as sender-core does).
      try {
        await response.body?.cancel();
      } catch {
        // The body is being discarded, so a failed cancel changes nothing.
      }
      options.onError({ status: response.status });
      return;
    }
    if (response.body === null) {
      options.onError({ cause: new Error('The event stream had no body') });
      return;
    }

    options.onOpen();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        buffer = buffer.replace(/\r\n/g, '\n');
        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const message = parseFrame(frame);
          if (message !== null) {
            options.onMessage(message);
          }
          boundary = buffer.indexOf('\n\n');
        }
      }
      if (!closed) {
        options.onError({ cause: new Error('The event stream ended') });
      }
    } catch (cause) {
      if (!closed) {
        options.onError({ cause });
      }
    }
  };

  void run();

  return {
    close: (): void => {
      closed = true;
      controller.abort();
    },
  };
};
