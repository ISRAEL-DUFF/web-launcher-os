import { createIcons, icons } from 'https://cdn.jsdelivr.net/npm/lucide@latest/+esm';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

/* ================================================================
   FIREBASE CONFIG — replace with your project values
   Firebase Console → Project Settings → Your apps → SDK setup
   ================================================================ */
const FIREBASE_CONFIG = {
  apiKey:            'YOUR_API_KEY',
  authDomain:        'YOUR_PROJECT.firebaseapp.com',
  projectId:         'YOUR_PROJECT_ID',
  storageBucket:     'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId:             'YOUR_APP_ID',
};

/* ================================================================
   CLOUD SYNC ADAPTER
   Swap this object's methods to change the backend — nothing else
   in the file needs to change.
   ================================================================ */
let _db = null;
let _auth = null;
let _firebaseReady = false;

function initFirebase() {
  if (_firebaseReady) return;
  try {
    const app = initializeApp(FIREBASE_CONFIG);
    _auth = getAuth(app);
    _db   = getFirestore(app);
    _firebaseReady = true;
  } catch (e) {
    console.warn('Firebase init failed — running offline only', e);
  }
}

const CloudSync = {
  /** Returns the signed-in user object, or null */
  currentUser() { return _auth?.currentUser ?? null; },

  /** Trigger Google sign-in popup */
  async signIn() {
    initFirebase();
    const provider = new GoogleAuthProvider();
    await signInWithPopup(_auth, provider);
  },

  /** Sign out */
  async signOut() {
    if (_auth) await signOut(_auth);
  },

  /** Listen for auth state changes. cb(user|null) */
  onAuthChange(cb) {
    initFirebase();
    if (!_auth) { cb(null); return () => {}; }
    return onAuthStateChanged(_auth, cb);
  },

  /** Load data for the signed-in user. Returns object or null. */
  async load(uid) {
    if (!_db) return null;
    try {
      const snap = await getDoc(doc(_db, 'users', uid, 'data', 'launcher'));
      return snap.exists() ? snap.data() : null;
    } catch (e) { console.warn('Cloud load failed', e); return null; }
  },

  /** Save data for the signed-in user. */
  async save(uid, payload) {
    if (!_db) return;
    try {
      await setDoc(doc(_db, 'users', uid, 'data', 'launcher'), payload);
    } catch (e) { console.warn('Cloud save failed', e); }
  },
};

/* ---------- Constants ---------- */
const KV_KEY    = 'webdock_apps_v1';
const WALL_KEY  = 'webdock_wallpaper_v1';
const PAGES_KEY = 'webdock_pages_v1';

const WALLPAPERS = [
  { id: 'indigo',   css: 'linear-gradient(160deg,#4f46e5 0%,#7c3aed 45%,#db2777 100%)' },
  { id: 'ocean',    css: 'linear-gradient(160deg,#0ea5e9 0%,#2563eb 55%,#1e3a8a 100%)' },
  { id: 'sunset',   css: 'linear-gradient(160deg,#f97316 0%,#db2777 55%,#7c3aed 100%)' },
  { id: 'forest',   css: 'linear-gradient(160deg,#10b981 0%,#059669 50%,#065f46 100%)' },
  { id: 'dusk',     css: 'linear-gradient(160deg,#6366f1 0%,#8b5cf6 50%,#0f172a 100%)' },
  { id: 'ember',    css: 'linear-gradient(160deg,#ef4444 0%,#b91c1c 55%,#450a0a 100%)' },
  { id: 'aurora',   css: 'linear-gradient(160deg,#22d3ee 0%,#3b82f6 40%,#a855f7 100%)' },
  { id: 'graphite', css: 'linear-gradient(160deg,#334155 0%,#1e293b 55%,#020617 100%)' },
  { id: 'candy',    css: 'linear-gradient(160deg,#f472b6 0%,#c084fc 50%,#818cf8 100%)' },
];

const COLORS = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#ec4899','#8b5cf6','#14b8a6','#f97316','#64748b','#111827','#eab308'];

const DEFAULT_APPS = [
  { name: 'YouTube',    url: 'https://youtube.com',              color: '#ef4444' },
  { name: 'Wikipedia',  url: 'https://wikipedia.org',            color: '#111827' },
  { name: 'Google Maps',url: 'https://maps.google.com',          color: '#10b981' },
  { name: 'Reddit',     url: 'https://reddit.com',               color: '#f97316' },
  { name: 'Spotify',    url: 'https://open.spotify.com',         color: '#10b981' },
  { name: 'Weather',    url: 'https://weather.com',              color: '#0ea5e9' },
  { name: 'Wikipedia Commons', url: 'https://commons.wikimedia.org', color: '#64748b' },
  { name: 'Hacker News',url: 'https://news.ycombinator.com',     color: '#f59e0b' },
];

/* ---------- State ---------- */
let apps        = [];
let pageCount   = 1;
let currentPage = 0;
let currentUser = null;   // Firebase User | null
let editing     = false;
let editIndex   = -1;
let modalColor  = COLORS[0];
let dragIndex   = -1;

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const pager = $('pager');

/* ---------- Icons ---------- */
function refreshIcons() { createIcons({ icons }); }

/* ---------- URL / favicon helpers ---------- */
function normalizeUrl(raw) {
  let u = (raw || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try { new URL(u); return u; } catch { return ''; }
}
function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}
function guessName(url) {
  const host = hostOf(url);
  if (!host) return '';
  const core = host.split('.').slice(-2, -1)[0] || host.split('.')[0];
  return core.charAt(0).toUpperCase() + core.slice(1);
}

// Ordered list of favicon sources to try for a given URL
function faviconSources(url) {
  const host = hostOf(url);
  if (!host) return [];
  return [
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`,
    `https://icons.duckduckgo.com/ip3/${host}.ico`,
    `https://${host}/favicon.ico`,
  ];
}

// Default SVG shown when no favicon can be found — white globe on transparent bg
const DEFAULT_ICON_SVG = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="9"/>
    <path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>
    <line x1="3" y1="12" x2="21" y2="12"/>
  </svg>`
)}`;

// Tries each favicon source in order; resolves to the first URL that returns a
// real image (naturalWidth > 4), or DEFAULT_ICON_SVG if all fail.
function resolveFavicon(url) {
  const sources = faviconSources(url);
  return new Promise((resolve) => {
    let i = 0;
    function tryNext() {
      if (i >= sources.length) { resolve(DEFAULT_ICON_SVG); return; }
      const src = sources[i++];
      const img = new Image();
      img.onload  = () => img.naturalWidth > 4 ? resolve(src) : tryNext();
      img.onerror = tryNext;
      img.src = src;
    }
    tryNext();
  });
}

// Attach resolved icon to an existing <img> element; show fallbackEl if default
function applyIcon(imgEl, resolvedSrc, fallbackEl) {
  const isDefault = resolvedSrc === DEFAULT_ICON_SVG;
  if (isDefault) {
    // Show SVG inline as img — keeps it styled like a real icon
    imgEl.src = DEFAULT_ICON_SVG;
    imgEl.style.display = 'block';
    imgEl.style.opacity = '0.85';
    if (fallbackEl) fallbackEl.style.display = 'none';
  } else {
    imgEl.src = resolvedSrc;
    imgEl.style.display = 'block';
    if (fallbackEl) fallbackEl.style.display = 'none';
  }
}

