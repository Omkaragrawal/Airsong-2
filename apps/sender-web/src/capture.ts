import { SenderWebError, SenderWebErrorEnum } from './errors.js';

/** getDisplayMedia constraints, incl. fields newer than the DOM lib types (systemAudio, selfBrowserSurface). */
type DisplayAudioConstraintsType = {
  video: boolean;
  audio: { echoCancellation: boolean; noiseSuppression: boolean; autoGainControl: boolean };
  systemAudio: string;
  selfBrowserSurface: string;
};

/**
 * Captures system/tab audio via getDisplayMedia. The video track is stopped immediately (we only
 * want audio), and a missing audio track becomes a clear error telling the user to tick
 * "Share system/tab audio".
 */
export async function captureDisplayAudio(): Promise<MediaStreamTrack> {
  const constraints: DisplayAudioConstraintsType = {
    video: true,
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    systemAudio: 'include',
    selfBrowserSurface: 'exclude',
  };

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia(constraints);
  } catch {
    throw new SenderWebError(SenderWebErrorEnum.CAPTURE_FAILED, 'Screen or audio sharing was cancelled or blocked.');
  }

  for (const videoTrack of stream.getVideoTracks()) {
    videoTrack.stop();
  }

  const audioTrack = stream.getAudioTracks()[0];
  if (audioTrack === undefined) {
    for (const track of stream.getTracks()) {
      track.stop();
    }
    throw new SenderWebError(SenderWebErrorEnum.NO_AUDIO_TRACK, 'No audio track was shared.');
  }
  return audioTrack;
}

/** A 440 Hz test tone as a MediaStreamTrack. Dev/test only — gated by `__AIRSONG_TEST_TONE__`. */
export function createTestToneTrack(): MediaStreamTrack {
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  oscillator.frequency.value = 440;
  const destination = context.createMediaStreamDestination();
  oscillator.connect(destination);
  oscillator.start();
  const track = destination.stream.getAudioTracks()[0];
  if (track === undefined) {
    throw new SenderWebError(SenderWebErrorEnum.NO_AUDIO_TRACK, 'The test tone produced no audio track.');
  }
  return track;
}
