# BUILD 48: Trip Map — Final Build Plan (code-accurate)

**Status:** Ready for Claude Code execution
**Engine decision (locked):** Option C — **Hybrid**. Leaflet.js as the map substrate (tiles, pan, wheel-zoom, fit-bounds); a **custom overlay** draws pins / labels / route legs using the design's collision-avoidance label pass, ported into Leaflet's pixel space.
**Theming (locked):** existing navy/gold **light palette only**. No dark mode, no theme toggle in Build 48.
**Module pattern (locked):** singleton `const TripMap = { … }`, rendered through the app shell (`Render.show(Layout.render(...))`).
**Sharing (locked):** deferred to Build 49 (needs server.js work; collides with the Build 47 auth model).

> This plan supersedes `BUILD-48-TRIP-MAP-SPECIFICATION-REVISED.md` and `BUILD-48-RECONCILIATION-PLAN.md`. Where they disagree with this document on how the real code works, **this document wins** — it was written against the actual files.

---

## 0. Ground truth: how the real app works (READ FIRST)

These are the facts every earlier draft got wrong. Build against these, not against the spec's imagined shapes.

### 0.1 Data access (verified in `app/project.js`, `app/data.js`)

`Project.data` is a flat store of per-file JSON, each fetched by `Data.loadProject()` and read with `Project.get(key)`:

| What you need | How to get it (correct) | The trap |
|---|---|---|
| Trip name | `Project.get("project").project.name` | **not** `trip.name` — `project.json` is nested under a `project` key |
| Start / end date | `Project.get("project").project.departureDate` / `.returnDate` | **not** `journey.startDate` — that field does not exist |
| Home currency | `Project.get("project").project.currency` | — |
| Day array | `Project.get("journey").days` | **journey is a separate store**, not `project.journey` |
| Stop status source | `Project.get("accommodation" \| "activities" \| "restaurants" \| "transport" \| "flights")` → `.items` | all five ARE loaded into `Project` (confirmed in `data.js`) |
| Unique trip id (for localStorage) | `Project.projectFolder` | **not** `project.project.id` — that is `"sample-trip"`, a shared placeholder, non-unique |

### 0.2 Rendering & navigation (verified in `app/render.js`, `app/layout.js`, `core/router.js`, `app/sidebar.js`)

- Every view renders into the single `#app` element via `Render.show(html)` (sets `#app.innerHTML`).
- `Layout.render(content)` wraps `content` with the sidebar + header + footer. **Any view that skips `Layout.render` loses the sidebar**, and content written outside `#app` becomes a ghost that survives navigation. → **TripMap must render via `Render.show(Layout.render(TripMap.getBodyHTML()))`.** Do NOT create a separate `#map-container` in `index.html`.
- Router is `Router.navigate(page)` — a `switch` that calls `Module.method()` and returns nothing.
- Sidebar is a **`menu` array** rendered to `<button onclick="Router.navigate('id')">`. You add a menu item by pushing an object to that array — there is no `<li>`/`navList` DOM to append to.
- **There is no client-side URL routing.** `server.js` maps only `/` → `index.html`; any other path (e.g. `/TOS/map`) returns `404 Not found`. You reach the map by clicking the sidebar item; the URL stays `/TOS/`. Do not write test steps that "open /TOS/map".

### 0.3 Status vocabulary (verified in the research JSON)

Research-collection items use **Capitalised** statuses: `Research → Shortlisted → Selected → Booked → Travel → Review`. (Note: the legacy `items` embedded inside `journey.json` use lowercase — ignore those for status; drive status from the research collections only.)

---

## 1. Data model for the map (no schema changes required)

### 1.1 Stop computation — real `journey.json` schema

`journey.days[]` fields that matter: `day` (number), `title` (string), `location` (slug), `overnight` (slug **or** the literal `"flight"`), and — newly present on the Italy test trip — `lat` / `lng` (numbers).