/* ---------- Local storage helpers (sync) ---------- */
function localSave() {
  localStorage.setItem(KV_KEY,    JSON.stringify(apps));
  localStorage.setItem(PAGES_KEY, String(pageCount));
}
function localLoad() {
  const raw      = localStorage.getItem(KV_KEY);
  const pagesRaw = localStorage.getItem(PAGES_KEY);
  apps      = raw      ? JSON.parse(raw) : DEFAULT_APPS.map(seed);
  pageCount = pagesRaw ? Math.max(1, parseInt(pagesRaw, 10) || 1) : 1;
  apps.forEach(a => { if (typeof a.page !== 'number') a.page = 0; });
  const maxPage = apps.reduce((m, a) => Math.max(m, a.page), 0);
  pageCount = Math.max(pageCount, maxPage + 1);
}

/* ---------- Cloud sync ---------- */
async function cloudPull(uid) {
  const data = await CloudSync.load(uid);
  if (!data) {
    // First sign-in: push local data up
    await cloudPush(uid);
    return;
  }
  apps      = (data.apps || []).map(a => ({ ...a }));
  pageCount = Math.max(1, data.pageCount || 1);
  const wall = data.wallpaper;
  if (wall) {
    localStorage.setItem(WALL_KEY, wall);
    applyWallpaper(wall);
  }
  apps.forEach(a => { if (typeof a.page !== 'number') a.page = 0; });
  const maxPage = apps.reduce((m, a) => Math.max(m, a.page), 0);
  pageCount = Math.max(pageCount, maxPage + 1);
  localSave();
}

async function cloudPush(uid) {
  await CloudSync.save(uid, {
    apps,
    pageCount,
    wallpaper: localStorage.getItem(WALL_KEY) || 'indigo',
  });
}

/* ---------- Persistence (unified) ---------- */
function seed(a) { return { id: cryptoId(), name: a.name, url: normalizeUrl(a.url), color: a.color, icon: '', page: 0 }; }
function cryptoId() { return 'a' + Math.random().toString(36).slice(2, 10); }

async function saveApps() {
  localSave();
  if (currentUser) await cloudPush(currentUser.uid);
}

function loadAppsLocal() {
  localLoad();
}

async function loadWallpaper() {
  const id = localStorage.getItem(WALL_KEY) || 'indigo';
  applyWallpaper(id);
}
async function saveWallpaper(id) {
  localStorage.setItem(WALL_KEY, id);
  if (currentUser) await cloudPush(currentUser.uid);
}
function applyWallpaper(id) {
  const w = WALLPAPERS.find(x => x.id === id) || WALLPAPERS[0];
  $('wallpaper').style.setProperty('--wall', w.css);
  $('wallpaper').dataset.id = w.id;
}

/* ---------- Auth state ---------- */
function onUserChanged(user) {
  currentUser = user;
  updateAuthUI();
  if (user) {
    cloudPull(user.uid).then(() => { render(); toast('Synced to your account'); });
  }
}

function updateAuthUI() {
  const label  = $('authLabel');
  const icon   = $('authBtn').querySelector('[data-lucide]');
  const synced = $('syncBadge');
  if (currentUser) {
    label.textContent = currentUser.displayName?.split(' ')[0] || 'Account';
    if (icon) icon.setAttribute('data-lucide', 'user-round');
    synced?.classList.remove('hidden');
  } else {
    label.textContent = 'Sign in';
    if (icon) icon.setAttribute('data-lucide', 'log-in');
    synced?.classList.add('hidden');
  }
  refreshIcons();
}

$('authBtn').onclick = async () => {
  if (currentUser) {
    await CloudSync.signOut();
    currentUser = null;
    updateAuthUI();
    loadAppsLocal();
    await loadWallpaper();
    render();
    toast('Signed out — local only');
  } else {
    try {
      await CloudSync.signIn();
      // onAuthStateChanged fires and handles the rest
    } catch (e) {
      if (e.code !== 'auth/popup-closed-by-user') toast('Sign in failed');
    }
  }
};

/* ---------- Render ---------- */
function render(filter = '') {
  const q = (filter || '').trim().toLowerCase();
  if (q) { renderSearch(q); return; }

  $('searchResults').classList.add('hidden');
  pager.classList.remove('hidden');
  $('pageDots').classList.remove('hidden');

  pager.innerHTML = '';
  for (let p = 0; p < pageCount; p++) pager.appendChild(buildPage(p));
  if (editing) pager.appendChild(buildAddPagePanel());

  renderDots();
  pager.classList.toggle('editing', editing);
  requestAnimationFrame(() => { pager.scrollLeft = currentPage * pager.clientWidth; });
  refreshIcons();
}

function buildPage(pageIndex) {
  const page = document.createElement('div');
  page.className = 'page snap-center';
  page.dataset.page = pageIndex;
  const g = document.createElement('div');
  g.className = 'page-grid' + (editing ? ' editing' : '');
  g.dataset.page = pageIndex;

  apps.forEach((a, i) => { if (a.page === pageIndex) g.appendChild(tile(a, i)); });

  g.addEventListener('dragover', (e) => e.preventDefault());
  g.addEventListener('drop', (e) => { e.preventDefault(); if (dragIndex > -1) moveToPage(dragIndex, pageIndex); });

  page.appendChild(g);

  if (editing && !apps.some(a => a.page === pageIndex)) {
    const hint = document.createElement('div');
    hint.className = 'text-center text-white/60 text-sm pt-10';
    hint.textContent = 'Empty page — drag apps here or add new ones';
    page.appendChild(hint);
  }
  return page;
}

function buildAddPagePanel() {
  const page = document.createElement('div');
  page.className = 'page snap-center';
  page.dataset.page = 'add';
  const inner = document.createElement('div');
  inner.className = 'add-page-tile';
  inner.innerHTML = `<div class="add-page-btn"><i data-lucide="plus" class="w-7 h-7"></i></div><div class="text-sm font-medium">Add page</div>`;
  inner.onclick = addPage;
  page.appendChild(inner);
  return page;
}

async function addPage() {
  pageCount++;
  await saveApps();
  currentPage = pageCount - 1;
  render();
  requestAnimationFrame(() => { pager.scrollLeft = currentPage * pager.clientWidth; renderDots(); });
  toast('Page added');
}

function renderDots() {
  const dots = $('pageDots');
  dots.innerHTML = '';
  for (let p = 0; p < pageCount; p++) {
    const d = document.createElement('button');
    d.className = 'page-dot' + (p === currentPage ? ' active' : '');
    d.onclick = () => goToPage(p);
    dots.appendChild(d);
  }
  if (editing) {
    const add = document.createElement('button');
    add.className = 'page-dot add-dot';
    add.innerHTML = '<i data-lucide="plus" class="w-2.5 h-2.5"></i>';
    add.onclick = addPage;
    dots.appendChild(add);
    refreshIcons();
  }
}

function goToPage(p) {
  currentPage = p;
  pager.scrollTo({ left: p * pager.clientWidth, behavior: 'smooth' });
  renderDots();
}

async function moveToPage(index, pageIndex) {
  if (apps[index].page === pageIndex) return;
  apps[index].page = pageIndex;
  await saveApps();
  render();
}

