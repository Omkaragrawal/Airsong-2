/** Opus format parameters, as written on an SDP `a=fmtp` line. */
export type OpusParamsType = Readonly<Record<string, string | number>>;

/** The Opus settings each side asks for: stereo music at a fixed, high bitrate. */
export const OpusParamsConst = {
  RECEIVER: { stereo: 1 },
  SENDER: {
    'stereo': 1,
    'sprop-stereo': 1,
    'maxaveragebitrate': 128_000,
    'useinbandfec': 1,
    'usedtx': 0,
  },
} as const satisfies Record<string, OpusParamsType>;

const OPUS_RTPMAP_PATTERN = /^a=rtpmap:(\d+) opus\/48000\/2$/i;

function mergeFormatParams(existing: string, params: OpusParamsType): string {
  const merged = new Map<string, string>();
  for (const pair of existing.split(';')) {
    const trimmed = pair.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      merged.set(trimmed, '');
    } else {
      merged.set(trimmed.slice(0, separatorIndex), trimmed.slice(separatorIndex + 1));
    }
  }
  for (const [key, value] of Object.entries(params)) {
    merged.set(key, String(value));
  }
  return [...merged].map(([key, value]) => (value === '' ? key : `${key}=${value}`)).join(';');
}

/**
 * Sets Opus parameters in an SDP. It finds Opus's payload type, then merges `params` into that
 * payload type's `a=fmtp` line: a key that is already there gets the new value, so no key
 * appears twice. An SDP without Opus is returned unchanged.
 */
export function tuneOpusSdp(sdp: string, params: OpusParamsType): string {
  const lineBreak = sdp.includes('\r\n') ? '\r\n' : '\n';
  const lines = sdp.split(lineBreak);

  let payloadType: string | undefined;
  let rtpmapIndex = -1;
  for (const [index, line] of lines.entries()) {
    const match = OPUS_RTPMAP_PATTERN.exec(line.trim());
    if (match?.[1] !== undefined) {
      payloadType = match[1];
      rtpmapIndex = index;
      break;
    }
  }
  if (payloadType === undefined) {
    return sdp;
  }

  const fmtpPrefix = `a=fmtp:${payloadType} `;
  const fmtpIndex = lines.findIndex((line) => line.startsWith(fmtpPrefix));
  const existing = lines[fmtpIndex]?.slice(fmtpPrefix.length) ?? '';
  const fmtpLine = `${fmtpPrefix}${mergeFormatParams(existing, params)}`;
  if (fmtpIndex === -1) {
    lines.splice(rtpmapIndex + 1, 0, fmtpLine);
  } else {
    lines[fmtpIndex] = fmtpLine;
  }
  return lines.join(lineBreak);
}
