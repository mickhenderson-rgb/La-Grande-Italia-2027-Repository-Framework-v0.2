/*
=========================================================

COMPASS-TOS

Trip Map

Version 1.0.0

Build 48 - Step 1 (data + stop rail, no map surface yet)

Computes overnight stops from the real journey.days schema
(grouping consecutive nights at the same overnight location,
skipping transit days where overnight === "flight"), aggregates
a booked / selected / research status per stop from the live
research collections, and renders an accessible, clickable stop
rail with a per-stop detail panel. The Leaflet map surface is
added in Step 2 - this layer has zero external dependencies and
is the permanent no-map fallback.

=========================================================
*/

const TripMap = {
  trip: null,

  journey: null,

  stops: [],

  selectedStopIndex: 0,

  _keyHandler: null,

  // A small built-in lookup so common cities plot even when a trip
  // has no per-day coordinates. Per-day journey lat/lng (added in the
  // Italy test trip, and the Build 49 shape) always take precedence.
  cityCoords: {
    rome: [41.9028, 12.4964],
    florence: [43.7696, 11.2558],
    venice: [45.4408, 12.3155],
    bologna: [44.4939, 11.3426],
    milan: [45.4642, 9.19],
    naples: [40.8518, 14.2681],
    verona: [45.4384, 10.9916],
    vienna: [48.2082, 16.3738],
    ljubljana: [46.0569, 14.5058],
  },

  open() {
    this.trip = Project.get("project");

    this.journey = Project.get("journey");

    this.computeStops();

    this.restoreLastViewed();

    Render.show(Layout.render(this.getBodyHTML()));

    this.renderRail();

    this.renderDetail(this.selectedStopIndex);

    this.registerKeyboard();
  },

  // =========================================================
  // Data layer
  // =========================================================

  days() {
    return this.journey && Array.isArray(this.journey.days)
      ? this.journey.days
      : [];
  },

  computeStops() {
    const stops = [];

    let current = null;

    this.days().forEach((day) => {
      const overnight = String(day.overnight || "").toLowerCase();

      // Transit / no-stay day: close any open stop and emit nothing.
      if (!overnight || overnight === "flight") {
        if (current) {
          stops.push(current);

          current = null;
        }

        return;
      }

      if (current && current.location === overnight) {
        current.dayRange[1] = day.day;

        current.days.push(day);
      } else {
        if (current) {
          stops.push(current);
        }

        current = {
          location: overnight,

          title: day.title || this.pretty(overnight),

          dayRange: [day.day, day.day],

          days: [day],

          coords: null,

          status: "Research",
        };
      }
    });

    if (current) {
      stops.push(current);
    }

    stops.forEach((stop) => {
      stop.coords = this.resolveCoords(stop);

      stop.status = this.getStopStatus(stop);
    });

    this.stops = stops;

    if (this.selectedStopIndex >= stops.length) {
      this.selectedStopIndex = 0;
    }
  },

  resolveCoords(stop) {
    // Tier 1: per-day lat/lng on the journey day.
    const dayWithCoords = stop.days.find(
      (d) => typeof d.lat === "number" && typeof d.lng === "number",
    );

    if (dayWithCoords) {
      return [dayWithCoords.lat, dayWithCoords.lng];
    }

    // Tier 2: built-in city table, keyed by the overnight slug.
    const fromTable = this.cityCoords[stop.location];

    if (fromTable) {
      return fromTable.slice();
    }

    // Tier 3: unplotted - the rail flags it, nothing is dropped.
    return null;
  },

  collectionsForStatus: ["accommodation", "activities", "restaurants", "transport", "flights"],

  itemsInDayRange(collectionKey, stop) {
    const data = Project.get(collectionKey);

    const items = data && Array.isArray(data.items) ? data.items : [];

    const lo = stop.dayRange[0];

    const hi = stop.dayRange[1];

    return items.filter((item) => {
      let a;

      let b;

      if (Array.isArray(item.dayRange) && item.dayRange.length >= 1) {
        a = item.dayRange[0];

        b = item.dayRange[item.dayRange.length - 1];
      } else if (typeof item.day === "number") {
        a = item.day;

        b = item.day;
      } else {
        return false;
      }

      // True range overlap (not membership) - robust to multi-night spans.
      return a <= hi && b >= lo;
    });
  },

  statusRankOf(status) {
    switch (String(status || "")) {
      case "Booked":
      case "Travel":
      case "Review":
        return 4;

      case "Selected":
        return 3;

      case "Shortlisted":
        return 2;

      default:
        return 1;
    }
  },

  getStopStatus(stop) {
    let best = 1;

    this.collectionsForStatus.forEach((key) => {
      this.itemsInDayRange(key, stop).forEach((item) => {
        const rank = this.statusRankOf(item.status);

        if (rank > best) {
          best = rank;
        }
      });
    });

    if (best >= 4) {
      return "Booked";
    }

    if (best === 3) {
      return "Selected";
    }

    return "Research";
  },

  stopItems(stop) {
    const groups = [];

    const config = [
      { key: "accommodation", icon: "🛏", label: "Accommodation" },
      { key: "flights", icon: "✈", label: "Flights" },
      { key: "transport", icon: "🚗", label: "Transport" },
      { key: "activities", icon: "🎭", label: "Activities" },
      { key: "restaurants", icon: "🍽", label: "Restaurants" },
    ];

    config.forEach((c) => {
      const items = this.itemsInDayRange(c.key, stop);

      if (items.length > 0) {
        groups.push({ ...c, items });
      }
    });

    return groups;
  },

  // =========================================================
  // Trip state (used by header metadata; halo/fade is Step 3)
  // =========================================================

  tripState() {
    const p = this.trip && this.trip.project ? this.trip.project : {};

    const start = p.departureDate;

    const end = p.returnDate;

    if (!start) {
      return "planning";
    }

    const today = this.todayIso();

    if (today < start) {
      return "planning";
    }

    if (end && today > end) {
      return "completed";
    }

    return "in-progress";
  },

  todayIso() {
    const now = new Date();

    const yyyy = now.getFullYear();

    const mm = String(now.getMonth() + 1).padStart(2, "0");

    const dd = String(now.getDate()).padStart(2, "0");

    return `${yyyy}-${mm}-${dd}`;
  },

  // =========================================================
  // Rendering
  // =========================================================

  tripName() {
    return this.trip && this.trip.project && this.trip.project.name
      ? this.trip.project.name
      : "Trip Map";
  },

  headerMeta() {
    const p = this.trip && this.trip.project ? this.trip.project : {};

    const dates = this.formatTripDates(p.departureDate, p.returnDate);

    const count = this.stops.length;

    const plotted = this.stops.filter((s) => s.coords).length;

    const parts = [];

    if (dates) {
      parts.push(dates);
    }

    parts.push(`${count} stop${count === 1 ? "" : "s"}`);

    if (plotted < count) {
      parts.push(`${count - plotted} without a location`);
    }

    return parts.join("  ·  ");
  },

  getBodyHTML() {
    if (this.stops.length === 0) {
      return `

${this.styles()}

<div id="trip-map-root" class="tripmap">

    <header class="tripmap-header">

        <div class="tripmap-heading">

            <h1>${this.esc(this.tripName())}</h1>

            <p class="tripmap-meta">No overnight stops found for this trip.</p>

        </div>

    </header>

    <p class="tripmap-empty">Add days with an overnight location in the Planner to see them on the Trip Map.</p>

</div>

`;
    }

    return `

${this.styles()}

<div id="trip-map-root" class="tripmap">

    <header class="tripmap-header">

        <div class="tripmap-heading">

            <h1>${this.esc(this.tripName())}</h1>

            <p class="tripmap-meta">${this.esc(this.headerMeta())}</p>

        </div>

        <div class="tripmap-actions">

            <button type="button" onclick="window.print()">Print</button>

        </div>

    </header>

    <div class="tripmap-note">🗺 Map view arrives in Step 2 — the stop list below is fully functional.</div>

    <div class="tripmap-body">

        <ol class="tripmap-rail" id="trip-map-rail" aria-label="Trip stops in day order"></ol>

        <section class="tripmap-detail" id="trip-map-detail" tabindex="-1" aria-live="polite"></section>

    </div>

</div>

`;
  },

  renderRail() {
    const rail = document.getElementById("trip-map-rail");

    if (!rail) {
      return;
    }

    const total = this.stops.length;

    rail.innerHTML = this.stops
      .map((stop, idx) => {
        const active = idx === this.selectedStopIndex;

        const unplotted = !stop.coords;

        return `

<li class="tripmap-stop${active ? " is-active" : ""}">

    <button
        type="button"
        class="tripmap-stop-btn"
        id="trip-map-stop-${idx}"
        aria-current="${active ? "true" : "false"}"
        aria-label="${this.esc(this.stopAriaLabel(stop, idx, total))}"
        onclick="TripMap.selectStop(${idx})">

        <span class="tripmap-glyph ${this.statusClass(stop.status)}" aria-hidden="true">${this.statusGlyph(stop.status)}</span>

        <span class="tripmap-stop-text">

            <span class="tripmap-stop-name">${this.esc(stop.title)}</span>

            <span class="tripmap-stop-dates">${this.esc(this.formatDateRange(stop))}</span>

            ${unplotted ? `<span class="tripmap-flag">⚑ NO LOCATION</span>` : ""}

        </span>

    </button>

</li>

`;
      })
      .join("");
  },

  renderDetail(idx) {
    const panel = document.getElementById("trip-map-detail");

    if (!panel) {
      return;
    }

    const stop = this.stops[idx];

    if (!stop) {
      panel.innerHTML = "";

      return;
    }

    const groups = this.stopItems(stop);

    const body =
      groups.length === 0
        ? `<p class="tripmap-detail-empty">Nothing planned for this stop yet.</p>`
        : groups.map((g) => this.renderDetailGroup(g)).join("");

    const unplotted = !stop.coords
      ? `<p class="tripmap-detail-flag">⚑ This stop has no map location yet. Add coordinates (or use a recognised city name) to plot it in Step 2.</p>`
      : "";

    panel.innerHTML = `

<div class="tripmap-detail-head">

    <span class="tripmap-glyph ${this.statusClass(stop.status)}" aria-hidden="true">${this.statusGlyph(stop.status)}</span>

    <div>

        <h2>${this.esc(stop.title)}</h2>

        <p class="tripmap-detail-sub">${this.esc(this.formatDateRange(stop))}  ·  ${this.esc(this.statusLabel(stop.status))}</p>

    </div>

</div>

${unplotted}

<div class="tripmap-detail-items">

    ${body}

</div>

<div class="tripmap-detail-actions">

    <button type="button" onclick="Router.navigate('planner')">Open in Planner</button>

</div>

`;
  },

  renderDetailGroup(group) {
    const rows = group.items
      .map((item) => {
        const name = this.esc(this.itemName(group.key, item));

        const status = String(item.status || "Research");

        return `

<div class="tripmap-item">

    <span class="tripmap-item-name">${name}</span>

    <span class="tripmap-badge ${this.statusClass(this.bucket(status))}">${this.esc(status)}</span>

</div>

`;
      })
      .join("");

    return `

<div class="tripmap-detail-group">

    <div class="tripmap-detail-group-head">

        <span aria-hidden="true">${group.icon}</span>

        <span>${this.esc(group.label)}</span>

        <span class="tripmap-detail-count">${group.items.length}</span>

    </div>

    ${rows}

</div>

`;
  },

  itemName(key, item) {
    if (key === "flights") {
      return item.title || "Flight";
    }

    if (key === "transport") {
      const route = [item.from, item.to].filter(Boolean).join(" → ");

      return route ? `${item.mode || "Transport"}: ${route}` : item.mode || "Transport";
    }

    return item.name || item.title || this.pretty(key);
  },

  // =========================================================
  // Selection + keyboard
  // =========================================================

  selectStop(idx) {
    if (idx < 0) {
      idx = 0;
    }

    if (idx > this.stops.length - 1) {
      idx = this.stops.length - 1;
    }

    this.selectedStopIndex = idx;

    this.renderRail();

    this.renderDetail(idx);

    this.saveLastViewed(idx);

    const btn = document.getElementById(`trip-map-stop-${idx}`);

    if (btn) {
      btn.focus();
    }
  },

  registerKeyboard() {
    if (this._keyHandler) {
      document.removeEventListener("keydown", this._keyHandler);
    }

    this._keyHandler = (event) => this.handleKey(event);

    document.addEventListener("keydown", this._keyHandler);
  },

  teardown() {
    if (this._keyHandler) {
      document.removeEventListener("keydown", this._keyHandler);

      this._keyHandler = null;
    }
  },

  handleKey(event) {
    // If we've navigated away from the Trip Map, unbind and stop.
    if (!document.getElementById("trip-map-root")) {
      this.teardown();

      return;
    }

    const tag = event.target && event.target.tagName ? event.target.tagName.toLowerCase() : "";

    if (tag === "input" || tag === "textarea" || tag === "select" || (event.target && event.target.isContentEditable)) {
      return;
    }

    switch (event.key) {
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();

        this.selectStop(this.selectedStopIndex - 1);

        break;

      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();

        this.selectStop(this.selectedStopIndex + 1);

        break;

      case "Home":
        event.preventDefault();

        this.selectStop(0);

        break;

      case "End":
        event.preventDefault();

        this.selectStop(this.stops.length - 1);

        break;

      case "Enter":
        event.preventDefault();

        {
          const panel = document.getElementById("trip-map-detail");

          if (panel) {
            panel.focus();
          }
        }

        break;

      default:
        break;
    }
  },

  // =========================================================
  // Persistence
  // =========================================================

  storageKey() {
    const folder = Project.projectFolder || "unknown";

    return `tripMap_lastViewedStop_${folder}`;
  },

  restoreLastViewed() {
    try {
      const raw = localStorage.getItem(this.storageKey());

      const idx = raw === null ? 0 : parseInt(raw, 10);

      this.selectedStopIndex = Number.isFinite(idx) && idx >= 0 ? idx : 0;
    } catch (error) {
      this.selectedStopIndex = 0;
    }
  },

  saveLastViewed(idx) {
    try {
      localStorage.setItem(this.storageKey(), String(idx));
    } catch (error) {
      // localStorage may be unavailable (private mode) - non-fatal.
    }
  },

  // =========================================================
  // Status glyphs / labels (never colour alone)
  // =========================================================

  bucket(status) {
    const rank = this.statusRankOf(status);

    if (rank >= 4) {
      return "Booked";
    }

    if (rank === 3) {
      return "Selected";
    }

    return "Research";
  },

  statusGlyph(bucket) {
    switch (bucket) {
      case "Booked":
        return "●";

      case "Selected":
        return "◎";

      default:
        return "◌";
    }
  },

  statusClass(bucket) {
    switch (bucket) {
      case "Booked":
        return "is-booked";

      case "Selected":
        return "is-selected";

      default:
        return "is-research";
    }
  },

  statusLabel(bucket) {
    switch (bucket) {
      case "Booked":
        return "Booked";

      case "Selected":
        return "Selected";

      default:
        return "Research";
    }
  },

  stopAriaLabel(stop, idx, total) {
    const bits = [
      `Stop ${idx + 1} of ${total}`,
      stop.title,
      this.formatDateRange(stop),
      stop.coords ? this.statusLabel(stop.status) : "no location set",
    ];

    return bits.join(", ");
  },

  // =========================================================
  // Date formatting (from real journey day.date ISO values)
  // =========================================================

  months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],

  parseIso(iso) {
    if (!iso || typeof iso !== "string") {
      return null;
    }

    const parts = iso.split("-").map((n) => parseInt(n, 10));

    if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) {
      return null;
    }

    return { y: parts[0], m: parts[1], d: parts[2] };
  },

  formatDateRange(stop) {
    const first = this.parseIso(stop.days[0] && stop.days[0].date);

    const last = this.parseIso(stop.days[stop.days.length - 1] && stop.days[stop.days.length - 1].date);

    if (!first) {
      return `Day ${stop.dayRange[0]}${stop.dayRange[1] !== stop.dayRange[0] ? `–${stop.dayRange[1]}` : ""}`;
    }

    if (!last || (first.y === last.y && first.m === last.m && first.d === last.d)) {
      return `${first.d} ${this.months[first.m - 1]}`;
    }

    if (first.m === last.m) {
      return `${first.d}–${last.d} ${this.months[last.m - 1]}`;
    }

    return `${first.d} ${this.months[first.m - 1]} – ${last.d} ${this.months[last.m - 1]}`;
  },

  formatTripDates(start, end) {
    const a = this.parseIso(start);

    const b = this.parseIso(end);

    if (!a) {
      return "";
    }

    if (!b) {
      return `${a.d} ${this.months[a.m - 1]} ${a.y}`;
    }

    if (a.y === b.y && a.m === b.m) {
      return `${a.d}–${b.d} ${this.months[b.m - 1]} ${b.y}`;
    }

    if (a.y === b.y) {
      return `${a.d} ${this.months[a.m - 1]} – ${b.d} ${this.months[b.m - 1]} ${b.y}`;
    }

    return `${a.d} ${this.months[a.m - 1]} ${a.y} – ${b.d} ${this.months[b.m - 1]} ${b.y}`;
  },

  // =========================================================
  // Helpers
  // =========================================================

  esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  pretty(value) {
    return String(value || "")
      .replaceAll("-", " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  },

  styles() {
    return `

<style>

.tripmap { display: flex; flex-direction: column; gap: 12px; }

.tripmap-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }

.tripmap-heading h1 { margin: 0 0 4px; }

.tripmap-meta { margin: 0; color: var(--muted, #6b6357); font-size: 0.92em; }

.tripmap-actions { display: flex; gap: 8px; }

.tripmap-actions button { padding: 6px 14px; border-radius: 999px; border: 1px solid #dcc9b7; background: #fff; cursor: pointer; font: inherit; }

.tripmap-note { background: #f3eee6; border: 1px solid #e4ddd0; border-radius: var(--radius, 8px); padding: 8px 12px; font-size: 0.86em; color: #6b6357; }

.tripmap-empty { color: #7a7a7a; font-style: italic; }

.tripmap-body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: 16px; align-items: start; }

.tripmap-rail { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }

.tripmap-stop { margin: 0; }

.tripmap-stop-btn { width: 100%; display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid #e4ddd0; border-radius: var(--radius, 8px); background: #ffffff; cursor: pointer; text-align: left; font: inherit; transition: border-color 0.15s, box-shadow 0.15s; }

.tripmap-stop.is-active .tripmap-stop-btn { border-color: var(--color-primary, #34495E); box-shadow: 0 0 0 2px rgba(52, 73, 94, 0.15); }

.tripmap-stop-btn:focus-visible { outline: 2px solid var(--color-primary, #34495E); outline-offset: 2px; }

.tripmap-stop-text { display: flex; flex-direction: column; gap: 2px; }

.tripmap-stop-name { font-weight: 700; color: #243447; }

.tripmap-stop-dates { font-size: 0.82em; color: #6b6357; }

.tripmap-flag { font-size: 0.72em; color: #8a5a18; font-weight: 700; letter-spacing: 0.03em; }

.tripmap-glyph { font-size: 1.2em; line-height: 1; width: 1.4em; text-align: center; flex: none; }

.tripmap-glyph.is-booked { color: var(--color-primary, #34495E); }

.tripmap-glyph.is-selected { color: var(--color-secondary, #C79C5D); }

.tripmap-glyph.is-research { color: #9aa0a6; }

.tripmap-detail { background: #ffffff; border: 1px solid #e4ddd0; border-radius: var(--radius, 8px); padding: 14px 16px; }

.tripmap-detail:focus-visible { outline: 2px solid var(--color-primary, #34495E); outline-offset: 2px; }

.tripmap-detail-head { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 8px; }

.tripmap-detail-head h2 { margin: 0; font-size: 1.2em; }

.tripmap-detail-sub { margin: 2px 0 0; font-size: 0.85em; color: #6b6357; }

.tripmap-detail-flag { background: #fdf3e3; border: 1px solid #f0dcc0; border-radius: 6px; padding: 8px 10px; font-size: 0.82em; color: #8a5a18; }

.tripmap-detail-group { border-top: 1px solid #efe9df; padding: 10px 0; }

.tripmap-detail-group:first-child { border-top: none; }

.tripmap-detail-group-head { display: flex; align-items: center; gap: 8px; font-weight: 700; color: #34495E; margin-bottom: 6px; }

.tripmap-detail-count { margin-left: auto; font-size: 0.8em; color: #6b6357; font-weight: 600; }

.tripmap-item { display: flex; align-items: center; gap: 8px; justify-content: space-between; padding: 4px 0; }

.tripmap-item-name { color: #333; font-size: 0.9em; }

.tripmap-badge { font-size: 0.72em; font-weight: 700; padding: 2px 8px; border-radius: 10px; white-space: nowrap; }

.tripmap-badge.is-booked { background: #e1f0e3; color: #2e7d4f; }

.tripmap-badge.is-selected { background: #fbe9d0; color: #8a5a18; }

.tripmap-badge.is-research { background: #ececec; color: #555; }

.tripmap-detail-empty { color: #7a7a7a; font-style: italic; }

.tripmap-detail-actions { margin-top: 12px; }

.tripmap-detail-actions button { padding: 8px 16px; border-radius: 999px; border: 1px solid var(--color-primary, #34495E); background: var(--color-primary, #34495E); color: #fff; cursor: pointer; font: inherit; }

@media (max-width: 820px) {

    .tripmap-body { grid-template-columns: 1fr; }

}

@media (prefers-reduced-motion: reduce) {

    .tripmap-stop-btn { transition: none; }

}

</style>

`;
  },
};