```
computeStops(days):
  stops = []; current = null
  for day in days:
    // transit / no-stay day → close any open stop, emit nothing
    if (!day.overnight || day.overnight === "flight"):
      if (current) { stops.push(current); current = null }
      continue
    loc = day.overnight                 // grouping key = overnight slug
    if (current && current.location === loc):
      current.dayRange[1] = day.day     // extend end
      current.days.push(day)
    else:
      if (current) stops.push(current)
      current = {
        location: loc,
        title: day.title,               // display label, e.g. "Rome: Ancient City"
        dayRange: [day.day, day.day],   // [firstDay, lastDay]
        days: [day],
        coords: null                    // filled by resolveCoords()
      }
  if (current) stops.push(current)
  stops.forEach(s => { s.coords = resolveCoords(s); s.status = getStopStatus(s) })
  return stops
```

### 1.2 Coordinate resolution — 3-tier, dependency-free, offline

No geocoding API in Build 48. Resolve in this order and stop at the first hit:

1. **Per-day coords in `journey.json`** — use the first day in the stop that has numeric `lat`/`lng`. (The Italy test trip now carries these; this is also the forward-compatible Build 49 shape.)
2. **Built-in slug table** in `trip-map.js` — a small `{ rome:[41.9028,12.4964], florence:[43.7696,11.2558], venice:[45.4408,12.3155], bologna:[44.4939,11.3426], … }` for common cities, keyed by `stop.location`.
3. **Unplotted** — `coords = null`. The stop still appears in the rail flagged `⚑ NO LOCATION` with an "Add a location to plot" affordance (design contract, §3). Never silently drop it.

> Consequence to expect: `sample-trip-two` (placeholder slugs) resolves to **all-unplotted** — that is the correct exercise of the rail fallback, not a bug. `la-grande-italia-2027` plots four pins (Rome, Florence, Venice, Bologna).

### 1.3 Stop status aggregation

```
getStopStatus(stop):
  items = concat(itemsInRange(coll, stop) for coll in
                 [accommodation, activities, restaurants, transport, flights])
  rank = { Booked:4, Travel:4, Review:4, Selected:3, Shortlisted:2, Research:1, "":1 }
  best = max(rank[item.status] for item in items, default 1)
  return best>=4 ? "Booked" : best===3 ? "Selected" : "Research"   // 3-way glyph bucket
```

- Map post-booking statuses (`Travel`, `Review`) to the **Booked** glyph, and `Shortlisted` to the **Research** glyph — otherwise a booked-then-travelling item wrongly downgrades.
- `itemsInRange(coll, stop)` must use **true range overlap**, not membership:
  `const [a,b] = item.dayRange || [item.day, item.day]; return a <= stop.dayRange[1] && b >= stop.dayRange[0];`
  (Accommodation `dayRange` is `[firstDay,lastDay]`; flights/transport are day-keyed via `item.day`.)
- On the Italy test trip this yields: **Rome ● Booked, Florence ◎ Selected, Venice ◌ Research, Bologna ● Booked** — i.e. all three glyphs are exercised.

---

## 2. The hybrid map (Step 2 core)

### 2.1 Leaflet, vendored locally + lazy-loaded (not CDN)

The reconciliation draft loaded Leaflet from `unpkg.com` in `<head>`. **Don't.** It's a blocking third-party script on every page, un-cacheable by the service worker (cross-origin passthrough), and breaks the app's offline/zero-external-dependency posture.

Instead:
- **Vendor** `leaflet.js`, `leaflet.css`, and its marker/layer images into `assets/vendor/leaflet/` (self-hosted, same-origin).
- **Lazy-load** them only when the map view first opens: inject the `<link>`/`<script>`, await `onload`, then `initMap()`. Other views stay untouched and fully offline-capable.
- Add the three Leaflet asset paths to `APP_SHELL` in `service-worker.js` so they precache.
- OSM **tiles** still need the network (unavoidable). Offline, the map surface degrades; the DOM rail (§3) remains the working fallback.

