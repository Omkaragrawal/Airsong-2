/// <reference lib="WebWorker" />
import { type PrecacheEntry, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { readonly __WB_MANIFEST: Array<PrecacheEntry | string> };

// Precache the built app shell (the manifest is injected here at build time).
precacheAndRoute(self.__WB_MANIFEST);

// Single-page app: serve index.html for navigations, but never shadow the API.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//] }));

self.addEventListener('install', (): void => {
  void self.skipWaiting();
});
self.addEventListener('activate', (): void => {
  void self.clients.claim();
});
