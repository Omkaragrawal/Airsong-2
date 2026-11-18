import {
  type AnswerBodyType,
  type CreateSessionBodyType,
  type CreateSessionResponseType,
  type OfferEventType,
  createSessionResponseSchema,
  ErrorCodeEnum,
  offerEventSchema,
  SseEventEnum,
  viewerLeftEventSchema,
} from '@airsong/protocol';

import { SenderError } from '../sender_error.js';
import { type AnswerResultType, type SenderSession, type WarningListenerType } from '../sender_session.js';

/** One server-sent event: the `event:` name and the raw `data:` text. */
export type EventStreamMessageType = {
  event: string;
  data: string;
};

/** Why a stream ended. `status` is the HTTP status when the server refused the connection. */
export type EventStreamErrorType = {
  status?: number;
  cause?: unknown;
};

export type EventStreamOptionsType = {
  url: string;
  headers: Record<string, string>;
  onOpen: () => void;
  onMessage: (message: EventStreamMessageType) => void;
  /** Called once when the stream ends for any reason other than `close()`. */
  onError: (error: EventStreamErrorType) => void;
};

export type EventStreamType = {
  close(): void;
};

/**
 * Opens one server-sent-event stream. Each runtime passes its own: fetch streaming in browsers
 * and Electron, an SSE library in React Native. It must not reconnect by itself, because the
 * transport does that with its own delays.
 */
export type EventStreamFactoryType = (options: EventStreamOptionsType) => EventStreamType;

export enum TransportStateEnum {
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  RECONNECTING = 'RECONNECTING',
  CLOSED = 'CLOSED',
}

export type TransportStateListenerType = (state: TransportStateEnum) => void;

export type WebSignalingTransportOptionsType = {
  /** The server's origin, for example `https://airsong.example`. */
  baseUrl: string;
  eventStream: EventStreamFactoryType;
  session: SenderSession;
  onWarning?: WarningListenerType;
};

const RECONNECT_INITIAL_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 15_000;
const REQUEST_TIMEOUT_MS = 10_000;

/** Statuses that mean the session no longer exists on the server, so reconnecting can't help. */
const SESSION_GONE_STATUSES: ReadonlySet<number> = new Set([401, 404]);

const JSON_HEADERS = { 'content-type': 'application/json' };

/**
 * Web-mode signaling: creates the session on the server, listens on its event stream, and
 * answers each receiver's offer through the `SenderSession`.
 */
export class WebSignalingTransport {
  private readonly baseUrl: string;

  private readonly eventStream: EventStreamFactoryType;

  private readonly session: SenderSession;

  private readonly onWarning: WarningListenerType;

  private readonly stateListeners = new Set<TransportStateListenerType>();

  private currentState = TransportStateEnum.CLOSED;

  private created: CreateSessionResponseType | null = null;

  /** Goes up on every `start()` and `stop()`, so a `start()` can tell that `stop()` ran while it waited. */
  private runId = 0;

  private stream: EventStreamType | null = null;

  /** Goes up each time a stream is opened or dropped, so callbacks from an old stream are ignored. */
  private streamGeneration = 0;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private reconnectDelayMs = RECONNECT_INITIAL_DELAY_MS;

