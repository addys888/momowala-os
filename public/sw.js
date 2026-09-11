/* Cartlyft service worker — shows push notifications and focuses the app when
   one is tapped. Two kinds arrive here:
     • reminders  (api/cron/reminders)      — load stock / reconcile nudges
     • new orders (api/notify-order + cron/pending-alerts) — a customer QR order
       is waiting to be accepted. These carry a vibrate pattern and renotify, and
       repeat until staff accepts or rejects, like the delivery-partner apps. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  const title = data.title || 'Cartlyft';
  const isOrder = /^order-/.test(data.tag || '');
  const options = {
    body: data.body || '',
    icon: '/momowala-logo.png',
    badge: '/momowala-logo.png',
    tag: data.tag || 'reminder',
    // Repeat rings reuse the tag so they replace rather than stack; renotify
    // makes each replacement alert (buzz/sound) again instead of arriving silently.
    renotify: data.renotify !== false,
    requireInteraction: data.requireInteraction !== false,
    vibrate: data.vibrate || (isOrder ? [500, 200, 500, 200, 700] : undefined),
    actions: isOrder ? [{ action: 'open', title: 'View order' }] : [],
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Prefer an already-open app window — focus it and steer it to the target
    // screen, so tapping an order alert lands on the accept/reject card.
    for (const c of all) {
      if ('focus' in c) {
        try { if ('navigate' in c && url) await c.navigate(url); } catch { /* cross-origin or unsupported */ }
        return c.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});
