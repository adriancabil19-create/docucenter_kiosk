import type { MetadataRoute } from 'next';

// Without a Web App Manifest, "Add to Home Screen" isn't a real installable
// PWA action — mobile browsers (Android Chrome in particular) fall back to
// screenshotting whatever the current page looks like for the home-screen
// icon instead of using the site's actual logo. That's why the icon looked
// right after adding from the Dashboard (logo is a fixed, prominent element
// there) but not from /login (a smaller, centered mark that a screenshot
// crop can miss). This file makes the icon explicit and consistent on every
// page — Next.js serves this at /manifest.webmanifest automatically.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'DocuCenter Admin',
    short_name: 'DocuCenter',
    description: 'Admin console for the DocuCenter Kiosk',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#2563eb',
    // Chrome's installability check requires BOTH a 192px and a 512px icon —
    // with only the 512s listed here it silently refused to fire
    // `beforeinstallprompt`, so the install card never appeared on Android.
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
