# WebDock — Web App Launcher OS

A mobile-style PWA home screen for your favourite web apps. Install it once, launch anything from a single page — fast, offline-capable, and optionally synced across devices via Google.

![WebDock](docs/preview.png)

---

## What It Is

WebDock turns your browser into a personal app launcher that looks and behaves like a mobile OS home screen. You add web apps as icons, swipe between pages, search, multitask between open apps in an in-app browser, and customise your wallpaper. It installs to your home screen or desktop as a standalone PWA — no browser chrome, no URL bar, just your apps.

---

## Features

- **App grid** — swipeable pages of app icons, drag to reorder, long-press edit mode
- **In-app browser** — opens apps in embedded frames with a toolbar; multitask across several at once
- **App switcher** — iOS-style card view of open apps, close individually or all at once
- **Smart icon fetching** — automatically resolves the best favicon for any URL (Google → DuckDuckGo → direct); falls back to a clean globe icon
- **Search** — filter apps by name or domain; type a URL directly to open it
- **Wallpaper picker** — 9 animated gradient themes
- **Optional cloud sync** — sign in with Google to sync your apps and wallpaper across devices (powered by Firebase); works 100% offline without it
- **PWA** — installable, offline-first, instant load after first visit
- **Zero lock-in** — all data lives in `localStorage` by default; cloud is strictly optional

---

## Getting Started

WebDock is a static site — no build step, no bundler, no dependencies to install.

### Run locally

```bash
# Any static file server works
python3 -m http.server 5299

# Or with Node
npx serve .
```

Then open `http://localhost:5299` in your browser.

### Install as a PWA

1. Serve the app over **HTTPS** (required for service workers and install prompts)
2. Open it in Chrome or Safari
3. Chrome: click the install icon in the address bar
4. Safari (iOS): Share → Add to Home Screen

Once installed, WebDock runs in standalone mode — no browser UI, launches like a native app.

---

## Deployment

Drop the files on any static host — Vercel, Netlify, GitHub Pages, Cloudflare Pages, or your own server. No server-side code is needed.

```
web-launcher-os/
├── index.html
├── app.js
├── styles.css
├── sw.js
├── manifest.json
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

**After every deploy, bump the cache version in `sw.js`** (see [Pushing Updates](#pushing-updates)).

---

## Cloud Sync (Optional)

By default the app stores everything in `localStorage` — no account needed, works offline forever.

If you want cross-device sync, wire up Firebase:

### 1. Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create a new project
3. Enable **Authentication → Sign-in method → Google**
4. Enable **Firestore Database** (start in production mode)

### 2. Add Firestore security rules

In Firestore → Rules, paste:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth.uid == uid;
    }
  }
}
```

### 3. Add your config

Open `app.js` and fill in the `FIREBASE_CONFIG` block at the top:

```js
const FIREBASE_CONFIG = {
  apiKey:            'YOUR_API_KEY',
  authDomain:        'YOUR_PROJECT.firebaseapp.com',
  projectId:         'YOUR_PROJECT_ID',
  storageBucket:     'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId:             'YOUR_APP_ID',
};
```

Find these values in Firebase Console → Project Settings → Your apps → SDK setup.

### How sync works

| State | Behaviour |
|---|---|
| Not signed in | All data in `localStorage` only |
| Sign in (first time) | Local apps uploaded to Firestore |
| Sign in (returning) | Firestore data pulled, overwrites local |
| Any save while signed in | Written to `localStorage` + Firestore simultaneously |
| Sign out | Falls back to local data only |

The green dot badge on the Sign in button indicates an active sync session.

### Swapping the backend

All Firebase logic is isolated in the `CloudSync` object near the top of `app.js`. To replace Firebase with another backend (Supabase, your own API, etc.), only rewrite `CloudSync` — nothing else in the codebase needs to change.

---

## Pushing Updates

WebDock's service worker caches the app shell for instant offline loads. This means users won't automatically get new code you deploy — **you need to tell the service worker a new version exists.**

### The rule: bump the cache name on every deploy

Open `sw.js` and increment the version string:

```js
// Before
const CACHE = 'webdock-v1';

// After your deploy
const CACHE = 'webdock-v2';
```

### What happens automatically

