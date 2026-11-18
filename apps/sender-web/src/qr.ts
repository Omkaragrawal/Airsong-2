import { renderSVG } from 'uqr';

/** Returns an inline SVG string encoding `text` as a QR code. */
export function renderQrSvg(text: string): string {
  return renderSVG(text, { border: 2 });
}