/* ---------- Search ---------- */
function renderSearch(q) {
  pager.classList.add('hidden');
  $('pageDots').classList.add('hidden');
  const res = $('searchResults');
  res.classList.remove('hidden');
  const grid = $('searchGrid');
  grid.innerHTML = '';
  const list = apps.map((a, i) => ({ a, i }))
    .filter(({ a }) => a.name.toLowerCase().includes(q) || hostOf(a.url).includes(q));
  list.forEach(({ a, i }) => grid.appendChild(tile(a, i)));
  grid.classList.remove('editing');
  const empty = $('emptyState');
  if (list.length === 0) { empty.classList.remove('hidden'); empty.classList.add('flex'); }
  else { empty.classList.add('hidden'); empty.classList.remove('flex'); }
  refreshIcons();
}

function tile(app, index) {
  const el = document.createElement('div');
  el.className = 'app-tile';
  el.dataset.index = index;

  el.innerHTML = `
    <div class="app-icon" style="background:${app.color || '#6366f1'}">
      <img alt="" class="app-icon-img" style="display:none">
      <div class="remove-badge"><i data-lucide="minus" class="w-3.5 h-3.5"></i></div>
    </div>
    <div class="app-label">${escapeHtml(app.name || hostOf(app.url))}</div>
  `;

  const img = el.querySelector('.app-icon-img');
  const iconSrc = app.icon || null;
  if (iconSrc) {
    // User-supplied icon — use directly, fall back to resolver on error
    img.src = iconSrc;
    img.style.display = 'block';
    img.onerror = () => resolveFavicon(app.url).then(src => applyIcon(img, src, null));
  } else {
    resolveFavicon(app.url).then(src => applyIcon(img, src, null));
  }

  el.addEventListener('click', (e) => {
    if (editing) {
      if (e.target.closest('.remove-badge')) removeApp(index);
      else openEdit(index);
      return;
    }
    launch(app);
  });

  el.draggable = true;
  el.addEventListener('dragstart', () => { dragIndex = index; el.classList.add('dragging'); });
  el.addEventListener('dragend',   () => { el.classList.remove('dragging'); dragIndex = -1; });
  el.addEventListener('dragover',  (e) => e.preventDefault());
  el.addEventListener('drop', (e) => { e.preventDefault(); if (dragIndex > -1 && dragIndex !== index) reorder(dragIndex, index); });

  return el;
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

async function reorder(from, to) {
  const target   = apps[to];
  const targetPage = target.page;
  const [moved]  = apps.splice(from, 1);
  moved.page     = targetPage;
  const insertAt = apps.indexOf(target);
  apps.splice(insertAt, 0, moved);
  await saveApps();
  render();
}

/* ---------- Multitasking ---------- */
const viewer    = $('viewer');
const frameHost = $('frameHost');
const switcher  = $('switcher');

let tasks       = [];
let activeTaskId = null;

function launch(app) {
  const url = normalizeUrl(app.url);
  if (!url) return;
  const existing = tasks.find(t => t.url === url);
  if (existing) { focusTask(existing.taskId); return; }

  const taskId = 't' + Math.random().toString(36).slice(2, 9);
  const wrap   = document.createElement('div');
  wrap.className  = 'app-frame hidden-frame';
  wrap.dataset.task = taskId;

  const frame = document.createElement('iframe');
  frame.className = 'w-full h-full border-0 bg-white';
  frame.src = url;

  const task = { taskId, name: app.name || guessName(url), url, host: hostOf(url), color: app.color || '#6366f1', icon: app.icon || '', wrap, frame, blocked: false, loaded: false, blockTimer: null };
  tasks.push(task);

  // Attach listener before appending to DOM to avoid race with fast/cached pages
  frame.addEventListener('load', () => { task.loaded = true; clearTimeout(task.blockTimer); });

  wrap.appendChild(frame);
  frameHost.appendChild(wrap);

  // Only show the blocked hint after 12 s with no load event — covers slow
  // servers, auth redirects, and cold starts without false-positiving own sites.
  task.blockTimer = setTimeout(() => { if (!task.loaded) markBlocked(task); }, 12000);

  focusTask(taskId);
  updateOpenCounts();
}

function markBlocked(task) {
  task.blocked = true;
  if (task.wrap.querySelector('.blocked-panel')) return;
  // Soft overlay — doesn't hide the frame in case it's just slow
  const panel = document.createElement('div');
  panel.className = 'blocked-panel';
  panel.style.cssText = 'background:rgba(10,10,10,0.88);backdrop-filter:blur(8px);';
  panel.innerHTML = `
    <div class="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mb-4">
      <i data-lucide="shield-alert" class="w-8 h-8 text-amber-400"></i>
    </div>
    <p class="font-semibold text-lg">Taking too long to load</p>
    <p class="text-white/60 text-sm mt-1 max-w-xs text-center">The site may block embedding. Try waiting, or open it in a new tab.</p>
    <div class="flex gap-3 mt-5">
      <button class="dismiss-btn rounded-full bg-white/15 text-white font-semibold px-4 py-2.5 text-sm hover:bg-white/25 transition">Wait</button>
      <button class="open-tab-btn rounded-full bg-white text-black font-semibold px-4 py-2.5 text-sm hover:bg-white/90 transition">Open in new tab</button>
    </div>`;
  panel.querySelector('.open-tab-btn').onclick = () => window.open(task.url, '_blank', 'noopener');
  panel.querySelector('.dismiss-btn').onclick = () => {
    panel.remove();
    task.blocked = false;
  };
  task.wrap.appendChild(panel);
  refreshIcons();
}

function focusTask(taskId) {
  activeTaskId = taskId;
  const task = tasks.find(t => t.taskId === taskId);
  if (!task) return;
  tasks.forEach(t => t.wrap.classList.toggle('hidden-frame', t.taskId !== taskId));
  $('viewerTitle').textContent = task.name;
  $('viewerUrl').textContent   = task.host;
  tasks = tasks.filter(t => t.taskId !== taskId);
  tasks.push(task);
  hideSwitcher();
  viewer.classList.remove('hidden');
  viewer.classList.add('flex');
  refreshIcons();
}

function closeTask(taskId) {
  const idx = tasks.findIndex(t => t.taskId === taskId);
  if (idx < 0) return;
  const [task] = tasks.splice(idx, 1);
  clearTimeout(task.blockTimer);
  task.frame.src = 'about:blank';
  task.wrap.remove();
  updateOpenCounts();
  if (activeTaskId === taskId) {
    activeTaskId = null;
    if (tasks.length) focusTask(tasks[tasks.length - 1].taskId);
    else { hideViewer(); goHome(); }
  }
}

function closeAllTasks() {
  tasks.forEach(t => { clearTimeout(t.blockTimer); t.frame.src = 'about:blank'; t.wrap.remove(); });
  tasks = []; activeTaskId = null;
  updateOpenCounts(); hideSwitcher(); hideViewer();
}

function hideViewer() { viewer.classList.add('hidden'); viewer.classList.remove('flex'); }
function goHome()     { hideViewer(); hideSwitcher(); }

function updateOpenCounts() {
  const n = tasks.length;
  $('dockCount').textContent = n;
  $('dockCount').classList.toggle('hidden', n === 0);
  $('viewerCount').textContent = n;
}

/* ---------- App switcher ---------- */
function openSwitcher() {
  const row   = $('cardRow');
  row.innerHTML = '';
  const empty  = $('switcherEmpty');
  const scroll = $('switcherScroll');
  if (tasks.length === 0) {
    scroll.classList.add('hidden');
    empty.classList.remove('hidden'); empty.classList.add('flex');
  } else {
    scroll.classList.remove('hidden');
    empty.classList.add('hidden'); empty.classList.remove('flex');
    [...tasks].reverse().forEach(task => row.appendChild(switchCard(task)));
  }
  switcher.classList.remove('hidden');
  switcher.classList.add('flex');
  document.querySelector('[data-dock="recents"]').classList.add('active');
  refreshIcons();
}

function hideSwitcher() {
  switcher.classList.add('hidden');
  switcher.classList.remove('flex');
  document.querySelector('[data-dock="recents"]').classList.remove('active');
}

function switchCard(task) {
  const card    = document.createElement('div');
  card.className = 'switch-card' + (task.taskId === activeTaskId ? ' active-card' : '');
  const initial  = (task.name || task.host || '?').charAt(0).toUpperCase();
  card.innerHTML = `
    <div class="switch-card-head">
      <div class="switch-card-icon" style="background:${task.color}">
        <span>${initial}</span>
      </div>
      <div class="min-w-0">
        <div class="text-sm font-semibold truncate">${escapeHtml(task.name)}</div>
        <div class="text-[11px] text-white/50 truncate">${escapeHtml(task.host)}</div>
      </div>
      <button class="switch-card-close"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
    </div>
    <div class="switch-card-shot" style="background:${task.color}22">
      <div class="switch-card-fallback" style="color:${task.color}">${initial}</div>
    </div>`;

  const head = card.querySelector('.switch-card-icon');
  const img  = new Image();
  img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
  resolveFavicon(task.url).then(src => {
    img.src = src;
    head.innerHTML = '';
    head.appendChild(img);
  });

  card.querySelector('.switch-card-close').onclick = (e) => {
    e.stopPropagation();
    card.classList.add('closing');
    setTimeout(() => { closeTask(task.taskId); openSwitcher(); }, 200);
  };
  card.onclick = () => focusTask(task.taskId);
  return card;
}

/* ---------- Viewer controls ---------- */
$('viewerHome').onclick   = goHome;
$('viewerSwitch').onclick = openSwitcher;
$('viewerReload').onclick = () => {
  const t = tasks.find(x => x.taskId === activeTaskId);
  if (!t) return;
  t.loaded = false; t.blocked = false;
  t.wrap.querySelector('.blocked-panel')?.remove();
  clearTimeout(t.blockTimer);
  t.frame.src = t.url;
  t.blockTimer = setTimeout(() => { if (!t.loaded) markBlocked(t); }, 12000);
};
$('viewerExternal').onclick = () => {
  const t = tasks.find(x => x.taskId === activeTaskId);
  if (t) window.open(t.url, '_blank', 'noopener');
};
$('switcherClose').onclick = () => { hideSwitcher(); if (activeTaskId) { viewer.classList.remove('hidden'); viewer.classList.add('flex'); } };
$('closeAllBtn').onclick   = closeAllTasks;
switcher.addEventListener('click', (e) => { if (e.target === switcher) $('switcherClose').onclick(); });

/* ---------- Add / Edit modal ---------- */
const appModal = $('appModal');

function openAdd() {
  editIndex = -1;
  $('modalTitle').textContent = 'Add app';
  $('fUrl').value = ''; $('fName').value = ''; $('fIcon').value = '';
  modalColor = COLORS[0];
  $('deleteBtn').classList.add('hidden');
  buildColorRow(); updatePreview();
  showModal(appModal);
  setTimeout(() => $('fUrl').focus(), 250);
}

function openEdit(index) {
  editIndex = index;
  const a = apps[index];
  $('modalTitle').textContent = 'Edit app';
  $('fUrl').value  = a.url;
  $('fName').value = a.name;
  $('fIcon').value = a.icon || '';
  modalColor = a.color || COLORS[0];
  $('deleteBtn').classList.remove('hidden');
  buildColorRow(); updatePreview();
  showModal(appModal);
}

function buildColorRow() {
  const row = $('colorRow');
  row.innerHTML = '';
  COLORS.forEach(c => {
    const s = document.createElement('button');
    s.className = 'color-swatch' + (c === modalColor ? ' selected' : '');
    s.style.background = c;
    s.onclick = () => { modalColor = c; buildColorRow(); updatePreview(); };
    row.appendChild(s);
  });
}

let resolvedIconSrc = ''; // tracks the auto-resolved favicon for the current modal URL

function updatePreview() {
  const url    = normalizeUrl($('fUrl').value);
  const custom = $('fIcon').value.trim();
  const prev   = $('modalPreview');
  prev.style.background = modalColor;
  prev.innerHTML = '';

  const img = document.createElement('img');
  img.className = 'w-full h-full object-cover';
  img.style.display = 'none';
  prev.appendChild(img);

  if (custom) {
    resolvedIconSrc = custom;
    img.src = custom;
    img.style.display = 'block';
    img.onerror = () => { img.style.display = 'none'; resolvedIconSrc = ''; };
  } else if (url) {
    resolvedIconSrc = '';
    resolveFavicon(url).then(src => {
      resolvedIconSrc = src;
      applyIcon(img, src, null);
    });
  } else {
    resolvedIconSrc = '';
  }
}

$('fUrl').addEventListener('input', updatePreview);
$('fUrl').addEventListener('blur',  () => {
  const url = normalizeUrl($('fUrl').value);
  if (!$('fName').value.trim()) $('fName').value = guessName(url);
  updatePreview();
});
$('fName').addEventListener('input', updatePreview);
$('fIcon').addEventListener('input', updatePreview);

$('saveBtn').onclick = async () => {
  const url = normalizeUrl($('fUrl').value);
  if (!url) { toast('Enter a valid website URL'); return; }
  const name   = $('fName').value.trim() || guessName(url);
  const icon   = $('fIcon').value.trim() || resolvedIconSrc;
  const page   = editIndex > -1 ? apps[editIndex].page : Math.min(currentPage, pageCount - 1);
  const record = { id: editIndex > -1 ? apps[editIndex].id : cryptoId(), name, url, color: modalColor, icon, page };
  if (editIndex > -1) apps[editIndex] = record;
  else apps.push(record);
  await saveApps();
  hideModal(appModal);
  render();
  toast(editIndex > -1 ? 'App updated' : 'App added');
};

$('deleteBtn').onclick = async () => { if (editIndex > -1) { await removeApp(editIndex); hideModal(appModal); } };

async function removeApp(index) {
  apps.splice(index, 1);
  await saveApps();
  render();
  toast('App removed');
}

$('modalClose').onclick = () => hideModal(appModal);
appModal.addEventListener('click', (e) => { if (e.target === appModal) hideModal(appModal); });

/* ---------- Wallpaper modal ---------- */
const wallModal = $('wallModal');
function openWall() {
  const g       = $('wallGrid');
  g.innerHTML   = '';
  const current = $('wallpaper').dataset.id;
  WALLPAPERS.forEach(w => {
    const s = document.createElement('button');
    s.className = 'wall-swatch' + (w.id === current ? ' selected' : '');
    s.style.background = w.css;
    s.onclick = async () => { applyWallpaper(w.id); await saveWallpaper(w.id); openWall(); };
    g.appendChild(s);
  });
  showModal(wallModal);
}
$('wallClose').onclick = () => hideModal(wallModal);
wallModal.addEventListener('click', (e) => { if (e.target === wallModal) hideModal(wallModal); });

/* ---------- Modal helpers ---------- */
function showModal(m) { m.classList.remove('hidden'); m.classList.add('flex'); refreshIcons(); }
function hideModal(m) { m.classList.add('hidden');    m.classList.remove('flex'); }

/* ---------- Editing mode ---------- */
function toggleEdit(force) {
  editing = force !== undefined ? force : !editing;
  document.querySelector('[data-dock="edit"]').classList.toggle('active', editing);
  if (editing && $('search').value) { $('search').value = ''; $('searchGo').classList.add('hidden'); }
  render();
  if (editing) toast('Tap to edit · drag to reorder · swipe or + for pages');
}

/* ---------- Dock ---------- */
document.querySelectorAll('.dock-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const a = btn.dataset.dock;
    if (a === 'home')     { if (editing) toggleEdit(false); goHome(); $('search').value = ''; $('searchGo').classList.add('hidden'); currentPage = 0; render(); goToPage(0); }
    if (a === 'add')      openAdd();
    if (a === 'edit')     toggleEdit();
    if (a === 'recents')  openSwitcher();
    if (a === 'wallpaper') openWall();
  });
});

