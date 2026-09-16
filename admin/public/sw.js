// Web Push service worker for the DocuCenter admin console.
//
// This is the piece that lets a notification pop up on your phone even when
// this tab (or the browser entirely) isn't open — the browser wakes this
// worker in the background when a push arrives. No caching/offline logic is
// implemented here on purpose; this app is always-online admin tooling, not
// an offline-first app, so this worker exists solely to receive pushes.

self.addEventListener('push', (event) => {
  let data = { title: 'DocuCenter', body: 'You have a new notification.', url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Non-JSON payload — fall back to the defaults above.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon.png',
      badge: '/icon.png',
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url === targetUrl && 'focus' in client) return client.focus();
      }
      if (clientsList.length > 0 && 'focus' in clientsList[0]) {
        return clientsList[0].focus().then((c) => c.navigate(targetUrl));
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
