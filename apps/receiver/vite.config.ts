import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig, loadEnv } from 'vite';

// The receiver is a no-framework Vite + TS PWA. In dev, /api is proxied to the AdonisJS server.
export default defineConfig(({ mode }) => {
  // VITE_TEST_HOOKS=1 compiles the E2E test hook in; normal builds fold it out as dead code.
  const env = loadEnv(mode, '.', 'VITE_');
  const testHooks = env['VITE_TEST_HOOKS'] === '1';

  return {
    base: '/',
    define: {
      __AIRSONG_TEST_HOOKS__: JSON.stringify(testHooks),
    },
    plugins: [
      VitePWA({
        // A custom service worker (src/sw.ts) with the precache manifest injected into it.
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        injectRegister: 'auto',
        manifest: {
          name: 'Airsong Receiver',
          short_name: 'Airsong',
          // Placeholder icons for now; replace with real branding later.
          description: 'Plays audio streamed from another device. Placeholder icons.',
          start_url: '/',
          display: 'standalone',
          background_color: '#0b0b0f',
          theme_color: '#0b0b0f',
          icons: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        },
        devOptions: { enabled: false },
      }),
    ],
    server: {
      proxy: {
        // Dev-only: forward the API to the AdonisJS server on :3333.
        '/api': { target: 'http://localhost:3333', changeOrigin: true },
      },
    },
  };
});