/* ---------- Search ---------- */
const search = $('search');
search.addEventListener('input', () => {
  render(search.value);
  const looksUrl = /\.[a-z]{2,}/i.test(search.value) || /^https?:/i.test(search.value);
  $('searchGo').classList.toggle('hidden', !looksUrl);
});
search.addEventListener('keydown', (e) => { if (e.key === 'Enter') goSearch(); });
$('searchGo').onclick = goSearch;
function goSearch() {
  const v = search.value.trim();
  if (!v) return;
  const url = normalizeUrl(v);
  if (url && /\.[a-z]{2,}/i.test(v)) launch({ name: guessName(url), url });
}

/* ---------- Clock ---------- */
function tickClock() {
  const now = new Date();
  $('statusClock').textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  $('bigClock').textContent    = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  $('bigDate').textContent     = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

/* ---------- Escape key ---------- */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!appModal.classList.contains('hidden'))  hideModal(appModal);
  else if (!wallModal.classList.contains('hidden')) hideModal(wallModal);
  else if (!switcher.classList.contains('hidden'))  $('switcherClose').onclick();
  else if (!viewer.classList.contains('hidden'))    goHome();
  else if (editing) toggleEdit(false);
});

/* ---------- Pager swipe tracking ---------- */
let scrollTimer = null;
pager.addEventListener('scroll', () => {
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    const w = pager.clientWidth || 1;
    const p = Math.round(pager.scrollLeft / w);
    if (p !== currentPage && p < pageCount) { currentPage = p; renderDots(); }
  }, 60);
});
window.addEventListener('resize', () => {
  if (!pager.classList.contains('hidden')) pager.scrollLeft = currentPage * pager.clientWidth;
});

