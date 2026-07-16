# WebDock — Build Plan

> Status: **Draft — under discussion**
> Last updated: 2026-07-16

---

## Overview

Five work items covering two persistent bugs, two new features, and one open
architectural question. Items are listed in proposed execution order.

---

## Phase 1 — FAB drag rewrite

**Status:** Bug  
**Priority:** High — blocks testing everything else

### Problem

`pointermove` and `pointerup` are attached to `fabBtn` itself. When the user
drags quickly, the pointer leaves the button element and the events stop
firing — the button freezes mid-drag. On mobile this happens constantly.

Additionally, the `right/bottom` positioning math is counterintuitive:
`right` decreases as you move right, `bottom` decreases as you move down,
so the delta arithmetic is error-prone and has already produced one sign bug.

### Reference implementation studied

Reviewed `/Users/EaziDeFi/projects/web2/web-bos/app/page.tsx`. Key patterns:

| Pattern | Detail |
|---|---|
| Positioning | `left/top` from top-left corner — no coordinate inversion |
| Grab offset | Store `offsetX/offsetY` (pointer-within-button) so `nx = clientX - offsetX` |
| Pointer capture | `setPointerCapture` on the button keeps the pointer locked |
| iOS Safari fallback | Separate `onTouchStart/Move/End/Cancel` handlers alongside pointer events |
| Click suppression | Two refs: `skipNextClickRef` + `dragWasMoveRef` prevent double-toggle |
| Drag threshold | 20px (not 5px) — avoids accidental drags on tap |

### Proposed fix

1. Switch FAB positioning from `right/bottom` to **`left/top`**.
2. On `pointerdown`: record `offsetX/offsetY` within button + `startX/startY`.
3. On `pointermove`: compute `nx = clientX - offsetX`, `ny = clientY - offsetY`,
   clamp to viewport, update position. Mark `moved = true` once travel > 20px.
4. On `pointerup`: if `!moved` → toggle menu; if `moved` → save position.
   Set `skipNextClickRef = true` in both cases.
5. Add `onTouchStart/Move/End/Cancel` as an iOS Safari fallback (same logic).
6. `onFabClick`: skip and reset if either ref is true.
7. Rename localStorage key to `webdock_fab_pos_v2` to clear stale `right/bottom` data.

### Open questions

- [x] ~~User to share reference implementation~~ — reviewed above.
- [ ] Should the FAB snap to the nearest edge (left/right) when released, like
  iOS assistive touch? Or free-float anywhere?

---

## Phase 2 — Annotation "Done" button root-cause fix

**Status:** Bug  
**Priority:** High — annotation workflow is broken without it

### Problem

Two independent causes have been identified:

**Cause A — `saveAnnoPage()` blocking on close.**
`closeAnnotation()` calls `saveAnnoPage()` first, which calls
`canvas.toDataURL()`. On a full-screen canvas this produces a 2–5 MB base64
string. On low-end mobile, `toDataURL` can block the main thread long enough
that the subsequent DOM mutations (`classList.add('hidden')`) are deferred
past the next paint, making the bar appear to stay open.

**Cause B — document-level click handler race.**
`openPinCard()` attaches a `document.addEventListener('click', handler)` to
close the card on outside clicks. This handler fires on the same click that
hits the Done button — it runs first (capture order), calls `card.remove()`,
and can prevent the Done button's own `onclick` from seeing a clean DOM state.

### Proposed fix

1. Remove `saveAnnoPage()` from `closeAnnotation()`. Instead, save
   automatically after every draw action (stroke end, highlight end, pin
   place/edit/delete) — data is never lost between draws, so there is nothing
   extra to save on close.
2. Replace the document-level click handler in `openPinCard()` with a
   dedicated overlay `div` behind the card (like a modal backdrop) that closes
   the card on click. Eliminates the race condition entirely.
3. Add `pointer-events: none` to `annotateCanvas` while the bar is being
   interacted with (optional hardening).

### Open questions

- [ ] Confirm: is the bug reproducible on the Surge deployment (HTTPS) or only
  locally? The SW cache differences might be masking the real version.

---

## Phase 3 — Individual annotation management

**Status:** Feature  
**Priority:** Medium — also unblocks Phase 5 (book export)

### Problem

All marks (pen strokes, highlights, comments) are rasterised into a single
canvas `dataURL`. Once drawn, individual marks cannot be identified, selected,
or deleted — "Clear all" is the only option.

### Proposed data model

Replace the canvas `dataURL` with a **vector mark array**:

```js
// Stored in localStorage under webdock_anno_v2_{pageKey}
{
  marks: [
    { type: 'stroke',    id, color, size, points: [{x, y}, …] },
    { type: 'highlight', id, color, x, y, w, h },
    { type: 'comment',   id, color, x, y, text },
  ]
}
```

On open: replay all marks onto a fresh canvas in order.  
On each new mark: push to array → save → replay (or append incrementally).  
On delete: splice from array → save → full redraw.

