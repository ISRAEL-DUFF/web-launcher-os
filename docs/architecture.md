# WebDock — Architecture & Developer Guide

## Overview

WebDock is a browser-based PWA app launcher. It works fully offline, supports optional Google account sync, and installs to the home screen like a native app. The entire codebase is three files: `index.html`, `app.js`, `styles.css` — plus the PWA assets.

---

## File Structure

```
web-launcher-os/
├── index.html          # Shell — markup, PWA meta tags, no logic
├── app.js              # All application logic (ES module)
├── styles.css          # Custom styles (Tailwind handles the rest)
├── sw.js               # Service worker — caching + update notifications
├── manifest.json       # PWA manifest — install metadata, icons
├── docs/
│   └── architecture.md # This file
├── icons/
│   ├── icon-192.png    # PWA home screen icon (generated via gen-icons.mjs)
│   └── icon-512.png
└── gen-icons.mjs       # One-time icon generator script (Node, no deps)
```

---

## Storage

Data is stored in two layers simultaneously:

| Layer | When active | What's stored |
|---|---|---|
| `localStorage` | Always | Apps, page count, wallpaper ID |
| Firestore (`users/{uid}/data/launcher`) | Signed in only | Same payload as localStorage |

`localStorage` is always written first. Firestore is written on top if the user is signed in. On sign-in, Firestore wins — local data is overwritten with the cloud copy (or uploaded if the user has no cloud data yet).

### Keys
- `webdock_apps_v1` — JSON array of app objects
- `webdock_pages_v1` — page count integer as string
- `webdock_wallpaper_v1` — wallpaper ID string

---

## Cloud Sync (Firebase)

All Firebase logic is isolated in the `CloudSync` adapter object at the top of `app.js`. To swap Firebase for a different backend, only modify `CloudSync` — nothing else in the file needs to change.

### Setup
1. Create a Firebase project at console.firebase.google.com
2. Enable **Authentication → Google** provider
3. Enable **Firestore Database**
4. Fill in `FIREBASE_CONFIG` at the top of `app.js`

### Firestore security rules
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

### Behaviour without config
If `FIREBASE_CONFIG` contains placeholder values, Firebase init fails silently. The app falls back to `localStorage` only. Users who never tap "Sign in" are unaffected.

---

## PWA & Service Worker

### How caching works (`sw.js`)

| Asset type | Strategy |
|---|---|
| Shell (`index.html`, `app.js`, `styles.css`, `manifest.json`) | Cache-first — served instantly from cache |
| CDN assets (Tailwind, Lucide, Google Fonts) | Stale-while-revalidate — cached after first load |
| Everything else (Firebase, favicons, app iframes) | Network-first |

### ⚠️ How to push an update to users

**Every time you deploy a new version, you must bump the cache version in `sw.js`:**

```js
// sw.js — line 1
const CACHE = 'webdock-v1'; // change to webdock-v2, webdock-v3, etc.
```

**What happens automatically after that:**
1. Browser detects `sw.js` changed on the user's next page load
2. New SW installs, wipes the old cache, recaches all fresh shell assets
3. SW sends a `SW_UPDATED` message to all open tabs
4. A persistent toast appears in the app: **"New update available · Refresh"**
5. User taps Refresh — gets the new version instantly

If you forget to bump the cache name, users will keep getting the old cached files indefinitely.

---

## Icon Loading

App icons are resolved through a waterfall of sources (`resolveFavicon` in `app.js`):

1. **Google Favicon API** — `https://www.google.com/s2/favicons?domain=...&sz=128`
2. **DuckDuckGo** — `https://icons.duckduckgo.com/ip3/{host}.ico`
3. **Direct** — `https://{host}/favicon.ico`
4. **Default** — inline SVG globe icon (white, transparent background)

Each source is tried in order; the first one that returns a real image (width > 4px) wins. Users can override with a custom icon URL in the Add/Edit modal.

---

## App Object Schema

```js
{
  id:    string,   // random e.g. "a3f9xk2m"
  name:  string,   // display name
  url:   string,   // full URL e.g. "https://github.com"
  color: string,   // hex accent color e.g. "#6366f1"
  icon:  string,   // custom icon URL, or "" to use auto-resolved favicon
  page:  number,   // 0-indexed page number
}
```

---

## Iframe Embedding & Block Detection

Apps open in `<iframe>` elements inside `#frameHost`. Sites that block embedding (via `X-Frame-Options` or CSP `frame-ancestors`) won't load.

Detection: if the iframe's `load` event hasn't fired within **12 seconds**, a soft overlay appears offering "Wait" or "Open in new tab". The iframe is not killed — it stays alive in case the site is just slow.

The load listener is attached **before** the iframe is appended to the DOM to avoid a race condition with fast/cached responses.

---

## Adding a New Wallpaper

Add an entry to the `WALLPAPERS` array in `app.js`:

```js
{ id: 'my-theme', css: 'linear-gradient(160deg, #hex1 0%, #hex2 100%)' }
```

The `id` is used as the stored key in `localStorage`/Firestore. Don't reuse or rename existing IDs — existing users would lose their wallpaper preference.