/* ---------- Service worker ---------- */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'SW_UPDATED') toastUpdate();
  });
}

function toastUpdate() {
  const t = $('toast');
  t.innerHTML = `New update available &nbsp;<button id="reloadBtn" class="underline font-bold">Refresh</button>`;
  t.classList.remove('hidden');
  $('reloadBtn').onclick = () => window.location.reload();
  // Don't auto-hide — user should decide when to reload
}

/* =====================================================================
   FLOATING ACTION BUTTON
   ===================================================================== */
const FAB_POS_KEY = 'webdock_fab_pos_v1';
const fabEl      = $('fab');
const fabBtn     = $('fabBtn');
const fabMenu    = $('fabMenu');

let fabOpen      = false;
let fabDragging  = false;
let fabDragMoved = false;
let fabDragOrigin = { x: 0, y: 0 };
// pos = { right, bottom } distance from viewport edges — anchors to button corner
let fabPos       = null;

const FAB_BTN_SIZE = 52;

function fabDefaultPos() {
  return { right: 20, bottom: 100 };
}

function applyFabPos(pos) {
  pos.right  = Math.max(8, Math.min(window.innerWidth  - FAB_BTN_SIZE - 8, pos.right));
  pos.bottom = Math.max(8, Math.min(window.innerHeight - FAB_BTN_SIZE - 8, pos.bottom));
  fabEl.style.right  = pos.right  + 'px';
  fabEl.style.bottom = pos.bottom + 'px';
  fabEl.style.left   = '';
  fabEl.style.top    = '';
}

function saveFabPos() {
  localStorage.setItem(FAB_POS_KEY, JSON.stringify(fabPos));
}

function openFabMenu() {
  fabOpen = true;
  fabBtn.classList.add('fab-open');
  renderFabMenu();
  fabMenu.classList.add('fab-menu-open');
  refreshIcons();
}

function closeFabMenu() {
  fabOpen = false;
  fabBtn.classList.remove('fab-open');
  fabMenu.classList.remove('fab-menu-open');
}

function toggleFabMenu() {
  fabOpen ? closeFabMenu() : openFabMenu();
}

function fabItem(iconName, label, onClick, extra = '') {
  const item = document.createElement('div');
  item.className = 'fab-item';
  item.style.cursor = 'pointer';
  item.innerHTML = `
    <span class="fab-item-label">${label}</span>
    <div class="fab-item-btn ${extra}">
      <i data-lucide="${iconName}" class="w-4 h-4"></i>
    </div>`;
  item.addEventListener('click', (e) => {
    e.stopPropagation();
    closeFabMenu();
    onClick();
  });
  return item;
}

function fabAppItem(task, label) {
  const item = document.createElement('div');
  item.className = 'fab-item';
  const initial = (task.name || task.host || '?').charAt(0).toUpperCase();
  item.innerHTML = `
    <span class="fab-item-label">${label}</span>
    <button class="fab-item-btn" style="padding:0;overflow:hidden;">
      <div class="fab-app-icon" style="background:${task.color};width:42px;height:42px;border-radius:999px;">
        <span>${initial}</span>
      </div>
    </button>`;
  // resolve icon
  resolveFavicon(task.url).then(src => {
    const iconWrap = item.querySelector('.fab-app-icon');
    const img = new Image();
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:999px;';
    img.onload = () => { if (img.naturalWidth > 4) { iconWrap.innerHTML = ''; iconWrap.appendChild(img); } };
    img.src = src;
  });
  item.style.cursor = 'pointer';
  item.addEventListener('click', (e) => {
    e.stopPropagation();
    closeFabMenu();
    focusTask(task.taskId);
  });
  return item;
}

function renderFabMenu() {
  fabMenu.innerHTML = '';

  // --- Context: viewer open ---
  const inViewer = !viewer.classList.contains('hidden');
  if (inViewer) {
    fabMenu.appendChild(fabItem('house', 'Home', goHome));
    const activeTask = tasks.find(t => t.taskId === activeTaskId);
    if (activeTask) {
      fabMenu.appendChild(fabItem('x', `Close ${activeTask.name}`, () => closeTask(activeTask.taskId)));
    }
    if (tasks.length > 1) {
      fabMenu.appendChild(fabItem('layers', 'Switch app', openSwitcher));
    }
  }

  // --- Annotate toggle ---
  const isAnnotating = !$('annotateCanvas').classList.contains('hidden');
  fabMenu.appendChild(fabItem(
    isAnnotating ? 'pencil-off' : 'pencil',
    isAnnotating ? 'Stop annotating' : 'Annotate',
    () => isAnnotating ? closeAnnotation() : openAnnotation(),
    isAnnotating ? 'fab-item-active' : ''
  ));

  // --- Add app ---
  fabMenu.appendChild(fabItem('plus', 'Add app', openAdd));

  // --- Recent open apps (home context) ---
  if (!inViewer && tasks.length > 0) {
    const recent = [...tasks].reverse().slice(0, 3);
    recent.forEach(t => fabMenu.appendChild(fabAppItem(t, t.name)));
  }
}

