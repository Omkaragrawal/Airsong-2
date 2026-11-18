import { defineConfig, loadEnv } from 'vite';

// The sender-web app is served under /send/ (the server mounts the receiver at / and this at /send/).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  // The test-tone source is for dev and explicit test builds only; a normal production build folds it out.
  const testTone = mode !== 'production' || env['VITE_TEST_HOOKS'] === '1';

  return {
    base: '/send/',
    define: {
      __AIRSONG_TEST_TONE__: JSON.stringify(testTone),
    },
    server: {
      proxy: {
        // Dev-only: forward the API to the AdonisJS server on :3333.
        '/api': { target: 'http://localhost:3333', changeOrigin: true },
      },
    },
  };
});