### 2.2 Substrate vs overlay — division of labour

- **Leaflet owns:** the tile layer (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`, with attribution), pan, wheel/±  zoom, and `map.fitBounds(bounds, { padding })` over plotted stops. This replaces the prototype's hand-rolled `mercX`/`mercY`, drag and wheel code — do not port those.
- **Custom overlay owns (ported from the design):** pins, pin **labels on solid chips**, route **legs** (with duration chips), the collision-avoidance placement pass, and status glyphs. Render it in a Leaflet **overlay pane** (or an `L.Layer` subclass) and recompute on Leaflet's `move`/`zoom`/`resize` events using `map.latLngToContainerPoint(latlng)` for pixel positions. The design explicitly notes the label/leg maths is "tile-agnostic" — it operates in screen pixels, so it ports directly onto Leaflet's container points.

### 2.3 Pins — glyph + ring, never colour alone

Use `L.marker` with an `L.divIcon` (not `L.circleMarker`) so each pin carries the glyph and ring style, satisfying the accessibility contract:

- Booked → solid ring + `●`
- Selected → double ring + `◎`
- Research → dashed ring + `◌`

Style pins via **CSS classes** (`.pin--booked`, etc.) so colours come from the real tokens. **Do not** pass `"var(--color-primary)"` into Leaflet style options — Leaflet writes it into an SVG `fill` attribute where `var()` does not resolve. Palette from the app's existing vars: `--color-primary` (#34495E navy) for booked/route, `--color-secondary` (#C79C5D gold) for selected; research = muted grey. Ground legs use navy; **flight legs use a distinct hue** per the design (`#e0632c`).

### 2.4 Route legs

Draw polylines Rome→Florence→Venice→Bologna in stop order, skipping unplotted stops (connect across the gap). Leg-duration chips run the design's four-point-along-the-line collision test and are **dropped if nothing fits** (a missing chip beats an unreadable one). Give the map element an **explicit height** (e.g. the map column fills the flex row) or Leaflet renders 0px.

---

## 3. The rail + accessibility contract (Step 1, and never removed)

Build this **first**, before any map, as a zero-dependency DOM view — it is both the primary Step-1 deliverable and the permanent no-map fallback.

- A visible, ordered **stop rail**: each row shows the status glyph (`●/◎/◌`), the stop title, and the date range. Unplotted stops show `⚑ NO LOCATION` + "Add a location to plot".
- An always-present **visually-hidden ordered list** mirroring the rail (screen-reader fallback and the no-map path).
- **Selection model:** one `selectedStopIndex` drives rail highlight, detail panel, and (Step 2+) map pin z-order/centre. Click a rail row or a pin → same path.
- **Keyboard (register once — see §5.1):** `←/→` step stops in day order; `Enter` opens/refreshes detail; `Esc` refits the map; `+/−` zoom; arrow-panning only once the map itself is focused. Only the selected pin is tabbable (single tab stop).
- **Pin/row aria-label:** `"Stop 4 of 7, Venice, 8–9 MAY, 2 booked items"`.
- Respect `prefers-reduced-motion` (disable transitions/animation).

### 3.1 Date-range formatting

Format from real day dates, not "Day 1–3". Look the day up by its `.day` value (`days.find(d => d.day === n)`), **not** `days[n-1]` (indices break after insert/delete). Reuse `app/dates.js` helpers if one fits; otherwise format `journey.days[].date` (ISO) → e.g. `"2–4 MAY"`.

---

## 4. Integration edits (exact, against real files)

### 4.1 `app/trip-map.js` (CREATE, singleton)

```javascript
const TripMap = {
  trip: null, journey: null, stops: [], selectedStopIndex: 0, map: null, _keyHandler: null,

  open() {
    this.trip = Project.get("project");        // nested: this.trip.project.name / .departureDate
    this.journey = Project.get("journey");     // separate store: this.journey.days
    this.computeStops();
    this.restoreLastViewed();
    Render.show(Layout.render(this.getBodyHTML()));  // renders WITH sidebar/header
    this.renderRail();
    this.renderDetail(this.selectedStopIndex);
    this.registerKeyboard();
    this.loadLeafletThenInitMap();             // lazy-load; no-op gracefully if offline
  },
  // computeStops / resolveCoords / getStopStatus / itemsInRange / renderRail /
  // renderDetail / selectStop / formatDateRange / getStatusGlyph /
  // loadLeafletThenInitMap / initMap / renderPins / renderLegs / teardown …
};
```

Persist last-viewed with the **unique** key: `localStorage.setItem("tripMap_lastViewedStop_" + Project.projectFolder, idx)`.

### 4.2 `core/router.js` (EDIT, +3 lines)

```javascript
      case "map":
        TripMap.open();
        break;
```

### 4.3 `app/sidebar.js` (EDIT, +5 lines) — push to the `menu` array

```javascript
    { id: "map", icon: "🗺", title: "Trip Map" },
```

Place it after `planner`/`itinerary` (near the other trip-wide views).

### 4.4 `index.html` (EDIT)

- Add `<script src="app/trip-map.js"></script>` alongside the other `app/*.js` tags (order-tolerant; globals are read at call-time).
- **Do not** add a `#map-container` div (TripMap renders into `#app`).
- Leaflet CSS/JS are injected lazily by `trip-map.js`, not hard-linked here.

### 4.5 `service-worker.js` (EDIT, cache bump — exact)

The file uses `const CACHE_NAME = "compass-tos-v17";`. Change the **value**:

```javascript
const CACHE_NAME = "compass-tos-v18";
```

(There is no `CACHE_VERSION` variable — don't introduce one.) Add the vendored Leaflet assets to `APP_SHELL`:

```javascript
  "assets/vendor/leaflet/leaflet.css",
  "assets/vendor/leaflet/leaflet.js",
  "assets/vendor/leaflet/images/marker-shadow.png",
```

---

## 5. Correctness guards (things the earlier drafts broke)

### 5.1 Keyboard listener must not leak
`document.addEventListener("keydown", …)` on every `open()` stacks handlers (arrows fire N times) and hijacks arrows while typing in other views' inputs. Store the bound handler on `this._keyHandler`, remove any prior one before adding, and ignore events whose `target` is an `input`/`textarea`/`select`. Remove it in a `teardown()` you call when navigating away (or guard on `document.getElementById("trip-map-root")` still being present).

### 5.2 Trip-state detection (Step 3) uses real dates
`getTripState()` compares **today** with `this.trip.project.departureDate` / `.returnDate` (not `journey.*`). `< departure` → planning; `> return` → completed; else in-progress (halo today's stop, fade past stops to 45%, show "Jump to today"). Halo/opacity go on the divIcon via CSS classes, not `setStyle({ boxShadow })` (unsupported on Leaflet vector markers).

### 5.3 Graceful degradation
If Leaflet fails to load (offline/tile host down), catch it, leave the rail + detail fully working, and show a quiet "Map unavailable — showing stop list" note. No uncaught console errors.

---

## 6. Build sequence (deploy + test after each step)

Deployment per Mick's discipline, every step:

```bash
cd ~/TOS
git pull origin master
ps aux | grep node
kill -9 <PID>
# cPanel → Setup Node.js App → Start
# then hard-refresh (Ctrl+Shift+R)
```

Reach the view by clicking **🗺 Trip Map** in the sidebar (URL stays `/TOS/`).

**Step 1 — Rail + data layer (no map). ~400 ln.**
- computeStops / resolveCoords / getStopStatus / rail / detail / keyboard / selection.
- Verify on `la-grande-italia-2027`: 4 stops (Rome 1–3, Florence 4–5, Venice 6–7, Bologna 8), day 9 (overnight `flight`) correctly **not** a stop; glyphs read ● ◎ ◌ ●; detail panel lists the Rome/Florence/Venice/Bologna hotels; `←/→/Enter/Esc` work; no console errors.
- Verify on `sample-trip-two`: every stop shows `⚑ NO LOCATION` (rail-only) — fallback proven.

**Step 2 — Hybrid map. ~+300 ln.**
- Vendor + lazy-load Leaflet; tiles + fitBounds; custom overlay pins (glyph divIcons) + legs + collision labels; click pin ↔ rail ↔ detail unified; rail still present.
- Verify: four pins at correct Italian cities, navy route Rome→Florence→Venice→Bologna, flight-hue leg only if a plotted leg is a flight; pins clickable; graceful when offline.

**Step 3 — Trip states. ~+80 ln.** halo/fade/"Jump to today" using real departure/return dates. (Today is 2027 in the data, so all trips read "planning" now; to see in-progress, temporarily set a stop's dates around today or stub `getTripState`.)

**Step 4 — Mobile + a11y polish. ~+150 ln.** `<768px` → stacked map (≈50vh) over scrolling rail; larger touch pins; aria-labels; single tab stop; `prefers-reduced-motion`.

**Realistic total for Steps 1–4:** ~900–1,100 lines (the earlier "750" predates glyph pins, the unplotted rail, and the a11y contract).

**Step 5 — Sharing.** Deferred to Build 49: needs a public, price-stripped server endpoint that coexists with Build 47's ownership gate (401/403 on `/data/projects/*`). Client-side hiding is insufficient — prices must be filtered **server-side**. Plan separately.

---

## 7. Files to create / modify

| File | Action | Notes |
|---|---|---|
| `app/trip-map.js` | CREATE | singleton; Steps 1–4 (~900–1,100 ln) |
| `assets/vendor/leaflet/` | ADD | vendored `leaflet.js` + `leaflet.css` + images (self-hosted) |
| `index.html` | EDIT | one `<script>` tag; no map-container div; no CDN link |
| `core/router.js` | EDIT | `case "map": TripMap.open();` |
| `app/sidebar.js` | EDIT | push `{ id:"map", icon:"🗺", title:"Trip Map" }` |
| `service-worker.js` | EDIT | `CACHE_NAME → "compass-tos-v18"`; add Leaflet paths to `APP_SHELL` |
| _(none)_ | — | **no server.js change in Build 48** |

**Test data already prepared (this session):** `data/projects/la-grande-italia-2027/` — `journey.json` (9-day Rome→Florence→Venice→Bologna route with per-day `lat`/`lng`), `accommodation.json` (4 hotels, mixed Booked/Selected/Research), `project.json` (name, `departureDate` 2027-05-02, `returnDate` 2027-05-10, EUR, stats). `sample-trip-two` left as placeholder on purpose (unplotted-rail test).

---

## 8. Success criteria (Steps 1–4)

- Rail renders for any trip; stops computed from the real `journey.days` schema (skips `overnight:"flight"`, groups by `overnight` slug).
- Coordinates resolve day-coords → slug-table → unplotted rail flag; `sample-trip-two` is all-unplotted without errors.
- Detail panel shows real research-collection items for the stop's day range.
- Hybrid map: Leaflet tiles + fit-bounds; custom overlay pins with **glyph + ring** (never colour alone); navy ground legs / flight-hue flight legs; collision-placed labels on chips.
- Keyboard contract honoured, listener registered once, no leak; `prefers-reduced-motion` respected.
- Renders inside the app shell (sidebar/header present); no ghost view on navigate-away.
- Vendored Leaflet, lazy-loaded; other views unaffected and offline-capable; `CACHE_NAME` bumped to v18.
- No console errors; graceful "map unavailable" fallback offline.
```