function initFAB() {
  // Restore saved position or use default
  try { fabPos = JSON.parse(localStorage.getItem(FAB_POS_KEY)); } catch {}
  if (!fabPos || fabPos.right === undefined) fabPos = fabDefaultPos();
  applyFabPos(fabPos);

  // Add close/open icon twins inside fabBtn
  fabBtn.innerHTML = `
    <span class="fab-icon-close"><i data-lucide="zap" class="w-5 h-5"></i></span>
    <span class="fab-icon-open"><i data-lucide="x" class="w-5 h-5"></i></span>`;

  // Drag + tap via pointer events
  fabBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    fabBtn.setPointerCapture(e.pointerId);
    fabDragging   = true;
    fabDragMoved  = false;
    // Store where within the button the pointer landed
    fabDragOrigin = { x: e.clientX, y: e.clientY, right: fabPos.right, bottom: fabPos.bottom };
  });

  fabBtn.addEventListener('pointermove', (e) => {
    if (!fabDragging) return;
    const dx = e.clientX - fabDragOrigin.x;
    const dy = e.clientY - fabDragOrigin.y;
    if (!fabDragMoved && Math.hypot(dx, dy) > 5) fabDragMoved = true;
    if (fabDragMoved) {
      fabPos = {
        right:  fabDragOrigin.right  - dx,
        bottom: fabDragOrigin.bottom - dy,
      };
      applyFabPos(fabPos);
      if (fabOpen) closeFabMenu();
    }
  });

  fabBtn.addEventListener('pointerup', () => {
    fabDragging = false;
    if (!fabDragMoved) {
      toggleFabMenu();
    } else {
      saveFabPos();
    }
    fabDragMoved = false;
  });

  // Close menu on outside click
  document.addEventListener('click', (e) => {
    if (fabOpen && !fabEl.contains(e.target)) closeFabMenu();
  });

  // Reposition on resize
  window.addEventListener('resize', () => {
    applyFabPos(fabPos);
  });

  refreshIcons();
}

/* =====================================================================
   ANNOTATION
   ===================================================================== */
const annotateCanvas      = $('annotateCanvas');
const annotateBar         = $('annotateBar');
const annoHighlightPreview = $('annoHighlightPreview');
const annotePins          = $('annotePins');
const annoCtx             = annotateCanvas.getContext('2d');

const ANNO_COLORS = ['#ffffff','#000000','#ef4444','#fbbf24','#10b981','#3b82f6','#a855f7','#ec4899'];
const ANNO_SIZES  = [{ label: 'S', size: 3 }, { label: 'M', size: 8 }, { label: 'L', size: 18 }];
const ANNO_HIGHLIGHT_COLORS = ['#fbbf24','#10b981','#3b82f6','#f472b6','#a855f7','#ef4444'];

let annoTool          = 'pen';
let annoColor         = '#ffffff';
let annoSize          = 5;
let annoHighlightColor = '#fbbf24';
let annoDrawing       = false;
let annoLast          = null;
let annoPoints        = [];

// Highlight drag state
let annoHlStart = null;

// Comment pins state
let annoPins    = [];   // [{id, x, y, text, color}]
let annoPinId   = 1;
let annoCommentColor = '#fbbf24';

// ── Persistence ─────────────────────────────────────────────────────────────
function getAnnoPageKey() {
  if (activeTaskId) {
    const t = tasks.find(x => x.taskId === activeTaskId);
    if (t) return 'webdock_anno_v1_' + t.url;
  }
  return 'webdock_anno_v1_home';
}

function loadAnnoPage() {
  try {
    const raw = localStorage.getItem(getAnnoPageKey());
    if (!raw) return;
    const data = JSON.parse(raw);
    // Restore canvas pixels
    if (data.canvas) {
      const img = new Image();
      img.onload = () => annoCtx.drawImage(img, 0, 0);
      img.src = data.canvas;
    }
    // Restore pins
    if (Array.isArray(data.pins)) {
      annoPins  = data.pins;
      annoPinId = (data.nextPinId || 1);
      renderAllPins();
    }
  } catch {}
}

function saveAnnoPage() {
  try {
    const data = {
      canvas:    annotateCanvas.toDataURL('image/png'),
      pins:      annoPins,
      nextPinId: annoPinId,
    };
    localStorage.setItem(getAnnoPageKey(), JSON.stringify(data));
  } catch {}
}

function clearAnnoPage() {
  localStorage.removeItem(getAnnoPageKey());
  annoPins = [];
  annoPinId = 1;
  annoCtx.clearRect(0, 0, annotateCanvas.width, annotateCanvas.height);
  annotePins.innerHTML = '';
}

// ── Open / Close ─────────────────────────────────────────────────────────────
function openAnnotation() {
  annotateCanvas.width  = window.innerWidth;
  annotateCanvas.height = window.innerHeight;
  annotateCanvas.classList.remove('hidden');
  annotePins.classList.remove('hidden');
  annotateBar.classList.remove('hidden');
  loadAnnoPage();
  renderAnnotateBar();
  refreshIcons();
  if (fabOpen) renderFabMenu();
}

function closeAnnotation() {
  saveAnnoPage();
  annotateCanvas.classList.add('hidden');
  annotePins.classList.add('hidden');
  annotateBar.classList.add('hidden');
  annoHighlightPreview.classList.add('hidden');
  annoDrawing  = false;
  annoPoints   = [];
  annoHlStart  = null;
  if (fabOpen) renderFabMenu();
}

function clearAnnotation() {
  clearAnnoPage();
}

function saveAnnotationPNG() {
  const link    = document.createElement('a');
  link.download = `annotation-${Date.now()}.png`;
  link.href     = annotateCanvas.toDataURL('image/png');
  link.click();
}

