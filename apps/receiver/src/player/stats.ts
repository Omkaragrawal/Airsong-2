export type PlaybackStatsType = {
  bitrateKbps: number;
  packetsLost: number;
  jitterMs: number;
  /** Average jitter-buffer delay — the playout latency the buffer adds, in milliseconds. */
  jitterBufferMs: number;
};

type InboundAudioStatsType = {
  bytesReceived: number;
  packetsLost: number;
  jitter: number;
  jitterBufferDelay: number;
  jitterBufferEmittedCount: number;
  timestamp: number;
};

function numberField(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === 'number' ? value : 0;
}

/** Narrows one raw getStats entry to an inbound audio report, or null if it is something else. */
function asInboundAudio(value: unknown): InboundAudioStatsType | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record['type'] !== 'inbound-rtp' || record['kind'] !== 'audio') {
    return null;
  }
  return {
    bytesReceived: numberField(record, 'bytesReceived'),
    packetsLost: numberField(record, 'packetsLost'),
    jitter: numberField(record, 'jitter'),
    jitterBufferDelay: numberField(record, 'jitterBufferDelay'),
    jitterBufferEmittedCount: numberField(record, 'jitterBufferEmittedCount'),
    timestamp: numberField(record, 'timestamp'),
  };
}

/**
 * Polls `pc.getStats()` for the inbound audio track and reports bitrate, packet loss, jitter
 * and jitter-buffer latency once per `intervalMs`. Returns a function that stops polling.
 */
export function createStatsPoller(
  pc: RTCPeerConnection,
  onStats: (stats: PlaybackStatsType) => void,
  intervalMs = 1000,
): () => void {
  let lastBytes = 0;
  let lastTimestamp = 0;

  const poll = async (): Promise<void> => {
    const report = await pc.getStats();
    const candidates: InboundAudioStatsType[] = [];
    report.forEach((value: unknown): void => {
      const parsed = asInboundAudio(value);
      if (parsed !== null) {
        candidates.push(parsed);
      }
    });
    const inbound = candidates[0];
    if (inbound === undefined) {
      return;
    }

    const deltaMs = inbound.timestamp - lastTimestamp;
    const deltaBytes = inbound.bytesReceived - lastBytes;
    const bitrateKbps = lastTimestamp > 0 && deltaMs > 0 ? Math.round((deltaBytes * 8) / deltaMs) : 0;
    lastBytes = inbound.bytesReceived;
    lastTimestamp = inbound.timestamp;

    const jitterBufferMs =
      inbound.jitterBufferEmittedCount > 0
        ? Math.round((inbound.jitterBufferDelay / inbound.jitterBufferEmittedCount) * 1000)
        : 0;

    onStats({
      bitrateKbps,
      packetsLost: inbound.packetsLost,
      jitterMs: Math.round(inbound.jitter * 1000),
      jitterBufferMs,
    });
  };

  const timer = setInterval((): void => {
    void poll();
  }, intervalMs);

  return (): void => {
    clearInterval(timer);
  };
}
