export type AudioControllerType = {
  readonly element: HTMLAudioElement;
  /** True when programmatic volume changes take effect (false on iOS, where volume is fixed). */
  readonly volumeSupported: boolean;
  attach: (stream: MediaStream) => void;
  play: () => Promise<void>;
  setVolume: (value: number) => void;
  destroy: () => void;
};

const VOLUME_PROBE = 0.5;

/**
 * Feature-test (never a user-agent sniff): set a probe volume and read it back. iOS Safari
 * fixes media-element volume at 1 and ignores writes, so if the probe did not stick the app
 * hides its volume slider.
 */
function detectVolumeSupport(element: HTMLAudioElement): boolean {
  const original = element.volume;
  element.volume = VOLUME_PROBE;
  const supported = Math.abs(element.volume - VOLUME_PROBE) < 0.01;
  element.volume = original;
  return supported;
}

export function createAudio(): AudioControllerType {
  const element = new Audio();
  element.autoplay = true;
  // iOS needs this to play inline rather than taking over the screen.
  element.setAttribute('playsinline', '');
  // Keep it out of the layout; audio plays without being visible.
  element.style.display = 'none';
  document.body.append(element);

  const volumeSupported = detectVolumeSupport(element);

  const attach = (stream: MediaStream): void => {
    element.srcObject = stream;
  };

  const play = async (): Promise<void> => {
    await element.play();
  };

  const setVolume = (value: number): void => {
    element.volume = Math.max(0, Math.min(1, value));
  };

  const destroy = (): void => {
    element.pause();
    element.srcObject = null;
    element.remove();
  };

  return { element, volumeSupported, attach, play, setVolume, destroy };
}