// ── Toolbar ───────────────────────────────────────────────────────────────────
function renderAnnotateBar() {
  annotateBar.innerHTML = '';
  // Scrollable tools wrapper + fixed Done button side-by-side
  const tools = document.createElement('div');
  tools.className = 'anno-tools-scroll';
  annotateBar.appendChild(tools);

  // ── Pen colors ──
  ANNO_COLORS.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'anno-color' + (c === annoColor && annoTool === 'pen' ? ' anno-selected' : '');
    btn.style.background = c;
    btn.style.boxShadow  = c === '#ffffff' ? 'inset 0 0 0 1px rgba(255,255,255,0.3)' : '';
    btn.title = 'Pen';
    btn.onclick = () => {
      annoColor = c; annoTool = 'pen';
      annotateCanvas.classList.remove('eraser-cursor', 'comment-cursor');
      renderAnnotateBar();
    };
    tools.appendChild(btn);
  });

  annoSep(tools);

  // ── Pen sizes ──
  ANNO_SIZES.forEach(({ label, size }) => {
    const btn = document.createElement('button');
    btn.className = 'anno-btn' + (annoSize === size && annoTool === 'pen' ? ' anno-selected' : '');
    btn.textContent = label;
    btn.onclick = () => {
      annoSize = size; annoTool = 'pen';
      annotateCanvas.classList.remove('eraser-cursor', 'comment-cursor');
      renderAnnotateBar();
    };
    tools.appendChild(btn);
  });

  annoSep(tools);

  // ── Highlighter ──
  const hlBtn = document.createElement('button');
  hlBtn.className = 'anno-btn' + (annoTool === 'highlight' ? ' anno-selected' : '');
  hlBtn.innerHTML = '<i data-lucide="highlighter" class="w-4 h-4"></i>';
  hlBtn.title = 'Highlight';
  hlBtn.onclick = () => {
    annoTool = 'highlight';
    annotateCanvas.classList.remove('eraser-cursor', 'comment-cursor');
    annotateCanvas.classList.add('highlight-cursor');
    renderAnnotateBar();
    refreshIcons();
  };
  tools.appendChild(hlBtn);

  // Highlight color chips (shown only when highlight active)
  if (annoTool === 'highlight') {
    ANNO_HIGHLIGHT_COLORS.forEach(c => {
      const chip = document.createElement('button');
      chip.className = 'anno-color anno-hl-chip' + (c === annoHighlightColor ? ' anno-selected' : '');
      chip.style.background = hexToRgba(c, 0.55);
      chip.style.border = `2px solid ${c}`;
      chip.onclick = () => { annoHighlightColor = c; renderAnnotateBar(); };
      tools.appendChild(chip);
    });
    annoSep(tools);
  }

  // ── Comment pin ──
  const cmtBtn = document.createElement('button');
  cmtBtn.className = 'anno-btn' + (annoTool === 'comment' ? ' anno-selected' : '');
  cmtBtn.innerHTML = '<i data-lucide="message-square-plus" class="w-4 h-4"></i>';
  cmtBtn.title = 'Add comment';
  cmtBtn.onclick = () => {
    annoTool = 'comment';
    annotateCanvas.classList.remove('eraser-cursor', 'highlight-cursor');
    annotateCanvas.classList.add('comment-cursor');
    renderAnnotateBar();
    refreshIcons();
  };
  tools.appendChild(cmtBtn);

  // Comment color chips (shown only when comment active)
  if (annoTool === 'comment') {
    ANNO_HIGHLIGHT_COLORS.forEach(c => {
      const chip = document.createElement('button');
      chip.className = 'anno-color anno-hl-chip' + (c === annoCommentColor ? ' anno-selected' : '');
      chip.style.background = c;
      chip.onclick = () => { annoCommentColor = c; renderAnnotateBar(); };
      tools.appendChild(chip);
    });
    annoSep(tools);
  }

  annoSep(tools);

  // ── Eraser ──
  const eraser = document.createElement('button');
  eraser.className = 'anno-btn' + (annoTool === 'eraser' ? ' anno-selected' : '');
  eraser.innerHTML = '<i data-lucide="eraser" class="w-4 h-4"></i>';
  eraser.onclick = () => {
    annoTool = 'eraser';
    annotateCanvas.classList.add('eraser-cursor');
    annotateCanvas.classList.remove('highlight-cursor', 'comment-cursor');
    renderAnnotateBar();
    refreshIcons();
  };
  tools.appendChild(eraser);

  // ── Clear all ──
  const clear = document.createElement('button');
  clear.className = 'anno-btn';
  clear.innerHTML = '<i data-lucide="trash-2" class="w-4 h-4"></i>';
  clear.title = 'Clear all';
  clear.onclick = clearAnnotation;
  tools.appendChild(clear);

  // ── Save PNG ──
  const save = document.createElement('button');
  save.className = 'anno-btn';
  save.innerHTML = '<i data-lucide="download" class="w-4 h-4"></i>';
  save.title = 'Save as PNG';
  save.onclick = saveAnnotationPNG;
  tools.appendChild(save);

  // ── Done — outside the scroll area, always visible ──
  const close = document.createElement('button');
  close.className = 'anno-btn anno-danger anno-done';
  close.innerHTML = '<i data-lucide="x" class="w-4 h-4"></i> <span>Done</span>';
  close.onclick = closeAnnotation;
  annotateBar.appendChild(close);

  refreshIcons();
}