  public constructor(options: WebSignalingTransportOptionsType) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.eventStream = options.eventStream;
    this.session = options.session;
    this.onWarning = options.onWarning ?? ((): void => undefined);
  }

  public get state(): TransportStateEnum {
    return this.currentState;
  }

  /** Calls the listener whenever the state changes. Returns a function that stops the calls. */
  public onStateChange(listener: TransportStateListenerType): () => void {
    this.stateListeners.add(listener);
    return (): void => {
      this.stateListeners.delete(listener);
    };
  }

  /** Creates the session on the server and starts listening for receivers. */
  public async start(body: CreateSessionBodyType): Promise<CreateSessionResponseType> {
    if (this.currentState !== TransportStateEnum.CLOSED) {
      throw new Error('The transport is already started');
    }
    this.runId += 1;
    const runId = this.runId;
    this.setState(TransportStateEnum.CONNECTING);
    let created: CreateSessionResponseType;
    try {
      created = await this.createSession(body);
    } catch (error) {
      if (runId === this.runId) {
        this.setState(TransportStateEnum.CLOSED);
      }
      throw error;
    }
    if (runId !== this.runId) {
      // `stop()` ran while the server was creating the session, so nothing would ever delete it.
      await this.deleteSession(created);
      throw new Error('The transport was stopped before the session was ready');
    }
    this.created = created;
    this.openStream();
    return created;
  }

  /** Stops listening and deletes the session on the server. Receivers already connected keep playing. */
  public async stop(): Promise<void> {
    this.runId += 1;
    const created = this.created;
    this.created = null;
    this.dropStream();
    this.setState(TransportStateEnum.CLOSED);
    if (created !== null) {
      await this.deleteSession(created);
    }
  }

  private async createSession(body: CreateSessionBodyType): Promise<CreateSessionResponseType> {
    return withTimeout('Creating the session', async (signal) => {
      const response = await fetch(`${this.baseUrl}/api/sessions`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
        signal,
      });
      if (!response.ok) {
        await discardBody(response);
        throw new Error(`Creating the session failed with HTTP status ${response.status}`);
      }
      return createSessionResponseSchema.parse(await response.json());
    });
  }

  /** Never rejects: the session expires on the server by itself, so a failed delete is only reported. */
  private async deleteSession(created: CreateSessionResponseType): Promise<void> {
    try {
      await withTimeout('Deleting the session', async (signal) => {
        const response = await fetch(this.sessionUrl(created), {
          method: 'DELETE',
          headers: this.authorizationHeader(created),
          signal,
        });
        await discardBody(response);
        if (!response.ok) {
          this.onWarning(`Deleting the session failed with HTTP status ${response.status}`);
        }
      });
    } catch (cause) {
      this.onWarning('Deleting the session failed', cause);
    }
  }

  private sessionUrl(created: CreateSessionResponseType): string {
    return `${this.baseUrl}/api/sessions/${encodeURIComponent(created.sessionId)}`;
  }

  private authorizationHeader(created: CreateSessionResponseType): Record<string, string> {
    return { authorization: `Bearer ${created.senderToken}` };
  }

  private setState(state: TransportStateEnum): void {
    if (this.currentState === state) {
      return;
    }
    this.currentState = state;
    for (const listener of this.stateListeners) {
      try {
        listener(state);
      } catch (cause) {
        this.onWarning('A transport-state listener threw an error', cause);
      }
    }
  }

  private openStream(): void {
    const created = this.created;
    if (created === null) {
      return;
    }
    this.streamGeneration += 1;
    const generation = this.streamGeneration;
    const isCurrent = (): boolean => generation === this.streamGeneration;
    this.stream = this.eventStream({
      url: `${this.sessionUrl(created)}/events`,
      headers: this.authorizationHeader(created),
      onOpen: (): void => {
        if (isCurrent()) {
          this.reconnectDelayMs = RECONNECT_INITIAL_DELAY_MS;
          this.setState(TransportStateEnum.CONNECTED);
        }
      },
      onMessage: (message): void => {
        if (isCurrent()) {
          void this.handleMessage(created, message);
        }
      },
      onError: (error): void => {
        if (isCurrent()) {
          this.handleStreamError(error);
        }
      },
    });
  }

  private dropStream(): void {
    this.streamGeneration += 1;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stream?.close();
    this.stream = null;
  }

  private handleStreamError(error: EventStreamErrorType): void {
    this.dropStream();
    if (error.status !== undefined && SESSION_GONE_STATUSES.has(error.status)) {
      this.created = null;
      this.onWarning(`The server no longer has this session (HTTP status ${error.status})`, error.cause);
      this.setState(TransportStateEnum.CLOSED);
      return;
    }
    this.setState(TransportStateEnum.RECONNECTING);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openStream();
    }, this.reconnectDelayMs);
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, RECONNECT_MAX_DELAY_MS);
  }

  /** Never rejects: every failure is reported through `onWarning`, so one bad event can't stop the stream. */
  private async handleMessage(created: CreateSessionResponseType, message: EventStreamMessageType): Promise<void> {
    try {
      if (message.event === SseEventEnum.PING.valueOf()) {
        return;
      }
      if (message.event === SseEventEnum.OFFER.valueOf()) {
        const offer = offerEventSchema.safeParse(parseJson(message.data));
        if (!offer.success) {
          this.onWarning('Dropped an OFFER event with invalid data', offer.error);
          return;
        }
        await this.answerOffer(created, offer.data);
        return;
      }
      if (message.event === SseEventEnum.VIEWER_LEFT.valueOf()) {
        const viewerLeft = viewerLeftEventSchema.safeParse(parseJson(message.data));
        if (!viewerLeft.success) {
          this.onWarning('Dropped a VIEWER_LEFT event with invalid data', viewerLeft.error);
          return;
        }
        this.session.removeViewer(viewerLeft.data.viewerId);
        return;
      }
      this.onWarning(`Dropped an event with the unknown name "${message.event}"`);
    } catch (cause) {
      this.onWarning('Handling a server event failed', cause);
    }
  }

  private async answerOffer(created: CreateSessionResponseType, offer: OfferEventType): Promise<void> {
    const viewerId = offer.viewerId;
    let result: AnswerResultType;
    try {
      result = await this.session.answer(viewerId, offer.sdp, offer.viewerName);
    } catch (cause) {
      this.onWarning(`Could not answer viewer ${viewerId}`, cause);
      const code = cause instanceof SenderError ? cause.code : ErrorCodeEnum.INTERNAL_ERROR;
      await this.postAnswer(created, viewerId, { error: code });
      return;
    }
    try {
      await this.postAnswer(created, viewerId, { sdp: result.sdp });
    } catch (cause) {
      // The receiver never got the answer, so its connection can't complete — but remove only
      // THIS connection, not a newer offer that replaced it while the post was in flight.
      this.session.removeViewerIfCurrent(viewerId, result.generation);
      throw cause;
    }
  }

  private async postAnswer(created: CreateSessionResponseType, viewerId: string, body: AnswerBodyType): Promise<void> {
    await withTimeout(`Sending the answer for viewer ${viewerId}`, async (signal) => {
      const response = await fetch(`${this.sessionUrl(created)}/answers/${encodeURIComponent(viewerId)}`, {
        method: 'POST',
        headers: { ...JSON_HEADERS, ...this.authorizationHeader(created) },
        body: JSON.stringify(body),
        signal,
      });
      await discardBody(response);
      if (!response.ok) {
        throw new Error(`Sending the answer for viewer ${viewerId} failed with HTTP status ${response.status}`);
      }
    });
  }
}

/**
 * Runs one HTTP exchange with a time limit, so a server that never answers can't leave the
 * caller waiting forever. It uses a timer and an `AbortController` because `AbortSignal.timeout`
 * doesn't exist in React Native.
 */
async function withTimeout<ResultType>(
  what: string,
  run: (signal: AbortSignal) => Promise<ResultType>,
): Promise<ResultType> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  try {
    return await run(controller.signal);
  } catch (cause) {
    // Only the timer above aborts this controller, so an aborted signal means the time ran out.
    if (controller.signal.aborted) {
      throw new Error(`${what} timed out after ${REQUEST_TIMEOUT_MS} ms`, { cause });
    }
    throw cause;
  } finally {
    clearTimeout(timer);
  }
}

/** Releases a response whose body won't be read, so its connection isn't held open. */
async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The body is being thrown away, so a failure to cancel it changes nothing.
  }
}

/** Returns `undefined` for text that isn't JSON, which the event schemas then reject. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
