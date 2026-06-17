/**
 * Self-destroying service worker.
 *
 * The previous build shipped a Workbox precaching SW that cached hashed build
 * assets (e.g. index-XXXX.js). After every redeploy the asset hashes change,
 * so the stale SW served old chunks alongside new ones — a version skew that
 * crashed the app with React error #418 (hydration mismatch).
 *
 * This replacement does the opposite: it takes over from any previously
 * installed SW, deletes all caches, unregisters itself, and reloads open tabs
 * so they fetch fresh assets straight from the network. Nothing in the app
 * registers a service worker anymore, so once this has run there is no SW left.
 */

self.addEventListener("install", () => {
  // Activate immediately, replacing the old (stale) service worker.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 1. Drop every cache the old Workbox SW created.
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch (e) {
        /* ignore */
      }
      // 2. Remove this registration so no SW remains.
      try {
        await self.registration.unregister();
      } catch (e) {
        /* ignore */
      }
      // 3. Reload any open tabs so they load fresh assets from the network.
      try {
        const clients = await self.clients.matchAll({ type: "window" });
        for (const client of clients) {
          client.navigate(client.url);
        }
      } catch (e) {
        /* ignore */
      }
    })()
  );
});

// No fetch handler on purpose: with none, the browser bypasses the SW for all
// requests and always goes to the network.