function annoSep(parent) {
  const d = document.createElement('div'); d.className = 'anno-sep';
  parent.appendChild(d);
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Freehand drawing ──────────────────────────────────────────────────────────
function getAnnoPos(e) {
  const r = annotateCanvas.getBoundingClientRect();
  const src = e.touches ? e.touches[0] : e;
  return { x: src.clientX - r.left, y: src.clientY - r.top };
}

function getClientPos(e) {
  return { x: e.clientX, y: e.clientY };
}

function annoStrokeStart(pos) {
  annoDrawing = true;
  annoPoints  = [pos];
  annoLast    = pos;
  annoCtx.beginPath();
  annoCtx.arc(pos.x, pos.y, (annoTool === 'eraser' ? 20 : annoSize) / 2, 0, Math.PI * 2);
  setAnnoStyle();
  annoCtx.fill();
}

function annoStrokeMove(pos) {
  if (!annoDrawing) return;
  annoPoints.push(pos);
  if (annoPoints.length < 3) return;

  annoCtx.beginPath();
  setAnnoStyle();
  const [p0, p1, p2] = annoPoints.slice(-3);
  const mid1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
  const mid2 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  annoCtx.moveTo(mid1.x, mid1.y);
  annoCtx.quadraticCurveTo(p1.x, p1.y, mid2.x, mid2.y);
  annoCtx.stroke();
  annoLast = pos;
}

function annoStrokeEnd() {
  annoDrawing = false;
  annoPoints  = [];
  annoCtx.globalCompositeOperation = 'source-over';
  saveAnnoPage();
}

function setAnnoStyle() {
  if (annoTool === 'eraser') {
    annoCtx.globalCompositeOperation = 'destination-out';
    annoCtx.strokeStyle = 'rgba(0,0,0,1)';
    annoCtx.fillStyle   = 'rgba(0,0,0,1)';
    annoCtx.lineWidth   = 28;
  } else {
    annoCtx.globalCompositeOperation = 'source-over';
    annoCtx.strokeStyle = annoColor;
    annoCtx.fillStyle   = annoColor;
    annoCtx.lineWidth   = annoSize;
  }
  annoCtx.lineCap  = 'round';
  annoCtx.lineJoin = 'round';
}

// ── Highlight drag ────────────────────────────────────────────────────────────
function hlStart(e) {
  annoHlStart = getClientPos(e);
  annoHighlightPreview.classList.remove('hidden');
  annoHighlightPreview.style.background = hexToRgba(annoHighlightColor, 0.35);
  annoHighlightPreview.style.border = `2px solid ${hexToRgba(annoHighlightColor, 0.7)}`;
  hlUpdatePreview(e);
}

function hlUpdatePreview(e) {
  if (!annoHlStart) return;
  const cur = getClientPos(e);
  const x = Math.min(annoHlStart.x, cur.x);
  const y = Math.min(annoHlStart.y, cur.y);
  const w = Math.abs(cur.x - annoHlStart.x);
  const h = Math.abs(cur.y - annoHlStart.y);
  Object.assign(annoHighlightPreview.style, {
    left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px',
  });
}

function hlEnd(e) {
  if (!annoHlStart) return;
  const cur = getClientPos(e);
  const r   = annotateCanvas.getBoundingClientRect();
  const x   = Math.min(annoHlStart.x, cur.x) - r.left;
  const y   = Math.min(annoHlStart.y, cur.y) - r.top;
  const w   = Math.abs(cur.x - annoHlStart.x);
  const h   = Math.abs(cur.y - annoHlStart.y);

  if (w > 4) {
    // Draw rounded rectangle highlight on canvas — minimum 18px height for horizontal drags
    const barH = Math.max(h, 18);
    annoCtx.save();
    annoCtx.globalCompositeOperation = 'source-over';
    annoCtx.globalAlpha = 0.38;
    annoCtx.fillStyle   = annoHighlightColor;
    annoCtx.beginPath();
    annoCtx.roundRect(x, y, w, barH, 4);
    annoCtx.fill();
    annoCtx.restore();
    saveAnnoPage();
  }

  annoHlStart = null;
  annoHighlightPreview.classList.add('hidden');
  annoHighlightPreview.style.width = '0';
}

// ── Comment pins ──────────────────────────────────────────────────────────────
function placePin(e) {
  const client = getClientPos(e);
  const pin = {
    id:    annoPinId++,
    x:     client.x,
    y:     client.y,
    text:  '',
    color: annoCommentColor,
  };
  annoPins.push(pin);
  renderPin(pin);
  saveAnnoPage();
  // Open card immediately so user can type
  openPinCard(pin.id);
}

function renderAllPins() {
  annotePins.innerHTML = '';
  annoPins.forEach(renderPin);
}

function renderPin(pin) {
  const el = document.createElement('div');
  el.className = 'anno-pin';
  el.dataset.id = pin.id;
  el.style.left  = pin.x + 'px';
  el.style.top   = pin.y + 'px';
  el.style.setProperty('--pin-color', pin.color);
  el.innerHTML = `<div class="anno-pin-dot">${pin.id}</div>`;
  el.style.pointerEvents = 'auto';
  el.addEventListener('click', (ev) => { ev.stopPropagation(); openPinCard(pin.id); });
  annotePins.appendChild(el);
}

function openPinCard(id) {
  // Close any open card first
  document.querySelectorAll('.anno-pin-card').forEach(c => c.remove());

  const pin = annoPins.find(p => p.id === id);
  if (!pin) return;

  const card = document.createElement('div');
  card.className = 'anno-pin-card';
  card.style.setProperty('--pin-color', pin.color);

  // Position: try to keep on screen
  const cx = Math.min(pin.x, window.innerWidth  - 240);
  const cy = Math.min(pin.y + 28, window.innerHeight - 200);
  card.style.left = Math.max(8, cx) + 'px';
  card.style.top  = Math.max(8, cy) + 'px';

  const textarea = document.createElement('textarea');
  textarea.className   = 'anno-pin-textarea';
  textarea.placeholder = 'Add a comment…';
  textarea.value       = pin.text;
  textarea.rows        = 4;
  textarea.addEventListener('input', () => {
    pin.text = textarea.value;
  });

  const footer = document.createElement('div');
  footer.className = 'anno-pin-footer';

  const delBtn = document.createElement('button');
  delBtn.className = 'anno-btn anno-danger';
  delBtn.innerHTML = '<i data-lucide="trash-2" class="w-3 h-3"></i>';
  delBtn.onclick = () => { deletePin(id); card.remove(); };

  const doneBtn = document.createElement('button');
  doneBtn.className = 'anno-btn anno-selected';
  doneBtn.textContent = 'Save';
  doneBtn.onclick = () => { saveAnnoPage(); card.remove(); };

  footer.appendChild(delBtn);
  footer.appendChild(doneBtn);
  card.appendChild(textarea);
  card.appendChild(footer);

  // Cards need pointer events even when pins container is pointer-events:none
  card.style.pointerEvents = 'auto';
  annotePins.appendChild(card);
  refreshIcons();
  textarea.focus();

  // Click outside to close & save
  setTimeout(() => {
    document.addEventListener('click', function handler(ev) {
      if (!card.contains(ev.target)) {
        saveAnnoPage();
        card.remove();
        document.removeEventListener('click', handler);
      }
    });
  }, 0);
}

function deletePin(id) {
  annoPins = annoPins.filter(p => p.id !== id);
  const el = annotePins.querySelector(`.anno-pin[data-id="${id}"]`);
  if (el) el.remove();
  saveAnnoPage();
}

// ── Canvas pointer routing ────────────────────────────────────────────────────
function initAnnotation() {
  annotateCanvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    annotateCanvas.setPointerCapture(e.pointerId);
    if (annoTool === 'highlight') {
      hlStart(e);
    } else if (annoTool === 'comment') {
      // handled on pointerup (tap, not drag)
    } else {
      annoStrokeStart(getAnnoPos(e));
    }
  });

  annotateCanvas.addEventListener('pointermove', (e) => {
    e.preventDefault();
    if (e.buttons === 0) return;
    if (annoTool === 'highlight') {
      hlUpdatePreview(e);
    } else if (annoTool !== 'comment') {
      annoStrokeMove(getAnnoPos(e));
    }
  });

  annotateCanvas.addEventListener('pointerup', (e) => {
    if (annoTool === 'highlight') {
      hlEnd(e);
    } else if (annoTool === 'comment') {
      placePin(e);
    } else {
      annoStrokeEnd();
    }
  });

  annotateCanvas.addEventListener('pointercancel', () => {
    annoHlStart = null;
    annoHighlightPreview.classList.add('hidden');
    annoStrokeEnd();
  });

  // Resize: only adjust canvas when closed (canvas clears on resize)
  window.addEventListener('resize', () => {
    if (!annotateCanvas.classList.contains('hidden')) return;
    annotateCanvas.width  = window.innerWidth;
    annotateCanvas.height = window.innerHeight;
  });
}

/* ---------- Init ---------- */
/* =====================================================================
   PWA INSTALL PROMPT
   ===================================================================== */
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  showInstallBanner();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  hideInstallBanner();
  toast('WebDock installed!');
});

function showInstallBanner() {
  if (localStorage.getItem('webdock_install_dismissed') === '1') return;
  let banner = document.getElementById('installBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'installBanner';
    banner.className = 'install-banner';
    banner.innerHTML = `
      <div class="install-banner-icon">
        <img src="icons/icon-192.png" alt="" width="36" height="36" style="border-radius:10px;">
      </div>
      <div class="install-banner-text">
        <div class="install-banner-title">Add WebDock to home screen</div>
        <div class="install-banner-sub">Launch instantly, works offline</div>
      </div>
      <button id="installBtn" class="install-banner-btn">Install</button>
      <button id="installDismiss" class="install-banner-dismiss" aria-label="Dismiss">✕</button>`;
    document.body.appendChild(banner);

    document.getElementById('installBtn').onclick = async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      hideInstallBanner();
      if (outcome === 'dismissed') localStorage.setItem('webdock_install_dismissed', '1');
    };

    document.getElementById('installDismiss').onclick = () => {
      localStorage.setItem('webdock_install_dismissed', '1');
      hideInstallBanner();
    };
  }
  requestAnimationFrame(() => banner.classList.add('install-banner-show'));
}

function hideInstallBanner() {
  const banner = document.getElementById('installBanner');
  if (!banner) return;
  banner.classList.remove('install-banner-show');
  setTimeout(() => banner.remove(), 300);
}

/* ---------- Init ---------- */
async function init() {
  tickClock();
  setInterval(tickClock, 10000);
  loadAppsLocal();
  await loadWallpaper();
  render();
  initFAB();
  initAnnotation();
  // Auth listener — fires immediately with current state
  CloudSync.onAuthChange(onUserChanged);
}
init();
