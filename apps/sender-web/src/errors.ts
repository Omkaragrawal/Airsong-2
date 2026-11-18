/** Every failure the sender surfaces to the user, as a stable UI state. */
export enum SenderWebErrorEnum {
  UNSUPPORTED = 'UNSUPPORTED',
  CAPTURE_FAILED = 'CAPTURE_FAILED',
  NO_AUDIO_TRACK = 'NO_AUDIO_TRACK',
  SESSION_FAILED = 'SESSION_FAILED',
}

/** An error with a UI-facing {@link SenderWebErrorEnum} kind and a human-readable message. */
export class SenderWebError extends Error {
  public readonly kind: SenderWebErrorEnum;

  public constructor(kind: SenderWebErrorEnum, message: string) {
    super(message);
    this.name = 'SenderWebError';
    this.kind = kind;
  }
}

const USER_MESSAGES: Record<SenderWebErrorEnum, string> = {
  [SenderWebErrorEnum.UNSUPPORTED]: 'This browser cannot share system audio. Use Chrome or Edge on desktop.',
  [SenderWebErrorEnum.CAPTURE_FAILED]: 'Sharing was cancelled or blocked. Try again and allow access.',
  [SenderWebErrorEnum.NO_AUDIO_TRACK]: "No audio was shared. In the picker, tick 'Share system/tab audio'.",
  [SenderWebErrorEnum.SESSION_FAILED]: "Couldn't start the session. Check your connection and try again.",
};

/** The message shown to the user for a given error kind. */
export function userMessageFor(kind: SenderWebErrorEnum): string {
  return USER_MESSAGES[kind];
}

/** Narrows an unknown thrown value to a {@link SenderWebError}, mapping anything unexpected to SESSION_FAILED. */
export function toSenderError(error: unknown): SenderWebError {
  if (error instanceof SenderWebError) {
    return error;
  }
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return new SenderWebError(SenderWebErrorEnum.SESSION_FAILED, message);
}