1. On next page load, the browser detects `sw.js` changed
2. New service worker installs in the background
3. Old cache is deleted; fresh assets are cached
4. All open tabs receive an `SW_UPDATED` message
5. A toast appears in the app: **"New update available · Refresh"**
6. User taps Refresh — instantly on the new version

If you skip the version bump, users keep the old cached files indefinitely, even after you've deployed new code.

---

## Adding & Managing Apps

### Add an app
Tap **+** in the dock → enter a URL → icon and name are auto-detected → save.

### Edit or remove an app
Tap the **pencil** icon in the dock to enter edit mode. Icons jiggle (iOS-style). Tap any icon to edit it, tap the red **−** badge to remove it.

### Reorder apps
In edit mode, drag icons to reorder them within a page or drop them onto a different page.

### Pages
Swipe left/right to move between pages. In edit mode, swipe to the last panel and tap **Add page** to create a new page, or drag apps onto an existing page to populate it.

### Custom icons
When adding or editing an app, paste any image URL in the **Custom icon URL** field to override the auto-fetched favicon.

---

## Icon Resolution

When no custom icon is set, WebDock tries these sources in order and uses the first one that returns a real image:

1. `https://www.google.com/s2/favicons?domain=...&sz=128`
2. `https://icons.duckduckgo.com/ip3/{host}.ico`
3. `https://{host}/favicon.ico`
4. **Default** — a white globe SVG icon on the app's accent colour

---

## In-App Browser

Tapping an app opens it in an embedded `<iframe>`. A toolbar at the top provides:

- **Home** — return to the launcher (app keeps running in the background)
- **Reload** — refresh the current app
- **External link** — open the app in a real browser tab
- **App switcher** — see all open apps as cards, tap to switch, swipe to close

### Sites that block embedding

Some sites send `X-Frame-Options: DENY` or `Content-Security-Policy: frame-ancestors 'none'` — these cannot run inside an iframe. If a site hasn't loaded after 12 seconds, a soft overlay appears with two options:

- **Wait** — dismisses the overlay; the iframe stays alive in case the site is slow
- **Open in new tab** — opens the URL in a full browser tab

---

## Customisation

### Wallpapers
Tap the **image** icon in the dock to open the wallpaper picker. 9 gradient themes are built in.

To add a new wallpaper, add an entry to the `WALLPAPERS` array in `app.js`:

```js
{ id: 'my-theme', css: 'linear-gradient(160deg, #hex1 0%, #hex2 100%)' }
```

> **Do not rename or reuse existing IDs.** The ID is the stored key — renaming it breaks the saved preference for existing users.

### Accent colours
Each app has an accent colour used as the icon background when no favicon is available, and in the app switcher card. 12 colours are available in the Add/Edit modal.

To add more colours, append hex values to the `COLORS` array in `app.js`.

---

## PWA Icons

The icons in `icons/` were generated by `gen-icons.mjs` (a zero-dependency Node script). To regenerate or customise them:

```bash
node gen-icons.mjs
```

For production, replace `icons/icon-192.png` and `icons/icon-512.png` with properly designed assets. Both should be square PNGs. The manifest declares them as `maskable` — design with a safe zone of ~10% padding on all sides so they display correctly on Android adaptive icon shapes.

---

## Tech Stack

| Concern | Solution |
|---|---|
| UI framework | None — vanilla JS + DOM |
| Styling | Tailwind CSS (CDN) |
| Icons | Lucide (CDN, ES module) |
| Storage | `localStorage` (primary) + Firestore (optional sync) |
| Auth | Firebase Authentication (Google sign-in) |
| Offline | Service Worker with cache-first shell strategy |
| Fonts | Inter via Google Fonts |
| Favicons | Google Favicon API + DuckDuckGo + direct fallback |

No build step. No bundler. No `node_modules`. The entire app ships as static files.

---

## Browser Support

| Browser | Support |
|---|---|
| Chrome / Edge | Full — including PWA install |
| Safari (iOS 16.4+) | Full — including PWA install via Add to Home Screen |
| Firefox | Full — PWA install not supported on desktop Firefox |
| Samsung Internet | Full |

Service workers require HTTPS (or `localhost`).

---

## Developer Docs

See [`docs/architecture.md`](docs/architecture.md) for a deeper walkthrough of the storage model, sync adapter, service worker strategies, icon waterfall, iframe detection, and data schemas.
