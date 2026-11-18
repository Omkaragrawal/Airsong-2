import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Generates placeholder PWA icons from one source SVG. Replace public/logo.svg with real art later.
export default defineConfig({
  preset: minimal2023Preset,
  images: ['public/logo.svg'],
});