### UI — Marks panel

A slide-in sheet (from the right) listing all marks:

- **Stroke** row: coloured dot + "Pen stroke" + trash button
- **Highlight** row: coloured rectangle chip + "Highlight" + trash button
- **Comment** row: pin dot + first 40 chars of text + trash button
- Tapping a comment row opens its edit card

Opened via a new toolbar button (list icon).

### Trade-offs to discuss

- [ ] Replaying many strokes on open could be slow for pages with lots of
  freehand drawing. Mitigation: cache a raster snapshot alongside the vector
  data and only replay on first open or after edits.
- [ ] Stroke data can be large (every pointer move = a point). Consider
  path simplification (Ramer–Douglas–Peucker) before saving.
- [ ] Should we migrate existing `v1` annotations (dataURL format) to `v2`
  automatically, or show a "legacy annotation — clear to re-annotate" message?

---

## Phase 4 — UI consistency (iOS theme everywhere)

**Status:** Feature  
**Priority:** Medium — visual polish, independent of other phases

### Problem

The home screen has a polished frosted-glass dark theme. Three other surfaces
were never updated to match:

| Surface | Current state |
|---|---|
| In-app browser toolbar (viewer bar) | Unstyled, inconsistent colours |
| App switcher | Dark cards but no blur, different typography |
| Add App / Edit App modal | Flat dark sheet, no glass effect |

### Design system tokens (already in use on home screen)

```css
background:       rgba(8, 8, 12, 0.85)
backdrop-filter:  blur(20px)
border:           1px solid rgba(255, 255, 255, 0.10)
border-radius:    22px           /* cards */
border-radius:    14px           /* modals / sheets */
font:             Inter, system-ui
```

### Changes per surface

**In-app browser toolbar**
- Wrap in frosted pill matching the bottom dock style
- Reorder: Home | App name + icon | Reload | External | Switcher
- Match icon sizes and spacing to dock buttons

**App switcher**
- Add `backdrop-filter: blur(16px)` to cards
- Unify card header font with home screen app labels
- Animate entry with the same `fabItemIn` keyframe used elsewhere

**Add / Edit modal**
- Replace flat background with frosted glass sheet
- Rounded top corners (drag handle optional)
- Input fields: dark glassy, consistent with search bar on home screen
- Color swatch row: match wallpaper picker swatches

### Open questions

- [ ] Should the modal slide up from the bottom (iOS sheet style) or stay as a
  centred dialog? iOS sheet feels more native.
- [ ] Viewer toolbar: should the app name truncate to one line or allow two
  lines for long names?

---

## Phase 5 — Annotated pages → browsable book export

**Status:** Feature (open question)  
**Priority:** Low — depends on Phase 3 (vector data model)  
**Feasibility:** Yes, fully feasible with no external dependencies

### Concept

After annotating one or more apps, the user taps **"Export book"** in the FAB
menu. A self-contained `.html` file is generated in-browser and downloaded.
Opening it in any browser gives a paginated, navigable reading view of all
annotated pages.

### Structure of the exported HTML

```
Cover
  └─ WebDock logo
  └─ Export date
  └─ Table of contents (one entry per annotated app)

Chapter per annotated app
  └─ App icon + name + URL
  └─ Canvas screenshot (embedded as base64 <img>)
  └─ Highlights listed as coloured bands with position labels
  └─ Comments listed as numbered notes: ① text, ② text, …

Sidebar navigation (fixed left panel)
  └─ Jump to any chapter
```

The file is entirely self-contained (no CDN, no server). All assets — the
canvas image, icons, styles — are inlined as base64 or `<style>` blocks.
Calling `window.print()` from within the exported file produces a
print-ready / PDF-saveable layout.

### Why Phase 3 is a prerequisite

With the current raster-only model, highlights and comments are baked into the
canvas pixels — there is no structured data to list as "Chapter sections". The
vector data model in Phase 3 provides the structured `marks[]` array that the
book exporter reads to generate highlight bands and numbered comment notes.

### Open questions

- [ ] Should freehand pen strokes appear in the book, or only structured marks
  (highlights + comments)? Pen strokes are visual only and may not read well
  as "book content".
- [ ] Should the book be a single HTML file (everything inline) or a folder
  with separate assets? Single file is simpler to share but can be large.
- [ ] Should there be a "view book" mode inside WebDock itself (opens the
  generated HTML in an iframe), or download-only?

---

## Execution order

| Phase | Item | Depends on | Effort |
|---|---|---|---|
| 1 | FAB drag rewrite | — | Small |
| 2 | Annotation Done fix | — | Small |
| 3 | Vector data model + marks panel | Phase 2 | Medium |
| 4 | UI consistency pass | — | Medium |
| 5 | Book export | Phase 3 | Medium |

Phases 1, 2, and 4 are independent and can run in parallel.  
Phase 3 must land before Phase 5.

---

## Discussion notes

> Add comments / decisions below as we discuss each phase.
